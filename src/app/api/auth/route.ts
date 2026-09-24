import { db } from '@/lib/db'
import { signSession, validateInitData } from '@/lib/telegram'
import { rateLimit } from '@/lib/ratelimit'
import { levelFromXp } from '@/lib/economy'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  if (!rateLimit(`auth:${ip}`, 30, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите минуту' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { initData?: string | null; devName?: string }
  const botToken = process.env.BOT_TOKEN ?? ''
  let user: Awaited<ReturnType<typeof db.user.findUnique>> = null

  // 1. Пробуем Telegram initData
  if (body.initData && botToken) {
    const tg = validateInitData(body.initData, botToken)
    if (tg) {
      const username = tg.username ? `@${tg.username}` : `tg_${tg.id}`
      const displayName = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || 'Игрок'
      user = await db.user.upsert({
        where: { telegramId: String(tg.id) },
        update: { displayName, photoUrl: tg.photo_url ?? undefined, lastSeenAt: new Date() },
        create: {
          telegramId: String(tg.id),
          username,
          displayName,
          photoUrl: tg.photo_url ?? null,
          city: 'Москва',
          bio: 'Новичок на Сделке',
        },
      })
    }
  }

  // 2. Fallback: dev-режим без бота
  if (!user) {
    const devName = (body.devName ?? 'Игрок').slice(0, 24)
    // стабильный хеш имени, чтобы кириллица не схлопывала аккаунты
    let h = 5381
    for (let i = 0; i < devName.length; i++) h = ((h * 33) ^ devName.charCodeAt(i)) >>> 0
    const username = `player_${h.toString(36)}`
    const existing = await db.user.findUnique({ where: { username } })
    user = existing
      ? await db.user.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } })
      : await db.user.create({
          data: { username, displayName: devName, city: 'Москва', bio: 'Новичок на Сделке' },
        })
  }

  if (!user) return Response.json({ error: 'Не удалось создать профиль' }, { status: 500 })

  // лечение уровня: если в БД остался level от старой формулы — пересчитываем из xp
  const healLevel = levelFromXp(user.xp)
  if (user.level !== healLevel) {
    user = await db.user.update({ where: { id: user.id }, data: { level: healLevel } })
  }

  const token = signSession(user.id)
  const isNew = user.balance === 35000 && user.ratingCount === 0 && user.xp === 0
  return Response.json({
    token,
    user: {
      id: user.id, username: user.username, displayName: user.displayName, photoUrl: user.photoUrl,
      balance: user.balance, debt: user.debt, deposit: user.deposit, xp: user.xp, level: user.level,
      ratingSum: user.ratingSum, ratingCount: user.ratingCount, taxDebt: user.taxDebt,
      city: user.city, bio: user.bio, isNew,
    },
  })
}
