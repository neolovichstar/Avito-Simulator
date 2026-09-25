// Экономические формулы игры

export const TAX_RATE = 0.04 // самозанятый
export const TAX_BLOCK_LIMIT = 10_000 // задолженность, блокирующая продажи
export const DEBT_BLOCK_LIMIT = 30_000 // долг по кредиту, блокирующий покупки
export const BOOST_COST = 249
export const DELIVERY_FEE = 350
export const LOAN_RATE = 0.15
export const LOAN_DAYS = 7
export const DEPOSIT_RATE_PER_HOUR = 0.0004 // 0.04% в час (~1% в день) — прогресс должен быть долгим
export const PENALTY_DAILY = 0.10 // пеня 10% в сутки

// ХАРДКОРНАЯ КРИВАЯ ПРОГРЕССИИ: уровень растёт степенью 2.4 —
// ур. 5 ≈ 2 800 XP, ур. 10 ≈ 17 700 XP, ур. 15 ≈ 53 500 XP, ур. 20 ≈ 123 500 XP.
// Развитие очень долгое и осознанное.
export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.pow(xp / 80, 1 / 2.4)) + 1)
}

export function xpForLevel(level: number): number {
  return Math.round(Math.pow(level - 1, 2.4) * 80)
}

export function levelProgress(xp: number): number {
  const lvl = levelFromXp(xp)
  const cur = xpForLevel(lvl)
  const next = xpForLevel(lvl + 1)
  return Math.min(100, Math.round(((xp - cur) / Math.max(1, next - cur)) * 100))
}

export function loanLimitFor(level: number, creditScore = 500): number {
  // хардкор: лимит растёт медленно с уровнем
  const base = 12_000 + level * 6_000
  // рейтинг 300..850 → множитель 0.6x..1.4x
  const k = 0.6 + Math.max(0, Math.min(1, (creditScore - 300) / 550)) * 0.8
  return Math.round((base * k) / 500) * 500
}

export function creditRateFor(creditScore: number): number {
  // базовая ставка 15%, хороший рейтинг снижает до 9%, плохой поднимает до 25%.
  // Целое число: ставка хранится в Loan.rate (Int) и показывается в договоре.
  return Math.round(25 - Math.max(0, Math.min(1, (creditScore - 300) / 550)) * 16)
}

// ---------- Кредит: сроки ----------
// Как в жизни: заёмщик выбирает срок, чем он длиннее — тем выше полная стоимость.
// Базовая ставка (creditRateFor) действует для 7 дней; длиннее — дороже.
export const LOAN_TERM_OPTIONS: { days: number; label: string; factor: number }[] = [
  { days: 7, label: '7 дней', factor: 1 },
  { days: 14, label: '14 дней', factor: 1.6 },
  { days: 30, label: '30 дней', factor: 2.6 },
]

export function termRateFactor(days: number): number {
  const found = LOAN_TERM_OPTIONS.find((t) => t.days === days)
  return found ? found.factor : 1
}

// Ставка для выбранного срока (целая, для Loan.rate Int)
export function rateForTerm(creditScore: number, days: number): number {
  return Math.round(creditRateFor(creditScore) * termRateFactor(days))
}

export function creditLabel(score: number): { label: string; cls: string } {
  if (score >= 750) return { label: 'Отличный', cls: 'text-emerald-600' }
  if (score >= 620) return { label: 'Хороший', cls: 'text-green-600' }
  if (score >= 480) return { label: 'Средний', cls: 'text-amber-600' }
  return { label: 'Низкий', cls: 'text-red-500' }
}

export function repairCost(baseValue: number): number {
  return Math.max(300, Math.round(baseValue * 0.14))
}

export function repairMinutes(): number {
  return 5 + Math.floor(Math.random() * 11)
}

export const CONDITION_ORDER = ['parts', 'used', 'good', 'excellent', 'new']

export function nextCondition(condition: string): string | null {
  const i = CONDITION_ORDER.indexOf(condition)
  if (i === -1 || i >= CONDITION_ORDER.length - 1) return null
  return CONDITION_ORDER[i + 1]
}

// Шанс, что курьерская покупка принесёт товар хуже заявленного
export function courierDefectChance(sellerTrust: number): number {
  // доверие 1 -> 8%, доверие 0.3 -> 38%
  return Math.max(0.08, 0.45 - sellerTrust * 0.37)
}

export function deliveryEtaSeconds(): number {
  return 45 + Math.floor(Math.random() * 105) // 45-150 секунд
}

// ───────────────────────── ЛОГИСТИКА (Task 28-b) ─────────────────────────
// Покупка больше не даёт вещь мгновенно: «Собираем» → «В пути» → «Прибыл» → игрок забирает.
// Продажа игрока: курьер забирает → везёт покупателю → деньги зачисляются после вручения.

// Комиссия площадки при возврате не забранной посылки (5%)
export const RETURN_COMMISSION = 0.05
// Сколько посылка ждёт в пункте выдачи, прежде чем курьер вернёт её продавцу
export const PICKUP_WINDOW_MS = 24 * 3_600_000

// Габарит категории: диван едет заметно дольше айфона
export const CATEGORY_SIZE_MULT: Record<string, number> = {
  phones: 1, clothes: 0.9, sneakers: 0.9, books: 0.9, auto: 1.05, hobby: 1,
  music: 1.1, laptops: 1.2, electronics: 1.2, kids: 1.3, sport: 1.4,
  appliances: 1.8, furniture: 1.9,
}

// Детерминированная «случайная» величина из id — чтобы фаза «Собираем»
// не хранить в БД, а вычислять одинаково на сервере (id стабилен)
export function seededSeconds(id: string, minSec: number, maxSec: number): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0
  return minSec + (h % Math.max(1, maxSec - minSec + 1))
}

// «Собираем»: продавец собирает заказ (покупка) — 2-4 минуты
export function collectSecondsFor(id: string): number {
  return seededSeconds(id, 120, 240)
}

// «Курьер забирает товар» у игрока-продавца — 5-15 минут
export function pickupSecondsFor(id: string): number {
  return seededSeconds(id, 300, 900)
}

// Основное ожидание «В пути» (мин → сек). Курьер: ~25-60 мин за телефон в один город,
// габарит и межгород множат. Самовывоз — игрок сам едет, это быстрее.
export function deliveryTransitSeconds(category: string, sameCity: boolean, mode: 'courier' | 'pickup' | 'chat'): number {
  const size = CATEGORY_SIZE_MULT[category] ?? 1.1
  const baseMin = mode === 'pickup' ? 4 + Math.random() * 6 : 25 + Math.random() * 35
  const cityK = sameCity ? 1 : mode === 'pickup' ? 1.6 : 1.5
  return Math.round(baseMin * size * cityK * 60)
}

// Итоговый eta доставки: createdAt + сбор + путь
export function deliveryEtaFor(createdAtMs: number, collectSec: number, transitSec: number): Date {
  return new Date(createdAtMs + (collectSec + transitSec) * 1000)
}

export function cardNumberFor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  const part = (n: number) => String(n % 10000).padStart(4, '0')
  return `2200 ${part(h >> 4)} ${part(h >> 8)} ${part(h >> 12)}`
}

export function auctionStep(price: number): number {
  return Math.max(100, Math.round((price * 0.02) / 50) * 50)
}
