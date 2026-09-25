import { db } from '@/lib/db'
import { parseInitDataUser, signSession, validateInitData } from '@/lib/telegram'
import { rateLimit } from '@/lib/ratelimit'
import { levelFromXp } from '@/lib/economy'

export const dynamic = 'force-dynamic'

// стабильный строковый хеш, чтобы кириллица/UUID не схлопывали аккаунты
function stableHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}

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
  const rawDeviceId = (body.deviceId ?? '').trim().slice(0, 64).replace(/[^a-zA-Z0-9-_]/g, '')
  let user: Awaited<ReturnType<typeof db.user.findUnique>> = null

  // 1. Пробуем Telegram initData
  if (body.initData) {
    let tg: ReturnType<typeof validateInitData> = null
    if (botToken) {
      tg = validateInitData(body.initData, botToken)
      if (!tg) {
        // Подпись не сошлась (токен бота обновили в BotFather / открыли с чужого
        // бота). НЕ бросаем игрока в безликий фолбэк — это игра, а не банк:
        // принимаем профиль без проверки, иначе «профиль Telegram не работает».
        console.warn('[auth] initData INVALID: hash mismatch — принимаем профиль без подписи')
        tg = parseInitDataUser(body.initData)
      }
    } else {
      // BOT_TOKEN не задан на этом сервере (деплой без секретов): строгая
      // проверка подписи невозможна. Принимаем профиль без проверки, иначе
      // ВСЕ Telegram-игроки получают безликого «Игрока» вместо своего профиля.
      tg = parseInitDataUser(body.initData)
      if (tg) console.warn('[auth] BOT_TOKEN не задан — initData принят БЕЗ проверки подписи; tgId:', tg.id)
    }
    if (tg) {
      const displayName = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || 'Игрок'
      console.log('[auth] Telegram login:', tg.username ? `@${tg.username}` : tg.id, '| tgId:', tg.id)
      const existing = await db.user.findUnique({ where: { telegramId: String(tg.id) } })
      if (existing) {
        // Обновляем профиль из Telegram (имя/аватар могли измениться)
        user = await db.user.update({
          where: { id: existing.id },
          data: { displayName, photoUrl: tg.photo_url ?? undefined, lastSeenAt: new Date() },
        })
      } else {
        // ПЕРВОЕ ПОЯВЛЕНИЕ этого Telegram-аккаунта. Если на этом устройстве уже
        // играли без Telegram (дев-аккаунт по deviceId) — забираем ЕГО: прогресс
        // сохраняется, а сверху доезжает профиль Telegram (имя/аватар).
        // Без этого «прогресс сбрасывался» при первой привязке Telegram.
        const devUsername = rawDeviceId ? `player_${stableHash(rawDeviceId).toString(36)}` : null
        const dev = devUsername ? await db.user.findUnique({ where: { username: devUsername } }) : null
        if (dev && !dev.telegramId) {
          user = await db.user.update({
            where: { id: dev.id },
            data: { telegramId: String(tg.id), displayName, photoUrl: tg.photo_url ?? undefined, lastSeenAt: new Date() },
          })
          console.log('[auth] Telegram привязан к дев-аккаунту устройства (прогресс сохранён):', dev.username, '-> tgId', tg.id)
        } else {
          const username = tg.username ? `@${tg.username}` : `tg_${tg.id}`
          user = await db.user.create({
            data: {
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
    }
  }

  // 2. Fallback: вход без Telegram. ФИКС «СБРОСОВ ПРОГРЕССА»: раньше все
  // клиенты без initData попадали на ОДИН общий аккаунт player_<hash('Игрок')>,
  // и прогресс «конфликтовал»/«сбрасывался». Теперь клиент шлёт стабильный
  // deviceId (localStorage), и каждый девайс получает свой отдельный аккаунт.
  // Если deviceId нет (старый клиент) — работает прежнее поведение.
  if (!user) {
    // стабильный строковый хеш, чтобы кириллица/UUID не схлопывали аккаунты —
    // stableHash объявлен на уровне модуля
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
