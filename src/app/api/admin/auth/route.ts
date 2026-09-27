import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, SESSION_MAX_AGE, cookieOptions, getAdminKey, isAuthorized, isLockedDown, issueSessionToken, timingSafeEqExport } from '@/lib/admin-auth'
import { clearFails, clientIp, lockSecondsLeft, pluralSec, registerFail } from '@/lib/admin-rate-limit'
import { logAdmin } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

// Единственный открытый админ-эндпоинт: проверка сессии / вход / выход.
// Защита: rate-limit 5 неудач / 15 мин (Upstash + память), IP в аудите,
// в cookie — подписанный HMAC-токен, сам ключ с сервера не покидает.

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, usingDefault: getAdminKey().usingDefault })
}

export async function POST(req: Request) {
  const ip = clientIp(req)

  // Блокировка за брутфорс
  const lockLeft = await lockSecondsLeft(ip)
  if (lockLeft > 0) {
    return NextResponse.json(
      { error: `Слишком много неудачных попыток. Повторите через ${pluralSec(lockLeft)}`, lockSec: lockLeft },
      { status: 429 },
    )
  }

  let key = ''
  try {
    const body = await req.json()
    key = String(body?.key ?? '').trim()
  } catch {}

  const { key: real, usingDefault } = getAdminKey()

  // Fail-closed: в проде без ADMIN_KEY вход полностью запрещён
  if (isLockedDown()) {
    await logAdmin('auth.fail', 'system', '', 'Вход заблокирован: ADMIN_KEY не задан в production')
    return NextResponse.json({ error: 'Панель закрыта: задайте ADMIN_KEY в переменных окружения сервера' }, { status: 503 })
  }

  if (!key || !timingSafeEqExport(key, real)) {
    await registerFail(ip)
    await logAdmin('auth.fail', 'system', '', `Неудачная попытка входа${ip !== 'local' ? ` · IP ${ip}` : ''}`)
    return NextResponse.json({ error: 'Неверный ключ' }, { status: 403 })
  }

  await clearFails(ip)
  const token = await issueSessionToken()
  await logAdmin('auth.login', 'system', '', `Вход в панель${ip !== 'local' ? ` · IP ${ip}` : ''}${usingDefault ? ' (ключ по умолчанию)' : ''}`)

  const res = NextResponse.json({ ok: true, usingDefault })
  res.cookies.set(ADMIN_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
