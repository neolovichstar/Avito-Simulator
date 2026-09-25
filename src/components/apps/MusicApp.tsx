'use client'

// Resale Music — плеер в стиле Яндекс Музыки (тёмный #0E0E13 + фирменный жёлтый #FFDB4D).
// Настоящая музыка: 30-секундные превью из бесплатного iTunes Search API
// (роуты /api/music/home, /api/music/search, /api/music/similar — см. src/lib/music-types.ts).
//
// Возможности: табы Главная/Радио/Чарт/Поиск, мини-плеер + полноэкранный плеер
// со свайпом вниз, реальный <audio>-движок (shuffle/repeat/seek/auto-skip битых превью),
// лайки в localStorage, рекомендации «Сделано для вас» по топ-артистам/жанрам,
// недавние поиски. Без звуков и вибрации (осознанно, по требованию).

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  Heart,
  Home,
  ListMusic,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  TrendingUp,
  WifiOff,
  X,
} from 'lucide-react'
import { useSwipe } from '@/lib/use-swipe'
import type { HomeData, Track } from '@/lib/music-types'

// ---------- Токены стиля (Яндекс Музыка) ----------

const ACCENT = '#FFDB4D'

// ---------- localStorage ----------

const LS = {
  likes: 'resale_music_likes_v1',
  cache: 'resale_music_trackcache_v1',
  stats: 'resale_music_stats_v1',
  recent: 'resale_music_recent_v1',
} as const

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* приватный режим — молча живём без персистности */
  }
}

type StatsMap = Record<string, { artist: string; genre: string; plays: number }>
type TrackCache = Record<string, Track>

// ---------- Утилиты ----------

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function randomOther(current: number, length: number): number {
  if (length <= 1) return 0
  let n = current
  while (n === current) n = Math.floor(Math.random() * length)
  return n
}

type Tab = 'home' | 'radio' | 'chart' | 'search'

const TABS: { key: Tab; label: string; icon: typeof Home; fillIcon: boolean }[] = [
  { key: 'home', label: 'Главная', icon: Home, fillIcon: true },
  { key: 'radio', label: 'Радио', icon: Radio, fillIcon: true },
  { key: 'chart', label: 'Чарт', icon: TrendingUp, fillIcon: false },
  { key: 'search', label: 'Поиск', icon: Search, fillIcon: false },
]

const RADIO_TILES: { title: string; term: string; hue: string }[] = [
  { title: 'Поп-хиты', term: 'pop hits', hue: '#FFDB4D' },
  { title: 'Хип-хоп', term: 'hip hop hits', hue: '#FF6690' },
  { title: 'Рок', term: 'rock classics', hue: '#F87171' },
  { title: 'Электронная', term: 'electronic dance', hue: '#4ADE80' },
  { title: 'Джаз', term: 'jazz classics', hue: '#E8A020' },
  { title: 'Метал', term: 'heavy metal', hue: '#FB923C' },
  { title: 'Инди', term: 'indie rock', hue: '#A3E635' },
  { title: 'Классика', term: 'classical piano', hue: '#FFC9DE' },
]

// ---------- Атомы ----------

function CoverImg({ track, className }: { track: Track; className?: string }) {
  return (
    <img
      src={track.artwork}
      alt={`Обложка: ${track.title} — ${track.artist}`}
      loading="lazy"
      className={'h-full w-full bg-[#22222B] object-cover ' + (className ?? '')}
    />
  )
}

function HeartBtn({
  liked,
  onToggle,
  className,
}: {
  liked: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-label={liked ? 'Убрать из «Мне нравится»' : 'Нравится'}
      aria-pressed={liked}
      className={
        'flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ' +
        (className ?? '')
      }
    >
      <Heart
        className="size-5"
        aria-hidden="true"
        fill={liked ? ACCENT : 'none'}
        style={liked ? undefined : { color: 'rgba(255,255,255,0.35)' }}
      />
    </button>
  )
}

function SectionHeader({
  title,
  sub,
  actionLabel,
  onAction,
}: {
  title: string
  sub?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-end justify-between px-5">
      <div className="min-w-0">
        <h2 className="truncate text-[18px] font-bold leading-tight">{title}</h2>
        {sub ? <p className="mt-0.5 truncate text-[11px] text-white/45">{sub}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-full px-2 py-1 text-[12px] font-medium text-[#FFDB4D] active:opacity-70"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

/** Горизонтальная карусель обложек со скрытым скроллбаром. */
function Carousel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  )
}

function CoverCard({
  track,
  queue,
  active,
  onPlay,
}: {
  track: Track
  queue: Track[]
  active: boolean
  onPlay: (track: Track, queue: Track[]) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPlay(track, queue)}
      aria-label={`Играть: ${track.title} — ${track.artist}`}
      className="w-28 shrink-0 snap-start text-left transition-transform active:scale-[0.97]"
    >
      <span className="block aspect-square w-28 overflow-hidden rounded-xl bg-[#1D1D26] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.7)]">
        {track.artwork ? <CoverImg track={track} /> : <Music2 className="size-8 p-2 text-white/25" />}
      </span>
      <span
        className={
          'mt-1.5 block truncate text-[13px] font-medium ' + (active ? 'text-[#FFDB4D]' : 'text-white')
        }
      >
        {track.title}
      </span>
      <span className="block truncate text-[11px] text-white/45">{track.artist}</span>
    </button>
  )
}

/** Строка списка (поиск / чарт) с индексом, сердечком и длительностью. */
function TrackRow({
  track,
  queue,
  index,
  medalColor,
  active,
  liked,
  showDuration,
  onPlay,
  onToggleLike,
}: {
  track: Track
  queue: Track[]
  index?: number
  medalColor?: string
  active: boolean
  liked: boolean
  showDuration?: boolean
  onPlay: (track: Track, queue: Track[]) => void
  onToggleLike: (track: Track) => void
}) {
  return (
    <div
      className={
        'flex w-full items-center gap-3 rounded-2xl px-3 py-2 transition-colors ' +
        (active ? 'bg-white/[0.06]' : 'active:bg-white/[0.04]')
      }
    >
      {typeof index === 'number' ? (
        <span
          className="w-5 shrink-0 text-center text-[14px] font-bold tabular-nums"
          style={{ color: medalColor ?? 'rgba(255,255,255,0.35)' }}
          aria-hidden="true"
        >
          {index + 1}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onPlay(track, queue)}
        aria-label={`Играть: ${track.title} — ${track.artist}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="block size-12 shrink-0 overflow-hidden rounded-lg bg-[#1D1D26]">
          {track.artwork ? <CoverImg track={track} /> : <Music2 className="size-5 p-1.5 text-white/25" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={'block truncate text-[14px] font-medium ' + (active ? 'text-[#FFDB4D]' : 'text-white')}>
            {track.title}
          </span>
          <span className="block truncate text-[12px] text-white/45">{track.artist}</span>
        </span>
      </button>
      <HeartBtn liked={liked} onToggle={() => onToggleLike(track)} />
      {showDuration ? (
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/40">
          {mmss(track.duration)}
        </span>
      ) : null}
    </div>
  )
}

function SkeletonRow({ className }: { className?: string }) {
  return <div className={'animate-pulse rounded-2xl bg-[#15151C] ' + (className ?? '')} />
}

// ---------- Мини-плеер ----------

function MiniPlayer({
  track,
  playing,
  progress,
  liked,
  onOpen,
  onTogglePlay,
  onNext,
  onToggleLike,
}: {
  track: Track
  playing: boolean
  progress: number
  liked: boolean
  onOpen: () => void
  onTogglePlay: () => void
  onNext: () => void
  onToggleLike: () => void
}) {
  return (
    <div className="relative mx-2 mb-1.5 shrink-0 rounded-2xl bg-[#1D1D26] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]">
      {/* тонкая жёлтая линия прогресса по верхней кромке */}
      <div className="absolute inset-x-3 top-0 h-[2px] overflow-hidden rounded-full" aria-hidden="true">
        <div className="h-full rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#FFDB4D]" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          onClick={onOpen}
          aria-label="Открыть плеер"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
        >
          <span className="block size-[52px] shrink-0 overflow-hidden rounded-xl bg-[#15151C]">
            {track.artwork ? <CoverImg track={track} /> : <Music2 className="size-6 p-2 text-white/25" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{track.title}</span>
            <span className="block truncate text-[12px] text-white/50">{track.artist}</span>
          </span>
        </button>
        <HeartBtn liked={liked} onToggle={onToggleLike} />
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? 'Пауза' : 'Играть'}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFDB4D] text-black transition-transform active:scale-90"
        >
          {playing ? (
            <Pause className="size-5" fill="currentColor" aria-hidden="true" />
          ) : (
            <Play className="size-5 translate-x-[1px]" fill="currentColor" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Следующий трек"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/80 transition-transform active:scale-90"
        >
          <SkipForward className="size-5" fill="currentColor" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

// ---------- Полноэкранный плеер ----------

function PlayerOverlay({
  track,
  queueLength,
  playing,
  pos,
  dur,
  shuffle,
  repeat,
  liked,
  onClose,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleShuffle,
  onToggleRepeat,
  onToggleLike,
  onSeekRatio,
}: {
  track: Track
  queueLength: number
  playing: boolean
  pos: number
  dur: number
  shuffle: boolean
  repeat: boolean
  liked: boolean
  onClose: () => void
  onTogglePlay: () => void
  onNext: () => void
  onPrev: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onToggleLike: () => void
  onSeekRatio: (ratio: number) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const swipeDown = useSwipe({
    threshold: 48,
    onSwipe: (dir) => {
      if (dir === 'down') onClose()
    },
  })

  const pct = dur > 0 ? clamp01(pos / dur) : 0

  const doSeek = (clientX: number) => {
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const ratio = clamp01((clientX - rect.left) / rect.width)
    onSeekRatio(ratio)
  }

  const total = dur > 0 ? dur : 30 // превью всегда 30 секунд

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      className="absolute inset-0 z-30 flex flex-col rounded-t-3xl bg-[#0E0E13]"
      role="dialog"
      aria-label="Плеер"
    >
      {/* шапка: свайп вниз или шеврон — закрыть */}
      <div
        {...swipeDown}
        className="flex shrink-0 items-center justify-between px-3 pt-3"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Свернуть плеер"
          className="flex size-11 items-center justify-center rounded-full text-white/70 transition-transform active:scale-90"
        >
          <ChevronDown className="size-6" aria-hidden="true" />
        </button>
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
            Сейчас играет
          </div>
          <div className="text-[11px] text-white/60">
            {queueLength > 0 ? `В очереди ${queueLength} треков` : 'Resale Music'}
          </div>
        </div>
        <button
          type="button"
          aria-label="Ещё"
          className="flex size-11 items-center justify-center rounded-full text-white/40"
        >
          <MoreHorizontal className="size-6" aria-hidden="true" />
        </button>
      </div>

      {/* обложка */}
      <div className="flex min-h-0 flex-1 items-center px-8 py-4">
        <div
          {...swipeDown}
          className="relative aspect-square max-h-full w-full overflow-hidden rounded-2xl bg-[#15151C] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.9)]"
        >
          {track.artwork ? (
            <CoverImg track={track} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 className="size-16 text-white/20" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      {/* название + лайк */}
      <div className="flex shrink-0 items-center gap-3 px-7 pt-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[20px] font-bold leading-snug">{track.title}</div>
          <div className="truncate text-[14px] text-white/50">{track.artist}</div>
        </div>
        <HeartBtn liked={liked} onToggle={onToggleLike} />
      </div>

      {/* прогресс: seek через pointer events */}
      <div className="shrink-0 px-7 pt-3">
        <div
          ref={barRef}
          role="slider"
          aria-label="Перемотка трека"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(pos)}
          tabIndex={0}
          className="flex h-8 cursor-pointer touch-none items-center"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            scrubbingRef.current = true
            doSeek(e.clientX)
          }}
          onPointerMove={(e) => {
            if (scrubbingRef.current) doSeek(e.clientX)
          }}
          onPointerUp={(e) => {
            scrubbingRef.current = false
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId)
            }
          }}
        >
          <div className="relative h-1.5 w-full rounded-full bg-white/[0.12]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[#FFDB4D]"
              style={{ width: `${pct * 100}%` }}
            />
            <div
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFDB4D] shadow-[0_0_10px_rgba(255,219,77,0.45)]"
              style={{ left: `${pct * 100}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between pt-1 text-[11px] tabular-nums text-white/45">
          <span>{mmss(pos)}</span>
          <span>{mmss(total)}</span>
        </div>
      </div>

      {/* управление */}
      <div className="flex shrink-0 items-center justify-between px-7 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onToggleShuffle}
          aria-label="Перемешивание"
          aria-pressed={shuffle}
          className={
            'flex size-11 items-center justify-center rounded-full transition-transform active:scale-90 ' +
            (shuffle ? 'text-[#FFDB4D]' : 'text-white/50')
          }
        >
          <Shuffle className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label="Предыдущий трек"
          className="flex size-11 items-center justify-center rounded-full text-white transition-transform active:scale-90"
        >
          <SkipBack className="size-7" fill="currentColor" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? 'Пауза' : 'Играть'}
          className={
            'flex size-16 items-center justify-center rounded-full bg-[#FFDB4D] text-black shadow-[0_12px_32px_-8px_rgba(255,219,77,0.5)] transition-transform active:scale-95 ' +
            (track.preview ? '' : 'opacity-50')
          }
        >
          {playing ? (
            <Pause className="size-7" fill="currentColor" aria-hidden="true" />
          ) : (
            <Play className="size-7 translate-x-[2px]" fill="currentColor" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Следующий трек"
          className="flex size-11 items-center justify-center rounded-full text-white transition-transform active:scale-90"
        >
          <SkipForward className="size-7" fill="currentColor" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleRepeat}
          aria-label="Повтор очереди"
          aria-pressed={repeat}
          className={
            'flex size-11 items-center justify-center rounded-full transition-transform active:scale-90 ' +
            (repeat ? 'text-[#FFDB4D]' : 'text-white/50')
          }
        >
          <Repeat className="size-5" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  )
}

// ---------- Главный компонент ----------

export default function MusicApp() {
  const [tab, setTab] = useState<Tab>('home')

  // Каталог
  const [home, setHome] = useState<HomeData | null>(null)
  const [homeLoading, setHomeLoading] = useState(true)
  const [homeError, setHomeError] = useState(false)

  // Поиск
  const [searchQ, setSearchQ] = useState('')
  const [searchTracks, setSearchTracks] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [recents, setRecents] = useState<string[]>([])
  const recentsRef = useRef<string[]>([])

  // Лайки + кэш треков + статистика прослушиваний
  const [likes, setLikes] = useState<number[]>([])
  const likesRef = useRef<number[]>([])
  const [trackCache, setTrackCache] = useState<TrackCache>({})
  const trackCacheRef = useRef<TrackCache>({})
  const statsRef = useRef<StatsMap>({})

  // Рекомендации «Сделано для вас»
  const [recs, setRecs] = useState<Track[] | null>(null)
  const [recsLoading, setRecsLoading] = useState(false)
  const recsLoadingRef = useRef(false)
  const recsAtRef = useRef(0)

  // Очередь и плеер
  const [queue, setQueue] = useState<Track[]>([])
  const queueRef = useRef<Track[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const queueIndexRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const shuffleRef = useRef(false)
  const [repeat, setRepeat] = useState(false) // false = выкл, true = повторять очередь
  const repeatRef = useRef(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [radioTerm, setRadioTerm] = useState<string | null>(null)
  const [radioLoadingTerm, setRadioLoadingTerm] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentTrack = queue[queueIndex] ?? null
  const likedSet = new Set(likes)

  // ----- localStorage: первичная загрузка -----
  useEffect(() => {
    const l = lsGet<number[]>(LS.likes, [])
    const c = lsGet<TrackCache>(LS.cache, {})
    const s = lsGet<StatsMap>(LS.stats, {})
    const r = lsGet<string[]>(LS.recent, [])
    likesRef.current = l
    trackCacheRef.current = c
    statsRef.current = s
    recentsRef.current = r
    setLikes(l)
    setTrackCache(c)
    setRecents(r)
  }, [])

  // ----- Каталог: главная -----
  const loadHome = useCallback(async () => {
    setHomeLoading(true)
    setHomeError(false)
    try {
      const res = await fetch('/api/music/home')
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as HomeData
      setHome(data)
    } catch {
      setHomeError(true)
    } finally {
      setHomeLoading(false)
    }
  }, [])

  // ----- Аудио-движок -----
  const startPlayback = useCallback((track: Track) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
    // статистика для рекомендаций: инкремент при старте воспроизведения
    const key = String(track.id)
    const prev = statsRef.current[key]
    const nextStats: StatsMap = {
      ...statsRef.current,
      [key]: {
        artist: track.artist,
        genre: track.genre,
        plays: (prev?.plays ?? 0) + 1,
      },
    }
    statsRef.current = nextStats
    lsSet(LS.stats, nextStats)

    setPos(0)
    setDur(0)
    const audio = audioRef.current
    if (!track.preview || !audio) {
      // офлайн-фолбэк: превью нет — честно не «играем»
      setPlaying(false)
      return
    }
    audio.src = track.preview
    audio.load()
    audio.play().catch(() => setPlaying(false))
  }, [])

  const playFromList = useCallback(
    (track: Track, list: Track[]) => {
      const idx = Math.max(0, list.findIndex((t) => t.id === track.id))
      queueRef.current = list
      queueIndexRef.current = idx
      setQueue(list)
      setQueueIndex(idx)
      startPlayback(track)
    },
    [startPlayback],
  )

  const autoNext = useCallback(() => {
    const q = queueRef.current
    if (q.length === 0) return
    let n = shuffleRef.current && q.length > 1 ? randomOther(queueIndexRef.current, q.length) : queueIndexRef.current + 1
    if (n >= q.length) {
      if (repeatRef.current) n = 0
      else {
        const audio = audioRef.current
        if (audio) {
          audio.pause()
          audio.currentTime = 0
        }
        return
      }
    }
    const track = q[n]
    if (!track) return
    queueIndexRef.current = n
    setQueueIndex(n)
    startPlayback(track)
  }, [startPlayback])

  // Создание <audio> + подписки на события
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => setPos(audio.currentTime)
    const onMeta = () => setDur(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onEnded = () => autoNext()
    const onError = () => {
      // битое превью: тихо переходим к следующему через 1.5с
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => autoNext(), 1500)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.removeAttribute('src')
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [autoNext])

  // Первый рендер: грузим каталог
  useEffect(() => {
    void loadHome()
  }, [loadHome])

  // ----- Рекомендации -----
  const refreshRecs = useCallback(async () => {
    if (recsLoadingRef.current) return
    const artistCount = new Map<string, number>()
    const genreCount = new Map<string, number>()
    const bump = (map: Map<string, number>, key: string, delta: number) => {
      if (key) map.set(key, (map.get(key) ?? 0) + delta)
    }
    for (const s of Object.values(statsRef.current)) {
      bump(artistCount, s.artist, s.plays)
      bump(genreCount, s.genre, s.plays)
    }
    // лайки весят больше прослушиваний
    for (const id of likesRef.current) {
      const t = trackCacheRef.current[String(id)]
      if (t) {
        bump(artistCount, t.artist, 5)
        bump(genreCount, t.genre, 3)
      }
    }
    const topArtists = [...artistCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0])
    const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((e) => e[0])

    if (topArtists.length === 0 && topGenres.length === 0) {
      recsAtRef.current = Date.now()
      setRecs([])
      return
    }

    recsLoadingRef.current = true
    setRecsLoading(true)
    try {
      const params = new URLSearchParams()
      if (topArtists.length > 0) params.set('artists', topArtists.join(','))
      if (topGenres.length > 0) params.set('genres', topGenres.join(','))
      const res = await fetch(`/api/music/similar?${params.toString()}`)
      const data = (await res.json()) as { tracks?: Track[] }
      setRecs(data.tracks ?? [])
    } catch {
      setRecs([])
    } finally {
      recsLoadingRef.current = false
      recsAtRef.current = Date.now()
      setRecsLoading(false)
    }
  }, [])

  // Обновлять рекомендации, когда открывают «Главную» и данные протухли (>60с)
  useEffect(() => {
    if (tab === 'home' && Date.now() - recsAtRef.current > 60_000) {
      void refreshRecs()
    }
  }, [tab, refreshRecs])

  // ----- Поиск с дебаунсом -----
  const addRecent = useCallback((q: string) => {
    const next = [q, ...recentsRef.current.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8)
    recentsRef.current = next
    setRecents(next)
    lsSet(LS.recent, next)
  }, [])

  useEffect(() => {
    const q = searchQ.trim()
    if (q.length < 2) {
      setSearchTracks([])
      setSearching(false)
      return
    }
    setSearching(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/music/search?term=${encodeURIComponent(q)}&limit=25`, { signal: ctrl.signal })
        .then((res) => res.json() as Promise<{ tracks?: Track[] }>)
        .then((data) => {
          setSearchTracks(data.tracks ?? [])
          addRecent(q)
        })
        .catch(() => {
          /* отменён или сеть — просто остаёмся в текущем состоянии */
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false)
        })
    }, 400)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [searchQ, addRecent])

  // ----- Действия плеера -----

  const handlePlay = useCallback(
    (track: Track, list: Track[]) => {
      if (currentTrack && currentTrack.id === track.id) {
        const audio = audioRef.current
        if (!track.preview || !audio) return
        if (playing) audio.pause()
        else audio.play().catch(() => setPlaying(false))
        return
      }
      playFromList(track, list)
    },
    [currentTrack, playing, playFromList],
  )

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    const cur = queueRef.current[queueIndexRef.current]
    if (!cur) {
      // ничего не выбрано — стартуем с чарта
      const chart = home?.chart ?? []
      if (chart.length === 0) return
      const first = shuffleRef.current ? chart[randomOther(-1, chart.length)]! : chart[0]!
      playFromList(first, chart)
      return
    }
    if (!audio || !cur.preview) return
    if (playing) audio.pause()
    else audio.play().catch(() => setPlaying(false))
  }, [playing, home, playFromList])

  const nextManual = useCallback(() => {
    const q = queueRef.current
    if (q.length === 0) return
    const n = shuffleRef.current && q.length > 1 ? randomOther(queueIndexRef.current, q.length) : (queueIndexRef.current + 1) % q.length
    const track = q[n]
    if (!track) return
    queueIndexRef.current = n
    setQueueIndex(n)
    startPlayback(track)
  }, [startPlayback])

  const prevManual = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setPos(0)
      return
    }
    const q = queueRef.current
    if (q.length === 0) return
    const n = queueIndexRef.current > 0 ? queueIndexRef.current - 1 : q.length - 1
    const track = q[n]
    if (!track) return
    queueIndexRef.current = n
    setQueueIndex(n)
    startPlayback(track)
  }, [])

  const toggleShuffle = useCallback(() => {
    const v = !shuffleRef.current
    shuffleRef.current = v
    setShuffle(v)
  }, [])

  const toggleRepeat = useCallback(() => {
    const v = !repeatRef.current
    repeatRef.current = v
    setRepeat(v)
  }, [])

  const toggleLike = useCallback((track: Track) => {
    const id = track.id
    const has = likesRef.current.includes(id)
    const nextLikes = has ? likesRef.current.filter((x) => x !== id) : [id, ...likesRef.current]
    const nextCache: TrackCache = { ...trackCacheRef.current, [String(id)]: track }
    likesRef.current = nextLikes
    trackCacheRef.current = nextCache
    setLikes(nextLikes)
    setTrackCache(nextCache)
    lsSet(LS.likes, nextLikes)
    lsSet(LS.cache, nextCache)
  }, [])

  // seek из полноэкранного плеера: реальный audio.duration (превью 30с)
  const handleSeekRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current
      if (!audio) return
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30
      const t = clamp01(ratio) * d
      audio.currentTime = t
      setPos(t)
    },
    [],
  )

  // ----- Радио -----
  const startRadio = useCallback(
    async (term: string) => {
      setRadioLoadingTerm(term)
      try {
        const res = await fetch(`/api/music/search?term=${encodeURIComponent(term)}&limit=25`)
        const data = (await res.json()) as { tracks?: Track[] }
        const list = data.tracks ?? []
        if (list.length === 0) return
        if (!shuffleRef.current) {
          shuffleRef.current = true
          setShuffle(true)
        }
        setRadioTerm(term)
        playFromList(list[Math.floor(Math.random() * list.length)]!, list)
      } catch {
        /* сеть — молча */
      } finally {
        setRadioLoadingTerm(null)
      }
    },
    [playFromList],
  )

  const playMyWave = useCallback(() => {
    const list = recs && recs.length > 0 ? recs : (home?.chart ?? [])
    if (list.length === 0) return
    if (!shuffleRef.current) {
      shuffleRef.current = true
      setShuffle(true)
    }
    setRadioTerm('__wave__')
    playFromList(list[Math.floor(Math.random() * list.length)]!, list)
  }, [recs, home, playFromList])

  const likedTracks: Track[] = likes
    .map((id) => trackCache[String(id)])
    .filter((t): t is Track => Boolean(t))

  const progress = dur > 0 ? clamp01(pos / dur) : 0
  const chart = home?.chart ?? []
  const newReleases = home?.newReleases ?? []
  const genres = home?.genres ?? []
  const activeId = currentTrack?.id

  // ----- Подрендеры табов -----

  const renderHome = () => {
    if (homeLoading && !home) {
      return (
        <div className="flex flex-col gap-6 px-0 pt-1">
          <SkeletonRow className="mx-5 h-36" />
          <div className="flex gap-3 px-5">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonRow key={i} className="h-36 w-28 shrink-0" />
            ))}
          </div>
          <div className="flex gap-3 px-5">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonRow key={i} className="h-36 w-28 shrink-0" />
            ))}
          </div>
        </div>
      )
    }

    if (homeError && !home) {
      return (
        <div className="flex flex-col items-center gap-3 px-8 pt-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-[#15151C]">
            <WifiOff className="size-6 text-white/40" aria-hidden="true" />
          </span>
          <p className="text-[15px] font-semibold">Не удалось загрузить музыку</p>
          <p className="text-[12px] text-white/45">Проверьте сеть — каталог подгрузится сам</p>
          <button
            type="button"
            onClick={() => void loadHome()}
            className="mt-1 flex h-11 items-center rounded-full bg-[#FFDB4D] px-6 text-[13px] font-semibold text-black transition-transform active:scale-95"
          >
            Повторить
          </button>
        </div>
      )
    }

    const heroTrack = chart[0] ?? null

    return (
      <div className="flex flex-col gap-7 pb-4 pt-1">
        {home?.offline ? (
          <div className="mx-5 flex items-center gap-2 rounded-xl bg-[#15151C] px-3 py-2 text-[11px] text-white/45">
            <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
            Нет доступа к каталогу — включён офлайн-список без превью
          </div>
        ) : null}

        {/* Плейлист дня */}
        {heroTrack ? (
          <button
            type="button"
            onClick={() => {
              if (!shuffleRef.current) {
                shuffleRef.current = true
                setShuffle(true)
              }
              playFromList(chart[Math.floor(Math.random() * chart.length)]!, chart)
            }}
            aria-label="Играть Плейлист дня"
            className="relative mx-5 block w-[calc(100%-40px)] overflow-hidden rounded-2xl bg-[#15151C] text-left transition-transform active:scale-[0.98]"
          >
            {heroTrack.artwork ? (
              <span
                aria-hidden="true"
                className="absolute -inset-6 scale-110 bg-cover bg-center opacity-30 blur-2xl"
                style={{ backgroundImage: `url(${heroTrack.artwork})` }}
              />
            ) : null}
            <span className="absolute inset-0 bg-gradient-to-t from-[#0E0E13]/85 via-[#0E0E13]/35 to-transparent" aria-hidden="true" />
            <span className="relative flex items-center gap-4 p-4">
              <span className="block size-[76px] shrink-0 overflow-hidden rounded-xl bg-[#1D1D26]">
                {heroTrack.artwork ? <CoverImg track={heroTrack} /> : <ListMusic className="size-7 p-2 text-white/25" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#FFDB4D]">
                  Плейлист дня
                </span>
                <span className="mt-1 block truncate text-[17px] font-bold">
                  {heroTrack.title}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-white/55">
                  {heroTrack.artist} · {chart.length} треков · микс на каждый день
                </span>
              </span>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#FFDB4D] text-black shadow-[0_10px_24px_-6px_rgba(255,219,77,0.55)]">
                <Play className="size-5 translate-x-[1px]" fill="currentColor" aria-hidden="true" />
              </span>
            </span>
          </button>
        ) : null}

        {/* Мне нравится */}
        <section className="flex flex-col gap-3">
          <SectionHeader title="Мне нравится" sub={likedTracks.length > 0 ? `${likedTracks.length} треков` : undefined} />
          {likedTracks.length > 0 ? (
            <Carousel>
              {likedTracks.map((t) => (
                <CoverCard
                  key={t.id}
                  track={t}
                  queue={likedTracks}
                  active={activeId === t.id}
                  onPlay={handlePlay}
                />
              ))}
            </Carousel>
          ) : (
            <div className="mx-5 flex items-center gap-3 rounded-2xl bg-[#15151C] p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1D1D26]">
                <Heart className="size-5 text-[#FFDB4D]" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[13px] font-medium">Ставьте ❤️ — соберём вашу музыку</span>
                <span className="mt-0.5 block text-[11px] text-white/45">
                  Лайкнутые треки появятся здесь и в рекомендациях
                </span>
              </span>
            </div>
          )}
        </section>

        {/* Чарт Resale */}
        {chart.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Чарт Resale"
              sub="Топ-15 слушателей прямо сейчас"
              actionLabel="Всё"
              onAction={() => setTab('chart')}
            />
            <Carousel>
              {chart.map((t) => (
                <CoverCard key={t.id} track={t} queue={chart} active={activeId === t.id} onPlay={handlePlay} />
              ))}
            </Carousel>
          </section>
        ) : null}

        {/* Новинки */}
        {newReleases.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Новинки" sub="Свежие релизы недели" />
            <Carousel>
              {newReleases.map((t) => (
                <CoverCard key={t.id} track={t} queue={newReleases} active={activeId === t.id} onPlay={handlePlay} />
              ))}
            </Carousel>
          </section>
        ) : null}

        {/* Сделано для вас */}
        {(recs === null && recsLoading) || (recs && recs.length > 0) ? (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Сделано для вас" sub="На основе лайков и прослушиваний" />
            {recs === null && recsLoading ? (
              <div className="flex gap-3 px-5">
                {Array.from({ length: 4 }, (_, i) => (
                  <SkeletonRow key={i} className="h-36 w-28 shrink-0" />
                ))}
              </div>
            ) : (
              <Carousel>
                {(recs ?? []).map((t) => (
                  <CoverCard key={t.id} track={t} queue={recs ?? []} active={activeId === t.id} onPlay={handlePlay} />
                ))}
              </Carousel>
            )}
          </section>
        ) : null}

        {/* Жанровые подборки */}
        {genres.map((g) => (
          <section key={g.title} className="flex flex-col gap-3">
            <SectionHeader title={g.title} sub="Подборка Resale Music" />
            <Carousel>
              {g.tracks.map((t) => (
                <CoverCard key={t.id} track={t} queue={g.tracks} active={activeId === t.id} onPlay={handlePlay} />
              ))}
            </Carousel>
          </section>
        ))}
      </div>
    )
  }

  const renderRadio = () => (
    <div className="flex flex-col gap-4 pb-4 pt-1">
      {/* Моя волна */}
      <button
        type="button"
        onClick={playMyWave}
        aria-label="Играть Мою волну"
        className="mx-5 flex items-center gap-4 rounded-2xl bg-gradient-to-r from-[#FFDB4D] to-[#F2C63B] p-4 text-left text-black transition-transform active:scale-[0.98]"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-black/90">
          <Radio className="size-5 text-[#FFDB4D]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold">Моя волна</span>
          <span className="block text-[12px] text-black/60">
            Бесконечный поток из ваших лайков и жанров
          </span>
        </span>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black/10">
          <Play className="size-5 translate-x-[1px]" fill="currentColor" aria-hidden="true" />
        </span>
      </button>

      <p className="px-5 text-[11px] text-white/45">
        Волны включаются в режиме перемешивания — как настоящее радио
      </p>

      <div className="grid grid-cols-2 gap-3 px-5">
        {RADIO_TILES.map((tile) => {
          const isPlaying = radioTerm === tile.term && playing
          return (
            <button
              key={tile.term}
              type="button"
              onClick={() => void startRadio(tile.term)}
              aria-label={`Включить радио ${tile.title}`}
              className="flex h-28 flex-col justify-between rounded-2xl bg-[#15151C] p-4 text-left transition-transform active:scale-[0.97]"
            >
              <span
                className="flex size-9 items-center justify-center rounded-full"
                style={{ backgroundColor: tile.hue + '1F', color: tile.hue }}
                aria-hidden="true"
              >
                {radioLoadingTerm === tile.term ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Radio className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold">{tile.title}</span>
                {isPlaying ? (
                  <span className="ml-auto flex items-center gap-1" aria-label="Играет">
                    <span className="size-1.5 animate-pulse rounded-full bg-[#FFDB4D]" />
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const MEDALS = ['#FFDB4D', '#C9CDD6', '#E0A26B']

  const renderChart = () => {
    if (homeLoading && !home) {
      return (
        <div className="flex flex-col gap-1 px-2 pt-1">
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonRow key={i} className="mx-1 h-16" />
          ))}
        </div>
      )
    }
    if (homeError && !home) {
      return (
        <div className="flex flex-col items-center gap-3 px-8 pt-12 text-center">
          <p className="text-[15px] font-semibold">Чарт не загрузился</p>
          <button
            type="button"
            onClick={() => void loadHome()}
            className="flex h-11 items-center rounded-full bg-[#FFDB4D] px-6 text-[13px] font-semibold text-black transition-transform active:scale-95"
          >
            Повторить
          </button>
        </div>
      )
    }
    if (chart.length === 0) {
      return <p className="px-8 pt-12 text-center text-[13px] text-white/45">Пока пусто — загляните позже</p>
    }
    return (
      <div className="flex flex-col pb-4 pt-1">
        {chart.map((t, i) => (
          <TrackRow
            key={t.id}
            track={t}
            queue={chart}
            index={i}
            medalColor={i < 3 ? MEDALS[i] : undefined}
            active={activeId === t.id}
            liked={likedSet.has(t.id)}
            showDuration
            onPlay={handlePlay}
            onToggleLike={toggleLike}
          />
        ))}
      </div>
    )
  }

  const renderSearch = () => {
    const q = searchQ.trim()
    return (
      <div className="flex flex-col gap-4 pb-4 pt-1">
        <div className="px-5">
          <div className="flex h-11 items-center gap-2.5 rounded-full bg-[#1D1D26] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[#FFDB4D]/60">
            <Search className="size-4 shrink-0 text-white/40" aria-hidden="true" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Трек, исполнитель или жанр"
              aria-label="Поиск музыки"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-white placeholder:text-white/35 focus:outline-none"
            />
            {searchQ ? (
              <button
                type="button"
                onClick={() => setSearchQ('')}
                aria-label="Очистить поиск"
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-white/40 active:bg-white/10"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        {q.length < 2 ? (
          <section className="flex flex-col gap-3">
            {recents.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-5">
                  <h2 className="text-[15px] font-bold">Недавние запросы</h2>
                  <button
                    type="button"
                    onClick={() => {
                      recentsRef.current = []
                      setRecents([])
                      lsSet(LS.recent, [])
                    }}
                    className="rounded-full px-2 py-1 text-[12px] text-white/40 active:text-white/70"
                  >
                    Очистить
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 px-5">
                  {recents.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSearchQ(r)}
                      className="max-w-full truncate rounded-full bg-[#1D1D26] px-3.5 py-2 text-[12px] text-white/80 transition-transform active:scale-95"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="px-5 pt-6 text-center text-[13px] text-white/45">
                Найдите любой трек из каталога Apple Music — и слушайте 30-секундные превью бесплатно
              </p>
            )}
          </section>
        ) : searching && searchTracks.length === 0 ? (
          <div className="flex flex-col gap-1 px-2">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonRow key={i} className="mx-1 h-16" />
            ))}
          </div>
        ) : searchTracks.length === 0 ? (
          <p className="px-8 pt-8 text-center text-[13px] text-white/45">
            По запросу «{q}» ничего не нашлось
          </p>
        ) : (
          <div className="flex flex-col">
            {searchTracks.map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                queue={searchTracks}
                active={activeId === t.id}
                liked={likedSet.has(t.id)}
                showDuration
                onPlay={handlePlay}
                onToggleLike={toggleLike}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ----- Шапка таба -----
  const header =
    tab === 'home' ? (
      <div className="flex items-center justify-between px-5 pb-1 pt-3">
        <div>
          <h1 className="text-[24px] font-bold leading-tight">Привет!</h1>
          <p className="text-[13px] text-white/50">Что слушаем сегодня?</p>
        </div>
        <span
          className="flex size-10 items-center justify-center rounded-full bg-[#FFDB4D] text-black"
          aria-hidden="true"
        >
          <Play className="size-4 translate-x-[1px]" fill="currentColor" />
        </span>
      </div>
    ) : tab === 'radio' ? (
      <div className="px-5 pb-1 pt-3">
        <h1 className="text-[24px] font-bold leading-tight">Радио</h1>
        <p className="text-[13px] text-white/50">Волны под любое настроение</p>
      </div>
    ) : tab === 'chart' ? (
      <div className="px-5 pb-1 pt-3">
        <h1 className="text-[24px] font-bold leading-tight">Чарт</h1>
        <p className="text-[13px] text-white/50">Топ-15 на этой неделе</p>
      </div>
    ) : (
      <div className="px-5 pb-1 pt-3">
        <h1 className="text-[24px] font-bold leading-tight">Поиск</h1>
      </div>
    )

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0E0E13] text-white">
      <header className="shrink-0">{header}</header>

      <main
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tab === 'home' && renderHome()}
        {tab === 'radio' && renderRadio()}
        {tab === 'chart' && renderChart()}
        {tab === 'search' && renderSearch()}
      </main>

      {/* Мини-плеер над таб-баром */}
      {currentTrack ? (
        <MiniPlayer
          track={currentTrack}
          playing={playing}
          progress={progress}
          liked={likedSet.has(currentTrack.id)}
          onOpen={() => setOverlayOpen(true)}
          onTogglePlay={togglePlay}
          onNext={nextManual}
          onToggleLike={() => currentTrack && toggleLike(currentTrack)}
        />
      ) : null}

      {/* Таб-бар */}
      <nav
        role="tablist"
        aria-label="Разделы музыки"
        className="grid shrink-0 grid-cols-4 border-t border-white/[0.06] bg-[#101016] pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5"
      >
        {TABS.map(({ key, label, icon: Icon, fillIcon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={
                'flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ' +
                (active ? 'text-[#FFDB4D]' : 'text-white/40 active:text-white/70')
              }
            >
              <Icon
                className="size-5"
                fill={active && fillIcon ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Полноэкранный плеер */}
      <AnimatePresence>
        {overlayOpen && currentTrack ? (
          <PlayerOverlay
            key="player-overlay"
            track={currentTrack}
            queueLength={queue.length}
            playing={playing}
            pos={pos}
            dur={dur}
            shuffle={shuffle}
            repeat={repeat}
            liked={likedSet.has(currentTrack.id)}
            onClose={() => setOverlayOpen(false)}
            onTogglePlay={togglePlay}
            onNext={nextManual}
            onPrev={prevManual}
            onToggleShuffle={toggleShuffle}
            onToggleRepeat={toggleRepeat}
            onToggleLike={() => toggleLike(currentTrack)}
            onSeekRatio={handleSeekRatio}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
