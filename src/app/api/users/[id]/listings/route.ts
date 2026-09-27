import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { listingDTO } from '@/lib/dto'

export const dynamic = 'force-dynamic'

// Активные объявления продавца (для страницы продавца)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const url = new URL(req.url)
  const limit = 10
  const offset = Math.max(0, Math.min(100, Number(url.searchParams.get('offset') ?? 0)))

  const listings = await db.listing.findMany({
    where: { sellerId: id, status: 'active' },
    include: { seller: true },
    orderBy: { createdAt: 'desc' },
    take: 120,
  })
  // boosted — наверх, затем по дате
  const now = Date.now()
  listings.sort((a, b) => {
    const ab = a.boostedUntil && a.boostedUntil.getTime() > now ? 1 : 0
    const bb = b.boostedUntil && b.boostedUntil.getTime() > now ? 1 : 0
    if (ab !== bb) return bb - ab
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
  const page = listings.slice(offset, offset + limit)
  return Response.json({
    items: page.map((l) => listingDTO(l, user.id)),
    total: listings.length,
    offset: offset + page.length,
  })
}
