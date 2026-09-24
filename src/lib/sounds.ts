// Синтезированные звуки ОС на WebAudio — без ассетов и загрузок.
// Все звуки уважают переключатель «Звук» (useOS.soundOn) и не играют до первого жеста юзера.

import { useOS } from '@/lib/store'

type SoundName =
  | 'tap' // клик по элементам
  | 'open' // открытие приложения
  | 'notify' // пуш-уведомление
  | 'kaching' // успешная сделка
  | 'bid' // ставка на аукционе
  | 'message' // входящее сообщение
  | 'error' // ошибка
  | 'unlock' // разблокировка ОС
  | 'cash' // получение денег (продажа/квест)

interface AudioState {
  ctx: AudioContext | null
  master: GainNode | null
  lastPlayed: Map<SoundName, number>
}

const g = globalThis as unknown as { __avitoAudio?: AudioState }
const state: AudioState = (g.__avitoAudio ??= {
  ctx: null,
  master: null,
  lastPlayed: new Map(),
})

const MIN_INTERVAL_MS: Partial<Record<SoundName, number>> = {
  tap: 45,
  open: 120,
  bid: 200,
  kaching: 400,
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!state.ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      state.ctx = new AC()
      state.master = state.ctx.createGain()
      state.master.gain.value = 0.16 // общий негромкий фон
      state.master.connect(state.ctx.destination)
    } catch {
      return null
    }
  }
  if (state.ctx.state === 'suspended') void state.ctx.resume().catch(() => {})
  return state.ctx
}

/** Учесть троттлинг одинаковых звуков подряд. */
function throttled(name: SoundName): boolean {
  const min = MIN_INTERVAL_MS[name]
  if (!min) return false
  const now = Date.now()
  if (now - (state.lastPlayed.get(name) ?? 0) < min) return true
  state.lastPlayed.set(name, now)
  return false
}

interface Tone {
  f: number // частота, Гц
  t: number // старт, c
  d: number // длительность, c
  type?: OscillatorType
  v?: number // громкость 0..1
  slide?: number // скольжение к частоте к концу
}

function schedule(ctx: AudioContext, tones: Tone[]) {
  const master = state.master
  if (!master) return
  const now = ctx.currentTime
  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = tone.type ?? 'sine'
    const t0 = now + tone.t
    osc.frequency.setValueAtTime(tone.f, t0)
    if (tone.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, tone.slide), t0 + tone.d)
    const v = tone.v ?? 0.8
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(v, t0 + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.d)
    osc.connect(gain).connect(master)
    osc.start(t0)
    osc.stop(t0 + tone.d + 0.02)
  }
}

const RECIPES: Record<SoundName, Tone[]> = {
  tap: [{ f: 1250, t: 0, d: 0.045, type: 'triangle', v: 0.5, slide: 900 }],
  open: [
    { f: 520, t: 0, d: 0.06, type: 'sine', v: 0.5 },
    { f: 780, t: 0.05, d: 0.07, type: 'sine', v: 0.45 },
  ],
  notify: [
    { f: 880, t: 0, d: 0.09, type: 'sine', v: 0.6 },
    { f: 1174, t: 0.085, d: 0.14, type: 'sine', v: 0.55 },
  ],
  message: [
    { f: 740, t: 0, d: 0.06, type: 'sine', v: 0.5 },
    { f: 988, t: 0.06, d: 0.09, type: 'sine', v: 0.45 },
  ],
  kaching: [
    { f: 1244, t: 0, d: 0.07, type: 'square', v: 0.28 },
    { f: 1864, t: 0.06, d: 0.1, type: 'square', v: 0.24 },
    { f: 2489, t: 0.13, d: 0.22, type: 'sine', v: 0.5 },
    { f: 3322, t: 0.15, d: 0.26, type: 'sine', v: 0.3 },
  ],
  cash: [
    { f: 660, t: 0, d: 0.08, type: 'sine', v: 0.55 },
    { f: 990, t: 0.07, d: 0.16, type: 'sine', v: 0.5 },
  ],
  bid: [{ f: 987, t: 0, d: 0.1, type: 'triangle', v: 0.5, slide: 1318 }],
  error: [{ f: 220, t: 0, d: 0.16, type: 'sawtooth', v: 0.3, slide: 160 }],
  unlock: [
    { f: 494, t: 0, d: 0.06, type: 'sine', v: 0.45 },
    { f: 659, t: 0.05, d: 0.06, type: 'sine', v: 0.45 },
    { f: 987, t: 0.1, d: 0.12, type: 'sine', v: 0.4 },
  ],
}

/** Проиграть звук (если включён звук в ОС). Безопасно звать откуда угодно. */
export function playSound(name: SoundName) {
  try {
    if (!useOS.getState().soundOn) return
  } catch {
    // store недоступен (SSR/тест) — тихо выходим
    return
  }
  if (throttled(name)) return
  const ctx = ensureCtx()
  if (!ctx || ctx.state !== 'running') return
  schedule(ctx, RECIPES[name])
}

export type { SoundName }
