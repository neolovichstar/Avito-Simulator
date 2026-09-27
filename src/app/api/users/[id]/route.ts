import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ratingOf, isOnline } from '@/lib/dto'
import { hueColor } from '@/lib/format'

export const dynamic = 'force-dynamic'

// Профиль продавца: шапка + статистика (объявления отдельно в /listings)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const seller = await db.user.findUnique({ where: { id } })
  if (!seller) return Response.json({ error: 'Пользователь не найден' }, { status: 404 })

  const [activeCount, soldCount, deals] = await Promise.all([
    db.listing.count({ where: { sellerId: id, status: 'active' } }),
    db.listing.count({ where: { sellerId: id, status: 'sold' } }),
    db.user.findUnique({ where: { id }, select: { stats: true } }),
  ])

  let salesCount = soldCount
  try {
    const s = JSON.parse(deals?.stats ?? '{}') as { sales?: number }
    if (typeof s.sales === 'number' && s.sales > salesCount) salesCount = s.sales
  } catch { /* stats не критичны */ }

  const rating = ratingOf(seller)
  const reviews = await db.review.findMany({
    where: { toUserId: id },
    orderBy: { createdAt: 'desc' },
    take: 6,
    include: { from: { select: { displayName: true } }, listing: { select: { title: true } } },
  })

  return Response.json({
    seller: {
      id: seller.id,
      displayName: seller.displayName,
      isBot: seller.isBot,
      bio: seller.bio,
      city: seller.city,
      joinedAt: seller.createdAt.toISOString(),
      online: isOnline(seller),
      rating,
      ratingCount: seller.ratingCount,
      hue: hueColor(seller.id.length * 47 % 360),
    },
    stats: {
      activeCount,
      salesCount,
      dealsCount: seller.ratingCount,
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      from: r.from.displayName,
      rating: r.rating,
      text: r.text,
      listing: r.listing.title,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
