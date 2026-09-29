'use client'

// «Resale» — светлый минималистичный маркетплейс по фирменному макету:
// лента с категориями, поиск, чаты, профиль и центральная ЗЕЛЁНАЯ круглая
// кнопка «+» для продажи. Разделы «Авто» и «Номера» открываются из ленты.
import { useCallback, useEffect, useState } from 'react'
import { Car, Hash, Home, MessageCircle, Plus, Search, User } from 'lucide-react'
import { api } from '@/lib/api'
import { sound } from '@/lib/sound'
import NotificationCenter from '@/components/os/NotificationCenter'
import FeedScreen from './FeedScreen'
import ListingScreen from './ListingScreen'
import SellScreen from './SellScreen'
import ChatsScreen from './ChatsScreen'
import ChatScreen from './ChatScreen'
import ProfileScreen from './ProfileScreen'
import NumbersScreen from './NumbersScreen'
import SellerScreen from './SellerScreen'

type Tab = 'feed' | 'auto' | 'numbers' | 'search' | 'fav' | 'chats' | 'profile' | 'sell'

// Внутренняя навигация: стек экранов (объявление → продавец → объявление …)
type View = { type: 'listing' | 'seller' | 'chat'; id: string }

// Табы нижней панели: центральная зелёная «+» вставляется между Поиском и Чатами
const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: 'feed', label: 'Главная', icon: Home },
  { key: 'search', label: 'Поиск', icon: Search },
  { key: 'chats', label: 'Чаты', icon: MessageCircle },
  { key: 'profile', label: 'Профиль', icon: User },
]

export default function AvitoApp() {
  const [tab, setTab] = useState<Tab>('feed')
  const [stack, setStack] = useState<View[]>([])
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
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
  const openSell = () => { reset(); setTab('sell') }
  const goTab = (t: Tab) => { reset(); setTab(t) }

  // Сервисы на главной: разделы «Авто» и «Номера» (вне нижнего таб-бара)
  const servicesRow = (
    <div className="flex gap-2.5" role="group" aria-label="Сервисы">
      <button
        onClick={() => goTab('auto')}
        className="flex min-h-[52px] flex-1 items-center gap-2.5 rounded-[16px] bg-white p-2.5 text-left ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all active:scale-[0.98]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#14532D]/[0.08] text-[#15803D]" aria-hidden>
          <Car size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight text-[#17181A]">Авто</span>
          <span className="block truncate text-[11px] leading-tight text-black/40">Авто и мото</span>
        </span>
      </button>
      <button
        onClick={() => goTab('numbers')}
        className="flex min-h-[52px] flex-1 items-center gap-2.5 rounded-[16px] bg-white p-2.5 text-left ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all active:scale-[0.98]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#14532D]/[0.08] text-[#15803D]" aria-hidden>
          <Hash size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight text-[#17181A]">Номера</span>
          <span className="block truncate text-[11px] leading-tight text-black/40">Крутка знаков</span>
        </span>
      </button>
    </div>
  )

  return (
    // Фикс светлого фона в ЛЮБОЙ теме ОС: не полагаемся на CSS-переменные темы
    <div className="relative flex h-full flex-col bg-[#F5F6F8] text-[#17181A]">
      {/* контент */}
      <div className="relative flex-1 overflow-hidden">
        {top?.type === 'listing' && (
          <ListingScreen
            key={top.id}
            id={top.id}
            onBack={pop}
            onOpenChat={openChat}
            onOpenSeller={openSeller}
            onGoSell={openSell}
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
            {tab === 'feed' && (
              <FeedScreen
                onOpenListing={openListing}
                favoritesMode={false}
                onOpenNotifications={() => setNotifOpen(true)}
                headerExtra={servicesRow}
              />
            )}
            {tab === 'search' && (
              <FeedScreen
                onOpenListing={openListing}
                favoritesMode={false}
                searchMode
                onCancelSearch={() => goTab('feed')}
                onOpenNotifications={() => setNotifOpen(true)}
              />
            )}
            {tab === 'fav' && (
              <FeedScreen onOpenListing={openListing} favoritesMode />
            )}
            {tab === 'auto' && (
              <FeedScreen
                onOpenListing={openListing}
                favoritesMode={false}
                initialCategory="auto"
                lockCategory
                onOpenNotifications={() => setNotifOpen(true)}
                headerHero={
                  <button
                    onClick={() => goTab('numbers')}
                    className="flex w-full items-center gap-3 rounded-[20px] bg-[#14532D] p-3.5 text-left text-white shadow-[0_4px_16px_rgba(20,83,45,0.25)] transition-all active:scale-[0.98]"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10" aria-hidden>
                      <Hash size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold leading-tight">Автономера</span>
                      <span className="block text-[11.5px] leading-snug text-white/60">Крутите буквы и цифры. Блатной знак украсит машину</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[12px] font-bold text-[#15803D]">Крутить</span>
                  </button>
                }
              />
            )}
            {tab === 'numbers' && <NumbersScreen />}
            {tab === 'sell' && <SellScreen onDone={() => goTab('profile')} />}
            {tab === 'chats' && <ChatsScreen onOpenChat={openChat} />}
            {tab === 'profile' && (
              <ProfileScreen
                onOpenListing={openListing}
                onGoSell={openSell}
                onGoFavorites={() => goTab('fav')}
              />
            )}
          </>
        )}
      </div>

      {/* нижний таб-бар: белый/95 blur, 4 таба + центральная зелёная круглая «+» */}
      <nav
        className="relative z-20 shrink-0 border-t border-black/[0.05] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        aria-label="Разделы приложения"
      >
        <div className="flex items-stretch">
          {TABS.slice(0, 2).map((t) => (
            <TabButton key={t.key} tab={t} active={tab === t.key && !top} onClick={() => goTab(t.key)} />
          ))}

          {/* центральная зелёная круглая кнопка «Продать» */}
          <div className="relative flex flex-1 items-start justify-center" aria-hidden={top !== null}>
            <button
              onClick={() => { sound.tap(); openSell() }}
              disabled={top !== null}
              aria-label="Продать вещь"
              className={`-translate-y-4 flex size-[52px] items-center justify-center rounded-full bg-[#14532D] text-white shadow-[0_8px_20px_rgba(20,83,45,0.35)] transition-all active:scale-95 ${
                top ? 'pointer-events-none opacity-0' : ''
              }`}
            >
              <Plus size={26} strokeWidth={2.4} aria-hidden />
            </button>
          </div>

          {TABS.slice(2).map((t) => (
            <TabButton
              key={t.key}
              tab={t}
              active={tab === t.key && !top}
              badge={t.key === 'chats' ? unread : 0}
              onClick={() => goTab(t.key)}
            />
          ))}
        </div>
      </nav>

      {/* центр уведомлений — открывается по колокольчику в шапке ленты */}
      <NotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpenApp={(a) => { setNotifOpen(false); if (a === 'avito') goTab('feed') }}
      />
    </div>
  )
}

function TabButton({ tab, active, badge, onClick }: {
  tab: { key: Tab; label: string; icon: typeof Home }
  active: boolean
  badge?: number
  onClick: () => void
}) {
  const Icon = tab.icon
  return (
    <button
      onClick={() => { sound.tap(); onClick() }}
      aria-label={tab.label}
      aria-current={active ? 'page' : undefined}
      className="relative flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-colors active:bg-neutral-200/40"
    >
      <span className="relative flex items-center justify-center" aria-hidden>
        <Icon
          size={22}
          strokeWidth={active ? 2.3 : 1.9}
          className={active ? 'text-[#15803D]' : 'text-black/40'}
        />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#16A34A] px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className={`text-[10px] leading-none ${active ? 'font-semibold text-[#15803D]' : 'font-medium text-black/40'}`}>
        {tab.label}
      </span>
    </button>
  )
}

export function ConditionBadge({ condition }: { condition: string }) {
  const labels: Record<string, string> = {
    new: 'Новое', excellent: 'Отличное', good: 'Хорошее', used: 'Б/у', parts: 'На запчасти',
  }
  const colors: Record<string, string> = {
    new: 'bg-[#14532D]/[0.08] text-[#15803D]',
    excellent: 'bg-[#14532D]/[0.08] text-[#15803D]',
    good: 'bg-neutral-200/60 text-[#17181A]/50',
    used: 'bg-amber-500/[0.12] text-amber-700',
    parts: 'bg-red-500/[0.08] text-red-600',
  }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${colors[condition] ?? 'bg-neutral-200/60 text-[#17181A]/50'}`}>
      {labels[condition] ?? condition}
    </span>
  )
}
