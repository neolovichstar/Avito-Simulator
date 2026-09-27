import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { stripEmoji } from '@/lib/format'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const searches = await db.savedSearch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return Response.json({
    searches: searches.map((s) => ({
      id: s.id,
      query: s.query,
      category: s.category,
      createdAt: s.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`search-save:${user.id}`, 8, 60_000)) {
    return Response.json({ error: 'Слишком часто, подождите минуту' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { query?: string; category?: string }
  const query = stripEmoji((body.query ?? '').trim()).slice(0, 64)
  const category = body.category?.trim().slice(0, 40) || null
  if (!query && !category) {
    return Response.json({ error: 'Пустой поиск нельзя сохранить' }, { status: 400 })
  }

  const existing = await db.savedSearch.findMany({ where: { userId: user.id } })
  if (existing.some((s) => s.query === query && (s.category ?? null) === category)) {
    return Response.json({ error: 'Такой поиск уже сохранён' }, { status: 409 })
  }
  if (existing.length >= 10) {
    return Response.json({ error: 'Максимум 10 сохранённых поисков' }, { status: 400 })
  }
  const s = await db.savedSearch.create({
    data: { userId: user.id, query, category },
  })
  return Response.json({
    search: {
      id: s.id,
      query: s.query,
      category: s.category,
      createdAt: s.createdAt.toISOString(),
    },
  })
}
