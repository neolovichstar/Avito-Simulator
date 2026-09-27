import { db } from '@/lib/db'
import { verifySession } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mini-auth?token=... — проверка bearer-токена для мини-сервисов
 * (Task 27-e: call-service :3303 валидирует сокет-клиентов этим запросом).
 *
 * Тот же механизм, что getSessionUser (lib/session.ts): HMAC-подпись сессии
 * (lib/telegram.ts verifySession) + юзер существует в БД. Токен приходит в
 * query, потому что сервис ходит сюда обычным fetch без заголовков.
 *
 * Ответ: { ok: true, userId, name } | { ok: false } (401).
 * Попутно обновляем lastSeenAt (не чаще раза в минуту) — юзер горит «онлайн»
 * в чатах, пока висит на сигналинге звонков.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = (url.searchParams.get('token') ?? '').trim()
  if (!token) return Response.json({ ok: false }, { status: 401 })

  const userId = verifySession(token)
  if (!userId) return Response.json({ ok: false }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, lastSeenAt: true },
  })
  if (!user) return Response.json({ ok: false }, { status: 401 })

  if (Date.now() - user.lastSeenAt.getTime() > 60_000) {
    await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }

  return Response.json({ ok: true, userId: user.id, name: user.displayName })
}
