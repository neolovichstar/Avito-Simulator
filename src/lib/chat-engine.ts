// Переговорный движок чатов: бот отвечает на сообщения игрока через ИИ
import { db } from '@/lib/db'
import { emitTo } from '@/lib/realtime-emit'
import { aiNegotiate, type AiHistoryItem } from '@/lib/ai'
import { PERSONAS } from '@/lib/personas-data'
import { CATEGORY_LABEL, CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import { fmtMoney, stripEmoji } from '@/lib/format'
import { completeSale } from '@/lib/deals'
import { bumpStats, bumpQuests } from '@/lib/deals'
import { isBlocked } from '@/lib/blocked'
import type { Chat, Listing, User } from '@prisma/client'

export interface ChatMeta {
  botRole: 'buyer' | 'seller'
  botLimit: number
  rounds: number
  closed?: boolean
  lastOffer?: number
  patience?: number // сколько раундов бот выдерживает до финальной уступки
  finalDone?: boolean // финальная уступка уже была
}

export function parseChatMeta(raw: string | null | undefined): ChatMeta {
  try {
    const m = JSON.parse(raw || '{}') as Partial<ChatMeta>
    return {
      botRole: m.botRole ?? 'buyer',
      botLimit: m.botLimit ?? 0,
      rounds: m.rounds ?? 0,
      closed: m.closed,
      lastOffer: m.lastOffer,
      patience: m.patience,
      finalDone: m.finalDone,
    }
  } catch {
    return { botRole: 'buyer', botLimit: 0, rounds: 0 }
  }
}

export function personaOf(user: User) {
  return PERSONAS.find((p) => p.id === user.personaId) ?? PERSONAS[0]
}

// Первое сообщение бота (дешёвый вариант без LLM — из личности)
export function botOpener(chat: Chat, listing: Listing, bot: User): { text: string; offer: number; limit: number } {
  const p = personaOf(bot)
  const meta = parseChatMeta(chat.meta)
  const mult = CONDITION_MULT[listing.condition] ?? 0.8
  const est = Math.round(listing.baseValue * mult)
  const isBuyer = meta.botRole === 'buyer'

  if (isBuyer) {
    const discount = 0.08 + p.greed * 0.18 + Math.random() * 0.1
    const offer = Math.max(Math.round(est * 0.4), Math.round(listing.price * (1 - discount)))
    const greet = p.greetings[Math.floor(Math.random() * p.greetings.length)]
    return { text: `${greet} ${listing.title}? Готов забрать за ${fmtMoney(offer)}, самовывоз сегодня`, offer, limit: meta.botLimit || offer }
  }
  const greet = p.greetings[Math.floor(Math.random() * p.greetings.length)]
  return { text: greet, offer: listing.price, limit: meta.botLimit || Math.round(listing.price * 0.9) }
}

const AGREE_PHRASES = ['по рукам', 'окей', 'идёт', 'ладно', 'договорились']
function pickAgree(): string {
  return AGREE_PHRASES[Math.floor(Math.random() * AGREE_PHRASES.length)]
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function historyOf(chatId: string, viewerBotId: string): Promise<AiHistoryItem[]> {
  const msgs = await db.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return msgs.reverse().map((m) => ({
    senderType: m.senderId === viewerBotId ? 'bot' : m.senderType === 'system' ? 'system' : 'player',
    senderName: m.senderName,
    text: m.text,
    kind: m.kind,
    amount: m.amount,
  }))
}

// Основной ответ бота на сообщение/счёт игрока.
// Обёртка: пока бот «думает», событие typing повторяется каждые 2.5с —
// индикатор поймают и открытый чат, и список чатов, даже подписавшись посреди размышления
export async function botReply(chatId: string, playerMsg: { text?: string; invoice?: number }): Promise<void> {
  let typingName: string | null = null
  let finished = false
  const loop = (async () => {
    while (typingName === null && !finished) await new Promise((r) => setTimeout(r, 120))
    while (typingName !== null && typingName !== '' && !finished) {
      await emitTo(`chat:${chatId}`, 'typing', { chatId, name: typingName })
      // короткий интервал: закрывает брешь, пока слушатели (список чатов) ещё подписываются
      await new Promise((r) => setTimeout(r, 1_200))
    }
  })().catch(() => {})
  try {
    await botReplyCore(chatId, playerMsg, (n) => { typingName = n })
  } finally {
    finished = true
    await loop
  }
}

async function botReplyCore(chatId: string, playerMsg: { text?: string; invoice?: number }, setTypingName: (n: string) => void): Promise<void> {
  const chat = await db.chat.findUnique({ where: { id: chatId } })
  if (!chat) return
  const listing = await db.listing.findUnique({ where: { id: chat.listingId } })
  if (!listing) return
  // бот — собеседник игрока
  const bot = await db.user.findUnique({ where: { id: chat.sellerId === chat.buyerId ? chat.sellerId : (await db.user.findUnique({ where: { id: chat.buyerId } }))?.isBot ? chat.buyerId : chat.sellerId } })
  if (!bot) return
  const player = await db.user.findUnique({ where: { id: bot.id === chat.buyerId ? chat.sellerId : chat.buyerId } })
  if (!player) return

  const persona = personaOf(bot)
  const meta = parseChatMeta(chat.meta)
  const isBuyer = meta.botRole === 'buyer'
  const playerMessage = playerMsg.invoice
    ? `Собеседник выставил счёт на ${fmtMoney(playerMsg.invoice)} (предлагает цену ${fmtMoney(playerMsg.invoice)})`
    : playerMsg.text ?? ''

  // бот уже закрыл сделку — короткий ответ
  if (meta.closed) {
    await saveAndEmit(chat.id, bot, 'Извиняюсь, товар уже не актуален, сделка закрыта', persona.typoRate)
    return
  }

  // печатает... (дальше событие повторяется keepalive-циклом обёртки)
  setTypingName(bot.displayName)
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 900))

  const history = await historyOf(chat.id, bot.id)
  const condLabel = CONDITION_LABEL[listing.condition] ?? listing.condition

  // ---------- FAST-PATH БЕЗ LLM ----------
  // Игрок согласился на последнюю цену бота → закрываем сделку скриптом.
  // Это самый частый финал торга — экономим дневной бюджет ИИ (тир 1000/день).
  const AGREE_RE = /(согласен|согласна|ставь\s*сч[её]т|по\s*рукам|давай|беру|забираю|окей|\bок\b|хорошо|ладно|идёт|идет)/i
  if (playerMsg.text && meta.lastOffer && meta.lastOffer > 0 && AGREE_RE.test(playerMsg.text)) {
    // согласие валидно, если последнее слово цены было за ботом и он предлагал lastOffer
    const lastBotMsg = history.filter((h) => h.senderType === 'bot').at(-1)
    if (lastBotMsg) {
      if (!isBuyer) {
        // бот-продавец выставляет счёт ровно на обещанную цену
        const invoiceId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        await saveAndEmit(
          chat.id, bot, `${pickAgree()} ${fmtMoney(meta.lastOffer)}. Ставлю счёт`, persona.typoRate,
          { kind: 'invoice', amount: meta.lastOffer, invoiceId },
        )
        await saveSystem(chat.id, `Счёт от продавца: ${fmtMoney(meta.lastOffer)}. Оплатите, чтобы получить товар.`)
        return
      }
      // бот-покупатель платит игроку-продавцу сразу
      const res = await completeSale({
        listingId: listing.id, buyer: bot, price: meta.lastOffer, via: 'chat', chatId: chat.id,
      })
      if (res.ok) {
        await saveAndEmit(chat.id, bot, `${pickAgree()} оплатил, глянь`, persona.typoRate)
        return
      }
    }
  }
  // ---------- /FAST-PATH ----------

  // ---------- ХАРАКТЕР: терпение и финальная уступка ----------
  // Бот выдерживает persona.patience раундов, потом делает последнюю щедрую
  // цену (свой botLimit), а через два раунда после этого устал и закрывает торг.
  const patience = meta.patience ?? persona.patience
  if (!meta.closed && meta.rounds >= patience) {
    if (meta.rounds >= patience + 2 || meta.finalDone) {
      // устал: терпение кончилось — вежливо/грубо закрываем сделку
      await db.chat.update({ where: { id: chat.id }, data: { meta: JSON.stringify({ ...meta, closed: true, patience }) } })
      const bye = isBuyer
        ? pick(['ну всё, больше не дам, удачи в поисках', 'всё, потолок, до связи', 'не могу больше, пас'])
        : pick(['всё, больше не уступлю, думай', 'последняя цена была — дальше никак, до связи', 'всё, я своё сказал, пас'])
      await saveAndEmit(chat.id, bot, bye, persona.typoRate)
      return
    }
    if (!meta.finalDone) {
      // финальная уступка: открывает свою нижнюю границу один раз
      const finalPrice = isBuyer ? Math.max(meta.botLimit, Math.round(meta.botLimit * 1.02)) : meta.botLimit
      const text = isBuyer
        ? `${pick(['ну окей, всё что есть', 'ладно, ты победил'])}: ${fmtMoney(finalPrice)}, больше не дам`
        : `${pick(['ладно, уговорил', 'всё, последняя цена'])}: ${fmtMoney(finalPrice)}. Устраивает — ставь счёт`
      await saveAndEmit(chat.id, bot, text, persona.typoRate, finalPrice ? { offer: finalPrice } : undefined)
      await db.chat.update({
        where: { id: chat.id },
        data: { meta: JSON.stringify({ ...meta, finalDone: true, lastOffer: finalPrice, patience }) },
      })
      return
    }
  }
  // ---------- /ХАРАКТЕР ----------

  const reply = await aiNegotiate({
    persona,
    botRole: meta.botRole,
    listing: {
      title: listing.title,
      price: listing.price,
      baseValue: listing.baseValue,
      condition: listing.condition,
      conditionLabel: condLabel,
      categoryLabel: CATEGORY_LABEL[listing.category] ?? listing.category,
      description: listing.description,
    },
    botLimit: meta.botLimit,
    history,
    rounds: meta.rounds,
    playerMessage,
    firstContact: history.length <= 1,
  })

  await db.chat.update({
    where: { id: chat.id },
    data: { meta: JSON.stringify({ ...meta, botLimit: reply.newLimit, rounds: meta.rounds + 1, lastOffer: reply.price ?? meta.lastOffer }) },
  })

  // действия
  if ((reply.action === 'accept' || reply.action === 'invoice') && reply.price) {
    if (isBuyer) {
      // бот-покупатель платит игроку-продавцу сразу
      const res = await completeSale({
        listingId: listing.id, buyer: bot, price: reply.price, via: 'chat', chatId: chat.id,
      })
      if (res.ok) {
        if (!player.isBot) await bumpStats(bot.id, {})
        await saveAndEmit(chat.id, bot, `${reply.text}`, persona.typoRate)
        return
      }
      await saveAndEmit(chat.id, bot, 'что-то с оплатой не вышло, давай чуть позже', persona.typoRate)
      return
    }
    // бот-продавец выставляет счёт на согласованную цену
    const invoiceId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    await saveAndEmit(
      chat.id, bot, reply.text, persona.typoRate,
      { kind: 'invoice', amount: reply.price, invoiceId },
    )
    await saveSystem(chat.id, `Счёт от продавца: ${fmtMoney(reply.price)}. Оплатите, чтобы получить товар.`)
    return
  }

  if (reply.action === 'reject') {
    await db.chat.update({ where: { id: chat.id }, data: { meta: JSON.stringify({ ...meta, closed: true }) } })
    await saveAndEmit(chat.id, bot, reply.text, persona.typoRate)
    return
  }

  await saveAndEmit(chat.id, bot, reply.text, persona.typoRate, reply.price ? { offer: reply.price } : undefined)
}

// Публичный хелпер: бот пишет сообщение в чат (используется и движком рынка)
export async function botSay(
  chatId: string,
  bot: User,
  text: string,
  typoRate: number,
  extra?: { kind?: 'invoice'; amount?: number; invoiceId?: string; offer?: number },
) {
  return saveAndEmit(chatId, bot, text, typoRate, extra)
}

async function saveAndEmit(
  chatId: string,
  bot: User,
  text: string,
  typoRate: number,
  extra?: { kind?: 'invoice'; amount?: number; invoiceId?: string; offer?: number },
) {
  let clean = stripEmoji(text)
    .replace(/\s*\|\s*/g, '. ') // модель любит палки-перечисления — чистим на самом низу
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
  if (extra?.offer) {
    // гарантируем, что цена озвучена в тексте (сравниваем только цифры)
    const digits = clean.replace(/[^0-9]/g, '')
    if (!digits.includes(String(extra.offer))) {
      clean = `${clean} ${fmtMoney(extra.offer)}`.trim()
    }
  }
  const m = await db.message.create({
    data: {
      chatId,
      senderType: 'bot',
      senderId: bot.id,
      senderName: bot.displayName,
      kind: extra?.kind ?? 'text',
      text: clean.slice(0, 400),
      amount: extra?.amount ?? null,
      invoiceId: extra?.invoiceId ?? null,
    },
  })
  await db.chat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } })
  const chat = await db.chat.findUnique({ where: { id: chatId } })
  const dto = {
    chatId,
    message: {
      id: m.id, senderType: 'bot' as const, senderId: bot.id, senderName: bot.displayName,
      kind: m.kind as 'text' | 'invoice' | 'system', text: m.text, amount: m.amount,
      invoiceId: m.invoiceId, paid: m.paid, createdAt: m.createdAt.toISOString(), mine: false,
    },
  }
  await emitTo(`chat:${chatId}`, 'chat:message', dto)
  if (chat) {
    const playerUserId = chat.buyerId === bot.id ? chat.sellerId : chat.buyerId
    await emitTo(`user:${playerUserId}`, 'chat:message', dto)
    const isInvoice = m.kind === 'invoice'
    await db.notification.create({
      data: {
        userId: playerUserId, kind: 'message', title: bot.displayName,
        body: isInvoice ? `Счёт на ${fmtMoney(m.amount ?? 0)}` : m.text.slice(0, 80),
      },
    })
  }
}

async function saveSystem(chatId: string, text: string) {
  const m = await db.message.create({
    data: { chatId, senderType: 'system', senderId: 'system', senderName: 'Система', kind: 'system', text },
  })
  await emitTo(`chat:${chatId}`, 'chat:message', {
    chatId,
    message: {
      id: m.id, senderType: 'system', senderId: 'system', senderName: 'Система',
      kind: 'system', text: m.text, amount: null, invoiceId: null, paid: null,
      createdAt: m.createdAt.toISOString(), mine: false,
    },
  })
}

// Игрок оплатил счёт бота-продавца
export async function payInvoice(chatId: string, invoiceId: string, player: User) {
  const invoice = await db.message.findFirst({
    where: { chatId, invoiceId, kind: 'invoice', paid: null },
  })
  if (!invoice) return { ok: false as const, error: 'Счёт не найден или уже оплачен' }
  if (invoice.amount === null) return { ok: false as const, error: 'Счёт повреждён' }
  if (player.balance < invoice.amount) return { ok: false as const, error: 'Недостаточно средств на счету' }

  const chat = await db.chat.findUnique({ where: { id: chatId } })
  if (!chat) return { ok: false as const, error: 'Чат не найден' }
  const listing = await db.listing.findUnique({ where: { id: chat.listingId } })
  if (!listing || listing.status !== 'active') return { ok: false as const, error: 'Товар уже продан' }

  await db.message.update({ where: { id: invoice.id }, data: { paid: true } })
  const res = await completeSale({
    listingId: listing.id, buyer: player, price: invoice.amount, via: 'chat', chatId,
  })
  if (!res.ok) {
    await db.message.update({ where: { id: invoice.id }, data: { paid: null } })
    return { ok: false as const, error: res.error ?? 'Сделка не состоялась' }
  }
  await bumpQuests(player.id, 'chat')
  return { ok: true as const }
}

// ---------- WIN-BACK ----------
// Бот-продавец сам делает шаг навстречу, если игрок пропал после торга:
// через 2-6 минут присылает «ладно, отдам за X, ну ты чё» — цену между
// последним оффером и скрытым пределом. Один раз на чат (winBackDone в meta).
const WINBACK_TEMPLATES = [
  'ладно, уступлю в последний раз — {X} и забирай',
  'слушай, ну ты чё пропал, отдам за {X} если сегодня заберёшь',
  'окей, хочу просто закрыть вопрос, {X} и моя',
  'ладно, вижу ты с деньгами туго, давай {X} и разойдёмся',
  'старая цена не актуальна, {X} — последняя, дальше только дорожать будет',
  'ну не молчи, могу подвинуться: {X} и по рукам',
]

export async function winBackSweep(): Promise<void> {
  // свежие чаты: последнее сообщение 2..30 минут назад
  const chats = await db.chat.findMany({
    where: { lastMessageAt: { lt: new Date(Date.now() - 2 * 60_000), gt: new Date(Date.now() - 30 * 60_000) } },
    orderBy: { lastMessageAt: 'desc' },
    take: 25,
  })
  for (const chat of chats) {
    try {
      const meta = parseChatMeta(chat.meta)
      if (meta.closed || (meta as ChatMeta & { winBackDone?: boolean }).winBackDone) continue
      if (meta.botRole !== 'seller') continue
      if (!meta.lastOffer || meta.lastOffer <= 0) continue

      const buyer = await db.user.findUnique({ where: { id: chat.buyerId } })
      const seller = await db.user.findUnique({ where: { id: chat.sellerId } })
      if (!buyer || !seller || buyer.isBot || !seller.isBot) continue
      if (await isBlocked(buyer.id, seller.id)) continue

      const listing = await db.listing.findUnique({ where: { id: chat.listingId } })
      if (!listing || listing.status !== 'active') continue

      const lastMsg = await db.message.findFirst({
        where: { chatId: chat.id },
        orderBy: { createdAt: 'desc' },
      })
      // последнее слово за ботом, и это текст (не ждём оплату инвойса)
      if (!lastMsg || lastMsg.senderId !== seller.id || lastMsg.kind !== 'text') continue

      // уступка 3-8% от последнего оффера, но не ниже экономического пола
      // (~70% оценки товара в его состоянии) и не сильно ниже скрытого предела
      const mult = CONDITION_MULT[listing.condition] ?? 0.8
      const econFloor = Math.round(listing.baseValue * mult * 0.7)
      const softFloor = Math.round(meta.botLimit * 0.88)
      const price = Math.max(econFloor, softFloor, Math.round((meta.lastOffer * (1 - (0.03 + Math.random() * 0.05))) / 10) * 10)
      if (price >= meta.lastOffer) continue

      const persona = personaOf(seller)
      const tpl = WINBACK_TEMPLATES[Math.floor(Math.random() * WINBACK_TEMPLATES.length)]
      await botSay(chat.id, seller, tpl.replace('{X}', fmtMoney(price)), persona.typoRate + 0.05, { offer: price })

      // ботLimit опускаем до обещанной цены, чтобы последующее «согласен»
      // выставило счёт ровно на неё (иначе ИИ продаст дороже обещанного)
      await db.chat.update({
        where: { id: chat.id },
        data: { meta: JSON.stringify({ ...meta, lastOffer: price, botLimit: price, winBackDone: true }) },
      })
    } catch (e) {
      console.error('[chat-engine] winback error:', e)
    }
  }
}
