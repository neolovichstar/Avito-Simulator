import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Кредитная история заёмщика: последние 10 договоров (для раздела «Кредитная история»)
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const loans = await db.loan.findMany({
    where: { userId: user.id },
    orderBy: { takenAt: 'desc' },
    take: 10,
  })
  return Response.json({
    loans: loans.map((l) => ({
      id: l.id,
      principal: l.principal,
      owed: l.owed,
      rate: l.rate,
      status: l.status, // active | repaid | overdue
      takenAt: l.takenAt.toISOString(),
      repaidAt: l.repaidAt?.toISOString() ?? null,
    })),
  })
}
