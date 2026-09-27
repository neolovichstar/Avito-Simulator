// Админский чат поддержки: список обращений + переписка, ответы от лица поддержки.
// Ответ админа (author="admin") ставит ИИ на паузу на 20 минут.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { isOnline } from '@/lib/dto'
import { notifyUser } from '@/lib/deals'

export const dynamic = 'force-dynamic'

interface SupportMsgDTO {
  id: string
  role: string
  author: string
  text: string
  createdAt: string
}

function dto(m: { id: string; role: string; author: string; text: string; createdAt: Date }): SupportMsgDTO {
  return { id: m.id, role: m.role, author: m.author, text: m.text, createdAt: m.createdAt.toISOString() }
}

// Список обращений: последнее сообщение, имя, непрочитанные
export async function GET(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')

  if (userId) {
    const [msgs, user] = await Promise.all([
      db.supportMessage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: 300 }),
      db.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, username: true, isBot: true, lastSeenAt: true } }),
    ])
    if (!user) return Response.json({ error: 'not found' }, { status: 404 })
    await db.supportMessage.updateMany({
      where: { userId, role: 'user', readByAdmin: false },
      data: { readByAdmin: true },
    })
    return Response.json({
      user: { id: user.id, name: user.displayName, username: user.username, isBot: user.isBot, online: isOnline(user) },
      messages: msgs.map(dto),
    })
  }

  // треды: группируем по userId через последние сообщения
  const users = await db.user.findMany({
    where: { supportMessages: { some: {} } },
    select: { id: true, displayName: true, username: true, isBot: true, lastSeenAt: true, supportMessages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { lastSeenAt: 'desc' },
    take: 100,
  })
  const threads = users
    .map((u) => {
      const last = u.supportMessages[0]
      return {
        userId: u.id,
        name: u.displayName,
        username: u.username,
        isBot: u.isBot,
        online: isOnline(u),
        lastText: last?.text ?? '',
        lastAt: last?.createdAt.toISOString() ?? u.lastSeenAt.toISOString(),
        lastAuthor: last?.author ?? '',
        lastRole: last?.role ?? '',
      }
    })
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))

  const unreadAgg = await db.supportMessage.groupBy({
    by: ['userId'],
    where: { role: 'user', readByAdmin: false },
    _count: { _all: true },
  })
  const unreadMap = new Map(unreadAgg.map((g) => [g.userId, g._count._all]))

  return Response.json({
    threads: threads.map((t) => ({ ...t, unread: unreadMap.get(t.userId) ?? 0 })),
  })
}

// Ответ админа от лица поддержки
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body: { userId?: string; text?: string }
  try {
    body = (await req.json()) as { userId?: string; text?: string }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  const userId = (body.userId ?? '').trim()
  const text = (body.text ?? '').trim().slice(0, 1500)
  if (!userId || !text) return Response.json({ error: 'userId и text обязательны' }, { status: 400 })

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return Response.json({ error: 'not found' }, { status: 404 })

  const msg = await db.supportMessage.create({
    data: { userId, role: 'support', author: 'admin', text },
  })

  // Игроку приходит уведомление об ответе (дедуп через dedupeKey не нужен: ответы уникальны)
  await notifyUser(userId, 'support', '💬 Поддержка', text.length > 160 ? `${text.slice(0, 157)}...` : text)

  return Response.json({ message: dto(msg) })
}
