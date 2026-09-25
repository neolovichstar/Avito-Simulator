'use client'

/**
 * ГЛОБАЛЬНЫЙ АУДИОДВИЖОК ОС «Resale».
 *
 * Живёт на уровне модуля (не в React-дереве), поэтому музыка НЕ прерывается:
 *  - при закрытии приложения «Музыка» (выход на дом-экран);
 *  - при открытии любого другого приложения;
 *  - при сворачивании мини-аппа (пока жив webview Telegram);
 *  - при блокировке экрана телефона (audio-сессия остаётся активной).
 *
 * Интеграция с ОС через MediaSession API: системный виджет «Сейчас играет»
 * в шторке уведомлений Android / на локскрине iOS с кнопками
 * play/pause/next/prev и ползунком позиции.
 *
 * Состояние переживает перезагрузку страницы: очередь и настройки
 * восстанавливаются из localStorage (без автовоспроизведения — его
 * блокирует браузер до первого жеста пользователя).
 */

import { create } from 'zustand'
import type { Track } from '@/lib/music-types'

export type RepeatMode = 'off' | 'all' | 'one'

const PERSIST_KEY = 'resale_player_v1'
const PERSIST_MAX_QUEUE = 80
const SAVE_THROTTLE_MS = 900

interface PlayerState {
  /** Текущий трек (восстанавливается после перезагрузки — без звука до жеста). */
  current: Track | null
  queue: Track[]
  index: number
  isPlaying: boolean
  /** Секунды. */
  position: number
  /** Секунды — из реального audio.duration. */
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  /** Ошибка воспроизведения конкретного трека (не блокирует очередь). */
  trackError: boolean

  playQueue: (tracks: Track[], startIndex?: number) => void
  toggle: () => void
  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
  seek: (t: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
}

// ---------------------------------------------------------------------------
// Инженерная часть — единственный HTMLAudioElement на всё приложение.
// ---------------------------------------------------------------------------

interface Engine {
  audio: HTMLAudioElement | null
  queue: Track[]
  index: number
  history: number[]
  errorTimer: ReturnType<typeof setTimeout> | null
  saveTimer: ReturnType<typeof setTimeout> | null
  /** id трека, которому уже делали тихую перезагрузку (одна попытка на трек). */
  retriedId: string | null
}

const eng: Engine = {
  audio: null,
  queue: [],
  index: -1,
  history: [],
  errorTimer: null,
  saveTimer: null,
  retriedId: null,
}

const g = globalThis as unknown as { __resaleAudio?: HTMLAudioElement }

function ensureAudio(): HTMLAudioElement {
  if (g.__resaleAudio) {
    eng.audio = g.__resaleAudio
    return g.__resaleAudio
  }
  const a = new Audio()
  a.preload = 'auto'
  a.volume = 1
  g.__resaleAudio = a
  eng.audio = a

  a.addEventListener('timeupdate', () => {
    usePlayer.setState({ position: a.currentTime })
  })
  a.addEventListener('loadedmetadata', () => {
    // duration из файла точнее метаданных трека (remix-длина и т.п.)
    if (Number.isFinite(a.duration) && a.duration > 0) {
      usePlayer.setState({ duration: a.duration })
    }
  })
  a.addEventListener('playing', () => {
    usePlayer.setState({ isPlaying: true, trackError: false })
    syncMediaSession()
  })
  a.addEventListener('pause', () => {
    usePlayer.setState({ isPlaying: false })
    syncMediaSession()
  })
  a.addEventListener('ended', () => {
    handleEnded()
  })
  a.addEventListener('error', () => {
    const st = usePlayer.getState()
    if (!st.current) return
    // Первая ошибка: контент-нода могла моргнуть — тихо перезагружаем поток через 800мс.
    if (eng.retriedId !== st.current.id) {
      eng.retriedId = st.current.id
      const sep = st.current.streamUrl.includes('?') ? '&' : '?'
      a.src = `${st.current.streamUrl}${sep}r=${Date.now()}`
      a.load()
      eng.errorTimer = setTimeout(() => {
        eng.errorTimer = null
        void a.play().catch(() => usePlayer.setState({ isPlaying: false }))
      }, 800)
      return
    }
    // Вторая ошибка на том же треке — пропускаем.
    usePlayer.setState({ trackError: true, isPlaying: false })
    if (eng.errorTimer) clearTimeout(eng.errorTimer)
    eng.errorTimer = setTimeout(() => {
      eng.errorTimer = null
      if (usePlayer.getState().trackError) usePlayer.getState().next()
    }, 1500)
  })

  setupMediaSession()
  return a
}

function load(track: Track, autoplay: boolean) {
  const a = ensureAudio()
  eng.retriedId = null
  if (eng.errorTimer) {
    clearTimeout(eng.errorTimer)
    eng.errorTimer = null
  }
  usePlayer.setState({
    current: track,
    position: 0,
    duration: track.duration > 0 ? track.duration : 0,
    trackError: false,
  })
  // streamUrl отдаёт 302 на mp3 контент-ноды — audio-элемент следует редиректу.
  a.src = track.streamUrl
  a.load()
  if (autoplay) {
    void a.play().catch(() => {
      // Автоплей заблокирован политикой браузера (нет жеста) — тихо ставим на паузу.
      usePlayer.setState({ isPlaying: false })
    })
  }
  syncMediaSession()
  scheduleSave()
}

function handleEnded() {
  const { repeat, next } = usePlayer.getState()
  if (repeat === 'one') {
    const a = ensureAudio()
    a.currentTime = 0
    void a.play().catch(() => {})
    return
  }
  next()
}

// ---------------------------------------------------------------------------
// Персистентность: очередь/настройки переживают перезагрузку страницы.
// ---------------------------------------------------------------------------

function scheduleSave() {
  if (eng.saveTimer) clearTimeout(eng.saveTimer)
  eng.saveTimer = setTimeout(() => {
    eng.saveTimer = null
    try {
      const { queue, index, shuffle, repeat } = usePlayer.getState()
      const payload = {
        queue: queue.slice(0, PERSIST_MAX_QUEUE),
        index: Math.min(index, PERSIST_MAX_QUEUE - 1),
        shuffle,
        repeat,
      }
      localStorage.setItem(PERSIST_KEY, JSON.stringify(payload))
    } catch {
      /* приватный режим — переживаем без сохранения */
    }
  }, SAVE_THROTTLE_MS)
}

function restore(): void {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return
    const p = JSON.parse(raw) as {
      queue?: Track[]
      index?: number
      shuffle?: boolean
      repeat?: RepeatMode
    }
    if (!Array.isArray(p.queue) || p.queue.length === 0) return
    const queue = p.queue.filter((t) => t && typeof t.id === 'string' && typeof t.streamUrl === 'string')
    if (!queue.length) return
    const index = Math.max(0, Math.min(p.index ?? 0, queue.length - 1))
    eng.queue = queue
    eng.index = index
    usePlayer.setState({
      queue,
      index,
      current: queue[index] ?? null,
      isPlaying: false,
      shuffle: p.shuffle === true,
      repeat: p.repeat === 'all' || p.repeat === 'one' ? p.repeat : 'off',
    })
  } catch {
    /* битый localStorage — начинаем с пустой очереди */
  }
}

// ---------------------------------------------------------------------------
// MediaSession — системный виджет «Сейчас играет» (шторка Android / локскрин iOS).
// ---------------------------------------------------------------------------

type MediaNav = Navigator & {
  mediaSession?: {
    metadata: unknown
    playbackState: string
    setActionHandler: (action: string, handler: ((d?: unknown) => void) | null) => void
  }
  MediaMetadata?: new (init: {
    title: string
    artist?: string
    album?: string
    artwork?: { src: string; sizes?: string; type?: string }[]
    // DOM-тип MediaMetadata (а не unknown), чтобы присваивание в mediaSession.metadata тайп-чекалось.
  }) => MediaMetadata
}

function syncMediaSession() {
  const nav = navigator as MediaNav
  if (!nav.mediaSession || !nav.MediaMetadata) return
  const { current, isPlaying, position, duration } = usePlayer.getState()
  try {
    if (current) {
      nav.mediaSession.metadata = new nav.MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: 'Resale · Музыка',
        artwork: [
          { src: current.artworkSmall || current.artwork, sizes: '150x150', type: 'image/jpeg' },
          { src: current.artwork, sizes: '480x480', type: 'image/jpeg' },
        ],
      })
    }
    nav.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    if ('setPositionState' in nav.mediaSession) {
      const ms = nav.mediaSession as unknown as {
        setPositionState?: (s: { duration: number; playbackRate: number; position: number }) => void
      }
      ms.setPositionState?.({
        duration: duration > 0 ? duration : 1,
        playbackRate: 1,
        position: Math.min(position, duration > 0 ? duration : position),
      })
    }
  } catch {
    /* старый webview без MediaSession — просто без системного виджета */
  }
}

function setupMediaSession() {
  const nav = navigator as MediaNav
  if (!nav.mediaSession) return
  const st = () => usePlayer.getState()
  const handlers: Record<string, (d?: unknown) => void> = {
    play: () => st().play(),
    pause: () => st().pause(),
    nexttrack: () => st().next(),
    previoustrack: () => st().prev(),
    seekto: (d) => {
      const t = (d as { seekTime?: number } | undefined)?.seekTime
      if (typeof t === 'number') st().seek(t)
    },
    seekbackward: () => st().seek(Math.max(0, usePlayer.getState().position - 10)),
    seekforward: () => {
      const { position, duration } = st()
      st().seek(Math.min(duration > 0 ? duration - 1 : position + 10, position + 10))
    },
  }
  for (const [action, fn] of Object.entries(handlers)) {
    try {
      nav.mediaSession.setActionHandler(action, fn)
    } catch {
      /* действие не поддерживается этим клиентом */
    }
  }
}

// Восстанавливаем очередь сразу при загрузке модуля (клиент).
if (typeof window !== 'undefined') {
  restore()
}

// ---------------------------------------------------------------------------
// Zustand-стор: единственный источник правды для всех UI (приложение,
// шторка уведомлений, мини-плеер на дом-экране).
// ---------------------------------------------------------------------------

export const usePlayer = create<PlayerState>((set, get) => ({
  current: eng.queue[eng.index] ?? null,
  queue: eng.queue,
  index: eng.index,
  isPlaying: false,
  position: 0,
  duration: eng.queue[eng.index]?.duration ?? 0,
  shuffle: false,
  repeat: 'off',
  trackError: false,

  playQueue: (tracks, startIndex = 0) => {
    if (!tracks.length) return
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1))
    eng.queue = tracks
    eng.index = idx
    eng.history = []
    set({ queue: tracks, index: idx })
    load(tracks[idx], true)
  },

  toggle: () => {
    const { isPlaying } = get()
    if (isPlaying) get().pause()
    else get().play()
  },

  play: () => {
    const { current, queue, index } = get()
    const a = ensureAudio()
    if (!current && queue.length) {
      // Восстановленная после перезагрузки очередь: стартуем с сохранённого трека.
      load(queue[index], true)
      return
    }
    if (!current) return
    if (!a.src) {
      load(current, true)
      return
    }
    void a.play().catch(() => set({ isPlaying: false }))
  },

  pause: () => {
    const a = ensureAudio()
    a.pause()
    set({ isPlaying: false })
    syncMediaSession()
  },

  next: () => {
    const { queue, index, shuffle } = get()
    if (!queue.length) return
    let nextIdx: number
    if (shuffle && queue.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * queue.length)
      } while (nextIdx === index)
    } else {
      nextIdx = index + 1
    }
    if (nextIdx >= queue.length) {
      if (get().repeat === 'all') nextIdx = 0
      else {
        // Конец очереди: останавливаемся на первом треке без звука.
        set({ index: 0, isPlaying: false, position: 0 })
        const a = ensureAudio()
        a.pause()
        return
      }
    }
    if (shuffle) eng.history.push(index)
    eng.index = nextIdx
    set({ index: nextIdx })
    load(queue[nextIdx], true)
  },

  prev: () => {
    const { queue, index } = get()
    if (!queue.length) return
    // Стандартное поведение: >3с прослушано — перемотка в начало.
    const a = ensureAudio()
    if (a.currentTime > 3) {
      a.currentTime = 0
      set({ position: 0 })
      return
    }
    let prevIdx: number
    if (get().shuffle && eng.history.length) {
      prevIdx = eng.history.pop() ?? Math.max(0, index - 1)
    } else {
      prevIdx = index - 1
      if (prevIdx < 0) prevIdx = get().repeat === 'all' ? queue.length - 1 : 0
    }
    eng.index = prevIdx
    set({ index: prevIdx })
    load(queue[prevIdx], true)
  },

  seek: (t) => {
    const a = ensureAudio()
    if (!Number.isFinite(t)) return
    try {
      a.currentTime = Math.max(0, t)
      set({ position: Math.max(0, t) })
    } catch {
      /* seek до загрузки метаданных — игнорируем */
    }
  },

  toggleShuffle: () => {
    set((s) => {
      if (s.shuffle) eng.history = []
      return { shuffle: !s.shuffle }
    })
    scheduleSave()
  },

  cycleRepeat: () => {
    set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' }))
    scheduleSave()
  },
}))
