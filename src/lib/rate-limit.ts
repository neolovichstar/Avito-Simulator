// Скользящее окно (sliding window) rate limiter в памяти процесса.
// Task 61-c: релизная защита дорогих/рисковых эндпоинтов.
//
// Отличия от старого src/lib/ratelimit.ts (фиксированное окно, boolean):
//  • окно скользящее — всплеск ровно на границе минут больше не удваивает лимит;
//  • возвращаем { ok, retryAfter } — клиенту можно отдать честный Retry-After;
//  • ключ составной: имя эндпоинта + IP (или userId).
//
// Хранилище — Map в globalThis (переживает HMR-перезагрузки модуля).
// Каждый ключ держит не больше `limit` таймстемпов, поэтому память ограничена:
// злоумышленник, долбящийся сверх лимита, не раздувает массив.

export interface RateLimitOptions {
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  /** Секунды до освобождения слота (округление вверх). Есть только при ok:false. */
  retryAfter?: number
}

const g = globalThis as unknown as { __resaleSlidingRL?: Map<string, number[]> }
const hits: Map<string, number[]> = g.__resaleSlidingRL ?? new Map()
g.__resaleSlidingRL = hits

export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const prev = hits.get(key)
  const fresh = prev ? prev.filter((t) => now - t < windowMs) : []

  if (fresh.length >= limit) {
    // не пишем отклонённые попытки — массив ограничен `limit` элементами
    const oldest = fresh[0] ?? now
    return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) }
  }

  fresh.push(now)
  hits.set(key, fresh)
  return { ok: true }
}

/** IP клиента за прокси/Vercel (первый адрес x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'local'
}

/** Составной ключ «эндпоинт:ip» для публичных лимитов. */
export function ipKey(req: Request, endpoint: string): string {
  return `${endpoint}:${clientIp(req)}`
}

/** Единый 429-ответ: заданное сообщение + честный Retry-After. */
export function tooMany(retryAfter?: number): Response {
  return Response.json(
    { error: 'Слишком много запросов, подожди немного' },
    { status: 429, headers: { 'Retry-After': String(retryAfter ?? 60) } },
  )
}

// Периодическая чистка протухших ключей, чтобы память не текла.
// Ключ удаляется, если его свежайший таймстемп старше 5 минут
// (все окна в проекте ≤ 60с, так что запас безопасный).
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [k, arr] of hits) {
      const last = arr[arr.length - 1]
      if (!last || now - last > 5 * 60_000) hits.delete(k)
    }
  }, 60_000)
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
}
