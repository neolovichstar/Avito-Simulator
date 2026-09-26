import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { subjectByName } from '@/lib/rf-regions'
import { plateRarity, platePrice, plateBeautyScore, plateKey, isValidPlateParts, type PlateRarity } from '@/lib/plate'

export const dynamic = 'force-dynamic'

/** GET /api/plates — мои автомобильные номера. */
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const plates = await db.carPlate.findMany({
    where: { userId: user.id },
    orderBy: [{ isMain: 'desc' }, { createdAt: 'desc' }],
  })
  return Response.json({ plates })
}

/**
 * POST /api/plates { first, digits, letters, regionCode, regionName } — выкуп знака.
 * Сервер сам пересчитывает редкость и цену (клиенту не доверяем), проверяет
 * уникальность и баланс, списывает деньги и пишет транзакцию.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  if (!rateLimit(`plate-buy:${user.id}`, 10, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите немного' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    first?: string
    digits?: string
    letters?: string
    regionCode?: string
    regionName?: string
  }
  const first = (body.first ?? '').toUpperCase().trim()
  const digits = (body.digits ?? '').trim()
  const letters = (body.letters ?? '').toUpperCase().trim()
  const regionCode = (body.regionCode ?? '').trim()

  // Регион обязан существовать и содержать этот код
  const subject = subjectByName(body.regionName ?? '')
  if (!subject || !subject.plateCodes.includes(regionCode)) {
    return Response.json({ error: 'Неизвестный регион или код' }, { status: 400 })
  }
  if (!isValidPlateParts(first, digits, letters, regionCode)) {
    return Response.json({ error: 'Некорректный знак' }, { status: 400 })
  }

  const key = plateKey(first, digits, letters, regionCode)
  const exists = await db.carPlate.findUnique({ where: { plate: key } })
  if (exists) return Response.json({ error: 'Этот номер уже занят' }, { status: 409 })

  const rarity: PlateRarity = plateRarity(first, digits, letters)
  const beautyScore = plateBeautyScore(first, digits, letters)
  const price = platePrice(rarity, subject.prestige, beautyScore)

  if (user.balance < price) {
    return Response.json({ error: 'Недостаточно средств', need: price }, { status: 402 })
  }

  const mineCount = await db.carPlate.count({ where: { userId: user.id } })

  const plate = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: price } } })
    await tx.transaction.create({
      data: {
        userId: user.id,
        type: 'plate',
        amount: -price,
        note: `Автономер ${first} ${digits} ${letters} | ${regionCode}`,
      },
    })
    return tx.carPlate.create({
      data: {
        userId: user.id,
        plate: key,
        first,
        letters,
        digits,
        regionCode,
        regionName: subject.name,
        rarity,
        beautyScore,
        price,
        isMain: mineCount === 0,
      },
    })
  })

  return Response.json({ plate, balance: user.balance - price })
}
