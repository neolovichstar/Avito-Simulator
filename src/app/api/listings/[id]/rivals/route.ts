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

  const data = await cache.getOrSet(`rivals:${listing.itemKey}`, 20_000, async (): Promise<RivalsData> => {
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
      rivals: rows.map((r) => ({
        id: r.id,
        price: r.price,
        seller: r.seller.displayName,
        city: r.seller.city,
        isMine: r.sellerId === user.id,
        isMe: r.id === listing.id,
        condition: r.condition,
        image: itemImage(r.itemKey, r.category),
      })),
    }
  })
  return Response.json(data)
}
