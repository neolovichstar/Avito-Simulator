import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

const CODE_TTL_MS = 15 * 60_000

function genCode(): string {
  // 6 символов A-Z0-9 без похожих (0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

// GET — статус привязки аккаунта к Telegram-боту
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const link = await db.telegramLink.findUnique({ where: { userId: user.id } })
  return Response.json({
    linked: !!link,
    tgUsername: link?.tgUsername ?? null,
    botUsername: 'resalesimbot',
    createdAt: link?.createdAt.toISOString() ?? null,
  })
}

// POST — создать новый код привязки (живёт 15 минут)
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`tg-link:${user.id}`, 6, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите минуту' }, { status: 429 })
  }
  // почистить просроченные коды юзера и выдать новый
  await db.telegramCode.deleteMany({ where: { userId: user.id } })
  const code = await db.telegramCode.create({
    data: { code: genCode(), userId: user.id, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  })
  return Response.json({ code: code.code, ttlMinutes: 15, botUsername: 'resalesimbot' })
}

// DELETE — отвязать Telegram
export async function DELETE(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  await db.telegramLink.deleteMany({ where: { userId: user.id } })
  await db.telegramCode.deleteMany({ where: { userId: user.id } })
  return Response.json({ ok: true })
}
