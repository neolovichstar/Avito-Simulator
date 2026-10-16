'use client'

// ─────────────────────────────────────────────────────────────────────────────
// usePoll — setInterval-поллинг с гейтом видимости (Task 63-b2).
// В свёрнутом TG WebView / скрытой вкладке фоновые таймеры продолжают тикать
// и жгут батарею и лимиты API: здесь интервал живёт как раньше, но колбэк
// выполняется ТОЛЬКО когда документ видим (document.hidden === false) и enabled.
// При возврате во visible — немедленный дополнительный вызов, чтобы данные
// не «залипали» на времени, пока приложение было скрыто.
// Первый немедленный вызов при маунте остаётся заботой вызывающего кода
// (как и было: отдельный useEffect/timeout до подключения usePoll).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'

export function usePoll(fn: () => void, ms: number, enabled = true) {
  // колбэк всегда свежий: интервал не пересоздаётся на смену замыкания
  // (deps вида [load, openHist, …] больше не требуют ресета таймера)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    const tick = () => {
      if (disposed || document.hidden) return
      fnRef.current()
    }
    const id = setInterval(tick, ms)
    const onVisibility = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ms, enabled])
}
