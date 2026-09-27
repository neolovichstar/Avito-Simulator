import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { payInvoice } from '@/lib/chat-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { invoiceId?: string }
  if (!body.invoiceId) return Response.json({ error: 'invoiceId обязателен' }, { status: 400 })

  const res = await payInvoice(id, body.invoiceId, user)
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 })

  const fresh = await db.user.findUnique({ where: { id: user.id } })
  const messages = await db.message.findMany({
    where: { chatId: id }, orderBy: { createdAt: 'asc' }, take: 50,
  })
  return Response.json({
    ok: true,
    balance: fresh?.balance ?? user.balance,
    xp: fresh?.xp ?? user.xp,
    level: fresh?.level ?? user.level,
    messages: messages.map((m) => ({
      id: m.id, senderType: m.senderType as 'user' | 'bot' | 'system', senderId: m.senderId,
      senderName: m.senderName, kind: m.kind as 'text' | 'invoice' | 'system', text: m.text,
      amount: m.amount, invoiceId: m.invoiceId, paid: m.paid,
      createdAt: m.createdAt.toISOString(), mine: m.senderId === user.id,
    })),
  })
}
