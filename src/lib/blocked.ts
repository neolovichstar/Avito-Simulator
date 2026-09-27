// Чёрный список продавцов: проверки для движка и ботов.
// Небольшой helper с кешем — блокировки меняются редко, а проверок много.
import { db } from '@/lib/db'
import { cache } from '@/lib/cache'

export async function isBlocked(userId: string, sellerId: string): Promise<boolean> {
  if (!userId || !sellerId || userId === sellerId) return false
  return cache.getOrSet(`blocked:${userId}:${sellerId}`, 60_000, async () => {
    const row = await db.blockedSeller.findUnique({
      where: { userId_sellerId: { userId, sellerId } },
      select: { id: true },
    })
    return !!row
  })
}

export async function blockedIds(userId: string): Promise<string[]> {
  if (!userId) return []
  return cache.getOrSet(`blockedAll:${userId}`, 30_000, async () => {
    const rows = await db.blockedSeller.findMany({
      where: { userId },
      select: { sellerId: true },
    })
    return rows.map((r) => r.sellerId)
  })
}

export function invalidateBlocked(userId: string): void {
  cache.invalidate(`blocked:`)
  cache.invalidate(`blockedAll:${userId}`)
}
