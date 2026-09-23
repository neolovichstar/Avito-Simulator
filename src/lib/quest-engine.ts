// Ежедневные задания игрока
import { db } from '@/lib/db'
import { QUEST_POOL } from '@/lib/quests'
import { notifyUser } from '@/lib/deals'

export async function ensureDailyQuests(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return
  const today = new Date().toISOString().slice(0, 10)
  if (user.questDay === today) {
    const have = await db.quest.count({ where: { userId, day: today } })
    if (have > 0) return
  }
  // выбрать 3 случайных взвешенно
  const pool = [...QUEST_POOL]
  const chosen: typeof QUEST_POOL = []
  while (chosen.length < 3 && pool.length) {
    const total = pool.reduce((s, q) => s + q.weight, 0)
    let r = Math.random() * total
    let pickIdx = 0
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight
      if (r <= 0) { pickIdx = i; break }
    }
    chosen.push(pool.splice(pickIdx, 1)[0])
  }
  for (const q of chosen) {
    await db.quest.create({
      data: {
        userId, questId: q.id, title: q.title, desc: q.desc(q.target), kind: q.kind,
        target: q.target, reward: q.reward, xpReward: q.xpReward, day: today,
      },
    })
  }
  await db.user.update({ where: { id: userId }, data: { questDay: today } })
  await notifyUser(userId, 'system', 'Новые задания', 'Заходите в приложение Задания — три новых поручения на день.')
}
