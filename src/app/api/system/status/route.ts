import { redisPing, redisStatus } from '@/lib/redis'
import { aiBudgetUsed, AI_DAILY_BUDGET } from '@/lib/ai'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Инфраструктурный статус: Redis (Upstash), БД, аптайм процесса, бюджет ИИ.
export async function GET() {
  const started = Date.now()
  let dbOk = true
  try {
    await db.user.count({ take: 1 })
  } catch {
    dbOk = false
  }
  const dbLatency = Date.now() - started

  const redis = await redisPing()
  const status = redisStatus()
  const aiUsed = await aiBudgetUsed()

  return Response.json({
    redis: {
      enabled: status.enabled,
      alive: redis !== null,
      latencyMs: redis,
      failStreak: status.failStreak,
    },
    db: { ok: dbOk, latencyMs: dbLatency, provider: 'sqlite' },
    ai: { used: aiUsed, limit: AI_DAILY_BUDGET, chatOnly: true },
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
  })
}
