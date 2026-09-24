'use client'

// Единый клиент API игры. Токен сессии хранится в localStorage.
import type {
  SessionUser, FeedListing, ListingDetailData, ChatListItem, ChatDetailData, ChatMessageDTO,
  BankData, TaxData, MarketStats, NotificationDTO, InventoryItemDTO, ProfileData,
  RepairOrderDTO, RepairQuoteDTO, DeliveryDTO, AuctionData, AuctionLotDTO, CareerData, QuestDTO,
  SavedSearchDTO, SellerProfile, BonusState, PulseItemDTO, RivalsData, BlockedSellerDTO,
} from '@/lib/types'
import type { CatalogItem, CategoryKey } from '@/lib/catalog-types'

const TOKEN_KEY = 'avito_sim_token'

export function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(t: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, t)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getToken()}`,
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Ошибка ${res.status}`)
  return data
}

const post = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined })

const put = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined })

const del = <T,>(path: string) => req<T>(path, { method: 'DELETE' })

const patch = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined })

export const api = {
  // auth
  auth: (initData: string | null) =>
    post<{ token: string; user: SessionUser }>('/api/auth', { initData, devName: 'Игрок' }),

  // avito
  feed: (params: { q?: string; category?: CategoryKey | 'all'; sort?: 'new' | 'cheap' | 'expensive'; page?: number; limit?: number; mine?: boolean; city?: string }) => {
    const sp = new URLSearchParams()
    if (params.q) sp.set('q', params.q)
    if (params.category && params.category !== 'all') sp.set('category', params.category)
    if (params.city && params.city !== 'all') sp.set('city', params.city)
    if (params.sort) sp.set('sort', params.sort)
    if (params.page) sp.set('page', String(params.page))
    if (params.limit) sp.set('limit', String(params.limit))
    if (params.mine) sp.set('mine', '1')
    return req<{ items: FeedListing[]; total: number }>('/api/listings?' + sp.toString())
  },
  feedCities: () => req<{ cities: { city: string; count: number }[] }>('/api/cities'),
  listing: (id: string) => req<ListingDetailData>(`/api/listings/${id}`),
  createListing: (body: { itemId?: string; itemKey?: string; title: string; description: string; category: CategoryKey; condition: string; price: number }) =>
    post<{ listing: FeedListing }>('/api/listings', body),
  boostListing: (id: string) => post<{ ok: boolean; balance: number }>(`/api/listings/${id}/boost`),
  removeListing: (id: string) => post<{ ok: boolean }>(`/api/listings/${id}/remove`),
  updatePrice: (id: string, price: number) =>
    patch<{ ok: boolean; listing: FeedListing; changed: boolean; oldPrice?: number; warStarted?: boolean }>(`/api/listings/${id}`, { price }),
  buyListing: (id: string, opts?: { courier?: boolean }) =>
    post<{ ok: boolean; balance: number; xp?: number; level?: number; item?: InventoryItemDTO; deliveryId?: string }>(`/api/listings/${id}/buy`, { courier: opts?.courier ?? false }),
  leaveReview: (id: string, rating: number, text: string) =>
    post<{ ok: boolean; xp: number }>(`/api/listings/${id}/review`, { rating, text }),
  userReviews: (userId: string) =>
    req<{ rating: number; count: number; items: { id: string; from: string; rating: number; text: string; listing: string; createdAt: string }[] }>(`/api/users/${userId}/reviews`),
  addComplaint: (id: string, reason: string) =>
    post<{ ok: boolean; complaints: number }>(`/api/listings/${id}/complaint`, { reason }),
  complaintState: (id: string) =>
    req<{ complainedByMe: boolean; reason: string | null; complaints: number }>(`/api/listings/${id}/complaint`),
  // избранное: серверный синк для оповещений о снижении цены
  favSyncAll: (ids: string[]) => put<{ ok: boolean; added: number; removed: number }>('/api/favorites', { ids }),
  favToggle: (listingId: string, on: boolean) => post<{ ok: boolean; on: boolean }>('/api/favorites', { listingId, on }),
  // страница продавца
  seller: (id: string) => req<SellerProfile>(`/api/users/${id}`),
  sellerListings: (id: string, offset = 0) =>
    req<{ items: FeedListing[]; total: number; offset: number }>(`/api/users/${id}/listings?offset=${offset}`),
  // ежедневный бонус за вход
  bonusState: () => req<BonusState>('/api/bonus'),
  bonusClaim: () => post<{ ok: boolean; reward: number; streak: number }>('/api/bonus'),
  savedSearches: () => req<{ searches: SavedSearchDTO[] }>('/api/searches'),
  createSavedSearch: (query: string, category: string | null) =>
    post<{ search: SavedSearchDTO }>('/api/searches', { query, category }),
  deleteSavedSearch: (id: string) => del<{ ok: boolean }>(`/api/searches/${id}`),

  // каталог и инвентарь
  catalog: () => req<{ items: CatalogItem[] }>('/api/catalog'),
  inventory: () => req<{ items: InventoryItemDTO[] }>('/api/inventory'),

  // чаты
  chats: () => req<{ items: ChatListItem[] }>('/api/chats'),
  openChat: (listingId: string) => post<ChatDetailData>('/api/chats', { listingId }),
  chat: (id: string) => req<ChatDetailData>(`/api/chats/${id}`),
  sendMessage: (id: string, text: string) => post<{ messages: ChatMessageDTO[] }>(`/api/chats/${id}/messages`, { text }),
  sendInvoice: (id: string, amount: number) => post<{ messages: ChatMessageDTO[] }>(`/api/chats/${id}/messages`, { invoice: amount }),
  payInvoice: (id: string, invoiceId: string) => post<{ ok: boolean; balance: number; xp?: number; level?: number; messages: ChatMessageDTO[] }>(`/api/chats/${id}/pay`, { invoiceId }),

  // банк
  bank: () => req<BankData>('/api/bank'),
  takeLoan: (amount: number) => post<{ ok: boolean; balance: number }>('/api/bank/loan', { amount }),
  repayLoan: (amount: number) => post<{ ok: boolean; balance: number; debt: number }>('/api/bank/loan', { repay: amount }),
  depositOp: (amount: number, op: 'top' | 'withdraw') => post<{ ok: boolean; balance: number; deposit: number }>('/api/bank/deposit', { amount, op }),

  // налоги
  taxes: () => req<TaxData>('/api/taxes'),
  payTaxes: () => post<{ ok: boolean; balance: number; taxDebt: number }>('/api/taxes', { action: 'pay' }),

  // ремонт
  repair: () => req<{ orders: RepairOrderDTO[]; repairable: InventoryItemDTO[] }>('/api/repair'),
  repairStart: (itemId: string) =>
    post<{ ok: boolean; balance: number; order: RepairOrderDTO; quote: RepairQuoteDTO }>('/api/repair', { itemId }),
  repairPickup: (orderId: string) =>
    post<{ ok: boolean; item: InventoryItemDTO }>('/api/repair/pickup', { orderId }),

  // доставки (курьер)
  deliveries: () => req<{ items: DeliveryDTO[] }>('/api/deliveries'),

  // аукцион
  auction: () => req<AuctionData>('/api/auction'),
  auctionBid: (lotId: string, amount: number) =>
    post<{ ok: boolean; balance: number; lot: AuctionLotDTO }>('/api/auction', { lotId, amount }),
  auctionBids: (lotId: string) =>
    req<{ bids: { id: string; userName: string; amount: number; createdAt: string; isMe: boolean }[] }>(`/api/auction/${lotId}`),
  auctionAutoBid: (lotId: string, maxAmount: number) =>
    post<{ ok: boolean; fired: boolean; maxAmount: number; balance: number }>('/api/auction/autobid', { lotId, maxAmount }),
  auctionAutoBidCancel: (lotId: string) =>
    req<{ ok: boolean }>(`/api/auction/autobid?lotId=${encodeURIComponent(lotId)}`, { method: 'DELETE' }),

  // пульс рынка: движения цен за час
  marketPulse: () => req<PulseItemDTO[]>('/api/market/pulse'),
  // конкуренты по товару (для шита цены)
  listingRivals: (listingId: string) => req<RivalsData>(`/api/listings/${listingId}/rivals`),

  // чёрный список продавцов
  blockedIds: () => req<{ ids: string[] }>('/api/blocked'),
  blockedList: () => req<{ items: BlockedSellerDTO[] }>('/api/blocked'),
  toggleBlock: (sellerId: string) =>
    post<{ ok: boolean; blocked: boolean; name?: string }>('/api/blocked', { sellerId }),

  // telegram-бот: привязка аккаунта для уведомлений
  telegramStatus: () =>
    req<{ linked: boolean; tgUsername: string | null; botUsername: string; createdAt: string | null }>('/api/telegram/link'),
  telegramCode: () => post<{ code: string; ttlMinutes: number; botUsername: string }>('/api/telegram/link', {}),
  telegramUnlink: () => req<{ ok: boolean }>('/api/telegram/link', { method: 'DELETE' }),

  // карьера: задания и достижения
  career: () => req<CareerData>('/api/career'),
  claimQuest: (questId: string) => post<{ ok: boolean; balance: number; xp: number }>('/api/career', { questId }),
  rerollQuest: (questId: string) => post<{ ok: boolean; quest: QuestDTO }>('/api/career/reroll', { questId }),

  // рынок
  market: () => req<MarketStats>('/api/market'),

  // настоящий интернет через прокси
  browsePage: (url: string) => req<{ kind: 'page'; url: string; title: string; text: string; links: { href: string; title: string }[] }>(`/api/browse?url=${encodeURIComponent(url)}`),
  browseSearch: (q: string) => req<{ kind: 'search'; query: string; results: { title: string; href: string; snippet: string; source: string }[] }>(`/api/browse?q=${encodeURIComponent(q)}`),

  // профиль и прочее
  profile: () => req<ProfileData>('/api/profile'),
  notifications: () => req<{ items: NotificationDTO[] }>('/api/notifications'),
  readNotifications: () => post<{ ok: boolean }>('/api/notifications', { action: 'read' }),
  deleteNotification: (id: string) => post<{ ok: boolean }>('/api/notifications', { action: 'delete', id }),
  clearNotifications: () => post<{ ok: boolean }>('/api/notifications', { action: 'clear' }),
  stats: () => req<{ online: number }>('/api/stats'),
  daySummary: () => req<{ deals: number; buys: number; sales: number; net: number }>('/api/day-summary'),
  leaderboard: () =>
    req<{
      balance: LeaderRowDTO[]
      level: LeaderRowDTO[]
      deals: LeaderRowDTO[]
      profit: LeaderRowDTO[]
    }>('/api/leaderboard'),
  systemStatus: () =>
    req<{
      redis: { enabled: boolean; alive: boolean; latencyMs: number | null; failStreak: number }
      db: { ok: boolean; latencyMs: number; provider: string }
      ai: { used: number; limit: number; chatOnly: boolean }
      uptimeSec: number
    }>('/api/system/status'),
}

export interface LeaderRowDTO {
  userId: string
  name: string
  photoUrl: string | null
  isBot: boolean
  online: boolean
  level: number
  value: number
  rank: number
  isMe: boolean
}

// Ссылка на скачивание CSV-истории операций (токен в query — для прямой ссылки)
export function exportCsvUrl(): string {
  return `/api/export/csv?token=${encodeURIComponent(getToken())}`
}
