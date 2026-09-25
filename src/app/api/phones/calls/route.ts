import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { seedCallLogIfEmpty } from '@/lib/phone-server'

export const dynamic = 'force-dynamic'

function serializeCall(c: {
  id: string
  peerName: string | null
  number: string
  direction: string
  status: string
  durationSec: number
  createdAt: Date
}) {
  return {
    id: c.id,
    name: c.peerName,
    number: c.number,
    kind: c.direction === 'missed' ? 'miss' : c.direction,
    status: c.status,
    durationSec: c.durationSec,
    ts: c.createdAt.toISOString(),
  }
}

/** GET /api/phones/calls — журнал звонков (недавние). Пусто → стартовые записи. */
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  await seedCallLogIfEmpty(user.id)

  const items = await db.callLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  return Response.json({ items: items.map(serializeCall) })
}

/**
 * POST /api/phones/calls — запись исходящего звонка после завершения.
 * durationSec > 0 → completed, иначе бот не взял трубку → no_answer.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  if (!rateLimit(`phone-call:${user.id}`, 30, 60_000)) {
    return Response.json({ error: 'Слишком много звонков' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    number?: string
    peerName?: string | null
    peerUserId?: string | null
    aiPersonaId?: string | null
    durationSec?: number
  }
  const number = typeof body.number === 'string' ? body.number.slice(0, 24) : ''
  if (!number) return Response.json({ error: 'Не указан номер' }, { status: 400 })

  const duration = Math.max(0, Math.min(7200, Math.round(Number(body.durationSec) || 0)))
  const status = duration > 0 ? 'completed' : 'no_answer'

  const item = await db.callLog.create({
    data: {
      userId: user.id,
      peerUserId: body.peerUserId ?? null,
      peerName: body.peerName ?? null,
      number,
      direction: 'out',
      status,
      durationSec: duration,
      aiPersonaId: typeof body.aiPersonaId === 'string' ? body.aiPersonaId.slice(0, 12) : null,
    },
  })

  return Response.json({ ok: true, item: serializeCall(item) })
}
