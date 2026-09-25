'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ЗВОНКОВЫЙ СТОР УРОВНЯ ОС «Resale» (Android 17).
//
// Звонок — это не стейт приложения «Телефон», а системное состояние: он
// переживает выход из приложения (открыл музыку — звонок продолжается),
// потому что живёт в модульном zustand-сторе, а CallOverlay рисуется
// на уровне page.tsx поверх всего (как VolumePlate).
//
// ТРИ РЕЖИМА:
//  1. ИИ-звонок (personaId/peerUserId, live=false) — живой разговор через
//     POST /api/calls/turn (ASR → LLM → TTS), PTT в call-screen (26-d).
//  2. Фейковый (только номер) — таймер, 18% «не отвечает» (26-a).
//  3. LIVE P2P (peer.live=true, 27-e) — настоящий звонок игрок↔игрок:
//     сигналинг через lib/live-call.ts (socket.io :3303) + WebRTC-аудио.
//
// Фазы: idle → dialing («Вызов…») → ringing-out (у сервера/гудки — ждём
// взятия) → ringing («Соединение…», идёт WebRTC-обмен) → active /
// active-live (таймер, голос) → ended (флеш «Звонок завершён») → idle.
// Для live отдельно: incoming («Входящий звонок», экран Принять/Отклонить).
//
// Устойчивость live-звонка (без потери связей):
//  • адресат не в сети → invite ack delivered:false → «Абонент не в сети»;
//  • 30с не взяли трубку → cancel + «Абонент не отвечает»;
//  • 12с нет WebRTC-соединения после взятия → «Сбой связи»;
//  • сокет/медиа пира отвалились в звонке → плашка «Связь потеряна»,
//    8с на восстановление (peer-back + ICE restart), иначе разрыв;
//  • reconnect сокета → перерегистрация (live-call), звонок продолжается,
//    медиа P2P не зависит от сигналинга.
//
// По завершению ИИ/фейкового звонка запись идёт в CallLog через существующий
// POST /api/phones/calls (26-a). LIVE-звонки в журнал не пишутся (у живых
// игроков нет телефонного номера в БД, API умеет только direction='out').
// При старте разговора ОС ставит музыку на паузу (usePlayer.pause()).
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { getToken } from '@/lib/api'
import { useOS } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { callConnect, callEnd, startRing, stopRing } from '@/lib/call-sound'
import {
  acceptCall as liveAccept,
  applyMute,
  beginMediaAsCallee,
  beginMediaAsCaller,
  busyCall,
  cancelCall as liveCancel,
  closeRtc,
  ensureConnected,
  hangupCall as liveHangup,
  inviteUser,
  rejectCall as liveReject,
  restartIce,
  setLiveHandlers,
} from '@/lib/live-call'

export interface CallPeer {
  /** Имя для экрана (или сам номер, если контакта нет). */
  name: string
  number: string
  /** personaId из personas-data (звонок продавцу-ИИ). */
  personaId?: string | null
  /** id бота-пользователя в БД (сервер вычислит persona по нему). */
  peerUserId?: string | null
  /** Товар, по которому звонят (из чата Resale) — попадёт в промпт продавца. */
  listingTitle?: string | null
  listingPrice?: number | null
  /** P2P-звонок реальному игроку через сигналинг :3303 (27-e). */
  live?: boolean
}

export type CallPhase =
  | 'idle'
  | 'incoming' // входящий live: «Входящий звонок», Принять/Отклонить
  | 'dialing' // исходящий: «Вызов…» (invite ещё в полёте / гудки)
  | 'ringing-out' // исходящий live: invite доставлен, ждём взятия
  | 'ringing' // «Соединение…» (WebRTC-обмен)
  | 'active' // ИИ/фейковый разговор
  | 'active-live' // live разговор (таймер, голос P2P)
  | 'ended'

export type CallEndReason =
  | 'hangup'
  | 'no_answer'
  | 'failed'
  | 'rejected' // адресат отклонил
  | 'busy' // адресат был в другом звонке
  | 'offline' // адресат не в сети
  | 'missed' // входящий, который не взяли (звонивший отменил)

interface CallState {
  phase: CallPhase
  peer: CallPeer | null
  /** Момент соединения (для таймера) — null, пока не соединились. */
  startedAt: number | null
  endedAt: number | null
  endReason: CallEndReason | null
  muted: boolean
  speaker: boolean
  /** Свернутый режим: звонок продолжается, ОС показывает плавающий чип. */
  minimized: boolean
  callId: string | null
  /** live: связь с пиром пропала (сокет или медиа) — ждём восстановления. */
  peerLost: boolean

  startCall: (peer: CallPeer) => void
  acceptCall: () => void
  endCall: (reason?: CallEndReason) => void
  /** LIVE: исходящий звонок игроку (27-e). */
  startLiveCall: (peer: CallPeer) => void
  /** LIVE: принять входящий. */
  acceptLive: () => void
  /** LIVE: отклонить входящий. */
  rejectLive: () => void
  toggleMute: () => void
  toggleSpeaker: () => void
  minimize: () => void
  restore: () => void
}

// Таймеры фаз — модульные (переживают ре-рендеры, чистятся при любом исходе).
const t = {
  connect1: null as ReturnType<typeof setTimeout> | null,
  connect2: null as ReturnType<typeof setTimeout> | null,
  idle: null as ReturnType<typeof setTimeout> | null,
  ring: null as ReturnType<typeof setTimeout> | null, // live: 30с гудков
  media: null as ReturnType<typeof setTimeout> | null, // live: 12с на WebRTC
  lost: null as ReturnType<typeof setTimeout> | null, // live: 8с «Связь потеряна»
}

function clearTimers() {
  for (const key of ['connect1', 'connect2', 'idle', 'ring', 'media', 'lost'] as const) {
    if (t[key]) {
      clearTimeout(t[key])
      t[key] = null
    }
  }
}

function makeCallId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    /* fallback ниже */
  }
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** CallLog — через существующий ручной POST (26-a). Только ИИ/фейковые. */
function logCall(peer: CallPeer, durationSec: number) {
  if (peer.live) return // live-звонки без номера в журнал не пишем (27-e)
  try {
    void fetch('/api/phones/calls', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        number: peer.number,
        peerName: peer.name,
        peerUserId: peer.peerUserId ?? null,
        aiPersonaId: peer.personaId ?? null,
        durationSec,
      }),
    }).catch(() => {})
  } catch {
    /* журнал не критичен */
  }
}

function toast(title: string, body: string) {
  try {
    useOS.getState().pushToast(title, body)
  } catch {
    /* тост не критичен */
  }
}

function pauseOsMusic() {
  try {
    usePlayer.getState().pause()
  } catch {
    /* плеер недоступен — не критично */
  }
}

// ── LIVE-оркестрация: контекст модуля ────────────────────────────────────────
let liveIsCaller = false // мы инициатор (инициируем ICE restart)
let liveRemoteEnded = false // пир сам завершил — не эхо-отправляем сигналинг

/** 8с на восстановление после «Связь потеряна», иначе разрыв. */
function armLostWatchdog() {
  if (t.lost) clearTimeout(t.lost)
  t.lost = setTimeout(() => {
    t.lost = null
    const st = useCall.getState()
    if (!st.peerLost || st.phase !== 'active-live') return
    liveRemoteEnded = true // пир сам разберётся со своей стороной
    useCall.getState().endCall('failed')
    liveRemoteEnded = false
  }, 8000)
}

/** 12с на установление WebRTC после взятия трубки. */
function armMediaWatchdog() {
  if (t.media) clearTimeout(t.media)
  t.media = setTimeout(() => {
    t.media = null
    const st = useCall.getState()
    if (st.phase !== 'ringing' || !st.peer?.live) return
    useCall.getState().endCall('failed')
  }, 12_000)
}

// Колбэки из live-call.ts (сигналинг) — регистрируются один раз при загрузке.
setLiveHandlers({
  onIncoming: (from) => {
    const st = useCall.getState()
    if (st.phase !== 'idle' && st.phase !== 'ended') {
      busyCall(from.userId) // заняты — честно отвечаем «занято», без оверлея
      return
    }
    clearTimers()
    stopRing()
    liveIsCaller = false
    useCall.setState({
      phase: 'incoming',
      peer: { name: from.name || 'Игрок', number: '', peerUserId: from.userId, live: true },
      callId: makeCallId(),
      startedAt: null,
      endedAt: null,
      endReason: null,
      muted: false,
      speaker: false,
      minimized: false,
      peerLost: false,
    })
    startRing() // входящий гудок (тот же синтез РАТС)
  },

  onRemoteAccept: () => {
    const st = useCall.getState()
    if (!st.peer?.live || (st.phase !== 'dialing' && st.phase !== 'ringing-out')) return
    clearTimers()
    stopRing()
    useCall.setState({ phase: 'ringing' }) // «Соединение…»
    pauseOsMusic()
    const to = st.peer.peerUserId as string
    void (async () => {
      const ok = await beginMediaAsCaller(to)
      const cur = useCall.getState()
      if (cur.phase !== 'ringing' || !cur.peer?.live) return
      if (!ok) {
        cur.endCall('failed')
        return
      }
      armMediaWatchdog()
    })()
  },

  onRemoteReject: () => {
    const st = useCall.getState()
    if (!st.peer?.live || (st.phase !== 'dialing' && st.phase !== 'ringing-out')) return
    liveRemoteEnded = true
    useCall.getState().endCall('rejected')
    liveRemoteEnded = false
  },

  onRemoteBusy: () => {
    const st = useCall.getState()
    if (!st.peer?.live || (st.phase !== 'dialing' && st.phase !== 'ringing-out')) return
    liveRemoteEnded = true
    useCall.getState().endCall('busy')
    liveRemoteEnded = false
  },

  onRemoteCancel: () => {
    const st = useCall.getState()
    if (!st.peer?.live || st.phase !== 'incoming') return
    liveRemoteEnded = true
    useCall.getState().endCall('missed')
    liveRemoteEnded = false
  },

  onRemoteHangup: () => {
    const st = useCall.getState()
    if (!st.peer?.live || (st.phase !== 'ringing-out' && st.phase !== 'ringing' && st.phase !== 'active-live')) return
    liveRemoteEnded = true
    useCall.getState().endCall('hangup')
    liveRemoteEnded = false
  },

  onPeerLost: () => {
    const st = useCall.getState()
    if (!st.peer?.live || st.phase !== 'active-live') return
    useCall.setState({ peerLost: true })
    armLostWatchdog()
  },

  onPeerBack: () => {
    const st = useCall.getState()
    if (!st.peer?.live) return
    if (t.lost) {
      clearTimeout(t.lost)
      t.lost = null
    }
    useCall.setState({ peerLost: false })
    // ICE restart инициирует только звонивший (безопасно от glare);
    // отвечавший дождётся пере-negotiation offer от него же.
    if (st.phase === 'active-live' && liveIsCaller) void restartIce()
  },

  onRtcConnected: () => {
    const st = useCall.getState()
    if (!st.peer?.live || (st.phase !== 'ringing' && st.phase !== 'active-live')) return
    if (t.media) {
      clearTimeout(t.media)
      t.media = null
    }
    if (t.lost) {
      clearTimeout(t.lost)
      t.lost = null
    }
    const firstConnect = st.phase === 'ringing'
    useCall.setState({ phase: 'active-live', startedAt: st.startedAt ?? Date.now(), peerLost: false })
    if (firstConnect) callConnect()
  },

  onRtcDisconnected: () => {
    const st = useCall.getState()
    if (!st.peer?.live || st.phase !== 'active-live') return
    useCall.setState({ peerLost: true })
    armLostWatchdog()
  },

  onRtcFailed: () => {
    const st = useCall.getState()
    if (!st.peer?.live || st.phase !== 'active-live') return
    if (liveIsCaller) void restartIce() // одна попытка спасения
    useCall.setState({ peerLost: true })
    armLostWatchdog()
  },
})

export const useCall = create<CallState>((set, get) => ({
  phase: 'idle',
  peer: null,
  startedAt: null,
  endedAt: null,
  endReason: null,
  muted: false,
  speaker: false,
  minimized: false,
  callId: null,
  peerLost: false,

  startCall: (peer) => {
    if (peer.live) {
      get().startLiveCall(peer) // страховка: live-пир всегда через live-механику
      return
    }
    const cur = get().phase
    if (cur !== 'idle' && cur !== 'ended') return // один активный звонок за раз
    clearTimers()
    stopRing()

    const isAi = !!(peer.personaId || peer.peerUserId)
    set({
      phase: 'dialing',
      peer,
      callId: makeCallId(),
      startedAt: null,
      endedAt: null,
      endReason: null,
      muted: false,
      speaker: false,
      minimized: false,
      peerLost: false,
    })
    startRing()

    if (isAi) {
      // «Вызов…» 2.1-3.0с → «Соединение…» 0.7с → active (бот берёт трубку).
      t.connect1 = setTimeout(
        () => {
          if (get().phase !== 'dialing') return
          stopRing()
          set({ phase: 'ringing' })
          t.connect2 = setTimeout(() => {
            if (get().phase === 'ringing' || get().phase === 'dialing') get().acceptCall()
          }, 700)
        },
        2100 + Math.floor(Math.random() * 900),
      )
    } else {
      // Фейковый номер: как в 26-a — 18% не берут трубку, иначе соединение через 3с.
      const noAnswer = Math.random() < 0.18
      t.connect1 = setTimeout(() => {
        if (get().phase !== 'dialing') return
        if (noAnswer) get().endCall('no_answer')
        else get().acceptCall()
      }, 3000)
    }
  },

  acceptCall: () => {
    clearTimers()
    stopRing()
    // Соединять можно только висящий вызов: если юзер уже сбросил ('ended')
    // или звонка нет ('idle') — тimer опоздал, ничего не делаем.
    const cur = get().phase
    if (cur !== 'dialing' && cur !== 'ringing') return
    if (get().peer?.live) return // live-звонок нельзя «авто-принять» таймером
    set({ phase: 'active', startedAt: Date.now() })
    callConnect()
    // Настоящий звонок глушит музыку ОС (разрешено по ТЗ: только pause()).
    pauseOsMusic()
  },

  startLiveCall: (peer) => {
    const cur = get().phase
    if (cur !== 'idle' && cur !== 'ended') return
    if (!peer.peerUserId) return
    clearTimers()
    stopRing()

    liveIsCaller = true
    liveRemoteEnded = false
    set({
      phase: 'dialing',
      peer: { ...peer, live: true },
      callId: makeCallId(),
      startedAt: null,
      endedAt: null,
      endReason: null,
      muted: false,
      speaker: false,
      minimized: false,
      peerLost: false,
    })
    startRing()

    // 30с гудков и никто не взял — отменяем
    t.ring = setTimeout(() => {
      t.ring = null
      const st = get()
      if (st.phase !== 'dialing' && st.phase !== 'ringing-out') return
      useCall.getState().endCall('no_answer')
    }, 30_000)

    const target = { userId: peer.peerUserId, name: peer.name }
    void (async () => {
      const res = await inviteUser(target, {
        listingTitle: peer.listingTitle ?? null,
      })
      const st = get()
      if (st.phase !== 'dialing' || st.peer?.peerUserId !== target.userId) return // уже отменили
      if (!res.delivered) {
        get().endCall(res.error === 'offline' ? 'offline' : 'failed')
        return
      }
      if (get().phase === 'dialing') set({ phase: 'ringing-out' })
    })()
  },

  acceptLive: () => {
    const st = get()
    if (st.phase !== 'incoming' || !st.peer?.live || !st.peer.peerUserId) return
    clearTimers()
    stopRing()
    set({ phase: 'ringing' }) // «Соединение…», дальше WebRTC
    pauseOsMusic() // музыка ОС на паузу при accept (как в 26-d)
    const to = st.peer.peerUserId
    void (async () => {
      const delivered = await liveAccept(to)
      if (get().phase !== 'ringing') return // уже сбросили
      if (!delivered) {
        get().endCall('failed')
        return
      }
      const ok = await beginMediaAsCallee(to)
      if (get().phase !== 'ringing') return
      if (!ok) {
        // микрофон недоступен — честно рвём, чтобы звонивший не ждал 12с
        liveRemoteEnded = true
        get().endCall('failed')
        liveRemoteEnded = false
        liveHangup(to)
        toast('Телефон', 'Нет доступа к микрофону — звонок не состоялся')
        return
      }
      armMediaWatchdog()
    })()
  },

  rejectLive: () => {
    const st = get()
    if (st.phase !== 'incoming') return
    // endCall сам отправит call:reject (фаза incoming) и зачистит всё
    get().endCall('hangup')
  },

  endCall: (reason = 'hangup') => {
    const s = get()
    if (s.phase === 'idle' || s.phase === 'ended') return
    const isLive = !!s.peer?.live
    clearTimers()
    stopRing()
    callEnd()

    // LIVE: дожимаем сигналинг (cancel — пока не взяли, hangup — после;
    // reject — на входящем; удалённые события сами ставят liveRemoteEnded,
    // чтобы не эхо-отвечать пиру, и сами же сбрасывают флаг после endCall)
    if (isLive && !liveRemoteEnded) {
      if (s.phase === 'incoming') liveReject(s.peer?.peerUserId ?? undefined)
      else if (s.phase === 'dialing' || s.phase === 'ringing-out') liveCancel()
      else liveHangup(s.peer?.peerUserId ?? undefined)
    }
    if (isLive) closeRtc()

    const duration = s.startedAt ? Math.max(0, Math.round((Date.now() - s.startedAt) / 1000)) : 0
    set({ phase: 'ended', endedAt: Date.now(), endReason: reason })

    if (s.peer) {
      logCall(s.peer, duration)
      if (s.minimized) {
        // Звонок завершился, пока экран был свернут — честно сообщаем тостом.
        const mm = Math.floor(duration / 60)
        const ss = duration % 60
        const label =
          reason === 'no_answer'
            ? 'Абонент не отвечает'
            : reason === 'rejected'
              ? 'Абонент отклонил вызов'
              : reason === 'busy'
                ? 'Абонент занят'
                : reason === 'offline'
                  ? 'Абонент не в сети'
                  : reason === 'missed'
                    ? 'Пропущенный звонок'
                    : `Звонок завершён · ${mm}:${String(ss).padStart(2, '0')}`
        toast('Телефон', label)
      }
    }

    // Флеш «Звонок завершён» на 1.7с, затем чистим стейт.
    t.idle = setTimeout(() => {
      set({ phase: 'idle', peer: null, startedAt: null, endedAt: null, endReason: null, muted: false, speaker: false, minimized: false, callId: null, peerLost: false })
    }, 1700)
  },

  toggleMute: () => {
    const s = get()
    const next = !s.muted
    set({ muted: next })
    // live: глушим микрофон WebRTC; ИИ-режим глушит свой трек сам (call-screen)
    if (s.peer?.live) applyMute(next)
  },

  toggleSpeaker: () => set((s) => ({ speaker: !s.speaker })),
  minimize: () => set({ minimized: true }),
  restore: () => set({ minimized: false }),
}))

/** Удобный запуск звонка из любого приложения (чаты Resale, телефон). */
export function startOsCall(peer: CallPeer) {
  useCall.getState().startCall(peer)
}

/** Удобный запуск LIVE-звонка игроку (проверяет сеть сигналинга заранее). */
export async function startOsLiveCall(peer: CallPeer): Promise<boolean> {
  const ok = await ensureConnected()
  if (!ok) {
    toast('Телефон', 'Сеть звонков недоступна — попробуйте позже')
    return false
  }
  useCall.getState().startLiveCall(peer)
  return true
}
