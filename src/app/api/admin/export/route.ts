import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// CSV-экспорт для Excel (BOM + разделитель «;», десятичная запятая не нужна —
// суммы целые). Даты в ISO, чтобы Excel не путался.

function csv(rows: (string | number | boolean | null)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c == null ? '' : String(c)
          return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(';'),
    )
    .join('\r\n')
}

function csvResponse(name: string, body: string) {
  return new Response('\uFEFF' + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const type = new URL(req.url).searchParams.get('type') ?? 'users'

  if (type === 'users') {
    const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } })
    const rows: (string | number | boolean | null)[][] = [
      ['id', 'displayName', 'username', 'isBot', 'balance', 'debt', 'taxDebt', 'deposit', 'level', 'xp', 'creditScore', 'city', 'rating', 'createdAt', 'lastSeenAt'],
      ...users.map((u) => [
        u.id, u.displayName, u.username, u.isBot, u.balance, u.debt, u.taxDebt, u.deposit,
        u.level, u.xp, u.creditScore, u.city,
        u.ratingCount ? (u.ratingSum / u.ratingCount).toFixed(2) : '',
        u.createdAt.toISOString(), u.lastSeenAt.toISOString(),
      ]),
    ]
    return csvResponse('resale-users.csv', csv(rows))
  }

  if (type === 'listings') {
    const listings = await db.listing.findMany({
      orderBy: { createdAt: 'desc' },
      include: { seller: { select: { displayName: true } } },
    })
    const rows: (string | number | boolean | null)[][] = [
      ['id', 'title', 'category', 'condition', 'price', 'status', 'views', 'city', 'seller', 'createdAt', 'soldAt'],
      ...listings.map((l) => [
        l.id, l.title, l.category, l.condition, l.price, l.status, l.views, l.city,
        l.seller.displayName, l.createdAt.toISOString(), l.soldAt?.toISOString() ?? '',
      ]),
    ]
    return csvResponse('resale-listings.csv', csv(rows))
  }

  if (type === 'transactions') {
    const since = new Date(Date.now() - 30 * 24 * 3600_000)
    const txs = await db.transaction.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, isBot: true } } },
    })
    const rows: (string | number | boolean | null)[][] = [
      ['id', 'user', 'isBot', 'type', 'amount', 'counterparty', 'note', 'createdAt'],
      ...txs.map((t) => [
        t.id, t.user.displayName, t.user.isBot, t.type, t.amount,
        t.counterpartyName ?? '', t.note ?? '', t.createdAt.toISOString(),
      ]),
    ]
    return csvResponse('resale-transactions-30d.csv', csv(rows))
  }

  return Response.json({ error: 'Неизвестный тип экспорта' }, { status: 400 })
}
