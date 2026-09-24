import { db } from '@/lib/db'
import { verifySession } from '@/lib/telegram'
import { rateLimit } from '@/lib/ratelimit'
import { TX_TYPE_LABEL } from '@/lib/types'

export const dynamic = 'force-dynamic'

// CSV-экспорт истории операций. Токен сессии: Bearer-заголовок или ?token=
// (второе — для скачивания прямой ссылкой из браузера).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const qToken = url.searchParams.get('token') ?? ''
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ')
    ? auth.slice(7)
    : req.headers.get('x-session-token') ?? qToken
  const userId = token ? verifySession(token) : null
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (!rateLimit(`csv:${userId}`, 6, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите минуту' }, { status: 429 })
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const txs = await db.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })

  // CSV с BOM, разделитель «;» — Excel на русской локали открывает сразу красиво
  const esc = (v: string | number | null) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows: string[] = [
    ['Дата', 'Тип', 'Контрагент', 'Описание', 'Сумма, ₽'].join(';'),
  ]
  for (const t of txs) {
    rows.push([
      t.createdAt.toISOString().replace('T', ' ').slice(0, 16),
      TX_TYPE_LABEL[t.type] ?? t.type,
      t.counterpartyName ?? '',
      t.note ?? '',
      t.amount,
    ].map(esc).join(';'))
  }
  const csv = '\uFEFF' + rows.join('\r\n')

  const fname = `sdelka-operations-${new Date().toISOString().slice(0, 10)}.csv`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  })
}
