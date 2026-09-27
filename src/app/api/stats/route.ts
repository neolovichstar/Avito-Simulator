import { db } from '@/lib/db'
import { cache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  // РЕАЛЬНЫЙ онлайн: только живые игроки с активностью за последние 3 минуты
  // (lastSeenAt бампится сессией на каждом авторизованном запросе).
  // Никаких ботов, никаких симуляций и socket-присутствий.
  const [online, turnover] = await Promise.all([
    cache.getOrSet('stats:online', 5_000, async () => {
      return db.user.count({
        where: { isBot: false, lastSeenAt: { gt: new Date(Date.now() - 3 * 60_000) } },
      })
    }),
    // Обороты: виртуальный рынок в рублях (сумма реальных сделок купли-продажи,
    // без бонусов/квестов/ремонтов) + реальные покупки за Telegram Stars.
    // Кэш 60 с: агрегаты по большим таблицам не должны гоняться на каждый чих.
    cache.getOrSet('stats:turnover', 60_000, async () => {
      const [gmvAgg, starsAgg] = await Promise.all([
        db.transaction.aggregate({
          where: { type: 'purchase', amount: { lt: 0 }, listingId: { not: null } },
          _sum: { amount: true },
        }),
        db.starsPayment
          .aggregate({ where: { status: 'paid' }, _sum: { stars: true } })
          .catch(() => ({ _sum: { stars: null } })),
      ])
      return {
        rub: Math.abs(gmvAgg._sum.amount ?? 0),
        stars: starsAgg._sum.stars ?? 0,
      }
    }),
  ])
  return Response.json({ online, turnoverRub: turnover.rub, turnoverStars: turnover.stars })
}
