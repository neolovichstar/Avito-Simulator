import { db } from '@/lib/db'
import { parseInitDataUser, signSession, validateInitData } from '@/lib/telegram'
import { rateLimit } from '@/lib/ratelimit'
import { levelFromXp } from '@/lib/economy'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  if (!rateLimit(`auth:${ip}`, 60, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите минуту' }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    initData?: string | null
    deviceId?: string | null
    devName?: string
  }
  const botToken = process.env.BOT_TOKEN ?? ''
  let user: Awaited<ReturnType<typeof db.user.findUnique>> = null

  // 1. Пробуем Telegram initData
  if (body.initData) {
    let tg: ReturnType<typeof validateInitData> = null
    if (botToken) {
      tg = validateInitData(body.initData, botToken)
      if (!tg) {
        // Диагностика: запрос из Telegram дошёл, но подпись не совпала —
        // это значит, что BotFather-приложение открылось с чужим токеном.
        console.warn('[auth] initData INVALID: hash mismatch или устарел; длина =', body.initData.length)
      }
    } else {
      // BOT_TOKEN не задан на этом сервере (деплой без секретов): строгая
      // проверка подписи невозможна. Принимаем профиль без проверки, иначе
      // ВСЕ Telegram-игроки получают безликого «Игрока» вместо своего профиля.
      tg = parseInitDataUser(body.initData)
      if (tg) console.warn('[auth] BOT_TOKEN не задан — initData принят БЕЗ проверки подписи; tgId:', tg.id)
    }
    if (tg) {
      const username = tg.username ? `@${tg.username}` : `tg_${tg.id}`
      const displayName = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || 'Игрок'
      console.log('[auth] Telegram login:', username, '| tgId:', tg.id)
      user = await db.user.upsert({
        where: { telegramId: String(tg.id) },
        update: { displayName, photoUrl: tg.photo_url ?? undefined, lastSeenAt: new Date() },
        create: {
          telegramId: String(tg.id),
          username,
          displayName,
          photoUrl: tg.photo_url ?? null,
          city: 'Москва',
          bio: 'Новичок в Resale',
        },
      })
    }
  }

  // 2. Fallback: вход без Telegram. ФИКС «СБРОСОВ ПРОГРЕССА»: раньше все
  // клиенты без initData попадали на ОДИН общий аккаунт player_<hash('Игрок')>,
  // и прогресс «конфликтовал»/«сбрасывался». Теперь клиент шлёт стабильный
  // deviceId (localStorage), и каждый девайс получает свой отдельный аккаунт.
  // Если deviceId нет (старый клиент) — работает прежнее поведение.
  if (!user) {
    // стабильный строковый хеш, чтобы кириллица/UUID не схлопывали аккаунты
    const stableHash = (s: string) => {
      let h = 5381
      for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
      return h
    }
    const rawDeviceId = (body.deviceId ?? '').trim().slice(0, 64).replace(/[^a-zA-Z0-9-_]/g, '')
    const devName = (body.devName ?? 'Игрок').slice(0, 24)
    const username = rawDeviceId
      ? `player_${stableHash(rawDeviceId).toString(36)}`
      : `player_${stableHash(devName).toString(36)}`
    const existing = await db.user.findUnique({ where: { username } })
    user = existing
      ? await db.user.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } })
      : await db.user.create({
          data: { username, displayName: devName, city: 'Москва', bio: 'Новичок в Resale' },
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
