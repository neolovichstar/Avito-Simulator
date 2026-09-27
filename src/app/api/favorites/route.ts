import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { bumpQuests } from '@/lib/deals'

export const dynamic = 'force-dynamic'

// Список id объявлений в избранном на сервере
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const favs = await db.favorite.findMany({
    where: { userId: user.id },
    select: { listingId: true },
    take: 300,
  })
  return Response.json({ ids: favs.map((f) => f.listingId) })
}

// Синхронизация одного переключения: { listingId, on }
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`fav:${user.id}`, 30, 60_000)) {
    return Response.json({ error: 'Слишком часто' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { listingId?: string; on?: boolean }
  const listingId = body.listingId
  if (!listingId || typeof listingId !== 'string') {
    return Response.json({ error: 'Нужен listingId' }, { status: 400 })
  }
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, status: true } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })

  if (body.on === false) {
    await db.favorite.deleteMany({ where: { userId: user.id, listingId } })
    return Response.json({ ok: true, on: false })
  }
  const created = await db.favorite.upsert({
    where: { userId_listingId: { userId: user.id, listingId } },
    create: { userId: user.id, listingId },
    update: {},
  })
  if (created) {
    try {
      await bumpQuests(user.id, 'fav')
    } catch {
      // квесты не должны ломать избранное
    }
  }
  return Response.json({ ok: true, on: true })
}

// Полная синхронизация (первая загрузка): { ids: string[] }
export async function PUT(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`fav-sync:${user.id}`, 4, 60_000)) {
    return Response.json({ error: 'Слишком часто' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] }
  const ids = Array.isArray(body.ids) ? body.ids.filter((i) => typeof i === 'string').slice(0, 300) : []
  const existing = await db.favorite.findMany({ where: { userId: user.id }, select: { listingId: true } })
  const have = new Set(existing.map((e) => e.listingId))
  const want = new Set(ids)
  const toAdd = ids.filter((i) => !have.has(i))
  const toRemove = existing.filter((e) => !want.has(e.listingId)).map((e) => e.listingId)
  if (toAdd.length) {
    // только реально существующие объявления
    const found = await db.listing.findMany({ where: { id: { in: toAdd } }, select: { id: true } })
    if (found.length) {
      try {
        await db.favorite.createMany({
          data: found.map((f) => ({ userId: user.id, listingId: f.id })),
        })
      } catch {
        // гонка с параллельным запросом — не критично
      }
    }
  }
  if (toRemove.length) {
    await db.favorite.deleteMany({ where: { userId: user.id, listingId: { in: toRemove } } })
  }
  return Response.json({ ok: true, added: toAdd.length, removed: toRemove.length })
}
