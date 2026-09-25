// ─────────────────────────────────────────────────────────────────────────────
// Телефония ОС Resale: выбивание номеров как в GTA5 RP.
//
// Чистая серверная логика (без 'use client'): регионы с престижем, алгоритм
// «красоты» номера (beautyScore 0..100), тиры с ценами выкупа, генерация
// случайных номеров с сидированными паттернами. Используется роутами
// /api/phones/*, безопасно импортируется и на клиенте (только типы/формат).
// ─────────────────────────────────────────────────────────────────────────────

export type Tier = 'basic' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface Region {
  id: string
  name: string
  /** Городские/мобильные коды, доступные в регионе (без +7). */
  codes: string[]
  /** Престиж: влияет на шанс паттернов и цену выкупа красивых номеров. */
  prestige: number
  /** Цена одной прокрутки, ₽. */
  rollPrice: number
}

function range(from: number, to: number): string[] {
  const out: string[] = []
  for (let i = from; i <= to; i++) out.push(String(i))
  return out
}

export const REGIONS: Region[] = [
  { id: 'msk', name: 'Москва', codes: ['495', '499'], prestige: 1.2, rollPrice: 700 },
  { id: 'spb', name: 'Санкт-Петербург', codes: ['812'], prestige: 1.1, rollPrice: 650 },
  { id: 'mob', name: 'Мобильные федеральные', codes: range(900, 999), prestige: 1.0, rollPrice: 600 },
  { id: 'kzn', name: 'Казань', codes: ['843'], prestige: 1.0, rollPrice: 600 },
  { id: 'mo', name: 'Московская область', codes: ['498'], prestige: 0.9, rollPrice: 550 },
  { id: 'krd', name: 'Краснодар', codes: ['861'], prestige: 0.9, rollPrice: 550 },
  { id: 'ekb', name: 'Екатеринбург', codes: ['343'], prestige: 0.9, rollPrice: 550 },
  { id: 'rnd', name: 'Ростов-на-Дону', codes: ['863'], prestige: 0.85, rollPrice: 500 },
  { id: 'nsk', name: 'Новосибирск', codes: ['383'], prestige: 0.8, rollPrice: 500 },
]

export function regionById(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id)
}

/** Резерв на красивый номер: 48 часов, потом номер уходит в общий пул. */
export const RESERVE_HOURS = 48
/** Максимум одновременных броней у игрока. */
export const MAX_RESERVES = 3

/* ───────────────────────────── Красота номера ────────────────────────────── */

function longestRun(d: string): number {
  let run = 1
  let best = 1
  for (let i = 1; i < d.length; i++) {
    if (d[i] === d[i - 1]) {
      run++
      if (run > best) best = run
    } else run = 1
  }
  return best
}

function longestStepRun(d: string): number {
  // Подряд идущие цифры с шагом ±1: 1234, 4321…
  let run = 1
  let best = 1
  for (let i = 1; i < d.length; i++) {
    const step = d.charCodeAt(i) - d.charCodeAt(i - 1)
    if (step === 1 || step === -1) {
      // продолжаем только в том же направлении
      const prev = i >= 2 ? d.charCodeAt(i - 1) - d.charCodeAt(i - 2) : 0
      if (i === 1 || prev === step) {
        run++
        if (run > best) best = run
        continue
      }
      run = 2
      if (run > best) best = run
    } else run = 1
  }
  return best
}

function isAlternating(d: string): boolean {
  // ABABAB: каждая цифра повторяет позицию через одну
  if (d.length < 5) return false
  for (let i = 2; i < d.length; i++) if (d[i] !== d[i - 2]) return false
  return true
}

/**
 * «Красота» хвоста номера (7 цифр): 0..100.
 * Учитывает повторы (AAA), зеркала (ABBA, палиндром), последовательности (1234),
 * чередование (ABAB), круглые окончания (000) и количество повторов цифр.
 */
export function beautyScore(tail: string): number {
  const d = tail.replace(/\D/g, '')
  if (d.length < 4) return 0
  let s = 0

  // 1. Максимальная серия одинаковых подряд: AAA → +14 за каждую лишнюю цифру
  const run = longestRun(d)
  s += Math.min((run - 1) * 14, 56)

  // 2. Круглые окончания
  if (d.endsWith('000')) s += 20
  else if (d.endsWith('00')) s += 8

  // 3. Зеркальные структуры
  const rev = [...d].reverse().join('')
  if (d === rev) s += 30 // полный палиндром (abcdcba)
  let abba = 0
  for (let i = 0; i + 4 <= d.length; i++) {
    if (d[i] === d[i + 3] && d[i + 1] === d[i + 2]) abba++
  }
  s += Math.min(abba * 12, 24)
  let aba = 0
  for (let i = 0; i + 3 <= d.length; i++) {
    if (d[i] === d[i + 2] && d[i + 1] !== d[i]) aba++
  }
  s += Math.min(aba * 4, 12)

  // 4. Последовательности 1234/4321
  const seq = longestStepRun(d)
  if (seq >= 4) s += (seq - 3) * 12
  if (seq >= d.length && d.length >= 6) s += 30 // полный «стрит»

  // 5. Чередование ABABAB
  if (isAlternating(d)) s += 35

  // 6. Повторы цифр по всему номеру
  const counts = new Map<string, number>()
  for (const ch of d) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let triples = 0
  let pairs = 0
  for (const n of counts.values()) {
    if (n >= 3) triples++
    else if (n === 2) pairs++
  }
  s += Math.min(triples * 9, 27)
  if (pairs >= 3) s += 10

  return Math.max(0, Math.min(100, s))
}

export function tierFromScore(score: number): Tier {
  if (score >= 80) return 'diamond'
  if (score >= 60) return 'platinum'
  if (score >= 40) return 'gold'
  if (score >= 20) return 'silver'
  return 'basic'
}

export const TIER_LABEL: Record<Tier, string> = {
  basic: 'Обычный',
  silver: 'Серебро',
  gold: 'Золото',
  platinum: 'Платина',
  diamond: 'Бриллиант',
}

/** Цена выкупа красивого номера (для basic — 0, входит в прокрутку). */
export function buyPriceFor(score: number, prestige: number): number {
  let base: number
  if (score >= 80) base = 32000 + (score - 80) * 2400 // 32 000 … 80 000
  else if (score >= 60) base = 14000 + (score - 60) * 800 // 14 000 … 30 000
  else if (score >= 40) base = 4500 + (score - 40) * 375 // 4 500 … 12 000
  else if (score >= 20) base = 1200 + (score - 20) * 140 // 1 200 … 4 000
  else return 0
  return Math.round((base * prestige) / 100) * 100
}

/* ─────────────────────────────── Генерация ───────────────────────────────── */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function digit(): string {
  return String(Math.floor(Math.random() * 10))
}

function digitNonZero(): string {
  return String(1 + Math.floor(Math.random() * 9))
}

/** Сидированный паттерн: красивые комбинации для платных тиров. */
function patternedTail(): string {
  const kind = pick(['repeat', 'triple_end', 'abba', 'seq', 'round', 'mirror', 'alternating'])
  const d = digitNonZero()
  switch (kind) {
    case 'repeat': {
      // AAA в случайной позиции
      const head = Array.from({ length: 2 }, digit).join('')
      const mid = d.repeat(3)
      const tailRest = Array.from({ length: 2 }, digit).join('')
      return pick([mid + head + tailRest, head + mid + tailRest, head + tailRest + mid])
    }
    case 'triple_end':
      return Array.from({ length: 4 }, digit).join('') + d.repeat(3)
    case 'abba': {
      const a = digitNonZero()
      const b = digit()
      const block = a + b + b + a
      const rest = Array.from({ length: 3 }, digit).join('')
      return pick([block + rest, rest + block])
    }
    case 'seq': {
      const start = Math.floor(Math.random() * 4)
      const up = Math.random() < 0.5
      const len = pick([4, 5])
      const seq = Array.from({ length: len }, (_, i) => String(up ? (start + i) % 10 : (start - i + 10) % 10)).join('')
      const rest = Array.from({ length: 7 - len }, digit).join('')
      return pick([seq + rest, rest + seq])
    }
    case 'round': {
      const zeros = pick([2, 3])
      const rest = Array.from({ length: 7 - zeros }, digit).join('')
      return rest + '0'.repeat(zeros)
    }
    case 'mirror': {
      // abcdcba — полный палиндром из 7 цифр
      const a = digitNonZero()
      const b = digit()
      const c = digit()
      return a + b + c + d + c + b + a
    }
    default: {
      // ABABABX
      const b = digit()
      return (d + b).repeat(3) + digit()
    }
  }
}

function plainTail(): string {
  return Array.from({ length: 7 }, digit).join('')
}

/** Хвост номера с шансом паттерна, зависящим от престижа региона. */
export function generateTail(prestige: number): string {
  const chance = Math.min(0.42, 0.17 * prestige)
  return Math.random() < chance ? patternedTail() : plainTail()
}

/** Полные цифры номера: 7 + код (3) + хвост (7) = 11 цифр. */
export function generateDigits(region: Region): string {
  const code = pick(region.codes)
  return '7' + code + generateTail(region.prestige)
}

/** Детерминированный номер для ботов (по id пользователя) — без записи в БД. */
export function botDigits(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const code = 900 + (Math.abs(h) % 100)
  let tail = ''
  let x = Math.abs(h)
  for (let i = 0; i < 7; i++) {
    x = Math.imul(x, 48271) % 2147483647
    tail += String(Math.abs(x) % 10)
  }
  return '7' + String(code) + tail
}

/* ──────────────────────────────── Формат ─────────────────────────────────── */

/** «74951234567» → «+7 (495) 123-45-67». Некорректная длина — как есть. */
export function formatNumber(digits: string): string {
  const d = digits.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`
  }
  return digits
}

/** Форматирование набираемого на клавиатуре: умно, по мере ввода. */
export function formatDialInput(raw: string): string {
  let d = raw.replace(/[^\d*#]/g, '')
  const plus = raw.startsWith('+')
  if (d.length === 0) return plus ? '+' : ''
  if (d.length === 1 && plus) return '+'
  if ((d.startsWith('8') || (plus && d.startsWith('7'))) && d.length > 1) {
    const body = d.startsWith('8') ? d.slice(1) : d.slice(1)
    return '+7 ' + formatTail(body)
  }
  if (plus) return '+' + formatTail(d)
  return formatTail(d)
}

function formatTail(d: string): string {
  const code = d.slice(0, 3)
  const rest = d.slice(3)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${code}) ${rest}`
  if (d.length <= 8) return `(${code}) ${rest.slice(0, 3)}-${rest.slice(3)}`
  return `(${code}) ${rest.slice(0, 3)}-${rest.slice(3, 5)}-${rest.slice(5, 7)}`
}

/** Остаток времени брони в секундах (или 0, если истекла). */
export function reserveSecondsLeft(holdUntil: string | Date | null): number {
  if (!holdUntil) return 0
  const t = typeof holdUntil === 'string' ? new Date(holdUntil).getTime() : holdUntil.getTime()
  return Math.max(0, Math.floor((t - Date.now()) / 1000))
}
