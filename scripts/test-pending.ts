// Живой e2e-тест доставки уведомлений: вставить notification в ПРОД-БД
// (привязанный юзер) → песочничный бот подхватит через /api/telegram/pending
// и отправит в Telegram. Запуск: VERCEL=1 c postgres-схемой (см. процедуру).
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const link = await db.telegramLink.findFirst({ include: { user: { select: { displayName: true } } } })
if (!link) {
  console.log('NO_LINKS: в прод-БД нет TelegramLink')
  process.exit(0)
}

const n = await db.notification.create({
  data: {
    userId: link.userId,
    kind: 'system',
    title: 'Проверка доставки',
    body: 'Уведомления из Resale теперь приходят сюда: сделки, перебитые ставки, доставки, налоги и достижения.',
  },
})
console.log(`created ${n.id} → chat ${link.chatId} (${link.user.displayName})`)
await db.$disconnect()
