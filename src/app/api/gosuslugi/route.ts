import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { buildGosDocs, buildGosFines, GOS_SERVICES, parseGosStats } from '@/lib/gos-docs'
import type { GosData, GosFineDTO } from '@/lib/gos-docs'

export const dynamic = 'force-dynamic'

// GET /api/gosuslugi — портал Госуслуг: документы игрока, штрафы за сегодня, сервисы.
// Документы детерминированы из userId, штрафы — из userId + день. Оплаченные
// штрафы помечаются по User.stats (gosFinesPaid) и не приходят активными повторно.
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  const now = new Date()
  const docs = buildGosDocs(user.id, user.displayName, user.createdAt, user.city)
  const stats = parseGosStats(user.stats)
  const fines: GosFineDTO[] = buildGosFines(user.id, now).map((f) => {
    const paid = stats.gosFinesPaid?.[f.id]
    return { ...f, status: paid ? 'paid' : 'unpaid', paidAt: paid?.t ?? null }
  })

  const data: GosData = {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      balance: user.balance,
      level: user.level,
      city: user.city,
      createdAt: user.createdAt.toISOString(),
    },
    docs,
    fines,
    services: GOS_SERVICES,
    paidTotal: stats.gosFinesPaidTotal ?? 0,
  }
  return Response.json(data)
}
