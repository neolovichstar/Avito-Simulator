'use client'

// Мини-плеер на дом-экране «Resale OS»: белая матовая карточка НАД точками
// страниц (в потоке лэйаута — никогда не перекрывает док). Появляется, когда
// играет музыка, а приложение «Музыка» закрыто. Тап — открыть приложение,
// кнопки — управлять глобальным плеером ОС.

import { Pause, Play, SkipForward } from 'lucide-react'
import { usePlayer } from '@/lib/player'
import { useOS, type AppKey } from '@/lib/store'

export default function MiniPlayer({ onOpenApp }: { onOpenApp: (app: AppKey) => void }) {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const dark = useOS((s) => s.theme) === 'dark'

  if (!current) return null

  return (
    <div className="relative z-30 mx-3 mb-2">
      {/* 55-a: та же стеклянная система, что карточки локскрина; 58 — ночная версия */}
      <div className={`flex items-center gap-1 overflow-hidden rounded-[22px] p-1.5 ring-1 backdrop-blur-2xl screen-enter ${
        dark
          ? 'bg-[#1B1D22]/[0.78] text-white shadow-[0_12px_30px_rgba(0,0,0,0.5)] ring-white/[0.10]'
          : 'bg-white/75 text-neutral-900 shadow-[0_12px_30px_rgba(15,15,20,0.14)] ring-black/[0.05]'
      }`}>
        <button
          type="button"
          onClick={() => onOpenApp('music')}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[16px] py-1 pl-1 text-left outline-none transition-transform duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-neutral-400"
          aria-label={`Открыть музыку: ${current.title} — ${current.artist}`}
        >
          <span className={`relative size-10 shrink-0 overflow-hidden rounded-[12px] ${dark ? 'bg-white/10' : 'bg-neutral-100'}`}>
            {current.artworkSmall ? (
              <img loading="lazy" decoding="async" src={current.artworkSmall} alt="" className="h-full w-full object-cover"/>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">{current.title}</span>
            <span className={`block truncate text-[11px] leading-tight ${dark ? 'text-white/55' : 'text-neutral-500'}`}>{current.artist}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? 'Пауза' : 'Продолжить воспроизведение'}
          className={`flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-transform duration-150 active:scale-90 focus-visible:ring-2 focus-visible:ring-neutral-400 ${
            dark ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'
          }`}
        >
          {isPlaying ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4 translate-x-[1px]" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Следующий трек"
          className={`mr-0.5 flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 ${
            dark ? 'text-white/80 active:bg-white/10' : 'text-neutral-700 active:bg-black/5'
          }`}
        >
          <SkipForward className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
