// Seed: боты с личностями, индексы рынка, стартовые объявления и лоты аукциона.
// Запуск: bun run scripts/seed.ts
import { PrismaClient } from '@prisma/client'
import { PERSONAS } from '../src/lib/personas-data'
import { CATALOG } from '../src/lib/catalog-data'
import { CATEGORY_IMAGE, CONDITIONS, CONDITION_MULT } from '../src/lib/catalog-types'

const db = new PrismaClient()

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}
function conditionWeighted(): string {
  const r = Math.random()
  if (r < 0.08) return 'new'
  if (r < 0.35) return 'excellent'
  if (r < 0.7) return 'good'
  if (r < 0.93) return 'used'
  return 'parts'
}

async function main() {
  console.log('Seed: начинаем')

  // 1. Боты
  for (const p of PERSONAS) {
    await db.user.upsert({
      where: { username: `bot_${p.id}` },
      update: {
        displayName: p.name, personaId: p.id, city: p.city,
        bio: `${p.job}, ${p.age} лет`,
      },
      create: {
        username: `bot_${p.id}`,
        displayName: p.name,
        isBot: true,
        personaId: p.id,
        city: p.city,
        bio: `${p.job}, ${p.age} лет`,
        balance: randInt(300_000, 1_500_000),
        ...(() => {
          const rc = randInt(20, 300)
          return { ratingCount: rc, ratingSum: Math.round(rc * (3.4 + Math.random() * 1.5)) }
        })(),
        lastSeenAt: new Date(Date.now() - randInt(0, 60) * 60_000),
      },
    })
  }
  console.log('Ботов:', await db.user.count({ where: { isBot: true } }))

  // 2. Индексы рынка
  const cats = [...new Set(CATALOG.map((i) => i.category))]
  for (const cat of cats) {
    await db.marketIndex.upsert({
      where: { category: cat },
      update: {},
      create: { category: cat, multiplier: 0.85 + Math.random() * 0.35 },
    })
  }
  console.log('Индексы:', await db.marketIndex.count())

  // 3. Стартовые события рынка
  if ((await db.marketEvent.count()) === 0) {
    await db.marketEvent.create({
      data: {
        category: 'phones', kind: 'demand_up', magnitude: 0.08,
        headline: 'iPhone снова в тренде: спрос на б/у смартфоны вырос',
        body: 'Покупатели охотнее расстаются с деньгами за свежие модели.',
        expiresAt: new Date(Date.now() + 5 * 3_600_000),
      },
    })
    await db.marketEvent.create({
      data: {
        category: 'books', kind: 'supply', magnitude: -0.12,
        headline: 'Дачники распродают библиотеки: книги дешевеют',
        body: 'Хорошее время пополнить полку почти даром.',
        expiresAt: new Date(Date.now() + 7 * 3_600_000),
      },
    })
  }

  // 4. Стартовые объявления ботов
  const bots = await db.user.findMany({ where: { isBot: true } })
  const existing = await db.listing.count()
  if (existing < 30) {
    const target = 48 - existing
    for (let i = 0; i < target; i++) {
      const bot = rnd(bots)
      const item = rnd(CATALOG.filter((c) => !c.key.startsWith('trash-')))
      const cond = conditionWeighted()
      const idx = await db.marketIndex.findUnique({ where: { category: item.category } })
      const mult = idx?.multiplier ?? 1
      const base = item.basePrice * (1 + (Math.random() - 0.5) * 2 * item.jitter)
      const price = Math.max(100, Math.round(base * (CONDITION_MULT[cond] ?? 0.8) * mult * (0.9 + Math.random() * 0.25)))
      await db.listing.create({
        data: {
          sellerId: bot.id, itemKey: item.key, title: item.title,
          description: rnd(item.desc), category: item.category, condition: cond,
          price, baseValue: item.basePrice,
          image: CATEGORY_IMAGE[item.category] ?? '/img/cat-electronics.jpg',
          city: bot.city, views: randInt(0, 120),
          createdAt: new Date(Date.now() - randInt(10, 4000) * 60_000),
        },
      })
    }
    console.log('Объявлений:', await db.listing.count())
  }

  // 5. Халява: пара объявлений «отдам даром»
  const freeActive = await db.listing.count({ where: { status: 'active', price: 0 } })
  const junk = CATALOG.filter((c) => c.key.startsWith('trash-'))
  for (let i = freeActive; i < 2 && junk.length; i++) {
    const bot = rnd(bots)
    const item = rnd(junk)
    await db.listing.create({
      data: {
        sellerId: bot.id, itemKey: item.key, title: item.title,
        description: `Отдам даром, самовывоз. ${rnd(item.desc)}`,
        category: item.category, condition: 'parts', price: 0,
        baseValue: item.basePrice,
        image: CATEGORY_IMAGE[item.category] ?? '/img/cat-electronics.jpg',
        city: bot.city, createdAt: new Date(Date.now() - randInt(2, 50) * 60_000),
      },
    })
  }

  // 6. Лоты аукциона
  const activeLots = await db.auctionLot.count({ where: { status: 'active' } })
  const valuable = CATALOG.filter((c) => c.basePrice >= 12_000)
  for (let i = activeLots; i < 2; i++) {
    const item = rnd(valuable)
    const cond = rnd(['excellent', 'good'])
    await db.auctionLot.create({
      data: {
        itemKey: item.key, title: item.title,
        image: CATEGORY_IMAGE[item.category] ?? '/img/cat-electronics.jpg',
        category: item.category, condition: cond, baseValue: item.basePrice,
        startPrice: Math.round(item.basePrice * (CONDITION_MULT[cond] ?? 1) * 0.55),
        endsAt: new Date(Date.now() + randInt(18, 50) * 60_000),
      },
    })
  }
  console.log('Лотов активно:', await db.auctionLot.count({ where: { status: 'active' } }))
  console.log('Seed готов')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
