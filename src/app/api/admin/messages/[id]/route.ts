import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const { id } = await ctx.params
  try {
    await db.message.delete({ where: { id } })
  } catch {
    return Response.json({ error: 'Сообщение не найдено' }, { status: 404 })
  }
  return Response.json({ ok: true })
}
