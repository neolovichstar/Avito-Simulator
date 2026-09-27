import { db } from '@/lib/db'
// Если REALTIME_SECRET на сервере не задан (напр. Vercel), принимаем канонический дефолт
const EXPECTED_SECRET = process.env.REALTIME_SECRET ?? 'avito-sim-rt-2024-secret'

export const dynamic = 'force-dynamic'

// Сервисный роут для бота: состояние аккаунта по chatId (команды /balance, /start).
function serviceOk(req: Request): boolean {
  const secret = req.headers.get('x-service-secret')
  return !!secret && secret === EXPECTED_SECRET
}

export async function GET(req: Request) {
  if (!serviceOk(req)) return Response.json({ error: 'forbidden' }, { status: 403 })
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
