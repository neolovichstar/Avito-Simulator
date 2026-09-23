import { db } from '@/lib/db'
import { realOnlineCount } from '@/lib/realtime-emit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [real, botsRecent] = await Promise.all([
    realOnlineCount(),
    db.user.count({
      where: { isBot: true, lastSeenAt: { gt: new Date(Date.now() - 15 * 60_000) } },
    }),
  ])
  return Response.json({ online: real + botsRecent })
}
