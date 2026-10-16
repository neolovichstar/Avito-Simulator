// Сервисная авторизация внутренних роутов (бот :3004 → /api/telegram/*) по заголовку
// x-service-secret. Единственное место проверки секрета REALTIME_SECRET — раньше
// каждый из 4 роутов дублировал EXPECTED_SECRET и сравнивал строки через `===`.
//
// 63-a2: сравнение постоянного времени через admin-session.safeEqualStrings
// (SHA-256-дайджесты обеих сторон + побайтовое сравнение без раннего выхода,
// edge-совместимо). Fallback-дефолт ОСТАВЛЕН сознательно: прод может жить без
// переменной REALTIME_SECRET — его отсутствие не должно ломать бота, но такой
// конфиг помечается warning-ом в лог.
import { safeEqualStrings } from '@/lib/admin-session'

const HAS_ENV_SECRET = Boolean(process.env.REALTIME_SECRET)

// Один warn на процесс, а не на каждый запрос
if (!HAS_ENV_SECRET) {
  console.warn('[telegram] REALTIME_SECRET not set, using insecure default')
}

// Если REALTIME_SECRET на сервере не задан (напр. Vercel), принимаем канонический дефолт
export const EXPECTED_SECRET = process.env.REALTIME_SECRET ?? 'avito-sim-rt-2024-secret'

/** Проверяет x-service-secret запроса (timing-safe). true — запрос от своего сервиса. */
export async function serviceOk(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-service-secret')
  if (!secret) return false
  return safeEqualStrings(secret, EXPECTED_SECRET)
}
