import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { fmtMoney } from '@/lib/format'
import { partById } from '@/lib/parts'
import { stockMapFor, stockDto } from '@/lib/repair-server'

export const dynamic = 'force-dynamic'

// Закупка у поставщика (used=true — б/у партия: дешевле, но с износом)
// и распродажа лишнего со склада (sell=true).
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { partKey?: string; used?: boolean; sell?: boolean }
  if (!body.partKey) return Response.json({ error: 'partKey обязателен' }, { status: 400 })
  const part = partById(body.partKey)
  if (!part) return Response.json({ error: 'Запчасть не найдена в каталоге' }, { status: 400 })

  if (body.sell) {
    const row = await db.partStock.findUnique({
      where: { userId_partKey: { userId: user.id, partKey: part.key } },
    })
    if (!row || row.qty <= 0) return Response.json({ error: 'На складе нет такой запчасти' }, { status: 400 })
    const wearAvg = row.qty ? Math.round(row.wearSum / row.qty) : 0
    const refund = Math.max(50, Math.round(part.price * 0.55 * (1 - wearAvg / 200)))
    await db.$transaction(async (tx) => {
      await tx.partStock.update({
        where: { userId_partKey: { userId: user.id, partKey: part.key } },
        data: {
          qty: { decrement: 1 },
          wearSum: { decrement: Math.min(row.wearSum, wearAvg) },
        },
      })
      await tx.user.update({ where: { id: user.id }, data: { balance: { increment: refund } } })
      await tx.transaction.create({
        data: { userId: user.id, type: 'sale', amount: refund, note: `Продажа запчасти: ${part.title}` },
      })
    })
  } else {
    const used = Boolean(body.used)
    const price = used ? Math.round(part.price * 0.45) : part.price
    if (user.balance < price) {
      return Response.json({ error: `Нужно ${fmtMoney(price)}. Недостаточно средств` }, { status: 400 })
    }
    const wear = used ? 25 + Math.floor(Math.random() * 21) : 0 // 25-45% у б/у
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: price } } })
      await tx.transaction.create({
        data: { userId: user.id, type: 'purchase', amount: -price, note: `Запчасть: ${part.title}${used ? ' (б/у)' : ''}` },
      })
      await tx.partStock.upsert({
        where: { userId_partKey: { userId: user.id, partKey: part.key } },
        create: { userId: user.id, partKey: part.key, qty: 1, wearSum: wear },
        update: { qty: { increment: 1 }, wearSum: { increment: wear } },
      })
    })
  }

  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { balance: true } })
  const stockMap = await stockMapFor(user.id)
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, stock: stockDto(stockMap) })
}
