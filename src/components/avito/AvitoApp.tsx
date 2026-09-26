'use client'

// «Resale» — маркетплейс в стиле настоящего Авито: светлая тема, чистая лента,
// нижняя таб-навигация (Главная / Поиск / Избранное / Сообщения / Профиль)
// и чёрная круглая кнопка «+» для продажи.
import { useCallback, useEffect, useState } from 'react'
import { Car, Hash, Home, MessageCircle, User, Plus } from 'lucide-react'
import { api } from '@/lib/api'
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

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: 'feed', label: 'Главная', icon: Home },
  { key: 'auto', label: 'Авто', icon: Car },
  { key: 'numbers', label: 'Номера', icon: Hash },
  { key: 'chats', label: 'Сообщения', icon: MessageCircle },
  { key: 'profile', label: 'Профиль', icon: User },
]

export default function AvitoApp() {
  const [tab, setTab] = useState<Tab>('feed')
  const [stack, setStack] = useState<View[]>([])
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  // панель сравнения открыта в ленте — прячем «+», чтобы не перекрывал её
  const [compareActive, setCompareActive] = useState(false)
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
  const onCompareActiveChange = useCallback((v: boolean) => setCompareActive(v), [])

  return (
    <div className="relative h-full flex flex-col bg-[#F7F8FA]">
      {/* контент */}
      <div className="flex-1 overflow-hidden relative">
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
                onCompareActiveChange={onCompareActiveChange}
              />
            )}
            {tab === 'search' && (
              <FeedScreen
                onOpenListing={openListing}
                favoritesMode={false}
                searchMode
                onCancelSearch={() => goTab('feed')}
                onOpenNotifications={() => setNotifOpen(true)}
                onCompareActiveChange={onCompareActiveChange}
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
                onCompareActiveChange={onCompareActiveChange}
                headerHero={
                  <button
                    onClick={() => goTab('numbers')}
                    className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-[#0F1210] to-[#232A24] p-3.5 text-left text-white transition-all active:scale-[0.99]"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                      <Hash size={19} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold leading-tight">Автономера</span>
                      <span className="block text-[11.5px] text-white/60">Крутите буквы и цифры — блатной знак украсит машину</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[12px] font-bold text-black">Крутить</span>
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

        {/* чёрная круглая «+ Продать» — как в настоящем Авито */}
        {!top && tab !== 'sell' && tab !== 'chats' && tab !== 'numbers' && !compareActive && (
          <button
            onClick={openSell}
            aria-label="Продать вещь"
            className="absolute bottom-4 right-4 z-20 size-14 rounded-full bg-black text-white flex items-center justify-center shadow-xl shadow-black/25 active:bg-[#1A1A1A] active:scale-95 transition-all"
          >
            <Plus size={26} strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>

      {/* нижняя таб-навигация: белый бар, 5 разделов */}
      <nav
        className="shrink-0 bg-white border-t border-[#EBEDF0] flex items-stretch pb-[env(safe-area-inset-bottom)]"
        aria-label="Разделы приложения"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key && !top
          const badge = key === 'chats' ? unread : 0
          return (
            <button
              key={key}
              onClick={() => goTab(key)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="relative flex-1 h-14 flex flex-col items-center justify-center gap-1 active:bg-[#F7F8FA] transition-colors"
            >
              <span className="relative flex items-center justify-center">
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.8}
                  className={active ? 'text-black' : 'text-[#8B8F99]'}
                  aria-hidden
                />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#0AC760] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] leading-none ${active ? 'text-black font-semibold' : 'text-[#8B8F99] font-medium'}`}>
                {label}
              </span>
            </button>
          )
        })}
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

export function ConditionBadge({ condition }: { condition: string }) {
  const labels: Record<string, string> = {
    new: 'Новое', excellent: 'Отличное', good: 'Хорошее', used: 'Б/у', parts: 'На запчасти',
  }
  const colors: Record<string, string> = {
    new: 'bg-[#E6F9EF] text-[#07843F]',
    excellent: 'bg-[#E6F9EF] text-[#07843F]',
    good: 'bg-[#F0F1F5] text-[#5C616B]',
    used: 'bg-[#FFF4E5] text-[#B25E09]',
    parts: 'bg-[#FDEBEB] text-[#D14343]',
  }
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-[10px] font-medium ${colors[condition] ?? 'bg-[#F0F1F5] text-[#5C616B]'}`}>
      {labels[condition] ?? condition}
    </span>
  )
}
