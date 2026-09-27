import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ratingOf } from '@/lib/dto'

export const dynamic = 'force-dynamic'

// Отзывы о пользователе (продавце): для карточки объявления
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const target = await db.user.findUnique({ where: { id }, select: { id: true, ratingSum: true, ratingCount: true } })
  if (!target) return Response.json({ error: 'Пользователь не найден' }, { status: 404 })

  const reviews = await db.review.findMany({
    where: { toUserId: id },
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: { from: { select: { displayName: true } }, listing: { select: { title: true } } },
  })

  return Response.json({
    rating: ratingOf(target),
    count: target.ratingCount,
    items: reviews.map((r) => ({
      id: r.id,
      from: r.from.displayName,
      rating: r.rating,
      text: r.text,
      listing: r.listing.title,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
