// ДИНАМИЧЕСКИЙ ИНДЕКС ЦЕН Resale (fs-файл, БЕЗ изменений prisma-схемы).
// На каждую сделку цена товара нормализуется к состоянию и уходит в EMA-агрегат
// по itemKey и категории (полураспад ~3 дня). Спрос (массовые скупки категории)
// добавляет давление вверх — цены в чатах ползут за рынком автоматически.
// Волны рынка: lazy-тик при запросе пульса — раз в несколько часов дрейф
// категории на ±5..12% с новостной строчкой. Капы индекса: 0.7..1.4 от базы каталога.
import { promises as fsp } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { CATALOG } from '@/lib/catalog-data'
import { CATEGORY_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import { itemImage } from '@/lib/item-images'
import type { PulseItemDTO } from '@/lib/types'

const INDEX_FILE = path.join(process.cwd(), 'db', 'market-index.json')

const HALF_LIFE_MS = 3 * 86_400_000 // полураспад EMA ~3 дня
const CAP_MIN = 0.7
const CAP_MAX = 1.4
const DEMAND_PER_DEAL = 0.004 // +0.4% к индексу за сделку в категории за сутки
const DEMAND_CAP = 0.12 // максимум +12% от спроса
const WAVE_MIN_INTERVAL_MS = 2.2 * 3_600_000 // волны не чаще, чем раз в ~2-4.5 часа
const WAVE_MAX_INTERVAL_MS = 4.5 * 3_600_000
const MOVE_KEEP_MS = 24 * 3_600_000 // движения дня храним сутки
const HEADLINE_KEEP_MS = 24 * 3_600_000

interface IndexEntry { ema: number; n: number; lastAt: number }
interface Wave { id: string; category: string; delta: number; headline: string; at: number; expiresAt: number }
interface DayMove { itemKey: string; category: string; firstRatio: number; lastRatio: number; lastPrice: number; n: number; at: number }
interface MarketIndexFile {
  version: 1
  updatedAt: number
  items: Record<string, IndexEntry>
  cats: Record<string, IndexEntry>
  demand: Record<string, { n: number; at: number }> // сделки за сутки по категориям
  moves: DayMove[] // движения за день (для пульса)
  waves: Wave[]
  headlines: { text: string; at: number }[]
  wavesTickAt: number
  wavesNextAt: number
}

const CAT_OF: Record<string, string> = Object.fromEntries(CATALOG.map((c) => [c.key, c.category]))
const BASE_OF: Record<string, number> = Object.fromEntries(CATALOG.map((c) => [c.key, c.basePrice]))
const TITLE_OF: Record<string, string> = Object.fromEntries(CATALOG.map((c) => [c.key, c.title]))

function emptyFile(): MarketIndexFile {
  return {
    version: 1, updatedAt: 0,
    items: {}, cats: {}, demand: {}, moves: [], waves: [], headlines: [],
    wavesTickAt: 0, wavesNextAt: 0,
  }
}

// сериализация доступа к файлу в рамках процесса + кеш в памяти
const g = globalThis as unknown as { __marketIdxState?: { file: MarketIndexFile | null; chain: Promise<unknown> } }
g.__marketIdxState ??= { file: null, chain: Promise.resolve() }

function clampIndex(v: number): number {
  return Math.min(CAP_MAX, Math.max(CAP_MIN, v))
}

/** EMA-обновление: вес точки растёт со временем, прошедшим с прошлой сделки (полураспад). */
function emaUpdate(e: IndexEntry | undefined, ratio: number, now: number): IndexEntry {
  if (!e || e.n <= 0 || e.lastAt <= 0) return { ema: ratio, n: 1, lastAt: now }
  const dt = Math.max(0, now - e.lastAt)
  const w = 1 - Math.pow(0.5, dt / HALF_LIFE_MS) // 0..1
  const k = Math.max(0.08, Math.min(0.9, w)) // даже мгновенно следующая сделка двигает чуть-чуть
  return { ema: e.ema * (1 - k) + ratio * k, n: e.n + 1, lastAt: now }
}

async function loadFile(): Promise<MarketIndexFile> {
  if (g.__marketIdxState!.file) return g.__marketIdxState!.file!
  try {
    const raw = await fsp.readFile(INDEX_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<MarketIndexFile>
    if (parsed && parsed.version === 1) {
      g.__marketIdxState!.file = { ...emptyFile(), ...parsed }
      return g.__marketIdxState!.file!
    }
  } catch { /* нет файла — начнём с пустого */ }
  const fresh = emptyFile()
  g.__marketIdxState!.file = fresh
  return fresh
}

/** Атомарная запись: tmp + rename, с мержем поверх свежего файла с диска (защита от нескольких писателей). */
async function saveFile(file: MarketIndexFile): Promise<void> {
  file.updatedAt = Date.now()
  g.__marketIdxState!.file = file
  const prev = g.__marketIdxState!.chain
  g.__marketIdxState!.chain = prev.then(async () => {
    try {
      await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true })
      // другой процесс (скрипты/второй инстанс) мог уйти вперёд — мержим, не затираем
      let disk: MarketIndexFile | null = null
      try {
        const parsed = JSON.parse(await fsp.readFile(INDEX_FILE, 'utf8')) as Partial<MarketIndexFile>
        if (parsed && parsed.version === 1) disk = { ...emptyFile(), ...parsed }
      } catch { /* нет файла — пишем как есть */ }
      const merged = disk ? mergeFiles(disk, file) : file
      g.__marketIdxState!.file = merged
      const tmp = `${INDEX_FILE}.${process.pid}.tmp`
      await fsp.writeFile(tmp, JSON.stringify(merged), 'utf8')
      await fsp.rename(tmp, INDEX_FILE)
    } catch {
      // индекс не критичен: игра живёт и без файла
    }
  })
  await g.__marketIdxState!.chain
}

function newerOf<T extends { lastAt?: number; at?: number }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b
  if (!b) return a
  return ((b.lastAt ?? b.at ?? 0) >= (a.lastAt ?? a.at ?? 0)) ? b : a
}

/** Мерж: наш снимок (ours) поверх диска (disk) — по «новейшей записи» на ключ. */
function mergeFiles(disk: MarketIndexFile, ours: MarketIndexFile): MarketIndexFile {
  const out: MarketIndexFile = { ...disk, items: { ...disk.items }, cats: { ...disk.cats }, demand: { ...disk.demand } }
  for (const [k, v] of Object.entries(ours.items)) out.items[k] = newerOf(out.items[k], v)!
  for (const [k, v] of Object.entries(ours.cats)) out.cats[k] = newerOf(out.cats[k], v)!
  for (const [k, v] of Object.entries(ours.demand)) out.demand[k] = newerOf(out.demand[k], v)!
  // движения дня: по itemKey, побеждает новейшая запись
  const byKey = new Map<string, DayMove>()
  for (const m of [...(disk.moves ?? []), ...(ours.moves ?? [])]) {
    const cur = byKey.get(m.itemKey)
    byKey.set(m.itemKey, cur ? (newerOf(cur, m) as DayMove) : m)
  }
  out.moves = [...byKey.values()].filter((m) => Date.now() - m.at < MOVE_KEEP_MS).slice(-60)
  // волны и новости: объединение без дублей
  const waveIds = new Set(disk.waves.map((w) => w.id))
  out.waves = [...disk.waves, ...ours.waves.filter((w) => !waveIds.has(w.id))]
    .filter((w) => w.expiresAt > Date.now()).slice(-6)
  const seenH = new Set(disk.headlines.map((h) => h.text))
  out.headlines = [...disk.headlines, ...ours.headlines.filter((h) => !seenH.has(h.text))]
    .filter((h) => Date.now() - h.at < HEADLINE_KEEP_MS).slice(-8)
  // тик волн: берём самый «поздний» график, чтобы две волны не родились подряд
  out.wavesTickAt = Math.max(disk.wavesTickAt ?? 0, ours.wavesTickAt ?? 0)
  out.wavesNextAt = Math.max(disk.wavesNextAt ?? 0, ours.wavesNextAt ?? 0)
  out.updatedAt = Date.now()
  return out
}

/** Сглаженный индекс категории: EMA + спрос за сутки + активные волны. */
function catIndexRaw(file: MarketIndexFile, category: string, now: number): number {
  const e = file.cats[category]
  const demand = file.demand[category]
  let idx = e && e.n > 0 ? e.ema : 1
  if (demand && now - demand.at < MOVE_KEEP_MS) {
    idx *= 1 + Math.min(DEMAND_CAP, demand.n * DEMAND_PER_DEAL)
  }
  for (const w of file.waves) {
    if (w.category !== category || w.expiresAt <= now) continue
    idx *= 1 + w.delta * 0.5 // половина волны «вшита» в EMA при создании, здесь живая часть
  }
  return idx
}

/**
 * Индекс товара (0.7..1.4): EMA товара смешивается с индексом его категории.
 * Пока у товара мало сделок (n < 3), преобладает категория.
 */
export async function getItemIndex(itemKey: string): Promise<number> {
  const file = await loadFile()
  const now = Date.now()
  const category = CAT_OF[itemKey]
  const cat = category ? catIndexRaw(file, category, now) : 1
  const item = file.items[itemKey]
  if (!item || item.n <= 0) return clampIndex(cat)
  const wItem = Math.min(0.75, 0.25 + item.n * 0.1) // 1 сделка — 35%, 5+ — 75%
  return clampIndex(item.ema * wItem + cat * (1 - wItem))
}

/** Рыночная цена товара: база каталога × индекс (капы 0.7..1.4). */
export async function getMarketPrice(itemKey: string): Promise<number> {
  const base = BASE_OF[itemKey] ?? 0
  if (!base) return 0
  const idx = await getItemIndex(itemKey)
  return Math.round(base * idx)
}

/** Оценка объявления с учётом состояния: база × состояние × индекс. */
export async function getMarketValue(baseValue: number, itemKey: string, condition: string): Promise<number> {
  const idx = await getItemIndex(itemKey)
  return Math.round(baseValue * (CONDITION_MULT[condition] ?? 0.8) * idx)
}

export interface SaleForIndex {
  itemKey: string
  category: string
  price: number
  condition: string
}

/** Записать цену сделки в индекс (вызывается там, где завершается сделка). */
export async function recordSale(sale: SaleForIndex): Promise<void> {
  const base = BASE_OF[sale.itemKey]
  const condMult = CONDITION_MULT[sale.condition] ?? 0.8
  const price = Math.round(sale.price)
  if (!base || base <= 0 || price <= 0 || condMult <= 0) return
  const now = Date.now()
  const ratio = Math.max(CAP_MIN * 0.5, Math.min(CAP_MAX * 1.6, price / (base * condMult)))

  const file = await loadFile()
  file.items[sale.itemKey] = emaUpdate(file.items[sale.itemKey], ratio, now)
  file.cats[sale.category] = emaUpdate(file.cats[sale.category], ratio, now)

  // спрос: скупки категории за последние сутки двигают индекс вверх
  const d = file.demand[sale.category]
  file.demand[sale.category] = d && now - d.at < MOVE_KEEP_MS ? { n: d.n + 1, at: now } : { n: 1, at: now }

  // движение дня (для пульса «за день»)
  const cur = file.moves.find((m) => m.itemKey === sale.itemKey)
  if (!cur) {
    file.moves.push({ itemKey: sale.itemKey, category: sale.category, firstRatio: ratio, lastRatio: ratio, lastPrice: price, n: 1, at: now })
  } else {
    cur.lastRatio = ratio
    cur.lastPrice = price
    cur.n += 1
    cur.at = now
  }
  file.moves = file.moves.filter((m) => now - m.at < MOVE_KEEP_MS).slice(-60)

  // подрезаем старые волны и новости
  file.waves = file.waves.filter((w) => w.expiresAt > now).slice(-6)
  file.headlines = file.headlines.filter((h) => now - h.at < HEADLINE_KEEP_MS).slice(-8)

  await saveFile(file)
}

// ---------- ВОЛНЫ РЫНКА (lazy tick) ----------

const WAVE_HEADLINES_UP: Record<string, string[]> = {
  default: [
    'Спрос на «{cat}» подскочил — цены в чатах поехали вверх',
    '«{cat}»: покупатели смели лучшие предложения, продавцы задирают ценники',
    'Тренд недели: «{cat}» в цене, торгуются неохотно',
  ],
  phones: ['Спрос на телефоны подскочил — свежие айфоны в дефиците'],
  electronics: ['Спрос на приставки подскочил: геймеры смели консоли'],
  appliances: ['Пылесосы и техника для дома резко подорожали — сезон уборки'],
  laptops: ['Ноутбуки в цене: студенты и удалёнка разобрали склады'],
  sneakers: ['Кроссовки на хайпе — редкие размеры уходят за час'],
  clothes: ['Одежда брендов в тренде, секонды пустеют'],
  furniture: ['Мебель подорожала: сезон переездов в разгаре'],
  music: ['Гитары и синты разлетаются: музыканты готовятся к сезону'],
  sport: ['Спортинвентарь в цене: все побежали к лету'],
  kids: ['Детское подорожало — родители смели коляски'],
  auto: ['Автотовары в цене: сезон выездов открыт'],
  books: ['Книги внезапно в тренде — тиражи сметают'],
  hobby: ['Хобби-товары на пике: коллекционеры активировались'],
}

function waveHeadline(category: string, up: boolean): string {
  const pool = up ? (WAVE_HEADLINES_UP[category] ?? WAVE_HEADLINES_UP.default) : [
    'Рынок «{cat}» остывает: предложение превысило спрос, цены вниз',
    'На рынок выбросили партию «{cat}» — продавцы демпингуют',
    'Сезонный спад: цены на «{cat}» поехали вниз',
  ]
  const tpl = pool[Math.floor(Math.random() * pool.length)]
  const label = CATEGORY_LABEL[category] ?? category
  return tpl.replace('{cat}', label)
}

/**
 * Ленивый тик волн: вызывается при запросе пульса.
 * Без внешних таймеров: если подошло время — дрейф индекса категории ±5..12%.
 */
export async function marketWavesTick(): Promise<void> {
  const now = Date.now()
  const file = await loadFile()
  if (file.wavesNextAt && now < file.wavesNextAt) return
  file.wavesTickAt = now
  file.wavesNextAt = now + WAVE_MIN_INTERVAL_MS + Math.random() * (WAVE_MAX_INTERVAL_MS - WAVE_MIN_INTERVAL_MS)

  const cats = [...new Set(Object.values(CAT_OF))]
  const category = cats[Math.floor(Math.random() * cats.length)]
  const up = Math.random() < 0.5
  const delta = (0.05 + Math.random() * 0.07) * (up ? 1 : -1) // ±5..12%

  // дрейф EMA категории (наполовину) — долгий след волны
  const e = file.cats[category]
  const base = e && e.n > 0 ? e.ema : 1
  file.cats[category] = { ema: clampIndex(base * (1 + delta * 0.5)), n: (e?.n ?? 0) + 1, lastAt: now }

  const headline = waveHeadline(category, up)
  file.waves.push({ id: `w_${now.toString(36)}`, category, delta, headline, at: now, expiresAt: now + (4 + Math.random() * 4) * 3_600_000 })
  file.waves = file.waves.filter((w) => w.expiresAt > now).slice(-6)
  file.headlines = [...file.headlines.filter((h) => now - h.at < HEADLINE_KEEP_MS), { text: headline, at: now }].slice(-8)

  await saveFile(file)

  // синхронизируем БД-индекс (его использует движок ботов для цен объявлений) — лёгкий сдвиг
  try {
    const row = await db.marketIndex.findUnique({ where: { category } })
    if (row) {
      const mult = Math.min(1.75, Math.max(0.55, row.multiplier * (1 + delta * 0.35)))
      await db.marketIndex.update({ where: { category }, data: { multiplier: mult } })
    }
  } catch { /* не критично */ }
}

// ---------- ПУЛЬС ----------

export interface MarketPulseData {
  moves: PulseItemDTO[]
  headline: string | null
}

/** Данные пульса: топ-движения за час (PricePoint) + за день (индекс), новостная строка волн. */
export async function marketPulseData(): Promise<MarketPulseData> {
  const now = Date.now()
  const file = await loadFile()
  const headline = [...file.waves].filter((w) => w.expiresAt > now).sort((a, b) => b.at - a.at)[0]?.headline
    ?? [...file.headlines].sort((a, b) => b.at - a.at).find((h) => now - h.at < 12 * 3_600_000)?.text
    ?? null

  const byKey = new Map<string, PulseItemDTO>()

  // a) движения за час из истории цен (честная динамика объявлений)
  const since = new Date(now - 60 * 60_000)
  const points = await db.pricePoint
    .findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: 'asc' } })
    .catch(() => [])
  if (points.length >= 2) {
    const mid = since.getTime() + 30 * 60_000
    const groups = new Map<string, { minFirst: number; minLast: number; n: number }>()
    for (const p of points) {
      const cur = groups.get(p.itemKey) ?? { minFirst: 0, minLast: 0, n: 0 }
      cur.n += 1
      if (p.createdAt.getTime() < mid) cur.minFirst = cur.minFirst === 0 ? p.price : Math.min(cur.minFirst, p.price)
      else cur.minLast = cur.minLast === 0 ? p.price : Math.min(cur.minLast, p.price)
      groups.set(p.itemKey, cur)
    }
    for (const [itemKey, gr] of groups) {
      if (gr.minFirst <= 0 || gr.minLast <= 0) continue
      const deltaPct = Math.round((gr.minLast / gr.minFirst - 1) * 100)
      if (Math.abs(deltaPct) < 3) continue
      const item = CATALOG.find((c) => c.key === itemKey)
      if (!item) continue
      byKey.set(itemKey, {
        itemKey, title: item.title, category: item.category,
        price: gr.minLast, deltaPct, moves: gr.n,
        image: itemImage(itemKey, item.category),
      })
    }
  }

  // b) движения за день из индекса (соотношение нормализованных цен сделок)
  for (const m of file.moves) {
    if (m.n < 2 || now - m.at > MOVE_KEEP_MS) continue
    const deltaPct = Math.round((m.lastRatio / m.firstRatio - 1) * 100)
    if (Math.abs(deltaPct) < 4 || m.lastPrice <= 0) continue // день двигается медленнее — порог выше
    if (byKey.has(m.itemKey)) continue // часовая динамика точнее — оставляем её
    byKey.set(m.itemKey, {
      itemKey: m.itemKey, title: TITLE_OF[m.itemKey] ?? m.itemKey, category: m.category,
      price: m.lastPrice, deltaPct, moves: m.n,
      image: itemImage(m.itemKey, m.category),
    })
  }

  const moves = [...byKey.values()]
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    .slice(0, 5)

  return { moves, headline }
}
