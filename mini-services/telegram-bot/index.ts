// Telegram-бот @resalesimbot — «Resale — симулятор ресейла»
// Mini-service на порту :3004, долгий polling getUpdates + HTTP /health, /send.
//
// ПРОВЕРЕНО ЭМПИРИЧЕСКИ (2025-09-25, реальные вызовы Bot API):
//  - custom_emoji (премиум-эмодзи) от этого бота ОТКЛОНЯЕТСЯ API: ENTITY_TEXT_INVALID.
//    Боты могут слать custom emoji только с коллекционным юзернеймом Fragment.
//    Поэтому в текстах и кнопках — яркие Unicode-эмодзи (работают у всех) + HTML bold/italic.
//  - Поля InlineKeyboardButton "style" и "icon_custom_emoji_id" в Bot API НЕ существуют.
//  - sendPhoto по file_id после первой загрузки — мгновенно (файл не гоняем повторно).
//
// /start — приветственное фото + подпись + кнопки. /start КОД — привязка аккаунта.
// Уведомления: основной сервер дергает POST /send { secret, chatId, text }.
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'

// Подтянуть корневой .env (мини-сервис — отдельный проект, bun грузит только свой .env)
function loadRootEnv(): void {
  const metaDir = (import.meta as unknown as { dir?: string }).dir
  const here = typeof metaDir === 'string' ? metaDir : process.cwd()
  const candidates = [join(dirname(here), '..', '.env'), join(process.cwd(), '.env')]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    break
  }
}
loadRootEnv()

const PORT = 3004
const SECRET = process.env.REALTIME_SECRET ?? 'avito-sim-rt-2024-secret'
const TOKEN = process.env.BOT_TOKEN ?? ''
const API = `https://api.telegram.org/bot${TOKEN}`

// Публичные ссылки бота
const APP_URL = process.env.APP_URL ?? 'https://t.me/resalesimbot/resalesimulator'
const CHANNEL_URL = process.env.CHANNEL_URL ?? 'https://t.me/SnapTeamDev'

// ─────────────────────────────────────────────────────────────────────────────
// Кнопки: гарантированные цветные Unicode-эмодзи в тексте (рендерятся везде)
// ─────────────────────────────────────────────────────────────────────────────
interface Btn {
  text: string
  url?: string
  callback_data?: string
}
interface Markup {
  inline_keyboard: Btn[][]
}

const BTN_PLAY: Btn = { text: '🟢 Начать ресейлить', url: APP_URL }
const BTN_SUB: Btn = { text: '📣 Подписаться на канал', url: CHANNEL_URL }
const BTN_TERMS: Btn = { text: '🏷 Пользовательское соглашение', callback_data: 'terms' }
const BTN_HELP: Btn = { text: 'ℹ️ Помощь и команды', callback_data: 'help' }
const BTN_BACK: Btn = { text: '⬅️ Вернуться в меню', callback_data: 'back' }

const WELCOME_MARKUP: Markup = {
  inline_keyboard: [
    [BTN_PLAY],
    [BTN_SUB],
    [BTN_TERMS],
    [BTN_HELP],
  ],
}

const BACK_MARKUP: Markup = { inline_keyboard: [[BTN_BACK]] }

const START_MARKUP: Markup = { inline_keyboard: [[BTN_PLAY], [BTN_HELP]] }

// ─────────────────────────────────────────────────────────────────────────────
// Тексты (HTML: <b>/<i>/<code>; лимит подписи к фото — 1024 символа)
// ─────────────────────────────────────────────────────────────────────────────
const WELCOME_CAPTION = [
  `🔥 <b><i>Resale</i></b> — симулятор ресейла, где скупка и перепродажа превращаются в империю.`,
  ``,
  `🏪 <b>Что тебя ждёт:</b>`,
  `💸 живая экономика — цены двигают ИИ-боты и реальные игроки`,
  `🏷 скупай дёшево, торгуйся в чатах и продавай дороже`,
  `📈 аукционы, банк, налоги и доставки — как в жизни`,
  `⭐️ уровни, рейтинг и топ лидеров сервера`,
  ``,
  `💵 Стартовый капитал уже ждёт. Удачных сделок!`,
].join('\n')

const TERMS_TEXT = [
  `🏷 <b>Пользовательское соглашение Resale</b>`,
  ``,
  `<b>1.</b> Resale — онлайн-игра, симулятор перепродажи. Все товары, продавцы, деньги и чаты — вымышленные.`,
  `<b>2.</b> Внутриигровая валюта не имеет реальной стоимости; реальные товары не продаются и не покупаются.`,
  `<b>3.</b> Запрещены оскорбления, спам, попытки обмана игроков и злоупотребление багами.`,
  `<b>4.</b> Мы можем корректировать экономику и баланс игры, уведомляя игроков в канале ${CHANNEL_URL}.`,
  `<b>5.</b> Для профиля игра использует только имя и username из Telegram.`,
  `<b>6.</b> Продолжая играть, вы соглашаетесь с этими правилами.`,
  ``,
  `👍 Приятного ресейла!`,
].join('\n')

const HELP_TEXT = [
  `💬 <b>Команды бота Resale</b>`,
  ``,
  `🔗 /start КОД — привязать аккаунт из игры`,
  `👛 /balance — кошелёк, долги и налоги`,
  `📈 /lots — активные лоты аукциона`,
  `ℹ️ /help — эта справка`,
  ``,
  `🏪 <b>Как играть:</b>`,
  `<b>1.</b> Нажми «🟢 Начать ресейлить» — откроется смартфон с игрой.`,
  `<b>2.</b> Скупай товары на витрине: сравнивай цены, торгуйся в чатах, оформляй доставки.`,
  `<b>3.</b> Продавай дороже, следи за рынком и плати налоги — как в жизни.`,
  `<b>4.</b> Выполняй задания, качай уровень и поднимайся в топ лидеров!`,
].join('\n')

// ─────────────────────────────────────────────────────────────────────────────
// Telegram API
// ─────────────────────────────────────────────────────────────────────────────
interface TgUser {
  id: number
  first_name?: string
  username?: string
}
interface TgMessage {
  message_id: number
  from?: TgUser
  chat: { id: number }
  text?: string
}
interface TgCallbackQuery {
  id: string
  data?: string
  message?: { message_id: number; chat: { id: number } }
}
interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}
interface TgPhotoSize {
  file_id?: string
}
interface TgResult {
  ok?: boolean
  description?: string
  result?: { message_id?: number; photo?: TgPhotoSize[] }
}

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`
}

async function tg(method: string, body: Record<string, unknown>): Promise<TgResult | null> {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    return (await res.json()) as TgResult
  } catch (e) {
    console.error('[tg-bot] api error', method, e)
    return null
  }
}

// Отправка текста: HTML, без превью. Возвращает результат с логом.
async function sendSmart(chatId: number | string, html: string, markup?: Markup): Promise<TgResult | null> {
  const res = await tg('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
  })
  if (!res || !res.ok) console.warn(`[tg-bot] sendMessage → ${chatId} FAILED:`, res?.description ?? 'no response')
  return res
}

// Приветствие: фото-баннер + подпись + кнопки. Первый раз — upload файла,
// дальше — мгновенный file_id (кэш в памяти).
let welcomeBuf: Buffer | null | undefined
let welcomeFileId: string | null = null
function loadWelcome(): Buffer | null {
  if (welcomeBuf !== undefined) return welcomeBuf
  const metaDir = (import.meta as unknown as { dir?: string }).dir
  const here = typeof metaDir === 'string' ? metaDir : process.cwd()
  const candidates = [
    join(here, 'assets', 'welcome.png'),
    join(process.cwd(), 'assets', 'welcome.png'),
    join(process.cwd(), 'mini-services', 'telegram-bot', 'assets', 'welcome.png'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      welcomeBuf = readFileSync(p)
      console.log('[tg-bot] welcome.png loaded from', p)
      return welcomeBuf
    }
  }
  console.warn('[tg-bot] welcome.png не найден — приветствие уйдёт текстом')
  welcomeBuf = null
  return null
}

async function sendWelcome(chatId: number | string): Promise<TgResult | null> {
  const buf = loadWelcome()
  if (buf || welcomeFileId) {
    try {
      let data: TgResult | null
      if (welcomeFileId) {
        data = await tg('sendPhoto', {
          chat_id: chatId,
          photo: welcomeFileId,
          caption: WELCOME_CAPTION,
          parse_mode: 'HTML',
          reply_markup: WELCOME_MARKUP,
        })
      } else {
        const form = new FormData()
        form.append('chat_id', String(chatId))
        form.append('photo', new Blob([new Uint8Array(buf as Buffer)], { type: 'image/png' }), 'welcome.png')
        form.append('caption', WELCOME_CAPTION)
        form.append('parse_mode', 'HTML')
        form.append('reply_markup', JSON.stringify(WELCOME_MARKUP))
        const res = await fetch(`${API}/sendPhoto`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30_000),
        })
        data = (await res.json().catch(() => null)) as TgResult | null
      }
      if (data && data.ok) {
        // запоминаем file_id самой большой фотки для мгновенных следующих отправок
        const photos = data.result?.photo
        if (photos && photos.length > 0) {
          const fid = photos[photos.length - 1]?.file_id
          if (fid) welcomeFileId = fid
        }
        console.log(`[tg-bot] welcome → ${chatId}: OK${welcomeFileId ? ' (file_id cached)' : ''}`)
        return data
      }
      console.warn('[tg-bot] sendPhoto failed:', data?.description ?? 'no response')
    } catch (e) {
      console.error('[tg-bot] sendPhoto error', e)
    }
  }
  // фолбэк: текстовое приветствие теми же кнопками
  return sendSmart(chatId, WELCOME_CAPTION, WELCOME_MARKUP)
}

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`http://127.0.0.1:3000${path}`, {
      headers: { 'x-service-secret': SECRET },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch (e) {
    console.error('[tg-bot] app api error', path, e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Команды
// ---------------------------------------------------------------------------
async function handleCommand(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id
  const from = msg.from
  const text = (msg.text ?? '').trim()
  const [cmdRaw, ...args] = text.split(/\s+/)
  const cmd = cmdRaw.toLowerCase().replace(/@.*$/, '') // срезать /start@resalesimbot

  const name = from?.first_name ?? 'игрок'

  if (cmd === '/start' || cmd === '/link') {
    const code = args[0]?.toUpperCase()
    if (code) {
      const res = await fetch('http://127.0.0.1:3000/api/telegram/bind', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-service-secret': SECRET },
        body: JSON.stringify({ code, chatId: String(chatId), tgUsername: from?.username ?? null }),
        signal: AbortSignal.timeout(8000),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; displayName?: string; balance?: number; error?: string }
      if (res.ok && data.ok) {
        await sendSmart(
          chatId,
          [
            `✅ <b>Аккаунт привязан, ${data.displayName ?? name}!</b>`,
            ``,
            `👛 Кошелёк: <b>${fmtMoney(data.balance ?? 0)}</b>`,
            ``,
            `🔔 Теперь сюда будут приходить уведомления: сделки, перебитые ставки аукциона, доставки, налоги, кредиты, ремонт и достижения.`,
            ``,
            `🔼 Жми кнопку — и в игру:`,
          ].join('\n'),
          START_MARKUP,
        )
      } else {
        await sendSmart(
          chatId,
          `❗️ Не получилось: ${data.error ?? 'код не принят'}.\nПолучите новый код в игре: Настройки → Telegram.`,
          BACK_MARKUP,
        )
      }
      return
    }
    await sendWelcome(chatId)
    return
  }

  if (cmd === '/balance') {
    const st = await apiGet<{
      linked: boolean
      displayName?: string
      balance?: number
      debt?: number
      deposit?: number
      taxDebt?: number
      level?: number
      rating?: number
      deliveries?: number
      leading?: number
    }>(`/api/telegram/state?chatId=${chatId}`)
    if (!st || !st.linked) {
      await sendSmart(
        chatId,
        `❗️ Аккаунт не привязан.\nОткройте игру → Настройки → «Получить код привязки» и отправьте <code>/start КОД</code>.`,
        START_MARKUP,
      )
      return
    }
    const lines = [
      `👛 <b>${st.displayName}</b> · уровень ${st.level} · рейтинг ${st.rating || '—'}`,
      ``,
      `💵 Кошелёк: <b>${fmtMoney(st.balance ?? 0)}</b>`,
      st.deposit ? `📊 На вкладе: ${fmtMoney(st.deposit)}` : null,
      st.debt ? `💼 Долг банку: <b>${fmtMoney(st.debt)}</b>` : `✅ Долгов банку нет`,
      st.taxDebt
        ? `❗️ Налоговая: <b>${fmtMoney(st.taxDebt)}</b> — оплатите, пока не заблокировали продажи`
        : `✅ Налоговая: чисто`,
      ``,
      st.deliveries ? `✈️ Доставок в пути: ${st.deliveries}` : null,
      st.leading ? `🔝 Вы лидер в ${st.leading} лот(ах) аукциона` : null,
    ].filter((x): x is string => x !== null)
    await sendSmart(chatId, lines.join('\n'))
    return
  }

  if (cmd === '/lots') {
    const data = await apiGet<{ lots: Array<{ title: string; currentBid: number; bids: number; leader: string; endsInMin: number }> }>(`/api/telegram/auctions`)
    if (!data || data.lots.length === 0) {
      await sendSmart(chatId, `📈 Активных лотов нет. Аукционный дом выставляет новые — следите за уведомлениями.`)
      return
    }
    const lines = [`📈 <b>Аукцион · активные лоты</b>`, ``]
    for (const l of data.lots) {
      lines.push(`🏷 <b>${l.title}</b>`)
      lines.push(`${fmtMoney(l.currentBid)} · ${l.bids} ставок · лидер ${l.leader} · конец через ${l.endsInMin} мин`)
      lines.push(``)
    }
    lines.push(`🔼 Ставки — в приложении Аукцион в игре.`)
    await sendSmart(chatId, lines.join('\n'), START_MARKUP)
    return
  }

  // /help и все остальные команды
  await sendSmart(chatId, HELP_TEXT, BACK_MARKUP)
}

// ---------------------------------------------------------------------------
// Callback-кнопки
// ---------------------------------------------------------------------------
async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  await tg('answerCallbackQuery', { callback_query_id: cb.id })
  const chatId = cb.message?.chat.id
  const msgId = cb.message?.message_id
  if (!chatId || !msgId) return
  console.log(`[tg-bot] ← callback "${cb.data}" from ${chatId}`)
  if (cb.data === 'terms') {
    await sendSmart(chatId, TERMS_TEXT, BACK_MARKUP)
  } else if (cb.data === 'help') {
    await sendSmart(chatId, HELP_TEXT, BACK_MARKUP)
  } else if (cb.data === 'back') {
    await tg('deleteMessage', { chat_id: chatId, message_id: msgId })
  }
}

// ---------------------------------------------------------------------------
// Long polling
// ---------------------------------------------------------------------------
let offset = 0
let polling = false

async function pollLoop(): Promise<void> {
  if (polling) return
  polling = true
  while (polling) {
    if (!TOKEN) {
      console.error('[tg-bot] BOT_TOKEN пуст — polling отключён')
      break
    }
    try {
      const res = await fetch(`${API}/getUpdates?timeout=25&offset=${offset}`, {
        signal: AbortSignal.timeout(35_000),
      })
      const data = (await res.json()) as { ok?: boolean; result?: TgUpdate[]; description?: string }
      if (!data.ok) console.warn('[tg-bot] getUpdates error:', data.description)
      for (const u of data.result ?? []) {
        offset = u.update_id + 1
        if (u.message?.text) {
          console.log(`[tg-bot] ← ${u.message.text.slice(0, 60)} from ${u.message.chat.id} (${u.message.from?.username ?? 'no username'})`)
          await handleCommand(u.message).catch((e) => console.error('[tg-bot] cmd error', e))
        } else if (u.message) {
          // не-текстовое сообщение (стикер и т.п.) — показываем приветственное меню
          console.log(`[tg-bot] ← non-text from ${u.message.chat.id}`)
          await sendWelcome(u.message.chat.id).catch((e) => console.error('[tg-bot] welcome error', e))
        } else if (u.callback_query) {
          await handleCallback(u.callback_query).catch((e) => console.error('[tg-bot] callback error', e))
        }
      }
    } catch {
      // таймаут polling — это норма; пауза при сетевых проблемах
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

// ---------------------------------------------------------------------------
// Настройка бота: имя, описание, команды, кнопка меню (Mini App)
// ---------------------------------------------------------------------------
async function setupBot(): Promise<void> {
  if (!TOKEN) return
  await tg('setMyName', { name: 'Resale — Симулятор ресейла' })
  await tg('setMyDescription', {
    description:
      'Симулятор ресейла: скупай товары дёшево, торгуйся с ИИ-продавцами, продавай дороже. Живая экономика, аукционы, банк, налоги и топ лидеров. Твой стартовый капитал уже ждёт!',
  })
  await tg('setMyShortDescription', {
    short_description: 'Симулятор ресейла — торгуйся, продавай, попади в топ!',
  })
  await tg('setMyCommands', {
    commands: [
      { command: 'start', description: '🎮 Открыть игру и меню' },
      { command: 'balance', description: '👛 Кошелёк, долги и налоги' },
      { command: 'lots', description: '📈 Активные лоты аукциона' },
      { command: 'help', description: '💬 Справка и правила' },
    ],
  })
  await tg('setChatMenuButton', {
    menu_button: { type: 'web_app', text: '🟢 Начать ресейлить', web_app: { url: APP_URL } },
  })
  console.log('[tg-bot] profile configured: name, commands, menu button (web_app)')
}

// ---------------------------------------------------------------------------
// HTTP: /health, /send
// ---------------------------------------------------------------------------
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  const url = (req.url ?? '/').split('?')[0]

  if (url === '/health') {
    sendJson(res, 200, { ok: true, service: 'telegram-bot', token: TOKEN ? 'set' : 'missing', offset, welcomeCached: Boolean(welcomeFileId) })
    return
  }

  if (url === '/send' && req.method === 'POST') {
    let body = ''
    req.on('data', (c: Buffer) => (body += c.toString()))
    req.on('end', async () => {
      try {
        const { secret, chatId, text, welcome } = JSON.parse(body) as { secret?: string; chatId?: string; text?: string; welcome?: boolean }
        if (secret !== SECRET) return sendJson(res, 403, { error: 'forbidden' })
        if (!chatId) return sendJson(res, 400, { error: 'chatId required' })
        if (!TOKEN) return sendJson(res, 503, { error: 'BOT_TOKEN missing' })
        if (welcome) {
          const w = await sendWelcome(chatId)
          console.log(`[tg-bot] welcome(/send) → ${chatId}: ${w && w.ok ? 'OK' : w?.description ?? 'no response'}`)
          return sendJson(res, 200, { ok: Boolean(w && w.ok) })
        }
        if (!text) return sendJson(res, 400, { error: 'text required' })
        const tgRes = await sendSmart(chatId, text)
        console.log(`[tg-bot] send → ${chatId}: ${tgRes && tgRes.ok ? 'OK' : tgRes?.description ?? 'no response'}`)
        sendJson(res, 200, { ok: true })
      } catch {
        sendJson(res, 500, { error: 'bad request' })
      }
    })
    return
  }
  sendJson(res, 404, { error: 'not found' })
}).listen(PORT, () => {
  console.log(`[tg-bot] listening on :${PORT}, token ${TOKEN ? 'OK' : 'MISSING'}`)
  void setupBot()
  void pollLoop()
})
