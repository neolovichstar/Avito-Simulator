import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { emitTo } from '@/lib/realtime-emit'

export const dynamic = 'force-dynamic'

const KINDS = ['demand_up', 'demand_down', 'fashion', 'crisis', 'opu', 'tax_raid', 'supply']

export async function POST(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const category = String(body?.category ?? 'all')
  const kind = String(body?.kind ?? 'demand_up')
  const magnitude = Number(body?.magnitude)
  const headline = String(body?.headline ?? '').slice(0, 120).trim()
  const text = String(body?.body ?? headline).slice(0, 500).trim()
  const hours = Math.min(48, Math.max(1, Number(body?.hours) || 6))

  if (!headline) return Response.json({ error: 'Нужен заголовок новости' }, { status: 400 })
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return Response.json({ error: 'Укажите сдвиг цен в процентах (не ноль)' }, { status: 400 })
  }
  if (!KINDS.includes(kind)) return Response.json({ error: 'Неизвестный тип события' }, { status: 400 })

  const m = Math.max(-0.5, Math.min(0.5, magnitude / 100))
  const cats = category === 'all' ? Object.keys(CATEGORY_LABEL) : [category]

  const event = await db.marketEvent.create({
    data: {
      category,
      kind,
      magnitude: m,
      headline,
      body: text,
      expiresAt: new Date(Date.now() + hours * 3600_000),
    },
  })

  // событие сразу двигает индексы (как это делает движок) — цены меняются мгновенно
  for (const cat of cats) {
    const cur = await db.marketIndex.findUnique({ where: { category: cat } })
    const next = Math.min(3, Math.max(0.2, (cur?.multiplier ?? 1) * (1 + m)))
    await db.marketIndex.upsert({
      where: { category: cat },
      update: { multiplier: next, updatedAt: new Date() },
      create: { category: cat, multiplier: next },
    })
  }

  await emitTo('global', 'market:event', { headline, category, magnitude: m }).catch(() => {})
  await logAdmin(
    'market.event',
    'market',
    event.id,
    `Событие «${headline}» — ${category === 'all' ? 'все категории' : CATEGORY_LABEL[category] ?? category}, ${magnitude > 0 ? '+' : ''}${magnitude}% на ${hours} ч`,
  )

  return Response.json({ ok: true, event: { id: event.id } })
}
