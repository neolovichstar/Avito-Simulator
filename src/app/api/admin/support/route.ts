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
  const ticketId = url.searchParams.get('ticketId')

  // ── Тикеты (обращения) ──
  if (url.searchParams.get('tickets') === '1') {
    const tickets = await db.supportTicket.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 80,
      include: {
        user: { select: { id: true, displayName: true, username: true, isBot: true, lastSeenAt: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { text: true, author: true, role: true, createdAt: true } },
      },
    })
    const unreadAgg = await db.supportMessage.groupBy({
      by: ['ticketId'],
      where: { ticketId: { not: null }, role: 'user', readByAdmin: false },
      _count: { _all: true },
    })
    const unreadMap = new Map(unreadAgg.map((g) => [g.ticketId ?? '', g._count._all]))
    return Response.json({
      tickets: tickets.map((t) => ({
        ticketId: t.id,
        userId: t.userId,
        name: t.user.displayName,
        username: t.user.username,
        isBot: t.user.isBot,
        online: isOnline(t.user),
        category: t.category,
        subject: t.subject,
        status: t.status,
        lastText: t.messages[0]?.text ?? '',
        lastAuthor: t.messages[0]?.author ?? '',
        lastRole: t.messages[0]?.role ?? '',
        lastAt: (t.messages[0]?.createdAt ?? t.updatedAt).toISOString(),
        unread: unreadMap.get(t.id) ?? 0,
      })),
    })
  }

  if (ticketId) {
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { id: true, displayName: true, username: true, isBot: true, lastSeenAt: true } } },
    })
    if (!ticket) return Response.json({ error: 'not found' }, { status: 404 })
    const msgs = await db.supportMessage.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' }, take: 300 })
    await db.supportMessage.updateMany({
      where: { ticketId, role: 'user', readByAdmin: false },
      data: { readByAdmin: true },
    })
    return Response.json({
      ticket: { ticketId: ticket.id, subject: ticket.subject, category: ticket.category, status: ticket.status, orderNo: ticket.orderNo, createdAt: ticket.createdAt.toISOString() },
      user: { id: ticket.user.id, name: ticket.user.displayName, username: ticket.user.username, isBot: ticket.user.isBot, online: isOnline(ticket.user) },
      messages: msgs.map(dto),
    })
  }

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

// Ответ админа от лица поддержки (общий чат: userId; тикет: ticketId)
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body: { userId?: string; ticketId?: string; text?: string }
  try {
    body = (await req.json()) as { userId?: string; text?: string }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  const text = (body.text ?? '').trim().slice(0, 1500)
  if (!text) return Response.json({ error: 'text обязателен' }, { status: 400 })

  const ticketId = (body.ticketId ?? '').trim()
  const userId = (body.userId ?? '').trim()
  if (!ticketId && !userId) return Response.json({ error: 'userId или ticketId обязателен' }, { status: 400 })

  if (ticketId) {
    const ticket = await db.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true } })
    if (!ticket) return Response.json({ error: 'not found' }, { status: 404 })
    const msg = await db.supportMessage.create({
      data: { userId: ticket.userId, ticketId, role: 'support', author: 'admin', text },
    })
    await db.supportTicket.update({ where: { id: ticketId }, data: { status: 'answered' } })
    await notifyUser(ticket.userId, 'support', '💬 Поддержка', text.length > 160 ? `${text.slice(0, 157)}...` : text)
    return Response.json({ message: dto(msg) })
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return Response.json({ error: 'not found' }, { status: 404 })

  const msg = await db.supportMessage.create({
    data: { userId, role: 'support', author: 'admin', text },
  })

  // Игроку приходит уведомление об ответе (дедуп через dedupeKey не нужен: ответы уникальны)
  await notifyUser(userId, 'support', '💬 Поддержка', text.length > 160 ? `${text.slice(0, 157)}...` : text)

  return Response.json({ message: dto(msg) })
}

// Статус тикета: закрыть/переоткрыть
export async function PATCH(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body: { ticketId?: string; status?: string }
  try {
    body = (await req.json()) as { ticketId?: string; status?: string }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  const ticketId = (body.ticketId ?? '').trim()
  const allowed = new Set(['open', 'answered', 'closed'])
  if (!ticketId || !allowed.has(body.status ?? '')) {
    return Response.json({ error: 'ticketId и status (open|answered|closed) обязательны' }, { status: 400 })
  }
  const t = await db.supportTicket.update({ where: { id: ticketId }, data: { status: body.status as string } })
  return Response.json({ ok: true, status: t.status })
}
