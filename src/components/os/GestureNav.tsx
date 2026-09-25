'use client'

// Жестовая навигация вместо Android-кнопок:
//   • свайп вверх от нижнего края — «домой» (флик) или «недавние» (долгий драг);
//   • свайп от левого/правого края — «назад» (закрыть приложение);
//   • визуально — только пилюля-индикатор внизу (как home indicator) и
//     стрелка-подсказка у края во время жеста «назад».
// Работает и пальцем, и мышью (Pointer Events через useDrag).
// Пилюля mix-blend-difference: сама становится тёмной на светлых экранах.

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { sound } from '@/lib/sound'
import { useDrag } from '@/lib/use-swipe'

const HOME_FLICK = 40 // px вверх для флика «домой»
const RECENTS_DRAG = 20 // px вверх при медленном драге — «недавние»
const HOLD_MS = 320 // дольше — это «долгий драг» (недавние), короче — флик
const BACK_THRESHOLD = 52 // px от бокового края для «назад»
const PILL_BASE = 112 // ширина пилюли в покое, px (w-28 — как в Android 16)

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
  const [pillStretch, setPillStretch] = useState(0) // 0..1 — драг пилюли вверх
  const [backSide, setBackSide] = useState<null | 'left' | 'right'>(null)
  const [backProgress, setBackProgress] = useState(0)
  const startedAt = useRef(0)

  // ─── Нижняя зона: домой / недавние ─────────────────────────────────────────
  const bottom = useDrag({
    onStart: () => {
      startedAt.current = Date.now()
    },
    onMove: (_dx, dy) => {
      setPillStretch(Math.min(1, Math.max(0, -dy) / 64))
    },
    onEnd: (_dx, dy) => {
      setPillStretch(0)
      const dt = Date.now() - startedAt.current
      if (dy < -HOME_FLICK) {
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
  const leftEdge = useDrag({
    onStart: () => setBackSide('left'),
    onMove: (dx, _dy) => {
      setBackProgress(Math.max(0, Math.min(1, dx / BACK_THRESHOLD)))
    },
    onEnd: (dx, _dy) => {
      setBackSide(null)
      setBackProgress(0)
      if (dx >= BACK_THRESHOLD && canGoBack) {
        sound.swipe()
        onBack()
      }
    },
  })
  const rightEdge = useDrag({
    onStart: () => setBackSide('right'),
    onMove: (dx, _dy) => {
      setBackProgress(Math.max(0, Math.min(1, -dx / BACK_THRESHOLD)))
    },
    onEnd: (dx, _dy) => {
      setBackSide(null)
      setBackProgress(0)
      if (-dx >= BACK_THRESHOLD && canGoBack) {
        sound.swipe()
        onBack()
      }
    },
  })

  const pillWidth = PILL_BASE + pillStretch * 104

  return (
    <>
      {/* невидимая нижняя зона жеста (пилюля внутри — просто отрисовка) */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[60] h-7 touch-none select-none"
        style={{ bottom: 'env(safe-area-inset-bottom)' }}
        {...bottom}
      />

      {/* пилюля-индикатор (клик = домой, драг обрабатывает зона под ней) */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[61] flex h-6 items-end justify-center pb-2"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
      >
        <span
          className="block h-1 w-28 rounded-full bg-white/40 mix-blend-difference transition-[width] duration-150 ease-[cubic-bezier(0.2,0,0,1)]"
          style={{ width: pillWidth }}
        />
      </div>

      {/* боковые зоны-жесты «назад» */}
      <div aria-hidden="true" className="absolute inset-y-10 left-0 z-[59] w-4 touch-none select-none" {...leftEdge} />
      <div aria-hidden="true" className="absolute inset-y-10 right-0 z-[59] w-4 touch-none select-none" {...rightEdge} />

      {/* стрелка-подсказка жеста «назад» */}
      {backSide && (
        <span
          aria-hidden="true"
          className={`absolute top-1/2 z-[60] flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/25 backdrop-blur-md ${
            backSide === 'left' ? 'left-2' : 'right-2'
          }`}
          style={{
            opacity: 0.35 + backProgress * 0.65,
            transform: `translateY(-50%) scale(${0.8 + backProgress * 0.25})`,
          }}
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
