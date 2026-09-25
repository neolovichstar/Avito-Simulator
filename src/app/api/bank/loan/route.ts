import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { loanLimitFor, LOAN_DAYS, rateForTerm, LOAN_TERM_OPTIONS } from '@/lib/economy'
import { notifyUser, bumpStats, bumpQuests } from '@/lib/deals'
import { fmtMoney } from '@/lib/format'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { amount?: number; repay?: number; days?: number }

  // Погашение
  if (body.repay !== undefined) {
    const amount = Math.round(Number(body.repay))
    if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: 'Некорректная сумма' }, { status: 400 })
    if (user.debt <= 0) return Response.json({ error: 'Долгов нет' }, { status: 400 })
    const pay = Math.min(amount, user.debt, user.balance)
    if (pay <= 0) return Response.json({ error: 'Недостаточно средств' }, { status: 400 })
    await db.user.update({
      where: { id: user.id },
      data: { balance: { decrement: pay }, debt: { decrement: pay } },
    })
    const loan = await db.loan.findFirst({
      where: { userId: user.id, status: { in: ['active', 'overdue'] } },
      orderBy: { takenAt: 'desc' },
    })
    if (loan) {
      const owedLeft = Math.max(0, loan.owed - pay)
      await db.loan.update({
        where: { id: loan.id },
        data: { owed: owedLeft, status: owedLeft === 0 ? 'repaid' : loan.status, repaidAt: owedLeft === 0 ? new Date() : null },
      })
    }
    await db.transaction.create({
      data: { userId: user.id, type: 'repay', amount: -pay, note: 'Погашение кредита' },
    })
    const fresh = await db.user.findUnique({ where: { id: user.id } })
    if (fresh && fresh.debt === 0) {
      // аккуратное погашение повышает кредитный рейтинг
      const newScore = Math.min(850, fresh.creditScore + 40)
      await db.user.update({ where: { id: fresh.id }, data: { creditScore: newScore } })
      await notifyUser(user.id, 'system', 'Кредит закрыт', `Долг погашен полностью. Кредитный рейтинг повышен: ${newScore}. Лимит и ставка улучшились.`)
    }
    return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, debt: fresh?.debt ?? 0 })
  }

  // Взятие кредита
  const amount = Math.round(Number(body.amount))
  if (!Number.isFinite(amount) || amount < 1000) return Response.json({ error: 'Минимум 1 000 ₽' }, { status: 400 })
  // Срок (как в жизни): 7/14/30 дней; длиннее — выше ставка. По умолчанию 7.
  const days = body.days != null ? Math.round(Number(body.days)) : LOAN_DAYS
  if (!LOAN_TERM_OPTIONS.some((t) => t.days === days)) return Response.json({ error: 'Недоступный срок кредита' }, { status: 400 })
  const limit = loanLimitFor(user.level, user.creditScore)
  if (user.debt > 0) return Response.json({ error: 'Сначала погасите текущий кредит' }, { status: 400 })
  if (amount > limit) return Response.json({ error: `Ваш лимит: ${fmtMoney(limit)}. Растите уровень и рейтинг` }, { status: 400 })

  const rate = rateForTerm(user.creditScore, days)
  const owed = Math.round(amount * (1 + rate / 100))
  const dueAt = new Date(Date.now() + days * 86_400_000)
  await db.user.update({
    where: { id: user.id },
    data: { balance: { increment: amount }, debt: { increment: owed } },
  })
  await db.loan.create({
    data: {
      userId: user.id, principal: amount, owed, rate,
      dueAt,
    },
  })
  await db.transaction.create({
    data: { userId: user.id, type: 'loan', amount, note: `Кредит на ${days} дней под ${rate}%` },
  })
  await bumpStats(user.id, { loans: 1 })
  await bumpQuests(user.id, 'loan')
  await notifyUser(user.id, 'system', 'Кредит выдан', `${fmtMoney(amount)} зачислено на счёт. К возврату ${fmtMoney(owed)} до ${dueAt.toLocaleDateString('ru-RU')}.`)
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance })
}
