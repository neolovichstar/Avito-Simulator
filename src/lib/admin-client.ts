// Клиент админ-панели Resale. Авторизация — httpOnly-cookie resale_admin,
// которую выдаёт POST /api/admin/auth после ввода ключа. Все запросы — same-origin.

export type AdminKpis = {
  users: number
  bots: number
  online: number
  activeListings: number
  deals24: number
  gmv24: number
  gmv24Prev: number
  liveAuctions: number
  taxDebtSum: number
  chats24: number
}

export type SeriesPoint = { day: string; gmv: number; deals: number }
export type SignupPoint = { day: string; count: number }

export type OverviewData = {
  kpis: AdminKpis
  gmvSeries: SeriesPoint[]
  signupSeries: SignupPoint[]
  marketIndex: { category: string; multiplier: number; label: string }[]
  recentTx: {
    id: string
    userName: string
    isBot: boolean
    type: string
    amount: number
    note: string | null
    createdAt: string
  }[]
  hotListings: { id: string; title: string; price: number; views: number; city: string; image: string }[]
  serverTime: string
}

export type AdminUser = {
  id: string
  displayName: string
  username: string
  photoUrl: string | null
  isBot: boolean
  balance: number
  debt: number
  taxDebt: number
  deposit: number
  level: number
  xp: number
  creditScore: number
  city: string
  ratingSum: number
  ratingCount: number
  lastSeenAt: string
  createdAt: string
  personaId: string | null
}

export type UsersPage = {
  rows: AdminUser[]
  total: number
  page: number
  pages: number
}

export type AdminListing = {
  id: string
  title: string
  price: number
  category: string
  condition: string
  city: string
  status: string
  views: number
  image: string
  createdAt: string
  sellerName: string
  sellerIsBot: boolean
  complaintCount: number
}

export type ListingsPage = {
  rows: AdminListing[]
  total: number
  page: number
  pages: number
}

export type MarketEventRow = {
  id: string
  category: string
  kind: string
  magnitude: number
  headline: string
  body: string
  createdAt: string
  expiresAt: string
}

export type MarketData = {
  indexes: { category: string; label: string; multiplier: number; updatedAt: string }[]
  events: MarketEventRow[]
}

export type AdminAuction = {
  id: string
  title: string
  image: string
  category: string
  condition: string
  startPrice: number
  currentBid: number | null
  currentBidderName: string | null
  currentBidderIsBot: boolean | null
  bidCount: number
  status: string
  endsAt: string
  createdAt: string
  finishedAt: string | null
}

export type AdminMessage = {
  id: string
  chatId: string
  senderType: string
  senderName: string
  kind: string
  text: string
  amount: number | null
  paid: boolean | null
  createdAt: string
  listingTitle: string
  buyerName: string
  sellerName: string
}

export class AdminApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  })
  if (res.status === 401) throw new AdminApiError(401, 'Требуется вход')
  if (!res.ok) {
    let msg = `Ошибка ${res.status}`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {}
    throw new AdminApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

export const adminApi = {
  auth: {
    check: () => request<{ ok: true; usingDefault: boolean }>('/auth'),
    login: (key: string) =>
      request<{ ok: true; usingDefault: boolean }>('/auth', {
        method: 'POST',
        body: JSON.stringify({ key }),
      }),
    logout: () => request<{ ok: true }>('/auth', { method: 'DELETE' }),
  },
  overview: () => request<OverviewData>('/overview'),
  users: (params: { q?: string; bot?: string; page?: number }) => {
    const sp = new URLSearchParams()
    if (params.q) sp.set('q', params.q)
    if (params.bot && params.bot !== 'all') sp.set('bot', params.bot)
    sp.set('page', String(params.page ?? 1))
    return request<UsersPage>(`/users?${sp}`)
  },
  patchUser: (
    id: string,
    data: { balanceDelta?: number; taxDebtReset?: boolean; creditScore?: number },
  ) => request<{ ok: true }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  listings: (params: { status?: string; q?: string; page?: number }) => {
    const sp = new URLSearchParams()
    sp.set('status', params.status ?? 'active')
    if (params.q) sp.set('q', params.q)
    sp.set('page', String(params.page ?? 1))
    return request<ListingsPage>(`/listings?${sp}`)
  },
  patchListing: (id: string, status: string) =>
    request<{ ok: true }>(`/listings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteListing: (id: string) => request<{ ok: true }>(`/listings/${id}`, { method: 'DELETE' }),
  market: () => request<MarketData>('/market'),
  setMultipliers: (multipliers: Record<string, number>) =>
    request<{ ok: true }>('/market', { method: 'PUT', body: JSON.stringify({ multipliers }) }),
  createEvent: (data: {
    category: string
    kind: string
    magnitude: number
    headline: string
    body: string
    hours: number
  }) => request<{ ok: true }>('/market/events', { method: 'POST', body: JSON.stringify(data) }),
  deleteEvent: (id: string) => request<{ ok: true }>(`/market/events/${id}`, { method: 'DELETE' }),
  auctions: () =>
    request<{ active: AdminAuction[]; recent: AdminAuction[] }>('/auctions'),
  finishAuction: (id: string) => request<{ ok: true }>(`/auctions/${id}/finish`, { method: 'POST' }),
  messages: (limit = 60) => request<{ rows: AdminMessage[] }>(`/messages?limit=${limit}`),
  deleteMessage: (id: string) => request<{ ok: true }>(`/messages/${id}`, { method: 'DELETE' }),
  broadcast: (data: { title: string; body: string; kind: string }) =>
    request<{ ok: true; sent: number }>('/broadcast', { method: 'POST', body: JSON.stringify(data) }),
}

export const EXPORT_TYPES = [
  { key: 'users', label: 'Игроки (CSV)' },
  { key: 'listings', label: 'Объявления (CSV)' },
  { key: 'transactions', label: 'Транзакции 30 дней (CSV)' },
] as const

export function exportUrl(type: string) {
  return `/api/admin/export?type=${type}`
}
