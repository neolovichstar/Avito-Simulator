import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ratingOf } from '@/lib/dto'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const [reviews, activeListings, soldCount, inventoryItems] = await Promise.all([
    db.review.findMany({
      where: { toUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { from: true, listing: true },
    }),
    db.listing.count({ where: { sellerId: user.id, status: 'active' } }),
    db.listing.count({ where: { sellerId: user.id, status: 'sold' } }),
    db.item.findMany({ where: { ownerId: user.id } }),
  ])
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
  })
}
