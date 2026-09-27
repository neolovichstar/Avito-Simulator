import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { cardNumberFor, loanLimitFor, creditRateFor } from '@/lib/economy'
import type { BankData } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const txs = await db.transaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const loan = await db.loan.findFirst({
    where: { userId: user.id, status: { in: ['active', 'overdue'] } },
    orderBy: { takenAt: 'desc' },
  })
  const data: BankData & { creditScore: number; creditRate: number } = {
    balance: user.balance,
    debt: user.debt,
    deposit: user.deposit,
    loanLimit: loanLimitFor(user.level, user.creditScore),
    cardNumber: cardNumberFor(user.id),
    level: user.level,
    creditScore: user.creditScore,
    creditRate: creditRateFor(user.creditScore),
    transactions: txs.map((t) => ({
      id: t.id, type: t.type, amount: t.amount,
      counterpartyName: t.counterpartyName, note: t.note, createdAt: t.createdAt.toISOString(),
    })),
    activeLoan: loan ? {
      principal: loan.principal, owed: loan.owed, rate: loan.rate, dueAt: loan.dueAt.toISOString(),
    } : null,
  }
  return Response.json(data)
}
