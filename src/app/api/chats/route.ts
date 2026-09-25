import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { isOnline } from '@/lib/dto'
import { botOpener, personaOf, parseChatMeta, coldOpenerLine } from '@/lib/chat-engine'
import { CONDITION_MULT } from '@/lib/catalog-types'
import { getCategoryMult } from '@/lib/engine'
import { getMarketValue } from '@/lib/market-index'
import { getBotMemoryEntry, hasActiveCooldown, memoryLimitShift, computeMood } from '@/lib/bot-memory'
import type { ChatListItem } from '@/lib/types'
import { itemImage } from '@/lib/item-images'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const chats = await db.chat.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
      listing: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  const userIds = new Set<string>()
  chats.forEach((c) => { userIds.add(c.buyerId); userIds.add(c.sellerId) })
  const users = await db.user.findMany({ where: { id: { in: [...userIds] } } })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const out: ChatListItem[] = []
  for (const c of chats) {
    const counterpartId = c.buyerId === user.id ? c.sellerId : c.buyerId
    const counterpart = userMap.get(counterpartId)
    if (!counterpart) continue
    const last = c.messages[0]
    const unread = await db.message.count({
      where: {
        chatId: c.id, readAt: null,
        NOT: { senderId: user.id },
      },
    })
    out.push({
      id: c.id,
      listingId: c.listingId,
      listingTitle: c.listing.title,
      listingImage: itemImage(c.listing.itemKey, c.listing.category),
      listingPrice: c.listing.price,
      listingStatus: c.listing.status,
      lastMessage: last ? {
        text: last.text, kind: last.kind, createdAt: last.createdAt.toISOString(),
        mine: last.senderId === user.id,
      } : null,
      counterpart: {
        id: counterpart.id, displayName: counterpart.displayName,
        isBot: counterpart.isBot, online: isOnline(counterpart),
      },
      unread,
      role: c.buyerId === user.id ? 'buyer' : 'seller',
    })
  }
  return Response.json({ items: out })
}

// Открыть чат по объявлению (создать, если нет)
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { listingId?: string }
  if (!body.listingId) return Response.json({ error: 'listingId обязателен' }, { status: 400 })
  const listing = await db.listing.findUnique({ where: { id: body.listingId }, include: { seller: true } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.sellerId === user.id) return Response.json({ error: 'Это ваше объявление' }, { status: 400 })

  let chat = await db.chat.findFirst({
    where: { listingId: listing.id, buyerId: user.id, sellerId: listing.sellerId },
  })

  if (!chat && listing.seller.isBot) {
    // ---------- ПАМЯТЬ (28-a): продавец-бот знает свою историю с этим игроком ----------
    const memory = await getBotMemoryEntry(user.id, listing.seller.id)
    const cooldown = hasActiveCooldown(memory)
    const persona = personaOf(listing.seller)

    const mult = await getCategoryMult(listing.category)
    // рынок (28-a): динамический индекс цен — горячий товар дороже, бот это знает
    const marketValue = await getMarketValue(listing.baseValue, listing.itemKey, listing.condition).catch(() => 0)
    const est = Math.max(
      listing.baseValue * (CONDITION_MULT[listing.condition] ?? 0.8) * mult,
      marketValue,
    )
    // Сложность ботов растёт с уровнем игрока: опытному торговцу бот уступает меньше.
    // 28-a: базовая уступка срезана (0.87+0.07 → 0.90+0.06) — перекупство тяжелее.
    const levelFactor = Math.min(0.05, Math.max(0, (user.level - 1) * 0.0035))
    // Характер личности: жадные держат цену (+), доверчивые уступают раньше (−)
    const greedShift = (persona.greed - 0.5) * 0.06
    const trustShift = (0.5 - persona.trust) * 0.04
    // Память: лоуболеры/кидалы/грубияны торгуются хуже, чистые игроки — чуть лучше
    const memShift = cooldown ? 0.2 : memoryLimitShift(memory)
    const limit = Math.max(
      Math.round(est * (cooldown ? 0.6 : 0.45)),
      Math.min(Math.round(listing.price * 0.97), Math.round(listing.price * (0.90 + Math.random() * 0.06 + levelFactor + greedShift + trustShift + memShift))),
    )
    chat = await db.chat.create({
      data: {
        listingId: listing.id, buyerId: user.id, sellerId: listing.sellerId,
        meta: JSON.stringify({
          botRole: 'seller', botLimit: limit, rounds: 0,
          patience: cooldown ? Math.max(1, persona.patience - 2) : persona.patience,
          cold: cooldown,
        }),
      },
    })
    // холодный opener: бот помнит обиды и не здоровается по-доброму
    const openerText = cooldown ? coldOpenerLine() : null
    if (openerText) {
      await db.message.create({
        data: {
          chatId: chat.id, senderType: 'bot', senderId: listing.seller.id,
          senderName: listing.seller.displayName, kind: 'text', text: openerText,
        },
      })
    } else {
      const opener = botOpener(chat, listing, listing.seller)
      await db.message.create({
        data: {
          chatId: chat.id, senderType: 'bot', senderId: listing.seller.id,
          senderName: listing.seller.displayName, kind: 'text', text: opener.text,
        },
      })
    }
  } else if (!chat) {
    chat = await db.chat.create({
      data: { listingId: listing.id, buyerId: user.id, sellerId: listing.sellerId, meta: JSON.stringify({}) },
    })
  }

  const messages = await db.message.findMany({
    where: { chatId: chat.id },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  await db.message.updateMany({
    where: { chatId: chat.id, readAt: null, NOT: { senderId: user.id } },
    data: { readAt: new Date() },
  })

  // настроение бота (честный индикатор) + последняя цена бота для чипов
  const chatMeta = parseChatMeta(chat.meta)
  const memory = listing.seller.isBot && !user.isBot ? await getBotMemoryEntry(user.id, listing.seller.id) : null
  const mood = listing.seller.isBot
    ? computeMood({
        closed: chatMeta.closed,
        rounds: chatMeta.rounds,
        patience: chatMeta.patience ?? personaOf(listing.seller).patience,
        lowballStreak: chatMeta.lowballStreak,
        entry: memory,
        listingSold: listing.status === 'sold',
      })
    : undefined

  return Response.json({
    id: chat.id,
    listing: {
      id: listing.id, title: listing.title, price: listing.price, image: itemImage(listing.itemKey, listing.category),
      status: listing.status, condition: listing.condition,
    },
    counterpart: {
      id: listing.seller.id, displayName: listing.seller.displayName, isBot: listing.seller.isBot,
      online: isOnline(listing.seller), rating: listing.seller.ratingCount
        ? Math.round((listing.seller.ratingSum / listing.seller.ratingCount) * 10) / 10 : 0,
      ratingCount: listing.seller.ratingCount,
    },
    role: 'buyer' as const,
    mood,
    lastBotOffer: chatMeta.lastOffer ?? null,
    messages: messages.map((m) => ({
      id: m.id, senderType: m.senderType as 'user' | 'bot' | 'system', senderId: m.senderId,
      senderName: m.senderName, kind: m.kind as 'text' | 'invoice' | 'system', text: m.text,
      amount: m.amount, invoiceId: m.invoiceId, paid: m.paid,
      createdAt: m.createdAt.toISOString(), mine: m.senderId === user.id,
    })),
  })
}
