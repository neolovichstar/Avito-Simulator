'use client'

// Универсальные свайпы и драги на Pointer Events (v3).
// Один и тот же код работает с пальцем (телефон), мышью (ПК) и стилусом —
// поэтому телефонный интерфейс, открытый на ПК, полноценно «свайпается».
//
// Архитектура: слушаем pointerdown на элементе, а pointermove/pointerup —
// на window до конца жеста. Никакого setPointerCapture: клики по кнопкам
// внутри драг-зоны не ломаются, а жест не теряется при уходе за границы.
//
// Перф-политика v3 (то, из-за чего свайпы «лагали» на телефоне):
//   1. onMove НЕ переводит компонент в setState на каждый ивент — хук лишь
//      сообщает координаты, потребитель пишет их напрямую в DOM (ref).
//   2. pointermove коалесится в requestAnimationFrame: на экранах 90/120 Гц
//      обработчик потребителя вызывается раз в кадр, а не на каждый тик
//      сенсора (на некоторых устройствах их 2-3 на кадр).
//   3. Скорость гасится, если палец замер перед отпусканием (>90 мс без
//      движения): «остановился и отпустил» больше не детектируется как
//      флик — раньше это давало ложные срабатывания закрытий/перелистов.

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

/** Палец замер ≥ IDLE_MS до отпускания — скорость считается нулевой. */
const IDLE_MS = 90

interface Tracker {
  onMove: (dx: number, dy: number) => void
  onEnd: (dx: number, dy: number, fling: FlingInfo) => void
}

/**
 * Ядро: трекинг одного указателя до отпускания.
 * move-события коалесятся в rAF; финальные координаты применяются синхронно
 * в pointerup, чтобы onEnd получил точную позицию и честную скорость.
 */
function trackPointer(e: React.PointerEvent, t: Tracker): void {
  const id = e.pointerId
  const startX = e.clientX
  const startY = e.clientY
  const startT = performance.now()
  let lastX = startX
  let lastY = startY
  let lastT = startT
  let vx = 0
  let vy = 0

  // rAF-коалесинг: храним только свежайшие координаты
  let raf = 0
  let pendX = 0
  let pendY = 0
  let pend = false

  const applyMove = (x: number, y: number) => {
    const now = performance.now()
    const dt = now - lastT
    if (dt > 0) {
      const a = Math.min(1, 24 / dt)
      vx += ((x - lastX) / dt - vx) * a
      vy += ((y - lastY) / dt - vy) * a
    }
    lastX = x
    lastY = y
    lastT = now
    t.onMove(x - startX, y - startY)
  }

  const scheduled = () => {
    raf = 0
    if (pend) {
      pend = false
      applyMove(pendX, pendY)
    }
  }

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return
    pendX = ev.clientX
    pendY = ev.clientY
    if (!pend) {
      pend = true
      raf = requestAnimationFrame(scheduled)
    }
  }

  const finishVelocity = (x: number, y: number): { vx: number; vy: number } => {
    const now = performance.now()
    const dt = now - lastT
    if (dt > 0) {
      const a = Math.min(1, 24 / dt)
      vx += ((x - lastX) / dt - vx) * a
      vy += ((y - lastY) / dt - vy) * a
    }
    // Палец замер перед отпусканием — это не флик, гасим скорость.
    if (dt > IDLE_MS) return { vx: 0, vy: 0 }
    return { vx, vy }
  }

  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return
    cleanup()
    const v = finishVelocity(ev.clientX, ev.clientY)
    t.onEnd(ev.clientX - startX, ev.clientY - startY, {
      vx: v.vx,
      vy: v.vy,
      dt: Math.max(1, performance.now() - startT),
    })
  }

  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return
    cleanup()
    t.onEnd(0, 0, { vx: 0, vy: 0, dt: 0 })
  }

  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    pend = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
  }

  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}

interface SwipeOptions {
  /** Минимальное расстояние для срабатывания, px (по умолчанию 44). */
  threshold?: number
  /** Вызывается один раз на завершение жеста с направлением. */
  onSwipe: (dir: SwipeDir, dist: number) => void
}

/**
 * Свайп «фликом»: жест → одно срабатывание с направлением.
 * Срабатывает и от длинного свайпа (≥ threshold), и от короткого резкого
 * флика (≥ 14px со скоростью ≥ 0.55 px/мс) — тап-зоны отзывчивее.
 */
export function useSwipe({ threshold = 44, onSwipe }: SwipeOptions) {
  const cb = useRef(onSwipe)
  useEffect(() => {
    cb.current = onSwipe
  })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isPrimary(e)) return
      trackPointer(e, {
        onMove: () => {},
        onEnd: (dx, dy, fling) => {
          const dist = Math.hypot(dx, dy)
          const speed = Math.hypot(fling.vx, fling.vy)
          const flingOk = dist >= 14 && speed >= 0.55
          if (dist < threshold && !flingOk) return
          if (Math.abs(dx) > Math.abs(dy)) cb.current(dx < 0 ? 'left' : 'right', dist)
          else cb.current(dy < 0 ? 'up' : 'down', dist)
        },
      })
    },
    [threshold],
  )

  return { onPointerDown }
}

interface DragOptions {
  onStart?: (e: React.PointerEvent) => void | false
  onMove?: (dx: number, dy: number) => void
  onEnd?: (dx: number, dy: number, fling: FlingInfo) => void
  /** Жест не начинается, если тап пришёл внутрь такого элемента (напр. скролл-список). */
  ignoreWithin?: string
}

/**
 * Драг с «следованиями за пальцем/мышью»: непрерывные координаты + скорость.
 * Пример: разблокировка свайпом вверх, перелистывание страниц лончера.
 * onMove вызывается раз в кадр (rAF) — внутри желательно менять DOM
 * напрямую (ref), а не через setState.
 * onStart, вернувший false, отменяет жест (напр. список реально скроллится).
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
      if (cbs.current.onStart?.(e) === false) return // жест отменён потребителем
      trackPointer(e, {
        onMove: (dx, dy) => cbs.current.onMove?.(dx, dy),
        onEnd: (dx, dy, fling) => cbs.current.onEnd?.(dx, dy, fling),
      })
    },
    [ignoreWithin],
  )

  return { onPointerDown }
}
