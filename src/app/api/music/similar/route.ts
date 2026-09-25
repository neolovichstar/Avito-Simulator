import { NextResponse } from 'next/server'
import { trending, searchTracks, seededShuffle, cached } from '@/lib/audius'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Рекомендации «Сделано для вас»: по топ-артистам и жанрам из статистики
 * прослушиваний клиента. Возвращаем полные треки, стабильные между запросами.
 * Параметры: artists=Имя1,Имя2&genres=Pop,Rock&exclude=id1,id2
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const artists = (searchParams.get('artists') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
  const genres = (searchParams.get('genres') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
  const exclude = new Set((searchParams.get('exclude') ?? '').split(',').map((s) => s.trim()).filter(Boolean))

  const key = `sim:${artists.join('|')}:${genres.join('|')}`
  try {
    const tracks = await cached(key, 10 * 60_000, async () => {
      const perArtist = artists.map((a) => searchTracks(a, 6).catch(() => []))
      const perGenre = genres.map((g) => trending(g, 'month', 12).catch(() => []))
      const res = await Promise.allSettled([...perArtist, ...perGenre])
      const merged = new Map<string, Awaited<ReturnType<typeof searchTracks>>[number]>()
      for (const r of res) {
        if (r.status !== 'fulfilled') continue
        for (const t of r.value) {
          if (exclude.has(t.id) || merged.has(t.id)) continue
          merged.set(t.id, t)
        }
      }
      const list = [...merged.values()]
      if (!list.length) return []
      return seededShuffle(list, key).slice(0, 24)
    })
    return NextResponse.json({ tracks })
  } catch (e) {
    console.error('[music/similar] failed', e)
    return NextResponse.json({ tracks: [] })
  }
}
