import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, getAdminKey, isAuthorized } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

const MAX_AGE = 7 * 24 * 3600

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, usingDefault: getAdminKey().usingDefault })
}

export async function POST(req: Request) {
  let key = ''
  try {
    const body = await req.json()
    key = String(body?.key ?? '')
  } catch {}
  const { key: real, usingDefault } = getAdminKey()
  if (!key || key !== real) {
    await logAdmin('auth.fail', 'system', '', 'Неудачная попытка входа: неверный ключ')
    return NextResponse.json({ error: 'Неверный ключ' }, { status: 403 })
  }
  await logAdmin('auth.login', 'system', '', usingDefault ? 'Вход в панель (ключ по умолчанию)' : 'Вход в панель')
  const res = NextResponse.json({ ok: true, usingDefault })
  res.cookies.set(ADMIN_COOKIE, encodeURIComponent(real), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
