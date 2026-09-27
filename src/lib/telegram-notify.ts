// Серверный мост к Telegram-боту (mini-service, порт 3004).
// Бот присылает уведомления игроку в личку, если аккаунт привязан.
const BOT_URL = process.env.TELEGRAM_BOT_URL ?? 'http://127.0.0.1:3004'

export async function botSend(chatId: string, text: string): Promise<void> {
  try {
    await fetch(`${BOT_URL}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.REALTIME_SECRET,
        chatId,
        text,
      }),
      signal: AbortSignal.timeout(4000),
    })
  } catch {
    // бот не критичен: игра работает и без него
  }
}

/** Отправить игроку уведомление в Telegram, если аккаунт привязан. Не блокирует поток. */
export async function telegramNotify(userId: string, text: string): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    const link = await db.telegramLink.findUnique({ where: { userId } })
    if (!link) return
    await botSend(link.chatId, text)
  } catch {
    // тишина
  }
}
