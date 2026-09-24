'use client'

// «Сделка» — главное приложение. Вкладки: Главная, Избранное, Продать, Сообщения, Профиль
import { useCallback, useEffect, useState } from 'react'
import { Home, Heart, PlusCircle, MessageSquare, User, ShoppingBag } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { FeedListing, ChatListItem } from '@/lib/types'
import FeedScreen from './FeedScreen'
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
  { key: 'fav', label: 'Избранное', icon: Heart },
  { key: 'sell', label: 'Продать', icon: PlusCircle },
  { key: 'chats', label: 'Сообщения', icon: MessageSquare },
  { key: 'profile', label: 'Профиль', icon: User },
]

export default function AvitoApp() {
  const [tab, setTab] = useState<Tab>('feed')
  const [stack, setStack] = useState<View[]>([])
  const [unread, setUnread] = useState(0)
  const session = useOS((s) => s.session)
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
    <div className="h-full flex flex-col bg-[#f4f5f7]">
      {/* шапка «Сделки» */}
      <div className="bg-white border-b border-black/5 px-4 pt-2 pb-2 flex items-center gap-2 shrink-0">
        <DealWordmark />
        <div className="ml-auto text-right">
          <div className="text-[11px] text-neutral-400 leading-none">{session?.city ?? 'Москва'}</div>
          <div key={session?.balance ?? 0} className="value-pop text-xs font-semibold text-neutral-800 mt-1">
            {session ? fmtBalance(session.balance) : '—'}
          </div>
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

      {/* нижняя навигация как в Avito */}
      <nav className="shrink-0 bg-white border-t border-black/5 flex" aria-label="Разделы приложения">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key && !top
          const isSell = key === 'sell'
          return (
            <button
              key={key}
              onClick={() => { reset(); setTab(key) }}
              aria-label={label}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors ${
                active ? 'text-[#965EEB]' : 'text-neutral-400'
              }`}
            >
              {isSell ? (
                <span className={`w-7 h-7 -mt-3 rounded-full flex items-center justify-center shadow-md ${
                  active ? 'bg-[#965EEB] text-white' : 'bg-neutral-200 text-neutral-500'
                }`}>
                  <PlusCircle size={20} />
                </span>
              ) : (
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              )}
              <span className="text-[10px] leading-none">{label}</span>
              {key === 'chats' && unread > 0 && (
                <span className="absolute top-1 right-[22%] min-w-[16px] h-4 px-1 rounded-full bg-[#04E061] text-white text-[10px] font-bold flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export function DealWordmark() {
  return (
    <div className="flex items-center gap-1.5 select-none">
      <svg width="24" height="24" viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id="dealWmGrad" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#B37BF5" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        <path
          d="M21.5 6.5 H39 a2.5 2.5 0 0 1 2.5 2.5 V26.5 a3 3 0 0 1-.88 2.12 L27.5 41.74 a3 3 0 0 1-4.24 0 L6.62 25.1 a3 3 0 0 1 0-4.24 L19.38 7.38 a3 3 0 0 1 2.12-.88 Z"
          fill="url(#dealWmGrad)"
        />
        <circle cx="33" cy="15" r="3.2" fill="#ffffff" />
        <path d="M14.5 26.5 l5.5 5.5 L30 21.5" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" fill="none" />
      </svg>
      <span className="text-lg font-extrabold tracking-tight text-neutral-900">Сделка</span>
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
    new: 'bg-green-100 text-green-700',
    excellent: 'bg-emerald-100 text-emerald-700',
    good: 'bg-lime-100 text-lime-700',
    used: 'bg-amber-100 text-amber-700',
    parts: 'bg-red-100 text-red-600',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[condition] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {labels[condition] ?? condition}
    </span>
  )
}
