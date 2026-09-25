'use client'

// Музыка ОС: плеер с симуляцией воспроизведения (без аудиофайлов и сети).
// Прогресс тикает интервалом 500 мс, запущенным из обработчика Play;
// по концу трека — следующий с учётом shuffle/repeat. Seek кликом по полосе.

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import {
  Music2,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { sound } from '@/lib/sound'

interface Track {
  title: string
  artist: string
  dur: number
}

const TRACKS: Track[] = [
  { title: 'Ночной ветер', artist: 'Тень Города', dur: 214 },
  { title: 'Бетон и неон', artist: 'Кассеты 90', dur: 187 },
  { title: 'Первый продан', artist: 'Флиппер', dur: 243 },
  { title: 'Тихий двор', artist: 'Марта Ветрова', dur: 201 },
  { title: 'Скорость шестьдесят', artist: 'Асфальт 7', dur: 226 },
  { title: 'Утренний автобус', artist: 'Вокзал Юг', dur: 259 },
]

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function randomOther(current: number): number {
  let n = current
  while (n === current) n = Math.floor(Math.random() * TRACKS.length)
  return n
}

export default function MusicApp() {
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)

  // Зеркала для колбэка интервала: в рендере читаются только state-значения
  const posRef = useRef(0)
  const idxRef = useRef(0)
  const shuffleRef = useRef(false)
  const repeatRef = useRef(false)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearIv = () => {
    if (ivRef.current !== null) {
      clearInterval(ivRef.current)
      ivRef.current = null
    }
  }

  const switchTrack = (n: number, keepPlaying: boolean) => {
    idxRef.current = n
    setIdx(n)
    posRef.current = 0
    setPos(0)
    if (!keepPlaying) {
      clearIv()
      setPlaying(false)
    }
  }

  const autoNext = () => {
    if (shuffleRef.current && TRACKS.length > 1) {
      switchTrack(randomOther(idxRef.current), true)
      return
    }
    if (idxRef.current + 1 < TRACKS.length) {
      switchTrack(idxRef.current + 1, true)
      return
    }
    if (repeatRef.current) switchTrack(0, true)
    else switchTrack(0, false)
  }

  const tick = () => {
    const dur = TRACKS[idxRef.current]?.dur ?? 0
    const next = posRef.current + 0.5
    if (next >= dur) autoNext()
    else {
      posRef.current = next
      setPos(next)
    }
  }

  // Запуск интервала — только из обработчиков кликов; здесь лишь очистка при размонтировании
  useEffect(() => () => clearIv(), [])

  const startIv = () => {
    clearIv()
    ivRef.current = setInterval(tick, 500)
  }

  const togglePlay = () => {
    sound.tap()
    if (playing) {
      clearIv()
      setPlaying(false)
      return
    }
    setPlaying(true)
    startIv()
  }

  const seek = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const p = ratio * (TRACKS[idxRef.current]?.dur ?? 0)
    posRef.current = p
    setPos(p)
    sound.swipe()
  }

  const manualNext = () => {
    sound.tap()
    switchTrack(
      shuffleRef.current && TRACKS.length > 1 ? randomOther(idxRef.current) : (idxRef.current + 1) % TRACKS.length,
      playing,
    )
  }

  const manualPrev = () => {
    sound.tap()
    if (posRef.current > 3) {
      posRef.current = 0
      setPos(0)
      return
    }
    switchTrack((idxRef.current - 1 + TRACKS.length) % TRACKS.length, playing)
  }

  const selectTrack = (n: number) => {
    if (n === idxRef.current) {
      togglePlay()
      return
    }
    sound.tap()
    switchTrack(n, true)
  }

  const toggleShuffle = () => {
    sound.tap()
    const v = !shuffleRef.current
    shuffleRef.current = v
    setShuffle(v)
  }

  const toggleRepeat = () => {
    sound.tap()
    const v = !repeatRef.current
    repeatRef.current = v
    setRepeat(v)
  }

  const track = TRACKS[idx] ?? TRACKS[0]!
  const pct = track.dur > 0 ? Math.min(100, (pos / track.dur) * 100) : 0

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#07130D,#050D09)] text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 px-5">
        <h1 className="text-[17px] font-semibold">Музыка</h1>
      </header>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {/* Обложка с blur-фоном */}
        <div className="relative mx-6 mt-2">
          <div
            className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-emerald-500/30 to-green-900/50 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative flex aspect-square items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-green-800">
            <Music2 className="size-16 text-white/90" aria-hidden="true" />
          </div>
        </div>

        {/* Название и исполнитель */}
        <div className="mt-4 px-6">
          <div className="truncate text-[18px] font-semibold">{track.title}</div>
          <div className="truncate text-[13px] text-white/60">{track.artist}</div>
        </div>

        {/* Прогресс с кликабельным seek */}
        <div className="mt-3 px-6">
          <button
            type="button"
            onClick={seek}
            aria-label="Перемотка трека"
            className="flex h-8 w-full items-center"
          >
            <span className="relative h-1 w-full rounded-full bg-white/10">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[#22C55E]"
                style={{ width: `${pct}%` }}
              />
              <span
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                style={{ left: `${pct}%` }}
              />
            </span>
          </button>
          <div className="flex justify-between px-0.5 pt-1 text-[11px] tabular-nums text-white/50">
            <span>{mmss(pos)}</span>
            <span>{mmss(track.dur)}</span>
          </div>
        </div>

        {/* Управление */}
        <div className="flex items-center justify-between px-8 pb-6 pt-2">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Перемешивание"
            aria-pressed={shuffle}
            className={'flex size-11 items-center justify-center rounded-full transition-transform active:scale-90 ' + (shuffle ? 'text-emerald-400' : 'text-white/60')}
          >
            <Shuffle className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={manualPrev}
            aria-label="Предыдущий трек"
            className="flex size-11 items-center justify-center rounded-full text-white transition-transform active:scale-90"
          >
            <SkipBack className="size-6" aria-hidden="true" fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Пауза' : 'Играть'}
            className="flex size-16 items-center justify-center rounded-full bg-[#22C55E] text-[#052E16] transition-transform active:scale-95"
          >
            {playing ? (
              <Pause className="size-7" aria-hidden="true" fill="currentColor" />
            ) : (
              <Play className="size-7 translate-x-0.5" aria-hidden="true" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            onClick={manualNext}
            aria-label="Следующий трек"
            className="flex size-11 items-center justify-center rounded-full text-white transition-transform active:scale-90"
          >
            <SkipForward className="size-6" aria-hidden="true" fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={toggleRepeat}
            aria-label="Повтор плейлиста"
            aria-pressed={repeat}
            className={'flex size-11 items-center justify-center rounded-full transition-transform active:scale-90 ' + (repeat ? 'text-emerald-400' : 'text-white/60')}
          >
            <Repeat className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Плейлист */}
        <div className="px-4 pb-6">
          <div className="px-3 pb-1 text-[12px] text-white/60">Плейлист</div>
          <div className="flex flex-col">
            {TRACKS.map((t, i) => {
              const active = i === idx
              return (
                <button
                  key={t.title}
                  type="button"
                  onClick={() => selectTrack(i)}
                  aria-label={`Играть: ${t.title} — ${t.artist}`}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors active:bg-white/[0.04]"
                >
                  <span
                    className={
                      'w-5 shrink-0 text-center text-[13px] tabular-nums ' +
                      (active ? 'text-emerald-400' : 'text-white/40')
                    }
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        'block truncate text-[14px] ' +
                        (active ? 'font-medium text-emerald-400' : 'text-white')
                      }
                    >
                      {t.title}
                    </span>
                    <span className="block truncate text-[11px] text-white/40">{t.artist}</span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-white/50">{mmss(t.dur)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
