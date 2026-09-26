import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

// Фискальный мониторинг: неоплаченные налоги и живые кредиты игроков.
export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const now = new Date()

  const [taxBills, loans] = await Promise.all([
    db.taxBill.findMany({
      where: { status: 'unpaid' },
      orderBy: { dueAt: 'asc' },
      take: 200,
      include: {
        user: { select: { id: true, displayName: true, username: true, isBot: true, photoUrl: true, balance: true } },
      },
    }),
    db.loan.findMany({
      where: { status: { in: ['active', 'overdue'] } },
      orderBy: { dueAt: 'asc' },
      take: 200,
      include: {
        user: { select: { id: true, displayName: true, username: true, isBot: true, photoUrl: true, balance: true } },
      },
    }),
  ])

  const overdueTax = taxBills.filter((b) => b.dueAt < now)
  const overdueLoans = loans.filter((l) => l.dueAt < now)

  const summary = {
    unpaidTaxCount: taxBills.length,
    unpaidTaxSum: taxBills.reduce((s, b) => s + b.amount, 0),
    overdueTaxCount: overdueTax.length,
    loansCount: loans.length,
    loansOwedSum: loans.reduce((s, l) => s + l.owed, 0),
    overdueLoansCount: overdueLoans.length,
  }

  return Response.json({
    summary,
    taxBills: taxBills.map((b) => ({
      id: b.id,
      amount: b.amount,
      reason: b.reason,
      dueAt: b.dueAt.toISOString(),
      overdue: b.dueAt < now,
      user: { id: b.user.id, name: b.user.displayName, username: b.user.username, isBot: b.user.isBot, photoUrl: b.user.photoUrl, balance: b.user.balance },
    })),
    loans: loans.map((l) => ({
      id: l.id,
      principal: l.principal,
      owed: l.owed,
      rate: l.rate,
      dueAt: l.dueAt.toISOString(),
      overdue: l.dueAt < now,
      user: { id: l.user.id, name: l.user.displayName, username: l.user.username, isBot: l.user.isBot, photoUrl: l.user.photoUrl, balance: l.user.balance },
    })),
  })
}

// Действия: списать налог (forgive) или списать кредит (writeoff).
export async function POST(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const kind = String(body?.kind ?? '')
  const id = String(body?.id ?? '')
  if (!id || !['tax', 'loan'].includes(kind)) {
    return Response.json({ error: 'Ожидается kind: tax|loan и id' }, { status: 400 })
  }

  if (kind === 'tax') {
    const bill = await db.taxBill.findUnique({ where: { id }, include: { user: { select: { displayName: true } } } })
    if (!bill) return Response.json({ error: 'Счёт не найден' }, { status: 404 })
    if (bill.status === 'paid') return Response.json({ error: 'Счёт уже оплачен' }, { status: 400 })
    await db.taxBill.update({ where: { id }, data: { status: 'paid', paidAt: new Date() } })
    await logAdmin('tax.forgive', 'finance', id, `Налог ${bill.amount} ₽ списан (${bill.user.displayName}, причина: ${bill.reason})`)
    return Response.json({ ok: true })
  }

  const loan = await db.loan.findUnique({ where: { id }, include: { user: { select: { displayName: true } } } })
  if (!loan) return Response.json({ error: 'Кредит не найден' }, { status: 404 })
  if (loan.status !== 'active' && loan.status !== 'overdue') {
    return Response.json({ error: 'Кредит уже закрыт' }, { status: 400 })
  }
  await db.loan.update({ where: { id }, data: { status: 'repaid', repaidAt: new Date(), owed: 0 } })
  await logAdmin('loan.writeoff', 'finance', id, `Кредит списан: остаток ${loan.owed} ₽ (${loan.user.displayName})`)
  return Response.json({ ok: true })
}
