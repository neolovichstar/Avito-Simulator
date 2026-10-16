// F2 QA: проверка аутентификации realtime-сервиса (:3003)
// 1) без токена — disconnect; 2) с битым токеном — disconnect;
// 3) с валидным токеном — connect, uid из mini-auth; 4) subscribe на чужой канал — игнор;
// 5) /emit с неверным секретом — 403; с верным — доставка на user:<uid>.
import { io, type Socket } from 'socket.io-client'
import { signSession } from '../src/lib/telegram'

const URL_RT = 'http://127.0.0.1:3003'
const log = (...a: unknown[]) => console.log('[test]', ...a)

async function main() {
  // валидный токен: подписываем id реального юзера из БД
  const { db } = await import('../src/lib/db')
  const user = await db.user.findFirst({ where: { isBot: true }, select: { id: true } })
  if (!user) throw new Error('no user in db')
  const token = signSession(user.id)
  log('user:', user.id, 'token len:', token.length)

  // 1) БЕЗ токена — middleware отклоняет на handshake → connect_error
  const sNo = io(URL_RT, { path: '/', transports: ['websocket'], reconnection: false, timeout: 4000 })
  const noResult = await new Promise<string>((res) => {
    sNo.on('connect', () => res('CONNECTED (BAD — должен был быть connect_error)'))
    sNo.on('connect_error', (e) => res(`connect_error: ${e.message}`))
    setTimeout(() => res('timeout'), 6000)
  })
  log('1) no-token →', noResult)
  sNo.disconnect()

  // 2) БИТЫЙ токен
  const sBad = io(URL_RT, { path: '/', transports: ['websocket'], reconnection: false, timeout: 4000, auth: { token: 'garbage.token.sig' } })
  const badResult = await new Promise<string>((res) => {
    sBad.on('connect', () => res('CONNECTED (BAD)'))
    sBad.on('connect_error', (e) => res(`connect_error: ${e.message}`))
    setTimeout(() => res('timeout'), 8000)
  })
  log('2) bad-token →', badResult)
  sBad.disconnect()

  // 3) ВАЛИДНЫЙ токен + 4) чужой канал + 5) /emit
  const s: Socket = io(URL_RT, { path: '/', transports: ['websocket'], reconnection: false, timeout: 4000, auth: { token } })
  const okResult = await new Promise<string>((res) => {
    s.on('connect', () => res(`connected id=${s.id}`))
    s.on('disconnect', (r) => res(`disconnected: ${r}`))
    s.on('connect_error', (e) => res(`connect_error: ${e.message}`))
    setTimeout(() => res('timeout'), 6000)
  })
  log('3) valid-token →', okResult)

  if (s.connected) {
    // слушатели регистрируем ДО эмита
    const got = new Promise<string>((res) => {
      s.on('f2:test', (d: unknown) => res(`received: ${JSON.stringify(d)}`))
      setTimeout(() => res('NOT received'), 3000)
    })
    const gotGlobal = new Promise<string>((res) => {
      s.on('f2:global', () => res('received'))
      setTimeout(() => res('NOT received'), 3000)
    })

    // 4) subscribe на ЧУЖИЕ каналы — сервер должен проигнорировать (см. лог)
    s.emit('subscribe', { channels: ['user:SOMEBODY-ELSE', 'chat:xyz'] })
    await new Promise((r) => setTimeout(r, 700))

    const secret = process.env.REALTIME_SECRET ?? ''

    // /emit с неверным секретом → 403
    const bad403 = await fetch(`${URL_RT}/emit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: 'wrong-secret', channel: `user:${user.id}`, event: 'f2:test', payload: { x: 1 } }),
    })
    log('5a) /emit wrong secret →', bad403.status)

    // /emit с верным секретом (из корневого .env) → доставка в user-канал
    const okEmit = await fetch(`${URL_RT}/emit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, channel: `user:${user.id}`, event: 'f2:test', payload: { hello: 'f2' } }),
    })
    log('5b) /emit correct secret →', okEmit.status)
    log('5c) event on user-channel →', await got)

    // глобальный канал доставляется всем
    await fetch(`${URL_RT}/emit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, channel: 'global', event: 'f2:global', payload: {} }),
    })
    log('5d) event on global →', await gotGlobal)
  }
  s.disconnect()
  await db.$disconnect?.().catch(() => {})
  process.exit(0)
}

void main()
