import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const items = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  return Response.json({
    items: items.map((n) => ({
      id: n.id, kind: n.kind, title: n.title, body: n.body,
      readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string }
  if (body.action === 'read') {
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    })
    return Response.json({ ok: true })
  }
  // смахнули карточку — удалить одно уведомление
  if (body.action === 'delete' && typeof body.id === 'string' && body.id) {
    await db.notification.deleteMany({ where: { userId: user.id, id: body.id } })
    return Response.json({ ok: true })
  }
  // «Очистить все» — удалить все уведомления пользователя
  if (body.action === 'clear') {
    await db.notification.deleteMany({ where: { userId: user.id } })
    return Response.json({ ok: true })
  }
  return Response.json({ error: 'Неизвестное действие' }, { status: 400 })
}
