import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const PER = 25

export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const bot = url.searchParams.get('bot') ?? 'all'
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)

  const where: Record<string, unknown> = {}
  if (bot === 'bots') where.isBot = true
  if (bot === 'real') where.isBot = false
  if (q) {
    where.OR = [
      { displayName: { contains: q } },
      { username: { contains: q.toLowerCase() } },
    ]
  }

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ isBot: 'asc' }, { lastSeenAt: 'desc' }],
      skip: (page - 1) * PER,
      take: PER,
      select: {
        id: true,
        displayName: true,
        username: true,
        photoUrl: true,
        isBot: true,
        balance: true,
        debt: true,
        taxDebt: true,
        deposit: true,
        level: true,
        xp: true,
        creditScore: true,
        city: true,
        ratingSum: true,
        ratingCount: true,
        lastSeenAt: true,
        createdAt: true,
        personaId: true,
      },
    }),
  ])

  return Response.json({
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PER)),
  })
}
