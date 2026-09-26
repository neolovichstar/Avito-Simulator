import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const url = new URL(req.url)
  const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get('limit') ?? '60', 10) || 60))

  const messages = await db.message.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      chat: {
        include: {
          listing: { select: { title: true } },
        },
      },
    },
  })

  // имена покупателя/продавца
  const userIds = [...new Set(messages.flatMap((m) => [m.chat.buyerId, m.chat.sellerId]))]
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })
    : []
  const nameMap = new Map(users.map((u) => [u.id, u.displayName]))

  return Response.json({
    rows: messages.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderType: m.senderType,
      senderName: m.senderName,
      kind: m.kind,
      text: m.text,
      amount: m.amount,
      paid: m.paid,
      createdAt: m.createdAt.toISOString(),
      listingTitle: m.chat.listing.title,
      buyerName: nameMap.get(m.chat.buyerId) ?? '—',
      sellerName: nameMap.get(m.chat.sellerId) ?? '—',
    })),
  })
}
