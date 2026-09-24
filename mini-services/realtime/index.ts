// Realtime mini-service: socket.io + HTTP endpoints на одном порту :3003
// Игра "Avito — Симулятор ресейла"
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server } from 'socket.io'

const PORT = 3003
const SECRET = process.env.REALTIME_SECRET ?? 'avito-sim-rt-2024-secret'

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
// socket.io: handshake с query.uid, комнаты, подписки
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  // клиент подключается с query.uid (id игрока); вкладок может быть несколько
  const raw = socket.handshake.query.uid
  const uid = (Array.isArray(raw) ? raw[0] : raw) || socket.id
  socket.data.uid = uid

  // личная комната игрока подключается автоматически
  socket.join(`user:${uid}`)

  presence.set(uid, (presence.get(uid) ?? 0) + 1)
  console.log(`[connect] socket=${socket.id} uid=${uid} tabs=${presence.get(uid)} online=${presence.size}`)

  // broadcast онлайн-счётчика (клиент слушает событие 'online')
  io.emit('online', { online: presence.size })

  socket.on('subscribe', (data: { channels?: string[] }) => {
    const channels = Array.isArray(data?.channels)
      ? data.channels.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : []
    for (const ch of channels) socket.join(ch)
    if (channels.length) console.log(`[subscribe] socket=${socket.id} uid=${uid} channels=${channels.join(',')}`)
  })

  socket.on('unsubscribe', (data: { channels?: string[] }) => {
    const channels = Array.isArray(data?.channels)
      ? data.channels.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : []
    for (const ch of channels) socket.leave(ch)
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

httpServer.listen(PORT, () => {
  console.log(`Realtime service (socket.io) listening on :${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal, shutting down server...')
  io.close()
  httpServer.close(() => {
    console.log('Realtime server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT signal, shutting down server...')
  io.close()
  httpServer.close(() => {
    console.log('Realtime server closed')
    process.exit(0)
  })
})
