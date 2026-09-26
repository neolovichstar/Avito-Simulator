import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

// Отклонить жалобу (удалить её). Объявление не трогаем —
// снять с публикации можно отдельно из карточки жалобы или раздела «Объявления».
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const { id } = await ctx.params
  try {
    const c = await db.complaint.delete({ where: { id } })
    await logAdmin('complaint.dismiss', 'complaint', id, `Жалоба отклонена (объявление #${c.listingId.slice(-6)}, причина: ${c.reason})`)
  } catch {
    return Response.json({ error: 'Жалоба не найдена' }, { status: 404 })
  }
  return Response.json({ ok: true })
}
