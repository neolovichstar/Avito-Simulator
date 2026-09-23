import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { getCategoryMult } from '@/lib/engine'
import { CONDITION_MULT } from '@/lib/catalog-types'
import type { InventoryItemDTO } from '@/lib/types'

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
  const out: InventoryItemDTO[] = items.map((i) => ({
    id: i.id, itemKey: i.itemKey, title: i.title, category: i.category, condition: i.condition,
    image: i.image, baseValue: i.baseValue, purchasePrice: i.purchasePrice,
    estValue: Math.round(i.baseValue * (CONDITION_MULT[i.condition] ?? 0.8) * (mults.get(i.category) ?? 1)),
    createdAt: i.createdAt.toISOString(),
    listed: listedIds.has(i.id),
  }))
  return Response.json({ items: out })
}
