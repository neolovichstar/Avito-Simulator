import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const { id } = await ctx.params
  try {
    const msg = await db.message.delete({ where: { id } })
    await logAdmin('message.delete', 'message', id, `Сообщение от ${msg.senderName}: «${msg.text.slice(0, 80)}»`)
  } catch {
    return Response.json({ error: 'Сообщение не найдено' }, { status: 404 })
  }
  return Response.json({ ok: true })
}
