// Атомарная ставка на аукцион (59-a): единая точка входа для игрока (POST
// /api/auction), автоставок (autobid.ts) и ботов движка (engine.ts).
// Гонки, которые тут закрыты:
//  - две параллельные ставки читали одинаковый currentBid и обе «перебивали»;
//  - предыдущего лидера-игрока возвращали ДВАЖДЫ (оба запроса видели его лидером);
//  - баланс списывался по устаревшей проверке → минус на счету.
// Решение: интерактивная транзакция + CAS по currentBid (updateMany) +
// условное списание баланса (balance >= amount). Проигравший гонку откатывается.
import { db } from '@/lib/db'
import { auctionStep } from '@/lib/economy'
import { fmtMoney } from '@/lib/format'
import type { AuctionLot } from '@prisma/client'

export interface BidPlaced {
  ok: true
  /** лот был продлён анти-снайпингом (ставка в последнюю минуту) */
  extended: boolean
  /** предыдущий лидер и его ставка (для возврата резерва) */
  prevBidderId: string | null
  prevBid: number | null
  /** свежий лот после ставки */
  lot: AuctionLot
}

export interface BidRejected {
  ok: false
  error: string
}

export async function placeAuctionBid(params: {
  lotId: string
  bidderId: string
  bidderName: string
  amount: number
  /** true — игрок: ставка резервирует деньги (условное списание); боты — false */
  reserve: boolean
}): Promise<BidPlaced | BidRejected> {
  try {
    return await db.$transaction(async (tx) => {
      const lot = await tx.auctionLot.findUnique({ where: { id: params.lotId } })
      if (!lot || lot.status !== 'active' || lot.endsAt.getTime() <= Date.now()) {
        return { ok: false as const, error: 'Лот уже завершён' }
      }
      const step = auctionStep(lot.startPrice)
      const minBid = (lot.currentBid ?? lot.startPrice) + step
      if (params.amount < minBid) {
        return { ok: false as const, error: `Минимальная ставка: ${fmtMoney(minBid)}` }
      }
      if (params.reserve) {
        const dec = await tx.user.updateMany({
          where: { id: params.bidderId, balance: { gte: params.amount } },
          data: { balance: { decrement: params.amount } },
        })
        if (dec.count === 0) {
          return { ok: false as const, error: 'Недостаточно средств. Ставка резервирует деньги' }
        }
      }
      // анти-снайпинг: ставка в последнюю минуту продлевает торги до 30с
      const extended = lot.endsAt.getTime() - Date.now() < 60_000
      const endsAt = extended ? new Date(Date.now() + 30_000) : lot.endsAt
      await tx.auctionBid.create({
        data: { lotId: lot.id, userId: params.bidderId, userName: params.bidderName, amount: params.amount },
      })
      // CAS: лот не должен был измениться с момента чтения (иначе гонку выиграл кто-то другой)
      const claim = await tx.auctionLot.updateMany({
        where: { id: lot.id, status: 'active', currentBid: lot.currentBid ?? null },
        data: {
          currentBid: params.amount,
          currentBidderId: params.bidderId,
          currentBidderName: params.bidderName,
          bidCount: { increment: 1 },
          endsAt,
        },
      })
      if (claim.count === 0) {
        throw new Error('LOT_CHANGED')
      }
      const fresh = await tx.auctionLot.findUniqueOrThrow({ where: { id: lot.id } })
      return {
        ok: true as const,
        extended,
        prevBidderId: lot.currentBidderId,
        prevBid: lot.currentBid,
        lot: fresh,
      }
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'LOT_CHANGED') {
      return { ok: false as const, error: 'Ставку только что перебили, повторите' }
    }
    throw e
  }
}
