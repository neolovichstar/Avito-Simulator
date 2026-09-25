import { db } from '@/lib/db'
// Если REALTIME_SECRET на сервере не задан (напр. Vercel), принимаем канонический дефолт
const EXPECTED_SECRET = process.env.REALTIME_SECRET ?? 'avito-sim-rt-2024-secret'

export const dynamic = 'force-dynamic'

// Сервисный роут для бота: ДОСТАВКА уведомлений из прода.
// На Vercel нет постоянного процесса и нет localhost:3004, поэтому прямой мост
// (telegram-notify → /send) там не работает. Вместо этого бот (живёт в песочнице)
// раз в 20 с опрашивает этот роут и рассылает неотправленное, потом подтверждает.
// GET  → { chats: [{ chatId, displayName, items: [{ id, kind, title, body, createdAt }] }] }
// POST { ids } → пометить tgSentAt (бот подтвердил доставку)
function serviceOk(req: Request): boolean {
  const secret = req.headers.get('x-service-secret')
  return !!secret && secret === EXPECTED_SECRET
}

// Старше суток — в Telegram не шлём (мусор при перезаходе), только в приложении
const MAX_AGE_MS = 24 * 60 * 60 * 1000
// Лимит на чат за один опрос — защита от спама
const PER_CHAT_LIMIT = 15

export async function GET(req: Request) {
  if (!serviceOk(req)) return Response.json({ error: 'forbidden' }, { status: 403 })
  const cutoff = new Date(Date.now() - MAX_AGE_MS)
  const links = await db.telegramLink.findMany({
    select: { chatId: true, user: { select: { id: true, displayName: true } } },
  })
  const chats: Array<{
    chatId: string
    displayName: string
    items: Array<{ id: string; kind: string; title: string; body: string; createdAt: string }>
  }> = []
  for (const link of links) {
    const items = await db.notification.findMany({
      where: { userId: link.user.id, tgSentAt: null, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: PER_CHAT_LIMIT,
      select: { id: true, kind: true, title: true, body: true, createdAt: true },
    })
    if (items.length === 0) continue
    chats.push({
      chatId: link.chatId,
      displayName: link.user.displayName,
      items: items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    })
  }
  return Response.json({ chats })
}

export async function POST(req: Request) {
  if (!serviceOk(req)) return Response.json({ error: 'forbidden' }, { status: 403 })
  const body = (await req.json().catch(() => null)) as { ids?: string[] } | null
  if (!Array.isArray(body?.ids) || body.ids.length === 0) {
    return Response.json({ error: 'Нужен массив ids' }, { status: 400 })
  }
  const ids = body.ids.slice(0, 100)
  const res = await db.notification.updateMany({
    where: { id: { in: ids }, tgSentAt: null },
    data: { tgSentAt: new Date() },
  })
  return Response.json({ ok: true, updated: res.count })
}
