// Telegram-бот @resalesimbot — «Resale — симулятор ресейла».
// ЖИВЁТ ВНУТРИ Next.js-сервера (запуск из src/instrumentation.ts): платформа
// держит next-server дни, а отдельно запущенные из tool-сессий процессы
// песочница убивает на границе сессии (проверено 2025-09-25).
// Также можно запустить standalone: bun mini-services/telegram-bot/index.ts
//
// ПРОВЕРЕНО ЖИВЫМИ ВЫЗОВАМИ Bot API (2025-09-25, chat юзера):
//  ✔ custom_emoji (<tg-emoji> и entities) — бот МОЕТ слать премиум-эмодзи
//  ✔ InlineKeyboardButton style: success/primary/link + icon_custom_emoji_id — работает
//  ВАЖНО (грабли): тесты через bash-строки ломают UTF-8 (\x-последовательности не
//  интерпретируются в одиночных кавычках) → ложный ENTITY_TEXT_INVALID. Тестировать
//  только через bun/node с настоящими UTF-8 строками!
//
// /start — приветственное фото + подпись с премиум-эмодзи + цветные кнопки.
// /start КОД — привязка аккаунта. Уведомления: основной сервер дергает POST /send.
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
// ПРЯМОЙ домен Mini App (не t.me!). Когда задан — кнопки открывают игру напрямую
// (web_app-кнопка, initData приходит сразу, без обёртки t.me).
const PUBLIC_URL = (process.env.APP_PUBLIC_URL ?? '').trim().replace(/\/+$/, '')
// API игры для бота: при заданном домене — прод (Vercel), иначе локальный dev-сервер
const GAME_API = PUBLIC_URL || 'http://127.0.0.1:3000'

// ─────────────────────────────────────────────────────────────────────────────
// Премиум-эмодзи (custom_emoji_id). Все ID проверены через getCustomEmojiStickers,
// фолбэк = точный базовый эмодзи (это важно для парсера).
// Наборы: NewsEmoji, TgAndroidIcons, VariousAnimations9 — анимированные.
// ─────────────────────────────────────────────────────────────────────────────
const EMOJI = {
  fire: '5424972470023104089', // 🔥
  ruble: '5231449120635370684', // 💸
  dollar: '5409048419211682843', // 💵
  chartUp: '5244837092042750681', // 📈
  arrowUp: '5449683594425410231', // 🔼
  star: '5438496463044752972', // ⭐️
  bell: '5458603043203327669', // 🔔
  megaphone: '5424818078833715060', // 📣
  tag: '5985433648810171091', // 🏷
  wallet: '5769403330761593044', // 👛
  shop: '5983399041197675256', // 🏪
  info: '5323442290708985472', // © (копирайт — для соглашения)
  like: '5337080053119336309', // 👍
  top: '5415655814079723871', // 🔝
  chat: '5443038326535759644', // 💬
  letter: '5253742260054409879', // ✉️
  briefcase: '5967389567781703494', // 💼
  bookmark: '5222444124698853913', // 🔖
  exclaim: '5274099962655816924', // ❗️
  diagram: '5231200819986047254', // 📊
  link: '5271604874419647061', // 🔗
  check: '5206607081334906820', // ✔️
  plane: '5875465628285931233', // ✈️
} as const

// HTML-тег премиум-эмодзи для parse_mode HTML (фолбэк — точный базовый эмодзи)
function emo(id: string, fallback: string): string {
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Кнопки: цветные (style) + иконка премиум-эмодзи перед текстом
// ─────────────────────────────────────────────────────────────────────────────
interface Btn {
  text: string
  url?: string
  callback_data?: string
  web_app?: { url: string }
  style?: 'primary' | 'success' | 'danger' | 'link'
  icon_custom_emoji_id?: string
}
interface Markup {
  inline_keyboard: Btn[][]
}

// Кнопка «Начать»: с прямым доменом — web_app (открывает игру сразу),
// без него — t.me-ссылка (фолбэк)
const PLAY_BTN: Btn = PUBLIC_URL
  ? { text: 'Начать ресейлить', web_app: { url: PUBLIC_URL }, style: 'success', icon_custom_emoji_id: EMOJI.arrowUp }
  : { text: 'Начать ресейлить', url: APP_URL, style: 'success', icon_custom_emoji_id: EMOJI.arrowUp }

const WELCOME_MARKUP: Markup = {
  inline_keyboard: [
    [PLAY_BTN],
    [{ text: 'Подписаться на канал', url: CHANNEL_URL, style: 'primary', icon_custom_emoji_id: EMOJI.bell }],
    [{ text: 'Пользовательское соглашение', callback_data: 'terms', icon_custom_emoji_id: EMOJI.info }],
    [{ text: 'Помощь и команды', callback_data: 'help', style: 'link', icon_custom_emoji_id: EMOJI.chat }],
  ],
}

const BACK_MARKUP: Markup = {
  inline_keyboard: [
    [{ text: 'Вернуться в меню', callback_data: 'back', style: 'primary', icon_custom_emoji_id: EMOJI.link }],
  ],
}

const START_MARKUP: Markup = {
  inline_keyboard: [
    [PLAY_BTN],
    [{ text: 'Помощь и команды', callback_data: 'help', style: 'link', icon_custom_emoji_id: EMOJI.chat }],
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Тексты (лимит подписи к фото — 1024 символа)
// ─────────────────────────────────────────────────────────────────────────────
const WELCOME_CAPTION = [
  `${emo(EMOJI.fire, '🔥')} <b><i>Resale</i></b> — симулятор ресейла, где скупка и перепродажа превращаются в империю.`,
  '',
  `${emo(EMOJI.shop, '🏪')} <b>Что тебя ждёт:</b>`,
  `${emo(EMOJI.ruble, '💸')} живая экономика — цены двигают ИИ-боты и реальные игроки`,
  `${emo(EMOJI.tag, '🏷')} скупай дёшево, торгуйся в чатах и продавай дороже`,
  `${emo(EMOJI.chartUp, '📈')} аукционы, банк, налоги и доставки — как в жизни`,
  `${emo(EMOJI.star, '⭐️')} уровни, рейтинг и топ лидеров сервера`,
  '',
  `${emo(EMOJI.dollar, '💵')} Стартовый капитал уже ждёт. Удачных сделок!`,
].join('\n')

const TERMS_TEXT = [
  `${emo(EMOJI.tag, '🏷')} <b>Пользовательское соглашение Resale</b>`,
  '',
  `<b>1.</b> Resale — онлайн-игра, симулятор перепродажи. Все товары, продавцы, деньги и чаты — вымышленные.`,
  `<b>2.</b> Внутриигровая валюта не имеет реальной стоимости; реальные товары не продаются и не покупаются.`,
  `<b>3.</b> Запрещены оскорбления, спам, попытки обмана игроков и злоупотребление багами.`,
  `<b>4.</b> Мы можем корректировать экономику и баланс игры, уведомляя игроков в канале ${CHANNEL_URL}.`,
  `<b>5.</b> Для профиля игра использует только имя и username из Telegram.`,
  `<b>6.</b> Продолжая играть, вы соглашаетесь с этими правилами.`,
  '',
  `${emo(EMOJI.like, '👍')} Приятного ресейла!`,
].join('\n')

const HELP_TEXT = [
  `${emo(EMOJI.chat, '💬')} <b>Команды бота Resale</b>`,
  '',
  `${emo(EMOJI.link, '🔗')} /start КОД — привязать аккаунт из игры`,
  `${emo(EMOJI.wallet, '👛')} /balance — кошелёк, долги и налоги`,
  `${emo(EMOJI.chartUp, '📈')} /lots — активные лоты аукциона`,
  `${emo(EMOJI.letter, '✉️')} /help — эта справка`,
  '',
  `${emo(EMOJI.shop, '🏪')} <b>Как играть:</b>`,
  `<b>1.</b> Нажми «Начать ресейлить» — откроется смартфон с игрой.`,
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

// Убрать премиум-фичи из HTML (фолбэк для случаев, если API отклонит custom emoji)
function stripPremiumHtml(html: string): string {
  return html.replace(/<tg-emoji emoji-id="\d+">([\s\S]*?)<\/tg-emoji>/g, '$1')
}
// Убрать style кнопок, но оставить иконки премиум-эмодзи
function stripButtonStyles(markup: Markup | null): Markup | null {
  if (!markup) return null
  return {
    inline_keyboard: markup.inline_keyboard.map((row) =>
      row.map((b) => {
        const { style, ...rest } = b
        void style
        return rest
      }),
    ),
  }
}
function stripPremiumMarkup(markup: Markup | null): Markup | null {
  if (!markup) return null
  return {
    inline_keyboard: markup.inline_keyboard.map((row) =>
      row.map((b) => {
        const { style, icon_custom_emoji_id, ...rest } = b
        void style
        void icon_custom_emoji_id
        return rest
      }),
    ),
  }
}

// Отправка текста с авто-фолбэком: полный премиум -> кнопки без стилей (иконки остаются)
// -> всё без премиума -> чистый текст. На живом API первый вариант проходит.
async function sendSmart(chatId: number | string, html: string, markup?: Markup): Promise<TgResult | null> {
  const variants: Array<{ text: string; markup: Markup | null }> = [
    ...(markup
      ? [markup, stripButtonStyles(markup), stripPremiumMarkup(markup)].map((m) => ({ text: html, markup: m }))
      : []),
    { text: stripPremiumHtml(html), markup: null as Markup | null },
  ]
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i]
    const res = await tg('sendMessage', {
      chat_id: chatId,
      text: v.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(v.markup ? { reply_markup: v.markup } : {}),
    })
    if (res && res.ok) {
      if (i > 0) console.warn(`[tg-bot] sendMessage premium-variant ${i} → fallback used`)
      return res
    }
    if (res) console.warn(`[tg-bot] sendMessage variant ${i + 1}/${variants.length} failed:`, res.description)
  }
  console.warn(`[tg-bot] sendMessage → ${chatId}: ALL variants failed`)
  return null
}

// Приветствие: фото-баннер + подпись с премиум-эмодзи + кнопки.
// Первый раз — upload файла, дальше — мгновенный file_id (кэш в памяти).
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
    // 3 попытки: полный премиум → кнопки без стилей → всё без премиума
    const attempts: Array<{ markup: Markup | null; caption: string }> = [
      { markup: WELCOME_MARKUP, caption: WELCOME_CAPTION },
      { markup: stripButtonStyles(WELCOME_MARKUP), caption: WELCOME_CAPTION },
      { markup: stripPremiumMarkup(WELCOME_MARKUP), caption: WELCOME_CAPTION },
      { markup: null, caption: stripPremiumHtml(WELCOME_CAPTION) },
    ]
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i]
      try {
        let data: TgResult | null
        if (welcomeFileId) {
          data = await tg('sendPhoto', {
            chat_id: chatId,
            photo: welcomeFileId,
            caption: a.caption,
            parse_mode: 'HTML',
            ...(a.markup ? { reply_markup: a.markup } : {}),
          })
        } else {
          const form = new FormData()
          form.append('chat_id', String(chatId))
          form.append('photo', new Blob([new Uint8Array(buf as Buffer)], { type: 'image/png' }), 'welcome.png')
          form.append('caption', a.caption)
          form.append('parse_mode', 'HTML')
          if (a.markup) form.append('reply_markup', JSON.stringify(a.markup))
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
          if (i > 0) console.warn(`[tg-bot] sendPhoto premium-variant ${i} → fallback used`)
          console.log(`[tg-bot] welcome → ${chatId}: OK${welcomeFileId ? ' (file_id cached)' : ''}`)
          return data
        }
        console.warn('[tg-bot] sendPhoto attempt', i + 1, 'failed:', data?.description ?? 'no response')
      } catch (e) {
        console.error('[tg-bot] sendPhoto error', e)
      }
    }
  }
  // фолбэк: текстовое приветствие теми же кнопками
  return sendSmart(chatId, WELCOME_CAPTION, WELCOME_MARKUP)
}

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GAME_API}${path}`, {
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

async function apiPost(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${GAME_API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-service-secret': SECRET },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch (e) {
    console.error('[tg-bot] app api POST error', path, e)
    return false
  }
}

// Экранирование HTML (parse_mode: HTML) — заголовки/описания приходят из игры
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
      const res = await fetch(`${GAME_API}/api/telegram/bind`, {
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
            `${emo(EMOJI.check, '✔️')} <b>Аккаунт привязан, ${data.displayName ?? name}!</b>`,
            '',
            `${emo(EMOJI.wallet, '👛')} Кошелёк: <b>${fmtMoney(data.balance ?? 0)}</b>`,
            '',
            `${emo(EMOJI.bell, '🔔')} Теперь сюда будут приходить уведомления: сделки, перебитые ставки аукциона, доставки, налоги, кредиты, ремонт и достижения.`,
            '',
            `${emo(EMOJI.arrowUp, '🔼')} Жми кнопку — и в игру:`,
          ].join('\n'),
          START_MARKUP,
        )
      } else {
        await sendSmart(
          chatId,
          `${emo(EMOJI.exclaim, '❗️')} Не получилось: ${data.error ?? 'код не принят'}.\nПолучите новый код в игре: Настройки → Telegram.`,
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
        `${emo(EMOJI.exclaim, '❗️')} Аккаунт не привязан.\nОткройте игру → Настройки → «Получить код привязки» и отправьте <code>/start КОД</code>.`,
        START_MARKUP,
      )
      return
    }
    const lines = [
      `${emo(EMOJI.wallet, '👛')} <b>${st.displayName}</b> · уровень ${st.level} · рейтинг ${st.rating || '—'}`,
      '',
      `${emo(EMOJI.dollar, '💵')} Кошелёк: <b>${fmtMoney(st.balance ?? 0)}</b>`,
      st.deposit ? `${emo(EMOJI.diagram, '📊')} На вкладе: ${fmtMoney(st.deposit)}` : null,
      st.debt ? `${emo(EMOJI.briefcase, '💼')} Долг банку: <b>${fmtMoney(st.debt)}</b>` : `${emo(EMOJI.check, '✔️')} Долгов банку нет`,
      st.taxDebt
        ? `${emo(EMOJI.exclaim, '❗️')} Налоговая: <b>${fmtMoney(st.taxDebt)}</b> — оплатите, пока не заблокировали продажи`
        : `${emo(EMOJI.check, '✔️')} Налоговая: чисто`,
      '',
      st.deliveries ? `${emo(EMOJI.plane, '✈️')} Доставок в пути: ${st.deliveries}` : null,
      st.leading ? `${emo(EMOJI.top, '🔝')} Вы лидер в ${st.leading} лот(ах) аукциона` : null,
    ].filter((x): x is string => x !== null)
    await sendSmart(chatId, lines.join('\n'))
    return
  }

  if (cmd === '/lots') {
    const data = await apiGet<{ lots: Array<{ title: string; currentBid: number; bids: number; leader: string; endsInMin: number }> }>(`/api/telegram/auctions`)
    if (!data || data.lots.length === 0) {
      await sendSmart(chatId, `${emo(EMOJI.chartUp, '📈')} Активных лотов нет. Аукционный дом выставляет новые — следите за уведомлениями.`)
      return
    }
    const lines = [`${emo(EMOJI.chartUp, '📈')} <b>Аукцион · активные лоты</b>`, '']
    for (const l of data.lots) {
      lines.push(`${emo(EMOJI.tag, '🏷')} <b>${l.title}</b>`)
      lines.push(`${fmtMoney(l.currentBid)} · ${l.bids} ставок · лидер ${l.leader} · конец через ${l.endsInMin} мин`)
      lines.push('')
    }
    lines.push(`${emo(EMOJI.arrowUp, '🔼')} Ставки — в приложении Аукцион в игре.`)
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
// Long polling (один экземпляр! dev-скрипт без --hot, чтобы не плодить зомби-поллеры)
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
// ДОСТАВКА уведомлений из прода: раз в 20 с опрашиваем /api/telegram/pending,
// рассылаем в привязанные чаты и подтверждаем (tgSentAt). На Vercel нет
// постоянного процесса — прямой /send там недоступен, поэтому так.
// ---------------------------------------------------------------------------
const KIND_EMOJI: Record<string, string> = {
  deal: '💰',
  message: '✉️',
  tax: '🧾',
  market: '📈',
  system: '⚙️',
}

interface PendingItem {
  id: string
  kind: string
  title: string
  body: string
  createdAt: string
}

let pendingBusy = false

async function pendingTick(): Promise<void> {
  if (pendingBusy) return
  pendingBusy = true
  try {
    const data = await apiGet<{ chats: Array<{ chatId: string; displayName: string; items: PendingItem[] }> }>(
      '/api/telegram/pending',
    )
    if (!data || !Array.isArray(data.chats) || data.chats.length === 0) return
    for (const chat of data.chats) {
      const sent: string[] = []
      // батчами по 8 — одна пачка = одно сообщение
      for (let i = 0; i < chat.items.length; i += 8) {
        const batch = chat.items.slice(i, i + 8)
        const text = batch
          .map((n) => {
            const e = KIND_EMOJI[n.kind] ?? '🔔'
            const body = n.body ? `\n${escHtml(n.body)}` : ''
            return `${e} <b>${escHtml(n.title)}</b>${body}`
          })
          .join('\n\n')
        const res = await sendSmart(chat.chatId, text)
        if (res && res.ok) {
          for (const n of batch) sent.push(n.id)
        } else {
          break // Telegram недоступен — не подтверждаем, попробуем в следующий тик
        }
      }
      if (sent.length > 0) {
        const ok = await apiPost('/api/telegram/pending', { ids: sent })
        console.log(`[tg-bot] pending → ${chat.chatId} (${chat.displayName}): sent ${sent.length}/${chat.items.length}, ack ${ok ? 'OK' : 'FAILED'}`)
      }
    }
  } catch (e) {
    console.error('[tg-bot] pending error', e)
  } finally {
    pendingBusy = false
  }
}

async function pendingLoop(): Promise<void> {
  // первый тик через 5 с после старта, дальше раз в 20 с
  await new Promise((r) => setTimeout(r, 5000))
  for (;;) {
    await pendingTick()
    await new Promise((r) => setTimeout(r, 20_000))
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
    menu_button: PUBLIC_URL
      ? { type: 'web_app', text: 'Начать ресейлить', web_app: { url: PUBLIC_URL } }
      : { type: 'web_app', text: 'Начать ресейлить', web_app: { url: APP_URL } },
  })
  console.log(`[tg-bot] profile configured: name, commands, menu button (web_app, url=${PUBLIC_URL || APP_URL})`)
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Точка старта (вызывается из instrumentation.ts; защита от повторного запуска)
// ─────────────────────────────────────────────────────────────────────────────
export function startTelegramBot(): void {
  const g = globalThis as unknown as { __resaleBotStarted?: boolean }
  if (g.__resaleBotStarted) return
  g.__resaleBotStarted = true
  try {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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
    })

    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        console.log('[tg-bot] :3004 уже занят (standalone-инстанс?) — HTTP пропускаю, polling не дублирую')
        g.__resaleBotStarted = false
        return
      }
      console.error('[tg-bot] server error', e)
    })

    server.listen(PORT, () => {
      console.log(`[tg-bot] listening on :${PORT} (inside next-server), token ${TOKEN ? 'OK' : 'MISSING'}`)
      void setupBot()
      void pollLoop()
      void pendingLoop()
    })
  } catch (e) {
    g.__resaleBotStarted = false
    console.error('[tg-bot] start failed', e)
  }
}
