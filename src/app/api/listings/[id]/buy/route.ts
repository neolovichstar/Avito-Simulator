import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { completeSale } from '@/lib/deals'
import { DELIVERY_FEE } from '@/lib/economy'
import { redisLimit } from '@/lib/redis'
import { fmtMoney } from '@/lib/format'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!(await redisLimit(`buy:${user.id}`, 20, 60_000))) {
    return Response.json({ error: 'Слишком много покупок подряд' }, { status: 429 })
  }
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { courier?: boolean }
  // 28-b: обе опции едут посылкой — «courier» (350 ₽, без осмотра) и «pickup» (самовывоз)
  const mode = body.courier ? ('courier' as const) : ('pickup' as const)

  const listing = await db.listing.findUnique({ where: { id }, include: { seller: true } })
  if (!listing || listing.status !== 'active') {
    return Response.json({ error: 'Объявление уже неактуально' }, { status: 400 })
  }
  if (listing.sellerId === user.id) {
    return Response.json({ error: 'Нельзя купить свой товар' }, { status: 400 })
  }
  const total = listing.price + (mode === 'courier' ? DELIVERY_FEE : 0)
  if (user.balance < total) {
    return Response.json({ error: `Недостаточно средств: нужно ${fmtMoney(total)}` }, { status: 400 })
  }
  if (user.debt > 30_000) {
    return Response.json({ error: 'Погасите кредит в банке — покупки заблокированы' }, { status: 400 })
  }

  if (mode === 'courier' && listing.price === 0) {
    return Response.json({ error: 'Бесплатные товары — только самовывоз' }, { status: 400 })
  }

  // резерв доставки списывается сразу
  if (mode === 'courier') {
    await db.user.update({ where: { id: user.id }, data: { balance: { decrement: DELIVERY_FEE } } })
    await db.transaction.create({
      data: { userId: user.id, type: 'purchase', amount: -DELIVERY_FEE, note: `Доставка: ${listing.title}` },
    })
  }

  const res = await completeSale({
    listingId: listing.id, buyer: user, price: listing.price,
    via: 'buy', mode,
  })
  if (!res.ok) {
    if (mode === 'courier') {
      await db.user.update({ where: { id: user.id }, data: { balance: { increment: DELIVERY_FEE } } })
    }
    return Response.json({ error: res.error ?? 'Сделка не состоялась' }, { status: 400 })
  }

  const fresh = await db.user.findUnique({ where: { id: user.id } })

  // 28-a: цена сделки — в рыночный индекс; сделка — в память бота-продавца об игроке
  if (listing.seller.isBot) {
    const { recordSale } = await import('@/lib/market-index')
    const { noteDeal } = await import('@/lib/bot-memory')
    const { CATEGORY_LABEL } = await import('@/lib/catalog-types')
    await recordSale({ itemKey: listing.itemKey, category: listing.category, price: listing.price, condition: listing.condition }).catch(() => {})
    await noteDeal(user.id, listing.sellerId, {
      price: listing.price, listingPrice: listing.price,
      category: CATEGORY_LABEL[listing.category] ?? listing.category, itemTitle: listing.title,
    }).catch(() => {})
  }

  return Response.json({
    ok: true,
    balance: fresh?.balance ?? user.balance,
    xp: fresh?.xp ?? user.xp,
    level: fresh?.level ?? user.level,
    deliveryId: res.deliveryId,
    downgraded: res.downgraded,
    status: 'collecting',
  })
}
