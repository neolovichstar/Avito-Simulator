import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { notifyUser } from '@/lib/deals'
import { fmtMoney } from '@/lib/format'

export const dynamic = 'force-dynamic'

const BASE = 250
const STEP = 150
const CAP = 1000

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function yesterdayKey(): string {
  return dayKey(new Date(Date.now() - 86_400_000))
}

export function bonusFor(streak: number): number {
  return Math.min(CAP, BASE + (streak - 1) * STEP)
}

// Ежедневный бонус за вход: GET — состояние, POST — забрать
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const today = dayKey()
  const claimedToday = user.lastBonusAt ? dayKey(user.lastBonusAt) === today : false
  // если вчера был бонус — серия продолжится, иначе начнётся с 1
  const nextStreak = user.lastBonusAt
    ? (dayKey(user.lastBonusAt) === yesterdayKey() ? user.bonusStreak + 1 : 1)
    : 1
  return Response.json({
    claimedToday,
    streak: user.lastBonusAt ? user.bonusStreak : 0,
    nextReward: bonusFor(nextStreak),
    nextStreak,
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  if (!rateLimit(`bonus:${user.id}`, 5, 60_000)) {
    return Response.json({ error: 'Слишком часто' }, { status: 429 })
  }
  const today = dayKey()
  const last = user.lastBonusAt ? dayKey(user.lastBonusAt) : null
  if (last === today) {
    return Response.json({ error: 'Бонус за сегодня уже получен', streak: user.bonusStreak }, { status: 409 })
  }
  const streak = last === yesterdayKey() ? user.bonusStreak + 1 : 1
  const reward = bonusFor(streak)

  await db.user.update({
    where: { id: user.id },
    data: { balance: { increment: reward }, bonusStreak: streak, lastBonusAt: new Date() },
  })
  await db.transaction.create({
    data: { userId: user.id, type: 'sale', amount: reward, note: `Бонус за вход (серия ${streak} дн.)` },
  })
  await notifyUser(
    user.id,
    'system',
    'Бонус за вход',
    `Серия ${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}. Начислено ${fmtMoney(reward)}. Заходите завтра — будет больше.`,
  )
  return Response.json({ ok: true, reward, streak })
}
