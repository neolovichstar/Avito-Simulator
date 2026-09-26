import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, getAdminKey, isAuthorized } from '@/lib/admin-auth'

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
    return NextResponse.json({ error: 'Неверный ключ' }, { status: 403 })
  }
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
