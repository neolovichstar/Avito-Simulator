// ИИ-переговорщик на OpenRouter. Каждый бот играет роль по своей личности,
// торгуется как живой человек и сам принимает решения.
import type { Persona } from '@/lib/personas-types'
import { stripEmoji, fmtMoney } from '@/lib/format'

export interface AiHistoryItem {
  senderType: string
  senderName: string
  text: string
  kind: string
  amount?: number | null
}

export interface NegotiationContext {
  persona: Persona
  botRole: 'buyer' | 'seller'
  listing: {
    title: string
    price: number
    baseValue: number
    condition: string
    conditionLabel: string
    categoryLabel: string
    description: string
  }
  botLimit: number // скрытая цена, хуже которой бот не пойдёт
  history: AiHistoryItem[]
  rounds: number
  playerMessage: string
  firstContact?: boolean
}

export type AiActionType = 'none' | 'accept' | 'invoice' | 'reject'

export interface AiReply {
  text: string
  action: AiActionType
  price: number | null
  newLimit: number
  source: 'ai' | 'rules'
}

const MODEL = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'
const MODEL_FALLBACK = process.env.OPENROUTER_MODEL_FALLBACK ?? 'mistralai/mistral-small-3.2-24b-instruct'

function withTypos(text: string, rate: number): string {
  if (rate <= 0 || Math.random() > 0.7) return text
  const words = text.split(' ')
  const idx = Math.floor(Math.random() * words.length)
  const w = words[idx]
  if (w.length > 4) {
    const i = 1 + Math.floor(Math.random() * (w.length - 2))
    const sw = w[i]
    const r = Math.random() > 0.5 ? w[i + 1] ?? sw : w[i - 1] ?? sw
    words[idx] = w.slice(0, i) + r + w.slice(i + 1)
  }
  return words.join(' ')
}

function buildSystemPrompt(ctx: NegotiationContext): string {
  const p = ctx.persona
  const isBuyer = ctx.botRole === 'buyer'
  const roleText = isBuyer
    ? `Ты ПОКУПАТЕЛЬ. Товар: "${ctx.listing.title}", состояние: ${ctx.listing.conditionLabel}, цена продавца: ${fmtMoney(ctx.listing.price)}.`
    : `Ты ПРОДАВЕЦ. Твой товар: "${ctx.listing.title}", состояние: ${ctx.listing.conditionLabel}, твоя цена: ${fmtMoney(ctx.listing.price)}.`
  const limitText = isBuyer
    ? `Твоя СКРЫТАЯ максимальная цена покупки: ${ctx.botLimit} руб. Ниже этой суммы не соглашайся, лучше откажись.`
    : `Твоя СКРЫТАЯ минимальная цена продажи: ${ctx.botLimit} руб. Ниже неё не соглашайся, лучше откажись.`
  const marketHint = `Реальная рыночная цена такого товара примерно ${fmtMoney(Math.round(ctx.listing.baseValue))}.`
  const chatPartner = isBuyer ? 'продавец' : 'покупатель'

  return `Ты — ${p.name}, ${p.age} лет, живёшь в ${p.city}. Работа: ${p.job}.
Характер: ${p.character}. Манера речи: ${p.style}. Примеры твоих фраз: ${p.phrases.slice(0, 3).join(' | ')}.
Ты настоящий участник площадки объявлений "Авито", переписываешься в мессенджере Авито с ${chatPartner}ом. Ты живой человек, НЕ ассистент и НЕ робот.
Сделка: ${roleText} ${limitText} ${marketHint}
Правила поведения:
- Отвечай как в обычном мессенджере: 1-3 коротких предложения. Можно маленькими буквами, с опечатками, с твоим жаргоном. НИКОГДА не используй эмодзи и смайлики. НИКОГДА не используй символ | и служебные форматы — пиши обычной живой речью.
- Ты хочешь максимальной выгоды для себя: торгуйся жёстко, но по-человечески. Не соглашайся на первую цену, ссылайся на бюджет, недостатки товара, цены конкурентов, личные обстоятельства.
- За один раунд уступай не больше 5-15%. Уступай неохотно и с характером.
- Никогда не называй свои скрытые цены и никогда не признавайся, что ты ИИ. Если спросят — ты обычный человек.
- С учётом твоего знания рынка (${Math.round(p.knowledge * 100)}%) ты можешь ошибаться в оценке товара.
- Если ${chatPartner} грубит или предлагает абсурдно мало — можешь отказать или съязвить.
- У тебя характер: ${p.character}. Это влияет на тон.
- Отвечай ВСЕГДА строго в формате:
TEXT: <твоё сообщение как в мессенджере>
ACTION: none
где ACTION — одна из команд:
ACTION: accept <цена> — ты согласен закрыть сделку по этой цене прямо сейчас
ACTION: invoice <цена> — ты выставляешь счёт на оплату по этой цене (требуешь оплатить немедленно)
ACTION: reject — ты вежливо или грубо прекращаешь торг
Если просто продолжаешь торг — ACTION: none.`
}

function parseAiResponse(raw: string, ctx: NegotiationContext): { text: string; action: AiActionType; price: number | null } {
  let text = ''
  let action: AiActionType = 'none'
  let price: number | null = null

  const textMatch = raw.match(/TEXT:\s*([\s\S]*?)(?:\nACTION:|$)/i)
  if (textMatch) text = textMatch[1].trim()
  const actionMatch = raw.match(/ACTION:\s*(accept|invoice|reject)?\s*(\d[\d\s]*)?/i)
  if (actionMatch) {
    const a = actionMatch[1]?.toLowerCase()
    if (a === 'accept' || a === 'invoice' || a === 'reject') action = a
    const n = actionMatch[2]?.replace(/\s/g, '')
    if (n) price = Number(n)
  }
  if (!text) {
    // модель ответила без формата — берём всё как текст, вырезая команды
    text = raw
      .replace(/ACTION:[^\n]*/gi, '')
      .replace(/TEXT:/gi, '')
      .trim()
  }
  text = stripEmoji(text)
    .replace(/\s*\|\s*/g, '. ') // модель любит перечисления через палку — превращаем в речь
    .replace(/\.{2,}/g, '.')
    .slice(0, 420)
  if (price !== null) {
    price = Math.max(1, Math.round(price))
    // защита от бредовых цен: ограничиваем разумным коридором
    const max = ctx.listing.price * 2.5
    const min = Math.round(ctx.listing.baseValue * 0.05)
    if (price > max || price < min) price = null
  }
  return { text, action, price }
}

async function callOpenRouter(system: string, userContent: string, maxTokens = 180): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return null
  const attempt = async (model: string): Promise<string | null> => {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 22_000)
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'http-referer': 'https://avito-sim.local',
          'x-title': 'Avito Resale Simulator',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.95,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      })
      if (!res.ok) return null
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return data.choices?.[0]?.message?.content ?? null
    } catch {
      return null
    } finally {
      clearTimeout(t)
    }
  }
  // основная модель, затем запасная
  return (await attempt(MODEL)) ?? (await attempt(MODEL_FALLBACK))
}

// Fallback: правила, если OpenRouter недоступен — боты всё равно живут
function ruleReply(ctx: NegotiationContext): { text: string; action: AiActionType; price: number; newLimit: number } {
  const p = ctx.persona
  const isBuyer = ctx.botRole === 'buyer'
  const msg = ctx.playerMessage.toLowerCase()
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

  // покупатель согласен на цену бота / продавец согласен
  const askedPrice = extractPrice(ctx.playerMessage)
  let offer = isBuyer
    ? Math.max(ctx.botLimit, Math.round(ctx.listing.price * (1 - 0.1 - Math.random() * 0.1)))
    : Math.min(ctx.botLimit, Math.round(ctx.listing.price * (1 + 0.05 + Math.random() * 0.08)))

  if (askedPrice) {
    const acceptable = isBuyer ? askedPrice <= ctx.botLimit : askedPrice >= ctx.botLimit
    if (acceptable) {
      return {
        text: withTypos(
          isBuyer
            ? `${pick(['ладно, по рукам', 'идёт, беру', 'ок, давай оформим'])} ${fmtMoney(askedPrice)}, готов оплатить`
            : `${pick(['ладно', 'хорошо', 'по рукам'])}, ${fmtMoney(askedPrice)}. Выставляю счёт`,
          p.typoRate,
        ),
        action: isBuyer ? 'accept' : 'invoice',
        price: askedPrice,
        newLimit: askedPrice,
      }
    }
    const counter = isBuyer ? Math.min(ctx.botLimit, Math.round(askedPrice * 0.92)) : Math.max(ctx.botLimit, Math.round(askedPrice * 1.08))
    return {
      text: withTypos(
        isBuyer
          ? `${pick(['дорого', 'многовато', 'не-не, это перебор'])}, дам ${fmtMoney(counter)}, последнее предложение`
          : `${pick(['неа, дешево', 'за такие деньги не отдам', 'меньше не могу'])} — ${fmtMoney(counter)} и забирай`,
        p.typoRate,
      ),
      action: 'none',
      price: counter,
      newLimit: ctx.botLimit,
    }
  }

  if (msg.includes('согласен') || msg.includes('по рукам') || msg.includes('беру') || msg.includes('давай')) {
    const price = isBuyer ? Math.min(offer, ctx.botLimit) : Math.max(offer, ctx.botLimit)
    return {
      text: withTypos('отлично, оформляем', p.typoRate),
      action: isBuyer ? 'accept' : 'invoice',
      price,
      newLimit: price,
    }
  }

  const starters = isBuyer
    ? [
        `здравствуйте, интересует ${ctx.listing.title.toLowerCase()}. даю ${fmtMoney(offer)}, самовывоз`,
        `добрый день. торгуемся? готов ${fmtMoney(offer)} сегодня`,
        `привет. заберу за ${fmtMoney(offer)}, если состояние как на фото`,
      ]
    : [
        `здравствуйте, товар в отличном состоянии, цена ${fmtMoney(ctx.listing.price)}`,
        `добрый день, да, продаю. ${fmtMoney(ctx.listing.price)} и он ваш`,
        `привет, да ещё актуально. торг минимальный`,
      ]

  return {
    text: withTypos(pick(starters), p.typoRate),
    action: 'none',
    price: offer,
    newLimit: ctx.botLimit,
  }
}

function extractPrice(s: string): number | null {
  const m = s.match(/(\d[\d\s]{2,10})\s*(руб|₽|р\b|тыс|k)?/i)
  if (!m) return null
  let n = Number(m[1].replace(/\s/g, ''))
  if (!n) return null
  if (m[2]?.toLowerCase() === 'тыс' || m[2]?.toLowerCase() === 'k') n *= 1000
  return Math.round(n)
}

export async function aiNegotiate(ctx: NegotiationContext): Promise<AiReply> {
  const fallback = () => {
    const r = ruleReply(ctx)
    return { ...r, source: 'rules' as const }
  }

  const system = buildSystemPrompt(ctx)
  const historyLines = ctx.history
    .slice(-10)
    .map((h) => {
      const who = h.senderType === 'bot' ? 'Я' : h.senderType === 'system' ? 'СИСТЕМА' : 'Собеседник'
      const extra = h.kind === 'invoice' && h.amount ? ` (счёт на ${fmtMoney(h.amount)})` : ''
      return `${who}${h.senderType === 'bot' ? '' : ` (${h.senderName})`}: ${h.text}${extra}`
    })
    .join('\n')
  const userContent = `История переписки:\n${historyLines || '(пусто)'}\n\nНовое сообщение собеседника: ${ctx.playerMessage || '(первый контакт, напиши приветствие и предложи свою цену)'}\n\nТвой ответ (формат TEXT/ACTION):`

  let raw = await callOpenRouter(system, userContent)
  if (!raw) {
    // один ретрай — OpenRouter иногда моргает
    await new Promise((r) => setTimeout(r, 1200))
    raw = await callOpenRouter(system, userContent)
  }
  if (!raw) return fallback()
  const parsed = parseAiResponse(raw, ctx)
  if (!parsed.text) return fallback()

  let action = parsed.action
  let price = parsed.price
  let newLimit = ctx.botLimit

  if ((action === 'accept' || action === 'invoice') && price !== null) {
    const ok = ctx.botRole === 'buyer' ? price <= ctx.botLimit : price >= ctx.botLimit
    if (!ok) {
      // модель вышла за лимит — трактуем как предложение цены
      action = 'none'
      newLimit = ctx.botRole === 'buyer' ? Math.max(newLimit, price) : Math.min(newLimit, price)
    } else {
      newLimit = price
    }
  } else if (price !== null) {
    // простое предложение — запоминаем как новую границу интереса
    newLimit = ctx.botRole === 'buyer' ? Math.min(ctx.botLimit, Math.max(price, Math.round(ctx.botLimit * 0.9))) : Math.max(ctx.botLimit, Math.min(price, Math.round(ctx.botLimit * 1.1)))
  }

  return { text: parsed.text, action, price, newLimit, source: 'ai' }
}
