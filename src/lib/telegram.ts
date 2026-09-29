import crypto from 'crypto'

// 61-c: поля юзера из initData попадают в БД/HTML — срезаем длины и разрешаем
// фото только с https ( dev-фолбэк принимает неподписанные данные).
function sanitizeTgUser(u: TgUser | null): TgUser | null {
  if (!u || typeof u.id !== 'number' || !Number.isSafeInteger(u.id) || u.id <= 0) return null
  return {
    id: u.id,
    first_name: String(u.first_name ?? '').slice(0, 64),
    last_name: String(u.last_name ?? '').slice(0, 64) || undefined,
    username: String(u.username ?? '').slice(0, 32).replace(/^@/, '') || undefined,
    photo_url:
      typeof u.photo_url === 'string' && u.photo_url.startsWith('https://') && u.photo_url.length <= 512
        ? u.photo_url
        : undefined,
  }
}

// Разбор initData БЕЗ проверки подписи — РАЗРЕШЁН ТОЛЬКО в dev, когда на
// сервере не задан BOT_TOKEN (песочница/локальная разработка). В проде вызов
// этого пути запрещён (см. /api/auth: без BOT_TOKEN initData отклоняется).
export function parseInitDataUser(initData: string): TgUser | null {
  try {
    const params = new URLSearchParams(initData)
    const userRaw = params.get('user')
    if (!userRaw) return null
    const user = JSON.parse(userRaw) as TgUser
    return sanitizeTgUser(user)
  } catch {
    return null
  }
}

// Валидация Telegram WebApp initData (по официальной документации)
export interface TgUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

export function validateInitData(initData: string, botToken: string): TgUser | null {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return null
    params.delete('hash')
    params.delete('signature')
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
    const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    if (!timingSafeHex(computed, hash)) return null
    // проверка свежести (не старше 24 часов)
    const authDate = Number(params.get('auth_date') ?? 0) * 1000
    if (authDate && Date.now() - authDate > 86_400_000) return null
    const userRaw = params.get('user')
    if (!userRaw) return null
    const user = JSON.parse(userRaw) as TgUser
    return sanitizeTgUser(user)
  } catch {
    return null
  }
}

// 61-c: постоянное по времени сравнение hex-строк одинаковой длины
// (crypto.timingSafeEqual на байтах; строки заведомо одной длины — sha256 hex).
function timingSafeHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length || ab.length === 0) return false
  return crypto.timingSafeEqual(ab, bb)
}

// Подпись сессионного токена (HMAC), без внешних зависимостей
const SECRET = process.env.SESSION_SECRET ?? 'avito-sim-session-secret-v1'

export function signSession(userId: string): string {
  const exp = Date.now() + 30 * 86_400_000
  const payload = `${userId}.${exp}`
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

export function verifySession(token: string): string | null {
  try {
    const [p64, sig] = token.split('.')
    if (!p64 || !sig) return null
    const payload = Buffer.from(p64, 'base64url').toString()
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
    // 61-c: сравнение подписи — постоянное по времени, не === по строкам
    const sigBuf = Buffer.from(sig, 'utf8')
    const expBuf = Buffer.from(expected, 'utf8')
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null
    const [userId, expStr] = payload.split('.')
    if (!userId || !expStr) return null
    const exp = Number(expStr)
    if (!Number.isFinite(exp) || Date.now() > exp) return null
    return userId
  } catch {
    return null
  }
}
