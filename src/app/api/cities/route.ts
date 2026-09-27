import { db } from '@/lib/db'
import { cache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

// GET: города с количеством активных объявлений — для чипов фильтра в ленте
export async function GET() {
  const data = await cache.getOrSet('cities', 60_000, async () => {
    const rows = await db.listing.groupBy({
      by: ['city'],
      _count: { city: true },
      where: { status: 'active' },
      orderBy: { _count: { city: 'desc' } },
    })
    return rows.map((r) => ({ city: r.city, count: r._count.city }))
  })
  return Response.json({ cities: data })
}
