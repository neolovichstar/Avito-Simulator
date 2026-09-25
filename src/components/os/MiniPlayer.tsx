'use client'

// Мини-плеер на дом-экране в духе Android 16: стеклянная пилюля НАД точками
// страниц (в потоке лэйаута — никогда не перекрывает док). Появляется, когда
// играет музыка, а приложение «Музыка» закрыто. Тап — открыть приложение,
// кнопки — управлять глобальным плеером ОС.
// Музыка не прерывается никогда: audio-элемент живёт на уровне ОС (player.ts).

import { Pause, Play, SkipForward } from 'lucide-react'
import { usePlayer } from '@/lib/player'
import type { AppKey } from '@/lib/store'

export default function MiniPlayer({ onOpenApp }: { onOpenApp: (app: AppKey) => void }) {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)

  if (!current) return null

  return (
    <div className="relative z-30 mx-3 mb-2">
      <div className="flex items-center gap-1 overflow-hidden rounded-[20px] bg-neutral-900/75 p-1 text-white shadow-[0_14px_36px_-14px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.12] backdrop-blur-2xl screen-enter">
        <button
          type="button"
          onClick={() => onOpenApp('music')}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[15px] py-1 pl-1 text-left outline-none transition-transform duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label={`Открыть музыку: ${current.title} — ${current.artist}`}
        >
          <span className="relative size-9 shrink-0 overflow-hidden rounded-[11px] bg-white/10">
            {current.artworkSmall ? (
              <img loading="lazy" decoding="async" src={current.artworkSmall} alt="" className="h-full w-full object-cover"/>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold leading-tight">{current.title}</span>
            <span className="block truncate text-[10px] leading-tight text-white/60">{current.artist}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? 'Пауза' : 'Продолжить воспроизведение'}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900 outline-none transition-transform duration-150 active:scale-90 focus-visible:ring-2 focus-visible:ring-white"
        >
          {isPlaying ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4 translate-x-[1px]" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Следующий трек"
          className="mr-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-white/85 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <SkipForward className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
