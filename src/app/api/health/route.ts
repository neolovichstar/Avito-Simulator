import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Простой health-check прода: 1 = БД отвечает. Детали ошибки БД (адрес,
// строка подключения) наружу НЕ отдаём (61-c) — только в лог сервера.
export async function GET() {
  const started = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({ ok: true, db: 'up', ms: Date.now() - started })
  } catch (e) {
    console.error('[health] db down:', e instanceof Error ? e.message : e)
    return Response.json(
      { ok: false, db: 'down', ms: Date.now() - started },
      { status: 500 },
    )
  }
}
