'use client'

// TTL-кэш для виджетов (M4-64b). HomeScreen размонтируется при открытии
// приложения и монтируется заново на каждом возврате домой; шторка-ЦУ
// пересобирается на каждом открытии. Без кэша каждый такой монтаж дёргал
// по 3 запроса (карьера + доставки + лидерборд). Кэш живёт на уровне модуля —
// переживает монтирование/размонтирование компонентов.

export interface TtlCache<T> {
  /** Свежие данные или null, если кэша нет или он протух. */
  get: () => T | null
  /** Сохранить результат запроса. */
  set: (data: T) => void
}

export function createTtlCache<T>(ttlMs = 60_000): TtlCache<T> {
  let data: T | null = null
  let at = 0
  return {
    get: () => (data !== null && Date.now() - at < ttlMs ? data : null),
    set: (next) => {
      data = next
      at = Date.now()
    },
  }
}
