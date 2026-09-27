import { CATALOG } from '@/lib/catalog-data'
import { cache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  const items = cache.getOrSet('catalog:all', 300_000, async () =>
    CATALOG.map((i) => ({ key: i.key, title: i.title, category: i.category, basePrice: i.basePrice })),
  )
  return Response.json({ items })
}
