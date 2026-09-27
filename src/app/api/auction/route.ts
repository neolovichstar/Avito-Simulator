import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { auctionStep } from '@/lib/economy'
import { notifyUser, bumpStats, checkAchievements } from '@/lib/deals'
import { redisLimit } from '@/lib/redis'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import { fmtMoney } from '@/lib/format'
import { emitTo } from '@/lib/realtime-emit'
import type { AuctionLotDTO, AuctionData } from '@/lib/types'
import { itemImage } from '@/lib/item-images'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const lots = await db.auctionLot.findMany({
    where: { status: 'active', endsAt: { gt: new Date() } },
    orderBy: { endsAt: 'asc' },
    take: 20,
  })
  const myBids = await db.auctionBid.findMany({
    where: { userId: user.id, lotId: { in: lots.map((l) => l.id) } },
    orderBy: { amount: 'desc' },
  })
  const myAutoBids = await db.autoBid.findMany({
    where: { userId: user.id, lotId: { in: lots.map((l) => l.id) } },
  })
  const wonCount = await db.auctionLot.count({
    where: { status: 'finished', currentBidderId: user.id },
  })
  const out: AuctionLotDTO[] = lots.map((l) => ({
    id: l.id,
    title: l.title,
    image: itemImage(l.itemKey, l.category),
    category: l.category,
    condition: l.condition,
    baseValue: l.baseValue,
    startPrice: l.startPrice,
    currentBid: l.currentBid,
    currentBidderName: l.currentBidderName,
    bidCount: l.bidCount,
    endsAt: l.endsAt.toISOString(),
    myBid: myBids.find((b) => b.lotId === l.id)?.amount ?? 0,
    myAutoBid: myAutoBids.find((a) => a.lotId === l.id)?.maxAmount ?? 0,
    isMine: l.currentBidderId === user.id,
  }))
  const data: AuctionData = { lots: out, activeCount: lots.length, wonCount }
  return Response.json(data)
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!(await redisLimit(`bid:${user.id}`, 15, 60_000))) {
    return Response.json({ error: 'Слишком много ставок подряд' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { lotId?: string; amount?: number }
  if (!body.lotId || body.amount === undefined) return Response.json({ error: 'Некорректная ставка' }, { status: 400 })
  const amount = Math.round(Number(body.amount))

  const lot = await db.auctionLot.findUnique({ where: { id: body.lotId } })
  if (!lot || lot.status !== 'active' || lot.endsAt.getTime() <= Date.now()) {
    return Response.json({ error: 'Лот уже завершён' }, { status: 400 })
  }
  const step = auctionStep(lot.startPrice)
  const minBid = (lot.currentBid ?? lot.startPrice) + step
  if (amount < minBid) return Response.json({ error: `Минимальная ставка: ${fmtMoney(minBid)}` }, { status: 400 })
  if (user.balance < amount) return Response.json({ error: 'Недостаточно средств. Ставка резервирует деньги' }, { status: 400 })

  // анти-снайпинг: ставка в последнюю минуту продлевает торги
  const endsAt = lot.endsAt.getTime() - Date.now() < 60_000
    ? new Date(Date.now() + 30_000)
    : lot.endsAt

  // вернуть деньги предыдущему лидеру-игроку
  if (lot.currentBidderId && lot.currentBid) {
    const prev = await db.user.findUnique({ where: { id: lot.currentBidderId } })
    if (prev && !prev.isBot) {
      await db.user.update({ where: { id: prev.id }, data: { balance: { increment: lot.currentBid } } })
      if (prev.id !== user.id) {
        await notifyUser(prev.id, 'market', 'Вас перебили на аукционе', `Лот «${lot.title}» теперь ${fmtMoney(amount)}. Деньги возвращены на счёт.`)
      }
    }
  }
  // зарезервировать ставку игрока
  await db.user.update({ where: { id: user.id }, data: { balance: { decrement: amount } } })
  await db.auctionBid.create({
    data: { lotId: lot.id, userId: user.id, userName: user.displayName, amount },
  })
  await db.auctionLot.update({
    where: { id: lot.id },
    data: { currentBid: amount, currentBidderId: user.id, currentBidderName: user.displayName, bidCount: { increment: 1 }, endsAt },
  })
  await bumpStats(user.id, { bids: 1 })
  await checkAchievements(user.id)
  await emitTo('global', 'auction:update', { lotId: lot.id, extended: endsAt.getTime() !== lot.endsAt.getTime() })

  const fresh = await db.user.findUnique({ where: { id: user.id } })
  const myAuto = await db.autoBid.findUnique({
    where: { lotId_userId: { lotId: lot.id, userId: user.id } },
  })
  const dto: AuctionLotDTO = {
    id: lot.id, title: lot.title, image: itemImage(lot.itemKey, lot.category), category: lot.category,
    condition: lot.condition, baseValue: lot.baseValue, startPrice: lot.startPrice,
    currentBid: amount, currentBidderName: user.displayName, bidCount: lot.bidCount + 1,
    endsAt: endsAt.toISOString(), myBid: amount, myAutoBid: myAuto?.maxAmount ?? 0, isMine: true,
  }
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, lot: dto })
}
