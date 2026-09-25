import { getSessionUser, unauthorized } from '@/lib/session'
import { pickupDelivery } from '@/lib/deals'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Игрок забрал посылку из пункта выдачи → вещь в инвентарь (+квест-хуки после факта получения)
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { deliveryId?: string }
  if (!body.deliveryId) return Response.json({ error: 'deliveryId обязателен' }, { status: 400 })

  const res = await pickupDelivery(user.id, body.deliveryId)
  if (!res.ok) return Response.json({ error: res.error ?? 'Не удалось получить посылку' }, { status: 400 })

  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({
    ok: true,
    itemId: res.itemId,
    balance: fresh?.balance ?? user.balance,
    xp: fresh?.xp ?? user.xp,
    level: fresh?.level ?? user.level,
  })
}
