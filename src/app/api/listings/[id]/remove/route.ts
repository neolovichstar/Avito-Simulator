import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { cache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const listing = await db.listing.findUnique({ where: { id } })
  if (!listing || listing.sellerId !== user.id) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.status !== 'active') return Response.json({ error: 'Объявление уже неактивно' }, { status: 400 })
  await db.listing.update({ where: { id }, data: { status: 'removed' } })
  cache.invalidate('feed')
  return Response.json({ ok: true })
}
