// Авторизация админ-панели: сравнение ключа из cookie resale_admin или заголовка
// x-admin-key с process.env.ADMIN_KEY (тайминг-безопасное сравнение).
// Если ADMIN_KEY не задан — работает ключ по умолчанию (песочница/демо),
// а панель показывает предупреждение о необходимости настройки.

export const ADMIN_COOKIE = 'resale_admin'
export const DEFAULT_ADMIN_KEY = 'resale-admin-2025'

export function getAdminKey(): { key: string; usingDefault: boolean } {
  const k = process.env.ADMIN_KEY?.trim()
  if (k) return { key: k, usingDefault: false }
  return { key: DEFAULT_ADMIN_KEY, usingDefault: true }
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export function isAuthorized(req: Request): boolean {
  const { key } = getAdminKey()
  const header = req.headers.get('x-admin-key')
  if (header && timingSafeEq(header, key)) return true
  const cookie = req.headers.get('cookie') ?? ''
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]*)`))
  if (m) {
    try {
      return timingSafeEq(decodeURIComponent(m[1]), key)
    } catch {
      return false
    }
  }
  return false
}

export function unauthorized() {
  return Response.json({ error: 'Требуется вход в админ-панель' }, { status: 401 })
}

/** Возвращает null, если запрос авторизован, иначе готовый 401-ответ. */
export function requireAdmin(req: Request): Response | null {
  return isAuthorized(req) ? null : unauthorized()
}
