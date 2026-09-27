'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-CALL — клиент сигналинга P2P-звонков игрок↔игрок (Task 27-e).
//
// Singleton-сокет к call-service (:3303) через шлюз Caddy — ТОЛЬКО
// io('/?XTransformPort=3303') с path '/' (правило проекта, никаких портов в URL).
//
// Ответственности:
//  • ленивое подключение (ensureConnected) при первом звонке/онлайне + повторная
//    регистрация после reconnect (auth тем же bearer-токеном, что getToken());
//  • сигналинг: call:invite/accept/reject/busy/cancel/hangup,
//    webrtc:offer/answer/ice — приватный релей сервиса, важные шаги с ack;
//  • WebRTC-движок: RTCPeerConnection (STUN), микрофон с echoCancellation/
//    noiseSuppression, remote-аудио, mute через track.enabled, ICE restart.
//
// Стейт звонка (фазы, peer, таймеры) живёт в useCall (lib/call.ts) — этот модуль
// только движок: сюда нельзя импортировать стор, колбэки ему выдаёт setLiveHandlers.
// Модульные переменные (pc, stream, peerId) переживают ре-рендеры, сворачивание
// звонка и переходы между приложениями.
// ─────────────────────────────────────────────────────────────────────────────

import { io, type Socket } from 'socket.io-client'
import { getToken } from '@/lib/api'

export const LIVE_SERVICE_PORT = 3303

export interface LivePeer {
  userId: string
  name: string
}

/** Колбэки наверх (регистрирует call.ts). */
export interface LiveHandlers {
  /** Входящий звонок (адресат решает: показать экран или ответить busy). */
  onIncoming?: (from: LivePeer) => void
  /** Мы звонили — адресат взял трубку (пора создавать offer). */
  onRemoteAccept?: () => void
  onRemoteReject?: () => void
  /** Адресат занят другим звонком. */
  onRemoteBusy?: () => void
  /** Звонивший отменил вызов, пока не взяли трубку. */
  onRemoteCancel?: () => void
  /** Пир сбросил установленный звонок. */
  onRemoteHangup?: () => void
  /** Сокет пира отвалился в активном звонке. */
  onPeerLost?: () => void
  /** Пир вернулся после обрыва (перерегистрировался). */
  onPeerBack?: () => void
  /** WebRTC-медиа соединилось (таймер разговора стартует). */
  onRtcConnected?: () => void
  /** Медиа «провисло» (recovery ещё возможно). */
  onRtcDisconnected?: () => void
  /** Медиа упало окончательно (ICE restart не спас). */
  onRtcFailed?: () => void
}

let socket: Socket | null = null
let connecting: Promise<boolean> | null = null
let myUserId: string | null = null
let handlers: LiveHandlers = {}

// ── контекст активного live-звонка (module-level) ────────────────────────────
let peerId: string | null = null
let role: 'caller' | 'callee' | null = null

// ── WebRTC (module-level, вне стора) ────────────────────────────────────────
let pc: RTCPeerConnection | null = null
let localStream: MediaStream | null = null
let remoteAudio: HTMLAudioElement | null = null
let pendingIce: RTCIceCandidateInit[] = []
let remoteSet = false

export function setLiveHandlers(h: LiveHandlers): void {
  handlers = h
}

export function isLiveConnected(): boolean {
  return !!socket?.connected && !!myUserId
}

export function getMyLiveId(): string | null {
  return myUserId
}

/** Личный peer-контекст текущего звонка (для отладки/QA). */
export function getLiveCallContext(): { peerId: string | null; role: 'caller' | 'callee' | null } {
  return { peerId, role }
}

// ── сокет ────────────────────────────────────────────────────────────────────

function emitAck<T = { ok?: boolean; delivered?: boolean; error?: string; userId?: string; name?: string }>(
  s: Socket,
  event: string,
  payload: unknown,
  ms = 8000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), ms)
    s.emit(event, payload, (r: T) => {
      clearTimeout(t)
      resolve(r)
    })
  })
}

async function register(s: Socket): Promise<boolean> {
  const token = getToken()
  if (!token) return false
  try {
    const r = await emitAck<{ ok?: boolean; userId?: string; name?: string }>(s, 'auth', { token })
    if (r?.ok && r.userId) {
      myUserId = r.userId
      return true
    }
    return false
  } catch {
    return false
  }
}

function createSocket(): Socket {
  const s = io('/?XTransformPort=3303', {
    path: '/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1500,
    timeout: 8000,
  })

  // (пере)регистрация при каждом connect — включая reconnect после обрыва
  s.on('connect', () => {
    void register(s).then((ok) => {
      if (!ok && s.active) {
        // токен умер/сервис отказал — рвём, следующее подключение по требованию
        try {
          s.disconnect()
        } catch {
          /* не критично */
        }
        if (socket === s) socket = null
      }
    })
  })

  s.on('call:invite', (d: { from?: LivePeer }) => {
    if (d?.from?.userId) handlers.onIncoming?.(d.from)
  })
  s.on('call:accept', (d: { from?: { userId?: string } }) => {
    if (!peerId || !d?.from?.userId || d.from.userId === peerId) handlers.onRemoteAccept?.()
  })
  s.on('call:reject', (d: { from?: { userId?: string } }) => {
    if (!peerId || !d?.from?.userId || d.from.userId === peerId) handlers.onRemoteReject?.()
  })
  s.on('call:busy', (d: { from?: { userId?: string } }) => {
    if (!peerId || !d?.from?.userId || d.from.userId === peerId) handlers.onRemoteBusy?.()
  })
  s.on('call:cancel', (d: { from?: { userId?: string } }) => {
    if (!peerId || !d?.from?.userId || d.from.userId === peerId) handlers.onRemoteCancel?.()
  })
  s.on('call:hangup', (d: { from?: { userId?: string } }) => {
    if (!peerId || !d?.from?.userId || d.from.userId === peerId) handlers.onRemoteHangup?.()
  })
  s.on('call:peer-lost', () => handlers.onPeerLost?.())
  s.on('call:peer-back', () => handlers.onPeerBack?.())

  // WebRTC
  s.on('webrtc:offer', (d: { from?: { userId?: string }; sdp?: RTCSessionDescriptionInit }) => {
    if (d?.sdp && (!peerId || !d.from?.userId || d.from.userId === peerId)) void onRemoteOffer(d.sdp)
  })
  s.on('webrtc:answer', (d: { from?: { userId?: string }; sdp?: RTCSessionDescriptionInit }) => {
    if (d?.sdp && (!peerId || !d.from?.userId || d.from.userId === peerId)) void onRemoteAnswer(d.sdp)
  })
  s.on(
    'webrtc:ice',
    (d: { from?: { userId?: string }; candidate?: RTCIceCandidateInit }) => {
      if (d?.candidate && (!peerId || !d.from?.userId || d.from.userId === peerId)) void onRemoteIce(d.candidate)
    },
  )

  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__resaleLiveCall = s // QA
  }
  return s
}

/** Ленивое подключение + регистрация. false — нет токена/сервис недоступен/отказ. */
export function ensureConnected(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (socket?.connected && myUserId) return Promise.resolve(true)
  if (!getToken()) return Promise.resolve(false)
  if (connecting) return connecting

  connecting = (async () => {
    try {
      if (!socket) socket = createSocket()
      if (socket.connected) return await register(socket)
      const ok = await new Promise<boolean>((resolve) => {
        const t = setTimeout(() => resolve(false), 9000)
        socket!.once('connect', () => {
          clearTimeout(t)
          resolve(true)
        })
        socket!.once('connect_error', () => {
          clearTimeout(t)
          resolve(false)
        })
      })
      if (!ok) return false
      return await register(socket)
    } catch {
      return false
    } finally {
      connecting = null
    }
  })()
  return connecting
}

function detachSocket(): void {
  if (socket) {
    try {
      socket.disconnect()
    } catch {
      /* не критично */
    }
    socket = null
  }
  myUserId = null
}

// ── сигналинг звонка ─────────────────────────────────────────────────────────

/** Исходящий вызов. delivered:false → адресат не в сети. */
export async function inviteUser(peer: LivePeer, meta?: Record<string, unknown>): Promise<{ delivered: boolean; error?: string }> {
  peerId = peer.userId
  role = 'caller'
  const ok = await ensureConnected()
  if (!ok) return { delivered: false, error: 'service' }
  if (!socket) return { delivered: false, error: 'service' }
  // пока шли handshake-процессы, юзер мог передумать (красная кнопка):
  // cancelCall обнулил контекст — invite не отправляем
  if (peerId !== peer.userId) return { delivered: false, error: 'cancelled' }
  try {
    const r = await emitAck<{ ok?: boolean; delivered?: boolean; error?: string }>(socket, 'call:invite', {
      to: peer.userId,
      meta: meta ?? {},
    })
    return { delivered: r?.delivered === true, error: r?.error }
  } catch {
    return { delivered: false, error: 'timeout' }
  }
}

/** Принять входящий (адресат). true — приглашение доставлено звонившему. */
export async function acceptCall(to?: string): Promise<boolean> {
  if (!socket || !(to ?? peerId)) return false
  if (to) peerId = to
  role = 'callee'
  try {
    const r = await emitAck<{ ok?: boolean; delivered?: boolean }>(socket, 'call:accept', { to: to ?? peerId })
    return r?.delivered === true
  } catch {
    return false
  }
}

function fire(event: string, to?: string): void {
  const target = to ?? peerId
  if (!socket || !target) return
  try {
    socket.emit(event, { to: target })
  } catch {
    /* не критично — пир узнает по таймауту/watchdog */
  }
}

export function rejectCall(to?: string): void {
  fire('call:reject', to)
  if (!to || to === peerId) {
    peerId = null
    role = null
  }
}

/** Ответить «занято» (мы в другом звонке) — не чистим наш контекст. */
export function busyCall(to: string): void {
  fire('call:busy', to)
}

/** Отменить исходящий, пока не взяли трубку. */
export function cancelCall(to?: string): void {
  fire('call:cancel', to)
  if (!to || to === peerId) {
    peerId = null
    role = null
  }
}

export function hangupCall(to?: string): void {
  fire('call:hangup', to)
  if (!to || to === peerId) {
    peerId = null
    role = null
  }
  closeRtc()
}

// ── WebRTC ───────────────────────────────────────────────────────────────────

function dispatchRtcState(state: RTCPeerConnectionState): void {
  if (state === 'connected') handlers.onRtcConnected?.()
  else if (state === 'disconnected') handlers.onRtcDisconnected?.()
  else if (state === 'failed') handlers.onRtcFailed?.()
}

/** Микрофон + RTCPeerConnection. false — нет доступа к микрофону/WebRTC. */
async function prepareRtc(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') return false
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch {
    return false
  }
  try {
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pendingIce = []
    remoteSet = false
    for (const track of localStream.getAudioTracks()) pc.addTrack(track, localStream)

    pc.onicecandidate = (e) => {
      if (e.candidate && socket && peerId) {
        try {
          socket.emit('webrtc:ice', { to: peerId, candidate: e.candidate.toJSON() })
        } catch {
          /* кандидат потеряется — остальные дойдут */
        }
      }
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track])
      if (!remoteAudio) {
        remoteAudio = new Audio()
        remoteAudio.autoplay = true
        remoteAudio.volume = 1 // звонковая громкость, НЕ медиа-громкость ОС
      }
      remoteAudio.srcObject = stream
      void remoteAudio.play().catch(() => {})
    }
    pc.onconnectionstatechange = () => {
      if (pc) dispatchRtcState(pc.connectionState)
    }
    return true
  } catch {
    closeRtc()
    return false
  }
}

/** Мы звонили и пир взял трубку: микрофон + offer. */
export async function beginMediaAsCaller(to: string): Promise<boolean> {
  peerId = to
  role = 'caller'
  if (!pc && !(await prepareRtc())) return false
  if (!pc || !socket) return false
  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('webrtc:offer', { to, sdp: pc.localDescription?.toJSON() ?? { type: offer.type, sdp: offer.sdp } })
    return true
  } catch {
    return false
  }
}

/** Мы приняли звонок: микрофон готов, offer придёт от звонившего. */
export async function beginMediaAsCallee(to: string): Promise<boolean> {
  peerId = to
  role = 'callee'
  if (!pc) return await prepareRtc()
  return true
}

async function onRemoteOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
  try {
    if (!pc) {
      const ok = await prepareRtc() // защита от гонки: offer раньше accept
      if (!ok) return
    }
    const p = pc as RTCPeerConnection
    await p.setRemoteDescription(new RTCSessionDescription(sdp))
    remoteSet = true
    const buffered = pendingIce
    pendingIce = []
    for (const c of buffered) await p.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
    const answer = await p.createAnswer()
    await p.setLocalDescription(answer)
    if (socket && peerId) {
      socket.emit('webrtc:answer', { to: peerId, sdp: p.localDescription?.toJSON() ?? { type: answer.type, sdp: answer.sdp } })
    }
  } catch {
    /* некорректный offer — пир увидит таймаут соединения */
  }
}

async function onRemoteAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
  try {
    if (!pc || remoteSet) return
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    remoteSet = true
    const buffered = pendingIce
    pendingIce = []
    for (const c of buffered) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
  } catch {
    /* некорректный answer — watchdog соединения отработает */
  }
}

async function onRemoteIce(candidate: RTCIceCandidateInit): Promise<void> {
  try {
    if (!pc) return
    if (!remoteSet) {
      pendingIce.push(candidate)
      return
    }
    await pc.addIceCandidate(new RTCIceCandidate(candidate))
  } catch {
    /* кандидат мог прийти до/после описания — не критично */
  }
}

/** ICE restart после восстановления связи (инициирует сторона «исходящий»). */
export async function restartIce(): Promise<boolean> {
  if (!pc || !socket || !peerId || pc.signalingState !== 'stable') return false
  try {
    const offer = await pc.createOffer({ iceRestart: true })
    await pc.setLocalDescription(offer)
    socket.emit('webrtc:offer', { to: peerId, sdp: pc.localDescription?.toJSON() ?? { type: offer.type, sdp: offer.sdp } })
    remoteSet = false
    return true
  } catch {
    return false
  }
}

/** mute = track.enabled=false (микрофон не глушится на уровне кодека). */
export function applyMute(muted: boolean): void {
  localStream?.getAudioTracks().forEach((tr) => {
    tr.enabled = !muted
  })
}

/** Полная зачистка WebRTC-ресурсов звонка. */
export function closeRtc(): void {
  try {
    localStream?.getTracks().forEach((tr) => tr.stop())
  } catch {
    /* не критично */
  }
  localStream = null
  try {
    pc?.close()
  } catch {
    /* не критично */
  }
  pc = null
  if (remoteAudio) {
    try {
      remoteAudio.pause()
    } catch {
      /* не критично */
    }
    remoteAudio.srcObject = null
  }
  pendingIce = []
  remoteSet = false
}

/** Полный сброс движка (тесты/QA): закрывает и сокет. */
export function resetLiveCallEngine(): void {
  closeRtc()
  peerId = null
  role = null
  detachSocket()
}
