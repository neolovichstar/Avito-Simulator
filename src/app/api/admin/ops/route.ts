import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// Операционный мониторинг: доставки и ремонты в работе,
// зависшие (просроченные) подсвечиваются.
export async function GET(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const now = new Date()

  const [deliveries, repairs] = await Promise.all([
    db.delivery.findMany({
      where: { status: { in: ['collecting', 'in_transit', 'arrived'] } },
      orderBy: { eta: 'asc' },
      take: 100,
      include: { user: { select: { displayName: true, isBot: true } } },
    }),
    db.repairOrder.findMany({
      where: { status: 'in_progress' },
      orderBy: { readyAt: 'asc' },
      take: 100,
      include: { user: { select: { displayName: true, isBot: true } } },
    }),
  ])

  const summary = {
    deliveriesInWork: deliveries.length,
    deliveriesStuck: deliveries.filter((d) => d.eta < now).length,
    repairsInWork: repairs.length,
    repairsStuck: repairs.filter((r) => r.readyAt < now).length,
  }

  return Response.json({
    summary,
    deliveries: deliveries.map((d) => ({
      id: d.id,
      kind: d.kind,
      status: d.status,
      title: d.title,
      image: d.image,
      price: d.price,
      courier: d.courier,
      userName: d.user.displayName,
      userIsBot: d.user.isBot,
      eta: d.eta.toISOString(),
      stuck: d.eta < now,
      createdAt: d.createdAt.toISOString(),
    })),
    repairs: repairs.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      fromCondition: r.fromCondition,
      toCondition: r.toCondition,
      cost: r.cost,
      userName: r.user.displayName,
      userIsBot: r.user.isBot,
      readyAt: r.readyAt.toISOString(),
      stuck: r.readyAt < now,
      startedAt: r.startedAt.toISOString(),
    })),
  })
}
