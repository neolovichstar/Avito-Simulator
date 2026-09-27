import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const s = await db.savedSearch.findUnique({ where: { id } })
  if (!s || s.userId !== user.id) {
    return Response.json({ error: 'Поиск не найден' }, { status: 404 })
  }
  await db.savedSearch.delete({ where: { id } })
  return Response.json({ ok: true })
}
