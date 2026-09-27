import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** PATCH /api/plates/[id] { isMain } — сделать номер основным. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await params

  const plate = await db.carPlate.findUnique({ where: { id } })
  if (!plate || plate.userId !== user.id) return Response.json({ error: 'Не найдено' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { isMain?: boolean }
  if (body.isMain) {
    await db.$transaction([
      db.carPlate.updateMany({ where: { userId: user.id, isMain: true }, data: { isMain: false } }),
      db.carPlate.update({ where: { id }, data: { isMain: true } }),
    ])
  }
  return Response.json({ ok: true })
}

/** DELETE /api/plates/[id] — снять номер (без возврата денег). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await params

  const plate = await db.carPlate.findUnique({ where: { id } })
  if (!plate || plate.userId !== user.id) return Response.json({ error: 'Не найдено' }, { status: 404 })

  await db.carPlate.delete({ where: { id } })
  return Response.json({ ok: true })
}
