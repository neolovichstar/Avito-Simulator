import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { isOnline } from '@/lib/dto'
import { itemImage } from '@/lib/item-images'
import { parseChatMeta, personaOf } from '@/lib/chat-engine'
import { getBotMemoryEntry, computeMood } from '@/lib/bot-memory'
import { collectSecondsFor, pickupSecondsFor, PICKUP_WINDOW_MS } from '@/lib/economy'
import type { ChatDeliveryDTO } from '@/lib/types'

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

  // посылка этой сделки для текущего пользователя (покупатель — доставка товара,
  // продавец — курьер/деньги). Рисуется в чате статус-строкой с прогрессом (28-b)
  const deliveryRow = await db.delivery.findFirst({
    where: { listingId: chat.listingId, userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  let delivery: ChatDeliveryDTO | null = null
  if (deliveryRow) {
    const collectSec = deliveryRow.kind === 'sale' ? pickupSecondsFor(deliveryRow.id) : collectSecondsFor(deliveryRow.id)
    delivery = {
      id: deliveryRow.id,
      kind: deliveryRow.kind as 'purchase' | 'sale',
      status: deliveryRow.status as ChatDeliveryDTO['status'],
      title: deliveryRow.title,
      price: deliveryRow.price,
      createdAt: deliveryRow.createdAt.toISOString(),
      collectEndsAt: new Date(deliveryRow.createdAt.getTime() + collectSec * 1000).toISOString(),
      eta: deliveryRow.eta.toISOString(),
      pickupDeadline: deliveryRow.kind === 'purchase' ? new Date(deliveryRow.eta.getTime() + PICKUP_WINDOW_MS).toISOString() : null,
    }
  }

  // Честный индикатор настроения бота (28-a): по meta чата и персистентной памяти
  // бота об игроке. Перезаход в чат позицию бота не меняет — память серверная.
  let mood: ReturnType<typeof computeMood> | undefined
  let lastBotOffer: number | null = null
  if (counterpart.isBot) {
    const meta = parseChatMeta(chat.meta)
    lastBotOffer = meta.lastOffer ?? null
    const memory = user.isBot ? null : await getBotMemoryEntry(user.id, counterpart.id)
    mood = computeMood({
      closed: meta.closed,
      rounds: meta.rounds,
      patience: meta.patience ?? personaOf(counterpart).patience,
      lowballStreak: meta.lowballStreak,
      entry: memory,
      listingSold: chat.listing.status === 'sold',
    })
  }

  return Response.json({
    id: chat.id,
    listing: {
      id: chat.listing.id, title: chat.listing.title, price: chat.listing.price,
      image: itemImage(chat.listing.itemKey, chat.listing.category), status: chat.listing.status, condition: chat.listing.condition,
    },
    counterpart: {
      id: counterpart.id, displayName: counterpart.displayName, isBot: counterpart.isBot,
      online: isOnline(counterpart), lastSeenAt: counterpart.lastSeenAt.toISOString(),
      rating: counterpart.ratingCount ? Math.round((counterpart.ratingSum / counterpart.ratingCount) * 10) / 10 : 0,
      ratingCount: counterpart.ratingCount,
    },
    role: chat.buyerId === user.id ? ('buyer' as const) : ('seller' as const),
    delivery,
    mood,
    lastBotOffer,
    messages: chat.messages.map((m) => ({
      id: m.id, senderType: m.senderType as 'user' | 'bot' | 'system', senderId: m.senderId,
      senderName: m.senderName, kind: m.kind as 'text' | 'invoice' | 'system', text: m.text,
      amount: m.amount, invoiceId: m.invoiceId, paid: m.paid,
      createdAt: m.createdAt.toISOString(), mine: m.senderId === user.id,
    })),
  })
}
