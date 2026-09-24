import { db } from '@/lib/db'
import { auctionStep } from '@/lib/economy'
import { notifyUser } from '@/lib/deals'
import { fmtMoney } from '@/lib/format'
import { emitTo } from '@/lib/realtime-emit'

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
    const player = await db.user.findUnique({ where: { id: ab.userId } })
    if (!player) continue

    if (player.balance < nextBid) {
      // не хватает денег — автоставка снимается, игрока предупреждаем
      await db.autoBid.delete({ where: { id: ab.id } })
      await notifyUser(
        ab.userId,
        'market',
        'Автоставка отключена',
        `На лоте «${lot.title}» не хватило баланса, чтобы перебить ${fmtMoney(nextBid)}.`,
      )
      continue
    }

    // анти-снайпинг: как у обычных ставок, финал продлевается до 30с
    const msLeft = lot.endsAt.getTime() - Date.now()
    const extended = msLeft < 60_000
    const endsAt = extended ? new Date(Date.now() + 30_000) : lot.endsAt

    // если лидером был другой игрок — возвращаем его резерв
    if (lot.currentBidderId) {
      const prev = await db.user.findUnique({ where: { id: lot.currentBidderId } })
      if (prev && !prev.isBot && prev.id !== ab.userId && lot.currentBid) {
        await db.user.update({
          where: { id: prev.id },
          data: { balance: { increment: lot.currentBid } },
        })
        await notifyUser(
          prev.id,
          'market',
          'Вас перебили на аукционе',
          `Лот «${lot.title}» теперь ${fmtMoney(nextBid)}. Резерв возвращён на счёт.`,
        )
      }
    }

    await db.user.update({ where: { id: ab.userId }, data: { balance: { decrement: nextBid } } })
    await db.auctionBid.create({
      data: { lotId, userId: ab.userId, userName: player.displayName, amount: nextBid },
    })
    await db.auctionLot.update({
      where: { id: lotId },
      data: {
        currentBid: nextBid,
        currentBidderId: ab.userId,
        currentBidderName: player.displayName,
        bidCount: { increment: 1 },
        ...(extended ? { endsAt } : {}),
      },
    })
    await notifyUser(
      ab.userId,
      'market',
      'Автоставка сработала',
      `«${lot.title}» — ваша ставка ${fmtMoney(nextBid)} перебила соперника. Потолок ${fmtMoney(ab.maxAmount)} сохранён.`,
    )
    await emitTo('global', 'auction:update', { lotId, extended, autobid: true })
    return true
  }
  return false
}

// Сброс автоставок при завершении/отмене лота
export async function clearAutoBids(lotId: string): Promise<void> {
  await db.autoBid.deleteMany({ where: { lotId } })
}
