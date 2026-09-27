import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/** Отказоустойчивый prisma-вызов: даже если модели нет в клиенте — вернём fallback. */
function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return fn().catch(() => fallback)
  } catch {
    return Promise.resolve(fallback)
  }
}

// Журнал действий администратора — кто что делал в панели и когда.
export async function GET(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const entity = url.searchParams.get('entity') ?? 'all'
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)

  const where: Record<string, unknown> = {}
  if (q) where.OR = [{ detail: { contains: q } }, { action: { contains: q } }, { entityId: { contains: q } }]
  if (entity !== 'all') where.entity = entity

  // Чтение журнала — отказоустойчиво (например, если таблица ещё не создана на БД)
  const [total, rows] = await Promise.all([
    safe(() => db.adminAction.count({ where }), 0),
    safe(
      () =>
        db.adminAction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
      [] as { id: string; action: string; entity: string; entityId: string; detail: string; createdAt: Date }[],
    ),
  ])

  return Response.json({
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  })
}
