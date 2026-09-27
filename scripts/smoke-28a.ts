// Смоук 28-a: память нейронок + умный рынок.
// Часть A (юнит, детерминированно): функции bot-memory и market-index на временной
//   записи в БД — сигналы, флаги, заметки, кулдаун, строка промпта, настроение,
//   recordSale → getMarketPrice (капы 0.7..1.4), пульс.
// Часть B (API, живой сервер): auth → market/pulse → чат с ботом-продавцом →
//   два лоубола подряд → память в User.stats.botMemory серверная, перезаход
//   позицию бота НЕ сбрасывает (mood честный, закрытый торг не оживает).
// Запуск: bun scripts/smoke-28a.ts
import { db } from '../src/lib/db'
import {
  noteSignal, noteDeal, setBotCooldown, hasActiveCooldown,
  memoryPromptLine, memoryLimitShift, computeMood, getBotMemoryEntry,
} from '../src/lib/bot-memory'
import { recordSale, getMarketPrice, getItemIndex, marketPulseData } from '../src/lib/market-index'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++
    console.log(`  PASS ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}`, typeof extra === 'string' ? extra : JSON.stringify(extra)?.slice(0, 160))
  }
}

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json: json as Record<string, unknown> | null }
}

interface MemEntry { lowballs?: number; notes?: string[]; flags?: string[]; cooldownUntil?: number; deals?: number }

async function main() {
  console.log('== 28-a smoke ==')

  // ---------- ЧАСТЬ A: юнит памяти и индекса (временный юзер, потом удаляем) ----------
  // снапшот файла индекса: тестовые сделки не должны оставаться в рыночных данных
  const { promises: fsp } = await import('fs')
  const INDEX_FILE = process.cwd() + '/db/market-index.json'
  let indexSnapshot: string | null = null
  try { indexSnapshot = await fsp.readFile(INDEX_FILE, 'utf8') } catch { /* файла нет */ }

  console.log('-- A. память бота (детерминированно) --')
  const probe = await db.user.create({
    data: { username: `probe28a_${Date.now().toString(36)}`, displayName: 'Probe 28a', isBot: false },
  })
  try {
    const bot = await db.user.findFirst({ where: { isBot: true } })
    if (!bot) throw new Error('нет ботов в БД')
    const botId = bot.id

    await noteSignal(probe.id, botId, 'lowball', '30% от цены')
    await noteSignal(probe.id, botId, 'lowball', '22% от цены')
    await noteSignal(probe.id, botId, 'lowball')
    let e = await getBotMemoryEntry(probe.id, botId)
    check('3 лоубола → счётчик 3', (e?.lowballs ?? 0) === 3, e)
    check('3 лоубола → флаг lowballer', e?.flags.includes('lowballer') === true, e?.flags)
    check('заметки по-человечески записаны', (e?.notes?.length ?? 0) >= 2, e?.notes)

    await noteSignal(probe.id, botId, 'rude')
    e = await getBotMemoryEntry(probe.id, botId)
    check('грубость → флаг rude', e?.flags.includes('rude') === true, e?.flags)

    await setBotCooldown(probe.id, botId, 60 * 60_000, 'выжил терпение лоуболами')
    e = await getBotMemoryEntry(probe.id, botId)
    check('кулдаун активен (таймер в памяти)', hasActiveCooldown(e) === true)
    check('кулдаун в будущем', (e?.cooldownUntil ?? 0) > Date.now())

    const line = memoryPromptLine(e, 'seller')
    check('строка промпта ≤120 токенов (~700 символов)', line.length > 0 && line.length <= 700, line.length)
    check('промпт помнит лоуболы/игнор', /лоубол|игнор|недоверие/i.test(line), line.slice(0, 100))
    check('memoryLimitShift ужесточает цену', memoryLimitShift(e) > 0, memoryLimitShift(e))

    const mood = computeMood({ rounds: 1, patience: 4, entry: e })
    check('настроение честное при кулдауне (cold)', mood.state === 'cold', mood)

    await noteDeal(probe.id, botId, { price: 9000, listingPrice: 10000, category: 'Телефоны', itemTitle: 'iPhone 13' })
    e = await getBotMemoryEntry(probe.id, botId)
    check('сделка записана (deals=1, скидка ~10%)', e?.deals === 1 && Math.abs(e.avgDiscount - 0.1) < 0.02, e)
    check('категория запомнена', e?.categories?.includes('Телефоны') === true, e?.categories)

    console.log('-- A. рыночный индекс (детерминированно) --')
    const key = 'iphone-13'
    const before = await getItemIndex(key)
    await recordSale({ itemKey: key, category: 'phones', price: 999_999_999, condition: 'excellent' })
    await recordSale({ itemKey: key, category: 'phones', price: 999_999_999, condition: 'excellent' })
    const after = await getItemIndex(key)
    check('горячие сделки поднимают индекс', after > before, `${before.toFixed(3)} → ${after.toFixed(3)}`)
    check('кап индекса сверху 1.4', after <= 1.4 + 1e-9, after.toFixed(3))
    const mp = await getMarketPrice(key)
    check('getMarketPrice = база × индекс', mp > 0 && mp <= 999_000, mp)
    const pulseA = await marketPulseData()
    check('marketPulseData отдаёт структуру', Array.isArray(pulseA.moves) && pulseA.moves.length <= 5)

    // ---- перезаход не сбрасывает: память читается заново из БД ----
    const e2 = await getBotMemoryEntry(probe.id, botId)
    check('перезаход: память та же (серверная)', (e2?.lowballs ?? 0) === 3 && hasActiveCooldown(e2))
  } finally {
    await db.user.delete({ where: { id: probe.id } }).catch(() => {})
    // вернуть файл индекса как был (тестовые сделки — мусор в рыночных данных)
    if (indexSnapshot !== null) await fsp.writeFile(INDEX_FILE, indexSnapshot, 'utf8').catch(() => {})
    else await fsp.rm(INDEX_FILE, { force: true }).catch(() => {})
  }

  // ---------- ЧАСТЬ B: живой сервер ----------
  console.log('-- B. живой сервер (API) --')
  const deviceId = `smoke28a_${Date.now().toString(36)}`
  const auth = await api('/api/auth', undefined, {
    method: 'POST',
    body: JSON.stringify({ deviceId, devName: 'Смоук 28a' }),
  })
  check('auth 200 + token', auth.status === 200 && !!auth.json?.token)
  const token = String(auth.json?.token ?? '')
  const userId = String((auth.json?.user as { id?: string })?.id ?? '')

  const pulse = await api('/api/market/pulse', token)
  check('market/pulse 200', pulse.status === 200)
  const moves = (pulse.json?.moves ?? []) as { itemKey: string; deltaPct: number }[]
  check('pulse.moves массив ≤5', Array.isArray(moves) && moves.length <= 5, moves.length)
  check('pulse.headline строка|null', pulse.json?.headline === null || typeof pulse.json?.headline === 'string', pulse.json?.headline)

  const feed = await api('/api/listings?sort=new&limit=40', token)
  const items = (feed.json?.items ?? []) as { id: string; price: number; seller?: { isBot: boolean } }[]
  const target = items.find((l) => l.price >= 3000 && l.seller?.isBot)
  check('нашлось объявление бота ≥3000₽', !!target, `${items.length} объявлений`)
  if (!target) return

  const chat = await api('/api/chats', token, { method: 'POST', body: JSON.stringify({ listingId: target.id }) })
  check('чат открыт 200', chat.status === 200)
  const chatId = String(chat.json?.id ?? '')
  check('mood присутствует (честный индикатор)', !!chat.json?.mood, chat.json?.mood)
  check('opener от бота есть', Array.isArray(chat.json?.messages) && (chat.json?.messages as unknown[]).length >= 1)

  async function readMemory(): Promise<MemEntry | undefined> {
    const u = await db.user.findUnique({ where: { id: userId }, select: { stats: true } })
    const map = (JSON.parse(u?.stats || '{}').botMemory ?? {}) as Record<string, MemEntry>
    return Object.values(map)[0]
  }
  async function lastBotText(): Promise<string> {
    const msgs = await db.message.findMany({ where: { chatId }, orderBy: { createdAt: 'asc' } })
    return msgs.filter((m) => m.senderType === 'bot').at(-1)?.text ?? ''
  }

  // приветствие (не лоубол)
  await api(`/api/chats/${chatId}/messages`, token, { method: 'POST', body: JSON.stringify({ text: 'Здравствуйте! Ещё актуально?' }) })

  // лоубол №1: счёт на 25% цены
  const lowball1 = Math.max(100, Math.round(target.price * 0.25))
  await api(`/api/chats/${chatId}/messages`, token, { method: 'POST', body: JSON.stringify({ invoice: lowball1 }) })
  const entry1 = await readMemory()
  check('память: лоубол №1 записан серверно', (entry1?.lowballs ?? 0) >= 1, entry1)
  check('память: есть человеческая заметка', (entry1?.notes?.length ?? 0) >= 1, entry1?.notes)

  // лоубол №2: ещё ниже. Бот должен быть ЗЛЕЕ: либо скриптовый уход с кулдауном,
  // либо ИИ-отказ (закрыл встречу), либо жёсткий торг. В любом случае:
  // 1) память растёт или торг закрыт, 2) перезаход ничего не сбрасывает.
  const lowball2 = Math.max(50, Math.round(target.price * 0.18))
  await api(`/api/chats/${chatId}/messages`, token, { method: 'POST', body: JSON.stringify({ invoice: lowball2 }) })
  const entry2 = await readMemory()
  const reply2 = await lastBotText()
  const chatAgain = await api(`/api/chats/${chatId}`, token)
  const mood2 = chatAgain.json?.mood as { state?: string; label?: string } | undefined
  const stillTalking = !!mood2 && mood2.state !== 'gone' && mood2.state !== 'cold'

  check('перезаход: mood честный (не «спокоен» после лоуболов)', !!mood2 && mood2.state !== 'neutral', mood2)
  check('перезаход: lastBotOffer отдаётся', 'lastBotOffer' in (chatAgain.json ?? {}))
  if (stillTalking) {
    check('память: lowballs >= 2 (бот ещё торгуется)', (entry2?.lowballs ?? 0) >= 2, entry2)
    check('бот ответил на лоубол №2', reply2.length > 0, reply2.slice(0, 80))
  } else {
    // бот закрыл встречу: проверяем, что чат не оживает и кулдаун/флаг в памяти
    check('бот закрыл встречу после лоуболов (жёстче)', /актуален|отбой|пас|не обсужда|другого покупателя|в другой раз/i.test(reply2), reply2.slice(0, 80))
    check('перезаход: закрытый торг не оживает', mood2?.state === 'gone' || mood2?.state === 'cold', mood2)
  }
  console.log('  ответ бота:', JSON.stringify(reply2.slice(0, 100)))
  console.log('  память:', JSON.stringify(entry2)?.slice(0, 140))

  console.log(`\n== ${pass} PASS / ${fail} FAIL ==`)
  if (fail > 0) process.exit(1)
  process.exit(0)
}

void main()
