// Рекомендации «Сделано для вас»: по топ-артистам и топ-жанрам слушателя
// (считаются на клиенте из статистики прослушиваний/лайков) ищем похожее в iTunes.
// Дедуп по trackId, детерминированный шаффл по ключу, кэш 10 мин.

import { cached, dedupeTracks, fetchItunes, type Track } from '@/lib/music-types'

export const dynamic = 'force-dynamic'

const SIMILAR_TTL_MS = 10 * 60 * 1000
const MAX_PER_QUERY = 8
const CAP = 24

function parseList(raw: string | null, max: number): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — детерминированный шаффл: одинаковый вход → одинаковый порядок. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr]
  let a = hashString(seed) || 1
  const rnd = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const artists = parseList(url.searchParams.get('artists'), 3)
  const genres = parseList(url.searchParams.get('genres'), 3)

  if (artists.length === 0 && genres.length === 0) {
    return Response.json({ tracks: [] })
  }

  const key = `similar:${artists.map((a) => a.toLowerCase()).join('|')}:${genres.map((g) => g.toLowerCase()).join('|')}`

  try {
    const queries: { term: string }[] = [
      ...artists.map((a) => ({ term: a })),
      ...genres.map((g) => ({ term: `${g.replace(/\//g, ' ')} hits` })),
    ]
    const results = await Promise.allSettled(
      queries.map((q) =>
        cached<Track[]>(`similar:${q.term.toLowerCase()}:${MAX_PER_QUERY}`, SIMILAR_TTL_MS, () =>
          fetchItunes(q.term, MAX_PER_QUERY),
        ),
      ),
    )
    const merged = dedupeTracks(
      ...results.map((r) => (r.status === 'fulfilled' ? r.value : [])),
    )
    const tracks = seededShuffle(merged, key).slice(0, CAP)
    return Response.json({ tracks })
  } catch {
    return Response.json({ tracks: [] })
  }
}
