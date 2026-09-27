// Ограничитель попыток входа в админ-панель (анти-брутфорс).
// Глобальный слой — Upstash Redis по REST (общий на все инстансы Vercel),
// автоматический фолбэк — память процесса (песочница/локальная разработка).
// Окно 15 минут, максимум 5 неудачных попыток → блокировка до конца окна.

const WINDOW_SEC = 15 * 60
export const MAX_FAILS = 5

type Bucket = { count: number; resetAt: number }
const mem = new Map<string, Bucket>()

function unquote(v: string | undefined): string {
  const s = v?.trim() ?? ''
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1)
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1)
  return s
}

function restUrl(): string {
  return unquote(process.env.REDIS_KV_REST_API_URL).replace(/\/$/, '')
}
function restToken(): string {
  return unquote(process.env.REDIS_KV_REST_API_TOKEN)
}

async function upstash(cmd: string[]): Promise<{ result: unknown } | null> {
  const url = restUrl()
  const token = restToken()
  if (!url || !token) return null
  try {
    const r = await fetch(`${url}/${cmd.join('/')}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    })
    if (!r.ok) return null
    return (await r.json()) as { result: unknown }
  } catch {
    return null
  }
}

/** IP клиента (за прокси/Vercel — из x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'local'
}

function memKey(ip: string): string {
  return `admin:fail:${ip}`
}

/** Текущее число неудач и секунд до сброса окна. */
export async function getFails(ip: string): Promise<{ count: number; ttl: number }> {
  const key = `resale:admin:${memKey(ip)}`
  const g = await upstash(['get', key])
  if (g && g.result != null) {
    const t = await upstash(['ttl', key])
    const ttl = Math.max(0, Number(t?.result) || 0)
    return { count: Number(g.result) || 0, ttl }
  }
  if (g) return { count: 0, ttl: 0 } // Redis отвечает, ключа нет

  const b = mem.get(memKey(ip))
  if (!b) return { count: 0, ttl: 0 }
  const left = b.resetAt - Date.now()
  if (left <= 0) {
    mem.delete(memKey(ip))
    return { count: 0, ttl: 0 }
  }
  return { count: b.count, ttl: Math.ceil(left / 1000) }
}

/** Сколько секунд осталось до разблокировки (0 = вход разрешён). */
export async function lockSecondsLeft(ip: string): Promise<number> {
  const { count, ttl } = await getFails(ip)
  if (count < MAX_FAILS) return 0
  return ttl > 0 ? ttl : WINDOW_SEC
}

/** Фиксирует неудачную попытку. */
export async function registerFail(ip: string): Promise<void> {
  const key = `resale:admin:${memKey(ip)}`
  const inc = await upstash(['incr', key])
  if (inc && typeof inc.result === 'number') {
    if (inc.result === 1) await upstash(['expire', key, String(WINDOW_SEC)])
    return
  }
  const b = mem.get(memKey(ip)) ?? { count: 0, resetAt: Date.now() + WINDOW_SEC * 1000 }
  b.count += 1
  mem.set(memKey(ip), b)
}

/** Успешный вход — сбрасываем счётчик. */
export async function clearFails(ip: string): Promise<void> {
  const key = `resale:admin:${memKey(ip)}`
  await upstash(['del', key])
  mem.delete(memKey(ip))
}

export function pluralSec(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return `${n} секунду`
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} секунды`
  return `${n} секунд`
}
