// ─────────────────────────────────────────────────────────────────────────────
// СМОУК-ТЕСТ call-service :3303 (Task 27-e).
//
// Энд-ту-энд проверка сигналинга двумя реальными сокет-клиентами:
//  1) два игрока через POST /api/auth (deviceId) — настоящие токены;
//  2) auth на :3303 → реестр presence;
//  3) call:invite → релей адресату + ack delivered;
//  4) call:accept → webrtc:offer → webrtc:answer → webrtc:ice в обе стороны;
//  5) call:busy релей; invite офлайн-юзеру → ack delivered:false;
//  6) обрыв сокета в активном звонке → call:peer-lost пиру;
//     перерегистрация → call:peer-back;
//  7) call:hangup → звонок снят с учёта.
//
// Запуск: cd mini-services/call-service && bun smoke.ts
// ─────────────────────────────────────────────────────────────────────────────

import { io, type Socket } from 'socket.io-client'

const SERVICE = 'http://127.0.0.1:3303'
const MAIN = 'http://127.0.0.1:3000'

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    failures.push(name + (extra ? ` (${extra})` : ''))
    console.log(`  ❌ ${name} ${extra}`)
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms)),
  ])
}

interface Player {
  token: string
  userId: string
  name: string
}

async function makePlayer(deviceId: string): Promise<Player> {
  const res = await fetch(`${MAIN}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: null, deviceId, devName: `Smoke${deviceId.slice(-1).toUpperCase()}` }),
    signal: AbortSignal.timeout(10_000),
  })
  const data = (await res.json()) as { token?: string; user?: { id?: string; displayName?: string } }
  if (!res.ok || !data.token || !data.user?.id) throw new Error(`auth ${deviceId} failed: ${res.status}`)
  return { token: data.token, userId: data.user.id, name: data.user.displayName ?? deviceId }
}

/** Ждём событие на сокете (одноразово). */
function waitEvent<T = unknown>(socket: Socket, event: string, ms = 6000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, h)
      reject(new Error(`no ${event} in ${ms}ms`))
    }, ms)
    const h = (payload: T) => {
      clearTimeout(t)
      socket.off(event, h)
      resolve(payload)
    }
    socket.on(event, h)
  })
}

/** ack-версия emit. */
function emitAck<T = { ok?: boolean; delivered?: boolean; userId?: string; name?: string }>(
  socket: Socket,
  event: string,
  payload: unknown,
  ms = 6000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ack ${event} in ${ms}ms`)), ms)
    socket.emit(event, payload, (r: T) => {
      clearTimeout(t)
      resolve(r)
    })
  })
}

function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(SERVICE, {
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 6000,
    })
    s.on('connect', () => resolve(s))
    s.on('connect_error', (e) => reject(e))
  })
}

async function presence(): Promise<{ online: number; calls: number }> {
  const res = await fetch(`${SERVICE}/presence`, { signal: AbortSignal.timeout(4000) })
  return (await res.json()) as { online: number; calls: number }
}

async function main() {
  console.log(`\n== Смоук call-service ${SERVICE} ==\n`)

  // 0. health
  const health = await fetch(`${SERVICE}/health`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json())
  check('GET /health отвечает ok:true', (health as { ok?: boolean }).ok === true)

  // 1. два реальных игрока через основное приложение
  const [A, B, C] = await Promise.all([makePlayer('smoke-27e-a'), makePlayer('smoke-27e-b'), makePlayer('smoke-27e-c')])
  check('два+ токена от /api/auth', !!A.token && !!B.token && !!C.token)

  // 2. auth на сервисе
  const sockA = await connect()
  const authA = await emitAck<{ ok?: boolean; userId?: string; name?: string }>(sockA, 'auth', { token: A.token })
  check('auth A: ok + userId совпадает', authA.ok === true && authA.userId === A.userId, JSON.stringify(authA))

  const sockB = await connect()
  const authB = await emitAck<{ ok?: boolean; userId?: string; name?: string }>(sockB, 'auth', { token: B.token })
  check('auth B: ok + userId совпадает', authB.ok === true && authB.userId === B.userId)

  const pres = await presence()
  check('presence: 2 юзера онлайн', pres.online === 2, JSON.stringify(pres))

  // 3. невалидный токен → отказ
  const sockBad = await connect()
  const authBad = await emitAck<{ ok?: boolean }>(sockBad, 'auth', { token: 'garbage.token.here' }).catch(() => ({ ok: false, disconnected: true }))
  check('auth мусорным токеном отклонён', authBad.ok !== true)
  await new Promise((r) => setTimeout(r, 300))

  // 4. invite A -> B
  const inviteForB = waitEvent<{ from: { userId: string; name: string }; meta: Record<string, unknown> }>(sockB, 'call:invite')
  const invAck = await emitAck<{ ok?: boolean; delivered?: boolean }>(sockA, 'call:invite', {
    to: B.userId,
    meta: { listingTitle: 'Смоук-товар' },
  })
  check('call:invite ack delivered:true', invAck.delivered === true, JSON.stringify(invAck))
  const got = await withTimeout(inviteForB, 6000, 'call:invite на B')
  check('call:invite доставлен B с from=A', got.from?.userId === A.userId, JSON.stringify(got))

  // 5. accept B -> A
  const acceptForA = waitEvent<{ from: { userId: string } }>(sockA, 'call:accept')
  const accAck = await emitAck<{ ok?: boolean; delivered?: boolean }>(sockB, 'call:accept', { to: A.userId })
  check('call:accept ack delivered', accAck.delivered === true)
  const acc = await withTimeout(acceptForA, 6000, 'call:accept на A')
  check('call:accept доставлен A', acc.from?.userId === B.userId)

  // сервер учёл активный звонок
  const presCall = await presence()
  check('presence: calls=1 после accept', presCall.calls === 1, JSON.stringify(presCall))

  // 6. webrtc offer/answer/ice релей
  const offerForB = waitEvent<{ from: { userId: string }; sdp: { type: string; sdp: string } }>(sockB, 'webrtc:offer')
  await emitAck(sockA, 'webrtc:offer', { to: B.userId, sdp: { type: 'offer', sdp: 'v=0-fake-offer' } })
  const offer = await withTimeout(offerForB, 6000, 'webrtc:offer на B')
  check('webrtc:offer релей B (sdp на месте)', offer.sdp?.sdp === 'v=0-fake-offer')

  const answerForA = waitEvent<{ from: { userId: string }; sdp: { type: string } }>(sockA, 'webrtc:answer')
  await emitAck(sockB, 'webrtc:answer', { to: A.userId, sdp: { type: 'answer', sdp: 'v=0-fake-answer' } })
  const answer = await withTimeout(answerForA, 6000, 'webrtc:answer на A')
  check('webrtc:answer релей A', answer.sdp?.type === 'answer')

  const iceForB = waitEvent<{ from: { userId: string }; candidate: { candidate: string } }>(sockB, 'webrtc:ice')
  await emitAck(sockA, 'webrtc:ice', { to: B.userId, candidate: { candidate: 'candidate:1 1 udp 1 1.1.1.1 5000 typ host' } })
  const ice = await withTimeout(iceForB, 6000, 'webrtc:ice на B')
  check('webrtc:ice релей B', typeof ice.candidate?.candidate === 'string' && ice.candidate.candidate.includes('candidate:1'))

  // 7. busy: C зовёт B (B в звонке) — B вручную отвечает call:busy (клиентская логика)
  const sockC = await connect()
  await emitAck(sockC, 'auth', { token: C.token })
  const busyForC = waitEvent<{ from: { userId: string } }>(sockC, 'call:busy')
  await emitAck(sockC, 'call:invite', { to: B.userId, meta: {} })
  await emitAck(sockB, 'call:busy', { to: C.userId })
  const busy = await withTimeout(busyForC, 6000, 'call:busy на C')
  check('call:busy релей C', busy.from?.userId === B.userId)

  // 8. invite офлайн-юзеру → delivered:false
  const offAck = await emitAck<{ ok?: boolean; delivered?: boolean; error?: string }>(sockA, 'call:invite', {
    to: 'offline-zombie-user-000',
  })
  check('invite офлайн → ack delivered:false', offAck.delivered === false && offAck.error === 'offline', JSON.stringify(offAck))

  // 9. обрыв B в активном звонке → A получает call:peer-lost
  const lostForA = waitEvent<{ userId: string }>(sockA, 'call:peer-lost', 8000)
  sockB.close()
  const lost = await withTimeout(lostForA, 8000, 'call:peer-lost на A')
  check('обрыв B → call:peer-lost на A', lost.userId === B.userId)

  // 10. B пере-логинится → A получает call:peer-back
  const backForA = waitEvent<{ userId: string }>(sockA, 'call:peer-back', 8000)
  const sockB2 = await connect()
  await emitAck(sockB2, 'auth', { token: B.token })
  const back = await withTimeout(backForA, 8000, 'call:peer-back на A')
  check('re-register B → call:peer-back на A', back.userId === B.userId)

  // 11. hangup A -> B, звонок снят с учёта
  const hangupForB = waitEvent<{ from: { userId: string } }>(sockB2, 'call:hangup')
  const hupAck = await emitAck<{ ok?: boolean; delivered?: boolean }>(sockA, 'call:hangup', { to: B.userId })
  const hup = await withTimeout(hangupForB, 6000, 'call:hangup на B')
  check('call:hangup релей B', hup.from?.userId === A.userId && hupAck.delivered === true)
  await new Promise((r) => setTimeout(r, 300))
  const presAfter = await presence()
  check('presence: calls=0 после hangup', presAfter.calls === 0, JSON.stringify(presAfter))

  // 12. после hangup звонок снят с учёта: обрыв B2 НЕ должен слать peer-lost
  // (проверка отсутствия события), затем invite офлайн-B → delivered:false
  let lostStray = false
  const strayHandler = () => {
    lostStray = true
  }
  sockA.on('call:peer-lost', strayHandler)
  sockB2.close()
  await new Promise((r) => setTimeout(r, 1200))
  sockA.off('call:peer-lost', strayHandler)
  check('обрыв после hangup НЕ шлёт call:peer-lost', !lostStray)
  await new Promise((r) => setTimeout(r, 400))
  const offAck2 = await emitAck<{ ok?: boolean; delivered?: boolean; error?: string }>(sockA, 'call:invite', { to: B.userId })
  check('invite после полного обрыва B → delivered:false', offAck2.delivered === false, JSON.stringify(offAck2))

  sockA.close()
  sockC.close()

  console.log(`\n== ИТОГ: ${passed} passed, ${failed} failed ==`)
  if (failures.length) {
    console.log('Провалены:')
    for (const f of failures) console.log('  -', f)
  }
  process.exit(failed ? 1 : 0)
}

// watchdog: не висим дольше 60с
const wd = setTimeout(() => {
  console.error('СМОУК ПРЕВЫСИЛ ТАЙМАУТ 60с — убиваю')
  process.exit(1)
}, 60_000)
wd.unref?.()

main().catch((e) => {
  console.error('СМОУК УПАЛ:', e instanceof Error ? e.message : e)
  process.exit(1)
})
