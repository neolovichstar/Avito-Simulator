import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const { id } = await ctx.params
  try {
    const ev = await db.marketEvent.delete({ where: { id } })
    await logAdmin('market.event.delete', 'market', id, `Событие «${ev?.headline ?? id}» удалено`)
  } catch {}
  return Response.json({ ok: true })
}
