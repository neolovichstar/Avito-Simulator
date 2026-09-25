/**
 * Серверный клиент Audius API — источник ПОЛНЫХ треков (не превью) без ключей.
 * Только сервер: вызывается из /api/music/* (next route handlers).
 */

export interface Track {
  id: string
  title: string
  artist: string
  handle?: string
  /** Обложка 480x480. */
  artwork: string
  /** Обложка 150x150 (мини-плеер, шторка). */
  artworkSmall: string
  /** Полная длительность в секундах (это не 30-секундное превью). */
  duration: number
  /** Прямой поток (302 → mp3 контент-ноды), играет в <audio> как есть. */
  streamUrl: string
  releaseDate?: string
  plays?: number
  genre?: string
}

export interface MusicSection {
  key: string
  title: string
  subtitle?: string
  tracks: Track[]
}

export interface HomeData {
  sections: MusicSection[]
}

const HOST = 'https://discoveryprovider.audius.co'
const APP_NAME = 'resale'
const TIMEOUT_MS = 9000

// Кэш переживает HMR (globalThis): 200 ключей, разные TTL.
const store = globalThis as unknown as { __audiusCache?: Map<string, { t: number; v: unknown }> }
const cache = (store.__audiusCache ??= new Map())

export function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && now - hit.t < ttlMs) return Promise.resolve(hit.v as T)
  return loader()
    .then((v) => {
      if (cache.size > 200) cache.clear()
      cache.set(key, { t: now, v })
      return v
    })
    .catch((e) => {
      // Упавший апстрим не должен кэшироваться — при следующем запросе пробуем снова.
      throw e
    })
}

async function audiusJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${HOST}${path}`)
  url.searchParams.set('app_name', APP_NAME)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`audius ${path} → ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

interface RawAudiusTrack {
  id?: string
  title?: string
  duration?: number
  release_date?: string
  play_count?: number
  genre?: string
  is_streamable?: boolean
  is_available?: boolean
  is_delete?: boolean
  artwork?: Record<string, string>
  user?: { name?: string; handle?: string }
}

/** Поле обложки по приоритету размеров. */
function art(artwork: Record<string, string> | undefined, size: '150x150' | '480x480'): string {
  if (!artwork) return ''
  return artwork[size] || artwork['150x150'] || artwork['480x480'] || artwork['1000x1000'] || ''
}

/** Нормализация сырого трека Audius → наш Track (или null, если не годится). */
function normalize(raw: RawAudiusTrack): Track | null {
  if (!raw?.id || !raw.title) return null
  if (raw.is_streamable === false || raw.is_available === false || raw.is_delete === true) return null
  const artwork = art(raw.artwork, '480x480')
  const artworkSmall = art(raw.artwork, '150x150')
  if (!artwork && !artworkSmall) return null
  const duration = Number(raw.duration) || 0
  // «Песни, а не вразнобой»: режем часовые DJ-сеты и подкасты, оставляем треки 0:30..12:00.
  if (duration < 30 || duration > 720) return null
  if (/podcast|mix\s*#|dj set|radio \d+/i.test(raw.title)) return null
  return {
    id: raw.id,
    title: raw.title.trim(),
    artist: (raw.user?.name || raw.user?.handle || 'Неизвестный артист').trim(),
    handle: raw.user?.handle,
    artwork: artwork || artworkSmall,
    artworkSmall: artworkSmall || artwork,
    duration,
    // same-origin прокси: решает 302/CORS/недоступность контент-нод из webview.
    streamUrl: `/api/music/stream?id=${raw.id}`,
    releaseDate: raw.release_date?.slice(0, 10) || undefined,
    plays: typeof raw.play_count === 'number' ? raw.play_count : undefined,
    genre: raw.genre || undefined,
  }
}

/** Дедуп по id и по «title|artist», без прочего мусора. */
export function sanitize(raws: RawAudiusTrack[] | undefined | null): Track[] {
  if (!Array.isArray(raws)) return []
  const seen = new Set<string>()
  const out: Track[] = []
  for (const raw of raws) {
    const t = normalize(raw)
    if (!t) continue
    const k1 = t.id
    const k2 = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`
    if (seen.has(k1) || seen.has(k2)) continue
    seen.add(k1)
    seen.add(k2)
    out.push(t)
  }
  return out
}

/** Чарт Audius: time=week|month|year, genre — опционально. */
export async function trending(genre?: string, time = 'week', limit = 20): Promise<Track[]> {
  return cached(`tr:${genre ?? 'all'}:${time}:${limit}`, 20 * 60_000, async () => {
    const params: Record<string, string> = { time, limit: String(Math.max(limit, 40)) }
    if (genre) params.genre = genre
    const json = await audiusJson<{ data: RawAudiusTrack[] }>('/v1/tracks/trending', params)
    return sanitize(json.data).slice(0, limit)
  })
}

/** Поиск по Audius (все языки). */
export async function searchTracks(query: string, limit = 30): Promise<Track[]> {
  return cached(`q:${query.toLowerCase()}:${limit}`, 10 * 60_000, async () => {
    const json = await audiusJson<{ data: RawAudiusTrack[] }>('/v1/tracks/search', {
      query,
      limit: String(Math.min(Math.max(limit, 1), 100)),
    })
    return sanitize(json.data).slice(0, limit)
  })
}

/** Детерминированный шаффл (стабильные подборки между запросами). */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const rand = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
