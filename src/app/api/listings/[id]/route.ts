import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { listingDTO, isOnline, ratingOf } from '@/lib/dto'
import { getCategoryMult } from '@/lib/engine'
import { CONDITION_MULT } from '@/lib/catalog-types'
import { specsFor } from '@/lib/specs'
import { cache } from '@/lib/cache'
import { recordPricePoint } from '@/lib/market-hooks'
import { onPlayerPriceDrop } from '@/lib/price-war'
import { blockedIds } from '@/lib/blocked'

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
  // заблокированных продавцов не показываем и среди похожих
  const blocked = user ? await blockedIds(user.id) : []

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
    similar: similar
      .filter((s) => !blocked.includes(s.sellerId))
      .map((s) => ({
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

// PATCH: игрок меняет цену своего активного объявления
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const listing = await db.listing.findUnique({ where: { id }, include: { seller: true } })
  if (!listing || listing.sellerId !== user.id) {
    return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  }
  if (listing.status !== 'active') {
    return Response.json({ error: 'Объявление не активно' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as { price?: number }
  const price = Math.round(Number(body.price))
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
    return Response.json({ error: 'Некорректная цена' }, { status: 400 })
  }
  if (price === listing.price) {
    return Response.json({ listing: listingDTO(listing, user.id), changed: false })
  }
  // «даром» разрешаем только мусору/бесплатным (и если уже было даром)
  if (price === 0 && listing.price > 0 && listing.baseValue >= 500) {
    return Response.json({ error: 'Отдать даром можно только мелочь — иначе рынок не переживёт' }, { status: 400 })
  }
  if (price > 0 && price < 50) {
    return Response.json({ error: 'Минимальная цена — 50 ₽ (или 0, чтобы отдать даром)' }, { status: 400 })
  }

  const oldPrice = listing.price
  const updated = await db.listing.update({
    where: { id: listing.id },
    data: { price },
    include: { seller: true },
  })
  cache.invalidate('feed')
  await recordPricePoint(updated.itemKey, price)

  // снижение цены — включаем войну: конкуренты отреагируют через пару секунд
  if (price < oldPrice) {
    void onPlayerPriceDrop(
      {
        id: updated.id, sellerId: updated.sellerId, itemKey: updated.itemKey,
        title: updated.title, price, baseValue: updated.baseValue,
      },
      oldPrice,
    ).catch(() => {})
  }

  return Response.json({
    listing: listingDTO(updated, user.id),
    changed: true,
    oldPrice,
    warStarted: price < oldPrice,
  })
}
