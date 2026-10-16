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
  // 64-F1 (L-2): CAS по статусу — update без условия мог перезаписать 'sold' на
  // 'removed' (гонка с покупкой: покупатель уже заплатил, объявление уже sold)
  const upd = await db.listing.updateMany({
    where: { id, sellerId: user.id, status: 'active' },
    data: { status: 'removed' },
  })
  if (upd.count === 0) return Response.json({ error: 'Объявление уже неактивно' }, { status: 409 })
  cache.invalidate('feed')
  return Response.json({ ok: true })
}
