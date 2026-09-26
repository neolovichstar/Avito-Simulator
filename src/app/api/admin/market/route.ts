import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/catalog-types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const [indexes, events] = await Promise.all([
    db.marketIndex.findMany({ orderBy: { category: 'asc' } }),
    db.marketEvent.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ])

  // гарантируем, что все категории каталога присутствуют (даже если движок их ещё не создал)
  const byCat = new Map(indexes.map((i) => [i.category, i]))
  const full = CATEGORIES.map((c) => ({
    category: c.key,
    label: CATEGORY_LABEL[c.key] ?? c.key,
    multiplier: byCat.get(c.key)?.multiplier ?? 1,
    updatedAt: (byCat.get(c.key)?.updatedAt ?? new Date()).toISOString(),
  }))

  return Response.json({
    indexes: full,
    events: events.map((e) => ({
      id: e.id,
      category: e.category,
      kind: e.kind,
      magnitude: e.magnitude,
      headline: e.headline,
      body: e.body,
      createdAt: e.createdAt.toISOString(),
      expiresAt: e.expiresAt.toISOString(),
    })),
  })
}

export async function PUT(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const multipliers = body?.multipliers
  if (!multipliers || typeof multipliers !== 'object') {
    return Response.json({ error: 'Ожидается объект multipliers' }, { status: 400 })
  }

  const entries = Object.entries(multipliers as Record<string, unknown>)
    .map(([category, v]) => [category, Number(v)] as const)
    .filter(([category, v]) => CATEGORY_LABEL[category] && Number.isFinite(v) && v > 0)

  for (const [category, value] of entries) {
    const clamped = Math.min(3, Math.max(0.2, value))
    await db.marketIndex.upsert({
      where: { category },
      update: { multiplier: clamped, updatedAt: new Date() },
      create: { category, multiplier: clamped },
    })
  }

  return Response.json({ ok: true, updated: entries.length })
}
