'use client'

// Универсальные свайпы и драги на Pointer Events.
// Один и тот же код работает с пальцем (телефон), мышью (ПК) и стилусом —
// поэтому телефонный интерфейс, открытый на ПК, полноценно «свайпается».
//
// Архитектура: слушаем pointerdown на элементе, а pointermove/pointerup —
// на window до конца жеста. Никакого setPointerCapture: клики по кнопкам
// внутри драг-зоны не ломаются, а жест не теряется при уходе за границы.
//
// Перф-политика: onMove НЕ заставляет компонент переходить в setState на
// каждый ивент — хук только сообщает координаты, а потребитель пишет их
// напрямую в DOM (style.transform через ref). Это убирает ре-рендер storms,
// из-за которых свайпы «лагали» на телефоне.

import { useCallback, useEffect, useRef } from 'react'

export type SwipeDir = 'left' | 'right' | 'up' | 'down'

/** Отбрасываем правую/среднюю кнопку мыши. */
function isPrimary(e: React.PointerEvent): boolean {
  if (e.pointerType === 'mouse') return e.button === 0
  return true
}

/** Мгновенная скорость жеста на момент завершения, px/мс. */
export interface FlingInfo {
  vx: number
  vy: number
  /** длительность жеста, мс */
  dt: number
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
        const dist = Math.hypot(dx, dy)
        if (dist < threshold) return
        if (Math.abs(dx) > Math.abs(dy)) cb.current(dx < 0 ? 'left' : 'right', dist)
        else cb.current(dy < 0 ? 'up' : 'down', dist)
      }
      const cancel = (ev: PointerEvent) => {
        if (ev.pointerId !== start.id) return
        cleanup()
      }
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
  onStart?: (e: React.PointerEvent) => void
  onMove?: (dx: number, dy: number) => void
  onEnd?: (dx: number, dy: number, fling: FlingInfo) => void
  /** Жест не начинается, если тап пришёл внутрь такого элемента (напр. скролл-список). */
  ignoreWithin?: string
}

/**
 * Драг с «следованиями за пальцем/мышью»: непрерывные координаты + скорость.
 * Пример: разблокировка свайпом вверх, перелистывание страниц лончера.
 * onMove вызывается на каждый pointermove — внутри желательно менять DOM
 * напрямую (ref), а не через setState.
 */
export function useDrag({ onStart, onMove, onEnd, ignoreWithin }: DragOptions) {
  const cbs = useRef({ onStart, onMove, onEnd })
  useEffect(() => {
    cbs.current = { onStart, onMove, onEnd }
  })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isPrimary(e)) return
      if (ignoreWithin && (e.target as Element | null)?.closest?.(ignoreWithin)) return
      const start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
      let last = { x: e.clientX, y: e.clientY, t: start.t }
      let vx = 0
      let vy = 0
      cbs.current.onStart?.(e)

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== start.id) return
        const now = performance.now()
        const dt = now - last.t
        if (dt > 0) {
          const k = Math.min(1, 24 / dt)
          vx = vx + ((ev.clientX - last.x) / dt - vx) * k
          vy = vy + ((ev.clientY - last.y) / dt - vy) * k
        }
        last = { x: ev.clientX, y: ev.clientY, t: now }
        cbs.current.onMove?.(ev.clientX - start.x, ev.clientY - start.y)
      }
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== start.id) return
        cleanup()
        cbs.current.onEnd?.(ev.clientX - start.x, ev.clientY - start.y, {
          vx,
          vy,
          dt: Math.max(1, performance.now() - start.t),
        })
      }
      const cancel = (ev: PointerEvent) => {
        if (ev.pointerId !== start.id) return
        cleanup()
        cbs.current.onEnd?.(0, 0, { vx: 0, vy: 0, dt: 0 })
      }
      const cleanup = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
      }
      window.addEventListener('pointermove', move, { passive: true })
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    },
    [ignoreWithin],
  )

  return { onPointerDown }
}
