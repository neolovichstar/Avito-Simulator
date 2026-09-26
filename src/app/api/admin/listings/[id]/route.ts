import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const status = String(body?.status ?? '')

  if (!['active', 'removed'].includes(status)) {
    return Response.json({ error: 'Допустимые статусы: active, removed' }, { status: 400 })
  }

  const listing = await db.listing.findUnique({ where: { id } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.status === 'sold') {
    return Response.json({ error: 'Проданное объявление менять нельзя' }, { status: 400 })
  }

  await db.listing.update({ where: { id }, data: { status } })
  return Response.json({ ok: true })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const { id } = await ctx.params
  const listing = await db.listing.findUnique({ where: { id } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })

  // аккуратно снимаем зависимости, затем само объявление
  await db.$transaction(async (tx) => {
    await tx.favorite.deleteMany({ where: { listingId: id } })
    await tx.complaint.deleteMany({ where: { listingId: id } })
    await tx.review.deleteMany({ where: { listingId: id } })
    const chats = await tx.chat.findMany({ where: { listingId: id }, select: { id: true } })
    if (chats.length) {
      await tx.message.deleteMany({ where: { chatId: { in: chats.map((c) => c.id) } } })
      await tx.chat.deleteMany({ where: { id: { in: chats.map((c) => c.id) } } })
    }
    await tx.listing.delete({ where: { id } })
  })

  return Response.json({ ok: true })
}
