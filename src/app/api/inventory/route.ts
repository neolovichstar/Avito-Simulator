import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { getCategoryMult } from '@/lib/engine'
import { CONDITION_MULT } from '@/lib/catalog-types'
import type { InventoryItemDTO, TransitItemDTO } from '@/lib/types'
import { itemImage } from '@/lib/item-images'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const items = await db.item.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const activeListings = await db.listing.findMany({
    where: { sellerId: user.id, status: 'active', itemId: { not: null } },
    select: { itemId: true },
  })
  const listedIds = new Set(activeListings.map((l) => l.itemId))
  const mults = new Map<string, number>()
  for (const item of items) {
    if (!mults.has(item.category)) mults.set(item.category, await getCategoryMult(item.category))
  }
  // ЛОГИСТИКА (28-b): вещи под активной посылкой ещё не «приехали» — прячем из инвентаря,
  // они показываются серой секцией «В пути» до получения в Доставках
  const activeDeliveries = await db.delivery.findMany({
    where: { userId: user.id, kind: 'purchase', status: { in: ['collecting', 'in_transit', 'arrived'] } },
    orderBy: { createdAt: 'desc' },
  })
  const hiddenListings = await db.listing.findMany({
    where: { id: { in: activeDeliveries.map((d) => d.listingId) } },
    select: { id: true, itemId: true },
  })
  const hiddenItemIds = new Set(hiddenListings.map((l) => l.itemId).filter(Boolean) as string[])
  const visible = items.filter((i) => !hiddenItemIds.has(i.id))
  const inTransit: TransitItemDTO[] = activeDeliveries.map((d) => ({
    id: d.id,
    title: d.title,
    image: itemImage(d.itemKey, d.category),
    price: d.price,
    status: d.status as TransitItemDTO['status'],
    eta: d.eta.toISOString(),
  }))
  const out: InventoryItemDTO[] = visible.map((i) => ({
    id: i.id, itemKey: i.itemKey, title: i.title, category: i.category, condition: i.condition,
    image: itemImage(i.itemKey, i.category), baseValue: i.baseValue, purchasePrice: i.purchasePrice,
    estValue: Math.round(i.baseValue * (CONDITION_MULT[i.condition] ?? 0.8) * (mults.get(i.category) ?? 1)),
    createdAt: i.createdAt.toISOString(),
    listed: listedIds.has(i.id),
  }))
  return Response.json({ items: out, inTransit, inTransitCount: activeDeliveries.length })
}
