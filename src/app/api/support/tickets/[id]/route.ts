// Один тикет: переписка обращения + отправка сообщения + закрытие («Решено»).
// Ответ админа ставит ИИ на паузу (SUPPORT_ADMIN_ACTIVE_MS) — как в общем чате.
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { supportAiReply } from '@/lib/support-ai'

export const dynamic = 'force-dynamic'

export interface SupportTicketMsgDTO {
  id: string
  role: string
  author: string
  text: string
  createdAt: string
}

function dto(m: { id: string; role: string; author: string; text: string; createdAt: Date }): SupportTicketMsgDTO {
  return { id: m.id, role: m.role, author: m.author, text: m.text, createdAt: m.createdAt.toISOString() }
}

async function loadTicket(req: Request, id: string) {
  const me = await getSessionUser(req)
  if (!me) return { error: unauthorized() }
  const ticket = await db.supportTicket.findUnique({ where: { id }, include: { user: { select: { id: true } } } })
  if (!ticket || ticket.userId !== me.id) return { error: Response.json({ error: 'not found' }, { status: 404 }) }
  return { me, ticket }
}

/** GET /api/support/tickets/[id] — переписка обращения (ответы помечаются прочитанными). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const r = await loadTicket(req, id)
  if ('error' in r) return r.error
  const { ticket } = r

  const msgs = await db.supportMessage.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  const unread = msgs.filter((m) => m.role === 'support' && !m.readByUser).length
  if (unread > 0) {
    await db.supportMessage.updateMany({
      where: { ticketId: ticket.id, role: 'support', readByUser: false },
      data: { readByUser: true },
    })
  }

  return Response.json({
    ticket: {
      id: ticket.id,
      category: ticket.category,
      subject: ticket.subject,
      orderNo: ticket.orderNo,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    },
    messages: msgs.map(dto),
    unreadOnOpen: unread,
  })
}

/** POST /api/support/tickets/[id] { text } — сообщение в обращение (+ ИИ-ответ). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const r = await loadTicket(req, id)
  if ('error' in r) return r.error
  const { me, ticket } = r
  if (ticket.status === 'closed') {
    return Response.json({ error: 'Обращение решено. Создайте новое' }, { status: 409 })
  }
  if (!rateLimit(`support-ticket-msg:${me.id}`, 12, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подожди немного' }, { status: 429 })
  }

  let body: { text?: string }
  try {
    body = (await req.json()) as { text?: string }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  const text = (body.text ?? '').trim().slice(0, 1000)
  if (!text) return Response.json({ error: 'Пустое сообщение' }, { status: 400 })

  // Пауза ИИ: админ отвечал последним в этом тикете недавно — ведёт чат сам
  const prevLast = await db.supportMessage.findFirst({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'desc' },
  })
  const adminActive = Boolean(
    prevLast &&
      prevLast.role === 'support' &&
      prevLast.author === 'admin' &&
      Date.now() - prevLast.createdAt.getTime() < 20 * 60_000,
  )

  const created = await db.supportMessage.create({
    data: { userId: me.id, ticketId: ticket.id, role: 'user', author: 'user', text },
  })

  const history = (
    await db.supportMessage.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'desc' },
      take: 13,
    })
  )
    .reverse()
    .slice(0, -1)
    .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('support' as const), text: m.text }))

  const out: SupportTicketMsgDTO[] = [dto(created)]
  try {
    const reply = await supportAiReply(text, history, adminActive)
    if (reply.text) {
      const aiMsg = await db.supportMessage.create({
        data: { userId: me.id, ticketId: ticket.id, role: 'support', author: 'ai', text: reply.text },
      })
      out.push(dto(aiMsg))
      await db.supportTicket.update({ where: { id: ticket.id }, data: { status: 'answered' } })
    }
  } catch {
    // ИИ моргнул: сообщение сохранено, ответ придёт от админа или при следующем сообщении
  }

  return Response.json({ messages: out, adminActive })
}

/** PATCH /api/support/tickets/[id] { action: 'close' | 'reopen' } — статус обращения. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const r = await loadTicket(req, id)
  if ('error' in r) return r.error
  const { ticket } = r

  let body: { action?: string }
  try {
    body = (await req.json()) as { action?: string }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }

  const status = body.action === 'reopen' ? 'open' : 'closed'
  const updated = await db.supportTicket.update({ where: { id: ticket.id }, data: { status } })
  return Response.json({ ok: true, status: updated.status })
}
