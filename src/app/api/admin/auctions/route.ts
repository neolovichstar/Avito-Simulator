import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const [active, recent] = await Promise.all([
    db.auctionLot.findMany({
      where: { status: 'active' },
      orderBy: { endsAt: 'asc' },
      take: 30,
    }),
    db.auctionLot.findMany({
      where: { status: { not: 'active' } },
      orderBy: { finishedAt: 'desc' },
      take: 12,
    }),
  ])

  // имена лидеров → бот или игрок
  const bidderIds = [...new Set([active, recent].flat().map((l) => l.currentBidderId).filter(Boolean))] as string[]
  const bidders = bidderIds.length
    ? await db.user.findMany({ where: { id: { in: bidderIds } }, select: { id: true, isBot: true } })
    : []
  const botMap = new Map(bidders.map((u) => [u.id, u.isBot]))

  const shape = (l: (typeof active)[number]) => ({
    id: l.id,
    title: l.title,
    image: l.image,
    category: l.category,
    condition: l.condition,
    startPrice: l.startPrice,
    currentBid: l.currentBid,
    currentBidderName: l.currentBidderName,
    currentBidderIsBot: l.currentBidderId ? (botMap.get(l.currentBidderId) ?? null) : null,
    bidCount: l.bidCount,
    status: l.status,
    endsAt: l.endsAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
    finishedAt: l.finishedAt?.toISOString() ?? null,
  })

  return Response.json({
    active: active.map(shape),
    recent: recent.map(shape),
  })
}
