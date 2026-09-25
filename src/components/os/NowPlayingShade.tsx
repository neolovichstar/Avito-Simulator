'use client'

// Виджет «Сейчас играет» в шторке уведомлений — медиа-карточка Android 16:
// скруглённое стекло, обложка, таймкоды, тонкая линия прогресса и управление
// ГЛОБАЛЬНЫМ плеером ОС (src/lib/player.ts) — работает независимо от того,
// открыто приложение «Музыка» или нет.

import { useSyncExternalStore } from 'react'
import { Music2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { usePlayer } from '@/lib/player'
import { useVolume } from '@/lib/volume'
import type { AppKey } from '@/lib/store'

const emptySubscribe = () => () => {}

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

  // Плеер восстанавливает очередь из localStorage при загрузке модуля — на сервере
  // current всегда null. Без этого гейта виджет рендерится на клиенте при гидрации,
  // а в серверном HTML его нет → hydration mismatch (Recoverable Error в Next).
  // useSyncExternalStore: на сервере false, после гидрации true — без setState-в-эффекте.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  // Громкость медиа — глобальный стор + плашка громкости Android 17.
  const volume = useVolume((s) => s.volume)
  const setVolume = useVolume((s) => s.setVolume)

  if (!mounted || !current) return null
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  return (
    <section
      aria-label="Сейчас играет"
      className="m3-rise mx-4 mb-1 shrink-0 overflow-hidden rounded-[24px] bg-white/[0.08] ring-1 ring-white/[0.08]"
    >
      <div className="flex items-center gap-3 px-3.5 py-3">
        {/* Тап по информации — открыть приложение «Музыка» */}
        <button
          type="button"
          tabIndex={0}
          onClick={() => onOpenApp('music')}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label={`Открыть музыку: ${current.title} — ${current.artist}`}
        >
          <span className="relative size-12 shrink-0 overflow-hidden rounded-[14px] bg-white/10">
            {current.artworkSmall ? (
              <img loading="lazy" decoding="async" src={current.artworkSmall} alt="" className="h-full w-full object-cover"/>
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Music2 className="size-5 text-white/50" aria-hidden="true" />
              </span>
            )}
            {isPlaying && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-[#3ED598]" />
            )}
            {/* мини-иконка приложения «Музыка» — как у системного медиа-уведомления Android */}
            <span
              aria-hidden="true"
              className="absolute left-1 top-1 flex size-[18px] items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
            >
              <Music2 className="size-2.5" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-300/90">
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
            <SkipBack className="size-[18px]" aria-hidden="true" />
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
            <SkipForward className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Прогресс: тонкая линия на всю ширину карточки */}
      <div className="flex items-center gap-2 px-3.5 pb-2.5" aria-hidden="true">
        <span className="w-8 shrink-0 text-right text-[9px] tabular-nums text-white/40">{fmt(position)}</span>
        <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15">
          <span
            className="block h-full rounded-full bg-[#3ED598] transition-[width] duration-300 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="w-8 shrink-0 text-[9px] tabular-nums text-white/40">{fmt(duration)}</span>
      </div>

      {/* Громкость медиа: мини-слайдер с иконкой (тап — mute), тап/драг меняет громкость */}
      <div className="flex items-center gap-2 px-3.5 pb-3">
        <button
          type="button"
          tabIndex={0}
          aria-label={volume === 0 ? 'Включить звук' : 'Выключить звук'}
          onClick={() => setVolume(volume === 0 ? 0.5 : 0)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/75 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {volume === 0 ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          aria-label="Громкость медиа"
          className="vol-shade h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full outline-none"
          style={{
            background: `linear-gradient(to right, #3ED598 ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)`,
          }}
        />
        <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-white/40">{Math.round(volume * 100)}%</span>
      </div>
    </section>
  )
}
