import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { botReply } from '@/lib/chat-engine'
import { redisLimit } from '@/lib/redis'
import { bumpStats, bumpQuests } from '@/lib/deals'
import { emitTo } from '@/lib/realtime-emit'
import { stripEmoji } from '@/lib/format'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  if (!(await redisLimit(`msg:${user.id}`, 15, 60_000))) {
    return Response.json({ error: 'Слишком быстро. Бот ещё печатает' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string; invoice?: number }
  const text = body.text?.trim().slice(0, 400)
  const invoice = body.invoice !== undefined ? Math.round(Number(body.invoice)) : undefined
  if (!text && !invoice) return Response.json({ error: 'Пустое сообщение' }, { status: 400 })
  if (invoice !== undefined && (!Number.isFinite(invoice) || invoice < 0 || invoice > 10_000_000)) {
    return Response.json({ error: 'Некорректная сумма счёта' }, { status: 400 })
  }

  const chat = await db.chat.findUnique({ where: { id } })
  if (!chat) return Response.json({ error: 'Чат не найден' }, { status: 404 })
  if (chat.buyerId !== user.id && chat.sellerId !== user.id) {
    return Response.json({ error: 'Нет доступа' }, { status: 403 })
  }
  const counterpartId = chat.buyerId === user.id ? chat.sellerId : chat.buyerId
  const counterpart = await db.user.findUnique({ where: { id: counterpartId } })
  if (!counterpart) return Response.json({ error: 'Собеседник не найден' }, { status: 404 })

  // сохранить сообщение игрока
  const msg = await db.message.create({
    data: {
      chatId: chat.id, senderType: 'user', senderId: user.id, senderName: user.displayName,
      kind: invoice !== undefined ? 'invoice' : 'text',
      text: invoice !== undefined ? `Выставлен счёт: ${invoice.toLocaleString('ru-RU')} ₽` : stripEmoji(text ?? ''),
      amount: invoice ?? null,
      invoiceId: invoice !== undefined ? `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` : null,
    },
  })
  await db.chat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } })
  const dto = {
    chatId: chat.id,
    message: {
      id: msg.id, senderType: 'user' as const, senderId: user.id, senderName: user.displayName,
      kind: msg.kind as 'text' | 'invoice' | 'system', text: msg.text, amount: msg.amount,
      invoiceId: msg.invoiceId, paid: msg.paid, createdAt: msg.createdAt.toISOString(), mine: true,
    },
  }
  await emitTo(`chat:${chat.id}`, 'chat:message', dto)
  await emitTo(`user:${counterpartId}`, 'chat:message', dto)

  await bumpStats(user.id, { chat: 1 })
  await bumpQuests(user.id, 'chat')

  // если собеседник — бот, получаем ответ ИИ
  if (counterpart.isBot) {
    await botReply(chat.id, { text: text ?? undefined, invoice }).catch((e) => {
      console.error('[chat] botReply error:', e)
    })
  }

  const messages = await db.message.findMany({
    where: { chatId: chat.id },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  return Response.json({
    messages: messages.map((m) => ({
      id: m.id, senderType: m.senderType as 'user' | 'bot' | 'system', senderId: m.senderId,
      senderName: m.senderName, kind: m.kind as 'text' | 'invoice' | 'system', text: m.text,
      amount: m.amount, invoiceId: m.invoiceId, paid: m.paid,
      createdAt: m.createdAt.toISOString(), mine: m.senderId === user.id,
    })),
  })
}
