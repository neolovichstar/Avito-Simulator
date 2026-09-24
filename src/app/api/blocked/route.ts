import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { notifyUser } from '@/lib/deals'
import { invalidateBlocked } from '@/lib/blocked'

export const dynamic = 'force-dynamic'

// Чёрный список продавцов: GET — кого заблокировал игрок,
// POST { sellerId } — переключить блокировку.
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const rows = await db.blockedSeller.findMany({
    where: { userId: user.id },
    select: { sellerId: true, createdAt: true },
  })
  return Response.json({ ids: rows.map((r) => r.sellerId) })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`block:${user.id}`, 10, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите минуту' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { sellerId?: string }
  if (!body.sellerId) return Response.json({ error: 'Не указан продавец' }, { status: 400 })
  if (body.sellerId === user.id) {
    return Response.json({ error: 'Себя заблокировать нельзя' }, { status: 400 })
  }
  const seller = await db.user.findUnique({ where: { id: body.sellerId } })
  if (!seller) return Response.json({ error: 'Продавец не найден' }, { status: 404 })

  const existing = await db.blockedSeller.findUnique({
    where: { userId_sellerId: { userId: user.id, sellerId: body.sellerId } },
  })
  if (existing) {
    await db.blockedSeller.delete({ where: { id: existing.id } })
    invalidateBlocked(user.id)
    return Response.json({ ok: true, blocked: false })
  }
  await db.blockedSeller.create({ data: { userId: user.id, sellerId: body.sellerId } })
  invalidateBlocked(user.id)
  await notifyUser(
    user.id,
    'system',
    'Чёрный список',
    `Продавец «${seller.displayName}» заблокирован — его объявления скрыты из ленты.`,
  )
  return Response.json({ ok: true, blocked: true, name: seller.displayName })
}
