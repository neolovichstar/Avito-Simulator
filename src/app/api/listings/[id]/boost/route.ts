import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { BOOST_COST } from '@/lib/economy'
import { cache } from '@/lib/cache'
import { notifyUser } from '@/lib/deals'
import { fmtMoney } from '@/lib/format'

export const dynamic = 'force-dynamic'

class BoostError extends Error {}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const listing = await db.listing.findUnique({ where: { id } })
  if (!listing || listing.sellerId !== user.id) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.status !== 'active') return Response.json({ error: 'Объявление неактивно' }, { status: 400 })

  // 59-a: двойной клик по «Продвинуть» больше не списывает 249 дважды:
  // атомарное списание (balance >= cost) + CAS-захват объявления без активного буста
  try {
    await db.$transaction(async (tx) => {
      const dec = await tx.user.updateMany({
        where: { id: user.id, balance: { gte: BOOST_COST } },
        data: { balance: { decrement: BOOST_COST } },
      })
      if (dec.count === 0) throw new BoostError(`Нужно ${fmtMoney(BOOST_COST)} на счету`)
      const claim = await tx.listing.updateMany({
        where: {
          id,
          sellerId: user.id,
          status: 'active',
          OR: [{ boostedUntil: null }, { boostedUntil: { lte: new Date() } }],
        },
        data: { boostedUntil: new Date(Date.now() + 2 * 3_600_000), createdAt: new Date() },
      })
      if (claim.count === 0) throw new BoostError('Объявление уже продвинуто')
      await tx.transaction.create({
        data: { userId: user.id, type: 'boost', amount: -BOOST_COST, note: `Продвижение: ${listing.title}` },
      })
    })
  } catch (err) {
    if (err instanceof BoostError) {
      return Response.json({ error: err.message }, { status: err.message === 'Объявление уже продвинуто' ? 400 : 400 })
    }
    throw err
  }

  await notifyUser(user.id, 'system', '🚀 Объявление продвинуто', `«${listing.title}» на 2 часа поднимется в ленте`)
  cache.invalidate('feed')
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance })
}
