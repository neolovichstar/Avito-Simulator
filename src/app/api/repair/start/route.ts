import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { nextCondition } from '@/lib/economy'
import { fmtMoney } from '@/lib/format'
import { partById } from '@/lib/parts'
import {
  workCost, difficultyFor, gameAndTool, validatePart, stockMapFor, WARRANTY_MS,
} from '@/lib/repair-server'
import type { JobConfigDTO } from '@/lib/types'
import { itemImage } from '@/lib/item-images'

export const dynamic = 'force-dynamic'

// Старт работы: ремонт (condition+1) или установка запчасти (value+).
// Деньги за работу списываются сразу, мини-игра — потом.
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as {
    itemId?: string; kind?: 'repair' | 'install'; partKey?: string
  }
  if (!body.itemId || (body.kind !== 'repair' && body.kind !== 'install')) {
    return Response.json({ error: 'Нужны itemId и kind' }, { status: 400 })
  }
  const kind = body.kind
  const item = await db.item.findUnique({ where: { id: body.itemId } })
  if (!item || item.ownerId !== user.id) return Response.json({ error: 'Товар не найден' }, { status: 404 })
  const listed = await db.listing.count({ where: { itemId: item.id, status: 'active' } })
  if (listed > 0) return Response.json({ error: 'Сначала снимите товар с продажи' }, { status: 400 })
  const oldOrder = await db.repairOrder.count({ where: { itemId: item.id, status: { in: ['in_progress', 'ready'] } } })
  if (oldOrder > 0) return Response.json({ error: 'Товар у наёмного мастера — заберите его' }, { status: 400 })
  const activeJob = await db.repairJob.findFirst({
    where: { itemId: item.id, status: 'in_progress', kind: { in: ['repair', 'install'] } },
  })
  if (activeJob) return Response.json({ error: 'У этой вещи уже открыт наряд' }, { status: 400 })

  const stock = await stockMapFor(user.id)
  const installedRows = await db.installedPart.findMany({ where: { userId: user.id, itemId: item.id } })
  const installedKeys = installedRows.map((r) => r.partKey)

  let partKey: string | null = null
  let partTitle: string | null = null
  if (kind === 'repair') {
    if (!nextCondition(item.condition)) return Response.json({ error: 'Уже в отличном состоянии' }, { status: 400 })
    // Запчасть для ремонта не обязательна, но если выбрана — проверяем
    if (body.partKey) {
      const v = validatePart(body.partKey, item, installedKeys, stock)
      if ('error' in v) return Response.json({ error: v.error }, { status: 400 })
      partKey = v.part.key
      partTitle = v.part.title
    }
  } else {
    const v = validatePart(body.partKey, item, installedKeys, stock)
    if ('error' in v) return Response.json({ error: v.error }, { status: 400 })
    partKey = v.part.key
    partTitle = v.part.title
  }

  // Диагностирована ли вещь (свежий diagnose-наряд)
  const diag = await db.repairJob.findFirst({
    where: { itemId: item.id, kind: 'diagnose', status: 'done' },
    orderBy: { startedAt: 'desc' },
  })
  const diagnosed = Boolean(diag)

  // Гарантия: бесплатный повтор после неудачного ремонта
  const warrantyJob = await db.repairJob.findFirst({
    where: { itemId: item.id, kind: 'repair', status: 'done', score: { lt: 60 }, warrantyUntil: { gt: new Date() } },
    orderBy: { finishedAt: 'desc' },
  })
  const hasWarranty = Boolean(warrantyJob)

  const { game, hasTool, toolKey } = await gameAndTool(user.id, item, partKey)
  const difficulty = difficultyFor({
    diagnosed, hasTool, level: user.level, withPart: Boolean(partKey),
  })

  let cost = 0
  if (!hasWarranty) {
    cost = workCost(item.baseValue, { kind, diagnosed, level: user.level, withPart: Boolean(partKey) })
    if (user.balance < cost) {
      return Response.json({ error: `Работа стоит ${fmtMoney(cost)}. Недостаточно средств` }, { status: 400 })
    }
  }

  const job = await db.$transaction(async (tx) => {
    if (cost > 0) {
      await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: cost } } })
      await tx.transaction.create({
        data: { userId: user.id, type: 'purchase', amount: -cost, note: kind === 'repair' ? `Ремонт: ${item.title}` : `Установка запчасти: ${item.title}` },
      })
    }
    if (toolKey && hasTool) {
      await tx.workshopTool.update({
        where: { userId_toolKey: { userId: user.id, toolKey } },
        data: { durability: { decrement: 1 } },
      })
    }
    return tx.repairJob.create({
      data: {
        userId: user.id, itemId: item.id, kind, game, difficulty, partKey,
        cost, status: 'in_progress',
      },
    })
  })

  const dto: JobConfigDTO = {
    jobId: job.id,
    kind,
    game,
    difficulty,
    itemTitle: item.title,
    itemImage: itemImage(item.itemKey, item.category),
    partKey,
    partTitle,
    cost,
    warranty: hasWarranty,
    hasTool,
  }
  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { balance: true } })
  return Response.json({
    ok: true,
    balance: fresh?.balance ?? user.balance,
    job: dto,
    warranty: hasWarranty ? (warrantyJob?.warrantyUntil?.toISOString() ?? null) : null,
    warrantyMs: WARRANTY_MS,
    part: partKey ? partById(partKey) : null,
  })
}
