import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { completeSale } from '@/lib/deals'
import { DELIVERY_FEE } from '@/lib/economy'
import { rateLimit } from '@/lib/ratelimit'
import { fmtMoney } from '@/lib/format'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`buy:${user.id}`, 20, 60_000)) {
    return Response.json({ error: 'Слишком много покупок подряд' }, { status: 429 })
  }
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { courier?: boolean }
  const courier = !!body.courier

  const listing = await db.listing.findUnique({ where: { id }, include: { seller: true } })
  if (!listing || listing.status !== 'active') {
    return Response.json({ error: 'Объявление уже неактуально' }, { status: 400 })
  }
  if (listing.sellerId === user.id) {
    return Response.json({ error: 'Нельзя купить свой товар' }, { status: 400 })
  }
  const total = listing.price + (courier ? DELIVERY_FEE : 0)
  if (user.balance < total) {
    return Response.json({ error: `Недостаточно средств: нужно ${fmtMoney(total)}` }, { status: 400 })
  }
  if (user.debt > 30_000) {
    return Response.json({ error: 'Погасите кредит в банке — покупки заблокированы' }, { status: 400 })
  }

  if (courier && listing.price === 0) {
    return Response.json({ error: 'Бесплатные товары — только самовывоз' }, { status: 400 })
  }

  // резерв доставки списывается сразу
  if (courier) {
    await db.user.update({ where: { id: user.id }, data: { balance: { decrement: DELIVERY_FEE } } })
    await db.transaction.create({
      data: { userId: user.id, type: 'purchase', amount: -DELIVERY_FEE, note: `Доставка: ${listing.title}` },
    })
  }

  const res = await completeSale({
    listingId: listing.id, buyer: user, price: listing.price,
    via: 'buy', courier,
  })
  if (!res.ok) {
    if (courier) {
      await db.user.update({ where: { id: user.id }, data: { balance: { increment: DELIVERY_FEE } } })
    }
    return Response.json({ error: res.error ?? 'Сделка не состоялась' }, { status: 400 })
  }

  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, deliveryId: res.deliveryId, downgraded: res.downgraded })
}
