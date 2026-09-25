// ПАМЯТЬ НЕЙРОНОК ОБ ИГРОКЕ (персистентная, серверная).
// Хранилище: User.stats JSON игрока (колонка уже есть, схема prisma НЕ меняется).
// Ключ botMemory: { [botUserId]: BotMemoryEntry } — у каждого бота своя память
// о своих общения с этим игроком. Перезаход в чат позицию бота НЕ сбрасывает:
// память читается с сервера при каждом ходе переговоров.
// Сюда пишутся: сделки (сколько/на какую сумму/со скидкой), сигналы переписки
// (лоуболы <40% цены, грубость, «согласился и передумал», похвала товара),
// кулдаун после выжранного терпения бота.

import { db } from '@/lib/db'

export interface BotMemoryEntry {
  deals: number // сколько сделок с этим ботом
  totalSpent: number // суммарный объём сделок, ₽
  avgDiscount: number // 0..1 — средняя скидка, выторгнутая у этого бота
  flags: string[] // lowballer | rude | scammer | good
  lastAt: number // ms последнего события
  notes: string[] // короткие человеческие заметки (новые в конце, max 5)
  categories?: string[] // что игрок у него берёт (max 3)
  cooldownUntil?: number // ms: бот пока «не общается» с игроком
  lowballs?: number // всего лоуболов
  rudeCount?: number
  scamFails?: number // согласился и передумал/пропал
  praised?: number
}

export type BotMemoryMap = Record<string, BotMemoryEntry>
const NOTE_MAX = 5
const CATEGORY_MAX = 3

function parseMemoryMap(statsRaw: string | null | undefined): BotMemoryMap {
  try {
    const stats = JSON.parse(statsRaw || '{}') as Record<string, unknown>
    const mem = stats.botMemory
    if (mem && typeof mem === 'object' && !Array.isArray(mem)) {
      return mem as BotMemoryMap
    }
  } catch { /* битый stats — начинаем с пустой памяти */ }
  return {}
}

/** Память конкретного бота об игроке (или null, если они ещё не общались). */
export async function getBotMemoryEntry(playerId: string, botId: string): Promise<BotMemoryEntry | null> {
  const user = await db.user.findUnique({ where: { id: playerId }, select: { stats: true } })
  if (!user) return null
  return parseMemoryMap(user.stats)[botId] ?? null
}

export async function getBotMemoryMap(playerId: string): Promise<BotMemoryMap> {
  const user = await db.user.findUnique({ where: { id: playerId }, select: { stats: true } })
  if (!user) return {}
  return parseMemoryMap(user.stats)
}

function ensureEntry(map: BotMemoryMap, botId: string): BotMemoryEntry {
  return map[botId] ?? { deals: 0, totalSpent: 0, avgDiscount: 0, flags: [], lastAt: 0, notes: [] }
}

function pushNote(entry: BotMemoryEntry, text: string): void {
  const day = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
  entry.notes = [...entry.notes, `${day}: ${text}`].slice(-NOTE_MAX)
}

function addFlag(entry: BotMemoryEntry, flag: string): void {
  if (!entry.flags.includes(flag)) entry.flags.push(flag)
}

// сериализация записи в рамках процесса — меньше гонок с bumpStats
const g = globalThis as unknown as { __botMemChain?: Promise<unknown> }

/** Прочитать-изменить-записать память одного бота. fn мутирует entry на месте. */
export async function updateBotMemory(
  playerId: string,
  botId: string,
  fn: (entry: BotMemoryEntry) => void,
): Promise<BotMemoryEntry | null> {
  const run = async (): Promise<BotMemoryEntry | null> => {
    const user = await db.user.findUnique({ where: { id: playerId }, select: { stats: true } })
    if (!user) return null
    let stats: Record<string, unknown> = {}
    try { stats = JSON.parse(user.stats || '{}') as Record<string, unknown> } catch { stats = {} }
    const map = parseMemoryMap(user.stats)
    const entry = ensureEntry(map, botId)
    fn(entry)
    map[botId] = entry
    stats.botMemory = map
    await db.user.update({ where: { id: playerId }, data: { stats: JSON.stringify(stats) } })
    return entry
  }
  const prev = g.__botMemChain ?? Promise.resolve()
  const next = prev.then(run, run)
  g.__botMemChain = next.catch(() => null)
  return next
}

// ---------- СИГНАЛЫ ----------

export type MemorySignal = 'lowball' | 'rude' | 'praise' | 'scamBail'

/** Отметить поведенческий сигнал из переписки (вызывается движком чата). */
export async function noteSignal(playerId: string, botId: string, signal: MemorySignal, detail?: string): Promise<BotMemoryEntry | null> {
  return updateBotMemory(playerId, botId, (e) => {
    const now = Date.now()
    e.lastAt = now
    if (signal === 'lowball') {
      e.lowballs = (e.lowballs ?? 0) + 1
      if (e.lowballs >= 3) {
        addFlag(e, 'lowballer')
        pushNote(e, `лоуболил ${e.lowballs} раз — недоверие`)
      } else {
        pushNote(e, `лоубол${detail ? ` (${detail})` : ''}`)
      }
    } else if (signal === 'rude') {
      e.rudeCount = (e.rudeCount ?? 0) + 1
      addFlag(e, 'rude')
      pushNote(e, 'грубил в переписке')
    } else if (signal === 'praise') {
      e.praised = (e.praised ?? 0) + 1
      if (e.praised >= 2) addFlag(e, 'good')
    } else if (signal === 'scamBail') {
      e.scamFails = (e.scamFails ?? 0) + 1
      if (e.scamFails >= 2) {
        addFlag(e, 'scammer')
        pushNote(e, `кидал на цене ${e.scamFails} раза`)
      } else {
        pushNote(e, 'согласился и передумал')
      }
    }
  })
}

export interface DealForMemory {
  price: number
  listingPrice: number
  category?: string
  itemTitle?: string
}

/** Записать завершённую сделку бота с игроком (любая роль). */
export async function noteDeal(playerId: string, botId: string, deal: DealForMemory): Promise<void> {
  const price = Math.max(0, Math.round(deal.price))
  const ask = Math.max(1, Math.round(deal.listingPrice))
  const discount = Math.max(0, Math.min(0.9, (ask - price) / ask))
  await updateBotMemory(playerId, botId, (e) => {
    e.deals += 1
    e.totalSpent += price
    e.avgDiscount = e.deals > 1 ? (e.avgDiscount * (e.deals - 1) + discount) / e.deals : discount
    e.lastAt = Date.now()
    if (deal.category && !e.categories?.includes(deal.category)) {
      e.categories = [...(e.categories ?? []), deal.category].slice(-CATEGORY_MAX)
    }
    const clean = !e.flags.some((f) => f !== 'good')
    if (clean && e.deals >= 2) {
      addFlag(e, 'good')
      pushNote(e, 'сделки чистые, можно доверять')
    } else {
      pushNote(e, `сделка №${e.deals} на ${price.toLocaleString('ru-RU')} ₽${deal.itemTitle ? ` — ${deal.itemTitle}` : ''}`)
    }
  })
}

/** Кулдаун: бот «закрыл встречу» и пока не хочет видеть игрока. */
export async function setBotCooldown(playerId: string, botId: string, ms: number, reason: string): Promise<void> {
  await updateBotMemory(playerId, botId, (e) => {
    e.cooldownUntil = Date.now() + ms
    e.lastAt = Date.now()
    pushNote(e, reason)
  })
}

export function hasActiveCooldown(entry: BotMemoryEntry | null | undefined): boolean {
  return !!entry?.cooldownUntil && entry.cooldownUntil > Date.now()
}

// ---------- ПРОМПТ ----------

const FLAG_LINES: Record<string, string> = {
  lowballer: 'Он систематически лоуболит — недоверие, скидки почти не делай, цену не опускай ниже 90% своей.',
  scammer: 'Он ДВАЖДЫ кидал на цене: соглашался и пропадал. Минимальное доверие, требуй предоплату счётом и не верь обещаниям.',
  rude: 'Он был груб с тобой. Держись холодно, отвечай коротко, не уступай из вежливости.',
  good: 'С ним прошлые сделки были чистыми — можешь быть чуть мягче и живее.',
}

/**
 * Сжатая память для системного промпта (≤120 токенов): прошлые сделки,
 * флаги поведения, что игрок обычно берёт, последние заметки.
 */
export function memoryPromptLine(entry: BotMemoryEntry | null | undefined, botRole: 'buyer' | 'seller'): string {
  if (!entry) return ''
  const parts: string[] = []
  if (entry.deals > 0) {
    const disc = entry.avgDiscount > 0.02 ? `, в среднем он выторгивал около ${Math.round(entry.avgDiscount * 100)}% скидки` : ''
    parts.push(`Ты уже ${entry.deals} раз(а) торговался с ним${disc}.`)
  }
  for (const f of entry.flags) {
    if (FLAG_LINES[f]) parts.push(FLAG_LINES[f])
  }
  if (entry.categories?.length) {
    parts.push(`Помнишь, что он берёт: ${entry.categories.join(', ')}.`)
  }
  if (entry.scamFails === 1 && !entry.flags.includes('scammer')) {
    parts.push('Он уже один раз согласился и передумал — перепроверяй серьёзность намерений.')
  }
  const roleNote = botRole === 'seller'
    ? 'Ты ПРОДАВЕЦ и помнишь всё это о нём как о покупателе.'
    : 'Ты ПОКУПАТЕЛЬ и помнишь всё это о нём как о продавце.'
  if (parts.length) parts.push(roleNote)
  if (hasActiveCooldown(entry)) {
    parts.push('Сейчас он у тебя в игноре за прошлое поведение — общайся ледяно, коротко, без интереса.')
  }
  if (entry.notes.length) {
    parts.push(`Заметки по прошлому: ${entry.notes.slice(-2).join('; ')}.`)
  }
  return parts.join(' ')
}

// ---------- НАСТРОЕНИЕ (честный индикатор для игрока) ----------

export type MoodState = 'neutral' | 'annoyed' | 'angry' | 'happy' | 'cold' | 'gone'

export interface ChatMood {
  state: MoodState
  emoji: string
  label: string
}

export function computeMood(args: {
  closed?: boolean
  rounds: number
  patience: number
  lowballStreak?: number
  entry?: BotMemoryEntry | null
  listingSold?: boolean
}): ChatMood {
  const { closed, rounds, patience, lowballStreak, entry, listingSold } = args
  if (listingSold) return { state: 'happy', emoji: '😊', label: 'Сделка состоялась' }
  if (hasActiveCooldown(entry)) return { state: 'cold', emoji: '🧊', label: 'Помнит обиды — торгуется жёстче' }
  if (closed) return { state: 'gone', emoji: '🚪', label: 'Ушёл из торга' }
  if ((lowballStreak ?? 0) >= 2 || rounds >= Math.max(1, patience)) return { state: 'angry', emoji: '😠', label: 'На нервах — торг близок к концу' }
  if (rounds >= Math.max(1, patience - 2)) return { state: 'annoyed', emoji: '😐', label: 'Раздражён — уступает неохотно' }
  if (entry?.flags.includes('good') && entry.deals >= 2) return { state: 'happy', emoji: '🙂', label: 'К вам расположен' }
  return { state: 'neutral', emoji: '🙂', label: 'Спокоен' }
}

// ---------- РЕПУТАЦИОННЫЕ ПОПРАВКИ ДЛЯ ЦЕН ----------

/** Насколько бот ужесточает скрытый предел из-за памяти о игроке (0..0.08 от цены). */
export function memoryLimitShift(entry: BotMemoryEntry | null | undefined): number {
  if (!entry) return 0
  let shift = 0
  if (entry.flags.includes('lowballer')) shift += 0.035
  if (entry.flags.includes('scammer')) shift += 0.05
  if (entry.flags.includes('rude')) shift += 0.015
  if (entry.flags.includes('good') && !entry.flags.includes('lowballer')) shift -= 0.015
  return Math.max(-0.015, Math.min(0.08, shift))
}
