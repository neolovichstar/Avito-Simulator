import { db } from '@/lib/db'
import { cache } from '@/lib/cache'
import { CATALOG } from '@/lib/catalog-data'
import { itemImage } from '@/lib/item-images'
import type { PulseItemDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ПУЛЬС РЫНКА: самые заметные движения цен за последний час (по истории PricePoint).
// Считаем МИНИМАЛЬНУЮ цену товара: было дешевле стало дороже — честная рыночная метрика,
// устойчивая к тому, что у товара несколько продавцов с разными ценами.
export async function GET() {
  const data = await cache.getOrSet('market:pulse', 45_000, async (): Promise<PulseItemDTO[]> => {
    const since = new Date(Date.now() - 60 * 60_000)
    const points = await db.pricePoint.findMany({
      where: { createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
    })
    if (points.length < 2) return []

    const mid = since.getTime() + 30 * 60_000
    // группируем по товару: минимум в первой половине часа vs минимум во второй
    const groups = new Map<string, { minFirst: number; minLast: number; n: number }>()
    for (const p of points) {
      const cur = groups.get(p.itemKey)
      if (!cur) groups.set(p.itemKey, { minFirst: 0, minLast: 0, n: 1 })
      else cur.n += 1
      const g = groups.get(p.itemKey)!
      if (p.createdAt.getTime() < mid) {
        g.minFirst = g.minFirst === 0 ? p.price : Math.min(g.minFirst, p.price)
      } else {
        g.minLast = g.minLast === 0 ? p.price : Math.min(g.minLast, p.price)
      }
    }

    const out: PulseItemDTO[] = []
    for (const [itemKey, g] of groups) {
      if (g.minFirst <= 0 || g.minLast <= 0) continue
      // минус = подешевел, плюс = подорожал (как в динамике цен на карточке)
      const deltaPct = Math.round((g.minLast / g.minFirst - 1) * 100)
      if (Math.abs(deltaPct) < 3) continue // шум не показываем
      const item = CATALOG.find((c) => c.key === itemKey)
      if (!item) continue
      out.push({
        itemKey,
        title: item.title,
        image: itemImage(itemKey, item.category),
        category: item.category,
        price: g.minLast,
        deltaPct,
        moves: g.n,
      })
    }
    // самые яркие движения — по модулю
    out.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    return out.slice(0, 8)
  })
  return Response.json(data)
}
