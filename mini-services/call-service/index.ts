// ─────────────────────────────────────────────────────────────────────────────
// CALL-SERVICE :3303 — сигналинг P2P-звонков игрок↔игрок (Task 27-e).
//
// Реюз подхода realtime-сервиса (:3003): socket.io на отдельном порту, path '/'
// (Caddy форвардит через XTransformPort), приватный релей событий.
//
// Отличия от :3003:
//  • строгая аутентификация: после connect клиент шлёт 'auth' { token };
//    токен — тот же bearer, что в lib/api.ts getToken(). Сервис проверяет его
//    HTTP-запросом к основному приложению GET /api/mini-auth?token=... и
//    кэширует результат на 5 минут. Невалидный токен → disconnect.
//  • реестр онлайн-юзеров в памяти: Map<userId, {name, sockets[]}> —
//    presence:user-online/offline только ВНУТРЕННЕ (в эфир не рассылаем).
//  • релей звонкового сигналинга ТОЛЬКО адресату (private relay):
//    call:invite/accept/reject/busy/cancel/hangup, webrtc:offer/answer/ice.
//    Важные шаги — с ack-подтверждениями.
//  • устойчивость: адресат offline → ack { delivered:false }; если у юзера
//    отвалился сокет В активном звонке — пир получает 'call:peer-lost',
//    после перерегистрации — 'call:peer-back' (клиент делает ICE restart).
// ─────────────────────────────────────────────────────────────────────────────

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server, type Socket } from 'socket.io'

const PORT = 3303 // ЖЁСТКО: фронт ходит через io('/?XTransformPort=3303')
const MAIN_APP = process.env.MAIN_APP_URL ?? 'http://127.0.0.1:3000'
const AUTH_TTL_MS = 5 * 60 * 1000 // кэш проверки токена — 5 минут
const AUTH_TIMEOUT_MS = 10_000 // не представился за 10с — отваливаем
const AUTH_CACHE_MAX = 5000 // защита памяти: LRU-подобная чистка

// ── реестры в памяти ─────────────────────────────────────────────────────────
interface AuthResult {
  ok: boolean
  userId: string | null
  name: string | null
  expires: number
}
const authCache = new Map<string, AuthResult>()

interface OnlineUser {
  userId: string
  name: string
  sockets: Set<string>
}
const online = new Map<string, OnlineUser>()

/** Активные звонки: userId → peerUserId (для peer-lost/peer-back). */
const inCall = new Map<string, string>()

// ── аутентификация через основное приложение ────────────────────────────────
async function validateToken(token: string): Promise<AuthResult> {
  const cached = authCache.get(token)
  if (cached && cached.expires > Date.now()) return cached
  try {
    const res = await fetch(`${MAIN_APP}/api/mini-auth?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; userId?: string; name?: string }
    const entry: AuthResult = {
      ok: res.ok && data.ok === true && typeof data.userId === 'string',
      userId: data.userId ?? null,
      name: data.name ?? null,
      expires: Date.now() + AUTH_TTL_MS,
    }
    if (authCache.size >= AUTH_CACHE_MAX) {
      // грубая чистка просроченных, иначе — половина карты
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
    // основное приложение недоступно: НЕ кэшируем отказ, чтобы звонки
    // заработали сразу после его подъёма
    return { ok: false, userId: null, name: null, expires: 0 }
  }
}

// ── HTTP: /health (супервизор/смоук) ─────────────────────────────────────────
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

// ── socket.io ────────────────────────────────────────────────────────────────
// ВАЖНО: io создаётся ДО prependListener-роутера (как в realtime-сервисе):
// engine.io при attach оборачивает уже существующие listeners, и только
// prependListener ВЫШЕ его обработчика успевает перехватить свои роуты.
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
  maxHttpBufferSize: 1e6, // SDP/ICE маленькие, лимит с запасом
})

// Нюанс engine.io с path '/' — как в realtime-сервисе: свои роуты через
// prependListener и переписывание req.url, чтобы engine.io не отвечал второй раз.
const ROUTES = new Set(['/health', '/presence'])

httpServer.prependListener('request', (req: IncomingMessage, res: ServerResponse) => {
  const rawUrl = req.url ?? '/'
  const qIndex = rawUrl.indexOf('?')
  const pathname = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex)
  const method = (req.method ?? 'GET').toUpperCase()

  if (rawUrl.includes('EIO=') || pathname === '/socket.io' || pathname.startsWith('/socket.io/')) return

  req.url = 'call-service-claimed'

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (!ROUTES.has(pathname)) {
    sendJson(res, 404, { error: 'not found' })
    return
  }

  if (pathname === '/health') {
    sendJson(res, 200, { ok: true, online: online.size, calls: inCall.size / 2 })
    return
  }
  // /presence — внутренняя диагностика реестра
  const users = [...online.values()].map((u) => ({ userId: u.userId, name: u.name, sockets: u.sockets.size }))
  sendJson(res, 200, { online: online.size, users, calls: inCall.size / 2 })
})

/** Все сокеты юзера (все вкладки) — личная комната `user:{id}`. */
function userRoom(userId: string): string {
  return `user:${userId}`
}

function isOnline(userId: string): boolean {
  return online.has(userId)
}

/** Отметить активный звонок пары. */
function markInCall(a: string, b: string): void {
  inCall.set(a, b)
  inCall.set(b, a)
}

/** Снять отметку звонка (если она ещё про эту пару). */
function clearInCall(a: string, b: string): void {
  if (inCall.get(a) === b) inCall.delete(a)
  if (inCall.get(b) === a) inCall.delete(b)
}

const LOG = (msg: string) => console.log(`[call:${new Date().toISOString().slice(11, 19)}] ${msg}`)

io.on('connection', (socket: Socket) => {
  socket.data.authed = false
  socket.data.userId = null
  socket.data.name = null

  // не представился — прощаемся
  const authTimer = setTimeout(() => {
    if (!socket.data.authed) {
      LOG(`auth-timeout socket=${socket.id}`)
      socket.emit('call:error', { code: 'auth_timeout', message: 'Не выполнена аутентификация' })
      socket.disconnect(true)
    }
  }, AUTH_TIMEOUT_MS)
  socket.on('disconnect', () => clearTimeout(authTimer))

  // ── AUTH: клиент присылает { token } сразу после connect и после reconnect ──
  socket.on('auth', async (data: { token?: string }, ack?: (r: unknown) => void) => {
    const token = typeof data?.token === 'string' ? data.token.trim() : ''
    if (!token) {
      if (typeof ack === 'function') ack({ ok: false, error: 'token required' })
      socket.disconnect(true)
      return
    }
    const res = await validateToken(token)
    if (!res.ok || !res.userId) {
      LOG(`auth DENIED socket=${socket.id}`)
      if (typeof ack === 'function') ack({ ok: false, error: 'unauthorized' })
      socket.disconnect(true)
      return
    }

    const prevUserId = socket.data.userId as string | null
    // повторная auth того же юзера (reconnect/re-register) — просто продолжаем
    const fresh = prevUserId !== res.userId
    socket.data.authed = true
    socket.data.userId = res.userId
    socket.data.name = res.name ?? 'Игрок'

    socket.join(userRoom(res.userId))

    let entry = online.get(res.userId)
    if (!entry) {
      entry = { userId: res.userId, name: socket.data.name, sockets: new Set() }
      online.set(res.userId, entry)
      // presence:user-online — ВНУТРЕННЕ (лог), в эфир не рассылаем
      LOG(`presence:user-online userId=${res.userId} name=${socket.data.name} online=${online.size}`)
    }
    entry.sockets.add(socket.id)
    if (fresh) LOG(`auth ok socket=${socket.id} userId=${res.userId} name=${socket.data.name}`)

    // юзер вернулся после обрыва в активном звонке — сообщаем пиру
    const peer = inCall.get(res.userId)
    if (peer && isOnline(peer)) {
      LOG(`peer-back userId=${peer} <- userId=${res.userId}`)
      io.to(userRoom(peer)).emit('call:peer-back', { userId: res.userId })
    }

    if (typeof ack === 'function') ack({ ok: true, userId: res.userId, name: socket.data.name })
  })

  // ── приватный релей: доставить событие ТОЛЬКО адресату ─────────────────────
  function relay<T extends { to?: string }>(
    event: string,
    outEvent: string,
    build: (from: { userId: string; name: string }, data: T) => Record<string, unknown>,
    opts?: { markCall?: boolean; clearCall?: boolean },
  ) {
    socket.on(event, (data: T, ack?: (r: unknown) => void) => {
      if (!socket.data.authed || !socket.data.userId) {
        if (typeof ack === 'function') ack({ ok: false, error: 'unauthorized' })
        return
      }
      const to = typeof data?.to === 'string' ? data.to : ''
      if (!to || !isOnline(to)) {
        if (typeof ack === 'function') ack({ ok: false, delivered: false, error: 'offline' })
        return
      }
      const from = { userId: socket.data.userId as string, name: socket.data.name as string }
      io.to(userRoom(to)).emit(outEvent, build(from, data))
      if (opts?.markCall) markInCall(from.userId, to)
      if (opts?.clearCall) clearInCall(from.userId, to)
      if (typeof ack === 'function') ack({ ok: true, delivered: true })
      LOG(`${event} ${from.userId} -> ${to}`)
    })
  }

  interface ToData {
    to?: string
  }

  // звонок: приглашение (важно: ack с delivered для «абонент не в сети»)
  socket.on(
    'call:invite',
    (data: { to?: string; meta?: Record<string, unknown> }, ack?: (r: unknown) => void) => {
      if (!socket.data.authed || !socket.data.userId) {
        if (typeof ack === 'function') ack({ ok: false, error: 'unauthorized' })
        return
      }
      const to = typeof data?.to === 'string' ? data.to : ''
      if (!to || to === socket.data.userId) {
        if (typeof ack === 'function') ack({ ok: false, delivered: false, error: 'bad target' })
        return
      }
      if (!isOnline(to)) {
        if (typeof ack === 'function') ack({ ok: false, delivered: false, error: 'offline' })
        LOG(`call:invite ${socket.data.userId} -> ${to}: OFFLINE`)
        return
      }
      const from = { userId: socket.data.userId as string, name: socket.data.name as string }
      io.to(userRoom(to)).emit('call:invite', { from, meta: data.meta ?? {} })
      if (typeof ack === 'function') ack({ ok: true, delivered: true })
      LOG(`call:invite ${from.userId}(${from.name}) -> ${to}`)
    },
  )

  relay<ToData>('call:accept', 'call:accept', (from) => ({ from }), { markCall: true })
  relay<ToData>('call:reject', 'call:reject', (from) => ({ from }), { clearCall: true })
  relay<ToData>('call:busy', 'call:busy', (from) => ({ from }), { clearCall: true })
  relay<ToData>('call:cancel', 'call:cancel', (from) => ({ from }), { clearCall: true })
  relay<ToData>('call:hangup', 'call:hangup', (from) => ({ from }), { clearCall: true })

  // webrtc: offer/answer/ice — чистый релей, ack не обязателен, но даём
  interface SdpData {
    to?: string
    sdp?: RTCSessionDescriptionInit | { type: string; sdp: string }
  }
  interface IceData {
    to?: string
    candidate?: RTCIceCandidateInit | { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }
  }
  relay<SdpData>('webrtc:offer', 'webrtc:offer', (from, d) => ({ from, sdp: d.sdp }))
  relay<SdpData>('webrtc:answer', 'webrtc:answer', (from, d) => ({ from, sdp: d.sdp }))
  relay<IceData>('webrtc:ice', 'webrtc:ice', (from, d) => ({ from, candidate: d.candidate }))

  // ── обрыв сокета ────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    clearTimeout(authTimer)
    const userId = socket.data.userId as string | null
    if (!userId) return
    const entry = online.get(userId)
    if (!entry) return
    entry.sockets.delete(socket.id)
    if (entry.sockets.size > 0) return // остались другие вкладки — юзер ещё онлайн

    online.delete(userId)
    // presence:user-offline — ВНУТРЕННЕ (лог), в эфир не рассылаем
    LOG(`presence:user-offline userId=${userId} online=${online.size} reason=${reason}`)

    // если юзер был в активном звонке — пир узнаёт «связь потеряна»
    const peer = inCall.get(userId)
    if (peer && isOnline(peer)) {
      LOG(`peer-lost userId=${peer} <- userId=${userId}`)
      io.to(userRoom(peer)).emit('call:peer-lost', { userId })
      // inCall НЕ чистим: если юзер успеет пере-залогиниться, придёт peer-back
    }
  })

  socket.on('error', (error) => {
    console.error(`[call-service] socket error ${socket.id}:`, error)
  })
})

httpServer.listen(PORT, () => {
  LOG(`call-service (socket.io signaling) listening on :${PORT}`)
})

// Graceful shutdown
function shutdown(signal: string) {
  LOG(`Received ${signal}, shutting down...`)
  io.close()
  httpServer.close(() => {
    LOG('call-service closed')
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 2000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
