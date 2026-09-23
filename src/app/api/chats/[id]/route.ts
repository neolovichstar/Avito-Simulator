import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { isOnline } from '@/lib/dto'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const chat = await db.chat.findUnique({
    where: { id },
    include: { listing: true, messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
  })
  if (!chat) return Response.json({ error: 'Чат не найден' }, { status: 404 })
  if (chat.buyerId !== user.id && chat.sellerId !== user.id) {
    return Response.json({ error: 'Нет доступа' }, { status: 403 })
  }
  const counterpartId = chat.buyerId === user.id ? chat.sellerId : chat.buyerId
  const counterpart = await db.user.findUnique({ where: { id: counterpartId } })
  if (!counterpart) return Response.json({ error: 'Собеседник не найден' }, { status: 404 })

  await db.message.updateMany({
    where: { chatId: chat.id, readAt: null, NOT: { senderId: user.id } },
    data: { readAt: new Date() },
  })

  return Response.json({
    id: chat.id,
    listing: {
      id: chat.listing.id, title: chat.listing.title, price: chat.listing.price,
      image: chat.listing.image, status: chat.listing.status, condition: chat.listing.condition,
    },
    counterpart: {
      id: counterpart.id, displayName: counterpart.displayName, isBot: counterpart.isBot,
      online: isOnline(counterpart),
      rating: counterpart.ratingCount ? Math.round((counterpart.ratingSum / counterpart.ratingCount) * 10) / 10 : 0,
      ratingCount: counterpart.ratingCount,
    },
    role: chat.buyerId === user.id ? ('buyer' as const) : ('seller' as const),
    messages: chat.messages.map((m) => ({
      id: m.id, senderType: m.senderType as 'user' | 'bot' | 'system', senderId: m.senderId,
      senderName: m.senderName, kind: m.kind as 'text' | 'invoice' | 'system', text: m.text,
      amount: m.amount, invoiceId: m.invoiceId, paid: m.paid,
      createdAt: m.createdAt.toISOString(), mine: m.senderId === user.id,
    })),
  })
}
