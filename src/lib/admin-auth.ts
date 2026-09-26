// Авторизация админ-панели, версия 2 (hardened):
//  • cookie resale_admin хранит подписанный HMAC-токен сессии (не сам ключ);
//  • сравнение ключа — тайминг-безопасное;
//  • fail-closed: в production без ADMIN_KEY в env доступ закрыт полностью;
//  • заголовок x-admin-key разрешён только для служебных вызовов (curl/CLI)
//    в доверенной среде (dev) и при заданном ключе.

import { ADMIN_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken } from './admin-session'

export { ADMIN_COOKIE, SESSION_MAX_AGE }
export const DEFAULT_ADMIN_KEY = 'resale-admin-2025'

export function getAdminKey(): { key: string; usingDefault: boolean } {
  const k = process.env.ADMIN_KEY?.trim()
  if (k) return { key: k, usingDefault: false }
  return { key: DEFAULT_ADMIN_KEY, usingDefault: true }
}

/** production без настроенного ADMIN_KEY → панель полностью закрыта (fail-closed). */
export function isLockedDown(): boolean {
  return getAdminKey().usingDefault && process.env.NODE_ENV === 'production'
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export function timingSafeEqExport(a: string, b: string): boolean {
  return timingSafeEq(a, b)
}

function readCookie(cookieHeader: string, name: string): string {
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim())
      } catch {
        return ''
      }
    }
  }
  return ''
}

export async function isAuthorized(req: Request): Promise<boolean> {
  if (isLockedDown()) return false
  const { key, usingDefault } = getAdminKey()

  // Служебный доступ по заголовку — только в dev (песочница/локально) и с реальным ключом
  const header = req.headers.get('x-admin-key')
  if (header && !usingDefault && process.env.NODE_ENV !== 'production' && timingSafeEq(header, key)) return true

  const cookie = readCookie(req.headers.get('cookie') ?? '', ADMIN_COOKIE)
  if (cookie && (await verifySessionToken(cookie, key))) return true
  return false
}

export function unauthorized() {
  return Response.json({ error: 'Требуется вход в админ-панель' }, { status: 401 })
}

/** Возвращает null, если запрос авторизован, иначе готовый 401-ответ. */
export async function requireAdmin(req: Request): Promise<Response | null> {
  return (await isAuthorized(req)) ? null : unauthorized()
}

/** Выдаёт подписанную сессию (токен для cookie). */
export async function issueSessionToken(): Promise<string> {
  const { key } = getAdminKey()
  return createSessionToken(key)
}

export const cookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}
