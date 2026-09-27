import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return Response.json({ error: 'Игрок не найден' }, { status: 404 })

  const balanceDelta = Number(body?.balanceDelta)
  const creditScore = Number(body?.creditScore)
  const taxDebtReset = !!body?.taxDebtReset

  const data: Record<string, unknown> = {}
  if (Number.isFinite(balanceDelta) && balanceDelta !== 0) data.balance = { increment: Math.round(balanceDelta) }
  if (taxDebtReset) data.taxDebt = 0
  if (Number.isFinite(creditScore)) data.creditScore = Math.min(900, Math.max(300, Math.round(creditScore)))

  if (Object.keys(data).length === 0) return Response.json({ error: 'Нечего изменять' }, { status: 400 })

  const updated = await db.user.update({ where: { id }, data })

  if (Number.isFinite(balanceDelta) && balanceDelta !== 0) {
    await db.transaction.create({
      data: {
        userId: id,
        type: 'admin',
        amount: Math.round(balanceDelta),
        note: 'Корректировка через админ-панель',
      },
    })
  }

  const changes: string[] = []
  if (Number.isFinite(balanceDelta) && balanceDelta !== 0)
    changes.push(`баланс ${balanceDelta > 0 ? '+' : ''}${Math.round(balanceDelta)} ₽`)
  if (taxDebtReset) changes.push('налоговый долг списан')
  if (Number.isFinite(creditScore)) changes.push(`кредитный скор → ${updated.creditScore}`)
  await logAdmin('user.update', 'user', id, `${user.displayName} (@${user.username}): ${changes.join(', ')}`)

  return Response.json({ ok: true, user: { balance: updated.balance, taxDebt: updated.taxDebt, creditScore: updated.creditScore } })
}
