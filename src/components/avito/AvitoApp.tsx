'use client'

// «Resale» — главное приложение. Шапка: город + баланс + уведомления + профиль.
// Нижняя навигация как в Авито: Главная, Сообщения, круглая «+» (Продать), Избранное, Профиль
import { useCallback, useEffect, useState } from 'react'
import { Home, Heart, Plus, MessageCircle, User, Bell, ChevronDown } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import NotificationCenter from '@/components/os/NotificationCenter'
import FeedScreen, { getFavs } from './FeedScreen'
import ListingScreen from './ListingScreen'
import SellScreen from './SellScreen'
import ChatsScreen from './ChatsScreen'
import ChatScreen from './ChatScreen'
import ProfileScreen from './ProfileScreen'
import SellerScreen from './SellerScreen'

type Tab = 'feed' | 'fav' | 'sell' | 'chats' | 'profile'

// Внутренняя навигация «Сделки»: стек экранов (объявление → продавец → объявление …)
type View = { type: 'listing' | 'seller' | 'chat'; id: string }

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: 'feed', label: 'Главная', icon: Home },
  { key: 'chats', label: 'Сообщения', icon: MessageCircle },
  { key: 'sell', label: 'Продать', icon: Plus },
  { key: 'fav', label: 'Избранное', icon: Heart },
  { key: 'profile', label: 'Профиль', icon: User },
]

export default function AvitoApp() {
  const [tab, setTab] = useState<Tab>('feed')
  const [stack, setStack] = useState<View[]>([])
  const [unread, setUnread] = useState(0)
  const [favCount, setFavCount] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const session = useOS((s) => s.session)
  const notifUnread = useOS((s) => s.notifications.some((n) => !n.readAt))
  const top = stack[stack.length - 1] ?? null

  const refreshUnread = useCallback(async () => {
    try {
      const { items } = await api.chats()
      setUnread(items.reduce((s, c) => s + c.unread, 0))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const t = setInterval(refreshUnread, 12_000)
    const first = setTimeout(refreshUnread, 600)
    return () => {
      clearInterval(t)
      clearTimeout(first)
    }
  }, [refreshUnread])

  // счётчик избранного для бейджа в навигации (localStorage, лёгкий опрос)
  useEffect(() => {
    const sync = () => setFavCount(getFavs().length)
    sync()
    const t = setInterval(sync, 2000)
    return () => clearInterval(t)
  }, [])

  const push = (v: View) => setStack((s) => [...s, v])
  const pop = () => {
    setStack((s) => {
      const wasChat = s[s.length - 1]?.type === 'chat'
      if (wasChat) setTimeout(refreshUnread, 0)
      return s.slice(0, -1)
    })
  }
  const reset = () => setStack([])
  const openListing = (id: string) => push({ type: 'listing', id })
  const openChat = (id: string) => { setUnread(0); push({ type: 'chat', id }) }
  const openSeller = (id: string) => push({ type: 'seller', id })

  return (
    <div className="relative h-full flex flex-col bg-[#050D09]">
      {/* шапка (sticky): город «Москва ⌄» + баланс, колокольчик, профиль */}
      <div className="bg-[#050D09] shrink-0 px-4 pt-2.5 pb-2 flex items-center gap-1 border-b border-white/[0.06]">
        <div className="flex items-center gap-0.5 min-w-0" aria-label={`Город: ${session?.city ?? 'Москва'}`}>
          <span className="text-[16px] font-bold text-white leading-none truncate">{session?.city ?? 'Москва'}</span>
          <ChevronDown size={17} strokeWidth={2.4} className="text-white/70 shrink-0" aria-hidden />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span
            key={session?.balance ?? 0}
            className="value-pop flex items-center h-7 px-2.5 rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400 tabular-nums"
          >
            {session ? fmtBalance(session.balance) : '—'}
          </span>
          <button
            onClick={() => setNotifOpen(true)}
            aria-label="Уведомления"
            className="relative w-9 h-9 rounded-full flex items-center justify-center text-white/80 active:bg-white/10 transition-colors"
          >
            <Bell size={21} strokeWidth={1.9} aria-hidden />
            {notifUnread && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF5555]" aria-hidden />}
          </button>
          <button
            onClick={() => { reset(); setTab('profile') }}
            aria-label="Профиль"
            className="w-9 h-9 rounded-full flex items-center justify-center active:bg-white/10 transition-colors"
          >
            {session?.photoUrl ? (
              <img src={session.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center" aria-hidden>
                <User size={16} />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* контент */}
      <div className="flex-1 overflow-hidden relative">
        {top?.type === 'listing' && (
          <ListingScreen
            key={top.id}
            id={top.id}
            onBack={pop}
            onOpenChat={openChat}
            onOpenSeller={openSeller}
            onGoSell={() => { reset(); setTab('sell') }}
            onOpenListing={openListing}
          />
        )}
        {top?.type === 'seller' && (
          <SellerScreen
            key={top.id}
            sellerId={top.id}
            onBack={pop}
            onOpenListing={openListing}
          />
        )}
        {top?.type === 'chat' && (
          <ChatScreen key={top.id} id={top.id} onBack={pop} />
        )}
        {!top && (
          <>
            {tab === 'feed' && <FeedScreen onOpenListing={openListing} favoritesMode={false} />}
            {tab === 'fav' && <FeedScreen onOpenListing={openListing} favoritesMode />}
            {tab === 'sell' && <SellScreen onDone={() => setTab('profile')} />}
            {tab === 'chats' && <ChatsScreen onOpenChat={openChat} />}
            {tab === 'profile' && (
              <ProfileScreen onOpenListing={openListing} onGoSell={() => setTab('sell')} />
            )}
          </>
        )}
      </div>

      {/* нижняя навигация как в Авито: 5 вкладок, в центре круглая фиолетовая «+» */}
      <nav className="shrink-0 bg-[#0B1710] border-t border-white/[0.08] flex items-stretch" aria-label="Разделы приложения">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key && !top
          const isSell = key === 'sell'
          const badge = key === 'chats' ? unread : key === 'fav' ? favCount : 0
          return (
            <button
              key={key}
              onClick={() => { reset(); setTab(key) }}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`relative flex-1 min-h-[58px] transition-colors ${
                active ? 'text-emerald-400' : 'text-white/50'
              }`}
            >
              {isSell ? (
                <>
                  <span
                    className="absolute left-1/2 -translate-x-1/2 -top-6 w-14 h-14 rounded-full bg-[#22C55E] text-[#052E16] flex items-center justify-center shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform"
                    aria-hidden
                  >
                    <Plus size={26} strokeWidth={2.4} />
                  </span>
                  <span className={`absolute bottom-[8px] left-1/2 -translate-x-1/2 text-[10px] leading-none whitespace-nowrap ${active ? 'font-semibold' : 'font-medium'}`}>
                    {label}
                  </span>
                </>
              ) : (
                <span className="absolute inset-x-0 top-1.5 flex flex-col items-center gap-1">
                  <span className="relative flex items-center justify-center">
                    <Icon size={24} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                    {badge > 0 && (
                      <span
                        className={`absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-[#0B1710] ${
                          key === 'chats' ? 'bg-[#22C55E] text-[#052E16]' : 'bg-[#FF5555] text-white'
                        }`}
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* центр уведомлений — открывается по колокольчику в шапке */}
      <NotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpenApp={(a) => { setNotifOpen(false); if (a === 'avito') { reset(); setTab('feed') } }}
      />
    </div>
  )
}

export function DealWordmark() {
  return (
    <div className="flex items-center gap-1.5 select-none">
      <svg width="24" height="24" viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id="dealWmGrad" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4ADE80" />
            <stop offset="1" stopColor="#16A34A" />
          </linearGradient>
        </defs>
        <path
          d="M21.5 6.5 H39 a2.5 2.5 0 0 1 2.5 2.5 V26.5 a3 3 0 0 1-.88 2.12 L27.5 41.74 a3 3 0 0 1-4.24 0 L6.62 25.1 a3 3 0 0 1 0-4.24 L19.38 7.38 a3 3 0 0 1 2.12-.88 Z"
          fill="url(#dealWmGrad)"
        />
        <circle cx="33" cy="15" r="3.2" fill="#ffffff" />
        <path d="M14.5 26.5 l5.5 5.5 L30 21.5" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" fill="none" />
      </svg>
      <span className="text-lg font-extrabold tracking-tight text-white">Resale</span>
    </div>
  )
}

export function fmtBalance(n: number): string {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽'
}

export function ConditionBadge({ condition }: { condition: string }) {
  const labels: Record<string, string> = {
    new: 'Новое', excellent: 'Отличное', good: 'Хорошее', used: 'Б/у', parts: 'На запчасти',
  }
  const colors: Record<string, string> = {
    new: 'bg-emerald-500/20 text-emerald-300',
    excellent: 'bg-emerald-500/15 text-emerald-300',
    good: 'bg-white/[0.06] text-white/70',
    used: 'bg-amber-400/15 text-amber-300',
    parts: 'bg-red-500/15 text-red-300',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[condition] ?? 'bg-white/[0.06] text-white/60'}`}>
      {labels[condition] ?? condition}
    </span>
  )
}
