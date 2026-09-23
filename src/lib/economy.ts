// Экономические формулы игры

export const TAX_RATE = 0.04 // самозанятый
export const TAX_BLOCK_LIMIT = 10_000 // задолженность, блокирующая продажи
export const DEBT_BLOCK_LIMIT = 30_000 // долг по кредиту, блокирующий покупки
export const BOOST_COST = 149
export const DELIVERY_FEE = 350
export const LOAN_RATE = 0.15
export const LOAN_DAYS = 7
export const DEPOSIT_RATE_PER_HOUR = 0.001 // 0.1% в час
export const PENALTY_DAILY = 0.10 // пеня 10% в сутки

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 60)) + 1)
}

export function xpForLevel(level: number): number {
  return Math.pow(level - 1, 2) * 60
}

export function levelProgress(xp: number): number {
  const lvl = levelFromXp(xp)
  const cur = xpForLevel(lvl)
  const next = xpForLevel(lvl + 1)
  return Math.min(100, Math.round(((xp - cur) / Math.max(1, next - cur)) * 100))
}

export function loanLimitFor(level: number): number {
  return 15_000 + level * 10_000
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
