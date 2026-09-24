import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { deliverDue } from '@/lib/deals'
import type { DeliveryDTO } from '@/lib/types'
import { itemImage } from '@/lib/item-images'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  await deliverDue().catch(() => {})
  const rows = await db.delivery.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const items: DeliveryDTO[] = rows.map((d) => ({
    id: d.id,
    title: d.title,
    image: itemImage(d.itemKey, d.category),
    price: d.price,
    courier: d.courier,
    status: d.status as 'in_transit' | 'delivered',
    listedCondition: d.listedCondition,
    realCondition: d.status === 'delivered' ? d.realCondition : null,
    createdAt: d.createdAt.toISOString(),
    eta: d.eta.toISOString(),
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
  }))
  return Response.json({ items })
}
