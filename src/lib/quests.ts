// Пул ежедневных заданий и достижения

export type QuestKind =
  | 'sell' | 'buy' | 'profit' | 'chat' | 'free' | 'repair'
  | 'courier' | 'bid' | 'boost' | 'spend'

export interface QuestDef {
  id: string
  title: string
  desc: (target: number) => string
  kind: QuestKind
  target: number
  reward: number
  xpReward: number
  weight: number
}

export const QUEST_POOL: QuestDef[] = [
  { id: 'q_sell_2', title: 'План продаж', desc: (t) => `Продайте ${t} товара на Авито`, kind: 'sell', target: 2, reward: 2000, xpReward: 80, weight: 3 },
  { id: 'q_sell_4', title: 'Торговый зал', desc: (t) => `Продайте ${t} товара за день`, kind: 'sell', target: 4, reward: 4500, xpReward: 150, weight: 1 },
  { id: 'q_buy_2', title: 'Закупка', desc: (t) => `Купите ${t} товара для перепродажи`, kind: 'buy', target: 2, reward: 1800, xpReward: 70, weight: 3 },
  { id: 'q_buy_3', title: 'Оптовик', desc: (t) => `Купите ${t} товара за день`, kind: 'buy', target: 3, reward: 3000, xpReward: 110, weight: 2 },
  { id: 'q_profit_3000', title: 'Маржинальный день', desc: (t) => `Заработайте ${t.toLocaleString('ru-RU')} ₽ прибыли с продаж`, kind: 'profit', target: 3000, reward: 2500, xpReward: 100, weight: 3 },
  { id: 'q_profit_8000', title: 'День перекупа', desc: (t) => `Заработайте ${t.toLocaleString('ru-RU')} ₽ прибыли`, kind: 'profit', target: 8000, reward: 6000, xpReward: 200, weight: 1 },
  { id: 'q_chat_10', title: 'Переговорщик', desc: (t) => `Отправьте ${t} сообщений продавцам и покупателям`, kind: 'chat', target: 10, reward: 1200, xpReward: 60, weight: 3 },
  { id: 'q_free_1', title: 'Халява', desc: (t) => `Заберите ${t} объявление «Отдам даром»`, kind: 'free', target: 1, reward: 800, xpReward: 40, weight: 2 },
  { id: 'q_repair_1', title: 'Вторая жизнь', desc: (t) => `Отремонтируйте ${t} вещь в сервисе`, kind: 'repair', target: 1, reward: 1500, xpReward: 70, weight: 2 },
  { id: 'q_courier_1', title: 'Дистанционная сделка', desc: (t) => `Купите ${t} товар с доставкой курьером`, kind: 'courier', target: 1, reward: 1000, xpReward: 50, weight: 2 },
  { id: 'q_bid_2', title: 'Аукционщик', desc: (t) => `Сделайте ${t} ставки на аукционе`, kind: 'bid', target: 2, reward: 1400, xpReward: 60, weight: 2 },
  { id: 'q_boost_1', title: 'Реклама — двигатель', desc: (t) => `Продвиньте ${t} объявление`, kind: 'boost', target: 1, reward: 600, xpReward: 40, weight: 2 },
  { id: 'q_spend_10000', title: 'Разгон капитала', desc: (t) => `Потратьте ${t.toLocaleString('ru-RU')} ₽ на закупки`, kind: 'spend', target: 10000, reward: 2000, xpReward: 90, weight: 2 },
]

export interface AchievementDef {
  id: string
  title: string
  desc: string
  reward: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_deal', title: 'Первый рубль', desc: 'Совершите первую сделку', reward: 1000 },
  { id: 'ten_deals', title: 'Разогрев', desc: 'Совершите 10 сделок', reward: 4000 },
  { id: 'fifty_deals', title: 'Машина торговли', desc: 'Совершите 50 сделок', reward: 20000 },
  { id: 'profit_10k', title: 'Чистая прибыль', desc: 'Заработайте 10 000 ₽ прибыли с перепродаж', reward: 3000 },
  { id: 'profit_100k', title: 'Бизнес на коленке', desc: 'Заработайте 100 000 ₽ прибыли', reward: 15000 },
  { id: 'level_5', title: 'Опытный делец', desc: 'Достигните 5 уровня', reward: 5000 },
  { id: 'level_10', title: 'Магнат объявлений', desc: 'Достигните 10 уровня', reward: 15000 },
  { id: 'haggler_10', title: 'Мастер торга', desc: 'Выторгуйте скидку 5%+ в 10 сделках', reward: 4000 },
  { id: 'bargain_5', title: 'Охотник за скидками', desc: 'Купите 5 вещей на 30%+ дешевле рынка', reward: 3000 },
  { id: 'free_5', title: 'Всё что халява', desc: 'Заберите 5 вещей «Отдам даром»', reward: 1500 },
  { id: 'fixer_5', title: 'Реставратор', desc: 'Отремонтируйте 5 вещей', reward: 2500 },
  { id: 'courier_5', title: 'Диванный шоппер', desc: 'Купите 5 вещей с доставкой курьером', reward: 2000 },
  { id: 'auction_3', title: 'Хозяин молотка', desc: 'Выиграйте 3 аукциона', reward: 5000 },
  { id: 'rich_100k', title: 'Шестизначный', desc: 'Накопите 100 000 ₽ на счету', reward: 8000 },
  { id: 'tycoon_500k', title: 'Тайком миллионер', desc: 'Накопите 500 000 ₽', reward: 30000 },
  { id: 'collector_15', title: 'Коллекционер', desc: 'Имейте 15 вещей в инвентаре одновременно', reward: 4000 },
  { id: 'taxpayer_5k', title: 'Законопослушный', desc: 'Заплатите 5 000 ₽ налогов', reward: 2000 },
  { id: 'chatter_100', title: 'Душа площадки', desc: 'Отправьте 100 сообщений в чатах', reward: 3000 },
]

export interface PlayerStats {
  dealsBuy: number
  dealsSell: number
  dealsTotal: number
  profit: number
  chat: number
  freePicked: number
  repairs: number
  courierBuys: number
  auctionWins: number
  bids: number
  boosts: number
  spent: number
  taxPaid: number
  haggles: number
  bargains: number
}

export function defaultStats(): PlayerStats {
  return {
    dealsBuy: 0, dealsSell: 0, dealsTotal: 0, profit: 0, chat: 0, freePicked: 0,
    repairs: 0, courierBuys: 0, auctionWins: 0, bids: 0, boosts: 0, spent: 0,
    taxPaid: 0, haggles: 0, bargains: 0,
  }
}

export function parseStats(raw: string | null | undefined): PlayerStats {
  if (!raw) return defaultStats()
  try {
    return { ...defaultStats(), ...(JSON.parse(raw) as Partial<PlayerStats>) }
  } catch {
    return defaultStats()
  }
}

// Проверка достижений по статистике
export function achievedIds(stats: PlayerStats, level: number, balance: number, inventoryCount: number): string[] {
  const out: string[] = []
  const add = (id: string, cond: boolean) => { if (cond) out.push(id) }
  add('first_deal', stats.dealsTotal >= 1)
  add('ten_deals', stats.dealsTotal >= 10)
  add('fifty_deals', stats.dealsTotal >= 50)
  add('profit_10k', stats.profit >= 10_000)
  add('profit_100k', stats.profit >= 100_000)
  add('level_5', level >= 5)
  add('level_10', level >= 10)
  add('haggler_10', stats.haggles >= 10)
  add('bargain_5', stats.bargains >= 5)
  add('free_5', stats.freePicked >= 5)
  add('fixer_5', stats.repairs >= 5)
  add('courier_5', stats.courierBuys >= 5)
  add('auction_3', stats.auctionWins >= 3)
  add('rich_100k', balance >= 100_000)
  add('tycoon_500k', balance >= 500_000)
  add('collector_15', inventoryCount >= 15)
  add('taxpayer_5k', stats.taxPaid >= 5_000)
  add('chatter_100', stats.chat >= 100)
  return out
}
