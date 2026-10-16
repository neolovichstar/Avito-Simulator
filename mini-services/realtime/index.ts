// Realtime mini-service: socket.io + HTTP endpoints на одном порту :3003
// Игра "Avito — Симулятор ресейла"
//
// 64-b/C2 + 64-c/C2: ОБЯЗАТЕЛЬНАЯ АУТЕНТИФИКАЦИЯ (по образцу call-service :3303).
//  • Клиент передаёт bearer-токен сессии в socket.io option auth: { token }
//    (тот же токен, что lib/api.ts getToken()). НА ВЕРУ uid больше не принимается:
//    он берётся ИЗ ОТВЕТА /api/mini-auth, а не из клиентского query.
//  • Валидный токен → сервер сам джойнит 'global' и `user:${uid}`. Невалидный /
//    отсутствующий токен → socket.disconnect(). Клиентский 'subscribe' разрешён
//    ТОЛЬКО на 'global' и свой `user:${uid}` (чужие каналы — игнор + лог).
//  • POST /emit: секрет ОБЯЗАТЕЛЕН. Если REALTIME_SECRET не задан (env или
//    корневой .env) — генерируется случайный за процесс (внешние /emit
//    не работают — fail-closed) + warn в лог.
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { Server, type Socket } from 'socket.io'

const PORT = 3003
const MAIN_APP = process.env.MAIN_APP_URL ?? 'http://127.0.0.1:3000'

// ── секрет /emit ─────────────────────────────────────────────────────────────
// bun грузит только .env своего cwd; корневой .env проекта — единая точка
// секрета для Next и этого сервиса (тот же паттерн loadRootEnv у telegram-bot).
function loadRootEnv(): void {
  const here = dirname(import.meta.url.replace('file://', ''))
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

const ENV_SECRET = process.env.REALTIME_SECRET
// fail-closed: без заданного секрета внешний /emit не работает (случайный за процесс)
const SECRET = ENV_SECRET ?? randomUUID()
if (!ENV_SECRET) {
  console.warn('[realtime] REALTIME_SECRET not set — /emit rejected (fail-closed), random per-process secret generated')
}

// ── аутентификация сокетов через основное приложение (паттерн call-service) ──
interface AuthResult {
  ok: boolean
  userId: string | null
  expires: number
}
const AUTH_TTL_MS = 5 * 60 * 1000 // кэш проверки токена — 5 минут
const AUTH_CACHE_MAX = 5000 // защита памяти: грубая чистка при переполнении
const authCache = new Map<string, AuthResult>()

async function validateToken(token: string): Promise<AuthResult> {
  const cached = authCache.get(token)
  if (cached && cached.expires > Date.now()) return cached
  try {
    const res = await fetch(`${MAIN_APP}/api/mini-auth?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; userId?: string }
    const entry: AuthResult = {
      ok: res.ok && data.ok === true && typeof data.userId === 'string',
      userId: data.userId ?? null,
      expires: Date.now() + AUTH_TTL_MS,
    }
    if (authCache.size >= AUTH_CACHE_MAX) {
      for (const [k, v] of authCache) {
        if (v.expires <= Date.now()) authCache.delete(k)
      }
      if (authCache.size >= AUTH_CACHE_MAX) {
        const first = authCache.keys().next()
        if (!first.done) authCache.delete(first.value)
      }
    }
    authCache.set(token, entry)
    return entry
  } catch {
    // основное приложение недоступно: НЕ кэшируем отказ, чтобы подключение
    // заработало сразу после его подъёма
    return { ok: false, userId: null, expires: 0 }
  }
}

// ── лимиты подписок ──────────────────────────────────────────────────────────
const MAX_ROOMS_PER_SOCKET = 8 // включая собственную system-комнату сокета

function allowedChannel(channel: string, uid: string): boolean {
  return channel === 'global' || channel === `user:${uid}`
}

// uid → число активных подключений (несколько вкладок одного игрока)
const presence = new Map<string, number>()

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  // origin '*' оставлен сознательно: TG WebView/socket.io polling без CORS не
  // взлетит, а настоящая граница — обязательный токен в handshake-auth
  // (64-b/C2). Без валидного токена сокет отключается сразу после connect.
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ---------------------------------------------------------------------------
// HTTP endpoints: /health, /presence, /emit
//
// Нюанс: engine.io (ядро socket.io) с path '/' перехватывает ЛЮБОЙ запрос,
// чей URL начинается с '/' — check(): `path === req.url.slice(0, path.length)`.
// Поэтому роутер добавляется через prependListener (выполняется РАНЬШЕ
// обработчика engine.io). Для обслуженных нами путей переписываем req.url
// так, чтобы check() вернул false и engine.io не отвечал второй раз.
// Handshake/polling-запросы engine.io (URL вида /?EIO=...) пропускаем как есть.
// ---------------------------------------------------------------------------
const ROUTES = new Set(['/health', '/presence', '/emit'])

httpServer.prependListener('request', (req: IncomingMessage, res: ServerResponse) => {
  const rawUrl = req.url ?? '/'
  const qIndex = rawUrl.indexOf('?')
  const pathname = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex)
  const method = (req.method ?? 'GET').toUpperCase()

  // engine.io (socket.io) обслуживает свои пути сам: polling (/socket.io/?EIO=…)
  // и websocket-upgrade не должны перехватываться роутером — пропускаем как есть
  if (rawUrl.includes('EIO=') || pathname === '/socket.io' || pathname.startsWith('/socket.io/')) return

  // объявляем запрос своим: url больше не начинается с '/' → engine.io пропустит
  req.url = 'realtime-claimed'

  // CORS preflight на любой путь
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (!ROUTES.has(pathname)) {
    sendJson(res, 404, { error: 'not found' })
    return
  }

  if (pathname === '/health' && method === 'GET') {
    sendJson(res, 200, { ok: true, online: presence.size })
    return
  }

  if (pathname === '/presence' && method === 'GET') {
    sendJson(res, 200, { online: presence.size })
    return
  }

  // POST /emit
  const chunks: Buffer[] = []
  let size = 0
  let claimed = false
  req.on('data', (c: Buffer) => {
    size += c.length
    if (size > 1_000_000) {
      claimed = true
      sendJson(res, 413, { error: 'payload too large' })
      req.destroy()
      return
    }
    chunks.push(c)
  })
  req.on('end', () => {
    if (claimed) return
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
        secret?: string
        channel?: string
        event?: string
        payload?: unknown
      }

      if (body.secret !== SECRET) {
        sendJson(res, 403, { error: 'forbidden' })
        return
      }

      const { channel, event, payload } = body
      if (typeof channel !== 'string' || typeof event !== 'string' || !channel || !event) {
        sendJson(res, 400, { error: 'channel and event are required strings' })
        return
      }

      if (channel === 'global') io.emit(event, payload)
      else io.to(channel).emit(event, payload)
      console.log(`[emit] channel=${channel} event=${event}`)
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { error: 'bad json' })
    }
  })
})

// ---------------------------------------------------------------------------
// socket.io: handshake с auth: { token }, комнаты, подписки
// ---------------------------------------------------------------------------

// Аутентификация на уровне middleware: невалидный/отсутствующий токен
// отклоняется ещё на handshake (клиент получает connect_error, сокет не
// попадает ни в одну комнату и не считается в presence).
io.use((socket, next) => {
  const rawToken = (socket.handshake.auth as { token?: unknown } | undefined)?.token
  const token = typeof rawToken === 'string' ? rawToken.trim() : ''
  if (!token) {
    console.log(`[connect DENIED] socket=${socket.id} reason=no-token`)
    next(new Error('unauthorized: token required'))
    return
  }
  void validateToken(token)
    .then((res) => {
      if (!res.ok || !res.userId) {
        console.log(`[connect DENIED] socket=${socket.id} reason=bad-token`)
        next(new Error('unauthorized'))
        return
      }
      // uid берём ИЗ ОТВЕТА /api/mini-auth, не из клиентских данных
      socket.data.uid = res.userId
      next()
    })
    .catch(() => {
      console.log(`[connect DENIED] socket=${socket.id} reason=auth-check-failed`)
      next(new Error('unauthorized'))
    })
})

io.on('connection', (socket: Socket) => {
  const uid = socket.data.uid as string | null
  if (!uid) return // страховка: middleware гарантированно кладёт uid

  // сервер сам джойнит общую и личную комнату игрока (вкладок может быть несколько)
  socket.join('global')
  socket.join(`user:${uid}`)

  presence.set(uid, (presence.get(uid) ?? 0) + 1)
  console.log(`[connect] socket=${socket.id} uid=${uid} tabs=${presence.get(uid)} online=${presence.size}`)

  // broadcast онлайн-счётчика (клиент слушает событие 'online')
  io.emit('online', { online: presence.size })

  socket.on('subscribe', (data: { channels?: string[] }) => {
    const channels = Array.isArray(data?.channels)
      ? data.channels.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : []
    for (const ch of channels) {
      // 64-c/C2: только свои каналы — чужой user:* / chat:* / произвольные игнорируем
      if (!allowedChannel(ch, uid)) {
        console.log(`[subscribe DENIED] socket=${socket.id} uid=${uid} channel=${ch}`)
        continue
      }
      if (socket.rooms.size >= MAX_ROOMS_PER_SOCKET) {
        console.log(`[subscribe LIMIT] socket=${socket.id} uid=${uid} channel=${ch} rooms=${socket.rooms.size}`)
        continue
      }
      socket.join(ch)
    }
    if (channels.length) console.log(`[subscribe] socket=${socket.id} uid=${uid} channels=${channels.join(',')}`)
  })

  socket.on('unsubscribe', (data: { channels?: string[] }) => {
    const channels = Array.isArray(data?.channels)
      ? data.channels.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : []
    for (const ch of channels) {
      if (!allowedChannel(ch, uid)) {
        console.log(`[unsubscribe DENIED] socket=${socket.id} uid=${uid} channel=${ch}`)
        continue
      }
      socket.leave(ch)
    }
    if (channels.length) console.log(`[unsubscribe] socket=${socket.id} uid=${uid} channels=${channels.join(',')}`)
  })

  socket.on('disconnect', (reason) => {
    const left = (presence.get(uid) ?? 1) - 1
    if (left <= 0) presence.delete(uid)
    else presence.set(uid, left)
    console.log(`[disconnect] socket=${socket.id} uid=${uid} reason=${reason} online=${presence.size}`)
    io.emit('online', { online: presence.size })
  })

  socket.on('error', (error) => {
    console.error(`[socket error] ${socket.id}:`, error)
  })
})

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`Realtime service (socket.io) listening on 127.0.0.1:${PORT}`)
})

// Graceful shutdown (форс-выход через 2с — как в call-service: висящий keep-alive
// не должен оставлять зомби-процесс после SIGTERM)
function shutdown(signal: string): void {
  console.log(`Received ${signal} signal, shutting down server...`)
  io.close()
  httpServer.close(() => {
    console.log('Realtime server closed')
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 2000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ─────────────────────────────────────────────────────────────────────────────
// Кипер telegram-бота (:3004). Песочница убивает процессы, рождённые внутри
// активной tool-сессии, на её границе; процессы, рождённые долгоживущим
// realtime-сервисом, выживают. Раз в 30 с проверяем :3004/health и при
// необходимости спавним bun index.ts (детached, отдельная сессия).
// ─────────────────────────────────────────────────────────────────────────────
const BOT_DIR = new URL('../telegram-bot', import.meta.url).pathname
let botProc: ReturnType<typeof Bun.spawn> | null = null

async function botAlive(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:3004/health', { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureBot(): Promise<void> {
  if (await botAlive()) return
  if (botProc && !botProc.killed) {
    try { botProc.kill(9) } catch { /* уже мёртв */ }
    botProc = null
  }
  console.log('[rt-keeper] spawning telegram-bot...')
  try {
    botProc = Bun.spawn(['bun', 'index.ts'], {
      cwd: BOT_DIR,
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'ignore',
    })
    // отвязать ребёнка от нашей группы, чтобы он переживал перезагрузки --hot
    try { botProc.unref() } catch { /* noop */ }
  } catch (e) {
    console.error('[rt-keeper] spawn failed', e)
  }
}

setInterval(() => { void ensureBot() }, 30_000)
setTimeout(() => { void ensureBot() }, 4000)
console.log('[rt-keeper] telegram-bot keeper scheduled (check every 30s)')
