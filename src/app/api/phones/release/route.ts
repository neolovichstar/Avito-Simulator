import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * POST /api/phones/release { id } — отпустить номер.
 * Бронь удаляется совсем (номер в общий пул), купленный помечается released
 * и остаётся в истории прокруток (digits не переиспользуется).
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as { id?: string }
  if (!body.id) return Response.json({ error: 'Не указан номер' }, { status: 400 })

  const phone = await db.phoneNumber.findFirst({ where: { id: body.id, userId: user.id } })
  if (!phone) return Response.json({ error: 'Номер не найден' }, { status: 404 })

  if (phone.status === 'reserved') {
    // Ещё не выкуплен — убираем совсем, чтобы не висел бронею.
    await db.phoneNumber.delete({ where: { id: phone.id } })
  } else {
    await db.phoneNumber.update({
      where: { id: phone.id },
      data: { status: 'released', isMain: false },
    })
  }

  return Response.json({ ok: true })
}
