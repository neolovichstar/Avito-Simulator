// Живой рынок: боты торгуют, конкурируют, покупают, аукцион, события дня.
// Запускается из instrumentation.ts в фоне (Node.js runtime).
import { db } from '@/lib/db'
import { CATALOG } from '@/lib/catalog-data'
import { PERSONAS } from '@/lib/personas-data'
import { CATEGORY_IMAGE, CONDITIONS, CONDITION_MULT, CATEGORY_LABEL } from '@/lib/catalog-types'
import { estValueFor, completeSale, deliverDue, notifyUser } from '@/lib/deals'
import { ensureDailyQuests } from '@/lib/quest-engine'
import { botOpener, winBackSweep } from '@/lib/chat-engine'
import { auctionStep } from '@/lib/economy'
import { emitTo } from '@/lib/realtime-emit'
import { onListingCreated, notifyPriceDrop } from '@/lib/market-hooks'
import { botComebackOffers } from '@/lib/price-war'
import { isBlocked } from '@/lib/blocked'
import { fireAutoBids, clearAutoBids } from '@/lib/autobid'
import { fmtMoney } from '@/lib/format'
import { cache } from '@/lib/cache'
import { DEPOSIT_RATE_PER_HOUR } from '@/lib/economy'
import { bumpStats, bumpQuests, checkAchievements } from '@/lib/deals'

const g = globalThis as unknown as {
  __avitoEngine?: { started: boolean; tick: number; lastSpecialDay?: string }
  __avitoNotifyCd?: Map<string, number>
}

// Кулдаун уведомлений одного типа про одно объявление — без него игрок
// получает серии одинаковых «Конкурент сбивает цену» на локскрин.
function notifyCooldown(key: string, ms: number): boolean {
  const m = (g.__avitoNotifyCd ??= new Map<string, number>())
  const now = Date.now()
  const last = m.get(key) ?? 0
  if (now - last < ms) return false
  if (m.size > 500) m.clear()
  m.set(key, now)
  return true
}

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}
function weightedCatalogItem() {
  const total = CATALOG.reduce((s, i) => s + (i.weight ?? 1), 0)
  let r = Math.random() * total
  for (const item of CATALOG) {
    r -= item.weight ?? 1
    if (r <= 0) return item
  }
  return CATALOG[0]
}

export async function getCategoryMult(category: string): Promise<number> {
  const idx = await db.marketIndex.findUnique({ where: { category } })
  const events = await db.marketEvent.findMany({
    where: { category, expiresAt: { gt: new Date() } },
  })
  const eventMult = events.reduce((m, e) => m * (1 + e.magnitude), 1)
  return (idx?.multiplier ?? 1) * eventMult
}

function conditionWeighted(): string {
  const r = Math.random()
  if (r < 0.08) return 'new'
  if (r < 0.35) return 'excellent'
  if (r < 0.7) return 'good'
  if (r < 0.93) return 'used'
  return 'parts'
}

async function randomBot() {
  const bots = await db.user.findMany({ where: { isBot: true }, take: 100 })
  return bots.length ? rnd(bots) : null
}

function catLabel(key: string): string {
  return CATEGORY_LABEL[key] ?? key
}

function personaOfId(personaId: string | null | undefined) {
  return PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0]
}

// ---------- РЫНОК ----------
async function marketTick(tick: number) {
  const cats = await db.marketIndex.findMany()
  if (!cats.length) return
  // случайное блуждание 2 категорий
  for (let i = 0; i < 2; i++) {
    const c = rnd(cats)
    const delta = (Math.random() - 0.5) * 0.04
    const mult = Math.min(1.75, Math.max(0.55, c.multiplier + delta))
    await db.marketIndex.update({ where: { category: c.category }, data: { multiplier: mult } })
  }
  // небольшие события каждые ~3 минуты
  if (tick % 12 === 0 && Math.random() < 0.35) {
    const c = rnd(cats)
    const up = Math.random() < 0.5
    const magnitude = 0.05 + Math.random() * 0.12
    const templates = up
      ? [
          `Спрос на «${catLabel(c.category)}» вырос: покупатели смели лучшие предложения`,
          `Аналитики: категория «${catLabel(c.category)}» недооценена, толпа ринулась скупать`,
        ]
      : [
          `На рынок выбросили партию товаров категории «${catLabel(c.category)}» — цены поехали вниз`,
          `Сезонный спад: «${catLabel(c.category)}» теряет в цене`,
        ]
    await db.marketEvent.create({
      data: {
        category: c.category, kind: up ? 'demand_up' : 'demand_down', magnitude: up ? magnitude : -magnitude,
        headline: rnd(templates), body: up ? 'Продавцы поднимают цены, покупатели торопятся.' : 'Выгодные покупки — у тех, кто умеет ждать.',
        expiresAt: new Date(Date.now() + randInt(2, 6) * 3_600_000),
      },
    })
  }
  // гаражные распродажи — отдельный цикл, примерно раз в 2 часа
  if (tick % 8 === 0 && Math.random() < 0.12) {
    await spawnGarageSale().catch((e) => console.error('[engine] garage:', e))
  }
  // ежедневное крупное событие
  await dailySpecial()
}

async function dailySpecial() {
  const today = new Date().toISOString().slice(0, 10)
  if (g.__avitoEngine?.lastSpecialDay === today) return
  const startOfDay = new Date(today + 'T00:00:00')
  const bigToday = await db.marketEvent.count({
    where: { createdAt: { gte: startOfDay }, magnitude: { gte: 0.2 } },
  })
  if (bigToday > 0) {
    if (g.__avitoEngine) g.__avitoEngine.lastSpecialDay = today
    return
  }
  const roll = Math.random()
  const cats = await db.marketIndex.findMany()
  if (!cats.length) return

  if (roll < 0.25) {
    // ОПУ-ШТОРМ
    const cat = rnd(['laptops', 'electronics'])
    const magnitude = 0.3 + Math.random() * 0.25
    await db.marketEvent.create({
      data: {
        category: cat, kind: 'opu', magnitude,
        headline: 'Нейросети скупили всю оперативную память — цены взлетели',
        body: 'Датацентры выкупают комплектующие под новые модели. Категория в дефиците, продавцы задирают ценники.',
        expiresAt: new Date(Date.now() + 12 * 3_600_000),
      },
    })
  } else if (roll < 0.45) {
    // НАЛОГОВАЯ ПРОВЕРКА
    const players = await db.user.findMany({ where: { isBot: false } })
    for (const p of players) {
      if (p.taxDebt > 0) {
        const penalty = Math.round(p.taxDebt * 0.2)
        await db.user.update({ where: { id: p.id }, data: { taxDebt: { increment: penalty } } })
        await db.taxBill.create({
          data: { userId: p.id, amount: penalty, reason: 'Пеня по итогам налоговой проверки', dueAt: new Date(Date.now() + 2 * 86_400_000) },
        })
        await notifyUser(p.id, 'tax', 'Налоговая проверка', `Обнаружена задолженность. Начислена пеня ${fmtMoney(penalty)}. Оплатите в приложении Налоги.`)
      } else {
        await db.user.update({ where: { id: p.id }, data: { balance: { increment: 1000 } } })
        await db.transaction.create({ data: { userId: p.id, type: 'sale', amount: 1000, note: 'Премия за честность (налоговая проверка)' } })
        await notifyUser(p.id, 'tax', 'Налоговая проверка', 'Проверка пройдена. Премия 1 000 ₽ за чистую декларацию.')
      }
    }
    await db.marketEvent.create({
      data: {
        category: 'all', kind: 'tax_raid', magnitude: 0,
        headline: 'Налоговая проводит массовую проверку продавцов', body: 'У кого долги по налогу — пеня. У кого порядок — премия.',
        expiresAt: new Date(Date.now() + 6 * 3_600_000),
      },
    })
  } else if (roll < 0.6) {
    // КРИЗИС
    for (const c of cats) {
      await db.marketEvent.create({
        data: {
          category: c.category, kind: 'crisis', magnitude: -(0.08 + Math.random() * 0.07),
          headline: 'Кризис перекупа: рынок остывает', body: 'Покупатели затаились, цены ползут вниз по всем категориям.',
          expiresAt: new Date(Date.now() + 6 * 3_600_000),
        },
      })
    }
  } else if (roll < 0.8) {
    // ТРЕНД
    const c = rnd(cats)
    await db.marketEvent.create({
      data: {
        category: c.category, kind: 'fashion', magnitude: 0.15 + Math.random() * 0.15,
        headline: `Блогеры подняли хайп: категория «${catLabel(c.category)}» на пике`, body: 'Мода непредсказуема, но кошелёк — предсказуемо тяжелее.',
        expiresAt: new Date(Date.now() + 10 * 3_600_000),
      },
    })
  } else if (roll < 0.9) {
    // ГАРАЖНАЯ РАСПРОДАЖА — гарантированная в ежедневном ролле
    await spawnGarageSale()
  } else {
    // ПОСТАВКИ
    const c = rnd(cats)
    await db.marketEvent.create({
      data: {
        category: c.category, kind: 'supply', magnitude: -(0.1 + Math.random() * 0.15),
        headline: `Фура с товаром пришла в срок: «${catLabel(c.category)}» дешевеет`, body: 'Поставки восстановлены, продавцы демпингуют.',
        expiresAt: new Date(Date.now() + 8 * 3_600_000),
      },
    })
  }
  if (g.__avitoEngine) g.__avitoEngine.lastSpecialDay = today
}

// Гаражная распродажа: пачка discounted-объявлений в двух категориях + новость
export async function spawnGarageSale() {
  const active = await db.marketEvent.findFirst({
    where: { kind: 'garage', expiresAt: { gt: new Date() } },
  })
  if (active) return // одна распродажа за раз
  const cats = await db.marketIndex.findMany()
  if (!cats.length) return
  const cityNames = ['Черёмушках', 'Ярославском шоссе', 'Гавриловой-Яме', 'Лиговке', 'Бутове', 'Уралмаше']
  const catA = rnd(cats)
  let catB = rnd(cats)
  if (catB.category === catA.category) catB = rnd(cats)
  const botsAll = await db.user.findMany({ where: { isBot: true }, take: 100 })
  if (!botsAll.length) return
  let spawned = 0
  for (const cat of [catA, catB]) {
    const mult = cat.multiplier
    const pool = CATALOG.filter((i) => i.category === cat.category && !i.key.startsWith('trash-'))
    const n = Math.min(pool.length, randInt(4, 6))
    for (let i = 0; i < n; i++) {
      const item = rnd(pool)
      const cond = conditionWeighted()
      const full = item.basePrice * (CONDITION_MULT[cond] ?? 0.8) * mult
      const price = Math.max(50, Math.round(full * (0.5 + Math.random() * 0.22)))
      const bot = rnd(botsAll)
      const created = await db.listing.create({
        data: {
          sellerId: bot.id, itemKey: item.key, title: item.title,
          description: `Гаражная распродажа, всё за полцены. ${rnd(item.desc)}`,
          category: item.category, condition: cond, price, baseValue: item.basePrice,
          image: CATEGORY_IMAGE[item.category] ?? '/img/cat-electronics.jpg',
          city: bot.city, createdAt: new Date(),
        },
      })
      await onListingCreated(created)
      spawned++
    }
  }
  await db.marketEvent.create({
    data: {
      category: catA.category, kind: 'garage', magnitude: 0,
      headline: `Гаражная распродажа в ${rnd(cityNames)}: ${spawned} лотов за полцены`,
      body: `Соседи выносят всё: «${catLabel(catA.category)}» и «${catLabel(catB.category)}» почти даром. Успей, пока не разобрали.`,
      expiresAt: new Date(Date.now() + 4 * 3_600_000),
    },
  })
  cache.invalidate('feed')
  // пуш всем живым игрокам
  const players = await db.user.findMany({ where: { isBot: false }, take: 100 })
  for (const p of players) {
    await notifyUser(
      p.id, 'market', 'Гаражная распродажа',
      `${spawned} товаров за полцены в категориях «${catLabel(catA.category)}» и «${catLabel(catB.category)}». Рынок не будет ждать.`,
    )
  }
}

// ---------- БОТЫ ----------
async function botsTick(tick: number) {
  const botCount = await db.user.count({ where: { isBot: true } })
  if (botCount === 0) return

  // 1. Выставляют новые объявления
  const active = await db.listing.count({ where: { status: 'active', seller: { isBot: true } } })
  const freeActive = await db.listing.count({ where: { status: 'active', price: 0 } })
  const want = Math.min(3, Math.max(0, 50 - active))
  for (let i = 0; i < want; i++) {
    const bot = await randomBot()
    if (!bot) break
    const item = weightedCatalogItem()
    const cond = conditionWeighted()
    const mult = await getCategoryMult(item.category)
    const persona = personaOfId(bot.personaId)
    const base = item.basePrice * (1 + (Math.random() - 0.5) * 2 * item.jitter)
    let price = Math.round(base * (CONDITION_MULT[cond] ?? 0.8) * mult * (0.86 + persona.greed * 0.3 + Math.random() * 0.15))
    const isJunk = item.key.startsWith('trash-') || item.basePrice < 500
    if (isJunk && freeActive < 3 && Math.random() < 0.4) {
      price = 0
    }
    if (!isJunk && price < 100) price = 100
    const created = await db.listing.create({
      data: {
        sellerId: bot.id, itemKey: item.key, title: item.title,
        description: rnd(item.desc), category: item.category, condition: cond,
        price, baseValue: item.basePrice, image: CATEGORY_IMAGE[item.category] ?? '/img/cat-electronics.jpg',
        city: bot.city,
        createdAt: new Date(Date.now() - randInt(0, 90) * 60_000),
      },
    })
    await onListingCreated(created)
  }

  // 2. Конкуренция: продавцы одного товара сбивают цену друг другу
  if (tick % 4 === 0) {
    const actives = await db.listing.findMany({
      where: { status: 'active' },
      include: { seller: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    const groups = new Map<string, typeof actives>()
    for (const l of actives) {
      const arr = groups.get(l.itemKey) ?? []
      arr.push(l)
      groups.set(l.itemKey, arr)
    }
    for (const [, list] of groups) {
      if (list.length < 2) continue
      const sorted = [...list].sort((a, b) => a.price - b.price)
      const cheapest = sorted[0]
      const overpriced = sorted[sorted.length - 1]
      if (overpriced.price <= cheapest.price) continue
      if (overpriced.sellerId === cheapest.sellerId) continue
      if (Date.now() - overpriced.createdAt.getTime() < 10 * 60_000) continue
      if (Math.random() > 0.5) continue
      const newPrice = Math.round(overpriced.price * (1 - 0.04 - Math.random() * 0.05))
      if (newPrice <= cheapest.price || newPrice < 50) continue
      if (overpriced.seller.isBot) {
        const oldPrice = overpriced.price
        await db.listing.update({ where: { id: overpriced.id }, data: { price: newPrice } })
        await notifyPriceDrop({ id: overpriced.id, sellerId: overpriced.sellerId, title: overpriced.title, price: newPrice }, oldPrice)
      } else {
        // игроку — только уведомление, что конкурент давит
        const rivalBot = sorted.find((l) => l.seller.isBot && l.sellerId !== overpriced.sellerId)
        if (rivalBot && Math.random() < 0.6) {
          const rp = Math.round(rivalBot.price * (1 - 0.04 - Math.random() * 0.05))
          if (rp > cheapest.price && rp >= 50) {
            const rivalOld = rivalBot.price
            await db.listing.update({ where: { id: rivalBot.id }, data: { price: rp } })
            await notifyPriceDrop({ id: rivalBot.id, sellerId: rivalBot.sellerId, title: rivalBot.title, price: rp }, rivalOld)
          }
          // не чаще раза в 30 минут на одно объявление — иначе спам на локскрине
          if (notifyCooldown(`compete:${overpriced.id}`, 30 * 60_000)) {
            await notifyUser(
              overpriced.sellerId, 'market', 'Конкурент сбивает цену',
              `Такой же «${overpriced.title}» уже продают за ${fmtMoney(Math.min(rp, cheapest.price))}. Покупатели уходят к нему — подумайте о цене.`,
            )
          }
        }
      }
    }
  }

  // 3. Скидки на залежалый товар
  if (tick % 6 === 0) {
    const stale = await db.listing.findMany({
      where: {
        status: 'active', createdAt: { lt: new Date(Date.now() - 2 * 3_600_000) },
        price: { gt: 0 }, seller: { isBot: true },
      },
      take: 6, orderBy: { createdAt: 'asc' },
    })
    for (const l of stale) {
      if (Math.random() < 0.5) continue
      const newPrice = Math.round(l.price * 0.95)
      const floor = Math.round(l.baseValue * 0.35)
      if (newPrice < floor) continue
      const oldPrice = l.price
      await db.listing.update({ where: { id: l.id }, data: { price: newPrice } })
      await notifyPriceDrop({ id: l.id, sellerId: l.sellerId, title: l.title, price: newPrice }, oldPrice)
    }
  }

  // 4. Боты скупают выгодное
  if (tick % 3 === 0) {
    const cats = await db.marketIndex.findMany()
    const allActive = await db.listing.findMany({
      where: { status: 'active', price: { gt: 0 } },
      include: { seller: true },
      orderBy: { createdAt: 'asc' }, take: 60,
    })
    for (const l of allActive) {
      if (Math.random() < 0.85) continue
      const idxMult = (cats.find((c) => c.category === l.category)?.multiplier ?? 1) * (CONDITION_MULT[l.condition] ?? 0.8)
      const est = l.baseValue * idxMult
      if (l.price > est * 0.82) continue
      const bot = await randomBot()
      if (!bot || bot.id === l.sellerId) continue
      await completeSale({ listingId: l.id, buyer: bot, price: l.price, via: 'engine' })
      break // максимум одна движка-покупка за тик
    }
  }

  // 5. Боты забирают халяву
  const freebies = await db.listing.findMany({
    where: { status: 'active', price: 0 },
    include: { seller: true }, take: 3,
  })
  for (const f of freebies) {
    if (Math.random() < 0.6) {
      const bot = await randomBot()
      if (bot && bot.id !== f.sellerId) {
        await completeSale({ listingId: f.id, buyer: bot, price: 0, via: 'engine' })
      }
    }
  }

  // 6. Боты стучатся к игрокам в чат
  if (tick % 2 === 0) {
    const playerListings = await db.listing.findMany({
      where: { status: 'active', seller: { isBot: false }, createdAt: { lt: new Date(Date.now() - 3 * 60_000) } },
      take: 10, orderBy: { createdAt: 'desc' },
    })
    for (const pl of playerListings) {
      if (Math.random() > 0.22) continue
      const existing = await db.chat.findMany({ where: { listingId: pl.id, sellerId: pl.sellerId } })
      const botChats = existing.filter((c) => c.buyerId !== pl.sellerId)
      if (botChats.length >= 2) continue
      const bot = await randomBot()
      if (!bot) continue
      // игрок заблокировал этого бота — продавец не обязан его слушать
      if (await isBlocked(pl.sellerId, bot.id)) continue
      const meta = { botRole: 'buyer' as const, botLimit: Math.round(pl.price * (1 - 0.05 - Math.random() * 0.12)), rounds: 0 }
      const chat = await db.chat.create({
        data: { listingId: pl.id, buyerId: bot.id, sellerId: pl.sellerId, meta: JSON.stringify(meta) },
      })
      const opener = botOpener(chat, pl, bot)
      const m = await db.message.create({
        data: {
          chatId: chat.id, senderType: 'bot', senderId: bot.id, senderName: bot.displayName,
          kind: 'text', text: opener.text,
        },
      })
      await db.notification.create({
        data: { userId: pl.sellerId, kind: 'message', title: bot.displayName, body: m.text.slice(0, 80) },
      })
      await emitTo(`user:${pl.sellerId}`, 'notify', {
        id: `local_${m.id}`, kind: 'message', title: bot.displayName, body: m.text.slice(0, 80), readAt: null, createdAt: m.createdAt.toISOString(),
      })
      break
    }
  }
  // 7. Боты возвращаются в чат со скидкой (после паузы в торге)
  if (tick % 3 === 0) {
    await botComebackOffers()
  }
}

// ---------- АУКЦИОН ----------
async function auctionTick(tick: number) {
  const activeLots = await db.auctionLot.findMany({ where: { status: 'active' } })

  // создать лоты
  const valuable = CATALOG.filter((i) => i.basePrice >= 12_000)
  if (activeLots.length < 3 && Math.random() < 0.18 && valuable.length) {
    const item = rnd(valuable)
    const cond = Math.random() < 0.5 ? 'excellent' : 'good'
    const mult = await getCategoryMult(item.category)
    const est = Math.round(item.basePrice * (CONDITION_MULT[cond] ?? 1) * mult)
    await db.auctionLot.create({
      data: {
        itemKey: item.key, title: item.title, image: CATEGORY_IMAGE[item.category] ?? '/img/cat-electronics.jpg',
        category: item.category, condition: cond, baseValue: item.basePrice,
        startPrice: Math.round(est * (0.5 + Math.random() * 0.2)),
        endsAt: new Date(Date.now() + randInt(15, 45) * 60_000),
      },
    })
  }

  // ставки ботов
  if (tick % 2 === 0) {
    for (const lot of activeLots) {
      const msLeft = lot.endsAt.getTime() - Date.now()
      // обычные ставки — пока до конца > 30с; в финальном окне боты снайпят редко (драма финала)
      if (msLeft < 30_000 && Math.random() > 0.25) continue
      if (Math.random() > 0.3) continue
      const step = auctionStep(lot.startPrice)
      const mult = await getCategoryMult(lot.category)
      const est = Math.round(lot.baseValue * (CONDITION_MULT[lot.condition] ?? 1) * mult)
      const privateLimit = Math.round(est * (0.85 + Math.random() * 0.5))
      const nextBid = (lot.currentBid ?? lot.startPrice) + step
      if (nextBid > privateLimit) continue
      // перебить
      const prevBidderId = lot.currentBidderId
      const bot = await randomBot()
      if (!bot) continue
      if (bot.id === prevBidderId) continue
      // анти-снайпинг (как у игрока): ставка в последнюю минуту продлевает торги до 30с
      const extended = msLeft < 60_000
      await db.auctionBid.create({
        data: { lotId: lot.id, userId: bot.id, userName: bot.displayName, amount: nextBid },
      })
      await db.auctionLot.update({
        where: { id: lot.id },
        data: {
          currentBid: nextBid, currentBidderId: bot.id, currentBidderName: bot.displayName,
          bidCount: { increment: 1 },
          ...(extended ? { endsAt: new Date(Date.now() + 30_000) } : {}),
        },
      })
      // вернуть деньги игроку, которого перебили
      if (prevBidderId) {
        const prev = await db.user.findUnique({ where: { id: prevBidderId } })
        if (prev && !prev.isBot && lot.currentBid) {
          await db.user.update({ where: { id: prev.id }, data: { balance: { increment: lot.currentBid } } })
          await notifyUser(prev.id, 'market', 'Вас перебили на аукционе', `Лот «${lot.title}» уходит за ${fmtMoney(nextBid)}. Ставка возвращена на счёт.`)
        }
      }
      await emitTo('global', 'auction:update', { lotId: lot.id, extended })
      // автоставки игроков могут сразу перебить бота (прокси-торг)
      await fireAutoBids(lot.id)
    }
  }

  // завершение
  const due = await db.auctionLot.findMany({
    where: { status: 'active', endsAt: { lte: new Date() } },
  })
  for (const lot of due) {
    if (!lot.currentBidderId || !lot.currentBid) {
      await db.auctionLot.update({ where: { id: lot.id }, data: { status: 'cancelled', finishedAt: new Date() } })
      await clearAutoBids(lot.id)
      continue
    }
    const winner = await db.user.findUnique({ where: { id: lot.currentBidderId } })
    if (!winner) continue
    if (!winner.isBot) {
      await db.transaction.create({
        data: { userId: winner.id, type: 'purchase', amount: -lot.currentBid, note: `Аукцион: ${lot.title}` },
      })
      await notifyUser(winner.id, 'deal', 'Вы выиграли аукцион', `«${lot.title}» за ${fmtMoney(lot.currentBid)} уже в инвентаре`)
      await bumpStats(winner.id, { auctionWins: 1 })
      await bumpQuests(winner.id, 'auction_win')
      await checkAchievements(winner.id)
    } else {
      await db.user.update({ where: { id: winner.id }, data: { balance: { decrement: lot.currentBid } } })
    }
    const item = await db.item.create({
      data: {
        ownerId: winner.id, itemKey: lot.itemKey, title: lot.title, category: lot.category,
        condition: lot.condition, image: lot.image, baseValue: lot.baseValue,
        purchasePrice: lot.currentBid, fromUserId: null,
      },
    })
    await db.auctionLot.update({ where: { id: lot.id }, data: { status: 'finished', finishedAt: new Date() } })
    await clearAutoBids(lot.id)
    await emitTo('global', 'auction:update', { lotId: lot.id, finished: true })
  }
}

// ---------- ФИНАНСЫ ----------
async function financeTick() {
  // проценты по вкладам
  const users = await db.user.findMany({
    where: { deposit: { gt: 0 }, depositAt: { lt: new Date(Date.now() - 3_600_000) } },
    take: 50,
  })
  for (const u of users) {
    if (!u.depositAt) continue
    const hours = Math.floor((Date.now() - u.depositAt.getTime()) / 3_600_000)
    if (hours < 1) continue
    const interest = Math.round(u.deposit * DEPOSIT_RATE_PER_HOUR * hours)
    if (interest <= 0) continue
    await db.user.update({
      where: { id: u.id },
      data: { deposit: { increment: interest }, depositAt: new Date(u.depositAt.getTime() + hours * 3_600_000) },
    })
    if (!u.isBot) {
      await db.transaction.create({ data: { userId: u.id, type: 'interest', amount: interest, note: `Проценты по вкладу (${hours} ч.)` } })
    }
  }
  // пеня по налогам
  const debtors = await db.user.findMany({
    where: { isBot: false, taxDebt: { gt: 0 }, taxPenaltyAt: { lt: new Date(Date.now() - 86_400_000) } },
  })
  for (const u of debtors) {
    const penalty = Math.round(u.taxDebt * 0.1)
    await db.user.update({
      where: { id: u.id },
      data: { taxDebt: { increment: penalty }, taxPenaltyAt: new Date() },
    })
    await db.taxBill.create({
      data: { userId: u.id, amount: penalty, reason: 'Пеня 10% за просрочку налога', dueAt: new Date(Date.now() + 86_400_000) },
    })
    await notifyUser(u.id, 'tax', 'Пеня налоговой', `Начислена пеня ${fmtMoney(penalty)}. Задолженность растёт каждый день.`)
  }
  // просроченные кредиты
  const overdue = await db.loan.findMany({ where: { status: 'active', dueAt: { lt: new Date() } } })
  for (const l of overdue) {
    await db.loan.update({ where: { id: l.id }, data: { status: 'overdue' } })
    const owner = await db.user.findUnique({ where: { id: l.userId } })
    if (owner && !owner.isBot) {
      const newScore = Math.max(300, owner.creditScore - 80)
      await db.user.update({ where: { id: owner.id }, data: { creditScore: newScore } })
      await notifyUser(l.userId, 'system', 'Кредит просрочен', `Банк ждёт погашения. Кредитный рейтинг упал до ${newScore} — лимит срезан, ставка выросла. Покупки ограничены при долге свыше 30 000 ₽.`)
    } else {
      await notifyUser(l.userId, 'system', 'Кредит просрочен', 'Банк ждёт погашения. Покупки ограничены при долге свыше 30 000 ₽.')
    }
  }
}

// ---------- ПРОЧЕЕ ----------
async function repairTick() {
  const ready = await db.repairOrder.findMany({
    where: { status: 'in_progress', readyAt: { lte: new Date() } }, take: 20,
  })
  for (const r of ready) {
    await db.repairOrder.update({ where: { id: r.id }, data: { status: 'ready' } })
    await notifyUser(r.userId, 'system', 'Ремонт завершён', 'Ваш товар готов — заберите в сервисе.')
  }
}

async function deliveryTick() {
  await deliverDue()
}

async function presenceTick() {
  const bots = await db.user.findMany({ where: { isBot: true }, take: 200 })
  const n = randInt(4, 9)
  for (let i = 0; i < n && bots.length; i++) {
    const b = rnd(bots)
    await db.user.update({ where: { id: b.id }, data: { lastSeenAt: new Date() } })
  }
  // боты должны быть платёжеспособны
  const poor = await db.user.findMany({ where: { isBot: true, balance: { lt: 60_000 } }, take: 5 })
  for (const p of poor) {
    await db.user.update({ where: { id: p.id }, data: { balance: { increment: 200_000 } } })
  }
}

export async function tickAll() {
  if (!g.__avitoEngine) return
  g.__avitoEngine.tick++
  const tick = g.__avitoEngine.tick
  try {
    await marketTick(tick)
    await botsTick(tick)
    await auctionTick(tick)
    await deliveryTick()
    await repairTick()
    if (tick % 4 === 0) await financeTick()
    if (tick % 4 === 0) await winBackSweep()
    await presenceTick()
    if (tick % 8 === 0) await ensureDailyQuestsAll()
  } catch (e) {
    console.error('[engine] tick error:', e)
  }
}

// задания генерим всем активным игрокам
async function ensureDailyQuestsAll() {
  const players = await db.user.findMany({ where: { isBot: false }, take: 100 })
  for (const p of players) {
    await ensureDailyQuests(p.id)
  }
}

export function startEngine() {
  if (g.__avitoEngine?.started) return
  g.__avitoEngine = { started: true, tick: 0 }
  console.log('[engine] живой рынок запущен')
  // первичная инициализация индексов
  db.marketIndex.count().then(async (c) => {
    if (c === 0) {
      const cats = [...new Set(CATALOG.map((i) => i.category))]
      for (const cat of cats) {
        await db.marketIndex.create({ data: { category: cat, multiplier: 0.85 + Math.random() * 0.35 } })
      }
      console.log('[engine] индексы рынка созданы:', cats.length)
    }
  }).catch(() => {})
  const timer = setInterval(() => {
    tickAll().catch((e) => console.error('[engine] fatal:', e))
  }, 15_000)
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
}
