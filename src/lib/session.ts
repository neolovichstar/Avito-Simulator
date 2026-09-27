import { db } from '@/lib/db'
import { verifySession } from '@/lib/telegram'
import type { User } from '@prisma/client'

// Получение текущего пользователя из запроса.
// Токен: Authorization: Bearer <token> или заголовок x-session-token.
export async function getSessionUser(req: Request): Promise<User | null> {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ')
    ? auth.slice(7)
    : req.headers.get('x-session-token') ?? ''
  if (!token) return null
  const userId = verifySession(token)
  if (!userId) return null
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return null
  // обновляем присутствие (не чаще раза в минуту)
  if (Date.now() - user.lastSeenAt.getTime() > 60_000) {
    await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }
  return user
}

export function unauthorized() {
  return Response.json({ error: 'unauthorized' }, { status: 401 })
}
