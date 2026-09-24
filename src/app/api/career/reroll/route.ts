import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { QUEST_POOL, type QuestDef } from '@/lib/quests'

export const dynamic = 'force-dynamic'

// Бесплатная замена одного задания в день: удаляем невыполненное,
// выдаём новое из пула с другим типом. Мега-задание заменить нельзя.
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const today = new Date().toISOString().slice(0, 10)

  if (user.rerollDay === today) {
    return Response.json({ error: 'Замена уже использована — приходите завтра' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as { questId?: string }
  if (!body.questId) return Response.json({ error: 'questId обязателен' }, { status: 400 })

  const quest = await db.quest.findFirst({
    where: { userId: user.id, questId: body.questId, day: today },
    orderBy: { createdAt: 'desc' },
  })
  if (!quest) return Response.json({ error: 'Задание не найдено' }, { status: 404 })
  if (quest.questId.startsWith('mega_')) {
    return Response.json({ error: 'Мега-задание заменить нельзя — оно того стоит' }, { status: 400 })
  }
  if (quest.claimed) return Response.json({ error: 'Награда уже получена' }, { status: 400 })
  if (quest.progress > 0) {
    return Response.json({ error: 'Задание уже в процессе — заменять поздно' }, { status: 400 })
  }

  // типы, уже занятые сегодняшними заданиями (кроме заменяемого)
  const todays = await db.quest.findMany({ where: { userId: user.id, day: today, claimed: false } })
  const busyKinds = new Set<string>(todays.filter((q) => q.id !== quest.id).map((q) => q.kind))

  const candidates = QUEST_POOL.filter((q) => !busyKinds.has(q.kind))
  if (!candidates.length) {
    return Response.json({ error: 'Не осталось заданий на замену — заходите завтра' }, { status: 400 })
  }
  const total = candidates.reduce((s, q) => s + q.weight, 0)
  let r = Math.random() * total
  let pick: QuestDef = candidates[candidates.length - 1]
  for (const q of candidates) {
    r -= q.weight
    if (r <= 0) { pick = q; break }
  }

  await db.quest.delete({ where: { id: quest.id } })
  const created = await db.quest.create({
    data: {
      userId: user.id, questId: pick.id, title: pick.title, desc: pick.desc(pick.target), kind: pick.kind,
      target: pick.target, reward: pick.reward, xpReward: pick.xpReward, day: today,
    },
  })
  await db.user.update({ where: { id: user.id }, data: { rerollDay: today } })

  return Response.json({
    ok: true,
    quest: {
      id: created.id, questId: created.questId, title: created.title, desc: created.desc,
      progress: created.progress, target: created.target,
      reward: created.reward, xpReward: created.xpReward, claimed: created.claimed,
    },
  })
}
