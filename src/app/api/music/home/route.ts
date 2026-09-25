// Главная Music-приложения: подборки собираются сервером из iTunes Search API.
// Стратегия устойчивости: каждый запрос к iTunes — под 7-секундным таймаутом,
// failed-секция просто пропускается (никогда не 500), всё кэшируется в памяти (TTL 15 мин),
// при полном фиаско — встроенный офлайн-список, чтобы UI всегда рендерился.

import {
  cached,
  dedupeTracks,
  FALLBACK_TRACKS,
  fetchItunes,
  type GenreSection,
  type HomeData,
  type Track,
} from '@/lib/music-types'

export const dynamic = 'force-dynamic'

const HOME_TTL_MS = 15 * 60 * 1000

// Чарт: смесь западных и русских хитов, чтобы в топе были узнаваемые артисты
const CHART_QUERIES: { term: string; limit: number }[] = [
  { term: 'top hits 2025', limit: 8 },
  { term: 'Imagine Dragons', limit: 4 },
  { term: 'Моргенштерн', limit: 4 },
  { term: 'Тима Белорусских', limit: 4 },
]

const NEW_RELEASES_QUERY = { term: 'new music 2025', limit: 12 }

const GENRE_QUERIES: { title: string; term: string }[] = [
  { title: 'Поп', term: 'pop hits' },
  { title: 'Хип-хоп', term: 'hip hop hits' },
  { title: 'Рок', term: 'rock classics' },
  { title: 'Электронная', term: 'electronic dance' },
]

async function loadTracks(cacheKey: string, term: string, limit: number): Promise<Track[]> {
  return cached(cacheKey, HOME_TTL_MS, () => fetchItunes(term, limit))
}

export async function GET() {
  const settled = await Promise.allSettled<Track[]>([
    ...CHART_QUERIES.map((q) => loadTracks(`home:chart:${q.term}:${q.limit}`, q.term, q.limit)),
    loadTracks(`home:new:${NEW_RELEASES_QUERY.term}`, NEW_RELEASES_QUERY.term, NEW_RELEASES_QUERY.limit),
    ...GENRE_QUERIES.map((g) => loadTracks(`home:genre:${g.term}`, g.term, 10)),
  ])

  const takeLists = (from: number, count: number): Track[][] =>
    settled
      .slice(from, from + count)
      .flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))

  const chartCount = CHART_QUERIES.length
  const chart = dedupeTracks(...takeLists(0, chartCount)).slice(0, 15)
  const newReleases = (takeLists(chartCount, 1)[0] ?? []).slice(0, 12)

  const genres: GenreSection[] = []
  const genreResults = settled.slice(chartCount + 1)
  genreResults.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      genres.push({ title: GENRE_QUERIES[i]!.title, tracks: r.value })
    }
  })

  // Сеть целиком недоступна — отдаём офлайн-фолбэк (preview пустой, UI умеет это играть «тихо»)
  if (chart.length === 0 && newReleases.length === 0 && genres.length === 0) {
    const data: HomeData = {
      chart: FALLBACK_TRACKS,
      newReleases: [],
      genres: [{ title: 'Поп', tracks: FALLBACK_TRACKS }],
      offline: true,
    }
    return Response.json(data)
  }

  const data: HomeData = { chart, newReleases, genres }
  return Response.json(data)
}
