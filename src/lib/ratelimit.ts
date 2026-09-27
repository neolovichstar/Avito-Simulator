// Окно-рейт-лимитер в памяти

interface Bucket {
  count: number
  resetAt: number
}

const g = globalThis as unknown as { __avitoRL?: Map<string, Bucket> }
const buckets: Map<string, Bucket> = g.__avitoRL ?? new Map()
g.__avitoRL = buckets

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= max) return false
  b.count++
  return true
}

// периодическая чистка чтобы память не текла
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k)
  }, 60_000)
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
}
