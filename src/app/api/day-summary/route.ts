import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Итоги дня для локскрина: сколько сделок и какой денежный результат сегодня.
// 64-F1 (L-9): границы дня — UTC-день (как у бонуса/квестов/дня-ключа), а не
// локальные setHours(0,0,0,0): иначе «сегодня» расходится с бонус-стриком и
// заданиями на серверах с не-UTC таймзоной.
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  const day = new Date(Date.now()).toISOString().slice(0, 10)
  const start = new Date(`${day}T00:00:00.000Z`)

  const txs = await db.transaction.findMany({
    where: { userId: user.id, createdAt: { gte: start }, type: { in: ['purchase', 'sale'] } },
    select: { type: true, amount: true },
  })

  const buys = txs.filter((t) => t.type === 'purchase').length
  const sales = txs.filter((t) => t.type === 'sale').length
  // покупки < 0, продажи > 0 — считаем чистый денежный поток дня
  const net = txs.reduce((acc, t) => acc + t.amount, 0)

  return Response.json({
    deals: buys + sales,
    buys,
    sales,
    net,
  })
}
