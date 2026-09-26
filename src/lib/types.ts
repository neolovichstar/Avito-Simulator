// Общие типы данных игры (используются фронтом и бэком)

export interface SessionUser {
  id: string
  username: string
  displayName: string
  photoUrl: string | null
  balance: number
  debt: number
  deposit: number
  xp: number
  level: number
  ratingSum: number
  ratingCount: number
  taxDebt: number
  city: string
  bio: string | null
  isNew: boolean
}

export interface FeedSeller {
  id: string
  displayName: string
  rating: number
  ratingCount: number
  isBot: boolean
  online: boolean
}

export interface FeedListing {
  id: string
  title: string
  price: number
  baseValue: number
  category: string
  condition: string
  image: string
  status?: string
  city: string
  createdAt: string
  views: number
  boosted: boolean
  seller: FeedSeller
  mine: boolean
  negotiable?: boolean // «Торг уместен»: продавец-бот открыт к снижению цены
}

export interface PricePointDTO {
  price: number
  at: string
}

export interface SimilarListingDTO {
  id: string
  title: string
  price: number
  condition: string
  image: string
  city: string
  createdAt: string
  boosted: boolean
  sellerName: string
  mine: boolean
}

export interface ListingDetailData extends FeedListing {
  description: string
  itemKey: string
  marginHint: number // сколько можно заработать %, ориентировочно
  sellerJoined: string
  priceHistory?: PricePointDTO[]
  similar?: SimilarListingDTO[]
  purchasedByMe?: boolean // текущий пользователь покупал этот товар
  reviewedByMe?: boolean // и уже оставил отзыв
}

export interface SavedSearchDTO {
  id: string
  query: string
  category: string | null
  createdAt: string
}

// Чёрный список: продавец, которого заблокировал игрок
export interface BlockedSellerDTO {
  sellerId: string
  name: string
  photoUrl: string | null
  city: string
  rating: number
  ratingCount: number
  isBot: boolean
  blockedAt: string
}

// Пульс рынка: заметное движение цены на конкретный товар за последний час
export interface PulseItemDTO {
  itemKey: string
  title: string
  image: string
  category: string
  price: number // последняя цена
  deltaPct: number // минус — подешевел, плюс — подорожал
  moves: number // сколько смен цены за час
}

// Пульс рынка (28-a): топ-движения из индекса цен + новостная строка волн
export interface MarketPulseDTO {
  moves: PulseItemDTO[]
  headline: string | null
}

// Конкуренты по тому же товару (для шита изменения цены)
export interface RivalRow {
  id: string
  price: number
  seller: string
  city: string
  condition: string
  image: string
  isMine: boolean
  isMe: boolean
}

export interface RivalsData {
  itemKey: string
  count: number
  avg: number
  rivals: RivalRow[]
}

export interface ReviewDTO {
  id: string
  from: string
  rating: number
  text: string
  createdAt: string
}

export interface ChatListItem {
  id: string
  listingId: string
  listingTitle: string
  listingImage: string
  listingPrice: number
  listingStatus: string
  lastMessage: { text: string; kind: string; createdAt: string; mine: boolean } | null
  counterpart: { id: string; displayName: string; isBot: boolean; online: boolean }
  unread: number
  role: 'buyer' | 'seller'
}

export interface ChatMessageDTO {
  id: string
  senderType: 'user' | 'bot' | 'system'
  senderId: string
  senderName: string
  kind: 'text' | 'invoice' | 'system'
  text: string
  amount: number | null
  invoiceId: string | null
  paid: boolean | null
  createdAt: string
  mine: boolean
}

export interface ChatDetailData {
  id: string
  listing: { id: string; title: string; price: number; image: string; status: string; condition: string }
  counterpart: { id: string; displayName: string; isBot: boolean; online: boolean; lastSeenAt: string; rating: number; ratingCount: number }
  role: 'buyer' | 'seller'
  // посылка этой сделки (28-b): статус-строка «Курьер забирает товар…» с прогрессом
  delivery?: ChatDeliveryDTO | null
  messages: ChatMessageDTO[]
  // честный индикатор настроения бота (28-a): сервер считает по meta + память бота
  mood?: { state: 'neutral' | 'annoyed' | 'angry' | 'happy' | 'cold' | 'gone'; emoji: string; label: string }
  // последняя цена, предложенная ботом (для быстрых реплик-чипов)
  lastBotOffer?: number | null
}

export interface TransactionDTO {
  id: string
  type: string
  amount: number
  counterpartyName: string | null
  note: string | null
  createdAt: string
}

export interface BankData {
  balance: number
  debt: number
  deposit: number
  loanLimit: number
  cardNumber: string
  level: number
  creditScore?: number
  creditRate?: number
  transactions: TransactionDTO[]
  activeLoan: { principal: number; owed: number; rate: number; dueAt: string } | null
}

// Запись кредитной истории (/api/bank/loans)
export interface LoanHistoryItem {
  id: string
  principal: number
  owed: number
  rate: number
  status: 'active' | 'repaid' | 'overdue' | string
  takenAt: string
  repaidAt: string | null
}

export interface TaxBillDTO {
  id: string
  amount: number
  reason: string
  status: string
  createdAt: string
  dueAt: string
  paidAt: string | null
}

export interface TaxData {
  taxDebt: number
  rate: number
  blocked: boolean
  bills: TaxBillDTO[]
  totalPaid: number
  totalEarned: number
}

export interface MarketStats {
  online: number
  activeListings: number
  indexes: { category: string; multiplier: number }[]
  events: { id: string; category: string; kind: string; headline: string; body: string; createdAt: string }[]
}

export interface NotificationDTO {
  id: string
  kind: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

export interface InventoryItemDTO {
  id: string
  itemKey: string
  title: string
  category: string
  condition: string
  image: string
  baseValue: number
  purchasePrice: number
  estValue: number
  createdAt: string
  listed: boolean
}

// Ремонт
export interface RepairQuoteDTO {
  fromCondition: string
  toCondition: string
  cost: number
  minutes: number
}

export interface RepairOrderDTO {
  id: string
  itemTitle: string
  itemImage: string
  fromCondition: string
  toCondition: string
  cost: number
  status: 'in_progress' | 'ready'
  startedAt: string
  readyAt: string
}

// ─── Мастерская: запчасти, инструменты, рабочие наряды (Task 28-c) ───

// Неисправность из диагностики
export interface FaultDTO {
  code: string
  label: string
  wear: number
  partKey?: string
}

// Вещь в мастерской (расширенная)
export interface WorkshopItemDTO extends InventoryItemDTO {
  faults: FaultDTO[] | null // есть диагностика
  suggestedPartKey: string | null
  hasPartInStock: boolean
  warrantyUntil: string | null
  game: string // мини-игра по умолчанию
  activeJob: ActiveJobDTO | null
  installedParts: { partKey: string; title: string; wear: number }[]
}

// Незавершённая работа (продолжить мини-игру)
export interface ActiveJobDTO {
  id: string
  kind: 'repair' | 'install'
  game: string
  difficulty: 'easy' | 'normal' | 'hard'
  partKey: string | null
  cost: number
  hasTool: boolean // инструмент жив на момент продолжения
}

// Инструмент в мастерской
export interface ToolDTO {
  key: string
  title: string
  price: number
  uses: number
  durability: number
  game: string
  hint: string
}

// Запчасть на складе
export interface StockDTO {
  partKey: string
  qty: number
  wearAvg: number
}

// Ответ GET /api/repair
export interface WorkshopDataDTO {
  items: WorkshopItemDTO[]
  orders: RepairOrderDTO[]
  tools: ToolDTO[]
  stock: StockDTO[]
  level: number
  workDiscount: number
}

// Конфиг работы из start — передаётся в мини-игру
export interface JobConfigDTO {
  jobId: string
  kind: 'repair' | 'install'
  game: string
  difficulty: 'easy' | 'normal' | 'hard'
  itemTitle: string
  itemImage: string
  partKey: string | null
  partTitle: string | null
  cost: number
  warranty: boolean
  hasTool: boolean
}

// Результат мини-игры из finish
export interface JobResultDTO {
  ok: boolean
  success: boolean
  perfect: boolean
  score: number
  item: InventoryItemDTO | null
  valueAdd: number
  partWasted: boolean
  warrantyUntil: string | null
  xp: number
  message: string
}

// Доставки (логистика 28-b):
//   purchase: collecting («Собираем») → in_transit («В пути») → arrived («Прибыл» в ПВЗ) →
//             → delivered (игрок забрал) | returned (24 ч не забрал — возврат денег минус 5%)
//   sale:     collecting («Курьер забирает») → in_transit («Везём покупателю») → delivered (деньги зачислены)
export type DeliveryStatusDTO = 'collecting' | 'in_transit' | 'arrived' | 'delivered' | 'returned'

export interface DeliveryDTO {
  id: string
  kind: 'purchase' | 'sale'
  listingId: string
  title: string
  image: string
  price: number
  courier: string
  status: DeliveryStatusDTO
  listedCondition: string
  realCondition: string | null
  createdAt: string
  /** конец фазы «Собираем/Курьер забирает» — детерминирован по id посылки */
  collectEndsAt: string
  eta: string
  /** после этого срока невостребованную посылку возвращает (только purchase) */
  pickupDeadline: string | null
  deliveredAt: string | null
}

// Компактный блок посылки для статус-строки в чате сделки
export interface ChatDeliveryDTO {
  id: string
  kind: 'purchase' | 'sale'
  status: DeliveryStatusDTO
  title: string
  price: number
  createdAt: string
  collectEndsAt: string
  eta: string
  pickupDeadline: string | null
}

// «В пути (N)» в инвентаре: вещи, которые ещё едут к игроку
export interface TransitItemDTO {
  id: string
  title: string
  image: string
  price: number
  status: Extract<DeliveryStatusDTO, 'collecting' | 'in_transit' | 'arrived'>
  eta: string
}

// Аукцион
export interface AuctionLotDTO {
  id: string
  title: string
  image: string
  category: string
  condition: string
  baseValue: number
  startPrice: number
  currentBid: number | null
  currentBidderName: string | null
  bidCount: number
  endsAt: string
  myBid: number
  myAutoBid: number // потолок автоставки игрока на этом лоте (0 — нет)
  isMine: boolean
}

export interface AuctionData {
  lots: AuctionLotDTO[]
  activeCount: number
  wonCount: number
}

// Карьера: задания и достижения
export interface QuestDTO {
  id: string
  questId: string
  title: string
  desc: string
  progress: number
  target: number
  reward: number
  xpReward: number
  claimed: boolean
}

export interface AchievementDTO {
  id: string
  title: string
  desc: string
  reward: number
  unlocked: boolean
  /** секретное: условие скрыто, пока не открыто */
  secret: boolean
}

export interface CareerData {
  quests: QuestDTO[]
  achievements: AchievementDTO[]
  xp: number
  level: number
  levelProgress: number
  unlockedCount: number
  totalCount: number
  /** доступна ли бесплатная замена задания сегодня */
  rerollAvailable: boolean
}

export interface ProfileData {
  user: SessionUser
  rating: number
  reviews: { id: string; rating: number; text: string; from: string; createdAt: string }[]
  activeListings: number
  soldCount: number
  inventoryValue: number
  dealsCount: number
  purchases: PurchaseDTO[]
}

export interface PurchaseDTO {
  listingId: string
  title: string
  image: string
  price: number
  createdAt: string
  reviewed: boolean
}

export const TX_TYPE_LABEL: Record<string, string> = {
  purchase: 'Покупка',
  sale: 'Продажа',
  loan: 'Кредит',
  repay: 'Погашение кредита',
  tax: 'Налог',
  penalty: 'Пеня налоговой',
  deposit: 'Пополнение вклада',
  withdraw: 'Снятие вклада',
  interest: 'Проценты по вкладу',
  boost: 'Продвижение объявления',
}

// Страница продавца
export interface SellerInfo {
  id: string
  displayName: string
  isBot: boolean
  bio: string | null
  city: string
  joinedAt: string
  online: boolean
  rating: number
  ratingCount: number
  hue: string
}

export interface SellerProfile {
  seller: SellerInfo
  stats: {
    activeCount: number
    salesCount: number
    dealsCount: number
  }
  reviews: { id: string; from: string; rating: number; text: string; listing: string; createdAt: string }[]
}

// Ежедневный бонус за вход
export interface BonusState {
  claimedToday: boolean
  streak: number
  nextReward: number
  nextStreak: number
}

// ───────────────────────── Автономера ─────────────────────────

export type PlateRarityDTO = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'

export interface PlateOfferDTO {
  first: string
  digits: string
  letters: string
  regionCode: string
  regionName: string
  rarity: PlateRarityDTO
  beautyScore: number
  price: number
}

export interface CarPlateDTO {
  id: string
  plate: string
  first: string
  letters: string
  digits: string
  regionCode: string
  regionName: string
  rarity: PlateRarityDTO
  beautyScore: number
  price: number
  isMain: boolean
  createdAt: string
}
