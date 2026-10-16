import { db } from '@/lib/db'
import { serviceOk } from '@/lib/telegram-auth'

export const dynamic = 'force-dynamic'

// Сервисный роут для бота: активные лоты аукциона (команда /lots).
export async function GET(req: Request) {
  if (!(await serviceOk(req))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  const lots = await db.auctionLot.findMany({
    where: { status: 'active', endsAt: { gt: new Date() } },
    orderBy: { endsAt: 'asc' },
    take: 5,
  })
  return Response.json({
    lots: lots.map((l) => ({
      title: l.title,
      condition: l.condition,
      currentBid: l.currentBid ?? l.startPrice,
      bids: l.bidCount,
      leader: l.currentBidderName ?? '—',
      endsInMin: Math.max(0, Math.round((l.endsAt.getTime() - Date.now()) / 60_000)),
    })),
  })
}
