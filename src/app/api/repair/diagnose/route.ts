import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { fmtMoney } from '@/lib/format'
import { repairCost } from '@/lib/economy'
import { diagnose } from '@/lib/parts'

export const dynamic = 'force-dynamic'

// Диагностика (платная, мгновенная): показывает узлы с износом и
// рекомендованную запчасть. После диагностики ремонт дешевле и проще.
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { itemId?: string }
  if (!body.itemId) return Response.json({ error: 'itemId обязателен' }, { status: 400 })
  const item = await db.item.findUnique({ where: { id: body.itemId } })
  if (!item || item.ownerId !== user.id) return Response.json({ error: 'Товар не найден' }, { status: 404 })
  const listed = await db.listing.count({ where: { itemId: item.id, status: 'active' } })
  if (listed > 0) return Response.json({ error: 'Сначала снимите товар с продажи' }, { status: 400 })

  const fee = Math.max(150, Math.round(repairCost(item.baseValue) * 0.15))
  if (user.balance < fee) {
    return Response.json({ error: `Диагностика стоит ${fmtMoney(fee)}. Недостаточно средств` }, { status: 400 })
  }

  const faults = diagnose(item, item.condition)

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: fee } } })
    await tx.transaction.create({
      data: { userId: user.id, type: 'purchase', amount: -fee, note: `Диагностика: ${item.title}` },
    })
    await tx.repairJob.create({
      data: {
        userId: user.id, itemId: item.id, kind: 'diagnose', status: 'done',
        faults: JSON.stringify(faults), cost: fee, finishedAt: new Date(),
      },
    })
  })

  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { balance: true } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, faults })
}
