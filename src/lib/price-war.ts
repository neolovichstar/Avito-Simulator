// ВОЙНА ЦЕН: игрок снизил цену на своём объявлении — конкуренты-боты
// с тем же товаром реагируют живьём:
//  1) подрезают цену ниже игрока (в пределах разума, экономику не рушим);
//  2) часть ботов пишет игроку в чат эмоциональный ответ (демпинг осуждается).
// Реакции ограничены кулдаунами, чтобы не спамить и не обваливать рынок.
import { db } from '@/lib/db'
import { personaOf, botSay, parseChatMeta } from '@/lib/chat-engine'
import { withTypos } from '@/lib/ai'
import { notifyUser } from '@/lib/deals'
import { isBlocked } from '@/lib/blocked'
import { notifyPriceDrop, recordPricePoint } from '@/lib/market-hooks'
import { emitTo } from '@/lib/realtime-emit'
import { fmtMoney, stripEmoji } from '@/lib/format'

const g = globalThis as unknown as { __avitoPriceWar?: Map<string, number> }

function cooldown(key: string, ms: number): boolean {
  const m = (g.__avitoPriceWar ??= new Map<string, number>())
  const now = Date.now()
  const last = m.get(key) ?? 0
  if (now - last < ms) return false
  m.set(key, now)
  return true
}

// Шаблоны военных сообщений — по стилю рыночных продавцов. Мат дозируется.
function warPhrases(title: string, myPrice: number): string[] {
  return [
    `серьезно? ${fmtMoney(myPrice)} за ${title.toLowerCase()}? ты рынок своими ценами ломаешь`,
    `слушай, ну и цены ты ставишь. у меня такой же в идеале, а ты демпингуешь`,
    `ну ты даешь)) из-за таких как ты на сделке заработать нереально. я тоже скинул, довольна?`,
    `увидел твою цену. ты вобще в курсе сколько этот товар стоит новый? я тоже опустился, но это дно`,
    `братан, ты своей ценой всем обед портить. ладно, я тоже подвинулся, но это уже не торг а базар`,
    `да ладно тебе так дешево то. мне теперь тоже твой ценник подтягивать неохота, но придется`,
    `ты чего творишь с ценой на ${title.toLowerCase()}? у меня уже покупатель спросил почему у тебя дешевле. вот и снизил, довольный?`,
    `жесткий демпинг пошел. я тоже цену срезал, но мы оба в минусе будем, умник`,
    `ах вот так значит. ну держи, я тоже уронил ценник. посмотрим чей быстрее уйдет`,
    `напугал меня своей ценой)) тоже пришлось снижать. на сделке раньше люди были почеловечнее`,
  ]
}

// Мирные варианты для мягких личностей
function softPhrases(title: string): string[] {
  return [
    `здравствуйте, дорогой. увидела вашу цену на ${title.toLowerCase()} — пришлось и мне уступить, уж извините`,
    `добрый день. вы снизили цену, а у меня вещь ничуть не хуже. я тоже немного скинула, честно скажу`,
    `здравствуйте. ну что ж, и мне вашу цену пришлось догонять. торгуемся значит`,
  ]
}

/**
 * Реакция рынка на снижение цены игроком.
 * Вызывается из PATCH /api/listings/[id] (fire-and-forget).
 */
export async function onPlayerPriceDrop(
  listing: { id: string; sellerId: string; itemKey: string; title: string; price: number; baseValue: number },
  oldPrice: number,
): Promise<void> {
  try {
    if (listing.price >= oldPrice) return
    if (listing.price <= 0) return // «даром» — войны нет, халяву не бронируем
    if (!cooldown(`war:${listing.id}`, 120_000)) return // не чаще раза в 2 мин на объявление

    const dropPct = 1 - listing.price / oldPrice
    if (dropPct < 0.02) return // мелкая подстройка — рынок не замечает

    // конкуренты-боты с тем же товаром, чья цена теперь выше
    const rivals = await db.listing.findMany({
      where: {
        itemKey: listing.itemKey,
        status: 'active',
        price: { gt: listing.price },
        seller: { isBot: true },
      },
      include: { seller: true },
      orderBy: { price: 'asc' },
      take: 3,
    })
    if (!rivals.length) return

    // пол цены — ниже которого боты не идут даже в войне (экономика важнее)
    const floor = Math.max(50, Math.round(listing.baseValue * 0.42))

    for (const rival of rivals) {
      const persona = personaOf(rival.seller)
      // мягкие личности реже воюют, жадные и пробивные — почти всегда
      const reactChance = 0.35 + persona.greed * 0.55
      if (Math.random() > reactChance) continue
      if (!cooldown(`rival:${rival.id}`, 180_000)) continue

      const roll = Math.random()

      if (roll < 0.6) {
        // ПОДРЕЗКА: встать ниже игрока
        const undercut = Math.min(
          Math.round(listing.price * (1 - 0.02 - Math.random() * 0.06)), // на 2-8% ниже игрока
          Math.round(rival.price * (1 - 0.04 - Math.random() * 0.05)), // и заметно ниже своей старой
        )
        const newPrice = Math.max(floor, undercut)
        if (newPrice >= rival.price) continue
        if (newPrice >= listing.price) continue // не получилось ниже игрока — не воюем

        const rOld = rival.price
        await db.listing.update({ where: { id: rival.id }, data: { price: newPrice } })
        await recordPricePoint(rival.itemKey, newPrice)
        await notifyPriceDrop(
          { id: rival.id, sellerId: rival.sellerId, title: rival.title, price: newPrice },
          rOld,
        )
        // игроку: конкурент ответил
        const rivalPct = Math.round((1 - newPrice / listing.price) * 100)
        await notifyUser(
          listing.sellerId,
          'market',
          'Война цен',
          `Конкурент «${rival.seller.displayName}» ответил на вашу цену: его «${rival.title}» теперь ${fmtMoney(newPrice)} — на ${rivalPct}% дешевле вас.`,
        )
      } else if (roll < 0.9) {
        // ТРЭШ-ТОК: бот открывает чат (свой листинг, игрок «покупатель») и высказывается
        // заблокированному игроку ботов не писать — у него есть право молчать
        if (await isBlocked(listing.sellerId, rival.sellerId)) continue
        const existing = await db.chat.findFirst({
          where: { listingId: rival.id, buyerId: listing.sellerId, sellerId: rival.sellerId },
        })
        let chat = existing
        if (!chat) {
          chat = await db.chat.create({
            data: { listingId: rival.id, buyerId: listing.sellerId, sellerId: rival.sellerId },
          })
        }
        // не спамим в один и тот же чат чаще раза в 10 минут
        const lastMsg = await db.message.findFirst({
          where: { chatId: chat.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
        if (lastMsg && Date.now() - lastMsg.createdAt.getTime() < 10 * 60_000) continue

        const soft = persona.greed < 0.35 || persona.trust > 0.75
        const base = soft ? softPhrases(listing.title) : warPhrases(listing.title, listing.price)
        const raw = base[Math.floor(Math.random() * base.length)]
        const text = stripEmoji(withTypos(raw, persona.typoRate))
        await botSay(chat.id, rival.seller, text, 0)
      } else {
        // ТИХИЙ ОТВЕТ: подрезал без объявления войны — просто уведомление
        const undercut = Math.max(
          floor,
          Math.round(listing.price * (1 - 0.01 - Math.random() * 0.03)),
        )
        if (undercut >= rival.price || undercut >= listing.price) continue
        const rOld = rival.price
        await db.listing.update({ where: { id: rival.id }, data: { price: undercut } })
        await recordPricePoint(rival.itemKey, undercut)
        await notifyPriceDrop(
          { id: rival.id, sellerId: rival.sellerId, title: rival.title, price: undercut },
          rOld,
        )
        await notifyUser(
          listing.sellerId,
          'market',
          'Конкурент подтянулся',
          `«${rival.title}» конкурента теперь ${fmtMoney(undercut)}. Рынок отвечает на ваши цены.`,
        )
      }
    }

    // глобальное событие войны цен — лента оживает (для realtime-обновления)
    await emitTo('global', 'market:pulse', { itemKey: listing.itemKey, price: listing.price })
  } catch {
    // война цен не критична для сделки
  }
}

/**
 * Бот возвращается в чат со скидкой: игрок торговался и ушёл — продавец
 * снижает цену и пишет сам. Запускается из движка раз в несколько тиков.
 */
export async function botComebackOffers(): Promise<void> {
  try {
    const candidates = await db.chat.findMany({
      where: {
        listing: { status: 'active', price: { gt: 0 }, seller: { isBot: true } },
      },
      include: { listing: true },
      orderBy: { lastMessageAt: 'desc' },
      take: 25,
    })

    for (const chat of candidates) {
      const chatMeta = parseChatMeta(chat.meta)
      if (chatMeta.botRole !== 'seller') continue
      if (chatMeta.rounds < 2 || chatMeta.closed) continue // настоящий торг был, но не закрыт
      // покупатель в чёрном списке — продавцу нечего ему предложить
      if (await isBlocked(chat.buyerId, chat.sellerId)) continue

      // последнее слово за игроком, и прошло 4+ минут — «пауза», продавец нервничает
      const last = await db.message.findFirst({
        where: { chatId: chat.id },
        orderBy: { createdAt: 'desc' },
      })
      if (!last || last.senderType !== 'player') continue
      if (Date.now() - last.createdAt.getTime() < 4 * 60_000) continue
      if (!cooldown(`comeback:${chat.id}`, 12 * 60_000)) continue

      // не спамим: в чате не должно быть неоплаченного счёта
      const pending = await db.message.count({
        where: { chatId: chat.id, kind: 'invoice', paid: null },
      })
      if (pending > 0) continue

      const seller = await db.user.findUnique({ where: { id: chat.sellerId } })
      if (!seller) continue
      const persona = personaOf(seller)
      const listing = chat.listing
      // скидка от текущей цены, но не ниже своего лимита
      const limit = chatMeta.botLimit > 0 ? chatMeta.botLimit : Math.round(listing.price * 0.85)
      const offer = Math.max(limit, Math.round(listing.price * (1 - 0.06 - Math.random() * 0.09)))
      if (offer >= listing.price) continue

      const newPrice = offer
      const oldPrice = listing.price
      await db.listing.update({ where: { id: listing.id }, data: { price: newPrice } })
      await recordPricePoint(listing.itemKey, newPrice)

      const texts = persona.greed > 0.6
        ? [
            `слушай, ну чего тянуть. ${fmtMoney(newPrice)} и забирай, ниже не опущусь`,
            `ладно, финальная: ${fmtMoney(newPrice)}. самовывоз за мой счет`,
            `ок, я сегодня добрый. ${fmtMoney(newPrice)}, больше скидок не будет`,
          ]
        : [
            `слушайте, я тут подумал... отдам за ${fmtMoney(newPrice)}, очень нужно продать`,
            `возвращаюсь. могу уступить: ${fmtMoney(newPrice)}. честная цена`,
            `добрый день ещё раз. снизил цену до ${fmtMoney(newPrice)}, пока никто не забрал`,
          ]
      const raw = texts[Math.floor(Math.random() * texts.length)]
      await db.chat.update({
        where: { id: chat.id },
        data: { meta: JSON.stringify({ ...chatMeta, lastOffer: newPrice }) },
      })
      await botSay(chat.id, seller, withTypos(raw, persona.typoRate), 0, { offer: newPrice })

      // оповестим всех, кто в избранном — цена ведь упала
      const { notifyPriceDrop } = await import('@/lib/market-hooks')
      await notifyPriceDrop(
        { id: listing.id, sellerId: chat.sellerId, title: listing.title, price: newPrice },
        oldPrice,
      )

      break // максимум одно возвращение за тик
    }
  } catch {
    // не критично
  }
}
