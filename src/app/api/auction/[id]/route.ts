import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

// История ставок лота: последние 30, свежие сверху
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const lot = await db.auctionLot.findUnique({ where: { id } })
  if (!lot) return Response.json({ error: 'Лот не найден' }, { status: 404 })

  const bids = await db.auctionBid.findMany({
    where: { lotId: id },
    orderBy: { amount: 'desc' },
    take: 30,
  })

  return Response.json({
    bids: bids.map((b) => ({
      id: b.id,
      userName: b.userName,
      amount: b.amount,
      createdAt: b.createdAt.toISOString(),
      isMe: b.userId === user.id,
    })),
  })
}
