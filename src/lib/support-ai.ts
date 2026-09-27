// ИИ-оператор поддержки Resale: OpenRouter (deepseek) + авто-БЗ из кода.
// Свой дневной бюджет, скриптовый фолбэк, пауза когда админ отвечает сам.
import { callOpenRouter } from './ai'
import { supportSystemPrompt, supportFallbackReply } from './support-kb'
import { redisEnabled } from './redis'

export const AI_SUPPORT_DAILY_LIMIT = Number(process.env.AI_SUPPORT_DAILY_LIMIT ?? 80)

interface BudgetState { date: string; used: number }
const g = globalThis as unknown as { __resaleSupportBudget?: BudgetState }
const memBudget: BudgetState = (g.__resaleSupportBudget ??= { date: '', used: 0 })

function todayKey(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

async function supportBudgetSpend(): Promise<boolean> {
  const key = `ai:support:${todayKey()}`
  if (redisEnabled) {
    const { redisLimit } = await import('./redis')
    return redisLimit(key, AI_SUPPORT_DAILY_LIMIT, 26 * 60 * 60_000)
  }
  const today = todayKey()
  if (memBudget.date !== today) {
    memBudget.date = today
    memBudget.used = 0
  }
  if (memBudget.used >= AI_SUPPORT_DAILY_LIMIT) return false
  memBudget.used++
  return true
}

export interface SupportTurn {
  role: 'user' | 'support'
  text: string
}

/** Убрать длинные тире и почистить текст ответа (страховка на стороне парсинга). */
function sanitize(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 600)
}

/**
 * Ответ поддержки. Сначала пробуем ИИ, при отсутствии бюджета/сети — скриптовый фолбэк.
 * adminActive: true, если админ недавно отвечал сам (ИИ не пишем, админ ведёт чат).
 */
export async function supportAiReply(
  userText: string,
  history: SupportTurn[],
  adminActive: boolean,
): Promise<{ text: string; source: 'ai' | 'rules' }> {
  if (adminActive) return { text: '', source: 'rules' } // ИИ молчит: чат у админа

  if (!(await supportBudgetSpend())) {
    return { text: supportFallbackReply(userText), source: 'rules' }
  }

  const system = supportSystemPrompt()
  const historyLines = history
    .slice(-12)
    .map((h) => `${h.role === 'user' ? 'Игрок' : 'Поддержка'}: ${h.text}`)
    .join('\n')
  const userContent = `История чата:\n${historyLines || '(пусто)'}\n\nНовое сообщение игрока: ${userText}\n\nТвой ответ как поддержка (просто текст, без префиксов):`

  let raw = await callOpenRouter(system, userContent, 220)
  if (!raw) {
    await new Promise((r) => setTimeout(r, 1200))
    raw = await callOpenRouter(system, userContent, 220)
  }
  if (!raw) return { text: supportFallbackReply(userText), source: 'rules' }
  const text = sanitize(raw)
  if (!text) return { text: supportFallbackReply(userText), source: 'rules' }
  return { text, source: 'ai' }
}

/** Пауза ИИ: админ отвечал последним в течение 20 минут. */
export const SUPPORT_ADMIN_ACTIVE_MS = 20 * 60_000
