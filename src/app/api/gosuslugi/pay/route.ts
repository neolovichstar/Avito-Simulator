import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { buildGosFines, fineAmountDue, parseGosStats } from '@/lib/gos-docs'
import { notifyUser } from '@/lib/deals'

export const dynamic = 'force-dynamic'

// POST /api/gosuslugi/pay — оплата штрафа Госуслуг.
// Тело: { fineId }. Сумма НЕ берётся из запроса: сервер пересобирает детерминированный
// набор штрафов за сегодня и находит штраф по id — подделать сумму нельзя.
// Со «скидкой 50%» списывается половина (fineAmountDue, окно в 20 дней).
// Баланс списывается атомарно (updateMany с условием balance >= amount),
// факт оплаты сохраняется в User.stats (gosFinesPaid / gosFinesPaidTotal),
// в банке появляется транзакция типа 'tax' с примечанием «Штраф: …».
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as { fineId?: string }
  const fineId = typeof body.fineId === 'string' ? body.fineId.trim() : ''
  if (!fineId) return Response.json({ error: 'Не указан штраф' }, { status: 400 })

  const now = new Date()
  const fine = buildGosFines(user.id, now).find((f) => f.id === fineId)
  if (!fine) return Response.json({ error: 'Штраф не найден или срок начисления истёк' }, { status: 404 })

  const amount = fineAmountDue(fine, now)
  const stats = parseGosStats(user.stats)
  if (stats.gosFinesPaid?.[fineId]) {
    return Response.json({ error: 'Штраф уже оплачен' }, { status: 400 })
  }
  if (user.balance < amount) {
    return Response.json({ error: 'Недостаточно средств на счёте' }, { status: 400 })
  }

  // атомарное списание (защита от гонки двух параллельных оплат)
  const dec = await db.user.updateMany({
    where: { id: user.id, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  })
  if (dec.count === 0) {
    return Response.json({ error: 'Недостаточно средств на счёте' }, { status: 400 })
  }

  const paidAt = now.toISOString()
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  const merged = parseGosStats(fresh?.stats)
  merged.gosFinesPaid = { ...(merged.gosFinesPaid ?? {}), [fineId]: { a: amount, t: paidAt } }
  merged.gosFinesPaidTotal = (merged.gosFinesPaidTotal ?? 0) + amount
  await db.user
    .update({ where: { id: user.id }, data: { stats: JSON.stringify(merged) } })
    .catch(() => {})

  await db.transaction.create({
    data: {
      userId: user.id,
      type: 'tax',
      amount: -amount,
      note: `Штраф: ${fine.title}`,
    },
  })

  void notifyUser(
    user.id,
    'system',
    'Штраф оплачен',
    `${fine.title} — ${amount} ₽. Квитанция сохранена в Госуслугах.`,
  ).catch(() => {})

  return Response.json({ ok: true, fineId, amount, balance: fresh?.balance ?? user.balance, paidAt })
}
