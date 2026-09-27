import { db } from '@/lib/db'
import { cache } from '@/lib/cache'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import type { MarketStats } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await cache.getOrSet('market:stats', 20_000, async () => {
    const [online, activeListings, indexes, events] = await Promise.all([
      // РЕАЛЬНЫЙ онлайн: живые игроки за последние 3 минуты, без ботов
      db.user.count({ where: { isBot: false, lastSeenAt: { gt: new Date(Date.now() - 3 * 60_000) } } }),
      db.listing.count({ where: { status: 'active' } }),
      db.marketIndex.findMany(),
      db.marketEvent.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ])
    return {
      online,
      activeListings,
      indexes: indexes
        .map((i) => ({ category: CATEGORY_LABEL[i.category] ?? i.category, multiplier: Math.round(i.multiplier * 100) / 100 }))
        .sort((a, b) => b.multiplier - a.multiplier),
      events: events.map((e) => ({
        id: e.id, category: e.category, kind: e.kind, headline: e.headline, body: e.body,
        createdAt: e.createdAt.toISOString(),
      })),
    }
  })
  return Response.json(data satisfies MarketStats)
}
