import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { notifyUser, bumpStats, checkAchievements } from '@/lib/deals'
import { redisLimit } from '@/lib/redis'
import { fmtMoney } from '@/lib/format'
import { emitTo } from '@/lib/realtime-emit'
import { placeAuctionBid } from '@/lib/auction-core'
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
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    return Response.json({ error: 'Некорректная ставка' }, { status: 400 })
  }
  const current = await db.auctionLot.findUnique({ where: { id: body.lotId } })
  if (!current || current.status !== 'active' || current.endsAt.getTime() <= Date.now()) {
    return Response.json({ error: 'Лот уже завершён' }, { status: 400 })
  }

  // Атомарная ставка: валидация минимальной суммы, резерв денег и CAS лота
  // внутри одной транзакции (гонка двух ставок / гонка с движком больше не
  // возвращает резерв предыдущему лидеру дважды и не уводит баланс в минус).
  const res = await placeAuctionBid({
    lotId: current.id, bidderId: user.id, bidderName: user.displayName, amount, reserve: true,
  })
  if (!res.ok) {
    return Response.json({ error: res.error }, { status: 400 })
  }

  // вернуть деньги предыдущему лидеру-игроку (в т.ч. себе при повышении своей ставки)
  if (res.prevBidderId && res.prevBid) {
    const prev = await db.user.findUnique({ where: { id: res.prevBidderId }, select: { id: true, isBot: true } })
    if (prev && !prev.isBot) {
      await db.user.update({ where: { id: prev.id }, data: { balance: { increment: res.prevBid } } })
      if (prev.id !== user.id) {
        await notifyUser(prev.id, 'market', 'Вас перебили на аукционе', `Лот «${current.title}» теперь ${fmtMoney(amount)}. Деньги возвращены на счёт.`)
      }
    }
  }
  await bumpStats(user.id, { bids: 1 })
  await checkAchievements(user.id)
  await emitTo('global', 'auction:update', { lotId: current.id, extended: res.extended })

  const fresh = await db.user.findUnique({ where: { id: user.id } })
  const myAuto = await db.autoBid.findUnique({
    where: { lotId_userId: { lotId: current.id, userId: user.id } },
  })
  const lot = res.lot
  const dto: AuctionLotDTO = {
    id: lot.id, title: lot.title, image: itemImage(lot.itemKey, lot.category), category: lot.category,
    condition: lot.condition, baseValue: lot.baseValue, startPrice: lot.startPrice,
    currentBid: lot.currentBid, currentBidderName: lot.currentBidderName, bidCount: lot.bidCount,
    endsAt: lot.endsAt.toISOString(), myBid: amount, myAutoBid: myAuto?.maxAmount ?? 0, isMine: true,
  }
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, lot: dto })
}
