'use client'

// Универсальные свайпы и драги на Pointer Events.
// Один и тот же код работает с пальцем (телефон), мышью (ПК) и стилусом —
// поэтому телефонный интерфейс, открытый на ПК, полноценно «свайпается».
//
// Архитектура: слушаем pointerdown на элементе, а pointermove/pointerup —
// на window до конца жеста. Никакого setPointerCapture: клики по кнопкам
// внутри драг-зоны не ломаются, а жест не теряется при уходе за границы.

import { useCallback, useEffect, useRef } from 'react'

export type SwipeDir = 'left' | 'right' | 'up' | 'down'

/** Отбрасываем правую/среднюю кнопку мыши. */
function isPrimary(e: React.PointerEvent): boolean {
  if (e.pointerType === 'mouse') return e.button === 0
  return true
}

interface SwipeOptions {
  /** Минимальное расстояние для срабатывания, px (по умолчанию 44). */
  threshold?: number
  /** Вызывается один раз на завершение жеста с направлением. */
  onSwipe: (dir: SwipeDir, dist: number) => void
}

/**
 * Свайп «фликом»: жест → одно срабатывание с направлением.
 * Пример: свайп вниз от шапки для центра управления.
 */
export function useSwipe({ threshold = 44, onSwipe }: SwipeOptions) {
  const cb = useRef(onSwipe)
  useEffect(() => {
    cb.current = onSwipe
  })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isPrimary(e)) return
      const start = { id: e.pointerId, x: e.clientX, y: e.clientY }

      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== start.id) return
        cleanup()
        const dx = ev.clientX - start.x
        const dy = ev.clientY - start.y
        const ax = Math.abs(dx)
        const ay = Math.abs(dy)
        if (Math.max(ax, ay) < threshold) return
        if (ax > ay) cb.current(dx < 0 ? 'left' : 'right', ax)
        else cb.current(dy < 0 ? 'up' : 'down', ay)
      }
      const cancel = () => cleanup()
      const cleanup = () => {
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
      }
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    },
    [threshold],
  )

  return { onPointerDown }
}

interface DragOptions {
  /** Точка старта: удобно снять scrollTop/размеры до начала жеста. */
  onStart?: (e: React.PointerEvent) => void
  /** Непрерывные координаты драга (dx, dy относительно точки старта). */
  onMove: (dx: number, dy: number) => void
  /** Завершение: итоговое смещение; при отмене системы — (0, 0). */
  onEnd: (dx: number, dy: number) => void
}

/**
 * Драг с «следованиями за пальцем/мышью»: непрерывные координаты.
 * Пример: разблокировка свайпом вверх, карусель карт в банке.
 */
export function useDrag({ onStart, onMove, onEnd }: DragOptions) {
  const cbs = useRef({ onStart, onMove, onEnd })
  useEffect(() => {
    cbs.current = { onStart, onMove, onEnd }
  })

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isPrimary(e)) return
    const start = { id: e.pointerId, x: e.clientX, y: e.clientY }
    cbs.current.onStart?.(e)

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== start.id) return
      cbs.current.onMove(ev.clientX - start.x, ev.clientY - start.y)
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== start.id) return
      cleanup()
      cbs.current.onEnd(ev.clientX - start.x, ev.clientY - start.y)
    }
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== start.id) return
      cleanup()
      cbs.current.onEnd(0, 0)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }, [])

  return { onPointerDown }
}
