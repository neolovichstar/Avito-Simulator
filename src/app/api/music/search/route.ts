// Поиск музыки через iTunes Search API. Без ключей, кэш 10 мин на term.

import { cached, fetchItunes, type Track } from '@/lib/music-types'

export const dynamic = 'force-dynamic'

const SEARCH_TTL_MS = 10 * 60 * 1000

export async function GET(req: Request) {
  const url = new URL(req.url)
  const term = (url.searchParams.get('term') ?? '').trim()
  const limitRaw = Number(url.searchParams.get('limit') ?? 25)
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 25

  if (term.length < 2) return Response.json({ tracks: [] })

  try {
    const tracks = await cached<Track[]>(
      `search:${term.toLowerCase()}:${limit}`,
      SEARCH_TTL_MS,
      () => fetchItunes(term, limit),
    )
    return Response.json({ tracks })
  } catch {
    // iTunes недоступен — пустой результат вместо 500, UI честно скажет «ничего не нашлось»
    return Response.json({ tracks: [] })
  }
}
