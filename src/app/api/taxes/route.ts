import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { TAX_RATE } from '@/lib/economy'
import { parseStats } from '@/lib/quests'
import { notifyUser } from '@/lib/deals'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const bills = await db.taxBill.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const stats = parseStats(user.stats)
  return Response.json({
    taxDebt: user.taxDebt,
    rate: Math.round(TAX_RATE * 100),
    blocked: user.taxDebt >= 10_000,
    bills: bills.map((b) => ({
      id: b.id, amount: b.amount, reason: b.reason, status: b.status,
      createdAt: b.createdAt.toISOString(), dueAt: b.dueAt.toISOString(),
      paidAt: b.paidAt?.toISOString() ?? null,
    })),
    totalPaid: stats.taxPaid,
    totalEarned: stats.profit,
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (body.action !== 'pay') return Response.json({ error: 'Неизвестное действие' }, { status: 400 })
  if (user.taxDebt <= 0) return Response.json({ error: 'Задолженности нет' }, { status: 400 })
  const pay = Math.min(user.taxDebt, user.balance)
  if (pay <= 0) return Response.json({ error: 'Недостаточно средств на счету' }, { status: 400 })

  await db.user.update({
    where: { id: user.id },
    data: { balance: { decrement: pay }, taxDebt: { decrement: pay }, taxPenaltyAt: new Date() },
  })
  // пометить счета оплаченными
  const unpaid = await db.taxBill.findMany({ where: { userId: user.id, status: 'unpaid' }, orderBy: { createdAt: 'asc' } })
  let left = pay
  for (const b of unpaid) {
    if (left <= 0) break
    await db.taxBill.update({
      where: { id: b.id },
      data: { status: 'paid', paidAt: new Date() },
    })
    left -= b.amount
  }
  await db.transaction.create({ data: { userId: user.id, type: 'tax', amount: -pay, note: 'Оплата налогов (самозанятый 4%)' } })
  const stats = await import('@/lib/deals').then((m) => m.bumpStats(user.id, { taxPaid: pay }))
  await import('@/lib/deals').then((m) => m.bumpQuests(user.id, 'tax'))
  await import('@/lib/deals').then((m) => m.checkAchievements(user.id))
  if (pay >= user.taxDebt) {
    await notifyUser(user.id, 'tax', 'Налоги оплачены', `Задолженность погашена полностью. Налоговая довольна.`)
  }
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, taxDebt: fresh?.taxDebt ?? 0, totalPaid: stats.taxPaid })
}
