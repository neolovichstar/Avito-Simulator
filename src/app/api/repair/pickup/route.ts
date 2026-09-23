import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { bumpStats, bumpQuests, checkAchievements, notifyUser } from '@/lib/deals'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { orderId?: string }
  if (!body.orderId) return Response.json({ error: 'orderId обязателен' }, { status: 400 })
  const order = await db.repairOrder.findUnique({ where: { id: body.orderId } })
  if (!order || order.userId !== user.id) return Response.json({ error: 'Заказ не найден' }, { status: 404 })
  if (order.status !== 'ready') return Response.json({ error: 'Ремонт ещё не завершён' }, { status: 400 })

  await db.repairOrder.update({ where: { id: order.id }, data: { status: 'done', doneAt: new Date() } })
  const item = await db.item.update({
    where: { id: order.itemId },
    data: { condition: order.toCondition },
  })
  await bumpStats(user.id, { repairs: 1 })
  await bumpQuests(user.id, 'repair')
  await checkAchievements(user.id)
  await notifyUser(user.id, 'system', 'Товар забран из ремонта', `«${item.title}» теперь в состоянии: улучшено`)
  return Response.json({
    ok: true,
    item: {
      id: item.id, itemKey: item.itemKey, title: item.title, category: item.category,
      condition: item.condition, image: item.image, baseValue: item.baseValue,
      purchasePrice: item.purchasePrice, estValue: item.baseValue,
      createdAt: item.createdAt.toISOString(), listed: false,
    },
  })
}
