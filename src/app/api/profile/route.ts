import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ratingOf } from '@/lib/dto'
import { itemImage } from '@/lib/item-images'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const [reviews, activeListings, soldCount, inventoryItems, purchaseTx] = await Promise.all([
    db.review.findMany({
      where: { toUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { from: true, listing: true },
    }),
    db.listing.count({ where: { sellerId: user.id, status: 'active' } }),
    db.listing.count({ where: { sellerId: user.id, status: 'sold' } }),
    db.item.findMany({ where: { ownerId: user.id } }),
    db.transaction.findMany({
      where: { userId: user.id, type: 'purchase', amount: { lt: 0 }, listingId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { listingId: true, createdAt: true, amount: true },
    }),
  ])
  // дедупликация по объявлению (доставка могла разбить платеж)
  const seen = new Set<string>()
  const purchaseRows = purchaseTx.filter((t) => {
    if (!t.listingId || seen.has(t.listingId)) return false
    seen.add(t.listingId)
    return true
  })
  const listingIds = purchaseRows.map((t) => t.listingId as string)
  const [listings, myReviews] = await Promise.all([
    db.listing.findMany({
      where: { id: { in: listingIds } },
      select: { id: true, title: true, price: true, itemKey: true, category: true },
    }),
    db.review.findMany({ where: { fromUserId: user.id, listingId: { in: listingIds } }, select: { listingId: true } }),
  ])
  const reviewedSet = new Set(myReviews.map((r) => r.listingId))
  const listingMap = new Map(listings.map((l) => [l.id, l]))

  return Response.json({
    user: {
      id: user.id, username: user.username, displayName: user.displayName, photoUrl: user.photoUrl,
      balance: user.balance, debt: user.debt, deposit: user.deposit, xp: user.xp, level: user.level,
      ratingSum: user.ratingSum, ratingCount: user.ratingCount, taxDebt: user.taxDebt,
      city: user.city, bio: user.bio, isNew: false,
    },
    rating: ratingOf(user),
    reviews: reviews.map((r) => ({
      id: r.id, rating: r.rating, text: r.text, from: r.from.displayName,
      createdAt: r.createdAt.toISOString(),
    })),
    activeListings,
    soldCount,
    inventoryValue: inventoryItems.reduce((s, i) => s + i.baseValue, 0),
    dealsCount: user.ratingCount,
    purchases: purchaseRows.flatMap((t) => {
      const l = listingMap.get(t.listingId as string)
      if (!l) return []
      return [{
        listingId: l.id,
        title: l.title,
        price: Math.abs(t.amount),
        image: itemImage(l.itemKey, l.category),
        createdAt: t.createdAt.toISOString(),
        reviewed: reviewedSet.has(l.id),
      }]
    }),
  })
}

/**
 * PATCH /api/profile { city } — выбор региона (онбординг при первом входе).
 * Город проверяется по списку субъектов РФ; также разрешаем произвольное
 * название до 48 символов (для старых профилей).
 */
export async function PATCH(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { city?: string }
  const city = (body.city ?? '').trim().slice(0, 48)
  if (!city) return Response.json({ error: 'Пустой регион' }, { status: 400 })
  const updated = await db.user.update({ where: { id: user.id }, data: { city } })
  return Response.json({ ok: true, city: updated.city })
}
