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
  // базовая ставка 15%, хороший рейтинг снижает до 9%, плохой поднимает до 25%
  return Math.round((25 - Math.max(0, Math.min(1, (creditScore - 300) / 550)) * 16) * 10) / 10
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

export function cardNumberFor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  const part = (n: number) => String(n % 10000).padStart(4, '0')
  return `2200 ${part(h >> 4)} ${part(h >> 8)} ${part(h >> 12)}`
}

export function auctionStep(price: number): number {
  return Math.max(100, Math.round((price * 0.02) / 50) * 50)
}
