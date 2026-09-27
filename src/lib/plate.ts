// ─────────────────────────────────────────────────────────────────────────────
// Автономера (ГОСТ-знаки): генерация, редкость, цена.
// Чистая логика без 'use client' — используется /api/plates/* и клиентом.
//
// Формат знака:  [Б] [###] [ББ] | [регион]
//   Б   — одна буква из АВЕКМНОРСТУХ
//   ### — три цифры
//   ББ  — две буквы из АВЕКМНОРСТУХ
//   регион — код субъекта РФ (77, 716, …)
// ─────────────────────────────────────────────────────────────────────────────

export type PlateRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'

export const PLATE_LETTERS = 'АВЕКМНОРСТУХ'.split('')

export const RARITY_LABEL: Record<PlateRarity, string> = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
  mythic: 'Блатной',
}

/** Неоновые цвета подсветки знака по редкости. */
export const RARITY_NEON: Record<PlateRarity, string> = {
  common: '#94A3B8',
  rare: '#38BDF8',
  epic: '#A855F7',
  legendary: '#F59E0B',
  mythic: '#F43F5E',
}

export const RARITY_MULT: Record<PlateRarity, number> = {
  common: 1,
  rare: 3,
  epic: 8,
  legendary: 22,
  mythic: 60,
}

export interface PlateOffer {
  letters: string // «ВС» — две буквы хвоста
  first: string // «А» — первая буква
  digits: string // «123»
  regionCode: string // «777»
  regionName: string
  rarity: PlateRarity
  beautyScore: number
  price: number
}

// ── утилиты ──

function rnd(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] / 4294967296
  }
  return Math.random()
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]
}

function weighted(options: { value: string; w: number }[]): string {
  const total = options.reduce((s, o) => s + o.w, 0)
  let r = rnd() * total
  for (const o of options) {
    r -= o.w
    if (r <= 0) return o.value
  }
  return options[options.length - 1].value
}

// ── генерация ──

/** Три цифры с сидированными «красивыми» паттернами (шанс растёт с престижем). */
export function generatePlateDigits(prestige: number): string {
  const fancy = Math.min(0.42, 0.18 + prestige * 0.18) // до 42% красивых
  if (rnd() < fancy) {
    const kind = weighted([
      { value: 'repeat', w: 3 }, // 777, 555
      { value: 'palindrome', w: 2.5 }, // 121, 373
      { value: 'sequence', w: 2 }, // 123, 789
      { value: 'zerox', w: 2 }, // 007, 001
      { value: 'round', w: 2 }, // 100, 500
    ])
    switch (kind) {
      case 'repeat': {
        // у статусных регионов чаще выпадает 7 и 9
        const d = weighted([
          { value: '7', w: prestige * 3 },
          { value: '9', w: prestige * 2 },
          { value: '8', w: prestige * 1.5 },
          { value: '1', w: 2 },
          { value: '3', w: 1.4 },
          { value: '5', w: 1.4 },
          { value: '2', w: 1 },
          { value: '6', w: 1 },
          { value: '4', w: 1 },
          { value: '0', w: 0.5 },
        ])
        return d + d + d
      }
      case 'palindrome': {
        const a = pick(['1', '2', '3', '4', '5', '6', '7', '9'])
        const b = pick(['2', '3', '4', '5', '6', '8'])
        return a + b + a
      }
      case 'sequence': {
        const start = pick(['1', '2', '3', '4', '5', '6', '7'])
        const up = rnd() < 0.6
        const d1 = Number(start)
        const d2 = up ? d1 + 1 : d1 - 1
        const d3 = up ? d1 + 2 : d1 - 2
        if (d3 < 0 || d3 > 9) return `${d1}${d2}${Math.abs(d3)}`
        return `${d1}${d2}${d3}`
      }
      case 'zerox':
        return '00' + pick(['1', '2', '3', '5', '7', '9'])
      case 'round':
        return pick(['1', '2', '3', '5', '7', '9']) + '00'
    }
  }
  return String(Math.floor(rnd() * 1000)).padStart(3, '0')
}

/** Две буквы хвоста; при престиже чаще одинаковые и «статусные». */
export function generatePlateLetters(prestige: number): string {
  if (rnd() < Math.min(0.3, 0.1 + prestige * 0.14)) {
    const a = weighted(
      PLATE_LETTERS.map((l) => ({
        value: l,
        w: l === 'А' || l === 'М' ? 1.6 : l === 'В' || l === 'Е' ? 1.3 : 1,
      })),
    )
    return a + a
  }
  return pick(PLATE_LETTERS) + pick(PLATE_LETTERS)
}

export function generatePlateFirst(prestige: number): string {
  if (rnd() < Math.min(0.22, 0.08 + prestige * 0.1)) {
    return weighted([
      { value: 'А', w: 2.2 },
      { value: 'М', w: 1.8 },
      { value: 'В', w: 1.4 },
      { value: 'О', w: 1.2 },
      { value: 'Е', w: 1.2 },
      { value: 'Р', w: 1 },
      { value: 'Т', w: 1 },
    ])
  }
  return pick(PLATE_LETTERS)
}

// ── редкость и красота ──

export function plateBeautyScore(first: string, digits: string, letters: string): number {
  let s = 8
  const ds = digits.split('').map(Number)
  const repeated = digits[0] === digits[1] && digits[1] === digits[2]
  const pal = ds[0] === ds[2] && ds[0] !== ds[1]
  const seq = Math.abs(ds[0] - ds[1]) === 1 && Math.abs(ds[1] - ds[2]) === 1 && ds[0] !== ds[1]
  const sameTail = letters[0] === letters[1]
  const sameAll = sameTail && first === letters[0]

  if (repeated) s += 34
  if (['777', '999', '888', '111'].includes(digits)) s += 18
  if (pal) s += 16
  if (seq) s += 14
  if (digits[1] === digits[2] || digits[0] === digits[1]) s += 8
  if (digits.endsWith('00') || digits.startsWith('00')) s += 10
  if (sameTail) s += 12
  if (sameAll) s += 10
  if (first === 'А' || first === 'М') s += 5
  if (['7', '9'].includes(digits[0])) s += 4
  return Math.max(0, Math.min(100, s))
}

export function plateRarity(first: string, digits: string, letters: string): PlateRarity {
  const ds = digits.split('').map(Number)
  const repeated = digits[0] === digits[1] && digits[1] === digits[2]
  const pal = ds[0] === ds[2] && ds[0] !== ds[1]
  const seq = Math.abs(ds[0] - ds[1]) === 1 && Math.abs(ds[1] - ds[2]) === 1 && ds[0] !== ds[1]
  const sameTail = letters[0] === letters[1]
  const sameAll = sameTail && first === letters[0]

  if (['777', '999', '888', '111'].includes(digits)) return 'mythic'
  if (repeated && (sameTail || sameAll)) return 'mythic'
  if (repeated) return 'legendary'
  if (sameAll) return 'legendary'
  if (pal || seq || sameTail || /^00\d$/.test(digits)) return 'epic'
  if (digits[1] === digits[2] || digits[0] === digits[1] || /\d00$/.test(digits)) return 'rare'
  if (ds.reduce((a, b) => a + b, 0) >= 24) return 'rare'
  return 'common'
}

/** Цена выкупа: база × престиж региона × редкость + красота. */
export function platePrice(rarity: PlateRarity, prestige: number, beautyScore: number): number {
  const raw = 2500 * prestige * RARITY_MULT[rarity] + beautyScore * 40
  return Math.round(raw / 50) * 50
}

/** Цена одной прокрутки. */
export function plateRollPrice(prestige: number): number {
  return Math.round((450 * prestige) / 50) * 50
}

/** Собирает оффер целиком. */
export function makePlateOffer(regionCode: string, regionName: string, prestige: number, keep?: { digits?: string; letters?: string; first?: string }): PlateOffer {
  const digits = keep?.digits ?? generatePlateDigits(prestige)
  const letters = keep?.letters ?? generatePlateLetters(prestige)
  const first = keep?.first ?? generatePlateFirst(prestige)
  const rarity = plateRarity(first, digits, letters)
  const beautyScore = plateBeautyScore(first, digits, letters)
  return { first, digits, letters, regionCode, regionName, rarity, beautyScore, price: platePrice(rarity, prestige, beautyScore) }
}

/** Полный номер без разделителей — уникальный ключ в БД: «А123ВС777». */
export function plateKey(first: string, digits: string, letters: string, regionCode: string): string {
  return `${first}${digits}${letters}${regionCode}`
}

/** Человекочитаемый формат: «А 123 ВС». */
export function formatPlateBody(first: string, digits: string, letters: string): string {
  return `${first} ${digits} ${letters}`
}

/** Валидация частей знака (для покупки с клиента). */
export function isValidPlateParts(first: string, digits: string, letters: string, regionCode: string): boolean {
  return (
    PLATE_LETTERS.includes(first) &&
    PLATE_LETTERS.includes(letters[0]) &&
    PLATE_LETTERS.includes(letters[1]) &&
    /^\d{3}$/.test(digits) &&
    /^\d{2,3}$/.test(regionCode)
  )
}
