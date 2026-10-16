// F2 QA cleanup: удалить тестовые аккаунты (tg_424242/tg_424243), их чаты/тикеты/нотификации
import { db } from '../src/lib/db'

async function main() {
  const users = await db.user.findMany({ where: { OR: [{ username: 'tg_424242' }, { username: 'tg_424243' }] }, select: { id: true } })
  const ids = users.map((u) => u.id)
  if (!ids.length) { console.log('no test users'); return }
  const tickets = await db.supportTicket.findMany({ where: { userId: { in: ids } }, select: { id: true } })
  for (const t of tickets) await db.supportTicket.delete({ where: { id: t.id } }).catch((e) => console.log('ticket', e.message))
  await db.supportMessage.deleteMany({ where: { userId: { in: ids } } })
  const chats = await db.chat.findMany({ where: { OR: [{ buyerId: { in: ids } }, { sellerId: { in: ids } }] }, select: { id: true } })
  for (const c of chats) {
    await db.message.deleteMany({ where: { chatId: c.id } })
    await db.chat.delete({ where: { id: c.id } }).catch((e) => console.log('chat', e.message))
  }
  await db.notification.deleteMany({ where: { userId: { in: ids } } })
  await db.message.deleteMany({ where: { senderId: { in: ids } } })
  for (const id of ids) await db.user.delete({ where: { id } }).catch((e) => console.log('user', e.message))
  console.log('cleaned users:', ids.join(','))
}
void main().finally(() => void db.$disconnect())
