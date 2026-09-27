import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { nextCondition } from '@/lib/economy'
import { addXp, bumpStats, bumpQuests, checkAchievements } from '@/lib/deals'
import { partById, type Part } from '@/lib/parts'
import { baseValueCap, estValueOf, stockMapFor, WARRANTY_MS } from '@/lib/repair-server'
import type { JobResultDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Финал работы: сервер принимает score мини-игры, применяет последствия.
// score ≥ 60 — успех (condition+1 / установка детали), ≥ 85 — «идеально» (бонус к цене).
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { jobId?: string; score?: number }
  if (!body.jobId || typeof body.score !== 'number' || !Number.isFinite(body.score)) {
    return Response.json({ error: 'Нужны jobId и score' }, { status: 400 })
  }
  const job = await db.repairJob.findUnique({ where: { id: body.jobId } })
  if (!job || job.userId !== user.id) return Response.json({ error: 'Наряд не найден' }, { status: 404 })
  if (job.status !== 'in_progress') return Response.json({ error: 'Наряд уже закрыт' }, { status: 400 })

  const score = Math.max(0, Math.min(100, Math.round(body.score)))
  const success = score >= 60
  const perfect = score >= 85
  const item = await db.item.findUnique({ where: { id: job.itemId } })
  if (!item || item.ownerId !== user.id) return Response.json({ error: 'Товар не найден' }, { status: 404 })

  const part: Part | null = job.partKey ? partById(job.partKey) ?? null : null
  let partWasted = false
  let valueAdd = 0
  let message = ''
  let warrantyUntil: Date | null = null

  if (success) {
    const stock = await stockMapFor(user.id)
    let partWear: number | null = null
    // Успех: списываем деталь со склада (если наряд с деталью)
    if (part) {
      const have = stock.get(part.key)?.qty ?? 0
      if (have > 0) {
        const wearAvg = stock.get(part.key)?.wearAvg ?? 0
        partWear = wearAvg
        // Изношенная деталь даёт меньше ценности
        valueAdd = Math.round(part.valueAdd * (1 - wearAvg / 200) * (perfect ? 1 : 0.7))
        await db.partStock.update({
          where: { userId_partKey: { userId: user.id, partKey: part.key } },
          data: { qty: { decrement: 1 } },
        })
      }
    }

    if (job.kind === 'repair') {
      const to = nextCondition(item.condition)
      if (to) await db.item.update({ where: { id: item.id }, data: { condition: to } })
      message = perfect ? 'Идеальная работа — как из коробки' : 'Готово, состояние улучшено'
    } else {
      message = perfect ? 'Деталь встала идеально' : 'Деталь установлена'
    }

    // Вклад детали в цену вещи (с потолком от базовой цены каталога)
    if (part && valueAdd > 0) {
      // замена узла того же вида не удваивает цену: вычитаем вклад предыдущей
      const prev = await db.installedPart.findFirst({
        where: { userId: user.id, itemId: item.id, kind: part.kind },
        orderBy: { createdAt: 'desc' },
      })
      const bump = Math.max(0, valueAdd - (prev?.valueAdd ?? 0))
      if (bump > 0) {
        const cap = baseValueCap(item.itemKey)
        const next = Math.min(cap, item.baseValue + bump)
        await db.item.update({ where: { id: item.id }, data: { baseValue: next } })
      }
    } else if (job.kind === 'repair' && perfect && !part) {
      // идеальный ремонт без детали тоже чуть поднимает цену (+4%)
      const bump = Math.max(100, Math.round(item.baseValue * 0.04))
      const cap = baseValueCap(item.itemKey)
      const next = Math.min(cap, item.baseValue + bump)
      await db.item.update({ where: { id: item.id }, data: { baseValue: next } })
      valueAdd = bump
    }

    if (part) {
      await db.installedPart.create({
        data: {
          userId: user.id, itemId: item.id, partKey: part.key, title: part.title,
          kind: part.kind, wear: partWear ?? 0, valueAdd,
        },
      })
    }

    await db.repairJob.update({
      where: { id: job.id },
      data: { status: 'done', score, finishedAt: new Date(), partWear },
    })

    const xp = (job.kind === 'repair' ? 18 : 15) + Math.round(score / 5)
    await addXp(user.id, xp)
    if (job.kind === 'repair') {
      await bumpStats(user.id, { repairs: 1 })
      await bumpQuests(user.id, 'repair')
    }
    await checkAchievements(user.id)
    const fresh = await db.item.findUnique({ where: { id: item.id } })
    return Response.json({
      ok: true,
      success: true,
      perfect,
      score,
      item: fresh ? {
        id: fresh.id, itemKey: fresh.itemKey, title: fresh.title, category: fresh.category,
        condition: fresh.condition, image: fresh.image, baseValue: fresh.baseValue,
        purchasePrice: fresh.purchasePrice, estValue: estValueOf(fresh.baseValue, fresh.condition),
        createdAt: fresh.createdAt.toISOString(), listed: false,
      } : null,
      valueAdd,
      partWasted: false,
      warrantyUntil: null,
      xp,
      message,
    } satisfies JobResultDTO)
  }

  // Неудача: часть работы — шанс повредить деталь
  if (part) {
    if (Math.random() < 0.4) {
      const stock = await stockMapFor(user.id)
      if ((stock.get(part.key)?.qty ?? 0) > 0) {
        await db.partStock.update({
          where: { userId_partKey: { userId: user.id, partKey: part.key } },
          data: { qty: { decrement: 1 } },
        })
        partWasted = true
      }
    }
  }
  warrantyUntil = new Date(Date.now() + WARRANTY_MS)
  message = partWasted ? 'Деталь повредили при разборке' : 'Не вышло — работа по гарантии'
  const xp = 6
  await addXp(user.id, xp)

  await db.repairJob.update({
    where: { id: job.id },
    data: { status: 'done', score, finishedAt: new Date(), warrantyUntil },
  })
  return Response.json({
    ok: true,
    success: false,
    perfect: false,
    score,
    item: null,
    valueAdd: 0,
    partWasted,
    warrantyUntil: warrantyUntil.toISOString(),
    xp,
    message,
  } satisfies JobResultDTO)
}
