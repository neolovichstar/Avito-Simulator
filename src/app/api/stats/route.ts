import { db } from '@/lib/db'
import { realOnlineCount } from '@/lib/realtime-emit'
import { cache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  // короткий TTL: онлайн меняется живо, но дергать счётчики на каждый чих дорого
  const online = await cache.getOrSet('stats:online', 5_000, async () => {
    const [real, botsRecent] = await Promise.all([
      realOnlineCount(),
      db.user.count({
        where: { isBot: true, lastSeenAt: { gt: new Date(Date.now() - 15 * 60_000) } },
      }),
    ])
    return real + botsRecent
  })
  return Response.json({ online })
}
