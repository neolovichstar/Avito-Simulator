import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// Рассылка всем реальным игрокам: уведомления появятся в шторке ОС,
// а телеграм-поллер бота доставит их и в Telegram (по tgSentAt).
export async function POST(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const title = String(body?.title ?? '').slice(0, 80).trim()
  const text = String(body?.body ?? '').slice(0, 400).trim()
  const kind = ['system', 'market', 'deal'].includes(String(body?.kind)) ? String(body.kind) : 'system'

  if (!title || !text) return Response.json({ error: 'Нужны заголовок и текст' }, { status: 400 })

  const users = await db.user.findMany({
    where: { isBot: false },
    select: { id: true },
  })

  await db.notification.createMany({
    data: users.map((u) => ({ userId: u.id, kind, title, body: text })),
  })

  return Response.json({ ok: true, sent: users.length })
}
