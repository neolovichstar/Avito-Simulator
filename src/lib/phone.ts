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
  /** Короткое имя для штампа на плашке (город/аббревиатура). */
  short: string
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

/** Блатные федеральные коды — вынуты из общего мобильного пула, только у элиты. */
export const GOLD_CODES = ['777', '888', '999']
/** Столичные статусные мобильные (Москва): дороже и престижнее прочих. */
const CAPITAL_CODES = ['985', '916', '925']

/** Код — блатной (777/888/999): золотая плашка и штамп. */
export function isGoldCode(code: string): boolean {
  return GOLD_CODES.includes(code)
}

/**
 * Все субъекты РФ: топ-3 (Москва/СПб/блатные федеральные) впереди,
 * дальше миллионники и областные центры по убыванию престижа, в конце —
 * национальные республики и дальневосточная глубинка.
 */
export const REGIONS: Region[] = [
  { id: 'msk', name: 'Москва', short: 'Москва', codes: ['495', '499'], prestige: 1.2, rollPrice: 700 },
  { id: 'spb', name: 'Санкт-Петербург', short: 'СПб', codes: ['812'], prestige: 1.1, rollPrice: 650 },
  { id: 'gold', name: 'Блатные федеральные', short: 'Блатные', codes: GOLD_CODES, prestige: 1.4, rollPrice: 1000 },
  { id: 'cap', name: 'Столичные мобильные', short: 'Столичные', codes: CAPITAL_CODES, prestige: 1.15, rollPrice: 750 },
  { id: 'mob', name: 'Мобильные федеральные', short: 'Мобильные', codes: range(900, 999).filter((c) => !GOLD_CODES.includes(c) && !CAPITAL_CODES.includes(c)), prestige: 1.0, rollPrice: 600 },

  // миллионники и крупные центры
  { id: 'kzn', name: 'Казань', short: 'Казань', codes: ['843'], prestige: 1.0, rollPrice: 600 },
  { id: 'ekb', name: 'Екатеринбург', short: 'Екатеринбург', codes: ['343'], prestige: 1.0, rollPrice: 600 },
  { id: 'nsk', name: 'Новосибирск', short: 'Новосибирск', codes: ['383'], prestige: 1.0, rollPrice: 600 },
  { id: 'krd', name: 'Краснодар', short: 'Краснодар', codes: ['861'], prestige: 1.0, rollPrice: 600 },
  { id: 'kry', name: 'Крым', short: 'Крым', codes: ['365'], prestige: 0.95, rollPrice: 600 },
  { id: 'nng', name: 'Нижний Новгород', short: 'Н.Новгород', codes: ['831'], prestige: 0.95, rollPrice: 600 },
  { id: 'vrn', name: 'Воронеж', short: 'Воронеж', codes: ['473'], prestige: 0.95, rollPrice: 600 },
  { id: 'sam', name: 'Самара', short: 'Самара', codes: ['846'], prestige: 0.95, rollPrice: 600 },
  { id: 'ufa', name: 'Уфа', short: 'Уфа', codes: ['347'], prestige: 0.95, rollPrice: 600 },
  { id: 'rnd', name: 'Ростов-на-Дону', short: 'Ростов', codes: ['863'], prestige: 0.95, rollPrice: 600 },
  { id: 'kras', name: 'Красноярск', short: 'Красноярск', codes: ['391'], prestige: 0.95, rollPrice: 600 },
  { id: 'pri', name: 'Приморский край', short: 'Владивосток', codes: ['423'], prestige: 0.9, rollPrice: 550 },
  { id: 'chb', name: 'Челябинск', short: 'Челябинск', codes: ['351'], prestige: 0.9, rollPrice: 550 },
  { id: 'omsk', name: 'Омск', short: 'Омск', codes: ['381'], prestige: 0.9, rollPrice: 550 },
  { id: 'perm', name: 'Пермь', short: 'Пермь', codes: ['342'], prestige: 0.9, rollPrice: 550 },
  { id: 'vgd', name: 'Волгоград', short: 'Волгоград', codes: ['844'], prestige: 0.9, rollPrice: 550 },
  { id: 'sev', name: 'Севастополь', short: 'Севастополь', codes: ['869'], prestige: 0.9, rollPrice: 550 },
  { id: 'kld', name: 'Калининградская область', short: 'Кёниг', codes: ['401'], prestige: 0.9, rollPrice: 550 },
  { id: 'mo', name: 'Московская область', short: 'МО', codes: ['498'], prestige: 0.9, rollPrice: 550 },
  { id: 'irk', name: 'Иркутская область', short: 'Иркутск', codes: ['395'], prestige: 0.85, rollPrice: 550 },
  { id: 'tyu', name: 'Тюменская область', short: 'Тюмень', codes: ['345'], prestige: 0.85, rollPrice: 550 },
  { id: 'hma', name: 'ХМАО — Югра', short: 'ХМАО', codes: ['346'], prestige: 0.85, rollPrice: 550 },
  { id: 'lo', name: 'Ленинградская область', short: 'Лен. обл.', codes: ['813'], prestige: 0.85, rollPrice: 550 },

  // Центральная Россия
  { id: 'vld', name: 'Владимирская область', short: 'Владимир', codes: ['492'], prestige: 0.85, rollPrice: 550 },
  { id: 'ryz', name: 'Рязанская область', short: 'Рязань', codes: ['491'], prestige: 0.85, rollPrice: 550 },
  { id: 'tvr', name: 'Тверская область', short: 'Тверь', codes: ['482'], prestige: 0.85, rollPrice: 550 },
  { id: 'tul', name: 'Тульская область', short: 'Тула', codes: ['487'], prestige: 0.85, rollPrice: 550 },
  { id: 'yar', name: 'Ярославская область', short: 'Ярославль', codes: ['485'], prestige: 0.85, rollPrice: 550 },
  { id: 'klg', name: 'Калужская область', short: 'Калуга', codes: ['484'], prestige: 0.85, rollPrice: 550 },
  { id: 'blg', name: 'Белгородская область', short: 'Белгород', codes: ['472'], prestige: 0.85, rollPrice: 550 },
  { id: 'brn', name: 'Брянская область', short: 'Брянск', codes: ['483'], prestige: 0.8, rollPrice: 500 },
  { id: 'ivn', name: 'Ивановская область', short: 'Иваново', codes: ['493'], prestige: 0.8, rollPrice: 500 },
  { id: 'kos', name: 'Костромская область', short: 'Кострома', codes: ['494'], prestige: 0.8, rollPrice: 500 },
  { id: 'krs', name: 'Курская область', short: 'Курск', codes: ['471'], prestige: 0.8, rollPrice: 500 },
  { id: 'lpc', name: 'Липецкая область', short: 'Липецк', codes: ['474'], prestige: 0.8, rollPrice: 500 },
  { id: 'smr', name: 'Смоленская область', short: 'Смоленск', codes: ['481'], prestige: 0.8, rollPrice: 500 },
  { id: 'orl', name: 'Орловская область', short: 'Орёл', codes: ['486'], prestige: 0.75, rollPrice: 500 },
  { id: 'tmb', name: 'Тамбовская область', short: 'Тамбов', codes: ['475'], prestige: 0.75, rollPrice: 500 },

  // Северо-Запад
  { id: 'arh', name: 'Архангельская область', short: 'Архангельск', codes: ['818'], prestige: 0.75, rollPrice: 500 },
  { id: 'vlg', name: 'Вологодская область', short: 'Вологда', codes: ['817'], prestige: 0.75, rollPrice: 500 },
  { id: 'mur', name: 'Мурманская область', short: 'Мурманск', codes: ['815'], prestige: 0.75, rollPrice: 500 },
  { id: 'nov', name: 'Новгородская область', short: 'Новгород', codes: ['816'], prestige: 0.75, rollPrice: 500 },
  { id: 'kar', name: 'Республика Карелия', short: 'Карелия', codes: ['814'], prestige: 0.75, rollPrice: 500 },
  { id: 'psk', name: 'Псковская область', short: 'Псков', codes: ['811'], prestige: 0.7, rollPrice: 450 },
  { id: 'kom', name: 'Республика Коми', short: 'Коми', codes: ['821'], prestige: 0.7, rollPrice: 450 },

  // Юг и Кавказ
  { id: 'ast', name: 'Астраханская область', short: 'Астрахань', codes: ['851'], prestige: 0.75, rollPrice: 500 },
  { id: 'sta', name: 'Ставропольский край', short: 'Ставрополь', codes: ['865'], prestige: 0.8, rollPrice: 500 },
  { id: 'dag', name: 'Республика Дагестан', short: 'Дагестан', codes: ['872'], prestige: 0.8, rollPrice: 500 },
  { id: 'che', name: 'Чеченская Республика', short: 'Чечня', codes: ['871'], prestige: 0.7, rollPrice: 450 },
  { id: 'ose', name: 'Северная Осетия', short: 'Осетия', codes: ['867'], prestige: 0.65, rollPrice: 450 },
  { id: 'kbr', name: 'Кабардино-Балкария', short: 'КБР', codes: ['866'], prestige: 0.65, rollPrice: 450 },
  { id: 'adg', name: 'Республика Адыгея', short: 'Адыгея', codes: ['877'], prestige: 0.7, rollPrice: 450 },
  { id: 'kcr', name: 'Карачаево-Черкесия', short: 'КЧР', codes: ['878'], prestige: 0.6, rollPrice: 450 },
  { id: 'ing', name: 'Республика Ингушетия', short: 'Ингушетия', codes: ['873'], prestige: 0.6, rollPrice: 450 },
  { id: 'klm', name: 'Республика Калмыкия', short: 'Калмыкия', codes: ['847'], prestige: 0.6, rollPrice: 450 },

  // Поволжье
  { id: 'ore', name: 'Оренбургская область', short: 'Оренбург', codes: ['353'], prestige: 0.75, rollPrice: 500 },
  { id: 'sar', name: 'Саратовская область', short: 'Саратов', codes: ['845'], prestige: 0.75, rollPrice: 500 },
  { id: 'kir', name: 'Кировская область', short: 'Киров', codes: ['833'], prestige: 0.7, rollPrice: 450 },
  { id: 'uly', name: 'Ульяновская область', short: 'Ульяновск', codes: ['842'], prestige: 0.7, rollPrice: 450 },
  { id: 'udm', name: 'Удмуртская Республика', short: 'Удмуртия', codes: ['341'], prestige: 0.65, rollPrice: 450 },
  { id: 'chv', name: 'Чувашская Республика', short: 'Чувашия', codes: ['835'], prestige: 0.65, rollPrice: 450 },
  { id: 'pnz', name: 'Пензенская область', short: 'Пенза', codes: ['841'], prestige: 0.65, rollPrice: 450 },
  { id: 'mri', name: 'Республика Марий Эл', short: 'Марий Эл', codes: ['836'], prestige: 0.6, rollPrice: 450 },
  { id: 'mrd', name: 'Республика Мордовия', short: 'Мордовия', codes: ['834'], prestige: 0.6, rollPrice: 450 },

  // Урал
  { id: 'yna', name: 'ЯНАО', short: 'ЯНАО', codes: ['349'], prestige: 0.75, rollPrice: 500 },
  { id: 'kgn', name: 'Курганская область', short: 'Курган', codes: ['352'], prestige: 0.6, rollPrice: 450 },

  // Сибирь
  { id: 'altk', name: 'Алтайский край', short: 'Барнаул', codes: ['385'], prestige: 0.75, rollPrice: 500 },
  { id: 'kem', name: 'Кемеровская область — Кузбасс', short: 'Кемерово', codes: ['384'], prestige: 0.75, rollPrice: 500 },
  { id: 'tom', name: 'Томская область', short: 'Томск', codes: ['382'], prestige: 0.75, rollPrice: 500 },
  { id: 'alt', name: 'Республика Алтай', short: 'Горный Алтай', codes: ['388'], prestige: 0.65, rollPrice: 450 },
  { id: 'hak', name: 'Республика Хакасия', short: 'Хакасия', codes: ['390'], prestige: 0.6, rollPrice: 450 },
  { id: 'tyv', name: 'Республика Тыва', short: 'Тыва', codes: ['394'], prestige: 0.55, rollPrice: 450 },

  // Дальний Восток
  { id: 'hab', name: 'Хабаровский край', short: 'Хабаровск', codes: ['421'], prestige: 0.75, rollPrice: 500 },
  { id: 'sak', name: 'Республика Саха — Якутия', short: 'Якутия', codes: ['411'], prestige: 0.7, rollPrice: 450 },
  { id: 'shl', name: 'Сахалинская область', short: 'Сахалин', codes: ['424'], prestige: 0.7, rollPrice: 450 },
  { id: 'amu', name: 'Амурская область', short: 'Благовещенск', codes: ['416'], prestige: 0.65, rollPrice: 450 },
  { id: 'bry', name: 'Республика Бурятия', short: 'Бурятия', codes: ['301'], prestige: 0.65, rollPrice: 450 },
  { id: 'kam', name: 'Камчатский край', short: 'Камчатка', codes: ['415'], prestige: 0.65, rollPrice: 450 },
  { id: 'zab', name: 'Забайкальский край', short: 'Чита', codes: ['302'], prestige: 0.6, rollPrice: 450 },
  { id: 'mag', name: 'Магаданская область', short: 'Магадан', codes: ['413'], prestige: 0.55, rollPrice: 450 },
  { id: 'evr', name: 'Еврейская автономная область', short: 'ЕАО', codes: ['426'], prestige: 0.5, rollPrice: 450 },
  { id: 'chuk', name: 'Чукотский автономный округ', short: 'Чукотка', codes: ['427'], prestige: 0.5, rollPrice: 450 },
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

/**
 * Код региона: первый код в списке — «лицо» региона (у блатных — 777,
 * у Москвы — 495) и выпадает в большинстве круток, остальные коды делят остаток.
 * Раньше код выбирался равномерно — из-за этого блатной регион почти не давал 777.
 */
function pickCode(region: Region): string {
  const codes = region.codes
  if (codes.length === 1) return codes[0]
  if (Math.random() < 0.6) return codes[0]
  return pick(codes.slice(1))
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
  const code = pickCode(region)
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
