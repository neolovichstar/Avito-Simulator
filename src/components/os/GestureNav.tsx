'use client'

// Жестовая навигация вместо Android-кнопок:
//   • свайп вверх от нижнего края — «домой» (флик) или «недавние» (долгий драг);
//   • свайп от левого/правого края — «назад» (закрыть приложение);
//   • визуально — только пилюля-индикатор внизу (как home indicator) и
//     стрелка-подсказка у края во время жеста «назад».
// Работает и пальцем, и мышью (Pointer Events через useDrag).
// Пилюля mix-blend-difference: сама становится тёмной на светлых экранах.
//
// Перф: пилюля и стрелка во время жеста обновляются НАПРЯМУЮ в DOM (ref) —
// ни одного setState на pointermove (раньше каждый кадр жеста ре-рендерил
// компонент и детей). React-состояние остаётся только для монтирования
// стрелки «назад» (один раз на жест).

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { sound } from '@/lib/sound'
import { useDrag } from '@/lib/use-swipe'

const HOME_FLICK = 40 // px вверх для флика «домой»
const RECENTS_DRAG = 20 // px вверх при медленном драге — «недавние»
const HOLD_MS = 320 // дольше — это «долгий драг» (недавние), короче — флик
const BACK_THRESHOLD = 52 // px от бокового края для «назад»
const PILL_BASE = 112 // ширина пилюли в покое, px (w-28 — как в Android 16)
const PILL_STRETCH = 104 // прибавка ширины при полном вытягивании

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export default function GestureNav({
  onBack,
  onHome,
  onRecents,
  canGoBack,
}: {
  onBack: () => void
  onHome: () => void
  onRecents: () => void
  canGoBack: boolean
}) {
  const [backSide, setBackSide] = useState<null | 'left' | 'right'>(null)
  const startedAt = useRef(0)
  const pillRef = useRef<HTMLSpanElement>(null)
  const arrowRef = useRef<HTMLSpanElement>(null)

  // ─── Нижняя зона: домой / недавние ─────────────────────────────────────────
  const bottom = useDrag({
    onStart: () => {
      startedAt.current = Date.now()
    },
    onMove: (_dx, dy) => {
      const el = pillRef.current
      if (!el) return
      const p = clamp01(-dy / 64)
      el.style.transition = 'none' // во время жеста пилюля строго за пальцем
      el.style.width = `${PILL_BASE + p * PILL_STRETCH}px`
    },
    onEnd: (_dx, dy, fling) => {
      const el = pillRef.current
      if (el) {
        el.style.transition = '' // вернуть CSS-переход на отпускании
        el.style.width = `${PILL_BASE}px`
      }
      const dt = Date.now() - startedAt.current
      const flick = dy < -HOME_FLICK || (dy < -24 && fling.vy < -0.55)
      if (flick) {
        if (dt > HOLD_MS) {
          sound.pop()
          onRecents()
        } else {
          sound.tap()
          onHome()
        }
      } else if (dy < -RECENTS_DRAG && dt > HOLD_MS) {
        sound.pop()
        onRecents()
      }
    },
  })

  // ─── Боковые зоны: назад ───────────────────────────────────────────────────
  const moveArrow = (progress: number) => {
    const el = arrowRef.current
    if (!el) return
    el.style.opacity = String(0.35 + progress * 0.65)
    el.style.transform = `translateY(-50%) scale(${0.8 + progress * 0.25})`
  }

  const leftEdge = useDrag({
    onStart: () => setBackSide('left'),
    onMove: (dx) => moveArrow(clamp01(dx / BACK_THRESHOLD)),
    onEnd: (dx) => {
      setBackSide(null)
      if (dx >= BACK_THRESHOLD && canGoBack) {
        sound.swipe()
        onBack()
      }
    },
  })
  const rightEdge = useDrag({
    onStart: () => setBackSide('right'),
    onMove: (dx) => moveArrow(clamp01(-dx / BACK_THRESHOLD)),
    onEnd: (dx) => {
      setBackSide(null)
      if (-dx >= BACK_THRESHOLD && canGoBack) {
        sound.swipe()
        onBack()
      }
    },
  })

  return (
    <>
      {/* невидимая нижняя зона жеста (пилюля внутри — просто отрисовка) */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[60] h-9 touch-none select-none"
        style={{ bottom: 'env(safe-area-inset-bottom)' }}
        {...bottom}
      />

      {/* пилюля-индикатор (клик = домой, драг обрабатывает зона под ней) */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[61] flex h-6 items-end justify-center pb-2"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
      >
        <span
          ref={pillRef}
          className="block h-1 w-28 rounded-full bg-white/40 mix-blend-difference transition-[width] duration-150 ease-[cubic-bezier(0.2,0,0,1)]"
        />
      </div>

      {/* боковые зоны-жесты «назад» */}
      <div aria-hidden="true" className="absolute inset-y-10 left-0 z-[59] w-4 touch-none select-none" {...leftEdge} />
      <div aria-hidden="true" className="absolute inset-y-10 right-0 z-[59] w-4 touch-none select-none" {...rightEdge} />

      {/* стрелка-подсказка жеста «назад» (монтируется раз на жест, стиль — из ref) */}
      {backSide && (
        <span
          ref={arrowRef}
          aria-hidden="true"
          className={`absolute top-1/2 z-[60] flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/25 backdrop-blur-md ${
            backSide === 'left' ? 'left-2' : 'right-2'
          }`}
          style={{ opacity: 0.35 }}
        >
          {backSide === 'left' ? (
            <ChevronLeft className="size-5 text-white" />
          ) : (
            <ChevronRight className="size-5 text-white" />
          )}
        </span>
      )}

      {/* доступность с клавиатуры: кнопки видны только при фокусе */}
      <div className="absolute bottom-9 left-3 z-[62] flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="sr-only focus:not-sr-only focus:rounded-lg focus:bg-neutral-800 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
        >
          Назад
        </button>
        <button
          type="button"
          onClick={onHome}
          className="sr-only focus:not-sr-only focus:rounded-lg focus:bg-neutral-800 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
        >
          Домой
        </button>
        <button
          type="button"
          onClick={onRecents}
          className="sr-only focus:not-sr-only focus:rounded-lg focus:bg-neutral-800 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
        >
          Недавние
        </button>
      </div>
    </>
  )
}
