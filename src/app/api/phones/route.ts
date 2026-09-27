import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { purgeExpiredReserves, serializePhone } from '@/lib/phone-server'

export const dynamic = 'force-dynamic'

/** GET /api/phones — свои номера (все статусы, основной первым) + баланс. */
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  await purgeExpiredReserves()

  const numbers = await db.phoneNumber.findMany({
    where: { userId: user.id },
    orderBy: [{ isMain: 'desc' }, { createdAt: 'desc' }],
  })

  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { balance: true } })

  return Response.json({
    numbers: numbers.map(serializePhone),
    balance: fresh?.balance ?? user.balance,
  })
}
