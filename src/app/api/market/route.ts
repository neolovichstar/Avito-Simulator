import { db } from '@/lib/db'
import { cache } from '@/lib/cache'
import { realOnlineCount } from '@/lib/realtime-emit'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import type { MarketStats } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await cache.getOrSet('market:stats', 20_000, async () => {
    const [real, botsRecent, activeListings, indexes, events] = await Promise.all([
      realOnlineCount(),
      db.user.count({ where: { isBot: true, lastSeenAt: { gt: new Date(Date.now() - 15 * 60_000) } } }),
      db.listing.count({ where: { status: 'active' } }),
      db.marketIndex.findMany(),
      db.marketEvent.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ])
    return {
      online: real + botsRecent,
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
