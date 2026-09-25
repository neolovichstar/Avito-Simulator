'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ЗВОНКОВЫЙ СТОР УРОВНЯ ОС «Resale» (Android 17).
//
// Звонок — это не стейт приложения «Телефон», а системное состояние: он
// переживает выход из приложения (открыл музыку — звонок продолжается),
// потому что живёт в модульном zustand-сторе, а CallOverlay рисуется
// на уровне page.tsx поверх всего (как VolumePlate).
//
// Фазы: idle → dialing («Вызов…», длинные гудки) → ringing («Соединение…»,
// короткая пауза перед взятием, только у ИИ-звонков) → active (таймер,
// голос) → ended (флеш «Звонок завершён») → idle.
//
// ИИ-звонок (personaId/peerUserId) — живой разговор через POST /api/calls/turn.
// Фейковый (просто номер) — как раньше: таймер, 18% «не отвечает».
//
// По завершению звонок пишется в CallLog через существующий POST /api/phones/calls
// (Task 26-a). При старте разговора ОС ставит музыку на паузу (usePlayer.pause()).
// Входящих звонков нет (нет P2P) — только исходящие.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { getToken } from '@/lib/api'
import { useOS } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { callConnect, callEnd, startRing, stopRing } from '@/lib/call-sound'

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
}

export type CallPhase = 'idle' | 'dialing' | 'ringing' | 'active' | 'ended'
export type CallEndReason = 'hangup' | 'no_answer' | 'failed'

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

  startCall: (peer: CallPeer) => void
  acceptCall: () => void
  endCall: (reason?: CallEndReason) => void
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
}

function clearTimers() {
  for (const key of ['connect1', 'connect2', 'idle'] as const) {
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

/** CallLog — через существующий ручной POST (26-a).Fire-and-forget. */
function logCall(peer: CallPeer, durationSec: number) {
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

  startCall: (peer) => {
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
    set({ phase: 'active', startedAt: Date.now() })
    callConnect()
    // Настоящий звонок глушит музыку ОС (разрешено по ТЗ: только pause()).
    try {
      usePlayer.getState().pause()
    } catch {
      /* плеер недоступен — не критично */
    }
  },

  endCall: (reason = 'hangup') => {
    const s = get()
    if (s.phase === 'idle' || s.phase === 'ended') return
    clearTimers()
    stopRing()
    callEnd()

    const duration = s.startedAt ? Math.max(0, Math.round((Date.now() - s.startedAt) / 1000)) : 0
    set({ phase: 'ended', endedAt: Date.now(), endReason: reason })

    if (s.peer) {
      logCall(s.peer, duration)
      if (s.minimized) {
        // Звонок завершился, пока экран был свернут — честно сообщаем тостом.
        const mm = Math.floor(duration / 60)
        const ss = duration % 60
        try {
          useOS
            .getState()
            .pushToast('Телефон', reason === 'no_answer' ? 'Абонент не отвечает' : `Звонок завершён · ${mm}:${String(ss).padStart(2, '0')}`)
        } catch {
          /* тост не критичен */
        }
      }
    }

    // Флеш «Звонок завершён» на 1.7с, затем чистим стейт.
    t.idle = setTimeout(() => {
      set({ phase: 'idle', peer: null, startedAt: null, endedAt: null, endReason: null, muted: false, speaker: false, minimized: false, callId: null })
    }, 1700)
  },

  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleSpeaker: () => set((s) => ({ speaker: !s.speaker })),
  minimize: () => set({ minimized: true }),
  restore: () => set({ minimized: false }),
}))

/** Удобный запуск звонка из любого приложения (чаты Resale, телефон). */
export function startOsCall(peer: CallPeer) {
  useCall.getState().startCall(peer)
}
