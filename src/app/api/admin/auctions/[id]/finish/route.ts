import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdmin } from '@/lib/admin-log'
import { emitTo } from '@/lib/realtime-emit'

export const dynamic = 'force-dynamic'

// Мгновенное завершение: endsAt = сейчас. Финализацию (определение победителя,
// escrow, предмет, уведомления) делает игровой движок на ближайшем тике —
// так не дублируется логика и ничего не ломается.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const { id } = await ctx.params
  const lot = await db.auctionLot.findUnique({ where: { id } })
  if (!lot) return Response.json({ error: 'Лот не найден' }, { status: 404 })
  if (lot.status !== 'active') return Response.json({ error: 'Лот уже завершён' }, { status: 400 })

  await db.auctionLot.update({
    where: { id },
    data: { endsAt: new Date() },
  })
  await emitTo('global', 'auction:update', { lotId: id, adminFinished: true }).catch(() => {})
  await logAdmin('auction.finish', 'auction', id, `Лот «${lot.title}» завершён досрочно (ставок: ${lot.bidCount})`)

  return Response.json({ ok: true })
}
