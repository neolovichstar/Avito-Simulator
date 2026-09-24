'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { ChevronUp } from 'lucide-react'
import { useOS } from '@/lib/store'
import { wallpaperClass } from '@/lib/wallpapers'

// Живые тики каждые 1000 мс без setState в эффекте (useSyncExternalStore).
function useClock(): Date | null {
  const ts = useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, 1000)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  )
  return ts ? new Date(ts) : null
}

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const battery = useOS((s) => s.battery)
  const online = useOS((s) => s.online)
  const notifications = useOS((s) => s.notifications)
  const wallpaper = useOS((s) => s.wallpaper)

  const now = useClock()
  const [leaving, setLeaving] = useState(false)
  const touchStartY = useRef<number | null>(null)

  const unlock = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onUnlock, 400)
  }

  const previews = notifications.filter((n) => !n.readAt).slice(0, 3)

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col px-6 pb-8 pt-20 transition-transform duration-[400ms] ease-out ${
        leaving ? '-translate-y-full' : 'translate-y-0'
      } ${wallpaperClass(wallpaper)}`}
      role="dialog"
      aria-label="Экран блокировки"
    >
      {/* Часы и дата */}
      <div className="text-center">
        <p className="text-sm text-white/60" suppressHydrationWarning>
          {now
            ? now.toLocaleDateString('ru-RU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : '\u00A0'}
        </p>
        <p
          className="mt-1 text-7xl font-extralight tabular-nums text-white"
          suppressHydrationWarning
        >
          {now
            ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            : '\u00A0'}
        </p>
      </div>

      {/* Превью непрочитанных уведомлений */}
      {previews.length > 0 && (
        <div className="mt-10 space-y-2">
          {previews.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl bg-white/10 px-4 py-2.5 backdrop-blur-md"
            >
              <p className="text-xs font-semibold text-white">{n.title}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-white/70">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* Батарея и онлайн */}
      <div className="mb-6 flex items-center justify-center gap-4 text-xs text-white/70">
        <span className="flex items-center gap-1.5 tabular-nums">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              battery <= 15 ? 'bg-red-400' : 'bg-emerald-400'
            }`}
          />
          Батарея: {battery}%
        </span>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/40" />
        <span className="tabular-nums">Онлайн: {online}</span>
      </div>

      {/* Кнопка разблокировки */}
      <button
        type="button"
        aria-label="Разблокировать: проведите вверх"
        onClick={unlock}
        onTouchStart={(e) => {
          touchStartY.current = e.touches[0]?.clientY ?? null
        }}
        onTouchEnd={(e) => {
          const start = touchStartY.current
          touchStartY.current = null
          if (start === null) return
          const end = e.changedTouches[0]?.clientY ?? start
          if (start - end > 60) unlock()
        }}
        className="mx-auto flex flex-col items-center gap-1 rounded-full px-8 py-3 text-white outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <ChevronUp className="h-8 w-8 animate-pulse" aria-hidden="true" />
        <span className="text-xs tracking-wide text-white/80">Проведите вверх</span>
      </button>
    </div>
  )
}
