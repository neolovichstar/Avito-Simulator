import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// Лёгкий эндпоинт для бейджей в сайдбаре (поллится каждые ~20 сек).
export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const now = new Date()
  const [complaints, liveAuctions, stuckDeliveries, stuckRepairs] = await Promise.all([
    db.complaint.count(),
    db.auctionLot.count({ where: { status: 'active' } }),
    db.delivery.count({ where: { eta: { lt: now }, status: { in: ['collecting', 'in_transit', 'arrived'] } } }),
    db.repairOrder.count({ where: { readyAt: { lt: now }, status: 'in_progress' } }),
  ])

  return Response.json({ complaints, liveAuctions, opsStuck: stuckDeliveries + stuckRepairs })
}
