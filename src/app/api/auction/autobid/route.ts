import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { auctionStep } from '@/lib/economy'
import { fmtMoney } from '@/lib/format'
import { rateLimit } from '@/lib/ratelimit'
import { fireAutoBids, clearAutoBids } from '@/lib/autobid'

export const dynamic = 'force-dynamic'

// Автоставка (прокси-ставка) на лот:
// POST { lotId, maxAmount } — включить/изменить потолок, при возможности сразу перебивает.
// DELETE ?lotId= — отменить (фактическая ставка-лидер остаётся).
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`autobid:${user.id}`, 10, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите минуту' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { lotId?: string; maxAmount?: number }
  const maxAmount = Math.round(Number(body.maxAmount))
  if (!body.lotId || !Number.isFinite(maxAmount) || maxAmount <= 0) {
    return Response.json({ error: 'Некорректный потолок автоставки' }, { status: 400 })
  }
  const lot = await db.auctionLot.findUnique({ where: { id: body.lotId } })
  if (!lot || lot.status !== 'active' || lot.endsAt.getTime() <= Date.now()) {
    return Response.json({ error: 'Лот уже завершён' }, { status: 400 })
  }
  const step = auctionStep(lot.startPrice)
  const minBid = (lot.currentBid ?? lot.startPrice) + step
  if (maxAmount < minBid) {
    return Response.json({ error: `Потолок не может быть ниже минимальной ставки: ${fmtMoney(minBid)}` }, { status: 400 })
  }

  await db.autoBid.upsert({
    where: { lotId_userId: { lotId: lot.id, userId: user.id } },
    create: { lotId: lot.id, userId: user.id, maxAmount },
    update: { maxAmount },
  })

  // если лидер бот и потолок позволяет — автоставка срабатывает сразу
  const fired = await fireAutoBids(lot.id)
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, fired, maxAmount, balance: fresh?.balance ?? user.balance })
}

export async function DELETE(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const lotId = new URL(req.url).searchParams.get('lotId')
  if (!lotId) return Response.json({ error: 'Не указан лот' }, { status: 400 })
  await db.autoBid.deleteMany({ where: { lotId, userId: user.id } })
  return Response.json({ ok: true })
}
