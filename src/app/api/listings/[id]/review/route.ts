import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { notifyUser, addXp, bumpQuests, bumpStats, checkAchievements } from '@/lib/deals'
import { personaOf } from '@/lib/chat-engine'
import { stripEmoji } from '@/lib/format'

export const dynamic = 'force-dynamic'

// Отзыв о сделке: покупатель оценивает продавца. Бот в ответ оставляет встречный отзыв.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`review:${user.id}`, 10, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите минуту' }, { status: 429 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { rating?: number; text?: string }
  const rating = Math.round(Number(body.rating))
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: 'Оценка должна быть от 1 до 5' }, { status: 400 })
  }
  const text = stripEmoji(String(body.text ?? '').slice(0, 300).trim())

  const listing = await db.listing.findUnique({ where: { id }, include: { seller: true } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.sellerId === user.id) {
    return Response.json({ error: 'Нельзя оценить себя' }, { status: 400 })
  }

  // оценить может только тот, кто купил этот товар
  const purchase = await db.transaction.findFirst({
    where: { listingId: id, userId: user.id, type: 'purchase', amount: { lt: 0 } },
  })
  if (!purchase) {
    return Response.json({ error: 'Отзыв можно оставить только после покупки' }, { status: 403 })
  }

  const existing = await db.review.findFirst({ where: { listingId: id, fromUserId: user.id } })
  if (existing) {
    return Response.json({ error: 'Вы уже оставили отзыв на эту сделку' }, { status: 400 })
  }

  const review = await db.review.create({
    data: { listingId: id, fromUserId: user.id, toUserId: listing.sellerId, rating, text: text || 'Без комментария' },
  })

  // рейтинг продавца
  await db.user.update({
    where: { id: listing.sellerId },
    data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } },
  })

  // награда, статистика и прогресс квестов
  await addXp(user.id, 20)
  await bumpStats(user.id, { reviews: 1 })
  await bumpQuests(user.id, 'review', 1)
  await checkAchievements(user.id)

  // уведомление продавцу (боту — просто копится, игроку придёт realtime)
  await notifyUser(
    listing.sellerId,
    'avito',
    'Новый отзыв',
    `${user.displayName} оценил сделку на ${rating} из 5`,
  )

  // встречный отзыв от бота-продавца — по личности, с задержкой
  if (listing.seller.isBot) {
    const p = personaOf(listing.seller)
    const phrases = rating >= 4
      ? [
          `нормальный мужик, забрал ${listing.title} без проблем, всем рекомендую`,
          `сделка прошла чётко, время не тянул, лайк`,
          `приятный покупатель, адекватный, обращайтесь ещё`,
          `всё по делу, договорились быстро, пять баллов`,
        ]
      : [
          `нуууу, за такую оценку спасибо конечно... я то думал всё было ок`,
          `строгий дядька, но ладно, спору нет`,
          `хм, не ожидал. ладно, бывает`,
        ]
    const replyText = phrases[Math.floor(Math.random() * phrases.length)]
    setTimeout(() => {
      db.review
        .create({
          data: {
            listingId: id,
            fromUserId: listing.sellerId,
            toUserId: user.id,
            rating: rating >= 4 ? (Math.random() > 0.3 ? 5 : 4) : Math.random() > 0.5 ? 4 : 3,
            text: replyText,
          },
        })
        .then(async (r) => {
          await db.user.update({
            where: { id: user.id },
            data: { ratingSum: { increment: r.rating }, ratingCount: { increment: 1 } },
          })
          await notifyUser(
            user.id,
            'avito',
            'Ответный отзыв',
            `${listing.seller.displayName}: «${replyText}»`,
          )
        })
        .catch(() => {})
    }, 4000 + Math.random() * 8000)
  }

  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, xp: fresh?.xp ?? 0 })
}
