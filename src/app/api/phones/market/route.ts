// Витрина «Номеров»: ежедневный каталог красивых телефонных номеров.
// GET — каталог дня (занятые номера вычитаются), POST { digits } — покупка
// позиции витрины (сервер перегенерирует каталог и сверяет: клиенту не верим).
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { buildPhoneMarket, daySeed } from '@/lib/phone-market'
import { serializePhone } from '@/lib/phone-server'

export const dynamic = 'force-dynamic'

/** GET /api/phones/market — витрина дня. */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()

  const items = buildPhoneMarket(daySeed())
  const taken = await db.phoneNumber.findMany({
    where: { digits: { in: items.map((i) => i.digits) } },
    select: { digits: true },
  })
  const takenSet = new Set(taken.map((t) => t.digits))
  return Response.json({ items: items.filter((i) => !takenSet.has(i.digits)) })
}

/** POST /api/phones/market { digits } — купить номер с витрины. */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()
  if (!rateLimit(`phone-market-buy:${me.id}`, 8, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите немного' }, { status: 429 })
  }

  let body: { digits?: string }
  try {
    body = (await req.json()) as { digits?: string }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  const digits = (body.digits ?? '').replace(/\D/g, '')
  const item = buildPhoneMarket(daySeed()).find((i) => i.digits === digits)
  if (!item) return Response.json({ error: 'Номер уже продан или не из витрины' }, { status: 404 })

  if (me.balance < item.price) {
    return Response.json({ error: 'Недостаточно средств', need: item.price }, { status: 402 })
  }

  const mineCount = await db.phoneNumber.count({ where: { userId: me.id, status: 'active' } })

  try {
    const phone = await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: me.id }, data: { balance: { decrement: item.price } } })
      await tx.transaction.create({
        data: {
          userId: me.id,
          type: 'phone',
          amount: -item.price,
          note: `Покупка номера ${item.number}`,
        },
      })
      return tx.phoneNumber.create({
        data: {
          userId: me.id,
          number: item.number,
          digits: item.digits,
          regionCode: item.regionCode,
          regionName: item.regionName,
          tier: item.tier,
          beautyScore: item.beautyScore,
          status: 'active',
          buyPrice: 0,
          isMain: mineCount === 0,
        },
      })
    })

    return Response.json({ phone: serializePhone(phone), balance: me.balance - item.price })
  } catch {
    return Response.json({ error: 'Номер уже занят' }, { status: 409 })
  }
}
