import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { regionById, RESERVE_HOURS } from '@/lib/phone'
import { purgeExpiredReserves, rollNumber, serializePhone } from '@/lib/phone-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/phones/roll { regionCode } — платная прокрутка номера.
 * Списывает цену прокрутки региона, генерирует случайный номер. ЛЮБОЙ выпавший
 * номер ставится на бронь 48ч и НЕ сохраняется автоматически:
 *  - basic (0–19)  → buyPrice=0, забирается бесплатно по «Забрать»;
 *  - silver+       → бронь с ценой выкупа (GTA RP): можно накопить и выкупить.
 * Невыкупленные обычные брони удаляются перед новой прокруткой (см. rollNumber).
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as { regionCode?: string }
  const region = regionById(body.regionCode ?? '')
  if (!region) return Response.json({ error: 'Неизвестный регион' }, { status: 400 })

  if (!rateLimit(`phone-roll:${user.id}`, 20, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите немного' }, { status: 429 })
  }

  await purgeExpiredReserves()

  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { balance: true } })
  const balance = fresh?.balance ?? user.balance
  if (balance < region.rollPrice) {
    return Response.json(
      { error: `Не хватает ${region.rollPrice - balance} ₽ на прокрутку` },
      { status: 400 },
    )
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const freshTx = await tx.user.findUnique({ where: { id: user.id }, select: { balance: true } })
      if (!freshTx || freshTx.balance < region.rollPrice) {
        throw new RollError('Недостаточно средств')
      }
      await tx.user.update({
        where: { id: user.id },
        data: { balance: { decrement: region.rollPrice } },
      })
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'phone',
          amount: -region.rollPrice,
          note: `Прокрутка номера · ${region.name}`,
        },
      })
      const { phone, activated } = await rollNumber(tx, user.id, region)
      const after = await tx.user.findUnique({ where: { id: user.id }, select: { balance: true } })
      return { phone, activated, balance: after?.balance ?? freshTx.balance - region.rollPrice }
    })

    return Response.json({
      ok: true,
      activated: result.activated,
      balance: result.balance,
      phone: serializePhone(result.phone),
      holdHours: RESERVE_HOURS,
    })
  } catch (err) {
    if (err instanceof RollError) return Response.json({ error: err.message }, { status: 400 })
    console.error('phone roll failed:', err)
    return Response.json({ error: 'Не удалось прокрутить, попробуйте ещё' }, { status: 500 })
  }
}

class RollError extends Error {}
