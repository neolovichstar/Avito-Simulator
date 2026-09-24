// Ядро сделок: покупки, налоги, инвентарь, квесты, ачивки, уведомления.
// Используется и API-роутами, и движком ботов.
import { db } from '@/lib/db'
import { emitTo } from '@/lib/realtime-emit'
import { TAX_RATE, DELIVERY_FEE, courierDefectChance, deliveryEtaSeconds, nextCondition, levelFromXp } from '@/lib/economy'
import { achievedIds, ACHIEVEMENTS, parseStats, defaultStats, type PlayerStats, type QuestKind } from '@/lib/quests'
import { PERSONAS } from '@/lib/personas-data'
import { CONDITION_ORDER } from '@/lib/economy'
import { cache } from '@/lib/cache'
import { fmtMoney } from '@/lib/format'
import type { User } from '@prisma/client'

export async function notifyUser(userId: string, kind: string, title: string, body: string) {
  const n = await db.notification.create({
    data: { userId, kind, title, body },
  })
  await emitTo(`user:${userId}`, 'notify', {
    id: n.id, kind: n.kind, title: n.title, body: n.body, readAt: null, createdAt: n.createdAt.toISOString(),
  })
  // дубль в Telegram-бот (fire-and-forget, не блокирует игру)
  void import('@/lib/telegram-notify').then((m) =>
    m.telegramNotify(userId, `${n.title}\n${n.body}`).catch(() => {}),
  )
  return n
}

export async function addXp(userId: string, xp: number): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return 0
  const newXp = user.xp + xp
  // единая формула уровня (economy.levelFromXp) — та же, что в Карьере и Лидерах,
  // иначе уровень в БД расходился с интерфейсом
  const level = levelFromXp(newXp)
  await db.user.update({ where: { id: userId }, data: { xp: newXp, level } })
  if (level > user.level) {
    await notifyUser(userId, 'system', 'Новый уровень', `Вы достигли ${level} уровня. Лимит кредита повышен.`)
  }
  return newXp
}

export async function bumpStats(userId: string, patch: Partial<PlayerStats>): Promise<PlayerStats> {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return defaultStats()
  const stats = { ...parseStats(user.stats) }
  for (const [k, v] of Object.entries(patch)) {
    stats[k as keyof PlayerStats] = (stats[k as keyof PlayerStats] ?? 0) + (v ?? 0)
  }
  await db.user.update({ where: { id: userId }, data: { stats: JSON.stringify(stats) } })
  return stats
}

export async function bumpQuests(userId: string, kind: QuestKind, delta = 1) {
  await db.quest.updateMany({
    where: { userId, kind, claimed: false },
    data: { progress: { increment: delta } },
  })
}

export async function checkAchievements(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || user.isBot) return
  const stats = parseStats(user.stats)
  const inventoryCount = await db.item.count({ where: { ownerId: userId } })
  const nowHave = new Set<string>(JSON.parse(user.achievements || '[]') as string[])
  const should = new Set(achievedIds(stats, user.level, user.balance, inventoryCount))
  const unlocked = ACHIEVEMENTS.filter((a) => should.has(a.id) && !nowHave.has(a.id))
  if (!unlocked.length) return
  const ids = [...nowHave, ...unlocked.map((a) => a.id)]
  const reward = unlocked.reduce((s, a) => s + a.reward, 0)
  await db.user.update({
    where: { id: userId },
    data: { achievements: JSON.stringify(ids), balance: { increment: reward } },
  })
  await db.transaction.create({
    data: { userId, type: 'sale', amount: reward, note: `Достижения: ${unlocked.map((a) => a.title).join(', ')}` },
  })
  for (const a of unlocked) {
    await notifyUser(userId, 'system', `Достижение: ${a.title}`, `${a.desc}. Награда ${fmtMoney(a.reward)}`)
  }
  await bumpStats(userId, { })
}

function personaTrust(personaId: string | null): number {
  const p = PERSONAS.find((x) => x.id === personaId)
  return p?.trust ?? 0.5
}

export interface SaleResult {
  ok: boolean
  error?: string
  itemId?: string
  deliveryId?: string
  downgraded?: boolean
}

export async function completeSale(opts: {
  listingId: string
  buyer: User
  price: number
  via: 'buy' | 'chat' | 'engine'
  courier?: boolean
  chatId?: string
}): Promise<SaleResult> {
  const listing = await db.listing.findUnique({ where: { id: opts.listingId } })
  if (!listing || listing.status !== 'active') {
    return { ok: false, error: 'Товар уже продан или снят с продажи' }
  }
  const seller = await db.user.findUnique({ where: { id: listing.sellerId } })
  if (!seller) return { ok: false, error: 'Продавец не найден' }
  if (seller.id === opts.buyer.id) return { ok: false, error: 'Нельзя купить свой товар' }
  const price = Math.max(0, Math.round(opts.price))
  if (!opts.buyer.isBot && opts.buyer.balance < price) {
    return { ok: false, error: 'Недостаточно средств на счету' }
  }
  if (!opts.buyer.isBot && opts.buyer.debt > 30_000) {
    return { ok: false, error: 'Сначала погасите кредит в банке' }
  }

  // двигаем деньги
  await db.user.update({ where: { id: opts.buyer.id }, data: { balance: { decrement: price } } })
  await db.user.update({ where: { id: seller.id }, data: { balance: { increment: price } } })
  await db.listing.update({
    where: { id: listing.id },
    data: { status: 'sold', soldAt: new Date() },
  })

  // налог с продавца-игрока
  if (!seller.isBot && price > 0) {
    const tax = Math.round(price * TAX_RATE)
    await db.user.update({ where: { id: seller.id }, data: { taxDebt: { increment: tax } } })
    await db.taxBill.create({
      data: {
        userId: seller.id, amount: tax, reason: `Налог 4%: продажа «${listing.title}»`,
        dueAt: new Date(Date.now() + 3 * 86_400_000),
      },
    })
  }

  // транзакции
  if (!opts.buyer.isBot && price > 0) {
    await db.transaction.create({
      data: {
        userId: opts.buyer.id, type: 'purchase', amount: -price,
        counterpartyId: seller.id, counterpartyName: seller.displayName,
        listingId: listing.id, note: listing.title,
      },
    })
  }
  if (!seller.isBot && price > 0) {
    await db.transaction.create({
      data: {
        userId: seller.id, type: 'sale', amount: price,
        counterpartyId: opts.buyer.id, counterpartyName: opts.buyer.displayName,
        listingId: listing.id, note: listing.title,
      },
    })
  }

  // инвентарь / доставка
  let itemId: string | undefined
  let deliveryId: string | undefined
  let downgraded = false
  const buyerIsPlayer = !opts.buyer.isBot

  if (buyerIsPlayer || opts.buyer.isBot) {
    if (listing.itemId) {
      // передача существующей вещи игрока-продавца
      await db.item.update({ where: { id: listing.itemId }, data: { ownerId: opts.buyer.id } })
      itemId = listing.itemId
    }
  }
  if (!itemId) {
    if (opts.courier && buyerIsPlayer) {
      const defect = Math.random() < courierDefectChance(personaTrust(seller.personaId))
      const realCond = defect
        ? CONDITION_ORDER[Math.max(0, CONDITION_ORDER.indexOf(listing.condition) - 1)]
        : listing.condition
      downgraded = defect
      const d = await db.delivery.create({
        data: {
          userId: opts.buyer.id, listingId: listing.id, title: listing.title, image: listing.image,
          price: price + DELIVERY_FEE, itemKey: listing.itemKey, category: listing.category,
          listedCondition: listing.condition, realCondition: realCond, baseValue: listing.baseValue,
          courier: ['Пони-Экспресс', 'Синяя Точка', 'Сделка Доставка', 'Курьер Сразу'][Math.floor(Math.random() * 4)],
          eta: new Date(Date.now() + deliveryEtaSeconds() * 1000),
        },
      })
      deliveryId = d.id
    } else if (buyerIsPlayer || opts.buyer.isBot) {
      const item = await db.item.create({
        data: {
          ownerId: opts.buyer.id, itemKey: listing.itemKey, title: listing.title,
          category: listing.category, condition: listing.condition, image: listing.image,
          baseValue: listing.baseValue, purchasePrice: price, fromUserId: seller.id,
        },
      })
      itemId = item.id
    }
  }

  // статистика, квесты, ачивки
  const estVal = Math.round(listing.baseValue)
  // ночные сделки (00:00–05:59) и крупные сделки (100k+) — секретные ачивки
  const hourNow = new Date().getHours()
  const nightNow = hourNow < 6
  const bigNow = price >= 100_000
  if (buyerIsPlayer) {
    const patch: Partial<PlayerStats> = {
      dealsBuy: 1, dealsTotal: 1, spent: price,
      ...(opts.courier ? { courierBuys: 1 } : {}),
      ...(price > 0 && price <= estVal * 0.7 ? { bargains: 1 } : {}),
      ...(opts.via === 'chat' && price <= listing.price * 0.95 ? { haggles: 1 } : {}),
      ...(nightNow ? { nightDeals: 1 } : {}),
      ...(bigNow ? { bigDeals: 1 } : {}),
    }
    await bumpStats(opts.buyer.id, patch)
    await bumpQuests(opts.buyer.id, 'buy')
    await bumpQuests(opts.buyer.id, 'spend', price)
    if (opts.courier) await bumpQuests(opts.buyer.id, 'courier')
    if (price === 0) await bumpQuests(opts.buyer.id, 'free')
    await addXp(opts.buyer.id, Math.max(10, Math.round(price * 0.004)))
    await checkAchievements(opts.buyer.id)
  } else if (opts.buyer.isBot) {
    // боты тоже растут в опыте — лидерборды живут своей жизнью
    await addXp(opts.buyer.id, Math.max(6, Math.round(price * 0.002)))
  }
  if (!seller.isBot) {
    let profitDelta = price
    if (listing.itemId) {
      const soldItem = await db.item.findUnique({ where: { id: listing.itemId } })
      if (soldItem) profitDelta = price - soldItem.purchasePrice
    }
    await bumpStats(seller.id, {
      dealsSell: 1, dealsTotal: 1, profit: Math.max(0, profitDelta),
      ...(nightNow ? { nightDeals: 1 } : {}),
      ...(bigNow ? { bigDeals: 1 } : {}),
    })
    await bumpQuests(seller.id, 'sell')
    if (profitDelta > 0) await bumpQuests(seller.id, 'profit', profitDelta)
    await addXp(seller.id, Math.max(10, Math.round(price * 0.004)))
    await checkAchievements(seller.id)
  } else if (seller.isBot) {
    // XP ботам-продавцам: рейтинг площадки меняется в реальном времени
    await addXp(seller.id, Math.max(6, Math.round(price * 0.002)))
  }

  // авто-отзыв от бота-покупателя
  if (opts.buyer.isBot && !seller.isBot && price > 0 && Math.random() < 0.4) {
    const persona = PERSONAS.find((p) => p.id === opts.buyer.personaId)
    const texts = [
      'всё отлично, товар как в описании, спасибо',
      'сделкой доволен, рекомендую',
      'нормально продал, забрал быстро. 5',
      'спасибо, всё чётко',
      'всё супер, но ждать пришлось долго',
    ]
    const rating = Math.random() < 0.75 ? 5 : 4
    await db.review.create({
      data: {
        listingId: listing.id, fromUserId: opts.buyer.id, toUserId: seller.id,
        rating, text: texts[Math.floor(Math.random() * texts.length)] || persona?.phrases[0] || 'спасибо',
      },
    })
    await db.user.update({
      where: { id: seller.id },
      data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } },
    })
  }

  // системное сообщение в чате
  if (opts.chatId) {
    const sys = await db.message.create({
      data: {
        chatId: opts.chatId, senderType: 'system', senderId: 'system', senderName: 'Система',
        kind: 'system', text: `Сделка состоялась: «${listing.title}» за ${fmtMoney(price)}`,
      },
    })
    await db.chat.update({ where: { id: opts.chatId }, data: { lastMessageAt: new Date() } })
    await emitTo(`chat:${opts.chatId}`, 'chat:message', {
      chatId: opts.chatId,
      message: {
        id: sys.id, senderType: 'system', senderId: 'system', senderName: 'Система',
        kind: 'system', text: sys.text, amount: null, invoiceId: null, paid: null,
        createdAt: sys.createdAt.toISOString(), mine: false,
      },
    })
  }

  // уведомления
  if (buyerIsPlayer) {
    await notifyUser(
      opts.buyer.id, 'deal',
      opts.courier ? 'Товар отправлен курьером' : 'Покупка совершена',
      opts.courier
        ? `«${listing.title}» уже в пути. Отслеживайте в приложении Доставки`
        : `«${listing.title}» за ${fmtMoney(price)} — теперь в вашем инвентаре`,
    )
    await emitTo(`user:${opts.buyer.id}`, 'deal', { title: listing.title, price, role: 'buyer' })
  }
  if (!seller.isBot) {
    await notifyUser(
      seller.id, 'deal', 'Продажа совершена',
      `«${listing.title}» продан за ${fmtMoney(price)}`,
    )
    await emitTo(`user:${seller.id}`, 'deal', { title: listing.title, price, role: 'seller' })
  }

  cache.invalidate('feed')
  return { ok: true, itemId, deliveryId, downgraded }
}

// Доставка: выдать товар из-под курьера
export async function deliverDue(): Promise<number> {
  const due = await db.delivery.findMany({
    where: { status: 'in_transit', eta: { lte: new Date() } },
    take: 10,
  })
  for (const d of due) {
    await db.item.create({
      data: {
        ownerId: d.userId, itemKey: d.itemKey, title: d.title, category: d.category,
        condition: d.realCondition, image: d.image, baseValue: d.baseValue,
        purchasePrice: d.price, fromUserId: null,
      },
    })
    await db.delivery.update({
      where: { id: d.id },
      data: { status: 'delivered', deliveredAt: new Date() },
    })
    const worse = CONDITION_ORDER.indexOf(d.realCondition) < CONDITION_ORDER.indexOf(d.listedCondition)
    await notifyUser(
      d.userId, 'deal',
      'Доставка прибыла',
      worse
        ? `«${d.title}» доставлен. Осторожно: состояние хуже, чем было в объявлении`
        : `«${d.title}» доставлен. Состояние как в описании`,
    )
  }
  return due.length
}

// Условная рыночная оценка с учётом состояния
export function estValueFor(baseValue: number, condition: string): number {
  const mult: Record<string, number> = { new: 1.18, excellent: 1.0, good: 0.82, used: 0.6, parts: 0.28 }
  return Math.round(baseValue * (mult[condition] ?? 0.8))
}

export { nextCondition }
