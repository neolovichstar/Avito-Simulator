// Ежедневные задания игрока: 3 обычных + 1 мега-задание (награда x2)
import { db } from '@/lib/db'
import { QUEST_POOL, type QuestDef } from '@/lib/quests'
import { notifyUser } from '@/lib/deals'

// взвешенный выбор одного квеста из пула, исключая занятые kind'ы
function pickWeighted(pool: QuestDef[], excludeKinds: Set<string>): QuestDef | null {
  const candidates = pool.filter((q) => !excludeKinds.has(q.kind))
  if (!candidates.length) return null
  const total = candidates.reduce((s, q) => s + q.weight, 0)
  let r = Math.random() * total
  for (const q of candidates) {
    r -= q.weight
    if (r <= 0) return q
  }
  return candidates[candidates.length - 1]
}

export async function ensureDailyQuests(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return
  const today = new Date().toISOString().slice(0, 10)
  if (user.questDay === today) {
    const have = await db.quest.count({ where: { userId, day: today } })
    if (have > 0) return
  }
  const pool = [...QUEST_POOL]
  const chosen: QuestDef[] = []
  const usedKinds = new Set<string>()

  // 3 обычных задания
  while (chosen.length < 3 && pool.length) {
    const pick = pickWeighted(pool, usedKinds)
    if (!pick) break
    pool.splice(pool.indexOf(pick), 1)
    chosen.push(pick)
    usedKinds.add(pick.kind)
  }

  // мега-задание дня: из «дорогих» квестов (reward >= 4000), награда x2
  const megaPool = pool.filter((q) => q.reward >= 4000)
  const mega = pickWeighted(megaPool, usedKinds)
  for (const q of chosen) {
    await db.quest.create({
      data: {
        userId, questId: q.id, title: q.title, desc: q.desc(q.target), kind: q.kind,
        target: q.target, reward: q.reward, xpReward: q.xpReward, day: today,
      },
    })
  }
  if (mega) {
    await db.quest.create({
      data: {
        userId, questId: `mega_${mega.id}`, title: `Мега: ${mega.title}`, desc: mega.desc(mega.target), kind: mega.kind,
        target: mega.target, reward: mega.reward * 2, xpReward: mega.xpReward * 2, day: today,
      },
    })
  }
  await db.user.update({ where: { id: userId }, data: { questDay: today } })
  await notifyUser(
    userId, 'system', 'Новые задания',
    mega
      ? 'Три новых поручения и мега-задание с двойной наградой — смотрите в приложении Задания.'
      : 'Заходите в приложение Задания — три новых поручения на день.',
  )
}
