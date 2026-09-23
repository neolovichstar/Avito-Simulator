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
  city: string
  createdAt: string
  views: number
  boosted: boolean
  seller: FeedSeller
  mine: boolean
}

export interface ListingDetailData extends FeedListing {
  description: string
  itemKey: string
  marginHint: number // сколько можно заработать %, ориентировочно
  sellerJoined: string
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
  counterpart: { id: string; displayName: string; isBot: boolean; online: boolean; rating: number; ratingCount: number }
  role: 'buyer' | 'seller'
  messages: ChatMessageDTO[]
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
  transactions: TransactionDTO[]
  activeLoan: { principal: number; owed: number; rate: number; dueAt: string } | null
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

// Доставки (курьер)
export interface DeliveryDTO {
  id: string
  title: string
  image: string
  price: number
  courier: string
  status: 'in_transit' | 'delivered'
  listedCondition: string
  realCondition: string | null
  createdAt: string
  eta: string
  deliveredAt: string | null
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
}

export interface CareerData {
  quests: QuestDTO[]
  achievements: AchievementDTO[]
  xp: number
  level: number
  levelProgress: number
  unlockedCount: number
  totalCount: number
}

export interface ProfileData {
  user: SessionUser
  rating: number
  reviews: { id: string; rating: number; text: string; from: string; createdAt: string }[]
  activeListings: number
  soldCount: number
  inventoryValue: number
  dealsCount: number
}

export const TX_TYPE_LABEL: Record<string, string> = {
  purchase: 'Покупка',
  sale: 'Продажа',
  loan: 'Кредит',
  repay: 'Погашение кредита',
  tax: 'Налог',
  penalty: 'Пеня ФНС',
  deposit: 'Пополнение вклада',
  withdraw: 'Снятие вклада',
  interest: 'Проценты по вкладу',
  boost: 'Продвижение объявления',
}
