import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const PER = 25

export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'active'
  const q = (url.searchParams.get('q') ?? '').trim()
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)

  const where: Record<string, unknown> = {}
  if (status !== 'all') where.status = status
  if (q) where.title = { contains: q }

  const [total, rows] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER,
      take: PER,
      include: { seller: { select: { displayName: true, isBot: true } } },
    }),
  ])

  return Response.json({
    rows: rows.map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      category: l.category,
      condition: l.condition,
      city: l.city,
      status: l.status,
      views: l.views,
      image: l.image,
      createdAt: l.createdAt.toISOString(),
      sellerName: l.seller.displayName,
      sellerIsBot: l.seller.isBot,
      complaintCount: l.complaintCount,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PER)),
  })
}
