'use client'

// Системная плашка громкости в стиле Android 17: вертикальная капсула у правого
// края экрана над жестовой навигацией. Появляется при любом изменении медиа-
// громкости (музыка, центр управления, настройки, клавиатура ↑/↓) и исчезает
// через 2.2с. Сама капсула — интерактивный вертикальный слайдер (тащить пальцем),
// иконка сверху переключается громко/вибро/тихо, тап по иконке — mute/unmute.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Volume1, Volume2, VolumeX } from 'lucide-react'
import { useVolume } from '@/lib/volume'
import { sound } from '@/lib/sound'

const AUTOHIDE_MS = 2200

export default function VolumePlate() {
  const volume = useVolume((s) => s.volume)
  const plateAt = useVolume((s) => s.plateAt)
  const plateHidden = useVolume((s) => s.plateHidden)
  const setVolume = useVolume((s) => s.setVolume)
  const hidePlate = useVolume((s) => s.hidePlate)

  const [visible, setVisible] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Появление по триггеру + авто-скрытие.
  useEffect(() => {
    if (plateAt === 0) return
    setVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), AUTOHIDE_MS)
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [plateAt])

  const applyY = (clientY: number) => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const v = r.height > 0 ? 1 - (clientY - r.top) / r.height : 0
    setVolume(v)
  }

  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <AnimatePresence>
      {visible && !plateHidden && (
        <motion.div
          key="volplate"
          initial={{ opacity: 0, x: 28, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 24, scale: 0.97, transition: { duration: 0.18 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="pointer-events-auto absolute bottom-24 right-3 z-[64] select-none"
          role="slider"
          aria-label="Громкость медиа"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(volume * 100)}
        >
          <div className="flex h-56 w-14 flex-col items-center overflow-hidden rounded-[28px] bg-neutral-900/85 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.14] backdrop-blur-2xl">
            {/* Кнопка mute / громко */}
            <button
              type="button"
              aria-label={volume === 0 ? 'Включить звук' : 'Выключить звук'}
              onClick={() => {
                sound.tap()
                setVolume(volume === 0 ? 0.5 : 0)
              }}
              className="flex h-12 shrink-0 items-center justify-center text-white/85 transition-transform active:scale-90"
            >
              <Icon className="size-5" aria-hidden="true" />
            </button>

            {/* Вертикальный трек */}
            <div
              ref={trackRef}
              className="relative w-9 flex-1 touch-none overflow-hidden rounded-full bg-white/[0.14]"
              onPointerDown={(e) => {
                dragging.current = true
                e.currentTarget.setPointerCapture?.(e.pointerId)
                applyY(e.clientY)
              }}
              onPointerMove={(e) => {
                if (dragging.current) applyY(e.clientY)
              }}
              onPointerUp={() => {
                dragging.current = false
              }}
              onPointerCancel={() => {
                dragging.current = false
              }}
            >
              {/* Заливка снизу вверх */}
              <div
                className="absolute inset-x-0 bottom-0 rounded-full bg-white/90 transition-[height] duration-75"
                style={{ height: `${volume * 100}%` }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
