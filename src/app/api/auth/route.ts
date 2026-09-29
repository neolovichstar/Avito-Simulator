import { db } from '@/lib/db'
import { parseInitDataUser, signSession, validateInitData } from '@/lib/telegram'
import { rateLimit, ipKey, tooMany } from '@/lib/rate-limit'
import { levelFromXp } from '@/lib/economy'

export const dynamic = 'force-dynamic'

// стабильный строковый хеш, чтобы кириллица/UUID не схлопывали аккаунты
function stableHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}

export async function POST(req: Request) {
  // 61-c: 30 req/мин на IP (скользящее окно) — анти-брутфорс initData/deviceId
  const rl = rateLimit(ipKey(req, 'auth'), { limit: 30, windowMs: 60_000 })
  if (!rl.ok) return tooMany(rl.retryAfter)
  const body = (await req.json().catch(() => ({}))) as {
    initData?: string | null
    deviceId?: string | null
    devName?: string
  }
  // initData длиной ограничиваем ДО разбора: 8КБ хватит с запасом, 10МБ-строки
  // не должны доходить до URLSearchParams
  const initDataRaw = typeof body.initData === 'string' && body.initData.length <= 8192 ? body.initData : ''
  const botToken = process.env.BOT_TOKEN ?? ''
  const isProd = process.env.NODE_ENV === 'production'
  const rawDeviceId = (body.deviceId ?? '').trim().slice(0, 64).replace(/[^a-zA-Z0-9-_]/g, '')
  let user: Awaited<ReturnType<typeof db.user.findUnique>> = null

  // 1. Пробуем Telegram initData
  if (initDataRaw) {
    let tg: ReturnType<typeof validateInitData> = null
    if (botToken) {
      // 61-c (ЗАКРЫТАЯ ДЫРА): раньше при неверной подписи профиль всё равно
      // принимался — anyone мог выдать себя за ЧУЖОЙ telegram-аккаунт,
      // подложив произвольный user.id. Теперь неподписанные/битые initData
      // отклоняются ВСЕГДА: запрос падает в безопасный deviceId-фолбэк.
      tg = validateInitData(initDataRaw, botToken)
      if (!tg) console.warn('[auth] initData отклонён: подпись не сошлась (анти-имперсонация)')
    } else if (isProd) {
      // 61-c: fail-closed — в проде без BOT_TOKEN проверка подписи невозможна,
      // значит неподписанные профили не принимаем (иначе снова имперсонация).
      console.error('[auth] PRODUCTION без BOT_TOKEN: initData отклонён — задайте BOT_TOKEN в env')
      tg = null
    } else {
      // Dev-фолбэк (песочница без секретов): принимаем профиль без проверки,
      // иначе ВСЕ Telegram-игроки получают безликого «Игрока».
      tg = parseInitDataUser(initDataRaw)
      if (tg) console.warn('[auth] DEV без BOT_TOKEN — initData принят БЕЗ проверки подписи; tgId:', tg.id)
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
          // 59-a: гонка двух первых логинов одного Telegram: ловим P2002 и перечитываем
          try {
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
          } catch (e) {
            if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002') {
              user = (await db.user.findUnique({ where: { telegramId: String(tg.id) } }))
                ?? await db.user.findUnique({ where: { username } })
            } else {
              throw e
            }
          }
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
    // 61-c: devName — только строка, trim + жёсткий срез (не даём 10МБ в БД)
    const devName = (typeof body.devName === 'string' ? body.devName.trim().slice(0, 24) : '') || 'Игрок'
    const username = rawDeviceId
      ? `player_${stableHash(rawDeviceId).toString(36)}`
      : `player_${stableHash(devName).toString(36)}`
    const existing = await db.user.findUnique({ where: { username } })
    user = existing
      ? await db.user.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } })
      : await (async () => {
          // 59-a: параллельный первый логин с того же deviceId ловим по P2002
          try {
            return await db.user.create({
              data: { username, displayName: devName, city: 'Москва', bio: 'Новичок в Resale' },
            })
          } catch (e) {
            if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002') {
              const dupe = await db.user.findUnique({ where: { username } })
              if (dupe) return db.user.update({ where: { id: dupe.id }, data: { lastSeenAt: new Date() } })
            }
            throw e
          }
        })()
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
