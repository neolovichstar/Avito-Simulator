'use client'

// Виджет «Сейчас играет» в шторке уведомлений — как медиа-виджет в шторке
// Android. Управляет ГЛОБАЛЬНЫМ плеером ОС (src/lib/player.ts), поэтому
// работает независимо от того, открыто приложение «Музыка» или нет.

import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { usePlayer } from '@/lib/player'
import type { AppKey } from '@/lib/store'

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function NowPlayingShade({ onOpenApp }: { onOpenApp: (app: AppKey) => void }) {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration || s.current?.duration || 0)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)

  if (!current) return null
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  return (
    <section
      aria-label="Сейчас играет"
      className="mx-4 mb-1 overflow-hidden rounded-[20px] bg-white/[0.09] ring-1 ring-white/10"
    >
      <div className="flex items-center gap-3 px-3.5 py-3">
        {/* Тап по информации — открыть приложение «Музыка» */}
        <button
          type="button"
          tabIndex={0}
          onClick={() => onOpenApp('music')}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label={`Открыть музыку: ${current.title} — ${current.artist}`}
        >
          <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-white/10">
            {current.artworkSmall ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.artworkSmall} alt="" className="h-full w-full object-cover" />
            ) : null}
            {isPlaying && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-emerald-300/90">
              Сейчас играет
            </span>
            <span className="block truncate text-[13px] font-bold leading-tight text-white">{current.title}</span>
            <span className="block truncate text-[11px] text-white/55">{current.artist}</span>
          </span>
        </button>

        {/* Управление — тач-таргеты 44px, как в системном виджете */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            tabIndex={0}
            onClick={prev}
            aria-label="Предыдущий трек"
            className="flex size-11 items-center justify-center rounded-full text-white/80 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <SkipBack className="size-4.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            tabIndex={0}
            onClick={toggle}
            aria-label={isPlaying ? 'Пауза' : 'Продолжить воспроизведение'}
            className="flex size-11 items-center justify-center rounded-full bg-white text-neutral-900 outline-none transition-transform duration-150 active:scale-90 focus-visible:ring-2 focus-visible:ring-white"
          >
            {isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5 translate-x-[1px]" aria-hidden="true" />}
          </button>
          <button
            type="button"
            tabIndex={0}
            onClick={next}
            aria-label="Следующий трек"
            className="flex size-11 items-center justify-center rounded-full text-white/80 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <SkipForward className="size-4.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Прогресс: тонкая линия на всю ширину карточки */}
      <div className="flex items-center gap-2 px-3.5 pb-2.5" aria-hidden="true">
        <span className="w-8 shrink-0 text-right text-[9px] tabular-nums text-white/40">{fmt(position)}</span>
        <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15">
          <span
            className="block h-full rounded-full bg-emerald-400 transition-[width] duration-300 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="w-8 shrink-0 text-[9px] tabular-nums text-white/40">{fmt(duration)}</span>
      </div>
    </section>
  )
}
