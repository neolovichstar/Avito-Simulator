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

    // 64-F1 (M-4): раньше CAS-списание и апдейт loan.owed были разнесены —
    // краш/параллельный запрос между ними расходовал debt и loan.owed.
    // Весь flow атомарен в $transaction: CAS-списание → loan → Transaction →
    // (при полном погашении) рейтинг-буст.
    class RepayError extends Error {}
    let boostedScore: number | null = null
    try {
      await db.$transaction(async (tx) => {
        // 59-a/64-F1: атомарное списание: параллельные операции не уводят баланс/долг в минус
        const dec = await tx.user.updateMany({
          where: { id: user.id, balance: { gte: pay }, debt: { gte: pay } },
          data: { balance: { decrement: pay }, debt: { decrement: pay } },
        })
        if (dec.count === 0) throw new RepayError('Недостаточно средств')
        const loan = await tx.loan.findFirst({
          where: { userId: user.id, status: { in: ['active', 'overdue'] } },
          orderBy: { takenAt: 'desc' },
        })
        if (loan) {
          const owedLeft = Math.max(0, loan.owed - pay)
          await tx.loan.update({
            where: { id: loan.id },
            data: { owed: owedLeft, status: owedLeft === 0 ? 'repaid' : loan.status, repaidAt: owedLeft === 0 ? new Date() : null },
          })
        }
        await tx.transaction.create({
          data: { userId: user.id, type: 'repay', amount: -pay, note: 'Погашение кредита' },
        })
        const fresh = await tx.user.findUnique({ where: { id: user.id } })
        if (fresh && fresh.debt === 0) {
          // аккуратное погашение повышает кредитный рейтинг
          // 64-F1 (L-10): буст +40 только если кредит держали >= 72 часов —
          // иначе схема «взял → сразу погасил» фармила рейтинг по кругу.
          // Если активного loan-а нет (легаси) — возраст не подтверждён, буста нет.
          const heldMs = loan ? Date.now() - loan.takenAt.getTime() : -1
          if (heldMs >= 72 * 3_600_000) {
            const newScore = Math.min(850, fresh.creditScore + 40)
            await tx.user.update({ where: { id: fresh.id }, data: { creditScore: newScore } })
            boostedScore = newScore
          }
        }
      })
    } catch (err) {
      if (err instanceof RepayError) return Response.json({ error: err.message }, { status: 400 })
      throw err
    }
    if (boostedScore !== null) {
      await notifyUser(user.id, 'system', '🏦 Кредит закрыт', `Долг погашен полностью. Кредитный рейтинг повышен: ${boostedScore}. Лимит и ставка улучшились.`)
    }
    const fresh = await db.user.findUnique({ where: { id: user.id } })
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
  // 59-a: атомарный «захват» права на кредит (debt: 0): два параллельных POST
  // больше не выдают два кредита по одному устаревшему балансу долга
  const claim = await db.user.updateMany({
    where: { id: user.id, debt: 0 },
    data: { balance: { increment: amount }, debt: { increment: owed } },
  })
  if (claim.count === 0) return Response.json({ error: 'Сначала погасите текущий кредит' }, { status: 400 })
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
  await notifyUser(user.id, 'system', '🏦 Кредит выдан', `${fmtMoney(amount)} зачислено на счёт. К возврату ${fmtMoney(owed)} до ${dueAt.toLocaleDateString('ru-RU')}.`)
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance })
}
