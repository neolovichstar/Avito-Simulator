// Авторизация админ-панели, версия 3 (hardened, 61-c):
//  • cookie resale_admin хранит подписанный HMAC-токен сессии (не сам ключ);
//  • сравнение ключа — константное по времени (SHA-256 дайджесты + побайтовое
//    сравнение без раннего выхода; edge-совместимо, т.к. middleware бандлит
//    этот модуль и node:crypto.timingSafeEqual там недоступен);
//  • fail-closed: в production без ADMIN_KEY в env доступ закрыт полностью;
//  • заголовок x-admin-key разрешён только для служебных вызовов (curl/CLI)
//    в доверенной среде (dev) и при заданном ключе.

import { ADMIN_COOKIE, SESSION_MAX_AGE, createSessionToken, safeEqualStrings, verifySessionToken } from './admin-session'

export { ADMIN_COOKIE, SESSION_MAX_AGE, safeEqualStrings }
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

async function timingSafeEq(a: string, b: string): Promise<boolean> {
  return safeEqualStrings(a, b)
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
  if (header && !usingDefault && process.env.NODE_ENV !== 'production' && (await timingSafeEq(header, key))) return true

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
