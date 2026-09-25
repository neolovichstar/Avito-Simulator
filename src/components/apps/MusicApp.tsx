'use client'

// Resale Music — светлая тема в едином стиле Resale/Банка (#F5F6F8, белые карточки
// rounded-[20px], чёрные CTA-пилюли, жёлтый Play #FFD53D, лайк #F5554A).
//
// Источник музыки — глобальный плеер ОС (src/lib/player.ts): единственный
// HTMLAudioElement живёт на уровне модуля, поэтому музыка продолжает играть
// даже когда приложение закрыто. ЗДЕСЬ НЕТ new Audio()/useRef<HTMLAudioElement> —
// только usePlayer. При unmount музыка НЕ ставится на паузу.
//
// Экраны: Главная (микс дня + карусели) / Чарт топ-20 / Поиск (дебаунс+аборт,
// недавние, жанры) / Библиотека (рекомендации, лайки, часто слушаете).
// Лайки и статистика — localStorage, синхронны во всех экранах.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AudioLines,
  ChevronDown,
  Clock3,
  CloudOff,
  Heart,
  Home,
  Library,
  Music2,
  Music4,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  SearchX,
  Shuffle,
  SkipBack,
  SkipForward,
  TrendingUp,
  Trash2,
  X,
} from 'lucide-react'
import { usePlayer } from '@/lib/player'
import { useSwipe } from '@/lib/use-swipe'
import type { HomeData, MusicSection, Track } from '@/lib/music-types'

// ---------------------------------------------------------------------------
// Константы и localStorage
// ---------------------------------------------------------------------------

const LS = {
  likes: 'resale_music_likes_v1',
  cache: 'resale_music_trackcache_v1',
  stats: 'resale_music_stats_v1',
  recent: 'resale_music_recent_v1',
} as const

const RECENT_MAX = 8
const CACHE_CAP = 200
const HOME_TTL_MS = 5 * 60_000
const SIMILAR_TTL_MS = 5 * 60_000

/** Порядок каруселей на Главной (mix уходит в hero). */
const SECTION_ORDER = ['chart', 'fresh', 'pop', 'hiphop', 'electronic', 'rock', 'rnb', 'lofi']

/** Мини-«чарты» для 1-3 мест. */
const MEDALS: Record<number, string> = { 1: '#D9A514', 2: '#AEB4BC', 3: '#C77B3B' }

const GENRE_CHIPS = ['Поп', 'Хип-хоп', 'Рок', 'Электроника', 'R&B', 'Lo-Fi', 'Русский рэп', 'Kazakh', 'K-pop', 'Jazz']

type Tab = 'home' | 'chart' | 'search' | 'library'

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: 'home', label: 'Главная', icon: Home },
  { key: 'chart', label: 'Чарт', icon: TrendingUp },
  { key: 'search', label: 'Поиск', icon: Search },
  { key: 'library', label: 'Библиотека', icon: Library },
]

type TrackCache = Record<string, Track>
type StatsMap = Record<string, { artist: string; genre: string; plays: number }>

/** Публичный API лайков, который получают экраны. */
interface LikesApi {
  isLiked: (id: string) => boolean
  toggle: (track: Track) => void
}

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
    /* приватный режим — живём без персистности */
  }
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
}

/** 12K / 3.4M — короткий формат прослушиваний. */
function formatPlays(n?: number): string {
  if (!n || n <= 0) return ''
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}M`
  }
  if (n >= 1_000) {
    const v = n / 1_000
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}K`
  }
  return String(n)
}

/** Русские склонения: plural(3, 'трек', 'трека', 'треков'). */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** Кэш треков: держим лайкнутые всегда, остальное — по свежести (cap 200). */
function trimCache(raw: TrackCache): TrackCache {
  const keys = Object.keys(raw)
  if (keys.length <= CACHE_CAP) return raw
  const keep = new Set<string>()
  for (const id of lsGet<string[]>(LS.likes, [])) if (raw[id]) keep.add(id)
  for (let i = keys.length - 1; i >= 0 && keep.size < CACHE_CAP; i--) keep.add(keys[i])
  const next: TrackCache = {}
  for (const k of keep) next[k] = raw[k]
  return next
}

/** Пополняет кэш экранными треками; true — если что-то добавилось. */
function cacheTracks(tracks: Track[]): boolean {
  if (!tracks.length) return false
  try {
    const raw = lsGet<TrackCache>(LS.cache, {})
    let changed = false
    for (const t of tracks) {
      if (t && t.id && !raw[t.id]) {
        raw[t.id] = t
        changed = true
      }
    }
    if (!changed) return false
    lsSet(LS.cache, trimCache(raw))
    return true
  } catch {
    return false
  }
}

function cacheTrack(track: Track): void {
  try {
    const raw = lsGet<TrackCache>(LS.cache, {})
    if (raw[track.id]) return
    raw[track.id] = track
    lsSet(LS.cache, trimCache(raw))
  } catch {
    /* noop */
  }
}

/** Статистика прослушиваний: +1 плей при смене текущего трека. */
function recordPlay(track: Track): void {
  try {
    const stats = lsGet<StatsMap>(LS.stats, {})
    const prev = stats[track.id]
    stats[track.id] = { artist: track.artist, genre: track.genre ?? '', plays: (prev?.plays ?? 0) + 1 }
    lsSet(LS.stats, stats)
  } catch {
    /* noop */
  }
}

/** Память рекомендаций «Сделано для вас» между открытиями вкладки. */
let similarMem: { at: number; key: string; tracks: Track[] } | null = null

// ---------------------------------------------------------------------------
// useLikes — лайки (Set-семантика поверх массива «новые первыми»)
// ---------------------------------------------------------------------------

function useLikes() {
  // Читаем localStorage лениво на первом рендере: приложение монтируется
  // только на клиенте (после авторизации), SSR это состояние не рендерит.
  const [likes, setLikes] = useState<string[]>(() => (typeof window === 'undefined' ? [] : lsGet<string[]>(LS.likes, [])))

  // Персистим при каждом изменении (первая запись возвращает прочитанное значение).
  useEffect(() => {
    lsSet(LS.likes, likes)
  }, [likes])

  const likeSet = useMemo(() => new Set(likes), [likes])

  const isLiked = useCallback((id: string) => likeSet.has(id), [likeSet])

  const toggle = useCallback(
    (track: Track) => {
      if (!likeSet.has(track.id)) cacheTrack(track)
      setLikes((prev) => (prev.includes(track.id) ? prev.filter((id) => id !== track.id) : [track.id, ...prev]))
    },
    [likeSet],
  )

  return { likes, isLiked, toggle }
}

// ---------------------------------------------------------------------------
// Атомы
// ---------------------------------------------------------------------------

/** Обложка с аккуратной заглушкой (битая картинка не ломает сетку). */
function Cover({ track, small, className }: { track: Track; small?: boolean; className?: string }) {
  const src = small ? track.artworkSmall || track.artwork : track.artwork || track.artworkSmall
  return (
    <div className={'relative shrink-0 overflow-hidden bg-gradient-to-br from-[#F0F1F5] to-[#E4E6EB] ' + (className ?? '')}>
      {/* Заглушка всегда под картинкой: при медленной сети/битом URL обложка выглядит аккуратно. */}
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <Music2 className="h-1/3 w-1/3 text-[#B9BDC7]" />
      </div>
      <img
        src={src}
        alt={`Обложка: ${track.title} — ${track.artist}`}
        loading="lazy"
        onLoad={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
        onError={(e) => {
          e.currentTarget.style.opacity = '0'
        }}
        className="relative h-full w-full object-cover"
      />
    </div>
  )
}

/** Сердечко-лайк: тёплый красный #F5554A, синхронно во всех экранах. */
function HeartBtn({ liked, onToggle, size = 20, buttonClass }: { liked: boolean; onToggle: () => void; size?: number; buttonClass?: string }) {
  return (
    <button
      type="button"
      aria-label={liked ? 'Убрать из «Мне нравится»' : 'Добавить в «Мне нравится»'}
      aria-pressed={liked}
      onClick={onToggle}
      className={
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#8B8F99] transition-transform active:scale-90 ' +
        (buttonClass ?? '')
      }
    >
      <Heart size={size} className={liked ? 'fill-[#F5554A] text-[#F5554A]' : ''} />
    </button>
  )
}

/** Экран ошибки с чёрной кнопкой «Повторить». */
function ErrorState({ title, hint, onRetry }: { title: string; hint: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F0F1F5]">
        <CloudOff className="h-7 w-7 text-[#8B8F99]" aria-hidden />
      </div>
      <h2 className="mt-4 text-[17px] font-semibold text-[#17181A]">{title}</h2>
      <p className="mt-1 max-w-[260px] text-[13px] leading-snug text-[#8B8F99]">{hint}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 flex h-11 items-center rounded-full bg-[#17181A] px-7 text-[14px] font-semibold text-white transition-transform active:scale-[0.98]"
      >
        Повторить
      </button>
    </div>
  )
}

/** «Ничего не нашлось» — иллюстрация из иконок lucide. */
function NothingFound() {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-[#F0F1F5]" aria-hidden />
        <Music4 className="relative h-8 w-8 -rotate-12 text-[#B9BDC7]" aria-hidden />
        <SearchX
          className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-white p-1 text-[#8B8F99] shadow-sm"
          aria-hidden
        />
      </div>
      <h2 className="mt-4 text-[17px] font-semibold text-[#17181A]">Ничего не нашлось</h2>
      <p className="mt-1 max-w-[260px] text-[13px] leading-snug text-[#8B8F99]">
        Попробуйте другой запрос — например, жанр или имя артиста
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Скелетоны
// ---------------------------------------------------------------------------

function HomeSkeleton() {
  return (
    <div className="animate-pulse px-4 pb-6 pt-4">
      <div className="h-7 w-40 rounded-lg bg-[#EBEDF0]" />
      <div className="mt-2 h-4 w-60 rounded bg-[#EBEDF0]" />
      <div className="mt-4 h-40 rounded-[24px] bg-[#EBEDF0]" />
      {[0, 1].map((row) => (
        <div key={row} className="mt-6">
          <div className="h-6 w-32 rounded-lg bg-[#EBEDF0]" />
          <div className="mt-3 flex gap-3 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-[116px] shrink-0">
                <div className="aspect-square w-[116px] rounded-[14px] bg-[#EBEDF0]" />
                <div className="mt-2 h-3.5 w-24 rounded bg-[#EBEDF0]" />
                <div className="mt-1.5 h-3 w-16 rounded bg-[#EBEDF0]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mx-4 mt-4 animate-pulse rounded-[20px] bg-white p-1.5 shadow-sm">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-1.5">
          <div className="h-6 w-6 rounded-full bg-[#EBEDF0]" />
          <div className="h-14 w-14 rounded-[12px] bg-[#EBEDF0]" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-3/5 rounded bg-[#EBEDF0]" />
            <div className="mt-2 h-3 w-2/5 rounded bg-[#EBEDF0]" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Строка трека (чарт / поиск / библиотека)
// ---------------------------------------------------------------------------

interface TrackRowProps {
  track: Track
  onPlay: () => void
  liked: boolean
  onToggleLike: () => void
  /** 1-based номер; undefined — без колонки номера. */
  rank?: number
  /** Медальоны для 1-3 мест. */
  medal?: boolean
  playsLabel?: string
  /** Это текущий трек глобального плеера. */
  active?: boolean
}

function TrackRow({ track, onPlay, liked, onToggleLike, rank, medal, playsLabel, active }: TrackRowProps) {
  const medalColor = medal && rank ? MEDALS[rank] : undefined
  return (
    <div className="flex items-center gap-1.5 rounded-[14px] p-1.5 transition-colors active:bg-[#F5F6F8]">
      {rank !== undefined && (
        <div className="flex w-6 shrink-0 items-center justify-center" aria-hidden>
          {medalColor ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: medalColor }}>
              {rank}
            </span>
          ) : (
            <span className="w-6 text-center text-[12px] font-medium tabular-nums text-[#8B8F99]">{rank}</span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Слушать: ${track.title} — ${track.artist}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
      >
        <Cover track={track} small className="h-14 w-14 rounded-[12px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight text-[#17181A]">{track.title}</span>
          <span className="mt-0.5 block truncate text-[12px] text-[#8B8F99]">{track.artist}</span>
        </span>
      </button>
      <div className="flex w-10 shrink-0 items-center justify-end" aria-hidden>
        {active ? (
          <AudioLines size={18} className="text-[#17181A]" />
        ) : playsLabel ? (
          <span className="text-[12px] tabular-nums text-[#8B8F99]">{playsLabel}</span>
        ) : null}
      </div>
      <HeartBtn liked={liked} onToggle={onToggleLike} size={20} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Карусели Главной
// ---------------------------------------------------------------------------

function CarouselCard({ track, liked, onToggleLike, onPlay }: { track: Track; liked: boolean; onToggleLike: () => void; onPlay: () => void }) {
  return (
    <div className="relative w-[116px] shrink-0">
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Слушать: ${track.title} — ${track.artist}`}
        className="block w-full text-left transition-transform active:scale-[0.97]"
      >
        <Cover track={track} className="aspect-square w-[116px] rounded-[14px]" />
        <span className="mt-2 block truncate text-[13px] font-semibold leading-tight text-[#17181A]">{track.title}</span>
        <span className="mt-0.5 block truncate text-[11px] leading-tight text-[#8B8F99]">{track.artist}</span>
      </button>
      {/* Сердечко — отдельная кнопка поверх обложки (44px зона касания). */}
      <button
        type="button"
        aria-label={liked ? `Убрать «${track.title}» из «Мне нравится»` : `Добавить «${track.title}» в «Мне нравится»`}
        aria-pressed={liked}
        onClick={onToggleLike}
        className="absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/85 shadow-sm backdrop-blur">
          <Heart size={14} className={liked ? 'fill-[#F5554A] text-[#F5554A]' : 'text-[#5C6068]'} />
        </span>
      </button>
    </div>
  )
}

function CarouselSection({ section, likes, onPlay }: { section: MusicSection; likes: LikesApi; onPlay: (tracks: Track[], i: number) => void }) {
  return (
    <section className="mt-5" aria-label={section.title}>
      <div className="px-4">
        <h2 className="text-[20px] font-bold leading-tight text-[#17181A]">{section.title}</h2>
        {section.subtitle && <p className="mt-0.5 text-[13px] text-[#8B8F99]">{section.subtitle}</p>}
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {section.tracks.map((t, i) => (
          <CarouselCard
            key={t.id}
            track={t}
            liked={likes.isLiked(t.id)}
            onToggleLike={() => likes.toggle(t)}
            onPlay={() => onPlay(section.tracks, i)}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Hero «Микс дня»
// ---------------------------------------------------------------------------

function HeroMix({ mix, onPlay }: { mix: MusicSection; onPlay: () => void }) {
  const [bgFailed, setBgFailed] = useState(false)
  const first = mix.tracks[0]
  return (
    <section className="relative h-40 overflow-hidden rounded-[24px] bg-[#17181A]" aria-label="Микс дня">
      {first && !bgFailed && (
        <img
          src={first.artwork}
          alt=""
          aria-hidden
          loading="lazy"
          onError={() => setBgFailed(true)}
          className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-tr from-black/75 via-black/50 to-black/25" aria-hidden />
      <div className="relative flex h-full flex-col justify-between p-5 text-white">
        <div>
          <h2 className="text-[22px] font-bold leading-tight">{mix.title}</h2>
          <p className="mt-0.5 text-[12px] text-white/75">
            {mix.subtitle ?? 'Персональная подборка'} · {mix.tracks.length} {plural(mix.tracks.length, 'трек', 'трека', 'треков')}
          </p>
        </div>
        <button
          type="button"
          onClick={onPlay}
          className="flex h-11 items-center gap-2 self-start rounded-full bg-[#17181A] px-5 text-[14px] font-semibold text-white ring-1 ring-white/25 transition-transform active:scale-[0.98]"
        >
          <Play size={15} className="fill-current" aria-hidden />
          Слушать
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Экран: Главная
// ---------------------------------------------------------------------------

interface ScreenProps {
  state: 'loading' | 'ready' | 'error'
  sections: MusicSection[]
  likes: LikesApi
  onPlay: (tracks: Track[], i: number) => void
  onRetry: () => void
}

function HomeScreen({ state, sections, likes, onPlay, onRetry }: ScreenProps) {
  const mix = useMemo(() => sections.find((s) => s.key === 'mix' && s.tracks.length > 0), [sections])
  const ordered = useMemo(() => {
    const byKey = new Map(sections.map((s) => [s.key, s]))
    const known = SECTION_ORDER.map((k) => byKey.get(k)).filter((s): s is MusicSection => !!s && s.tracks.length > 0)
    const extra = sections.filter((s) => s.key !== 'mix' && !SECTION_ORDER.includes(s.key) && s.tracks.length > 0)
    return [...known, ...extra]
  }, [sections])

  if (state === 'loading') return <HomeSkeleton />
  if (state === 'error') {
    return <ErrorState title="Не удалось загрузить" hint="Проверьте интернет и попробуйте снова" onRetry={onRetry} />
  }

  return (
    <div className="pb-6">
      <header className="px-4 pt-4">
        <h1 className="text-[24px] font-bold leading-tight text-[#17181A]">Привет!</h1>
        <p className="mt-0.5 text-[13px] text-[#8B8F99]">Полные треки — слушай без ограничений</p>
      </header>

      {mix && (
        <div className="mt-4 px-4">
          <HeroMix mix={mix} onPlay={() => onPlay(mix.tracks, 0)} />
        </div>
      )}

      {ordered.map((s) => (
        <CarouselSection key={s.key} section={s} likes={likes} onPlay={onPlay} />
      ))}

      {!mix && ordered.length === 0 && (
        <div className="flex flex-col items-center px-8 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F0F1F5]">
            <Music4 className="h-7 w-7 text-[#B9BDC7]" aria-hidden />
          </div>
          <h2 className="mt-4 text-[17px] font-semibold text-[#17181A]">Пока пусто</h2>
          <p className="mt-1 text-[13px] text-[#8B8F99]">Подборки появятся — загляните чуть позже</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Экран: Чарт (топ-20)
// ---------------------------------------------------------------------------

function ChartScreen({ state, sections, likes, onPlay, onRetry }: ScreenProps) {
  const tracks = useMemo(() => (sections.find((s) => s.key === 'chart')?.tracks ?? []).slice(0, 20), [sections])
  const currentId = usePlayer((s) => s.current?.id ?? null)

  return (
    <div className="pb-6">
      <header className="px-4 pt-4">
        <h1 className="text-[24px] font-bold leading-tight text-[#17181A]">Чарт</h1>
        <p className="mt-0.5 text-[13px] text-[#8B8F99]">Топ-20 прослушиваний на этой неделе</p>
      </header>

      {state === 'loading' ? (
        <ListSkeleton rows={7} />
      ) : state === 'error' ? (
        <ErrorState title="Не удалось загрузить чарт" hint="Проверьте интернет и попробуйте снова" onRetry={onRetry} />
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center px-8 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F0F1F5]">
            <TrendingUp className="h-7 w-7 text-[#B9BDC7]" aria-hidden />
          </div>
          <h2 className="mt-4 text-[17px] font-semibold text-[#17181A]">Чарт пока пуст</h2>
          <p className="mt-1 text-[13px] text-[#8B8F99]">Загляните чуть позже</p>
        </div>
      ) : (
        <div className="mx-4 mt-4 rounded-[20px] bg-white p-1.5 shadow-sm">
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              rank={i + 1}
              medal
              playsLabel={formatPlays(t.plays)}
              active={t.id === currentId}
              liked={likes.isLiked(t.id)}
              onToggleLike={() => likes.toggle(t)}
              onPlay={() => onPlay(tracks, i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Экран: Поиск
// ---------------------------------------------------------------------------

interface SearchScreenProps {
  query: string
  onQuery: (q: string) => void
  results: Track[]
  state: 'idle' | 'loading' | 'done' | 'error'
  recent: string[]
  onSuggestion: (q: string) => void
  onClearRecent: () => void
  onSubmit: () => void
  onRetry: () => void
  likes: LikesApi
  onPlay: (tracks: Track[], i: number) => void
}

function SearchScreen({ query, onQuery, results, state, recent, onSuggestion, onClearRecent, onSubmit, onRetry, likes, onPlay }: SearchScreenProps) {
  const currentId = usePlayer((s) => s.current?.id ?? null)
  const trimmed = query.trim()
  const showSuggestions = trimmed.length < 2

  return (
    <div className="pb-6">
      <header className="px-4 pt-4">
        <h1 className="text-[24px] font-bold leading-tight text-[#17181A]">Поиск</h1>
        <p className="mt-0.5 text-[13px] text-[#8B8F99]">Миллионы полных треков</p>
      </header>

      <div className="mt-3 px-4">
        <div className="flex h-12 items-center gap-2 rounded-full bg-[#F0F1F5] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[#17181A]/10">
          <Search size={18} className="shrink-0 text-[#8B8F99]" aria-hidden />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit()
            }}
            enterKeyHint="search"
            aria-label="Поиск музыки"
            placeholder="Трек, артист или жанр"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-[#17181A] outline-none placeholder:text-[#8B8F99]"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label="Очистить запрос"
              className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#8B8F99] active:scale-90"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      {showSuggestions ? (
        <div className="mt-5 px-4">
          {recent.length > 0 && (
            <section aria-label="Недавние запросы">
              <div className="flex items-center justify-between">
                <h2 className="text-[18px] font-bold text-[#17181A]">Недавние запросы</h2>
                <button
                  type="button"
                  onClick={onClearRecent}
                  className="flex h-11 items-center px-2 text-[13px] text-[#8B8F99] active:scale-[0.98]"
                >
                  Очистить
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onSuggestion(r)}
                    className="flex h-10 items-center gap-1.5 rounded-full bg-[#F0F1F5] px-4 text-[13px] font-medium text-[#17181A] transition-transform active:scale-[0.97]"
                  >
                    <Clock3 size={14} className="text-[#8B8F99]" aria-hidden />
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="mt-5" aria-label="Жанры">
            <h2 className="text-[18px] font-bold text-[#17181A]">Жанры</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {GENRE_CHIPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onSuggestion(g)}
                  className="flex h-10 items-center rounded-full bg-[#F0F1F5] px-4 text-[13px] font-medium text-[#17181A] transition-transform active:scale-[0.97]"
                >
                  {g}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : state === 'loading' ? (
        <ListSkeleton rows={6} />
      ) : state === 'error' ? (
        <ErrorState title="Поиск не удался" hint="Проверьте интернет и попробуйте снова" onRetry={onRetry} />
      ) : results.length === 0 ? (
        <NothingFound />
      ) : (
        <div className="mx-4 mt-4 rounded-[20px] bg-white p-1.5 shadow-sm">
          {results.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              rank={i + 1}
              active={t.id === currentId}
              liked={likes.isLiked(t.id)}
              onToggleLike={() => likes.toggle(t)}
              onPlay={() => onPlay(results, i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Экран: Библиотека
// ---------------------------------------------------------------------------

interface LibraryScreenProps {
  likedTracks: Track[]
  likes: LikesApi
  onCacheBump: () => void
  onPlay: (tracks: Track[], i: number) => void
}

function LibraryScreen({ likedTracks, likes, onCacheBump, onPlay }: LibraryScreenProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared] = useState(false)
  const currentId = usePlayer((s) => s.current?.id ?? null)

  // Статистика/кэш читаются один раз при монтировании вкладки (экран
  // клиентский и пересоздаётся при каждом заходе в «Библиотеку»). Всё в одном
  // ленивом useState — без синхронных setState в эффектах.
  const [lib] = useState(() => {
    const stats = lsGet<StatsMap>(LS.stats, {})
    const cache = lsGet<TrackCache>(LS.cache, {})
    const entries = Object.entries(stats)

    const sorted = entries.slice().sort((a, b) => b[1].plays - a[1].plays)
    const top = sorted.slice(0, 6).flatMap(([id, s]) => (cache[id] ? [{ track: cache[id], plays: s.plays }] : []))

    const artistAgg = new Map<string, number>()
    const genreAgg = new Map<string, number>()
    for (const [, s] of entries) {
      if (s.artist) artistAgg.set(s.artist, (artistAgg.get(s.artist) ?? 0) + s.plays)
      if (s.genre) genreAgg.set(s.genre, (genreAgg.get(s.genre) ?? 0) + s.plays)
    }
    const artists = [...artistAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a)
    const genres = [...genreAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g)
    const hasSignal = artists.length > 0 || genres.length > 0
    const signal = hasSignal ? { key: `${artists.join('|')}::${genres.join('|')}`, artists, genres } : null

    // Свежая память рекомендаций — показываем сразу, без запроса.
    let made: Track[] = []
    let madeReady = false
    if (signal && similarMem && similarMem.key === signal.key && Date.now() - similarMem.at < SIMILAR_TTL_MS) {
      made = similarMem.tracks
      madeReady = true
    }
    return { top, hasStats: entries.length > 0, signal, made, madeReady }
  })

  const [made, setMade] = useState<Track[]>(lib.made)
  const [madeReady, setMadeReady] = useState(lib.madeReady)
  const madeAbort = useRef<AbortController | null>(null)
  const doneKeyRef = useRef<string | null>(lib.madeReady ? (lib.signal?.key ?? null) : null)

  // «Сделано для вас» — рекомендации по топ-артистам/жанрам (кэш 5 минут).
  // Все setState — в асинхронных колбэках, тело эффекта синхронно ничего не сеттит.
  useEffect(() => {
    const sig = lib.signal
    if (!sig || doneKeyRef.current === sig.key) return
    const ctrl = new AbortController()
    madeAbort.current = ctrl
    const params = new URLSearchParams()
    if (sig.artists.length) params.set('artists', sig.artists.join(','))
    if (sig.genres.length) params.set('genres', sig.genres.join(','))
    fetch(`/api/music/similar?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<{ tracks: Track[] }>
      })
      .then((data) => {
        if (ctrl.signal.aborted) return
        const list = Array.isArray(data.tracks) ? data.tracks : []
        similarMem = { at: Date.now(), key: sig.key, tracks: list }
        doneKeyRef.current = sig.key
        setMade(list)
        setMadeReady(true)
        if (cacheTracks(list)) onCacheBump()
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          doneKeyRef.current = sig.key
          setMadeReady(true)
        }
      })
    return () => ctrl.abort()
  }, [lib.signal, onCacheBump])

  useEffect(() => () => madeAbort.current?.abort(), [])

  const signal = cleared ? null : lib.signal
  const hasStats = lib.hasStats && !cleared
  const topEntries = cleared ? [] : lib.top

  const clearStats = useCallback(() => {
    lsSet(LS.stats, {})
    similarMem = null
    setCleared(true)
    setMade([])
    setMadeReady(false)
    setConfirmClear(false)
  }, [])

  const libraryEmpty = !hasStats && likedTracks.length === 0 && topEntries.length === 0

  return (
    <div className="pb-6">
      <header className="px-4 pt-4">
        <h1 className="text-[24px] font-bold leading-tight text-[#17181A]">Библиотека</h1>
        <p className="mt-0.5 text-[13px] text-[#8B8F99]">Ваша музыка собрана здесь</p>
      </header>

      {libraryEmpty && (
        <div className="flex flex-col items-center px-8 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F0F1F5]">
            <Heart className="h-7 w-7 text-[#B9BDC7]" aria-hidden />
          </div>
          <h2 className="mt-4 text-[17px] font-semibold text-[#17181A]">Здесь появится ваша музыка</h2>
          <p className="mt-1 max-w-[260px] text-[13px] leading-snug text-[#8B8F99]">
            Слушайте треки и нажимайте ♥ — избранное и рекомендации соберутся в библиотеке
          </p>
        </div>
      )}

      {/* Сделано для вас */}
      {signal && (!madeReady || made.length > 0) && (
        <section className="mt-5" aria-label="Сделано для вас">
          <div className="px-4">
            <h2 className="text-[20px] font-bold leading-tight text-[#17181A]">Сделано для вас</h2>
            <p className="mt-0.5 text-[13px] text-[#8B8F99]">По вашим прослушиваниям</p>
          </div>
          {!madeReady ? (
            <div className="mt-3 flex gap-3 overflow-hidden px-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-[116px] shrink-0 animate-pulse">
                  <div className="aspect-square w-[116px] rounded-[14px] bg-[#EBEDF0]" />
                  <div className="mt-2 h-3.5 w-24 rounded bg-[#EBEDF0]" />
                  <div className="mt-1.5 h-3 w-16 rounded bg-[#EBEDF0]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {made.map((t, i) => (
                <CarouselCard
                  key={t.id}
                  track={t}
                  liked={likes.isLiked(t.id)}
                  onToggleLike={() => likes.toggle(t)}
                  onPlay={() => onPlay(made, i)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Мне нравится */}
      <section className="mt-5" aria-label="Мне нравится">
        <div className="px-4">
          <h2 className="text-[20px] font-bold leading-tight text-[#17181A]">Мне нравится</h2>
          <p className="mt-0.5 text-[13px] text-[#8B8F99]">
            {likedTracks.length > 0
              ? `${likedTracks.length} ${plural(likedTracks.length, 'трек', 'трека', 'треков')}`
              : 'Ваши любимые треки'}
          </p>
        </div>
        {likedTracks.length === 0 ? (
          !libraryEmpty && (
            <div className="mx-4 mt-3 rounded-[20px] bg-white p-4 text-center shadow-sm">
              <p className="text-[13px] leading-snug text-[#8B8F99]">
                Нажимайте ♥ на любом треке — он появится здесь
              </p>
            </div>
          )
        ) : (
          <div className="mx-4 mt-3 rounded-[20px] bg-white p-1.5 shadow-sm">
            {likedTracks.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                active={t.id === currentId}
                liked={likes.isLiked(t.id)}
                onToggleLike={() => likes.toggle(t)}
                onPlay={() => onPlay(likedTracks, i)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Часто слушаете */}
      {topEntries.length > 0 && (
        <section className="mt-5" aria-label="Часто слушаете">
          <div className="px-4">
            <h2 className="text-[20px] font-bold leading-tight text-[#17181A]">Часто слушаете</h2>
            <p className="mt-0.5 text-[13px] text-[#8B8F99]">Топ-6 по вашим плейам</p>
          </div>
          <div className="mx-4 mt-3 rounded-[20px] bg-white p-1.5 shadow-sm">
            {topEntries.map(({ track, plays }, i) => (
              <TrackRow
                key={track.id}
                track={track}
                rank={i + 1}
                playsLabel={`${formatPlays(plays)} ${plural(plays, 'плей', 'плея', 'плейов')}`}
                active={track.id === currentId}
                liked={likes.isLiked(track.id)}
                onToggleLike={() => likes.toggle(track)}
                onPlay={() => onPlay(topEntries.map((e) => e.track), i)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Очистить статистику — inline-подтверждение */}
      {hasStats && (
        <div className="mt-5 px-4">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="mx-auto flex h-10 items-center gap-1.5 rounded-full px-4 text-[12px] text-[#8B8F99] transition-transform active:scale-[0.98]"
            >
              <Trash2 size={14} aria-hidden />
              Очистить статистику
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-[16px] bg-white p-3 shadow-sm">
              <p className="text-[12px] text-[#17181A]">Удалить статистику прослушиваний?</p>
              <button
                type="button"
                onClick={clearStats}
                className="flex h-9 items-center rounded-full bg-[#F5554A]/10 px-4 text-[12px] font-semibold text-[#F5554A] active:scale-[0.98]"
              >
                Удалить
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="flex h-9 items-center rounded-full bg-[#F0F1F5] px-4 text-[12px] font-semibold text-[#17181A] active:scale-[0.98]"
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seek-бар: Pointer Events + setPointerCapture + touch-none
// ---------------------------------------------------------------------------

function SeekBar({ onSeek }: { onSeek: (t: number) => void }) {
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  const ratioAt = useCallback((clientX: number): number => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return clamp01((clientX - rect.left) / rect.width)
  }, [])

  const shownRatio = dragRatio ?? (duration > 0 ? clamp01(position / duration) : 0)

  return (
    <div
      ref={barRef}
      role="slider"
      aria-label="Перемотка трека"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round(duration))}
      aria-valuenow={Math.round(shownRatio * duration)}
      className="w-full touch-none select-none py-2.5"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragRatio(ratioAt(e.clientX))
      }}
      onPointerMove={(e) => {
        if (dragRatio === null) return
        setDragRatio(ratioAt(e.clientX))
      }}
      onPointerUp={(e) => {
        if (dragRatio === null) return
        const r = ratioAt(e.clientX)
        setDragRatio(null)
        onSeek(r * duration)
      }}
      onPointerCancel={() => setDragRatio(null)}
    >
      <div className="relative h-1.5 rounded-full bg-[#EBEDF0]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#FFD53D]" style={{ width: `${shownRatio * 100}%` }} />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#17181A] shadow"
          style={{ left: `${shownRatio * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[#8B8F99]">
        <span>{mmss(shownRatio * duration)}</span>
        <span>{mmss(duration)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Мини-плеер
// ---------------------------------------------------------------------------

function MiniPlayer({ onOpen, likes }: { onOpen: () => void; likes: LikesApi }) {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)

  if (!current) return null
  const progress = duration > 0 ? clamp01(position / duration) : 0

  return (
    <div className="relative z-30 mx-3 mb-2">
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-[0_10px_34px_-10px_rgba(23,24,26,0.22)]">
        {/* Жёлтая полоска прогресса по верхней кромке */}
        <div
          className="absolute left-0 top-0 h-[3px] rounded-full bg-[#FFD53D] transition-[width] duration-300 ease-linear"
          style={{ width: `${progress * 100}%` }}
          aria-hidden
        />
        <div className="flex items-center gap-1 p-2.5">
          <button type="button" onClick={onOpen} aria-label="Открыть полный плеер" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left">
            <Cover track={current} small className="h-11 w-11 rounded-[12px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-[#17181A]">{current.title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-[#8B8F99]">{current.artist}</span>
            </span>
          </button>
          <HeartBtn liked={likes.isLiked(current.id)} onToggle={() => likes.toggle(current)} size={19} />
          <button
            type="button"
            onClick={toggle}
            aria-label={isPlaying ? 'Пауза' : 'Играть'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#17181A] text-white transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause size={18} className="fill-current" aria-hidden />
            ) : (
              <Play size={18} className="ml-0.5 fill-current" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Следующий трек"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#17181A] transition-transform active:scale-95"
          >
            <SkipForward size={20} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Полный плеер (шторка slide-up, свайп вниз закрывает)
// ---------------------------------------------------------------------------

function FullPlayer({ onClose, likes }: { onClose: () => void; likes: LikesApi }) {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const trackError = usePlayer((s) => s.trackError)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seek = usePlayer((s) => s.seek)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)
  const cycleRepeat = usePlayer((s) => s.cycleRepeat)

  const { onPointerDown } = useSwipe({ threshold: 64, onSwipe: (dir) => { if (dir === 'down') onClose() } })

  if (!current) return null

  return (
    <motion.div
      className="absolute inset-0 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Полный плеер"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="absolute inset-x-0 bottom-0 top-0 flex flex-col overflow-hidden rounded-t-[28px] bg-gradient-to-b from-white to-[#F5F6F8] shadow-2xl"
      >
        {/* Шапка — зона свайпа вниз */}
        <div className="shrink-0 touch-none px-2 pt-2" onPointerDown={onPointerDown}>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              aria-label="Свернуть плеер"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#17181A] transition-transform active:scale-95"
            >
              <ChevronDown size={24} aria-hidden />
            </button>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8B8F99]">Сейчас играет</span>
            <span className="h-11 w-11 shrink-0" aria-hidden />
          </div>
          <div className="mx-auto mt-1 h-1 w-10 rounded-full bg-[#E4E6EB]" aria-hidden />
        </div>

        {/* Обложка — тоже зона свайпа */}
        <div className="flex min-h-0 flex-1 touch-none items-center justify-center px-8 py-4" onPointerDown={onPointerDown}>
          <div className="aspect-square w-full max-w-[min(300px,42dvh)]">
            <Cover
              track={current}
              className="h-full w-full rounded-[24px] shadow-[0_26px_60px_-20px_rgba(23,24,26,0.4)]"
            />
          </div>
        </div>

        {/* Название + лайк */}
        <div className="relative shrink-0 px-6 pt-1 text-center">
          {trackError && <p className="mb-1 text-[12px] text-[#F5554A]">Трек недоступен — переключаем…</p>}
          <h2 className="truncate text-[20px] font-bold text-[#17181A]">{current.title}</h2>
          <p className="mt-0.5 truncate text-[14px] text-[#8B8F99]">{current.artist}</p>
          <div className="absolute right-4 top-0">
            <HeartBtn liked={likes.isLiked(current.id)} onToggle={() => likes.toggle(current)} size={22} />
          </div>
        </div>

        {/* Перемотка */}
        <div className="shrink-0 px-6">
          <SeekBar onSeek={seek} />
        </div>

        {/* Управление */}
        <div className="flex shrink-0 items-center justify-between px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-1">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label={`Перемешивание ${shuffle ? 'включено' : 'выключено'}`}
            aria-pressed={shuffle}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <Shuffle size={20} strokeWidth={shuffle ? 2.3 : 1.9} className={shuffle ? 'text-[#17181A]' : 'text-[#8B8F99]'} aria-hidden />
          </button>
          <button
            type="button"
            onClick={prev}
            aria-label="Предыдущий трек"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#17181A] transition-transform active:scale-90"
          >
            <SkipBack size={26} className="fill-current" aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={isPlaying ? 'Пауза' : 'Играть'}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD53D] text-[#17181A] shadow-lg shadow-yellow-500/40 transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause size={30} className="fill-[#17181A]" aria-hidden />
            ) : (
              <Play size={30} className="ml-1 fill-[#17181A]" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Следующий трек"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#17181A] transition-transform active:scale-90"
          >
            <SkipForward size={26} className="fill-current" aria-hidden />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={`Повтор: ${repeat === 'off' ? 'выключен' : repeat === 'all' ? 'весь плейлист' : 'один трек'}`}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            {repeat === 'one' ? (
              <Repeat1 size={20} strokeWidth={2.3} className="text-[#17181A]" aria-hidden />
            ) : (
              <Repeat size={20} strokeWidth={repeat === 'all' ? 2.3 : 1.9} className={repeat === 'all' ? 'text-[#17181A]' : 'text-[#8B8F99]'} aria-hidden />
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Нижний таб-бар
// ---------------------------------------------------------------------------

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      role="tablist"
      aria-label="Разделы Музыки"
      className="z-30 shrink-0 border-t border-[#EBEDF0] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="flex items-stretch">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-transform active:scale-95"
            >
              <t.icon
                size={22}
                strokeWidth={active ? 2.2 : 1.8}
                className={active ? 'text-[#17181A]' : 'text-[#8B8F99]'}
                aria-hidden
              />
              <span className={'text-[10px] leading-none ' + (active ? 'font-semibold text-[#17181A]' : 'text-[#8B8F99]')}>
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Корневой компонент приложения «Музыка»
// ---------------------------------------------------------------------------

export default function MusicApp() {
  const [tab, setTab] = useState<Tab>('home')
  const [playerOpen, setPlayerOpen] = useState(false)

  // Лайки + версия кэша обложек (для перерасчёта «Мне нравится»).
  const likeStore = useLikes()
  const [cacheVersion, setCacheVersion] = useState(0)
  const bumpCache = useCallback(() => setCacheVersion((v) => v + 1), [])
  const likesApi = useMemo<LikesApi>(() => ({ isLiked: likeStore.isLiked, toggle: likeStore.toggle }), [likeStore.isLiked, likeStore.toggle])

  // Статистика прослушиваний: +1 плей при смене current (глобальный плеер).
  const currentId = usePlayer((s) => s.current?.id ?? null)
  useEffect(() => {
    if (!currentId) return
    const t = usePlayer.getState().current
    if (t && t.id === currentId) recordPlay(t)
  }, [currentId])

  // Главная: загрузка при маунте + рефреш при возврате на вкладку, если >5 мин.
  const [homeSections, setHomeSections] = useState<MusicSection[]>([])
  const [homeState, setHomeState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [homeLoadedAt, setHomeLoadedAt] = useState(0)
  const homeAbort = useRef<AbortController | null>(null)

  const loadHome = useCallback(async () => {
    homeAbort.current?.abort()
    const ctrl = new AbortController()
    homeAbort.current = ctrl
    setHomeState((s) => (s === 'ready' ? 'ready' : 'loading'))
    try {
      const res = await fetch('/api/music/home', { signal: ctrl.signal })
      if (!res.ok) throw new Error(`home ${res.status}`)
      const data = (await res.json()) as HomeData
      if (ctrl.signal.aborted) return
      const sections = Array.isArray(data.sections) ? data.sections : []
      setHomeSections(sections)
      setHomeState('ready')
      setHomeLoadedAt(Date.now())
      if (cacheTracks(sections.flatMap((s) => s.tracks))) bumpCache()
    } catch {
      if (!ctrl.signal.aborted) setHomeState('error')
    }
  }, [bumpCache])

  useEffect(() => {
    if (tab !== 'home') return
    if (homeLoadedAt !== 0 && Date.now() - homeLoadedAt <= HOME_TTL_MS) return
    void loadHome()
  }, [tab, homeLoadedAt, loadHome])

  useEffect(() => () => homeAbort.current?.abort(), [])

  // Поиск: запрос, результаты, недавние. Живёт на уровне приложения,
  // чтобы запрос не сбрасывался при переключении вкладок.
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Track[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [searchNonce, setSearchNonce] = useState(0)
  const [recent, setRecent] = useState<string[]>([])
  const searchAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    setRecent(lsGet<string[]>(LS.recent, []))
  }, [])

  // Дебаунс 350мс + AbortController.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      searchAbort.current?.abort()
      setSearchResults([])
      setSearchState('idle')
      return
    }
    setSearchState('loading')
    const timer = setTimeout(() => {
      searchAbort.current?.abort()
      const ctrl = new AbortController()
      searchAbort.current = ctrl
      fetch(`/api/music/search?q=${encodeURIComponent(q)}&limit=30`, { signal: ctrl.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`search ${r.status}`)
          return r.json() as Promise<{ tracks: Track[] }>
        })
        .then((data) => {
          if (ctrl.signal.aborted) return
          const list = Array.isArray(data.tracks) ? data.tracks : []
          setSearchResults(list)
          setSearchState('done')
          if (cacheTracks(list)) bumpCache()
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setSearchState('error')
        })
    }, 350)
    return () => clearTimeout(timer)
  }, [query, searchNonce, bumpCache])

  useEffect(() => () => searchAbort.current?.abort(), [])

  const saveRecent = useCallback((raw: string) => {
    const v = raw.trim()
    if (v.length < 2) return
    setRecent((prev) => {
      const next = [v, ...prev.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, RECENT_MAX)
      lsSet(LS.recent, next)
      return next
    })
  }, [])

  const onSuggestion = useCallback(
    (chip: string) => {
      saveRecent(chip)
      setQuery(chip)
    },
    [saveRecent],
  )

  const onSubmit = useCallback(() => saveRecent(query), [saveRecent, query])

  const onClearRecent = useCallback(() => {
    setRecent([])
    lsSet(LS.recent, [])
  }, [])

  // «Мне нравится» — треки, восстановленные из кэша обложек.
  const likedTracks = useMemo(() => {
    const cache = lsGet<TrackCache>(LS.cache, {})
    // cacheVersion — триггер перерасчёта после cacheTracks().
    return likeStore.likes.map((id) => cache[id]).filter((t): t is Track => !!t)
  }, [likeStore.likes, cacheVersion])

  const playQueue = usePlayer((s) => s.playQueue)
  const onPlay = useCallback((tracks: Track[], i: number) => playQueue(tracks, i), [playQueue])

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#F5F6F8] text-[#17181A]">
      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'home' && (
          <HomeScreen state={homeState} sections={homeSections} likes={likesApi} onPlay={onPlay} onRetry={() => void loadHome()} />
        )}
        {tab === 'chart' && (
          <ChartScreen state={homeState} sections={homeSections} likes={likesApi} onPlay={onPlay} onRetry={() => void loadHome()} />
        )}
        {tab === 'search' && (
          <SearchScreen
            query={query}
            onQuery={setQuery}
            results={searchResults}
            state={searchState}
            recent={recent}
            onSuggestion={onSuggestion}
            onClearRecent={onClearRecent}
            onSubmit={onSubmit}
            onRetry={() => setSearchNonce((n) => n + 1)}
            likes={likesApi}
            onPlay={onPlay}
          />
        )}
        {tab === 'library' && (
          <LibraryScreen likedTracks={likedTracks} likes={likesApi} onCacheBump={bumpCache} onPlay={onPlay} />
        )}
      </main>

      <MiniPlayer onOpen={() => setPlayerOpen(true)} likes={likesApi} />
      <TabBar tab={tab} onChange={setTab} />

      <AnimatePresence>{playerOpen && <FullPlayer onClose={() => setPlayerOpen(false)} likes={likesApi} />}</AnimatePresence>
    </div>
  )
}
