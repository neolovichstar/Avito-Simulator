import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { amount?: number; op?: 'top' | 'withdraw' }
  const amount = Math.round(Number(body.amount))
  if (!Number.isFinite(amount) || amount < 100) return Response.json({ error: 'Минимум 100 ₽' }, { status: 400 })

  if (body.op === 'top') {
    if (user.balance < amount) return Response.json({ error: 'Недостаточно средств на счету' }, { status: 400 })
    await db.user.update({
      where: { id: user.id },
      data: { balance: { decrement: amount }, deposit: { increment: amount }, depositAt: new Date() },
    })
    await db.transaction.create({ data: { userId: user.id, type: 'deposit', amount: -amount, note: 'Пополнение вклада' } })
  } else {
    if (user.deposit < amount) return Response.json({ error: 'На вкладе недостаточно средств' }, { status: 400 })
    await db.user.update({
      where: { id: user.id },
      data: { balance: { increment: amount }, deposit: { decrement: amount } },
    })
    await db.transaction.create({ data: { userId: user.id, type: 'withdraw', amount, note: 'Снятие вклада' } })
  }
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, deposit: fresh?.deposit ?? user.deposit })
}
