'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ГЛОБАЛЬНАЯ МЕДИА-ГРОМКОСТЬ ОС «Resale» (Android 17 style).
//
// Единый источник истины для громкости музыки: приложение «Музыка», центр
// управления, настройки и системная плашка громкости (VolumePlate) читают
// и пишут сюда. Значение персистится в localStorage и применяется напрямую
// к глобальному <audio> движку плеера (src/lib/player.ts держит его в
// globalThis.__resaleAudio — ссылка доступна и отсюда, трогать player.ts не нужно).
//
// Дефолт — 50%: раньше движок играл на 100% («на фулл громкость пипец»).
//
// Плашка: любое изменение громкости дёргает bumpPlate() → VolumePlate
// показывает Android-слайдер у правого края экрана и прячет через 2.2с.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'

const STORAGE_KEY = 'resale_media_volume_v1'
const DEFAULT_VOLUME = 0.5

interface VolumeState {
  /** 0..1 — множитель громкости медиа-движка (поверх системной громкости). */
  volume: number
  /** Метка времени последнего изменения — триггер для VolumePlate. */
  plateAt: number
  /** Скрыта ли плашка принудительно (тап мимо неё). */
  plateHidden: boolean
  setVolume: (v: number) => void
  nudgeVolume: (delta: number) => void
  bumpPlate: () => void
  hidePlate: () => void
}

function loadInitial(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw != null) {
      const v = Number(raw)
      if (Number.isFinite(v)) return Math.min(1, Math.max(0, v))
    }
  } catch {
    /* приватный режим */
  }
  return DEFAULT_VOLUME
}

function applyToEngine(v: number) {
  // Аудио-элемент создаётся лениво при первом воспроизведении — поэтому
  // применяем и по подписи на usePlayer (см. initVolumeEngineBridge), и здесь.
  const g = globalThis as unknown as { __resaleAudio?: HTMLAudioElement | null }
  const a = g.__resaleAudio
  if (a) {
    try {
      a.volume = Math.min(1, Math.max(0, v))
    } catch {
      /* элемент в некорректном состоянии — не критично */
    }
  }
}

export const useVolume = create<VolumeState>((set, get) => ({
  volume: DEFAULT_VOLUME,
  plateAt: 0,
  plateHidden: false,

  setVolume: (v) => {
    const clamped = Math.min(1, Math.max(0, v))
    set({ volume: clamped, plateAt: Date.now(), plateHidden: false })
    applyToEngine(clamped)
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped))
    } catch {
      /* приватный режим — держим в памяти */
    }
  },

  nudgeVolume: (delta) => {
    get().setVolume(get().volume + delta)
  },

  bumpPlate: () => {
    set({ plateAt: Date.now(), plateHidden: false })
  },

  hidePlate: () => set({ plateHidden: true }),
}))

/** Начальная громкость из localStorage (без записи — только чтение). */
export function hydrateVolume() {
  const v = loadInitial()
  useVolume.setState({ volume: v })
  applyToEngine(v)
}

// ─────────────────────────────────────────────────────────────────────────────
// Мост к аудио-движку: player.ts создаёт <audio> лениво и ставит volume=1.
// Мы применяем сохранённую громкость при каждом изменении состояния плеера
// (в т.ч. «playing» — сразу после создания элемента) и по интервалу-страховке.
// player.ts НЕ трогаем (требование изоляции) — работаем через globalThis.
// ─────────────────────────────────────────────────────────────────────────────

let bridged = false

export function initVolumeEngineBridge() {
  if (bridged || typeof window === 'undefined') return
  bridged = true

  const apply = () => applyToEngine(useVolume.getState().volume)

  // 1) Подписка на любые изменения плеера (создание элемента, старт трека).
  try {
    // Динамический импорт — чтобы volume.ts не тянул player.ts в критический путь.
    void import('@/lib/player').then(({ usePlayer }) => {
      usePlayer.subscribe(apply)
      apply()
    })
  } catch {
    /* плеер недоступен — громкость применится только через setVolume */
  }

  // 2) Страховочный интервал первые 30 секунд (на случай гонки с ленивым <audio>).
  let ticks = 0
  const iv = setInterval(() => {
    apply()
    ticks += 1
    if (ticks > 30) clearInterval(iv)
  }, 1000)

  // 3) Клавиатура ПК/Android-TV: стрелки ↑↓ меняют медиа-громкость с плашкой,
  //    как физические качельки громкости. В Telegram webview клавиатурных
  //    событий от качелек нет, зато на десктопе это ровно тот же UX.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey || isMediaContext())) {
        e.preventDefault()
        useVolume.getState().nudgeVolume(0.05)
      } else if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey || isMediaContext())) {
        e.preventDefault()
        useVolume.getState().nudgeVolume(-0.05)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Даже без модификаторов: если музыка играет — стрелки = громкость.
        if (isMediaPlaying()) {
          e.preventDefault()
          useVolume.getState().nudgeVolume(e.key === 'ArrowUp' ? 0.05 : -0.05)
        }
      }
    },
    { passive: false },
  )
}

function isMediaContext(): boolean {
  return true
}

function isMediaPlaying(): boolean {
  const g = globalThis as unknown as { __resaleAudio?: HTMLAudioElement | null }
  return !!g.__resaleAudio && !g.__resaleAudio.paused
}
