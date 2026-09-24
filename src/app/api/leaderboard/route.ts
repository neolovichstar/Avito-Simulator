import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { parseStats } from '@/lib/quests'
import { levelFromXp } from '@/lib/economy'
import { isOnline } from '@/lib/dto'
import { cache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export interface LeaderRow {
  userId: string
  name: string
  photoUrl: string | null
  isBot: boolean
  online: boolean
  level: number
  value: number
  rank: number
  isMe: boolean
}

// Топы: баланс / уровень / сделки / прибыль. Кеш 20с — расчёты лёгкие,
// но ленту могут дёргать часто.
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()

  const rows = (await cache.getOrSet('lb:all', 20_000, async () => {
    const users = await db.user.findMany({
      select: { id: true, isBot: true, displayName: true, photoUrl: true, balance: true, xp: true, stats: true, lastSeenAt: true },
      take: 400,
    })
    const mapped = users.map((u) => {
      const s = parseStats(u.stats)
      return {
        userId: u.id,
        name: u.displayName,
        photoUrl: u.photoUrl,
        isBot: u.isBot,
        online: isOnline(u),
        level: levelFromXp(u.xp),
        balance: u.balance,
        deals: s.dealsTotal,
        profit: Math.max(0, s.profit),
      }
    })
    const top = (key: 'balance' | 'level' | 'deals' | 'profit') =>
      [...mapped].sort((a, b) => b[key] - a[key]).slice(0, 15)
    return {
      balance: top('balance'),
      level: top('level'),
      deals: top('deals'),
      profit: top('profit'),
    }
  })) as unknown as {
    balance: Omit<LeaderRow, 'rank' | 'isMe'>[]
    level: Omit<LeaderRow, 'rank' | 'isMe'>[]
    deals: Omit<LeaderRow, 'rank' | 'isMe'>[]
    profit: Omit<LeaderRow, 'rank' | 'isMe'>[]
  }

  const decorate = (list: Omit<LeaderRow, 'rank' | 'isMe'>[], key: 'balance' | 'level' | 'deals' | 'profit'): LeaderRow[] =>
    list.map((r, i) => ({ ...r, value: r[key], rank: i + 1, isMe: r.userId === me.id }))

  return Response.json({
    balance: decorate(rows.balance, 'balance'),
    level: decorate(rows.level, 'level'),
    deals: decorate(rows.deals, 'deals'),
    profit: decorate(rows.profit, 'profit'),
  })
}
