import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { makeMainPhone } from '@/lib/phone-server'

export const dynamic = 'force-dynamic'

/** POST /api/phones/set-main { id } — закрепить свой активный номер как основной. */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as { id?: string }
  if (!body.id) return Response.json({ error: 'Не указан номер' }, { status: 400 })

  const phone = await db.phoneNumber.findFirst({
    where: { id: body.id, userId: user.id, status: 'active' },
  })
  if (!phone) return Response.json({ error: 'Активный номер не найден' }, { status: 404 })

  if (!phone.isMain) {
    await db.$transaction(async (tx) => {
      await makeMainPhone(tx, user.id, phone.id)
    })
  }

  return Response.json({ ok: true })
}
