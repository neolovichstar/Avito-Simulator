// Ежедневные задания игрока: 3 обычных + 1 мега-задание (награда x2)
import { db } from '@/lib/db'
import { QUEST_POOL, type QuestDef } from '@/lib/quests'
import { notifyUser } from '@/lib/deals'

// P2002 — нарушение уникальности Quest(userId, day, questId): строку уже создал
// параллельный запрос, повторять не нужно.
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  )
}

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

type QuestRow = {
  userId: string
  questId: string
  title: string
  desc: string
  kind: string
  target: number
  reward: number
  xpReward: number
  day: string
}

function pickQuestRows(userId: string, today: string): QuestRow[] {
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

  const rows: QuestRow[] = chosen.map((q) => ({
    userId, questId: q.id, title: q.title, desc: q.desc(q.target), kind: q.kind,
    target: q.target, reward: q.reward, xpReward: q.xpReward, day: today,
  }))
  if (mega) {
    rows.push({
      userId, questId: `mega_${mega.id}`, title: `Мега: ${mega.title}`, desc: mega.desc(mega.target), kind: mega.kind,
      target: mega.target, reward: mega.reward * 2, xpReward: mega.xpReward * 2, day: today,
    })
  }
  return rows
}

// 64-F1 (H-3): посоздаёт строки квеста, пропуская уже существующие (P2002).
// Нюанс: createMany({ skipDuplicates }) Prisma 6 НЕ ПОДДЕРЖИВАЕТ на SQLite
// («Unknown argument skipDuplicates» — проверено на 6.19.2), поэтому защита от
// гонки построена на построчном create + уникальный ключ Quest(userId, day,
// questId): кто-то один создаёт недостающие строки, дубли отсекает СУБД.
// На Postgres поведение то же (P2002 там тоже летит).
async function createQuestRowsSafe(rows: QuestRow[]): Promise<number> {
  let created = 0
  for (const row of rows) {
    try {
      await db.quest.create({ data: row })
      created++
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
    }
  }
  return created
}

export async function ensureDailyQuests(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return
  const today = new Date().toISOString().slice(0, 10)
  if (user.questDay === today) {
    const have = await db.quest.count({ where: { userId, day: today } })
    if (have > 0) return
  }
  // 59-a: атомарный «захват» дня: движок и GET /api/career могут позвать
  // ensureDailyQuests одновременно; без гардра оба создавали полный набор квестов
  // (дубли), и каждый дубль можно было «получить награду» отдельно
  const claim = await db.user.updateMany({
    where: { id: userId, OR: [{ questDay: null }, { questDay: { not: today } }] },
    data: { questDay: today },
  })
  if (claim.count === 0) {
    // questDay уже сегодняшний: обычный выход. Но если квестов нет (сбой после
    // захвата дня) — пересоздаём, как раньше, иначе игрок останется без квестов
    const fresh = await db.user.findUnique({ where: { id: userId }, select: { questDay: true } })
    if (!fresh || fresh.questDay !== today) return
    const have = await db.quest.count({ where: { userId, day: today } })
    if (have > 0) return
    // 64-F1 (H-3): восстановительный путь идёт ПОСЛЕ проигранного захвата дня —
    // здесь с нами параллельно может идти победитель захвата со своим созданием.
    // Раньше оба пути создавали полные наборы → дубли с двойной наградой.
    // Основной путь (после успешного захвата дня) остался без изменений — там гонки нет.
    const created = await createQuestRowsSafe(pickQuestRows(userId, today))
    if (created === 0) return // всё уже создал параллельный запрос
    await notifyUser(
      userId, 'system', '🎯 Новые задания',
      'Заходите в приложение Задания — три новых поручения на день.',
    )
    return
  }
  const rows = pickQuestRows(userId, today)
  for (const row of rows) {
    await db.quest.create({ data: row })
  }
  // questDay уже выставлен «захватом» выше — здесь остаётся только уведомление
  await notifyUser(
    userId, 'system', '🎯 Новые задания',
    rows.length > 3
      ? 'Три новых поручения и мега-задание с двойной наградой — смотрите в приложении Задания.'
      : 'Заходите в приложение Задания — три новых поручения на день.',
  )
}
