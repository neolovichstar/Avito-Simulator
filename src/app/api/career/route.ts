import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ensureDailyQuests } from '@/lib/quest-engine'
import { ACHIEVEMENTS } from '@/lib/quests'
import type { AchievementDTO, QuestDTO } from '@/lib/types'
import { levelFromXp, levelProgress } from '@/lib/economy'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  await ensureDailyQuests(user.id)

  const quests = await db.quest.findMany({
    where: { userId: user.id, day: new Date().toISOString().slice(0, 10) },
    orderBy: { createdAt: 'asc' },
  })
  const unlocked = new Set<string>(JSON.parse(user.achievements || '[]') as string[])
  const achievements: AchievementDTO[] = ACHIEVEMENTS.map((a) => ({
    id: a.id, title: a.title, desc: a.desc, reward: a.reward, unlocked: unlocked.has(a.id),
    secret: a.secret ?? false,
  }))
  const questDto: QuestDTO[] = quests.map((q) => ({
    id: q.id, questId: q.questId, title: q.title, desc: q.desc,
    progress: Math.min(q.progress, q.target), target: q.target,
    reward: q.reward, xpReward: q.xpReward, claimed: q.claimed,
  }))
  return Response.json({
    quests: questDto,
    achievements,
    xp: user.xp,
    level: levelFromXp(user.xp),
    levelProgress: levelProgress(user.xp),
    unlockedCount: unlocked.size,
    totalCount: ACHIEVEMENTS.length,
    rerollAvailable: user.rerollDay !== new Date().toISOString().slice(0, 10),
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { questId?: string }
  if (!body.questId) return Response.json({ error: 'questId обязателен' }, { status: 400 })
  const quest = await db.quest.findFirst({
    where: { userId: user.id, questId: body.questId, day: new Date().toISOString().slice(0, 10) },
    orderBy: { createdAt: 'desc' },
  })
  if (!quest) return Response.json({ error: 'Задание не найдено' }, { status: 404 })
  if (quest.claimed) return Response.json({ error: 'Награда уже получена' }, { status: 400 })
  if (quest.progress < quest.target) return Response.json({ error: 'Задание ещё не выполнено' }, { status: 400 })

  await db.quest.update({ where: { id: quest.id }, data: { claimed: true } })
  await db.user.update({
    where: { id: user.id },
    data: { balance: { increment: quest.reward }, xp: { increment: quest.xpReward } },
  })
  await db.transaction.create({
    data: { userId: user.id, type: 'sale', amount: quest.reward, note: `Задание: ${quest.title}` },
  })
  const { checkAchievements } = await import('@/lib/deals')
  await checkAchievements(user.id)
  const fresh = await db.user.findUnique({ where: { id: user.id } })
  return Response.json({ ok: true, balance: fresh?.balance ?? user.balance, xp: fresh?.xp ?? user.xp })
}
