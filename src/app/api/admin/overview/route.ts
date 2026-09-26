import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { cache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const DAY = 24 * 3600_000

export async function GET(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const data = await cache.getOrSet('admin:overview', 10_000, async () => {
    const now = new Date()
    const since24 = new Date(now.getTime() - DAY)
    const since14 = new Date(now.getTime() - 14 * DAY)

    const [
      users,
      bots,
      activeListings,
      liveAuctions,
      tx24,
      txSeries,
      userSeries,
      indexes,
      events,
      recentTxRaw,
      hotListings,
      recentChats,
      taxAgg,
      moneyAgg,
      intrusions,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { isBot: true } }),
      db.listing.count({ where: { status: 'active' } }),
      db.auctionLot.count({ where: { status: 'active' } }),
      db.transaction.findMany({
        where: { createdAt: { gte: since24 }, type: { in: ['purchase', 'sale'] } },
        select: { amount: true },
      }),
      db.transaction.findMany({
        where: { createdAt: { gte: since14 }, type: { in: ['purchase', 'sale'] } },
        select: { amount: true, createdAt: true },
      }),
      db.user.findMany({
        where: { createdAt: { gte: since14 } },
        select: { createdAt: true },
      }),
      db.marketIndex.findMany({ orderBy: { category: 'asc' } }),
      db.marketEvent.findMany({
        where: { expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { user: { select: { displayName: true, isBot: true } } },
      }),
      db.listing.findMany({
        where: { status: 'active' },
        orderBy: { views: 'desc' },
        take: 7,
        select: { id: true, title: true, price: true, views: true, city: true, image: true },
      }),
      db.chat.count({ where: { lastMessageAt: { gte: since24 } } }),
      db.user.aggregate({ _sum: { taxDebt: true } }),
      db.user.aggregate({ _sum: { balance: true } }),
      db.adminAction.count({ where: { action: 'auth.fail', createdAt: { gte: since24 } } }),
    ])

    // бакеты по дням в JS — переносимо между SQLite и Postgres
    const days: string[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * DAY)
      days.push(d.toISOString().slice(0, 10))
    }
    const gmvMap = new Map<string, { gmv: number; deals: number }>()
    for (const d of days) gmvMap.set(d, { gmv: 0, deals: 0 })
    for (const t of txSeries) {
      const key = t.createdAt.toISOString().slice(0, 10)
      const b = gmvMap.get(key)
      if (b) {
        b.gmv += Math.abs(t.amount)
        b.deals += 1
      }
    }
    const signupMap = new Map<string, number>(days.map((d) => [d, 0]))
    for (const u of userSeries) {
      const key = u.createdAt.toISOString().slice(0, 10)
      if (signupMap.has(key)) signupMap.set(key, (signupMap.get(key) ?? 0) + 1)
    }

    const gmvSeries = days.map((d) => ({
      day: d.slice(5).replace('-', '.'),
      gmv: gmvMap.get(d)?.gmv ?? 0,
      deals: gmvMap.get(d)?.deals ?? 0,
    }))

    const eventMults = new Map<string, number>()
    for (const e of events) {
      eventMults.set(e.category, (eventMults.get(e.category) ?? 1) * (1 + e.magnitude))
    }

    return {
      kpis: {
        users,
        bots,
        online: 0, // заполняется ниже отдельно (не кэшируется долго)
        activeListings,
        deals24: tx24.length,
        gmv24: tx24.reduce((s, t) => s + Math.abs(t.amount), 0),
        gmv24Prev: 0,
        liveAuctions,
        taxDebtSum: taxAgg._sum.taxDebt ?? 0,
        chats24: recentChats,
        moneySupply: moneyAgg._sum.balance ?? 0,
        intrusions24: intrusions,
      },
      gmvSeries,
      signupSeries: days.map((d) => ({ day: d.slice(5).replace('-', '.'), count: signupMap.get(d) ?? 0 })),
      marketIndex: indexes.map((i) => ({
        category: i.category,
        label: CATEGORY_LABEL[i.category] ?? i.category,
        multiplier: Math.round(i.multiplier * (eventMults.get(i.category) ?? 1) * 100) / 100,
      })),
      recentTx: recentTxRaw.map((t) => ({
        id: t.id,
        userName: t.user.displayName,
        isBot: t.user.isBot,
        type: t.type,
        amount: t.amount,
        note: t.note,
        createdAt: t.createdAt.toISOString(),
      })),
      hotListings,
      serverTime: now.toISOString(),
    }
  })

  // онлайн и GMV вчера — вне длинного кэша
  const { realOnlineCount } = await import('@/lib/realtime-emit')
  let online = 0
  try {
    online = await realOnlineCount()
  } catch {}
  const botsRecent = await db.user.count({
    where: { isBot: true, lastSeenAt: { gt: new Date(Date.now() - 15 * 60_000) } },
  })

  const now = Date.now()
  const txPrev = await db.transaction.findMany({
    where: {
      createdAt: { gte: new Date(now - 2 * 24 * 3600_000), lt: new Date(now - 24 * 3600_000) },
      type: { in: ['purchase', 'sale'] },
    },
    select: { amount: true },
  })
  const gmv24Prev = txPrev.reduce((s, t) => s + Math.abs(t.amount), 0)

  return Response.json({
    ...data,
    kpis: { ...data.kpis, online: online + botsRecent, gmv24Prev },
  })
}
