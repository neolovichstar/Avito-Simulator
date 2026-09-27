// Фоновый движок живого рынка + Telegram-бот (@resalesimbot).
// Бот встроен в next-server: песочница убивает отдельно запущенные
// процессы на границе tool-сессий, а next-server живёт днями.
export async function register() {
  console.log('[instrumentation] register() invoked, runtime =', process.env.NEXT_RUNTIME)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startEngine } = await import('@/lib/engine')
  startEngine()
  const { startTelegramBot } = await import('@/lib/bot-server')
  startTelegramBot()
}
