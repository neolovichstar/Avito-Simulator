import crypto from 'crypto'

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
    if (computed !== hash) return null
    // проверка свежести (не старше 24 часов)
    const authDate = Number(params.get('auth_date') ?? 0) * 1000
    if (authDate && Date.now() - authDate > 86_400_000) return null
    const userRaw = params.get('user')
    if (!userRaw) return null
    const user = JSON.parse(userRaw) as TgUser
    if (!user?.id) return null
    return user
  } catch {
    return null
  }
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
    if (sig !== expected) return null
    const [userId, expStr] = payload.split('.')
    if (!userId || !expStr) return null
    if (Date.now() > Number(expStr)) return null
    return userId
  } catch {
    return null
  }
}
