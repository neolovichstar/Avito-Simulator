// Тикеты поддержки игрока: список обращений + создание нового обращения.
// Первое сообщение тикета сохраняется в body самого тикета, переписка живёт
// в SupportMessage с ticketId. На создание отвечает ИИ-оператор (админ может
// перехватить тикет — тогда ИИ молчит SUPPORT_ADMIN_ACTIVE_MS).
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { supportAiReply, SUPPORT_ADMIN_ACTIVE_MS } from '@/lib/support-ai'

export const dynamic = 'force-dynamic'

const CATEGORIES = new Set(['order', 'account', 'refund', 'safety', 'other'])

export interface SupportTicketDTO {
  id: string
  category: string
  subject: string
  orderNo: string | null
  status: string // open | answered | closed
  preview: string
  createdAt: string
  updatedAt: string
  unread: number
}

function dto(
  t: {
    id: string
    category: string
    subject: string
    orderNo: string | null
    status: string
    createdAt: Date
    updatedAt: Date
  },
  preview: string,
  unread: number,
): SupportTicketDTO {
  return {
    id: t.id,
    category: t.category,
    subject: t.subject,
    orderNo: t.orderNo,
    status: t.status,
    preview,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    unread,
  }
}

/** GET /api/support/tickets — мои обращения (открытые + архив отдельно решает клиент по status). */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()

  const tickets = await db.supportTicket.findMany({
    where: { userId: me.id },
    orderBy: { updatedAt: 'desc' },
    take: 60,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { text: true },
      },
    },
  })

  const unreadAgg = await db.supportMessage.groupBy({
    by: ['ticketId'],
    where: { userId: me.id, ticketId: { not: null }, role: 'support', readByUser: false },
    _count: { _all: true },
  })
  const unreadMap = new Map(unreadAgg.map((g) => [g.ticketId ?? '', g._count._all]))

  return Response.json({
    tickets: tickets.map((t) =>
      dto(t, t.messages[0]?.text ?? '', unreadMap.get(t.id) ?? 0),
    ),
  })
}

/** POST /api/support/tickets { category, subject, orderNo, body } — создать обращение. */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()
  if (!rateLimit(`support-ticket:${me.id}`, 6, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подожди немного' }, { status: 429 })
  }

  let body: { category?: string; subject?: string; orderNo?: string; body?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }

  const category = CATEGORIES.has(body.category ?? '') ? (body.category as string) : 'other'
  const subject = (body.subject ?? '').trim().slice(0, 120)
  const orderNo = (body.orderNo ?? '').trim().slice(0, 40) || null
  const text = (body.body ?? '').trim().slice(0, 1000)
  if (!subject || !text) {
    return Response.json({ error: 'Заполните тему и описание' }, { status: 400 })
  }

  // Пауза ИИ: если админ недавно отвечал в общий чат, для игрока это тот же
  // саппорт — но тикет обязан получить первый ответ, поэтому ИИ отвечает всегда,
  // кроме случая, когда админ уже взял именно этот тикет (для нового это невозможно).
  const prevLast = await db.supportMessage.findFirst({
    where: { userId: me.id, ticketId: null },
    orderBy: { createdAt: 'desc' },
  })
  const adminActive = Boolean(
    prevLast &&
      prevLast.role === 'support' &&
      prevLast.author === 'admin' &&
      Date.now() - prevLast.createdAt.getTime() < SUPPORT_ADMIN_ACTIVE_MS,
  )

  const ticket = await db.supportTicket.create({
    data: { userId: me.id, category, subject, orderNo },
  })

  const first = await db.supportMessage.create({
    data: { userId: me.id, ticketId: ticket.id, role: 'user', author: 'user', text },
  })

  // Контекст тикета в историю для ИИ — чтобы ответ был по теме
  const ctx = `[Обращение: категория ${category}${orderNo ? `, заказ №${orderNo}` : ''}. Тема: ${subject}] ${text}`
  let replyText = ''
  try {
    const reply = await supportAiReply(ctx, [], adminActive)
    if (reply.text) {
      const aiMsg = await db.supportMessage.create({
        data: { userId: me.id, ticketId: ticket.id, role: 'support', author: 'ai', text: reply.text },
      })
      replyText = aiMsg.text
      await db.supportTicket.update({ where: { id: ticket.id }, data: { status: 'answered' } })
    }
  } catch {
    // ИИ моргнул — игрок увидит ответ позже (админ/следующее сообщение)
  }

  return Response.json({
    ticket: dto(ticket, text, 0),
    messages: [
      { id: first.id, role: 'user', author: 'user', text: first.text, createdAt: first.createdAt.toISOString() },
      ...(replyText
        ? [
            {
              id: `ai_${ticket.id}`,
              role: 'support',
              author: 'ai',
              text: replyText,
              createdAt: new Date().toISOString(),
            },
          ]
        : []),
    ],
  })
}
