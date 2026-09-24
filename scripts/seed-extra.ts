// Сид истории цен (PricePoint) за последние 10 дней + досид отзывов ботам.
// Запуск: bun scripts/seed-extra.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1))
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const REVIEW_TEXTS = [
  'всё отлично, товар как в описании',
  'забрал самовывозом, продавец норм',
  'работает, претензий нет',
  'упаковано было нормально, дошло целым',
  'небольшой торг, в итоге договорились',
  'рекомендую, адекватный продавец',
  'всё как на фото',
  'спасибо, всё супер',
  'приятный в общении, помог с погрузкой',
  'цена чуть завышена, но товар стоящий',
  'немного ждал ответа, но сделка ок',
  'состояние на четвёрку, но за эти деньги норм',
]

async function seedPriceHistory() {
  const listings = await db.listing.findMany({
    where: { status: 'active', price: { gt: 0 } },
    select: { itemKey: true, price: true, baseValue: true, category: true },
    take: 500,
  })
  const byKey = new Map<string, { price: number }>()
  for (const l of listings) {
    if (!byKey.has(l.itemKey)) byKey.set(l.itemKey, { price: l.price })
  }
  const existing = await db.pricePoint.findMany({
    select: { itemKey: true },
    distinct: ['itemKey'],
  })
  const existingSet = new Set(existing.map((e) => e.itemKey))
  let created = 0
  for (const [itemKey, { price }] of byKey) {
    if (existingSet.has(itemKey)) continue
    // случайное блуждание за 10 дней: от price*(0.85..1.2) к текущей цене
    const steps = randInt(6, 10)
    const start = price * (0.85 + Math.random() * 0.35)
    const now = Date.now()
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const drift = start + (price - start) * t
      const noise = 1 + (Math.random() - 0.5) * 0.08
      const p = Math.max(50, Math.round((drift * noise) / 10) * 10 - 1)
      await db.pricePoint.create({
        data: {
          itemKey,
          price: p,
          createdAt: new Date(now - (steps - 1 - i) * randInt(18, 30) * 3_600_000),
        },
      })
      created++
    }
  }
  console.log(`price history: ${created} points for ${byKey.size - existingSet.size} items`)
}

async function seedBotReviews() {
  const bots = await db.user.findMany({
    where: { isBot: true },
    include: { listings: { where: { status: { in: ['active', 'sold'] } }, take: 1 } },
  })
  const allBots = bots.map((b) => b.id)
  let created = 0
  for (const bot of bots) {
    if (bot.ratingCount >= 3) continue
    if (!bot.listings.length) continue
    const need = randInt(3, 6) - bot.ratingCount
    for (let i = 0; i < need; i++) {
      const from = pick(allBots.filter((id) => id !== bot.id))
      if (!from) break
      const rating = Math.random() < 0.75 ? 5 : Math.random() < 0.6 ? 4 : 3
      try {
        await db.review.create({
          data: {
            listingId: bot.listings[0].id,
            fromUserId: from,
            toUserId: bot.id,
            rating,
            text: pick(REVIEW_TEXTS),
            createdAt: new Date(Date.now() - randInt(2, 25) * 86_400_000),
          },
        })
        created++
      } catch {
        break
      }
    }
    const cnt = await db.review.count({ where: { toUserId: bot.id } })
    const sum = await db.review.aggregate({ where: { toUserId: bot.id }, _sum: { rating: true } })
    await db.user.update({
      where: { id: bot.id },
      data: { ratingCount: cnt, ratingSum: sum._sum.rating ?? 0 },
    })
  }
  console.log(`bot reviews: created ${created}`)
}

async function main() {
  await seedPriceHistory()
  await seedBotReviews()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
