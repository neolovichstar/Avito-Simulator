import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { toolForGame } from '@/lib/parts'

export const dynamic = 'force-dynamic'

// Отмена незавершённого наряда: деньги за работу возвращаются,
// прочность инструмента восстанавливается (работа не сделана).
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { jobId?: string }
  if (!body.jobId) return Response.json({ error: 'jobId обязателен' }, { status: 400 })
  const job = await db.repairJob.findUnique({ where: { id: body.jobId } })
  if (!job || job.userId !== user.id) return Response.json({ error: 'Наряд не найден' }, { status: 404 })
  if (job.status !== 'in_progress') return Response.json({ error: 'Наряд уже закрыт' }, { status: 400 })

  await db.$transaction(async (tx) => {
    if (job.cost > 0) {
      await tx.user.update({ where: { id: user.id }, data: { balance: { increment: job.cost } } })
      await tx.transaction.create({
        data: { userId: user.id, type: 'sale', amount: job.cost, note: 'Отмена наряда: возврат за работу' },
      })
    }
    const tool = job.game ? toolForGame(job.game as Parameters<typeof toolForGame>[0]) : undefined
    if (tool) {
      await tx.workshopTool.updateMany({
        where: { userId: user.id, toolKey: tool.key, durability: { gt: 0 } },
        data: { durability: { increment: 1 } },
      })
    }
    await tx.repairJob.update({ where: { id: job.id }, data: { status: 'cancelled', finishedAt: new Date() } })
  })

  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { balance: true } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance })
}
