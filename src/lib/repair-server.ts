// Серверная логика мастерской (Task 28-c): стоимость работы, сложность,
// сборка данных для вкладки «Мастерская». Используется роутами api/repair/*.
import { db } from '@/lib/db'
import { repairCost } from '@/lib/economy'
import { CONDITION_MULT } from '@/lib/catalog-types'
import { CATALOG } from '@/lib/catalog-data'
import { itemImage } from '@/lib/item-images'
import {
  canFit, gameForItem, gameForJob, partById, toolForGame, shiftDifficulty, diagnose,
  TOOLS, type Difficulty, type GameKey, type Part,
} from '@/lib/parts'
import type { WorkshopItemDTO, ToolDTO, StockDTO, ActiveJobDTO, InventoryItemDTO, FaultDTO } from '@/lib/types'

export const WARRANTY_MS = 2 * 60 * 60 * 1000 // гарантия на работу: 2 часа

// Скидка мастера на работу: −2% за уровень, максимум −30%
export function workDiscount(level: number): number {
  return Math.min(0.3, Math.max(0, level - 1) * 0.02)
}

export interface WorkOpts {
  kind: 'repair' | 'install'
  diagnosed: boolean
  level: number
  withPart: boolean
}

// Стоимость работы (уплачивается при старте)
export function workCost(baseValue: number, opts: WorkOpts): number {
  let c = repairCost(baseValue)
  if (opts.kind === 'install') c = Math.round(c * 0.5)
  if (opts.kind === 'repair' && !opts.diagnosed) c = Math.round(c * 1.35) // вслепую
  else if (opts.diagnosed) c = Math.round(c * 0.85)
  if (opts.withPart) c = Math.round(c * 0.9)
  c = Math.round(c * (1 - workDiscount(opts.level)))
  return Math.max(150, c)
}

export function difficultyFor(opts: { diagnosed: boolean; hasTool: boolean; level: number; withPart: boolean }): Difficulty {
  let d: Difficulty = 'normal'
  if (!opts.diagnosed) d = shiftDifficulty(d, 1)
  if (!opts.hasTool) d = shiftDifficulty(d, 1)
  if (opts.level >= 6) d = shiftDifficulty(d, -1)
  if (opts.withPart) d = shiftDifficulty(d, -1)
  return d
}

// База каталога для потолка прокачки цены (+50% от исходной базы)
const CATALOG_BASE = new Map(CATALOG.map((c) => [c.key, c.basePrice]))
export function baseValueCap(itemKey: string): number {
  const base = CATALOG_BASE.get(itemKey)
  return base ? Math.round(base * 1.5) : 1_000_000
}

export function estValueOf(baseValue: number, condition: string): number {
  return Math.round(baseValue * (CONDITION_MULT[condition] ?? 0.8))
}

export function itemDto(i: {
  id: string; itemKey: string; title: string; category: string; condition: string
  baseValue: number; purchasePrice: number; createdAt: Date
}): InventoryItemDTO {
  return {
    id: i.id, itemKey: i.itemKey, title: i.title, category: i.category, condition: i.condition,
    image: itemImage(i.itemKey, i.category), baseValue: i.baseValue, purchasePrice: i.purchasePrice,
    estValue: estValueOf(i.baseValue, i.condition), createdAt: i.createdAt.toISOString(), listed: false,
  }
}

// Свежая диагностика вещи: последний завершённый diagnose-наряд
async function latestFaults(itemId: string): Promise<FaultDTO[] | null> {
  const job = await db.repairJob.findFirst({
    where: { itemId, kind: 'diagnose', status: 'done' },
    orderBy: { startedAt: 'desc' },
  })
  if (!job) return null
  try {
    const raw = JSON.parse(job.faults) as FaultDTO[]
    return Array.isArray(raw) && raw.length ? raw : null
  } catch {
    return null
  }
}

// Гарантия: последний НЕудачный ремонт с живой гарантией
async function activeWarranty(itemId: string): Promise<Date | null> {
  const job = await db.repairJob.findFirst({
    where: { itemId, kind: 'repair', status: 'done', score: { lt: 60 }, warrantyUntil: { gt: new Date() } },
    orderBy: { finishedAt: 'desc' },
  })
  return job?.warrantyUntil ?? null
}

// Активный (незавершённый) наряд
async function activeJob(userId: string, itemId: string): Promise<ActiveJobDTO | null> {
  const job = await db.repairJob.findFirst({
    where: { userId, itemId, kind: { in: ['repair', 'install'] }, status: 'in_progress' },
    orderBy: { startedAt: 'desc' },
  })
  if (!job) return null
  // инструмент мог сломаться после старта — проверяем живое состояние
  const tool = job.game ? toolForGame(job.game as GameKey) : undefined
  let hasTool = false
  if (tool) {
    const row = await db.workshopTool.findUnique({
      where: { userId_toolKey: { userId, toolKey: tool.key } },
    })
    hasTool = (row?.durability ?? 0) > 0
  }
  return {
    id: job.id, kind: job.kind as 'repair' | 'install', game: job.game ?? 'gauge',
    difficulty: (job.difficulty as Difficulty) ?? 'normal', partKey: job.partKey, cost: job.cost,
    hasTool,
  }
}

// Сборка одной вещи для мастерской
export async function workshopItemDto(
  userId: string,
  i: { id: string; itemKey: string; title: string; category: string; condition: string; baseValue: number; purchasePrice: number; createdAt: Date },
  stockMap: Map<string, { qty: number; wearAvg: number }>,
): Promise<WorkshopItemDTO> {
  const faults = await latestFaults(i.id)
  const suggested = faults?.find((f) => f.partKey)?.partKey ?? null
  const warranty = await activeWarranty(i.id)
  const job = await activeJob(userId, i.id)
  const installed = await db.installedPart.findMany({
    where: { userId, itemId: i.id },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })
  return {
    ...itemDto(i),
    faults,
    suggestedPartKey: suggested,
    hasPartInStock: suggested ? (stockMap.get(suggested)?.qty ?? 0) > 0 : false,
    warrantyUntil: warranty ? warranty.toISOString() : null,
    game: gameForItem(i),
    activeJob: job,
    installedParts: installed.map((p) => ({ partKey: p.partKey, title: p.title, wear: p.wear })),
  }
}

export async function stockMapFor(userId: string): Promise<Map<string, { qty: number; wearAvg: number }>> {
  const rows = await db.partStock.findMany({ where: { userId, qty: { gt: 0 } } })
  return new Map(rows.map((r) => [r.partKey, { qty: r.qty, wearAvg: r.qty ? Math.round(r.wearSum / r.qty) : 0 }]))
}

export async function toolsDto(userId: string): Promise<ToolDTO[]> {
  const rows = await db.workshopTool.findMany({ where: { userId } })
  const map = new Map(rows.map((r) => [r.toolKey, r.durability]))
  return TOOLS.map((t) => ({
    key: t.key, title: t.title, price: t.price, uses: t.uses,
    durability: map.get(t.key) ?? 0, game: t.game, hint: t.hint,
  }))
}

export function stockDto(map: Map<string, { qty: number; wearAvg: number }>): StockDTO[] {
  return [...map.entries()]
    .filter(([, v]) => v.qty > 0)
    .map(([partKey, v]) => ({ partKey, qty: v.qty, wearAvg: v.wearAvg }))
}

// Валидация установки/ремонта с запчастью: совместимость + наличие на складе
export function validatePart(
  partKey: string | undefined,
  item: { itemKey: string; category: string; id: string },
  installedPartKeys: string[],
  stock: Map<string, { qty: number }>,
): { part: Part } | { error: string } {
  if (!partKey) return { error: 'Выберите запчасть' }
  const part = partById(partKey)
  if (!part) return { error: 'Запчасть не найдена в каталоге' }
  const fit = canFit(part, item, { installedPartKeys })
  if (!fit.ok) return { error: fit.reason ?? 'Запчасть не подходит' }
  if ((stock.get(partKey)?.qty ?? 0) <= 0) return { error: 'Нет на складе — купите во вкладке «Запчасти»' }
  return { part }
}

// Игра для наряда + проверка инструмента
export async function gameAndTool(
  userId: string,
  item: { itemKey: string; category: string },
  partKey: string | null,
): Promise<{ game: GameKey; hasTool: boolean; toolKey: string | null }> {
  const part = partKey ? partById(partKey) : null
  const game = gameForJob(item, part)
  const tool = toolForGame(game)
  let hasTool = false
  if (tool) {
    const row = await db.workshopTool.findUnique({
      where: { userId_toolKey: { userId, toolKey: tool.key } },
    })
    hasTool = (row?.durability ?? 0) > 0
  }
  return { game, hasTool, toolKey: tool?.key ?? null }
}

export { diagnose }
