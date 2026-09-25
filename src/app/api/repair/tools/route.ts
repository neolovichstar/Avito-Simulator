import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { fmtMoney } from '@/lib/format'
import { TOOLS } from '@/lib/parts'
import { toolsDto } from '@/lib/repair-server'

export const dynamic = 'force-dynamic'

// Покупка/пополнение инструмента: прочность +uses за цену.
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { toolKey?: string }
  if (!body.toolKey) return Response.json({ error: 'toolKey обязателен' }, { status: 400 })
  const tool = TOOLS.find((t) => t.key === body.toolKey)
  if (!tool) return Response.json({ error: 'Инструмент не найден' }, { status: 400 })

  const row = await db.workshopTool.findUnique({
    where: { userId_toolKey: { userId: user.id, toolKey: tool.key } },
  })
  if (row && row.durability > 0) {
    return Response.json({ error: 'Инструмент ещё в порядке — не нужно нового' }, { status: 400 })
  }
  if (user.balance < tool.price) {
    return Response.json({ error: `Нужно ${fmtMoney(tool.price)}. Недостаточно средств` }, { status: 400 })
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: tool.price } } })
    await tx.transaction.create({
      data: { userId: user.id, type: 'purchase', amount: -tool.price, note: `Инструмент: ${tool.title}` },
    })
    await tx.workshopTool.upsert({
      where: { userId_toolKey: { userId: user.id, toolKey: tool.key } },
      create: { userId: user.id, toolKey: tool.key, durability: tool.uses },
      update: { durability: { increment: tool.uses } },
    })
  })

  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { balance: true } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, tools: await toolsDto(user.id) })
}
