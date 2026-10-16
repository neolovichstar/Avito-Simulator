'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ТЕЛЕФОННЫЕ СИГНАЛЫ ОС «Resale» — ТОЛЬКО ВИБРО (правило проекта: vibro-only).
//
// Прежний WebAudio-синтезатор гудков (AudioContext + осцилляторы 425 Гц)
// удалён ПОЛНОСТЬЮ — как и в src/lib/sound.ts, модуль физически не может
// издать ни звука. Публичный API сохранён (потребитель — src/lib/call.ts):
//   startRing()  — вибро-гудки «Вызов…» (пачка [500,300,500,300,500],
//                  повтор цикла каждые 5с — как РАТС-гудок, через setInterval)
//   stopRing()   — остановить цикл гудков
//   callConnect()— одиночный короткий «щелчок» соединения [80]
//   callEnd()    — «занято»/завершение [200,80,200]
// Уважает системный выключатель звука ОС (localStorage 'os_sound_v1') через
// sound.isEnabled(): звук выключен → вибро-гудков тоже нет.
// ─────────────────────────────────────────────────────────────────────────────

import { sound } from '@/lib/sound'

let ringTimer: ReturnType<typeof setInterval> | null = null

/** Вибро доступно только там, где есть navigator.vibrate (TG WebView на телефоне). */
function isVibroAvailable(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof navigator.vibrate === 'function'
}

function buzz(pattern: number | number[]): void {
  if (!sound.isEnabled() || !isVibroAvailable()) return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* вибрации может не быть — не беда */
  }
}

/** Гудки вызова: пачка [500,300,500,300,500], цикл повторяется каждые 5с. */
export function startRing() {
  stopRing()
  buzz([500, 300, 500, 300, 500])
  ringTimer = setInterval(() => buzz([500, 300, 500, 300, 500]), 5000)
}

export function stopRing() {
  if (ringTimer) {
    clearInterval(ringTimer)
    ringTimer = null
  }
}

/** Соединение установлено: одиночный короткий тик. */
export function callConnect() {
  stopRing()
  buzz(80)
}

/** Завершение/занято: двойной «бип». */
export function callEnd() {
  stopRing()
  buzz([200, 80, 200])
}
