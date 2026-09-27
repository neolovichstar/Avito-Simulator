// Standalone-запуск бота (опционально): bun mini-services/telegram-bot/index.ts
// Основной режим — внутри next-server через src/instrumentation.ts.
import { startTelegramBot } from '../../src/lib/bot-server'

startTelegramBot()
