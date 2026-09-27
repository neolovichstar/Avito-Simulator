// Витрина «Автономеров»: ежедневный каталог премиальных знаков на продажу.
// Каталог генерируется детерминированно от даты (рынок стабилен в течение дня,
// утром обновляется), занятые знаки вычитаются из выдачи. Покупка — обычный
// POST /api/plates (пересчёт цены на сервере, списание баланса).
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { PLATE_LETTERS, plateBeautyScore, platePrice, plateRarity, type PlateRarity } from '@/lib/plate'
import { RF_SUBJECTS } from '@/lib/rf-regions'

export const dynamic = 'force-dynamic'

export interface PlateMarketItem {
  key: string
  first: string
  digits: string
  letters: string
  regionCode: string
  regionName: string
  rarity: PlateRarity
  beautyScore: number
  price: number
  category: 'vip' | 'elite' | 'top' | 'common'
  trait: string
}

// детерминированный ГПСЧ (mulberry32)
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]
}

/** Описательный признак знака (строки как в макете). */
function traitOf(first: string, digits: string, letters: string, regionCode: string, rarity: PlateRarity): string {
  if (regionCode === '777' || regionCode === '999') return 'Блатной регион'
  if (digits[0] === digits[1] && digits[1] === digits[2]) return 'Три одинаковые цифры'
  if (digits[0] === digits[2] && digits[0] !== digits[1]) return 'Зеркальная серия'
  if (digits[0] === digits[1] || digits[1] === digits[2]) return 'Две пары'
  if (letters[0] === letters[1]) return 'Зеркальные буквы'
  if (first === letters[0] || first === letters[1]) return 'Повторяющаяся серия'
  if (rarity === 'mythic') return 'Легендарный номер'
  if (rarity === 'legendary') return 'Крайне редкий'
  if (rarity === 'epic') return 'Популярный формат'
  if (rarity === 'rare') return 'Редкая комбинация'
  return 'Хороший вариант'
}

function categoryOf(rarity: PlateRarity): PlateMarketItem['category'] {
  if (rarity === 'mythic') return 'vip'
  if (rarity === 'legendary') return 'elite'
  if (rarity === 'epic') return 'top'
  if (rarity === 'rare') return 'top'
  return 'common'
}

const SIZE = 30

/** GET /api/plates/market — витрина дня (без авторизации можно, но у нас всё за сессией). */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()

  const daySeed = Number(
    `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`,
  )
  const rnd = mulberry32(daySeed)

  // тяжёлые регионы чаще: сортировка по престижу с шумом
  const pool = [...RF_SUBJECTS]
    .map((s) => ({ s, w: s.prestige + rnd() * 0.4 }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.s)

  const items: PlateMarketItem[] = []
  const seen = new Set<string>()

  // первые позиции — витрина «Популярные»: строим знак под целевую редкость,
  // чтобы блатной/легендарный выглядел блатным (777 / зеркала / пары букв)
  const targets: PlateRarity[] = ['mythic', 'legendary', 'legendary', 'epic', 'epic', 'epic', 'rare', 'rare']

  const buildFor = (rarity: PlateRarity, subject: (typeof RF_SUBJECTS)[number], regionCode: string) => {
    const d = () => Math.floor(rnd() * 10)
    const L = () => pick(rnd, PLATE_LETTERS)
    const rep = () => { const x = L(); return `${x}${x}` }
    if (rarity === 'mythic') {
      // 777 / буквы-пары + цифры-пары
      const x = String(d())
      const dig = pick(rnd, [`${x}${x}${x}`, `${x}${x}${d()}`])
      return { first: L(), digits: dig, letters: rep() }
    }
    if (rarity === 'legendary') {
      const a = d()
      const b = d()
      return { first: L(), digits: `${a}${b}${a}`, letters: rnd() < 0.5 ? rep() : `${L()}${L()}` }
    }
    if (rarity === 'epic') {
      const a = d()
      return { first: L(), digits: `${a}${a}${d()}`, letters: `${L()}${L()}` }
    }
    return { first: L(), digits: `${d()}${d()}${d()}`, letters: `${L()}${L()}` }
  }

  for (let i = 0; i < SIZE * 6 && items.length < SIZE; i++) {
    const subject = pick(rnd, pool.slice(0, Math.max(12, pool.length)))
    const regionCode = pick(rnd, subject.plateCodes)

    // цель: первые 8 позиций — редкие, дальше натуральный бросок
    const forced = targets[items.length]
    const parts = buildFor(forced ?? 'common', subject, regionCode)
    const rarity: PlateRarity = forced ?? plateRarity(parts.first, parts.digits, parts.letters)

    const beautyScore = plateBeautyScore(parts.first, parts.digits, parts.letters)
    const price = Math.round((platePrice(rarity, subject.prestige, beautyScore) * (0.9 + rnd() * 0.35)) / 1000) * 1000

    const key = `${parts.first}${parts.digits}${parts.letters}${regionCode}`
    if (seen.has(key)) continue
    seen.add(key)

    items.push({
      key,
      first: parts.first,
      digits: parts.digits,
      letters: parts.letters,
      regionCode,
      regionName: subject.name,
      rarity,
      beautyScore,
      price,
      category: categoryOf(rarity),
      trait: traitOf(parts.first, parts.digits, parts.letters, regionCode, rarity),
    })
  }

  // вычитаем занятые знаки
  const taken = await db.carPlate.findMany({ where: { plate: { in: items.map((i) => i.key) } }, select: { plate: true } })
  const takenSet = new Set(taken.map((t) => t.plate))
  const fresh = items.filter((i) => !takenSet.has(i.key))

  // топовые позиции вперёд
  const order: Record<PlateRarity, number> = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 }
  fresh.sort((a, b) => order[a.rarity] - order[b.rarity] || b.price - a.price)

  return Response.json({ items: fresh, updatedAt: new Date().toISOString() })
}
