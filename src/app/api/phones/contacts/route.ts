import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { botDigits, formatNumber } from '@/lib/phone'

export const dynamic = 'force-dynamic'

/** GET /api/phones/contacts — продавцы-боты с реальными именами и номерами. */
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  const bots = await db.user.findMany({
    where: { isBot: true },
    orderBy: { lastSeenAt: 'desc' },
    take: 10,
    select: { id: true, displayName: true, personaId: true },
  })

  return Response.json({
    items: bots.map((b) => ({
      id: b.id,
      name: b.displayName,
      num: formatNumber(botDigits(b.id)),
      isBot: true,
      personaId: b.personaId, // для живого голосового звонка продавцу (26-d)
    })),
  })
}
