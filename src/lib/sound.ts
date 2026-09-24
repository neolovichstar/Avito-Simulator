'use client'

// Звуковая подсистема ОС: синтез на WebAudio (без файлов и сети),
// вибро-фидбек через Vibration API. Выключатель хранится в localStorage.
// Все звуки короткие и тихие — «системные», как в настоящем телефоне.

const LS_KEY = 'os_sound_v1'

type Listener = (on: boolean) => void

let enabled = true
if (typeof window !== 'undefined') {
  try {
    enabled = localStorage.getItem(LS_KEY) !== '0'
  } catch {
    /* приватный режим — звук просто включён */
  }
}

let ctx: AudioContext | null = null
const listeners = new Set<Listener>()

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {},
) {
  const a = ac()
  if (!a) return
  try {
    const t0 = a.currentTime + (opts.delay ?? 0)
    const osc = a.createOscillator()
    const g = a.createGain()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + dur)
    const vol = opts.gain ?? 0.06
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(a.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  } catch {
    /* аудио не критично */
  }
}

function buzz(pattern: number | number[]) {
  if (!enabled) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* вибрации может не быть */
  }
}

export const sound = {
  isEnabled: () => enabled,

  setEnabled(v: boolean) {
    enabled = v
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LS_KEY, v ? '1' : '0')
      } catch {
        /* не сохранилось — не беда */
      }
    }
    listeners.forEach((l) => l(v))
    if (v) sound.tap() // подтверждение включения
  },

  subscribe(l: Listener) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },

  /** Короткий тик: открытие приложения, нажатия. */
  tap() {
    if (!enabled) return
    tone(660, 0.05, { type: 'triangle', gain: 0.03 })
  },

  /** Всплывающее уведомление (heads-up). */
  pop() {
    if (!enabled) return
    tone(520, 0.09, { type: 'sine', gain: 0.05 })
    tone(780, 0.1, { type: 'sine', gain: 0.04, delay: 0.06 })
    buzz(8)
  },

  /** Разблокировка — восходящий «свуш». */
  unlock() {
    if (!enabled) return
    tone(340, 0.16, { type: 'triangle', gain: 0.05, slideTo: 720 })
    buzz(12)
  },

  /** Тихий шелест жеста: свайп страницы/вкладки, удаление карточки. */
  swipe() {
    if (!enabled) return
    tone(240, 0.07, { type: 'sine', gain: 0.022, slideTo: 480 })
  },

  /** Награда/сделка — «ка-чинг». */
  success() {
    if (!enabled) return
    tone(880, 0.08, { type: 'triangle', gain: 0.05 })
    tone(1320, 0.14, { type: 'triangle', gain: 0.05, delay: 0.07 })
    buzz([10, 40, 10])
  },

  /** Новый уровень — маленькая фанфара. */
  levelup() {
    if (!enabled) return
    const seq = [523, 659, 784, 1047]
    seq.forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.055, delay: i * 0.09 }))
    buzz([15, 60, 15, 60, 25])
  },
}
