import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Простой health-check прода: 1 = БД отвечает, иначе отдаём текст ошибки
// (укороченный) — чтобы диагностировать прод без доступа к Vercel-логам.
export async function GET() {
  const started = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({ ok: true, db: 'up', ms: Date.now() - started })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json(
      { ok: false, db: 'down', error: msg.slice(0, 300), ms: Date.now() - started },
      { status: 500 },
    )
  }
}
