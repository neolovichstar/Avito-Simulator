import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { bumpStats, bumpQuests } from '@/lib/deals'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { amount?: number; op?: 'top' | 'withdraw' }
  const amount = Math.round(Number(body.amount))
  if (!Number.isFinite(amount) || amount < 100) return Response.json({ error: 'Минимум 100 ₽' }, { status: 400 })

  if (body.op === 'top') {
    // 59-a: атомарные списание/пополнение: гонка с тратами баланса не уводит счёт в минус
    const dec = await db.user.updateMany({
      where: { id: user.id, balance: { gte: amount } },
      data: { balance: { decrement: amount }, deposit: { increment: amount }, depositAt: new Date() },
    })
    if (dec.count === 0) return Response.json({ error: 'Недостаточно средств на счету' }, { status: 400 })
    await db.transaction.create({ data: { userId: user.id, type: 'deposit', amount: -amount, note: 'Пополнение вклада' } })
    if (user.deposit === 0) {
      await bumpStats(user.id, { deposits: 1 })
      await bumpQuests(user.id, 'deposit')
    }
  } else {
    // 59-a: снятие только при достаточном остатке на вкладе (гонка двух снятий)
    const dec = await db.user.updateMany({
      where: { id: user.id, deposit: { gte: amount } },
      data: { balance: { increment: amount }, deposit: { decrement: amount } },
    })
    if (dec.count === 0) return Response.json({ error: 'На вкладе недостаточно средств' }, { status: 400 })
    await db.transaction.create({ data: { userId: user.id, type: 'withdraw', amount, note: 'Снятие вклада' } })
  }
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, deposit: fresh?.deposit ?? user.deposit })
}
