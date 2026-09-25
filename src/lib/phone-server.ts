// Серверные хелперы телефонии: генерация с проверкой уникальности, чистка
// истёкших броней, лимит одновременных резервов. Только для API-роутов —
// тянет Prisma, на клиенте не импортировать (для клиента есть lib/phone.ts).

import { db } from '@/lib/db'
import type { Prisma, PhoneNumber } from '@prisma/client'
import type { Region } from '@/lib/phone'
import { beautyScore, buyPriceFor, generateDigits, tierFromScore, formatNumber, RESERVE_HOURS, MAX_RESERVES } from '@/lib/phone'

type Tx = Prisma.TransactionClient

/** Удаляет истёкшие брони (номер уходит в общий пул, digits освобождается). */
export async function purgeExpiredReserves(): Promise<void> {
  await db.phoneNumber.deleteMany({
    where: { status: 'reserved', holdUntil: { lt: new Date() } },
  })
}

/** Лимит одновновременных броней: если превышен — самые старые уходят. */
async function enforceReserveCap(tx: Tx, userId: string): Promise<void> {
  const reserves = await tx.phoneNumber.findMany({
    where: { userId, status: 'reserved' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (reserves.length < MAX_RESERVES) return
  const drop = reserves.slice(0, reserves.length - MAX_RESERVES + 1).map((r) => r.id)
  await tx.phoneNumber.deleteMany({ where: { id: { in: drop } } })
}

/** Есть ли у игрока основной номер. */
export async function hasMainPhone(tx: Tx, userId: string): Promise<boolean> {
  const main = await tx.phoneNumber.findFirst({ where: { userId, isMain: true }, select: { id: true } })
  return main !== null
}

export interface RolledPhone {
  phone: PhoneNumber
  activated: boolean
}

/**
 * Прокрутка: генерирует случайный номер региона с перегенерацией при коллизии
 * digits/number (unique index). Обычный (basic) сразу активируется — он входит
 * в цену прокрутки; красивый ставится на бронь 48ч с ценой выкупа.
 * Вызывается ВНУТРИ $transaction после списания цены прокрутки.
 */
export async function rollNumber(tx: Tx, userId: string, region: Region): Promise<RolledPhone> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const digits = generateDigits(region)
    const score = beautyScore(digits.slice(-7))
    const tier = tierFromScore(score)
    const free = tier === 'basic'

    if (!free) await enforceReserveCap(tx, userId)

    const noMain = !(await hasMainPhone(tx, userId))
    try {
      const phone = await tx.phoneNumber.create({
        data: {
          userId,
          number: formatNumber(digits),
          digits,
          regionCode: digits.slice(1, 4),
          regionName: region.name,
          tier,
          beautyScore: score,
          status: free ? 'active' : 'reserved',
          reservedFor: free ? null : userId,
          holdUntil: free ? null : new Date(Date.now() + RESERVE_HOURS * 3600_000),
          buyPrice: free ? 0 : buyPriceFor(score, region.prestige),
          isMain: free && noMain, // первый обычный номер сразу становится основным
        },
      })
      return { phone, activated: free }
    } catch (err) {
      // P2002 — коллизия уникальности digits/number: перегенерируем
      lastErr = err
    }
  }
  throw lastErr ?? new Error('roll failed')
}

/** Закрепляет номер как основной, снимая флаг с прежних (внутри транзакции). */
export async function makeMainPhone(tx: Tx, userId: string, phoneId: string): Promise<void> {
  await tx.phoneNumber.updateMany({ where: { userId, isMain: true }, data: { isMain: false } })
  await tx.phoneNumber.update({ where: { id: phoneId }, data: { isMain: true } })
}

/** DTO номера для клиента. */
export function serializePhone(p: PhoneNumber) {
  return {
    id: p.id,
    number: p.number,
    digits: p.digits,
    regionCode: p.regionCode,
    regionName: p.regionName,
    tier: p.tier,
    beautyScore: p.beautyScore,
    status: p.status,
    buyPrice: p.buyPrice,
    holdUntil: p.holdUntil ? p.holdUntil.toISOString() : null,
    isMain: p.isMain,
    createdAt: p.createdAt.toISOString(),
  }
}

/** Стартовые записи журнала звонков (один раз, на первого захода в «Телефон»). */
export async function seedCallLogIfEmpty(userId: string): Promise<void> {
  const count = await db.callLog.count({ where: { userId } })
  if (count > 0) return
  const h = 3600_000
  await db.callLog.createMany({
    data: [
      { userId, peerName: 'Игорь Самойлов', number: '+7 (911) 387-29-95', direction: 'in', status: 'completed', durationSec: 84, createdAt: new Date(Date.now() - 24 * h) },
      { userId, peerName: 'Дарья Кузнецова', number: '+7 (926) 174-90-58', direction: 'missed', status: 'no_answer', durationSec: 0, createdAt: new Date(Date.now() - 26 * h) },
      { userId, peerName: 'Артём Ковалёв', number: '+7 (963) 014-77-52', direction: 'in', status: 'completed', durationSec: 37, createdAt: new Date(Date.now() - 31 * h) },
      { userId, peerName: null, number: '+7 (800) 555-35-35', direction: 'out', status: 'completed', durationSec: 122, createdAt: new Date(Date.now() - 50 * h) },
    ],
  })
}
