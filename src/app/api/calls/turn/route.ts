// POST /api/calls/turn — один ход голосового разговора с продавцом-ботом.
//
// Поток: audio (base64 webm/opus с MediaRecorder) → ASR (z-ai) → текст,
// затем LLM (z-ai chat, личность из personas-data) → реплика продавца,
// затем TTS (z-ai) → mp3 base64 для проигрывания в звонке.
// Клиент может прислать text вместо audio (текстовый режим — микрофон
// недоступен в песочнице), TTS всё равно озвучит ответ.
//
// SDK z-ai-web-dev-sdk используется ТОЛЬКО здесь (backend route handler).
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { PERSONAS } from '@/lib/personas-data'
import type { Persona } from '@/lib/personas-types'
import { fmtMoney, stripEmoji } from '@/lib/format'
import ZAI from 'z-ai-web-dev-sdk'

export const dynamic = 'force-dynamic'

const MAX_AUDIO_B64 = 2_400_000 // ~1.8 МБ сырого аудио — на 45с opus хватает с запасом
const MAX_REPLY_LEN = 320 // 1-3 предложения для телефона

interface TurnBody {
  callId?: string
  personaId?: string
  peerUserId?: string
  listingTitle?: string
  listingPrice?: number
  history?: { role?: string; text?: string }[]
  audio?: string
  text?: string
}

interface HistoryItem { role: 'user' | 'assistant'; text: string }

// ── SDK синглтон (переживает HMR через globalThis) ──────────────────────────
const gZ = globalThis as unknown as { __callsTurnZai?: Promise<ZAI> | null }

async function getZai(): Promise<ZAI> {
  if (!gZ.__callsTurnZai) {
    gZ.__callsTurnZai = ZAI.create().catch((e) => {
      gZ.__callsTurnZai = null
      throw e
    })
  }
  return gZ.__callsTurnZai
}

/** Гонка с таймером: SDK не умеет AbortSignal — просто перестаём ждать. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))) },
    )
  })
}

// ── Личность собеседника ────────────────────────────────────────────────────

function personaById(id: string | null | undefined): Persona | null {
  if (!id) return null
  return PERSONAS.find((p) => p.id === id) ?? null
}

async function resolvePersona(peerUserId: string | null, personaId: string | null): Promise<Persona> {
  const direct = personaById(personaId)
  if (direct) return direct
  if (peerUserId) {
    try {
      const bot = await db.user.findUnique({ where: { id: peerUserId }, select: { personaId: true } })
      const viaBot = personaById(bot?.personaId)
      if (viaBot) return viaBot
    } catch {
      /* ниже дефолт */
    }
  }
  return PERSONAS[0]
}

/** Детерминированный голос TTS: один продавец — один голос всегда. */
function pickVoice(personaId: string): string {
  const voices = ['tongtong', 'xiaochen', 'douji', 'kazi', 'tongtong', 'chuichui']
  let h = 0
  for (let i = 0; i < personaId.length; i++) h = (h * 31 + personaId.charCodeAt(i)) >>> 0
  return voices[h % voices.length]
}

// ── Промпт продавца (реюз стиля src/lib/ai.ts, но для телефонного звонка) ──

function buildSystemPrompt(p: Persona, listingTitle: string, price: number | null): string {
  const floor = price ? Math.round(price * (0.86 + p.greed * 0.12)) : null
  const listingLine = price
    ? `Твой товар: «${listingTitle}», твоя цена ${fmtMoney(price)}.`
    : `Твой товар: «${listingTitle}».`
  const limitLine = floor
    ? `Твоя СКРЫТАЯ минимальная цена продажи: ${floor} руб. Ниже неё не соглашайся, лучше вежливо откажись.`
    : ''
  return `Ты — ${p.name}, ${p.age} лет, живёшь в ${p.city}. Работа: ${p.job}.
Характер: ${p.character}. Манера речи: ${p.style}. Примеры твоих фраз: ${p.phrases.slice(0, 3).join(' | ')}.
Ты ПРОДАВЕЦ на площадке объявлений «Resale» (как Авито). Тебе позвонил покупатель по объявлению. ${listingLine} ${limitLine}
Это НАСТОЯЩИЙ ТЕЛЕФОННЫЙ ЗВОНОК: отвечай коротко, 1-3 предложения, живым разговорным русским — так, как реально говорят по телефону. Пауз нет, только речь.
Правила:
- НИКОГДА не используй эмодзи, списки, markdown и служебные форматы — только обычная устная речь.
- Ты живой человек, НЕ ассистент и НЕ робот. Если спросят — ты обычный продавец с Авито.
- Торгуйся жёстко, но по-человечески: ссылайся на состояние товара, рынок, других покупателей. Уступай неохотно, не больше 5-15% за раз.
- Если покупатель предлагает подходящую цену — соглашайся и договаривайтесь о встрече/оформлении.
- Если покупатель грубит или зовёт куда-то подозрительное — съязви или откажись.
- Отвечай только репликой продавца, без кавычек и пояснений.`
}

// ── Fallback-правила, если LLM недоступен (как в ai.ts ruleReply) ───────────

function extractPrice(s: string): number | null {
  const m = s.match(/(\d[\d\s]{2,10})\s*(руб|₽|р\b|тыс|k)?/i)
  if (!m) return null
  let n = Number(m[1].replace(/\s/g, ''))
  if (!n) return null
  if (m[2]?.toLowerCase() === 'тыс' || m[2]?.toLowerCase() === 'k') n *= 1000
  return Math.round(n)
}

function ruleReply(opts: {
  first: boolean
  text: string
  persona: Persona
  listingTitle: string
  price: number | null
  floor: number | null
}): string {
  const { persona: p, price, floor } = opts
  const t = opts.text.toLowerCase()
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
  const title = opts.listingTitle.toLowerCase().slice(0, 40)

  if (opts.first) {
    return pick([
      'алло, слушаю вас',
      `алло, да, по ${title} звоните? слушаю`,
      'алло, здравствуйте, что по товару?',
    ])
  }
  if (/(согласен|давай|беру|по рукам|оформляй|договорились)/.test(t) && price) {
    return `${pick(['ладно', 'хорошо', 'по рукам'])}, ${fmtMoney(price)}. Давайте оформляем, когда подъедете?`
  }
  const asked = extractPrice(opts.text)
  if (asked && floor) {
    if (asked >= floor) return `${fmtMoney(asked)}? ладно, уговорил, отдаю. Когда заберёте?`
    return `${pick(['дорого', 'маловато будет', 'не-не, за такое не отдам'])}. Меньше ${fmtMoney(floor)} не отдам, товар в хорошем состоянии.`
  }
  if (/дорого|дорога|скидк|дешевле|подешевле/.test(t) && floor) {
    return pick([
      `дорого? да по рынку же. ладно, могу уступить чуть-чуть, но меньше ${fmtMoney(floor)} никак`,
      'смотрите, состояние отличное, торг копеечный. сколько готовы дать?',
    ])
  }
  if (/состояни|царапин|сколов|работает|битый|комплект|гаранти/.test(t)) {
    return 'всё работает как надо, по мелочи только. приезжайте, покажу, при вас проверим.'
  }
  if (/привет|алло|здравству|добрый день|добрый вечер/.test(t)) {
    return pick([
      `здравствуйте, да, слушаю. по ${title} интересуетесь?`,
      'привет-привет, да, говорите',
    ])
  }
  if (/когда|где встрет|самовывоз|доставк|адрес/.test(t)) {
    return pick([
      'могу сегодня вечером, метро рядом, самовывоз. адрес скажу прямо перед встречей',
      'давайте завтра днём, на нейтральной территории. удобно?',
    ])
  }
  return pick(p.phrases).replace(/\|/g, '.')
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  if (!rateLimit(`calls-turn:${user.id}`, 24, 60_000)) {
    return Response.json({ error: 'Слишком часто — собеседник не успевает' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as TurnBody
  const audio = typeof body.audio === 'string' && body.audio.length > 0 ? body.audio : null
  const typed = typeof body.text === 'string' ? body.text.trim().slice(0, 400) : ''
  if (audio && audio.length > MAX_AUDIO_B64) {
    return Response.json({ error: 'Слишком длинная запись' }, { status: 400 })
  }

  const persona = await resolvePersona(body.peerUserId ?? null, body.personaId ?? null)
  const listingTitle = (typeof body.listingTitle === 'string' ? body.listingTitle : '').trim().slice(0, 120)
  const listingPrice =
    typeof body.listingPrice === 'number' && Number.isFinite(body.listingPrice) && body.listingPrice > 0
      ? Math.round(body.listingPrice)
      : null
  const price = listingPrice ?? 0
  const floor = price ? Math.round(price * (0.86 + persona.greed * 0.12)) : null

  const history: HistoryItem[] = (Array.isArray(body.history) ? body.history : [])
    .slice(-12)
    .map((h) => ({
      role: h?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      text: String(h?.text ?? '').slice(0, 400).trim(),
    }))
    .filter((h) => h.text.length > 0)

  // Пустой ход допустим только в начале разговора — продавец здоровается первым.
  if (!audio && !typed && history.length > 0) {
    return Response.json({ error: 'Нет реплики' }, { status: 400 })
  }

  // 1) ASR: webm/opus → текст
  let userText = typed
  if (audio) {
    try {
      const zai = await getZai()
      const asr = (await withTimeout(
        zai.audio.asr.create({ file_base64: audio }),
        30_000,
        'asr',
      )) as { text?: string } | null
      userText = String(asr?.text ?? '').replace(/\s+/g, ' ').trim()
    } catch (e) {
      console.error('[calls/turn] ASR failed:', e instanceof Error ? e.message : e)
      return Response.json({ error: 'Плохо слышно — повторите ещё раз' }, { status: 502 })
    }
    if (!userText) {
      // пустой ASR — не ошибка сервиса: бот переспросит, как живой человек
      userText = ''
    }
  }

  const first = history.length === 0 && !userText

  // 2) LLM: реплика продавца
  let replyText = ''
  let source: 'ai' | 'rules' = 'rules'
  try {
    const zai = await getZai()
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: buildSystemPrompt(persona, listingTitle || 'товар с объявления', price) },
      ...history.map((h) => ({ role: h.role, content: h.text })),
    ]
    messages.push({
      role: 'user',
      content: first
        ? '(звонок соединился, собеседник пока молчит) Ответь первым: поздоровайся по-телефонному и спроси, по какому вопросу звонят.'
        : userText || '(собеседник что-то пробормотал, не расслышал) Попроси повторить.',
    })
    const completion = (await withTimeout(
      zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
        temperature: 0.9,
        max_tokens: 160,
      }),
      25_000,
      'llm',
    )) as { choices?: { message?: { content?: string } }[] } | null
    const raw = completion?.choices?.[0]?.message?.content ?? ''
    replyText = stripEmoji(raw)
      .replace(/\s*\|\s*/g, '. ')
      .replace(/[*#_`>]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, MAX_REPLY_LEN)
    if (replyText) source = 'ai'
  } catch (e) {
    console.error('[calls/turn] LLM failed:', e instanceof Error ? e.message : e)
  }
  if (!replyText) {
    replyText = ruleReply({ first, text: userText, persona, listingTitle: listingTitle || 'товар', price, floor })
  }

  // 3) TTS: озвучиваем ответ (формат wav — единственный стабильно принимаемый
  //    сервисом без стриминга; pcm/mp3 у этой инсталляции отклоняется)
  let audioBase64: string | null = null
  let mimeType: string | null = null
  try {
    const zai = await getZai()
    const resp = (await withTimeout(
      zai.audio.tts.create({
        input: replyText.slice(0, 1000),
        voice: pickVoice(persona.id + persona.name),
        speed: 1.0,
        response_format: 'wav',
        stream: false,
      }),
      30_000,
      'tts',
    )) as Response
    const ab = await resp.arrayBuffer()
    if (ab.byteLength > 800) {
      audioBase64 = Buffer.from(new Uint8Array(ab)).toString('base64')
      mimeType = 'audio/wav'
    }
  } catch (e) {
    console.error('[calls/turn] TTS failed:', e instanceof Error ? e.message : e)
  }

  return Response.json({ userText, replyText, audioBase64, mimeType, source })
}
