// Общие типы и хелперы Music-приложения (Task 20-b).
// Реальная музыка — через бесплатный iTunes Search API (без ключа):
// каждый трек содержит previewUrl — 30-секундный m4a-фрагмент,Playable в браузере.

export interface Track {
  id: number
  title: string
  artist: string
  album: string
  artwork: string
  preview: string
  /** Полная длительность трека в секундах (превью — всегда 30с, см. audio.duration). */
  duration: number
  genre: string
}

export interface GenreSection {
  title: string
  tracks: Track[]
}

export interface HomeData {
  chart: Track[]
  newReleases: Track[]
  genres: GenreSection[]
  /** true — сеть недоступна, отдаём встроенный офлайн-список (preview пуст). */
  offline?: boolean
}

// ---------- Кэш в памяти процесса (globalThis — переживает HMR) ----------

interface CacheEntry {
  ts: number
  data: unknown
}

const GLOBAL_CACHE_KEY = '__resale_music_cache__'
type CacheStore = Map<string, CacheEntry>

function cacheStore(): CacheStore {
  const g = globalThis as typeof globalThis & { [GLOBAL_CACHE_KEY]?: CacheStore }
  if (!g[GLOBAL_CACHE_KEY]) g[GLOBAL_CACHE_KEY] = new Map()
  return g[GLOBAL_CACHE_KEY]
}

export function cacheGet<T>(key: string, ttlMs: number): T | null {
  const entry = cacheStore().get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > ttlMs) {
    cacheStore().delete(key)
    return null
  }
  return entry.data as T
}

export function cacheSet(key: string, data: unknown): void {
  // Ограничиваем размер кэша, чтобы не течь при большом потоке поисковых запросов
  const store = cacheStore()
  if (store.size > 200) {
    const oldest = [...store.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) store.delete(oldest[0])
  }
  store.set(key, { ts: Date.now(), data })
}

/** Обёртка: из кэша по TTL, иначе через loader (ошибки пробрасываются наверх). */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key, ttlMs)
  if (hit) return hit
  const data = await loader()
  cacheSet(key, data)
  return data
}

// ---------- iTunes Search API ----------

interface ItunesResult {
  trackId?: number
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
  previewUrl?: string | null
  trackTimeMillis?: number
  primaryGenreName?: string
}

const ITUNES_TIMEOUT_MS = 7000

export function artwork600(artworkUrl100: string): string {
  return artworkUrl100.replace('100x100bb', '600x600bb')
}

function mapTrack(r: ItunesResult): Track | null {
  if (!r.trackId || !r.trackName || !r.artistName || !r.previewUrl) return null
  return {
    id: r.trackId,
    title: r.trackName,
    artist: r.artistName,
    album: r.collectionName ?? '',
    artwork: r.artworkUrl100 ? artwork600(r.artworkUrl100) : '',
    preview: r.previewUrl,
    duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
    genre: r.primaryGenreName ?? '',
  }
}

/** Поиск в iTunes. Ошибки/таймауты пробрасываются — секции наверху решают, как деградировать. */
export async function fetchItunes(term: string, limit: number): Promise<Track[]> {
  const url =
    'https://itunes.apple.com/search?term=' +
    encodeURIComponent(term) +
    `&media=music&entity=song&limit=${limit}&country=RU&lang=ru_ru`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ITUNES_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`iTunes ${res.status}`)
    const json = (await res.json()) as { results?: ItunesResult[] }
    const seen = new Set<number>()
    const tracks: Track[] = []
    for (const r of json.results ?? []) {
      const t = mapTrack(r)
      if (t && !seen.has(t.id)) {
        seen.add(t.id)
        tracks.push(t)
      }
    }
    return tracks
  } finally {
    clearTimeout(timer)
  }
}

/** Дедупликация по id при склейке нескольких секций/запросов. */
export function dedupeTracks(...lists: Track[][]): Track[] {
  const seen = new Set<number>()
  const out: Track[] = []
  for (const list of lists) {
    for (const t of list) {
      if (!seen.has(t.id)) {
        seen.add(t.id)
        out.push(t)
      }
    }
  }
  return out
}

// ---------- Офлайн-фолбэк (если iTunes недоступен целиком) ----------

export const FALLBACK_TRACKS: Track[] = [
  { id: -1, title: 'Ночной ветер', artist: 'Тень Города', album: 'Бетон и неон', artwork: '', preview: '', duration: 214, genre: 'Инди' },
  { id: -2, title: 'Первый продан', artist: 'Флиппер', album: 'Гараж', artwork: '', preview: '', duration: 243, genre: 'Рок' },
  { id: -3, title: 'Тихий двор', artist: 'Марта Ветрова', album: 'Лето внутри', artwork: '', preview: '', duration: 201, genre: 'Поп' },
  { id: -4, title: 'Скорость шестьдесят', artist: 'Асфальт 7', album: 'Трасса', artwork: '', preview: '', duration: 226, genre: 'Рок' },
  { id: -5, title: 'Утренний автобус', artist: 'Вокзал Юг', album: 'Вокзал Юг', artwork: '', preview: '', duration: 259, genre: 'Инди' },
  { id: -6, title: 'Кассеты 90', artist: 'Кассеты 90', album: 'Аналог', artwork: '', preview: '', duration: 187, genre: 'Электронная' },
]
