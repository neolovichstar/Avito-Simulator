import { db } from '@/lib/db'

/**
 * Фиксирует действие администратора в журнале (AdminAction).
 * Никогда не ломает основной запрос: ошибки логирования только в консоль.
 */
export async function logAdmin(action: string, entity: string, entityId: string, detail: string) {
  try {
    await db.adminAction.create({
      data: { action, entity, entityId: entityId ?? '', detail: detail.slice(0, 500) },
    })
  } catch (e) {
    console.error('admin-log failed:', action, e)
  }
}
