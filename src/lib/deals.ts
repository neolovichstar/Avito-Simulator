// Ядро сделок: покупки, налоги, инвентарь, квесты, ачивки, уведомления.
// Используется и API-роутами, и движком ботов.
// Логистика (28-b): покупки игроков идут через доставку («Собираем» → «В пути» → «Прибыл» →
// игрок забирает), продажи игроков — через курьера (деньги после вручения). Боты живут по-старому.
import { db } from '@/lib/db'
import { emitTo } from '@/lib/realtime-emit'
import {
  TAX_RATE, DELIVERY_FEE, courierDefectChance, nextCondition, levelFromXp,
  collectSecondsFor, pickupSecondsFor, deliveryTransitSeconds, deliveryEtaFor,
  RETURN_COMMISSION, PICKUP_WINDOW_MS,
} from '@/lib/economy'
import { achievedIds, ACHIEVEMENTS, parseStats, defaultStats, type PlayerStats, type QuestKind } from '@/lib/quests'
import { PERSONAS } from '@/lib/personas-data'
import { CONDITION_ORDER } from '@/lib/economy'
import { cache } from '@/lib/cache'
import { fmtMoney } from '@/lib/format'
import type { User } from '@prisma/client'

export type DeliveryMode = 'courier' | 'pickup' | 'chat'
export type DeliveryKind = 'purchase' | 'sale'
export type DeliveryStatus = 'collecting' | 'in_transit' | 'arrived' | 'delivered' | 'returned'

export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = ['collecting', 'in_transit', 'arrived']

const COURIERS = ['Пони-Экспресс', 'Синяя Точка', 'Resale Доставка', 'Курьер Сразу']

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
  /** легаси-флаг: courier=true ⇔ mode 'courier'. Новые вызовы передают mode. */
  courier?: boolean
  /** способ получения: курьер / самовывоз / счёт в чате (дистанционно, без сбора) */
  mode?: DeliveryMode
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
  const mode: DeliveryMode = opts.mode ?? (opts.courier ? 'courier' : 'pickup')

  // двигаем деньги
  await db.user.update({ where: { id: opts.buyer.id }, data: { balance: { decrement: price } } })
  // деньги продавца — эскроу: игрок получает их после вручения (см. settleSaleDelivery),
  // боты-продавцы, как и раньше, сразу
  if (seller.isBot) {
    await db.user.update({ where: { id: seller.id }, data: { balance: { increment: price } } })
  }
  await db.listing.update({
    where: { id: listing.id },
    data: { status: 'sold', soldAt: new Date() },
  })

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
  // транзакция/налог продажи игрока переезжают в момент выплаты (settleSaleDelivery)

  // инвентарь / доставка
  // Вещь уходит у продавца сразу (владелец → покупатель), но у покупателя она появится
  // в инвентаре только после получения посылки (pickupDelivery): инвентарь прячет вещи
  // под активной доставкой (см. /api/inventory).
  let itemId: string | undefined
  let deliveryId: string | undefined
  let downgraded = false
  const buyerIsPlayer = !opts.buyer.isBot

  if (listing.itemId) {
    await db.item.update({ where: { id: listing.itemId }, data: { ownerId: opts.buyer.id } })
    itemId = listing.itemId
  }

  if (buyerIsPlayer) {
    // ПОСЫЛКА покупателя: «Собираем» → «В пути» → «Прибыл» → игрок забирает.
    // Дефект возможен только у дистанционных покупок у ботов (осмотр на самовывозе исключён).
    const defect = !itemId && mode !== 'pickup' && Math.random() < courierDefectChance(personaTrust(seller.personaId))
    const realCond = defect
      ? CONDITION_ORDER[Math.max(0, CONDITION_ORDER.indexOf(listing.condition) - 1)]
      : listing.condition
    downgraded = defect
    const sameCity = listing.city === opts.buyer.city
    const transitSec = deliveryTransitSeconds(listing.category, sameCity, mode)
    const created = await db.delivery.create({
      data: {
        userId: opts.buyer.id, listingId: listing.id, title: listing.title, image: listing.image,
        price: mode === 'courier' ? price + DELIVERY_FEE : price,
        itemKey: listing.itemKey, category: listing.category,
        listedCondition: listing.condition, realCondition: realCond, baseValue: listing.baseValue,
        courier: COURIERS[Math.floor(Math.random() * COURIERS.length)],
        kind: 'purchase', status: 'collecting',
        eta: deliveryEtaFor(Date.now(), 0, transitSec),
      },
    })
    // фаза «Собираем» детерминирована по id посылки — фиксируем точный eta вторым апдейтом
    const eta = deliveryEtaFor(created.createdAt.getTime(), collectSecondsFor(created.id), transitSec)
    const final = await db.delivery.update({ where: { id: created.id }, data: { eta } })
    deliveryId = final.id
  } else if (!itemId) {
    // бот-покупатель: вещь сразу (невидимая механика рынка, без логистики)
    const item = await db.item.create({
      data: {
        ownerId: opts.buyer.id, itemKey: listing.itemKey, title: listing.title,
        category: listing.category, condition: listing.condition, image: listing.image,
        baseValue: listing.baseValue, purchasePrice: price, fromUserId: seller.id,
      },
    })
    itemId = item.id
  }

  // ПРОДАЖА игрока: посылка «курьер забирает → везёт покупателю → деньги зачислены».
  // Деньги продавца в эскроу — выплата в settleSaleDelivery после вручения.
  if (!seller.isBot) {
    const sameCity = listing.city === opts.buyer.city
    const transitSec = deliveryTransitSeconds(listing.category, sameCity, 'courier')
    const created = await db.delivery.create({
      data: {
        userId: seller.id, listingId: listing.id, title: listing.title, image: listing.image,
        price, itemKey: listing.itemKey, category: listing.category,
        listedCondition: listing.condition, realCondition: listing.condition, baseValue: listing.baseValue,
        courier: COURIERS[Math.floor(Math.random() * COURIERS.length)],
        kind: 'sale', status: 'collecting',
        eta: deliveryEtaFor(Date.now(), 0, transitSec),
      },
    })
    const eta = deliveryEtaFor(created.createdAt.getTime(), pickupSecondsFor(created.id), transitSec)
    await db.delivery.update({ where: { id: created.id }, data: { eta } })
  }

  // статистика, квесты, ачивки
  const estVal = Math.round(listing.baseValue)
  // ночные сделки (00:00–05:59) и крупные сделки (100k+) — секретные ачивки
  const hourNow = new Date().getHours()
  const nightNow = hourNow < 6
  const bigNow = price >= 100_000
  if (buyerIsPlayer) {
    const patch: Partial<PlayerStats> = {
      // счётчик покупок/халявы/курьерских переезжает в момент получения вещи (pickupDelivery),
      // здесь — факт сделки и потраченные деньги
      dealsTotal: 1, spent: price,
      ...(price > 0 && price <= estVal * 0.7 ? { bargains: 1 } : {}),
      ...(opts.via === 'chat' && price <= listing.price * 0.95 ? { haggles: 1 } : {}),
      ...(nightNow ? { nightDeals: 1 } : {}),
      ...(bigNow ? { bigDeals: 1 } : {}),
    }
    await bumpStats(opts.buyer.id, patch)
    await bumpQuests(opts.buyer.id, 'spend', price)
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
    const how = mode === 'pickup'
      ? 'Самовывоз — заберите посылку через приложение Доставки'
      : 'Продавец собирает посылку. Отслеживайте в приложении Доставки'
    await notifyUser(
      opts.buyer.id, 'deal', 'Оплата прошла',
      `«${listing.title}» за ${fmtMoney(mode === 'courier' ? price + DELIVERY_FEE : price)}. ${how}`,
    )
    await emitTo(`user:${opts.buyer.id}`, 'deal', { title: listing.title, price, role: 'buyer' })
  }
  if (!seller.isBot) {
    await notifyUser(
      seller.id, 'deal', 'Продажа оформлена',
      `«${listing.title}» продан за ${fmtMoney(price)}. Курьер заберёт товар, деньги придут после доставки`,
    )
    await emitTo(`user:${seller.id}`, 'deal', { title: listing.title, price, role: 'seller' })
  }

  cache.invalidate('feed')
  return { ok: true, itemId, deliveryId, downgraded }
}

// ───────────────────────── ЛОГИСТИКА: ТИК СТАТУСОВ (28-b) ─────────────────────────
// Прогоняет все «живые» посылки по жизненному циклу. Вызывается движком раз в 15с
// и лениво из GET /api/deliveries — статусы едут даже без открытого приложения.
//
//  purchase: collecting → in_transit → arrived → (игрок забрал) delivered
//                                            └→ (24ч не забрал) returned + возврат 95%
//  sale:     collecting → in_transit → delivered (+ выплата денег продавцу)

// Доставка: выдать товар из-под курьера / продвинуть статусы / вернуть невостребованное
export async function deliverDue(): Promise<number> {
  const now = new Date()
  const live = await db.delivery.findMany({
    where: { status: { in: ACTIVE_DELIVERY_STATUSES } },
    orderBy: { createdAt: 'asc' },
    take: 40,
  })
  let touched = 0
  for (const d of live) {
    const collectEnd = new Date(d.createdAt.getTime() + (d.kind === 'sale' ? pickupSecondsFor(d.id) : collectSecondsFor(d.id)) * 1000)
    try {
      if (d.status === 'collecting' && now >= collectEnd) {
        await db.delivery.update({ where: { id: d.id }, data: { status: 'in_transit' } })
        if (d.kind === 'sale') {
          await notifyUser(d.userId, 'deal', 'Курьер забрал ваш товар', `«${d.title}» в пути к покупателю. Деньги придут после вручения`)
        } else {
          await notifyUser(d.userId, 'deal', 'Посылка в пути', `«${d.title}» отправлен. Прибудет примерно ${fmtTimeLeft(d.eta.getTime() - now.getTime())}`)
        }
        touched++
      }
      if (d.status === 'in_transit' && now >= d.eta) {
        if (d.kind === 'sale') {
          await settleSaleDelivery(d.id)
        } else {
          await db.delivery.update({ where: { id: d.id }, data: { status: 'arrived' } })
          await notifyUser(d.userId, 'deal', 'Доставка прибыла', `«${d.title}» ждёт в пункте выдачи — заберите в приложении Доставки. Хранение 24 ч`)
        }
        touched++
        continue // дальше по этой посылке делать нечего в этом тике
      }
      if (d.status === 'arrived' && new Date(d.eta.getTime() + PICKUP_WINDOW_MS) <= now) {
        await returnDelivery(d.id)
        touched++
      }
    } catch (e) {
      console.error('[deals] delivery tick error:', d.id, e)
    }
  }
  return touched
}

function fmtTimeLeft(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min >= 60) return `через ~${Math.round(min / 60 * 10) / 10} ч`
  return `через ~${min} мин`
}

// Вручение состоялось: деньги продавцу-игроку (эскроу → счёт), транзакция и налог — здесь
async function settleSaleDelivery(deliveryId: string): Promise<void> {
  const d = await db.delivery.findUnique({ where: { id: deliveryId } })
  if (!d || d.kind !== 'sale' || d.status === 'delivered' || d.status === 'returned') return
  const now = new Date()
  await db.delivery.update({ where: { id: d.id }, data: { status: 'delivered', deliveredAt: now } })
  await db.user.update({ where: { id: d.userId }, data: { balance: { increment: d.price } } })
  // контрагент — покупатель: находим чат по лоту (единственное место, где покупатель известен)
  const chat = await db.chat.findFirst({ where: { listingId: d.listingId, buyerId: { not: d.userId } } })
  const buyer = chat ? await db.user.findUnique({ where: { id: chat.buyerId } }) : null
  if (d.price > 0) {
    await db.transaction.create({
      data: {
        userId: d.userId, type: 'sale', amount: d.price,
        counterpartyId: buyer?.id ?? null, counterpartyName: buyer?.displayName ?? null,
        listingId: d.listingId, note: `Продажа · ${d.title} · доставка`,
      },
    })
  }
  // налог самозанятого начисляется при фактической выплате
  const seller = await db.user.findUnique({ where: { id: d.userId } })
  if (seller && !seller.isBot && d.price > 0) {
    const tax = Math.round(d.price * TAX_RATE)
    await db.user.update({ where: { id: seller.id }, data: { taxDebt: { increment: tax } } })
    await db.taxBill.create({
      data: {
        userId: seller.id, amount: tax, reason: `Налог 4%: продажа «${d.title}»`,
        dueAt: new Date(now.getTime() + 3 * 86_400_000),
      },
    })
  }
  await notifyUser(
    d.userId, 'deal', 'Продажа завершена',
    `«${d.title}» вручён покупателю, ${fmtMoney(d.price)} зачислены на счёт`,
  )
  await emitTo(`user:${d.userId}`, 'deal', { title: d.title, price: d.price, role: 'seller' })
}

// Посылку не забрали за 24 ч: курьер возвращает вещь продавцу, игроку — возврат денег минус 5%
async function returnDelivery(deliveryId: string): Promise<void> {
  const d = await db.delivery.findUnique({ where: { id: deliveryId } })
  if (!d || d.kind !== 'purchase' || d.status !== 'arrived') return
  await db.delivery.update({ where: { id: d.id }, data: { status: 'returned' } })
  // вещь живого продавца едет обратно к нему (может выставить снова).
  // Дойти сюда она могла только в статусе 'arrived' — полученные посылки не возвращаются.
  const listing = await db.listing.findUnique({ where: { id: d.listingId } })
  if (listing?.itemId) {
    await db.item.updateMany({ where: { id: listing.itemId, ownerId: d.userId }, data: { ownerId: listing.sellerId } })
  }
  const refund = Math.round(d.price * (1 - RETURN_COMMISSION))
  if (refund > 0) {
    await db.user.update({ where: { id: d.userId }, data: { balance: { increment: refund } } })
    await db.transaction.create({
      data: {
        userId: d.userId, type: 'purchase', amount: refund, listingId: d.listingId,
        note: `Возврат: ${d.title} (не забрали, комиссия ${Math.round(RETURN_COMMISSION * 100)}%)`,
      },
    })
  }
  await notifyUser(
    d.userId, 'deal', 'Посылка возвращена',
    `«${d.title}» не забрали за 24 ч — курьер вернул отправление. Возврат ${fmtMoney(refund)} (комиссия ${Math.round(RETURN_COMMISSION * 100)}%)`,
  )
}

// Игрок забрал посылку из пункта выдачи: вещь попадает в инвентарь, квесты/ачивки — после факта
export async function pickupDelivery(userId: string, deliveryId: string): Promise<{ ok: boolean; error?: string; itemId?: string }> {
  const d = await db.delivery.findUnique({ where: { id: deliveryId } })
  if (!d || d.userId !== userId) return { ok: false, error: 'Посылка не найдена' }
  if (d.kind !== 'purchase') return { ok: false, error: 'Эту посылку забирает получатель' }
  if (d.status !== 'arrived') return { ok: false, error: 'Посылка ещё в пути' }

  const now = new Date()
  // вещь живого продавца уже существует (владелец — покупатель): раскрываем её в инвентаре
  const listing = await db.listing.findUnique({ where: { id: d.listingId } })
  let itemId: string | undefined
  if (listing?.itemId) {
    const item = await db.item.findUnique({ where: { id: listing.itemId } })
    if (item && item.ownerId === userId) {
      // применяем реальное состояние (дефект виден при получении)
      if (item.condition !== d.realCondition) {
        await db.item.update({ where: { id: item.id }, data: { condition: d.realCondition } })
      }
      itemId = item.id
    }
  }
  if (!itemId) {
    const item = await db.item.create({
      data: {
        ownerId: userId, itemKey: d.itemKey, title: d.title, category: d.category,
        condition: d.realCondition, image: d.image, baseValue: d.baseValue,
        purchasePrice: d.price, fromUserId: null,
      },
    })
    itemId = item.id
  }
  await db.delivery.update({ where: { id: d.id }, data: { status: 'delivered', deliveredAt: now } })

  // квест-хуки и счётчики — ПОСЛЕ фактического получения вещи игроком
  const worse = CONDITION_ORDER.indexOf(d.realCondition) < CONDITION_ORDER.indexOf(d.listedCondition)
  await bumpStats(userId, {
    dealsBuy: 1,
    ...(d.price > 0 ? { courierBuys: 1 } : {}),
    ...(d.price === 0 ? { freePicked: 1 } : {}),
  })
  await bumpQuests(userId, 'buy')
  if (d.price > 0) await bumpQuests(userId, 'courier')
  if (d.price === 0) await bumpQuests(userId, 'free')
  await checkAchievements(userId)
  await notifyUser(
    userId, 'deal', 'Посылка получена',
    worse
      ? `«${d.title}» забран. Осторожно: состояние хуже, чем было в объявлении`
      : `«${d.title}» забран — вещь уже в инвентаре`,
  )
  await emitTo(`user:${userId}`, 'deal', { title: d.title, price: d.price, role: 'buyer' })
  return { ok: true, itemId }
}

// Условная рыночная оценка с учётом состояния
export function estValueFor(baseValue: number, condition: string): number {
  const mult: Record<string, number> = { new: 1.18, excellent: 1.0, good: 0.82, used: 0.6, parts: 0.28 }
  return Math.round(baseValue * (mult[condition] ?? 0.8))
}

export { nextCondition }
