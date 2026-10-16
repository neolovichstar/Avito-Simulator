import { db } from '@/lib/db'
import { serviceOk } from '@/lib/telegram-auth'

export const dynamic = 'force-dynamic'

// Сервисный роут для бота: состояние аккаунта по chatId (команды /balance, /start).

export async function GET(req: Request) {
  if (!(await serviceOk(req))) return Response.json({ error: 'forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const chatId = url.searchParams.get('chatId')
  if (!chatId) return Response.json({ error: 'Нужен chatId' }, { status: 400 })
  const link = await db.telegramLink.findUnique({
    where: { chatId },
    include: { user: true },
  })
  if (!link) return Response.json({ linked: false })
  const u = link.user
  const [deliveries, activeBids] = await Promise.all([
    // 28-b: «живые» посылки — сбор/путь/ожидание в ПВЗ
    db.delivery.count({ where: { userId: u.id, status: { in: ['collecting', 'in_transit', 'arrived'] } } }),
    db.auctionBid.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { lotId: true },
    }),
  ])
  let leading = 0
  if (activeBids.length > 0) {
    const lotIds = [...new Set(activeBids.map((b) => b.lotId))]
    leading = await db.auctionLot.count({
      where: { id: { in: lotIds }, status: 'active', currentBidderId: u.id },
    })
  }
  return Response.json({
    linked: true,
    displayName: u.displayName,
    username: u.username,
    balance: u.balance,
    debt: u.debt,
    deposit: u.deposit,
    taxDebt: u.taxDebt,
    level: u.level,
    xp: u.xp,
    rating: u.ratingCount > 0 ? Math.round((u.ratingSum / u.ratingCount) * 10) / 10 : 0,
    deliveries,
    leading,
  })
}
