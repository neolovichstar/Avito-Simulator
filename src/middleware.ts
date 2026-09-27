// Edge-гард админ-панели (Task 41, защита от третьих лиц):
//  • /admin и /api/admin/* требуют валидную подписанную сессию;
//  • неавторизованные → 302 на /admin/login (страница) или 401 (API);
//  • /admin/login открыт, но при активной сессии редиректит в панель;
//  • мутации (POST/PATCH/DELETE) блокируются при cross-site запросах (CSRF);
//  • на все админ-ответы вешаются security-заголовки (noindex, no-store, DENY framing).

import { NextResponse, type NextRequest } from 'next/server'
import { readSessionCookie, verifySessionToken } from '@/lib/admin-session'
import { getAdminKey, isLockedDown } from '@/lib/admin-auth'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store, max-age=0',
}

function withSecurity(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
  return res
}

async function hasSession(req: NextRequest): Promise<boolean> {
  if (isLockedDown()) return false
  const { key } = getAdminKey()
  const token = readSessionCookie(req.headers.get('cookie'))
  if (!token) return false
  return verifySessionToken(token, key)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api/admin')
  const isAuthApi = pathname === '/api/admin/auth'
  const isLogin = pathname === '/admin/login'

  // CSRF-гард: браузерный мутационный запрос обязан быть same-origin
  const method = req.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const site = req.headers.get('sec-fetch-site')
    if (site && site !== 'same-origin' && site !== 'none') {
      return NextResponse.json({ error: 'Запрос заблокирован: межсайтовое обращение' }, { status: 403 })
    }
  }

  const authed = await hasSession(req)

  // Точка логина открыта (rate-limit и проверка ключа — внутри роута)
  if (isAuthApi) return withSecurity(NextResponse.next())

  if (isLogin) {
    if (authed) return withSecurity(NextResponse.redirect(new URL('/admin', req.url)))
    return withSecurity(NextResponse.next())
  }

  if (!authed) {
    if (isApi) {
      return withSecurity(NextResponse.json({ error: 'Требуется вход в админ-панель' }, { status: 401 }))
    }
    return withSecurity(NextResponse.redirect(new URL('/admin/login', req.url)))
  }

  return withSecurity(NextResponse.next())
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
}
