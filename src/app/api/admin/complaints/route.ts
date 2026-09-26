import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

// Очередь жалоб игроков: свежие сверху, с контекстом объявления и заявителя.
export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const rows = await db.complaint.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          price: true,
          image: true,
          status: true,
          category: true,
          city: true,
          seller: { select: { id: true, displayName: true, isBot: true } },
        },
      },
      from: { select: { displayName: true, isBot: true } },
    },
  })

  const summary = {
    total: rows.length,
    onActive: rows.filter((r) => r.listing.status === 'active').length,
    uniqueListings: new Set(rows.map((r) => r.listingId)).size,
  }

  return Response.json({
    summary,
    rows: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      fromName: r.from.displayName,
      fromIsBot: r.from.isBot,
      listing: {
        id: r.listing.id,
        title: r.listing.title,
        price: r.listing.price,
        image: r.listing.image,
        status: r.listing.status,
        category: r.listing.category,
        city: r.listing.city,
        sellerName: r.listing.seller.displayName,
        sellerIsBot: r.listing.seller.isBot,
      },
    })),
  })
}
