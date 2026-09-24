import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { notifyUser } from '@/lib/deals'
import { emitTo } from '@/lib/realtime-emit'
import { personaOf } from '@/lib/chat-engine'
import { stripEmoji } from '@/lib/format'

export const dynamic = 'force-dynamic'

const REASONS = ['spam', 'fake', 'scam', 'wrong', 'other']
const REASON_LABEL: Record<string, string> = {
  spam: 'Реклама или спам',
  fake: 'Товар не существует',
  scam: 'Похоже на обман',
  wrong: 'Неверное описание или цена',
  other: 'Другое',
}
const COMPLAINT_THRESHOLD = 3

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  if (!rateLimit(`complaint:${user.id}`, 5, 60_000)) {
    return Response.json({ error: 'Слишком много жалоб, подождите минуту' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string }
  const reason = REASONS.includes(body.reason ?? '') ? (body.reason as string) : 'other'

  const listing = await db.listing.findUnique({ where: { id }, include: { seller: true } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.sellerId === user.id) {
    return Response.json({ error: 'Нельзя пожаловаться на своё объявление' }, { status: 400 })
  }
  if (listing.status !== 'active') {
    return Response.json({ error: 'Объявление уже не активно' }, { status: 400 })
  }

  const dup = await db.complaint.findUnique({
    where: { listingId_fromUserId: { listingId: id, fromUserId: user.id } },
  })
  if (dup) {
    return Response.json({ error: 'Вы уже отправляли жалобу на это объявление' }, { status: 409 })
  }

  await db.complaint.create({
    data: { listingId: id, fromUserId: user.id, reason },
  })
  const count = await db.complaint.count({ where: { listingId: id } })
  await db.listing.update({ where: { id }, data: { complaintCount: count } })

  // Модерация: после 3 жалоб объявление бота снимается с публикации
  if (count >= COMPLAINT_THRESHOLD && listing.seller.isBot) {
    await db.listing.update({ where: { id }, data: { status: 'removed' } })
    const reporters = await db.complaint.findMany({
      where: { listingId: id },
      select: { fromUserId: true },
    })
    for (const r of reporters) {
      await notifyUser(
        r.fromUserId,
        'system',
        'Жалоба удовлетворена',
        `Объявление «${listing.title}» снято с публикации после проверки модератором.`,
      )
    }
  } else if (count === 1) {
    await notifyUser(
      user.id,
      'system',
      'Жалоба принята',
      `Спасибо, мы проверим объявление «${listing.title}». Решение придёт в уведомлениях.`,
    )
  }

  // Бот-продавец узнаёт о жалобе и оправдывается в чате по-человечески
  if (listing.seller.isBot) {
    setTimeout(() => {
      botComplaintDefense(listing.id, listing.sellerId, user.id, listing.title, reason).catch(() => {})
    }, 6000 + Math.random() * 9000)
  }

  return Response.json({ ok: true, complaints: count })
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const [complaint, count] = await Promise.all([
    db.complaint.findUnique({
      where: { listingId_fromUserId: { listingId: id, fromUserId: user.id } },
    }),
    db.complaint.count({ where: { listingId: id } }),
  ])
  return Response.json({
    complainedByMe: !!complaint,
    reason: complaint ? REASON_LABEL[complaint.reason] ?? complaint.reason : null,
    complaints: count,
  })
}

// Продавец-бот «узнаёт» о жалобе и пишет пострадавшему... то есть жалобщику
async function botComplaintDefense(
  listingId: string,
  botId: string,
  complainantId: string,
  title: string,
  reason: string,
) {
  const bot = await db.user.findUnique({ where: { id: botId } })
  if (!bot) return
  const p = personaOf(bot)

  const byReason: Record<string, string[]> = {
    scam: [
      ` вижу жалобу по ${title}. какой обман? я всё честно написал, состояние в описании, фото реальные`,
      `это что за жалоба на объявление? товар как на фото, спрашивай если что непонятно, а жаловаться не надо`,
    ],
    fake: [
      `жалоба "товар не существует"? он у меня дома стоит, фото вчера делал. кому показывать будем`,
      `не существует у него... а я по чём тогда продаю? товар есть, приехали посмотрим`,
    ],
    wrong: [
      `по описанию всё точно было. что именно не понравилось? цену не сбиваю, состояние честное`,
      `что неверного в описании? я не перекуп, сам пользовался, всё как есть написал`,
    ],
    spam: [
      `спам? это обычное объявление как у всех. не нравится цена пройди мимо, зачем жаловаться`,
      `какой спам, продаю одну вещь. ладно, удачи в поисках`,
    ],
    other: [
      `вижу, жалоба была. если что-то не так скажи прямо в чат, договоримся. на ровном месте жаловаться не красиво`,
      `жалобу получил. я нормальный продавец, отзывы посмотри. вопросы задавай, я не кусаюсь`,
    ],
  }
  const variants = byReason[reason] ?? byReason.other
  const raw = variants[Math.floor(Math.random() * variants.length)]
  const text = stripEmoji(p.phrases.length && Math.random() < 0.25 ? `${raw}. ${p.phrases[Math.floor(Math.random() * p.phrases.length)]}` : raw).slice(0, 400)

  // Существующий чат жалобщика с этим продавцом по этому товару (или создаём)
  let chat = await db.chat.findFirst({
    where: { listingId, sellerId: botId, buyerId: complainantId },
  })
  if (!chat) {
    chat = await db.chat.create({
      data: {
        listingId, sellerId: botId, buyerId: complainantId,
        meta: JSON.stringify({ botRole: 'seller', botLimit: 0, rounds: 0, closed: true }),
      },
    })
  }

  const m = await db.message.create({
    data: {
      chatId: chat.id, senderType: 'bot', senderId: bot.id, senderName: bot.displayName,
      kind: 'text', text,
    },
  })
  await db.chat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } })

  const dto = {
    chatId: chat.id,
    message: {
      id: m.id, senderType: 'bot' as const, senderId: bot.id, senderName: bot.displayName,
      kind: m.kind as 'text' | 'invoice' | 'system', text: m.text, amount: m.amount,
      invoiceId: m.invoiceId, paid: m.paid, createdAt: m.createdAt.toISOString(), mine: false,
    },
  }
  await emitTo(`chat:${chat.id}`, 'chat:message', dto)
  await emitTo(`user:${complainantId}`, 'chat:message', dto)
  await notifyUser(complainantId, 'message', bot.displayName, m.text.slice(0, 80))
}
