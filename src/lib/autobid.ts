import { db } from '@/lib/db'
import { auctionStep } from '@/lib/economy'
import { notifyUser } from '@/lib/deals'
import { fmtMoney } from '@/lib/format'
import { emitTo } from '@/lib/realtime-emit'
import { placeAuctionBid } from '@/lib/auction-core'

// Автоставка (прокси-ставки как на eBay).
// Вызывается после ЛЮБОЙ смены лидера лота, когда лидером стал бот:
// движок перебивает активные автоставки игроков минимально необходимой суммой.
// Деньги резервируются только по факту фактической ставки — как у обычных ставок.

export async function fireAutoBids(lotId: string): Promise<boolean> {
  const lot = await db.auctionLot.findUnique({ where: { id: lotId } })
  if (!lot || lot.status !== 'active' || lot.endsAt.getTime() <= Date.now()) return false

  // Игрок уже лидер — перебивать самого себя не нужно
  if (lot.currentBidderId) {
    const leader = await db.user.findUnique({
      where: { id: lot.currentBidderId },
      select: { isBot: true },
    })
    if (leader && !leader.isBot) return false
  }

  const abs = await db.autoBid.findMany({
    where: { lotId, user: { isBot: false } },
    orderBy: { maxAmount: 'desc' },
  })
  if (abs.length === 0) return false

  const step = auctionStep(lot.startPrice)
  const nextBid = (lot.currentBid ?? lot.startPrice) + step

  for (const ab of abs) {
    if (nextBid > ab.maxAmount) continue // максимум игрока ниже нужной ставки — ждём
    const player = await db.user.findUnique({
      where: { id: ab.userId },
      select: { id: true, displayName: true },
    })
    if (!player) continue

    // атомарная ставка (59-a): резерв баланса и CAS лота в транзакции: гонка
    // с параллельной ставкой игрока больше не списывает деньги дважды
    const res = await placeAuctionBid({
      lotId, bidderId: player.id, bidderName: player.displayName, amount: nextBid, reserve: true,
    })
    if (!res.ok) {
      if (res.error.startsWith('Недостаточно')) {
        // не хватает денег — автоставка снимается, игрока предупреждаем
        await db.autoBid.deleteMany({ where: { id: ab.id } })
        await notifyUser(
          ab.userId,
          'market',
          '🤖 Автоставка отключена',
          `На лоте «${lot.title}» не хватило баланса, чтобы перебить ${fmtMoney(nextBid)}.`,
        )
      }
      // «Лот уже завершён»/«перебили» — автоставку оставляем, шанс будет на следующем ходе
      continue
    }

    // если лидером был другой игрок — возвращаем его резерв
    if (res.prevBidderId && res.prevBid) {
      const prev = await db.user.findUnique({
        where: { id: res.prevBidderId },
        select: { id: true, isBot: true },
      })
      if (prev && !prev.isBot && prev.id !== ab.userId) {
        await db.user.update({
          where: { id: prev.id },
          data: { balance: { increment: res.prevBid } },
        })
        await notifyUser(
          prev.id,
          'market',
          '🔨 Вас перебили на аукционе',
          `Лот «${lot.title}» теперь ${fmtMoney(nextBid)}. Резерв возвращён на счёт.`,
        )
      }
    }

    await notifyUser(
      ab.userId,
      'market',
      '🤖 Автоставка сработала',
      `«${lot.title}» — ваша ставка ${fmtMoney(nextBid)} перебила соперника. Потолок ${fmtMoney(ab.maxAmount)} сохранён.`,
    )
    await emitTo('global', 'auction:update', { lotId, extended: res.extended, autobid: true })
    return true
  }
  return false
}

// Сброс автоставок при завершении/отмене лота
export async function clearAutoBids(lotId: string): Promise<void> {
  await db.autoBid.deleteMany({ where: { lotId } })
}
