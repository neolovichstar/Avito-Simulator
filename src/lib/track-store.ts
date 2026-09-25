import type { Track } from '@/lib/music-types'

/**
 * КОМПАКТНОЕ ХРАНЕНИЕ ТРЕКОВ (localStorage).
 *
 * Полный Track в JSON — это ~700–900 байт: два длинных URL обложек, streamUrl,
 * plays, handle. В хранилище держим только то, что НЕЛЬЗЯ вывести из id, а при
 * чтении восстанавливаем остальное:
 *
 *   streamUrl → всегда `/api/music/stream?id=...` (same-origin прокси, см. audius.ts);
 *   artwork   → 480x480 выводится из 150x150 заменой размера в URL
 *               (паттерн контент-нод Audius: .../150x150.jpg → .../480x480.jpg);
 *   handle    → в UI не используется.
 *
 * Экономия ~4x: очередь плеера и кэш треков перестают забивать хранилище.
 */

/** Формат в localStorage: короткие ключи, только непроизводные поля. */
export interface CompactTrack {
  /** id трека. */
  i: string
  /** Название. */
  t: string
  /** Артист. */
  a: string
  /** Полная длительность, сек. */
  d: number
  /** Обложка 150x150 (480x480 выводится из неё). */
  c: string
  /** Дата релиза YYYY-MM-DD. */
  r?: string
  /** Жанр. */
  g?: string
  /** Прослушивания (подпись «12K»). */
  p?: number
}

const STREAM_PATH = '/api/music/stream?id='

/** Same-origin потоковый URL — единственный источник истины (см. audius.ts). */
export function streamUrlFor(id: string): string {
  return `${STREAM_PATH}${encodeURIComponent(id)}`
}

/** 150x150 → 480x480; если размер в URL не встречается — отдаём как есть. */
export function upgradeArtwork(small: string): string {
  if (!small) return ''
  return small.includes('150x150') ? small.replace('150x150', '480x480') : small
}

/** Track → компактная запись для localStorage. */
export function toCompactTrack(t: Track): CompactTrack {
  const c: CompactTrack = {
    i: t.id,
    t: t.title,
    a: t.artist,
    d: Math.round(t.duration || 0),
    c: t.artworkSmall || t.artwork || '',
  }
  if (t.releaseDate) c.r = t.releaseDate
  if (t.genre) c.g = t.genre
  if (typeof t.plays === 'number' && t.plays > 0) c.p = t.plays
  return c
}

/** Компактная запись → полный Track (производные поля восстанавливаются). */
export function fromCompactTrack(c: CompactTrack): Track {
  return {
    id: c.i,
    title: c.t,
    artist: c.a,
    artwork: upgradeArtwork(c.c),
    artworkSmall: c.c,
    duration: c.d,
    streamUrl: streamUrlFor(c.i),
    releaseDate: c.r,
    genre: c.g,
    plays: c.p,
  }
}

type AnyRecord = Record<string, unknown>

function looksCompact(v: AnyRecord): boolean {
  return typeof v.i === 'string' && typeof v.t === 'string'
}

function looksLegacyTrack(v: AnyRecord): boolean {
  return typeof v.id === 'string' && typeof v.title === 'string' && typeof v.artist === 'string'
}

/**
 * Гидратация записи из хранилища: понимает компактный v2 и старый полный v1
 * (миграция на лету, без очистки данных пользователя). null — мусор.
 */
export function hydrateTrackRecord(raw: unknown): Track | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as AnyRecord
  if (looksCompact(v)) return fromCompactTrack(v as unknown as CompactTrack)
  if (looksLegacyTrack(v)) {
    const id = v.id as string
    const small = (v.artworkSmall as string) || (v.artwork as string) || ''
    return {
      id,
      title: v.title as string,
      artist: v.artist as string,
      artwork: (v.artwork as string) || small,
      artworkSmall: small,
      duration: typeof v.duration === 'number' ? v.duration : 0,
      streamUrl: typeof v.streamUrl === 'string' && v.streamUrl ? v.streamUrl : streamUrlFor(id),
      releaseDate: typeof v.releaseDate === 'string' ? v.releaseDate : undefined,
      genre: typeof v.genre === 'string' ? v.genre : undefined,
      plays: typeof v.plays === 'number' ? v.plays : undefined,
    }
  }
  return null
}

/**
 * Запись JSON с защитой от переполнения квоты: первая попытка «как есть»,
 * при QuotaExceeded освобождаем вторичные ключи (evictKeys) и пробуем снова.
 */
export function persistJson(key: string, value: unknown, evictKeys: string[] = []): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    for (const k of evictKeys) {
      try {
        window.localStorage.removeItem(k)
      } catch {
        /* noop */
      }
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  }
}
