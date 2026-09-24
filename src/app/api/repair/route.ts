import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { repairCost, repairMinutes, nextCondition } from '@/lib/economy'
import { notifyUser, bumpStats, bumpQuests, checkAchievements } from '@/lib/deals'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import { fmtMoney } from '@/lib/format'
import type { RepairOrderDTO, InventoryItemDTO } from '@/lib/types'
import { itemImage } from '@/lib/item-images'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const orders = await db.repairOrder.findMany({
    where: { userId: user.id, status: { in: ['in_progress', 'ready'] } },
    orderBy: { startedAt: 'desc' },
  })
  const itemIds = orders.map((o) => o.itemId)
  const items = itemIds.length ? await db.item.findMany({ where: { id: { in: itemIds } } }) : []
  const itemMap = new Map(items.map((i) => [i.id, i]))

  const allItems = await db.item.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'desc' } })
  const listedRows = await db.listing.findMany({
    where: { sellerId: user.id, status: 'active', itemId: { not: null } },
    select: { itemId: true },
  })
  const listedIds = new Set(listedRows.map((l) => l.itemId))
  const inRepairIds = new Set(orders.map((o) => o.itemId))

  const ordersDto: RepairOrderDTO[] = orders.map((o) => {
    const item = itemMap.get(o.itemId)
    return {
      id: o.id,
      itemTitle: item?.title ?? 'Товар',
      itemImage: itemImage(item?.itemKey, item?.category),
      fromCondition: o.fromCondition,
      toCondition: o.toCondition,
      cost: o.cost,
      status: o.status as 'in_progress' | 'ready',
      startedAt: o.startedAt.toISOString(),
      readyAt: o.readyAt.toISOString(),
    }
  })

  const repairable: InventoryItemDTO[] = allItems
    .filter((i) => nextCondition(i.condition) !== null && !listedIds.has(i.id) && !inRepairIds.has(i.id))
    .map((i) => ({
      id: i.id, itemKey: i.itemKey, title: i.title, category: i.category, condition: i.condition,
      image: itemImage(i.itemKey, i.category), baseValue: i.baseValue, purchasePrice: i.purchasePrice,
      estValue: i.baseValue, createdAt: i.createdAt.toISOString(), listed: false,
    }))

  return Response.json({ orders: ordersDto, repairable })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { itemId?: string }
  if (!body.itemId) return Response.json({ error: 'itemId обязателен' }, { status: 400 })
  const item = await db.item.findUnique({ where: { id: body.itemId } })
  if (!item || item.ownerId !== user.id) return Response.json({ error: 'Товар не найден' }, { status: 404 })
  const to = nextCondition(item.condition)
  if (!to) return Response.json({ error: 'Уже в отличном состоянии' }, { status: 400 })
  const busy = await db.repairOrder.count({ where: { itemId: item.id, status: { in: ['in_progress', 'ready'] } } })
  if (busy > 0) return Response.json({ error: 'Товар уже в ремонте' }, { status: 400 })
  const listed = await db.listing.count({ where: { itemId: item.id, status: 'active' } })
  if (listed > 0) return Response.json({ error: 'Сначала снимите товар с продажи' }, { status: 400 })

  const cost = repairCost(item.baseValue)
  if (user.balance < cost) return Response.json({ error: `Нужно ${fmtMoney(cost)}. Недостаточно средств` }, { status: 400 })

  const minutes = repairMinutes()
  await db.user.update({ where: { id: user.id }, data: { balance: { decrement: cost } } })
  await db.transaction.create({
    data: { userId: user.id, type: 'purchase', amount: -cost, note: `Ремонт: ${item.title}` },
  })
  const order = await db.repairOrder.create({
    data: {
      userId: user.id, itemId: item.id, fromCondition: item.condition, toCondition: to,
      cost, readyAt: new Date(Date.now() + minutes * 60_000),
    },
  })
  const quote = {
    fromCondition: item.condition, toCondition: to, cost, minutes,
  }
  await bumpQuests(user.id, 'repair')
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({
    ok: true,
    balance: fresh?.balance ?? user.balance,
    quote,
    order: {
      id: order.id, itemTitle: item.title, itemImage: itemImage(item.itemKey, item.category),
      fromCondition: order.fromCondition, toCondition: order.toCondition, cost: order.cost,
      status: 'in_progress' as const, startedAt: order.startedAt.toISOString(), readyAt: order.readyAt.toISOString(),
    },
  })
}
