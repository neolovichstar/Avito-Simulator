import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { deliverDue } from '@/lib/deals'
import { collectSecondsFor, pickupSecondsFor, PICKUP_WINDOW_MS } from '@/lib/economy'
import type { DeliveryDTO } from '@/lib/types'
import { itemImage } from '@/lib/item-images'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  // ленивый тик: статусы едут, даже если движок ещё не добежал
  await deliverDue().catch(() => {})
  const rows = await db.delivery.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const items: DeliveryDTO[] = rows.map((d) => {
    const collectSec = d.kind === 'sale' ? pickupSecondsFor(d.id) : collectSecondsFor(d.id)
    return {
      id: d.id,
      kind: d.kind as 'purchase' | 'sale',
      listingId: d.listingId,
      title: d.title,
      image: itemImage(d.itemKey, d.category),
      price: d.price,
      courier: d.courier,
      status: d.status as DeliveryDTO['status'],
      listedCondition: d.listedCondition,
      realCondition: d.status === 'delivered' ? d.realCondition : null,
      createdAt: d.createdAt.toISOString(),
      collectEndsAt: new Date(d.createdAt.getTime() + collectSec * 1000).toISOString(),
      eta: d.eta.toISOString(),
      pickupDeadline: d.kind === 'purchase' ? new Date(d.eta.getTime() + PICKUP_WINDOW_MS).toISOString() : null,
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
    }
  })
  return Response.json({ items })
}
