// Upstash Redis (REST API) — персистентный слой поверх in-memory кеша/лимитов.
// Ничего не падает, если Redis недоступен: все функции молча откатываются на память.

const URL_ = process.env.REDIS_KV_REST_API_URL
const TOKEN = process.env.REDIS_KV_REST_API_TOKEN

export const redisEnabled = Boolean(URL_ && TOKEN)

interface RedisState {
  alive: boolean | null // null = ещё не проверяли
  lastLatencyMs: number | null
  lastCheckAt: number
  failStreak: number
}

const g = globalThis as unknown as { __avitoRedis?: RedisState }
const state: RedisState = (g.__avitoRedis ??= {
  alive: null,
  lastLatencyMs: null,
  lastCheckAt: 0,
  failStreak: 0,
})

/** Низкоуровневая команда Upstash REST: ["INCR","k"] → значение. */
async function command<T = unknown>(args: (string | number)[]): Promise<T | null> {
  if (!redisEnabled) return null
  const started = Date.now()
  try {
    const res = await fetch(`${URL_}/${args.map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Upstash-Project': 'avito-sim' },
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`upstash ${res.status}`)
    const json = (await res.json()) as { result?: T; error?: string }
    if (json.error) throw new Error(json.error)
    state.alive = true
    state.failStreak = 0
    state.lastLatencyMs = Date.now() - started
    state.lastCheckAt = Date.now()
    return json.result ?? null
  } catch {
    state.failStreak++
    state.alive = false
    state.lastCheckAt = Date.now()
    return null
  }
}

/**
 * Персистентный rate-limit на Upstash (INCR + EXPIRE).
 * Если Redis выключен/недоступен — прозрачно падает на in-memory rateLimit.
 */
export async function redisLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  if (!redisEnabled) {
    const { rateLimit } = await import('@/lib/ratelimit')
    return rateLimit(key, max, windowMs)
  }
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000))
  const n = await command<number>(['INCR', `rl:${key}`])
  if (n === null) {
    // Redis недоступен — фолбэк на память, сервис не страдает
    const { rateLimit } = await import('@/lib/ratelimit')
    return rateLimit(key, max, windowMs)
  }
  if (n === 1) void command(['EXPIRE', `rl:${key}`, windowSec])
  return n <= max
}

/**
 * Distributed lock (SET NX EX) — защита от двойных фоновых свипов
 * после hot-reload / параллельных инстансов.
 */
export async function redisLock(key: string, ttlMs: number): Promise<boolean> {
  if (!redisEnabled) return true // без Redis локов нет — работаем как раньше
  const res = await command<0 | 1>(['SET', `lock:${key}`, '1', 'NX', 'PX', ttlMs])
  return res === 1
}

export async function redisUnlock(key: string): Promise<void> {
  if (!redisEnabled) return
  await command(['DEL', `lock:${key}`])
}

/** Пинг Redis: возвращает латентность или null. Кешируется на 15с. */
export async function redisPing(): Promise<number | null> {
  if (!redisEnabled) return null
  if (state.alive && Date.now() - state.lastCheckAt < 15_000) return state.lastLatencyMs
  const started = Date.now()
  const ok = await command<string>(['PING'])
  return ok === 'PONG' ? Date.now() - started : null
}

export function redisStatus() {
  return {
    enabled: redisEnabled,
    alive: state.alive,
    latencyMs: state.lastLatencyMs,
    failStreak: state.failStreak,
  }
}

/** GET-обёртка для внешних модулей (строковые значения). */
export async function redisGet(key: string): Promise<string | null> {
  const r = await command<string>(['GET', key])
  return r ?? null
}
