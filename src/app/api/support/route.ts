// Чат игрока с поддержкой: история + отправка сообщения с ИИ-автоответом.
// Если последним отвечал админ (в течение 20 минут), ИИ молчит: чат ведёт админ.
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit, ipKey, tooMany } from '@/lib/rate-limit'
import { supportAiReply, SUPPORT_ADMIN_ACTIVE_MS } from '@/lib/support-ai'

export const dynamic = 'force-dynamic'

export interface SupportMsgDTO {
  id: string
  role: string
  author: string
  text: string
  createdAt: string
}

function dto(m: { id: string; role: string; author: string; text: string; createdAt: Date }): SupportMsgDTO {
  return { id: m.id, role: m.role, author: m.author, text: m.text, createdAt: m.createdAt.toISOString() }
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()

  const msgs = await db.supportMessage.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  // ответы поддержки прочитаны игроком, когда он открыл приложение
  const unread = msgs.filter((m) => m.role === 'support' && !m.readByUser).length
  if (unread > 0) {
    await db.supportMessage.updateMany({
      where: { userId: me.id, role: 'support', readByUser: false },
      data: { readByUser: true },
    })
  }

  return Response.json({
    messages: msgs.map(dto),
    unreadOnOpen: unread,
  })
}

export async function POST(req: Request) {
  // 61-c: 10 req/мин на IP ДО авторизации — мусорные/брутфорсящие запросы
  // отсекаются до похода в БД (и 429 виден даже без токена, что нужно для QA)
  const ipRl = rateLimit(ipKey(req, 'support'), { limit: 10, windowMs: 60_000 })
  if (!ipRl.ok) return tooMany(ipRl.retryAfter)

  const me = await getSessionUser(req)
  if (!me) return unauthorized()
  const rl = rateLimit(`support-user:${me.id}`, { limit: 10, windowMs: 60_000 })
  if (!rl.ok) return tooMany(rl.retryAfter)

  let body: { text?: string }
  try {
    body = (await req.json()) as { text?: string }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  const text = (body.text ?? '').trim().slice(0, 1000)
  if (!text) return Response.json({ error: 'Пустое сообщение' }, { status: 400 })

  // Пауза ИИ: админ отвечал последним недавно (до нового сообщения юзера), он ведёт чат сам
  const prevLast = await db.supportMessage.findFirst({
    where: { userId: me.id },
    orderBy: { createdAt: 'desc' },
  })
  const adminActive = Boolean(
    prevLast &&
      prevLast.role === 'support' &&
      prevLast.author === 'admin' &&
      Date.now() - prevLast.createdAt.getTime() < SUPPORT_ADMIN_ACTIVE_MS,
  )

  const created = await db.supportMessage.create({
    data: { userId: me.id, role: 'user', author: 'user', text },
  })

  const out: SupportMsgDTO[] = [dto(created)]
  if (!adminActive) {
    const history = (
      await db.supportMessage.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 13,
      })
    )
      .reverse()
      .slice(0, -1) // всё кроме только что созданного сообщения
      .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('support' as const), text: m.text }))

    try {
      const reply = await supportAiReply(text, history, false)
      if (reply.text) {
        const aiMsg = await db.supportMessage.create({
          data: { userId: me.id, role: 'support', author: 'ai', text: reply.text },
        })
        out.push(dto(aiMsg))
      }
    } catch {
      // ИИ моргнул: сообщение юзера сохранено, ответ придёт через скриптовый фолбэк при следующем обращении
      const fb = await db.supportMessage.create({
        data: {
          userId: me.id,
          role: 'support',
          author: 'ai',
          text: 'Вижу сообщение, ответ готовлю. Если срочно: деньги и операции в Банке, налоги в разделе «Налоги» 🙂',
        },
      })
      out.push(dto(fb))
    }
  }

  return Response.json({ messages: out, adminActive })
}
