// Telegram-бот @resalesimbot — mini-service на порту :3004
// Долгий polling getUpdates + HTTP endpoints /health, /send.
// Привязка аккаунта: игрок в Настройках получает код, шлёт боту /start КОД.
// Уведомления: основной сервер дергает POST /send { chatId, text }.
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'

// Подтянуть корневой .env (мини-сервис — отдельный проект, bun грузит только свой .env)
function loadRootEnv(): void {
  // bun даёт import.meta.dir, в tsc-типах его нет — берём cwd-кандидаты
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
const APP_ORIGIN = process.env.APP_ORIGIN ?? ''

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
interface TgUpdate {
  update_id: number
  message?: TgMessage
}

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`
}

async function tg(method: string, body: Record<string, unknown>): Promise<unknown> {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    return (await res.json()) as unknown
  } catch (e) {
    console.error('[tg-bot] api error', method, e)
    return null
  }
}

async function sendMessage(chatId: number | string, text: string): Promise<unknown> {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
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
        await sendMessage(
          chatId,
          `Аккаунт привязан, <b>${data.displayName ?? name}</b>. Подключение к «Сделке» установлено.\n\nТеперь сюда будут приходить уведомления: сделки, перебитые ставки аукциона, доставки, налоги, кредиты, ремонт и достижения.\n\nКоманды:\n/balance — кошелёк и долги\n/lots — лоты аукциона\n/help — список команд`,
        )
      } else {
        await sendMessage(chatId, `Не получилось: ${data.error ?? 'код не принят'}. Получите новый код в Настройках игры.`)
      }
      return
    }
    await sendMessage(
      chatId,
      `Это бот игры <b>«Сделка — симулятор перепродажи»</b>.\n\nЧтобы получать уведомления игры:\n1. Откройте игру → Настройки → раздел «Telegram».\n2. Нажмите «Получить код привязки».\n3. Пришлите мне: <code>/start КОД</code>\n\nКоманды: /balance, /lots, /help`,
    )
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
      await sendMessage(chatId, 'Аккаунт не привязан. Отправьте <code>/start КОД</code> — код в Настройках игры.')
      return
    }
    const lines = [
      `<b>${st.displayName}</b> · уровень ${st.level} · рейтинг ${st.rating || '—'}`,
      ``,
      `Кошелёк: <b>${fmtMoney(st.balance ?? 0)}</b>`,
      st.deposit ? `На вкладе: ${fmtMoney(st.deposit)}` : null,
      st.debt ? `Долг банку: <b>${fmtMoney(st.debt)}</b>` : `Долгов банку нет`,
      st.taxDebt ? `Налоговая: <b>${fmtMoney(st.taxDebt)}</b> — оплатите, пока не заблокировали продажи` : `Налоговая: чисто`,
      ``,
      st.deliveries ? `Доставок в пути: ${st.deliveries}` : null,
      st.leading ? `Вы лидер в ${st.leading} лот(ах) аукциона` : null,
    ].filter((x): x is string => x !== null)
    await sendMessage(chatId, lines.join('\n'))
    return
  }

  if (cmd === '/lots') {
    const data = await apiGet<{ lots: Array<{ title: string; currentBid: number; bids: number; leader: string; endsInMin: number }> }>(`/api/telegram/auctions`)
    if (!data || data.lots.length === 0) {
      await sendMessage(chatId, 'Активных лотов нет. Аукционный дом выставляет новые — следите за уведомлениями.')
      return
    }
    const lines = ['<b>Аукцион · активные лоты</b>', '']
    for (const l of data.lots) {
      lines.push(`<b>${l.title}</b>`)
      lines.push(`${fmtMoney(l.currentBid)} · ${l.bids} ставок · лидер ${l.leader} · конец через ${l.endsInMin} мин`)
      lines.push('')
    }
    lines.push('Ставки — в приложении Аукцион в игре.')
    await sendMessage(chatId, lines.join('\n'))
    return
  }

  // /help и всё остальное
  await sendMessage(
    chatId,
    `<b>«Сделка» — команды бота</b>\n/start КОД — привязать аккаунт\n/balance — кошелёк, долги, налоги\n/lots — активные лоты аукциона\n/help — эта справка`,
  )
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
      const data = (await res.json()) as { ok?: boolean; result?: TgUpdate[] }
      for (const u of data.result ?? []) {
        offset = u.update_id + 1
        if (u.message?.text) {
          await handleCommand(u.message).catch((e) => console.error('[tg-bot] cmd error', e))
        }
      }
    } catch (e) {
      // таймаут polling — это норма; пауза при сетевых проблемах
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP: /health, /send, /status
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
    sendJson(res, 200, { ok: true, service: 'telegram-bot', token: TOKEN ? 'set' : 'missing', offset })
    return
  }

  if (url === '/send' && req.method === 'POST') {
    let body = ''
    req.on('data', (c: Buffer) => (body += c.toString()))
    req.on('end', async () => {
      try {
        const { secret, chatId, text } = JSON.parse(body) as { secret?: string; chatId?: string; text?: string }
        if (secret !== SECRET) return sendJson(res, 403, { error: 'forbidden' })
        if (!chatId || !text) return sendJson(res, 400, { error: 'chatId and text required' })
        if (!TOKEN) return sendJson(res, 503, { error: 'BOT_TOKEN missing' })
        const tgRes = (await sendMessage(chatId, text)) as { ok?: boolean; description?: string } | null
        console.log(`[tg-bot] send → ${chatId}: ${tgRes && tgRes.ok ? 'OK' : tgRes?.description ?? 'no response'}`)
        sendJson(res, 200, { ok: true })
      } catch (e) {
        sendJson(res, 500, { error: 'bad request' })
      }
    })
    return
  }
  sendJson(res, 404, { error: 'not found' })
}).listen(PORT, () => {
  console.log(`[tg-bot] listening on :${PORT}, token ${TOKEN ? 'OK' : 'MISSING'}`)
  void pollLoop()
})
