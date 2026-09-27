// Планировщик «живых» ответов ботов: бот отвечает не мгновенно, а через
// человеческую паузу (прочитал → печатает → отправил). Механика:
//  1. chat-engine посчитал ответ (ИИ) и вызвал queueBotReply с задержкой;
//  2. ответ сериализуется в chat.meta.pendingReply (переживает перезапуск);
//  3. точный таймер в памяти доставляет вовремя, typing-события начинаются
//     за ~4.5 с до доставки (открытый чат видит «печатает…»);
//  4. pendingReplySweep() на каждом тике движка доставляет просроченное —
//     страховка, если инстанс перезапустился и таймеры потерялись.
// Доставка строго однократная: и таймер, и свип делают optimistic-claim
// (updateMany по точному старому meta) — побеждает один.
import { db } from '@/lib/db'
import { emitTo } from '@/lib/realtime-emit'

export interface PendingReply {
  /** ISO-время доставки. */
  at: string
  /** Кто отвечает (сообщение пишется от его имени после паузы). */
  senderId: string
  senderName: string
  text: string
  typoRate: number
  kind?: 'invoice'
  amount?: number
  invoiceId?: string
  offer?: number
  /** Системная строка, доставляется сразу после сообщения бота. */
  sysText?: string
  /** ISO-время сообщения игрока, на которое отвечает бот (для «дочитывания» двойных сообщений). */
  answerFrom?: string
  /** Прощание/закрытие торга — «дочитывать» последующие сообщения не нужно. */
  noFollowUp?: boolean
}

type DeliverFn = (chatId: string, pending: PendingReply) => Promise<void>

interface TimerEntry {
  delivery: NodeJS.Timeout
  typingStart?: NodeJS.Timeout
  typingLoop?: NodeJS.Timeout
}

const g = globalThis as typeof globalThis & { __avitoReplyTimers?: Map<string, TimerEntry> }
function timers(): Map<string, TimerEntry> {
  if (!g.__avitoReplyTimers) g.__avitoReplyTimers = new Map()
  return g.__avitoReplyTimers
}

function clearTimers(chatId: string): void {
  const t = timers().get(chatId)
  if (!t) return
  clearTimeout(t.delivery)
  if (t.typingStart) clearTimeout(t.typingStart)
  if (t.typingLoop) clearInterval(t.typingLoop)
  timers().delete(chatId)
}

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Поставить ответ бота в очередь с задержкой delayMs.
 * metaJson — точная текущая строка chat.meta (читает и обновляет вызыватель),
 * чтобы claim был атомарным: гонка двух параллельных расчётов проигравший выйдет.
 */
export async function queueBotReply(chatId: string, metaJson: string, pending: PendingReply, deliver: DeliverFn): Promise<void> {
  const withPending = JSON.stringify({ ...parseMeta(metaJson), pendingReply: pending })
  const claimed = await db.chat.updateMany({
    where: { id: chatId, meta: metaJson },
    data: { meta: withPending },
  })
  if (claimed.count !== 1) return // кто-то уже поставил ответ в эту паузу

  clearTimers(chatId)
  const delay = Math.max(200, new Date(pending.at).getTime() - Date.now())

  // «печатает…» — за 4.5 с до сообщения (длинные паузы: игрок видит, что бот
  // появился и отвечает, а не молчит до последнего)
  const entry: TimerEntry = { delivery: undefined as unknown as NodeJS.Timeout }
  const burst = () => void emitTo(`chat:${chatId}`, 'typing', { chatId, name: pending.senderName })
  const typingIn = delay - 4500
  if (typingIn > 400) {
    entry.typingStart = setTimeout(() => {
      entry.typingLoop = setInterval(burst, 1300)
      burst()
    }, typingIn)
  } else {
    entry.typingLoop = setInterval(burst, 1300)
    burst()
  }

  entry.delivery = setTimeout(() => {
    void deliverPending(chatId, deliver).catch(() => {})
  }, delay + 60)
  timers().set(chatId, entry)
}

/**
 * Доставить ответ, если он созрел. Однократность — через claim: убираем
 * pendingReply из meta атомарным updateMany по точному значению.
 */
export async function deliverPending(chatId: string, deliver: DeliverFn): Promise<void> {
  clearTimers(chatId)
  const chat = await db.chat.findUnique({ where: { id: chatId }, select: { meta: true } })
  if (!chat) return
  const parsed = parseMeta(chat.meta)
  const pending = parsed.pendingReply as PendingReply | undefined
  if (!pending || !pending.text) return
  const rest = { ...parsed }
  delete rest.pendingReply
  const claimed = await db.chat.updateMany({
    where: { id: chatId, meta: chat.meta },
    data: { meta: JSON.stringify(rest) },
  })
  if (claimed.count !== 1) return // свип/другой таймер уже доставил
  await deliver(chatId, pending)
}

/**
 * Свип движка (каждый тик, 15 с): доставляет ответы, чей таймер потерялся
 * (перезапуск инстанса). Дёшево: выборка только по чатам с pendingReply.
 */
export async function pendingReplySweep(deliver: DeliverFn): Promise<void> {
  const chats = await db.chat.findMany({
    where: { meta: { contains: '"pendingReply"' } },
    select: { id: true },
    take: 50,
  })
  if (!chats.length) return
  const now = Date.now()
  for (const c of chats) {
    try {
      const chat = await db.chat.findUnique({ where: { id: c.id }, select: { meta: true } })
      if (!chat) continue
      const pending = parseMeta(chat.meta).pendingReply as PendingReply | undefined
      if (!pending || !pending.text) continue
      if (new Date(pending.at).getTime() > now) continue
      await deliverPending(c.id, deliver)
    } catch (e) {
      console.error('[reply-scheduler] sweep error:', e)
    }
  }
}

/** Сколько ответов сейчас «в печати» (для отладки/мониторинга). */
export function pendingTimersCount(): number {
  return timers().size
}
