'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ТЕЛЕФОННЫЕ СИГНАЛЫ ОС «Resale» (WebAudio-синтез).
//
// src/lib/sound.ts давно переведён только на вибро (WebAudio там выпилен
// сознательно), поэтому звонковые звуки живут здесь и НИЧЕГО не трогают
// в sound.ts. Публичный API:
//   startRing()  — длинные гудки «Вызов…» (425 Гц: 1с тон / 4с пауза, как РАТС)
//   stopRing()   — остановить гудки
//   callConnect()— короткий двойной «щелчок» соединения
//   callEnd()    — короткие гудки «занято» при завершении
//
// AudioContext создаётся лениво при первом вызове (старт звонка — всегда
// жест пользователя, автоплей-политика не мешает). Громкость фиксированная
// и тихая: это системный сигнал, а не медиа (под useVolume не подпадает).
// Уважает системный выключатель звука ОС (localStorage 'os_sound_v1').
// ─────────────────────────────────────────────────────────────────────────────

import { sound } from '@/lib/sound'

let ctx: AudioContext | null = null
let ringTimer: ReturnType<typeof setInterval> | null = null

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Один тон 425 Гц с мягкими фронтами (без щелчков). */
function tone425(at: number, dur: number, gainVal = 0.055) {
  const c = ctx
  if (!c) return
  try {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = 425
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(gainVal, at + 0.02)
    gain.gain.setValueAtTime(gainVal, at + dur - 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(gain).connect(c.destination)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  } catch {
    /* нет аудио-устройства — не беда */
  }
}

function burst(times: number, onSec: number, offSec: number, gainVal = 0.055) {
  const c = ensureCtx()
  if (!c || !sound.isEnabled()) return
  const t0 = c.currentTime + 0.03
  for (let i = 0; i < times; i++) tone425(t0 + i * (onSec + offSec), onSec, gainVal)
}

/** Гудки вызова: пачка из 1 длинного тона каждые 5с (1с тон + 4с тишина). */
export function startRing() {
  stopRing()
  burst(1, 1.0, 0)
  ringTimer = setInterval(() => burst(1, 1.0, 0), 5000)
}

export function stopRing() {
  if (ringTimer) {
    clearInterval(ringTimer)
    ringTimer = null
  }
}

/** Соединение установлено: два коротких «клика». */
export function callConnect() {
  stopRing()
  burst(2, 0.09, 0.12, 0.045)
}

/** Завершение/занято: три коротких гудка. */
export function callEnd() {
  stopRing()
  burst(3, 0.24, 0.22, 0.05)
}
