import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/profile/reset — «Начать с нуля».
 * Полностью стирает игровой прогресс аккаунта: объявления, вещи, чаты,
 * транзакции, номера, доставки, ремонты, аукционные ставки, квесты и т.д.,
 * и возвращает стартовые значения (баланс 35 000 ₽, уровень 1, рейтинг —).
 * Аккаунт (логин/токен) остаётся тем же. Регион сбрасывается на Москве,
 * клиент после сброса чистит флаг онбординга и перезагружает ОС.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  if (!rateLimit(`profile-reset:${user.id}`, 3, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите минуту' }, { status: 429 })
  }

  // Объявления игрока — сначала чистим их детей
  const myListings = await db.listing.findMany({ where: { sellerId: user.id }, select: { id: true } })
  const listingIds = myListings.map((l) => l.id)
  const myChats = await db.chat.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    select: { id: true },
  })
  const chatIds = myChats.map((c) => c.id)

  await db.$transaction(async (tx) => {
    // дети объявлений
    if (listingIds.length) {
      await tx.favorite.deleteMany({ where: { listingId: { in: listingIds } } })
      await tx.complaint.deleteMany({ where: { listingId: { in: listingIds } } })
      await tx.review.deleteMany({ where: { listingId: { in: listingIds } } })
      await tx.message.deleteMany({ where: { chatId: { in: chatIds } } })
      await tx.chat.deleteMany({ where: { listingId: { in: listingIds } } })
      await tx.delivery.deleteMany({ where: { listingId: { in: listingIds } } })
    }
    // дети чатов (в т.ч. где игрок покупатель)
    if (chatIds.length) {
      await tx.message.deleteMany({ where: { chatId: { in: chatIds } } })
      await tx.chat.deleteMany({ where: { id: { in: chatIds } } })
    }
    // личное
    await tx.favorite.deleteMany({ where: { userId: user.id } })
    await tx.blockedSeller.deleteMany({ where: { OR: [{ userId: user.id }, { sellerId: user.id }] } })
    await tx.savedSearch.deleteMany({ where: { userId: user.id } })
    await tx.complaint.deleteMany({ where: { fromUserId: user.id } })
    await tx.review.deleteMany({ where: { OR: [{ fromUserId: user.id }, { toUserId: user.id }] } })
    await tx.message.deleteMany({ where: { senderId: user.id } })
    await tx.auctionBid.deleteMany({ where: { userId: user.id } })
    await tx.autoBid.deleteMany({ where: { userId: user.id } })
    await tx.repairOrder.deleteMany({ where: { userId: user.id } })
    await tx.repairJob.deleteMany({ where: { userId: user.id } })
    await tx.installedPart.deleteMany({ where: { userId: user.id } })
    await tx.partStock.deleteMany({ where: { userId: user.id } })
    await tx.workshopTool.deleteMany({ where: { userId: user.id } })
    await tx.callLog.deleteMany({ where: { userId: user.id } })
    await tx.phoneNumber.deleteMany({ where: { userId: user.id } })
    await tx.carPlate.deleteMany({ where: { userId: user.id } })
    await tx.delivery.deleteMany({ where: { userId: user.id } })
    await tx.quest.deleteMany({ where: { userId: user.id } })
    await tx.notification.deleteMany({ where: { userId: user.id } })
    await tx.taxBill.deleteMany({ where: { userId: user.id } })
    await tx.loan.deleteMany({ where: { userId: user.id } })
    await tx.transaction.deleteMany({ where: { userId: user.id } })
    await tx.item.deleteMany({ where: { ownerId: user.id } })
    await tx.listing.deleteMany({ where: { sellerId: user.id } })
    // сброс профиля
    await tx.user.update({
      where: { id: user.id },
      data: {
        balance: 35000,
        debt: 0,
        deposit: 0,
        depositAt: null,
        xp: 0,
        level: 1,
        ratingSum: 0,
        ratingCount: 0,
        taxDebt: 0,
        taxPenaltyAt: null,
        creditScore: 500,
        city: 'Москва',
        bio: null,
        achievements: '[]',
        stats: '{}',
        questDay: null,
        rerollDay: null,
        bonusStreak: 0,
        lastBonusAt: null,
      },
    })
  })

  return Response.json({ ok: true })
}
