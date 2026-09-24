import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { listingDTO } from '@/lib/dto'
import { cache } from '@/lib/cache'
import { rateLimit } from '@/lib/ratelimit'
import { onListingCreated } from '@/lib/market-hooks'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import type { CategoryKey } from '@/lib/catalog-types'

export const dynamic = 'force-dynamic'

// GET: лента объявлений
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.slice(0, 64) ?? ''
  const category = url.searchParams.get('category') ?? ''
  const sort = url.searchParams.get('sort') ?? 'new'
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const limit = Math.min(40, Math.max(4, Number(url.searchParams.get('limit') ?? 20)))
  const mine = url.searchParams.get('mine') === '1'

  const user = await getSessionUser(req)
  if (mine && !user) return unauthorized()

  const where = {
    status: 'active' as const,
    ...(mine ? { sellerId: user!.id } : {}),
    ...(category && category !== 'all' ? { category } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] } : {}),
  }

  const orderBy =
    sort === 'cheap' ? [{ price: 'asc' as const }, { createdAt: 'desc' as const }]
    : sort === 'expensive' ? [{ price: 'desc' as const }, { createdAt: 'desc' as const }]
    : [{ createdAt: 'desc' as const }]

  const cacheKey = `feed:${q}|${category}|${sort}|${page}|${limit}`

  const load = async () => {
    const [rows, total] = await Promise.all([
      db.listing.findMany({
        where, orderBy,
        skip: (page - 1) * limit,
        take: limit + 1,
        include: { seller: true },
      }),
      db.listing.count({ where }),
    ])
    return { rows, total }
  }

  const { rows, total } = mine
    ? await load()
    : await cache.getOrSet(cacheKey, 15_000, load)

  const slice = rows.slice(0, limit)
  // boosted наверх (только на первой странице без сортировки по цене)
  let list = slice.map((l) => listingDTO(l, user?.id ?? null))
  if (sort === 'new' && page === 1) {
    list = [...list.filter((l) => l.boosted), ...list.filter((l) => !l.boosted)]
  }
  return Response.json({ items: list, total })
}

// POST: создать объявление из своего инвентаря
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`createListing:${user.id}`, 10, 60_000)) {
    return Response.json({ error: 'Слишком много объявлений подряд' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    itemId?: string; title?: string; description?: string
    category?: CategoryKey; condition?: string; price?: number
  }
  if (!body.itemId) return Response.json({ error: 'Укажите товар из инвентаря' }, { status: 400 })
  if (user.taxDebt >= 10_000) {
    return Response.json({ error: 'Продажи заблокированы: погасите задолженность по налогам в приложении Налоги' }, { status: 400 })
  }
  const item = await db.item.findUnique({ where: { id: body.itemId } })
  if (!item || item.ownerId !== user.id) {
    return Response.json({ error: 'Товар не найден в инвентаре' }, { status: 404 })
  }
  const listed = await db.listing.count({ where: { itemId: item.id, status: 'active' } })
  if (listed > 0) return Response.json({ error: 'Этот товар уже выставлен' }, { status: 400 })
  const inRepair = await db.repairOrder.count({ where: { itemId: item.id, status: { in: ['in_progress', 'ready'] } } })
  if (inRepair > 0) return Response.json({ error: 'Товар сейчас в ремонте' }, { status: 400 })

  const price = Math.round(Number(body.price))
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
    return Response.json({ error: 'Некорректная цена' }, { status: 400 })
  }
  const title = (body.title?.trim() || item.title).slice(0, 100)
  const description = (body.description?.trim() || `Продаю «${item.title}». Состояние: ${item.condition}.`).slice(0, 1000)

  const listing = await db.listing.create({
    data: {
      sellerId: user.id, itemId: item.id, itemKey: item.itemKey, title,
      description, category: item.category, condition: item.condition,
      price, baseValue: item.baseValue, image: item.image, city: user.city,
    },
    include: { seller: true },
  })
  cache.invalidate('feed')
  void onListingCreated(listing)
  return Response.json({ listing: listingDTO(listing, user.id) })
}
