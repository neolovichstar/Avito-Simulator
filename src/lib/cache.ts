// Простой TTL-кеш в памяти с защитой от пенальти (single-flight)

interface Entry<T> {
  value: T
  expires: number
  promise?: Promise<T>
}

export class TTLCache {
  private store = new Map<string, Entry<unknown>>()
  private hits = 0
  private misses = 0

  get<T>(key: string): T | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (Date.now() > e.expires) {
      this.store.delete(key)
      this.misses++
      return undefined
    }
    this.hits++
    return e.value as T
  }

  set<T>(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expires: Date.now() + ttlMs })
  }

  async getOrSet<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== undefined) return cached
    const inflight = this.store.get(key)?.promise as Promise<T> | undefined
    if (inflight) return inflight
    const promise = producer()
      .then((v) => {
        this.set(key, v, ttlMs)
        return v
      })
      .finally(() => {
        const e = this.store.get(key)
        if (e) delete e.promise
      })
    this.store.set(key, { value: undefined as unknown as T, expires: 0, promise })
    this.misses++
    return promise
  }

  invalidate(prefix: string) {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k)
    }
  }

  stats() {
    return { size: this.store.size, hits: this.hits, misses: this.misses }
  }
}

// Глобальный кеш приложения
const g = globalThis as unknown as { __avitoCache?: TTLCache }
export const cache: TTLCache = g.__avitoCache ?? new TTLCache()
g.__avitoCache = cache
