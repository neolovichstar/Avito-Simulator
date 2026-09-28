import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { cache } from '@/lib/cache'
import { itemImage } from '@/lib/item-images'
import type { RivalsData } from '@/lib/types'

export const dynamic = 'force-dynamic'

// КОНКУРЕНТЫ ПО ТОВАРУ: кто ещё продаёт такой же itemKey и почём.
// Используется в шите изменения цены — игрок видит рынок, прежде чем ставить цену.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(_req)
  if (!user) return unauthorized()
  const { id } = await params

  const listing = await db.listing.findUnique({ where: { id } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })

  // 59-a: в кеш уходит только общий срез (без isMine): раньше пользовательская
  // пометка isMine попадала в общий кеш и «чужие» конкуренты показывались как свои
  const cached = await cache.getOrSet(`rivals:${listing.itemKey}`, 20_000, async () => {
    const rows = await db.listing.findMany({
      where: { itemKey: listing.itemKey, status: 'active', price: { gt: 0 } },
      include: { seller: { select: { displayName: true, isBot: true, city: true } } },
      orderBy: { price: 'asc' },
      take: 12,
    })
    const prices = rows.map((r) => r.price)
    const avg = prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0
    return {
      itemKey: listing.itemKey,
      count: rows.length,
      avg,
      rows: rows.map((r) => ({
        id: r.id,
        sellerId: r.sellerId,
        price: r.price,
        seller: r.seller.displayName,
        city: r.seller.city,
        condition: r.condition,
        image: itemImage(r.itemKey, r.category),
      })),
    }
  })
  const data: RivalsData = {
    itemKey: cached.itemKey,
    count: cached.count,
    avg: cached.avg,
    rivals: cached.rows.map((r) => ({
      id: r.id,
      price: r.price,
      seller: r.seller,
      city: r.city,
      condition: r.condition,
      image: r.image,
      isMine: r.sellerId === user.id,
      isMe: r.id === listing.id,
    })),
  }
  return Response.json(data)
}
