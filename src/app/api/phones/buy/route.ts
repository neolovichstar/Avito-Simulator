import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { purgeExpiredReserves, serializePhone, makeMainPhone } from '@/lib/phone-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/phones/buy { id } — «Забрать» номер из брони (48ч).
 * buyPrice=0 (обычный) — активируется бесплатно; платный выкупается по цене
 * брони. Если на счету не хватает — номер остаётся в брони, можно накопить.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as { id?: string }
  if (!body.id) return Response.json({ error: 'Не указан номер' }, { status: 400 })

  await purgeExpiredReserves()

  const phone = await db.phoneNumber.findFirst({
    where: { id: body.id, OR: [{ userId: user.id }, { reservedFor: user.id }] },
  })
  if (!phone) return Response.json({ error: 'Номер не найден' }, { status: 404 })

  if (phone.status === 'active') {
    return Response.json({ ok: true, alreadyOwned: true, balance: user.balance, phone: serializePhone(phone) })
  }
  if (phone.status !== 'reserved') {
    return Response.json({ error: 'Номер уже не в брони' }, { status: 400 })
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const freshTx = await tx.user.findUnique({ where: { id: user.id }, select: { balance: true } })
      if (!freshTx || freshTx.balance < phone.buyPrice) {
        throw new BuyError('Недостаточно средств — номер держим за вами ещё 48 часов')
      }
      // Бесплатное «Забрать» (buyPrice=0) не трогает баланс и не пишет
      // нулевую операцию в историю банка.
      if (phone.buyPrice > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { balance: { decrement: phone.buyPrice } },
        })
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: 'phone',
            amount: -phone.buyPrice,
            note: `Выкуп номера ${phone.number}`,
          },
        })
      }
      await tx.phoneNumber.update({
        where: { id: phone.id },
        data: { status: 'active', buyPrice: 0, holdUntil: null, reservedFor: null },
      })
      const hadMain = await tx.phoneNumber.findFirst({
        where: { userId: user.id, isMain: true, id: { not: phone.id } },
        select: { id: true },
      })
      let mainSet = false
      if (!hadMain) {
        await makeMainPhone(tx, user.id, phone.id)
        mainSet = true
      }
      const finalPhone = await tx.phoneNumber.findUniqueOrThrow({ where: { id: phone.id } })
      const after = await tx.user.findUnique({ where: { id: user.id }, select: { balance: true } })
      return {
        phone: finalPhone,
        balance: after?.balance ?? freshTx.balance - phone.buyPrice,
        mainSet,
      }
    })

    return Response.json({
      ok: true,
      balance: result.balance,
      mainSet: result.mainSet,
      phone: serializePhone(result.phone),
    })
  } catch (err) {
    if (err instanceof BuyError) return Response.json({ error: err.message }, { status: 400 })
    console.error('phone buy failed:', err)
    return Response.json({ error: 'Не удалось выкупить номер' }, { status: 500 })
  }
}

class BuyError extends Error {}
