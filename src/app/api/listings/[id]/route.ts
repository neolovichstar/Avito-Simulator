import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { listingDTO, isOnline, ratingOf } from '@/lib/dto'
import { getCategoryMult } from '@/lib/engine'
import { CONDITION_MULT } from '@/lib/catalog-types'
import { specsFor } from '@/lib/specs'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const listing = await db.listing.findUnique({ where: { id }, include: { seller: true } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  const user = await getSessionUser(req)

  // просмотры
  if (Date.now() - listing.createdAt.getTime() > 5000) {
    await db.listing.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {})
  }

  const [mult, purchase, review, history, similar] = await Promise.all([
    getCategoryMult(listing.category),
    user
      ? db.transaction.findFirst({ where: { listingId: id, userId: user.id, type: 'purchase', amount: { lt: 0 } } })
      : Promise.resolve(null),
    user ? db.review.findFirst({ where: { listingId: id, fromUserId: user.id } }) : Promise.resolve(null),
    db.pricePoint.findMany({
      where: { itemKey: listing.itemKey },
      orderBy: { createdAt: 'asc' },
      take: 40,
      select: { price: true, createdAt: true },
    }),
    // Конкуренты: те же товары других продавцов — кто дешевле виден сразу
    db.listing.findMany({
      where: { itemKey: listing.itemKey, status: 'active', id: { not: id } },
      orderBy: { price: 'asc' },
      take: 5,
      include: { seller: { select: { displayName: true } } },
    }),
  ])
  const est = Math.round(listing.baseValue * (CONDITION_MULT[listing.condition] ?? 0.8) * mult)
  const raw = listing.price > 0 ? Math.round(((est - listing.price) / listing.price) * 100) : 100
  const marginHint = Math.min(90, raw)

  return Response.json({
    ...listingDTO(listing, user?.id ?? null),
    description: listing.description,
    itemKey: listing.itemKey,
    marginHint,
    sellerJoined: listing.seller.createdAt.toISOString(),
    sellerOnline: isOnline(listing.seller),
    sellerRating: ratingOf(listing.seller),
    specs: specsFor(listing.itemKey, listing.category, listing.id),
    priceHistory: history.map((h) => ({
      price: h.price,
      at: h.createdAt.toISOString(),
    })),
    purchasedByMe: !!purchase,
    reviewedByMe: !!review,
    similar: similar.map((s) => ({
      id: s.id,
      title: s.title,
      price: s.price,
      condition: s.condition,
      image: s.image,
      city: s.city,
      createdAt: s.createdAt.toISOString(),
      boosted: s.boostedUntil ? s.boostedUntil.getTime() > Date.now() : false,
      sellerName: s.seller.displayName,
      mine: user ? s.sellerId === user.id : false,
    })),
  })
}
