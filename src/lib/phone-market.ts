// ─────────────────────────────────────────────────────────────────────────────
// Витрина «Номеров» (телефония): ежедневный каталог красивых номеров.
// Генерируется детерминированно от даты: рынок стабилен в течение дня и
// обновляется утром. Покупка — POST /api/phones/market (сервер перегенерирует
// каталог, сверяет digits и списывает цену — клиенту не доверяем).
// ─────────────────────────────────────────────────────────────────────────────

import { REGIONS, beautyScore, formatNumber, tierFromScore, type Region, type Tier } from '@/lib/phone'

export type PhoneMarketCategory = 'usual' | 'pretty' | 'gold'

export interface PhoneMarketItem {
  key: string
  digits: string // 11 цифр: 7 + код (3) + хвост (7)
  number: string // человекочитаемый формат
  regionCode: string
  regionName: string
  tier: Tier
  beautyScore: number
  price: number
  category: PhoneMarketCategory
  trait: string
  popularity: string
  unique: string
}

/** Детерминированный ГПСЧ (mulberry32). */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Сид текущего дня: YYYYMMDD. */
export function daySeed(d = new Date()): number {
  return Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`)
}

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]
}

function randomTail(rnd: () => number): string {
  let s = ''
  for (let i = 0; i < 7; i++) s += String(Math.floor(rnd() * 10))
  return s
}

/** Красивый хвост: повтор, зеркало, чередование, круглое окончание. */
function prettyTail(rnd: () => number): string {
  const shapes = [
    () => {
      // AAAxxxx
      const d = String(Math.floor(rnd() * 10))
      return `${d}${d}${d}${randomTail(rnd).slice(0, 4)}`
    },
    () => {
      // xAAAx / ABBA-окно
      const a = String(Math.floor(rnd() * 10))
      const b = String(Math.floor(rnd() * 10))
      return `${randomTail(rnd).slice(0, 2)}${a}${b}${b}${a}${randomTail(rnd).slice(0, 1)}`
    },
    () => {
      // круглые окончания
      const zeros = rnd() < 0.5 ? '000' : '00'
      return `${randomTail(rnd).slice(0, 7 - zeros.length)}${zeros}`
    },
  ]
  return pick(rnd, shapes)()
}

/** Золотой хвост: палиндром, чередование или длинная серия. */
function goldTail(rnd: () => number): string {
  const shapes = [
    () => {
      // палиндром abcdcba
      const a = String(Math.floor(rnd() * 10))
      const b = String(Math.floor(rnd() * 10))
      const c = String(Math.floor(rnd() * 10))
      const d = String(Math.floor(rnd() * 10))
      return `${a}${b}${c}${d}${c}${b}${a}`
    },
    () => {
      // чередование ABABABA
      const a = String(Math.floor(rnd() * 10))
      const b = String(Math.floor(rnd() * 10))
      return `${a}${b}${a}${b}${a}${b}${a}`
    },
    () => {
      // серия AAAA + AA
      const d = String(Math.floor(rnd() * 10))
      return `${d}${d}${d}${d}${randomTail(rnd).slice(0, 3)}`
    },
    () => {
      // две тройки + замыкание: AAABBBC
      const a = String(Math.floor(rnd() * 10))
      const b = String(Math.floor(rnd() * 10))
      return `${a}${a}${a}${b}${b}${b}${String(Math.floor(rnd() * 10))}`
    },
  ]
  return pick(rnd, shapes)()
}

/** Цена категории: «Обычные от 199 ₽», «Красивые от 1 990 ₽», «Золотые от 49 990 ₽». */
export function phonePriceFor(category: PhoneMarketCategory, score: number, rnd: () => number): number {
  let base: number
  if (category === 'usual') base = 199 + score * 40 // 199 … ~990
  else if (category === 'pretty') base = 1990 + (score - 20) * 830 // 1 990 … ~33 990
  else if (score >= 85) base = 299_990 + (score - 85) * 13_300 // 299 990 … ~499 990
  else if (score >= 70) base = 99_990 + (score - 70) * 13_300 // 99 990 … ~299 990
  else base = 49_990 + Math.max(0, score - 55) * 3_300 // 49 990 … ~99 990
  base *= 0.92 + rnd() * 0.16
  // красивые окончания цены: …990
  return Math.max(category === 'usual' ? 199 : 1990, Math.round(base / 10) * 10 - 10) | 0
}

function traitFor(category: PhoneMarketCategory, score: number, rnd: () => number): string {
  if (category === 'gold') return pick(rnd, ['Максимально красивый', 'Очень редкий', 'Легендарная комбинация'])
  if (category === 'pretty') return pick(rnd, ['Удачная комбинация', 'Легко запомнить', 'Популярный рисунок'])
  return score >= 10 ? 'Выгодное предложение' : 'Простой номер'
}

function popularityFor(category: PhoneMarketCategory): string {
  if (category === 'gold') return 'Очень высокая'
  if (category === 'pretty') return 'Высокая'
  return 'Средняя'
}

function uniqueFor(score: number): string {
  // красивые ступени: 1 из 5 000 / 20 000 / 100 000 / 1 000 000 / 10 000 000
  const steps = [5000, 20_000, 100_000, 500_000, 2_000_000, 10_000_000]
  const idx = Math.min(steps.length - 1, Math.floor((score / 100) * steps.length))
  return `1 из ${steps[idx].toLocaleString('ru-RU')}`
}

function categoryFromTier(tier: Tier): PhoneMarketCategory {
  if (tier === 'basic') return 'usual'
  if (tier === 'silver') return 'pretty'
  return 'gold'
}

function weightedRegion(rnd: () => number): Region {
  const sorted = [...REGIONS].map((r) => ({ r, w: r.prestige + rnd() * 0.5 })).sort((a, b) => b.w - a.w)
  return pick(rnd, sorted.slice(0, Math.max(10, sorted.length)).map((x) => x.r))
}

/**
 * Каталог витрины: mix категорий — верх списка золотой, дальше красивые,
 * в хвосте обычные (как «Рекомендуем» в макете).
 */
export function buildPhoneMarket(seed = daySeed(), size = 26): PhoneMarketItem[] {
  const rnd = mulberry32(seed)
  const items: PhoneMarketItem[] = []
  const seen = new Set<string>()

  const targets: PhoneMarketCategory[] = [
    'gold', 'gold', 'gold', 'pretty', 'gold', 'pretty', 'pretty', 'pretty', 'usual', 'pretty',
    'usual', 'pretty', 'usual', 'usual', 'pretty', 'usual', 'usual', 'usual', 'pretty', 'usual',
    'usual', 'usual', 'usual', 'usual', 'usual', 'usual',
  ]

  for (let i = 0; i < size * 8 && items.length < size; i++) {
    const category = targets[items.length] ?? 'usual'
    const region = weightedRegion(rnd)
    const code = pick(rnd, region.codes)
    const tail =
      category === 'gold' ? goldTail(rnd) : category === 'pretty' ? prettyTail(rnd) : randomTail(rnd)
    const score = beautyScore(tail)

    // подтверждаем категорию по score (tier): basic→usual, silver→pretty, gold+→gold
    const tier = tierFromScore(score)
    const actual = categoryFromTier(tier)
    if (category === 'gold' && (actual !== 'gold' || score < 55)) continue
    if (category === 'pretty' && actual === 'usual') continue

    const digits = `7${code}${tail}`
    if (seen.has(digits)) continue
    seen.add(digits)

    items.push({
      key: `pm_${digits}`,
      digits,
      number: formatNumber(digits),
      regionCode: code,
      regionName: region.name,
      tier,
      beautyScore: score,
      price: phonePriceFor(actual, score, rnd),
      category: actual,
      trait: traitFor(actual, score, rnd),
      popularity: popularityFor(actual),
      unique: uniqueFor(score),
    })
  }

  // золото вперёд, дороже выше
  const order: Record<PhoneMarketCategory, number> = { gold: 0, pretty: 1, usual: 2 }
  items.sort((a, b) => order[a.category] - order[b.category] || b.price - a.price)
  return items
}
