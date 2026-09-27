import { db } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
// Если REALTIME_SECRET на сервере не задан (напр. Vercel), принимаем канонический дефолт
const EXPECTED_SECRET = process.env.REALTIME_SECRET ?? 'avito-sim-rt-2024-secret'

export const dynamic = 'force-dynamic'

// Сервисный роут: его вызывает мини-сервис бота (:3004) с секретом REALTIME_SECRET.
// POST { code, chatId, tgUsername } — привязать Telegram-чат к аккаунту по коду.
function serviceOk(req: Request): boolean {
  const secret = req.headers.get('x-service-secret')
  return !!secret && secret === EXPECTED_SECRET
}

export async function POST(req: Request) {
  if (!serviceOk(req)) return Response.json({ error: 'forbidden' }, { status: 403 })
  const body = (await req.json().catch(() => null)) as
    | { code?: string; chatId?: string; tgUsername?: string }
    | null
  if (!body?.code || !body?.chatId) {
    return Response.json({ error: 'Нужны code и chatId' }, { status: 400 })
  }
  if (!rateLimit(`tg-bind:${body.chatId}`, 10, 60_000)) {
    return Response.json({ error: 'Слишком часто' }, { status: 429 })
  }
  const row = await db.telegramCode.findUnique({
    where: { code: body.code.toUpperCase() },
    include: { user: true },
  })
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return Response.json({ error: 'Код неверный или истёк. Получите новый в Настройках игры' }, { status: 404 })
  }
  // один чат = один аккаунт: отвязать чат от других юзеров
  await db.telegramLink.deleteMany({ where: { chatId: body.chatId } })
  await db.telegramLink.upsert({
    where: { userId: row.userId },
    create: { userId: row.userId, chatId: body.chatId, tgUsername: body.tgUsername ?? null },
    update: { chatId: body.chatId, tgUsername: body.tgUsername ?? null },
  })
  await db.telegramCode.deleteMany({ where: { userId: row.userId } })
  return Response.json({
    ok: true,
    displayName: row.user.displayName,
    balance: row.user.balance,
  })
}
