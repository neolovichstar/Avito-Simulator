import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { BOOST_COST } from '@/lib/economy'
import { cache } from '@/lib/cache'
import { notifyUser } from '@/lib/deals'
import { fmtMoney } from '@/lib/format'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const listing = await db.listing.findUnique({ where: { id } })
  if (!listing || listing.sellerId !== user.id) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.status !== 'active') return Response.json({ error: 'Объявление неактивно' }, { status: 400 })
  if (listing.boostedUntil && listing.boostedUntil.getTime() > Date.now()) {
    return Response.json({ error: 'Объявление уже продвинуто' }, { status: 400 })
  }
  if (user.balance < BOOST_COST) return Response.json({ error: `Нужно ${fmtMoney(BOOST_COST)} на счету` }, { status: 400 })

  await db.user.update({ where: { id: user.id }, data: { balance: { decrement: BOOST_COST } } })
  await db.transaction.create({
    data: { userId: user.id, type: 'boost', amount: -BOOST_COST, note: `Продвижение: ${listing.title}` },
  })
  await db.listing.update({
    where: { id },
    data: { boostedUntil: new Date(Date.now() + 2 * 3_600_000), createdAt: new Date() },
  })
  await notifyUser(user.id, 'system', 'Объявление продвинуто', `«${listing.title}» на 2 часа поднимется в ленте`)
  cache.invalidate('feed')
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance })
}
