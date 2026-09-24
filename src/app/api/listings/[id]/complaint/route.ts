import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { notifyUser } from '@/lib/deals'

export const dynamic = 'force-dynamic'

const REASONS = ['spam', 'fake', 'scam', 'wrong', 'other']
const REASON_LABEL: Record<string, string> = {
  spam: 'Реклама или спам',
  fake: 'Товар не существует',
  scam: 'Похоже на обман',
  wrong: 'Неверное описание или цена',
  other: 'Другое',
}
const COMPLAINT_THRESHOLD = 3

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  if (!rateLimit(`complaint:${user.id}`, 5, 60_000)) {
    return Response.json({ error: 'Слишком много жалоб, подождите минуту' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string }
  const reason = REASONS.includes(body.reason ?? '') ? (body.reason as string) : 'other'

  const listing = await db.listing.findUnique({ where: { id }, include: { seller: true } })
  if (!listing) return Response.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.sellerId === user.id) {
    return Response.json({ error: 'Нельзя пожаловаться на своё объявление' }, { status: 400 })
  }
  if (listing.status !== 'active') {
    return Response.json({ error: 'Объявление уже не активно' }, { status: 400 })
  }

  const dup = await db.complaint.findUnique({
    where: { listingId_fromUserId: { listingId: id, fromUserId: user.id } },
  })
  if (dup) {
    return Response.json({ error: 'Вы уже отправляли жалобу на это объявление' }, { status: 409 })
  }

  await db.complaint.create({
    data: { listingId: id, fromUserId: user.id, reason },
  })
  const count = await db.complaint.count({ where: { listingId: id } })
  await db.listing.update({ where: { id }, data: { complaintCount: count } })

  // Модерация: после 3 жалоб объявление бота снимается с публикации
  if (count >= COMPLAINT_THRESHOLD && listing.seller.isBot) {
    await db.listing.update({ where: { id }, data: { status: 'removed' } })
    const reporters = await db.complaint.findMany({
      where: { listingId: id },
      select: { fromUserId: true },
    })
    for (const r of reporters) {
      await notifyUser(
        r.fromUserId,
        'system',
        'Жалоба удовлетворена',
        `Объявление «${listing.title}» снято с публикации после проверки модератором.`,
      )
    }
  } else if (count === 1) {
    await notifyUser(
      user.id,
      'system',
      'Жалоба принята',
      `Спасибо, мы проверим объявление «${listing.title}». Решение придёт в уведомлениях.`,
    )
  }

  return Response.json({ ok: true, complaints: count })
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const [complaint, count] = await Promise.all([
    db.complaint.findUnique({
      where: { listingId_fromUserId: { listingId: id, fromUserId: user.id } },
    }),
    db.complaint.count({ where: { listingId: id } }),
  ])
  return Response.json({
    complainedByMe: !!complaint,
    reason: complaint ? REASON_LABEL[complaint.reason] ?? complaint.reason : null,
    complaints: count,
  })
}
