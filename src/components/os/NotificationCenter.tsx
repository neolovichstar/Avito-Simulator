'use client'

// Шторка уведомлений в духе Android 16: мелкий хендл сверху, дата слева,
// справа — «прочитать всё», настройки и «Очистить». Карточки — стекло white/8
// с радиусом 24px: иконка приложения, имя, заголовок, текст. Тап разворачивает
// карточку, свайп в сторону удаляет (и на сервере тоже).
import { useRef, useState, useSyncExternalStore } from 'react'
import {
  Bell, CheckCheck, ChevronDown, Crown, Gavel, Info, MessageSquare, Receipt,
  Settings, ShoppingBag, Trash2, TrendingUp, Truck, Trophy, type LucideIcon,
} from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { useDrag } from '@/lib/use-swipe'
import { sound } from '@/lib/sound'
import type { NotificationDTO } from '@/lib/types'
import NowPlayingShade from './NowPlayingShade'

interface NotifApp {
  app: string
  icon: LucideIcon
  bg: string
  openApp: AppKey
}

// Публичная карта «тип уведомления → приложение»: используется и в локскрине
// (превью с иконкой приложения), и здесь, в центре уведомлений.
export const KIND_APP: Record<string, NotifApp> = {
  deal: { app: 'Resale', icon: ShoppingBag, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  message: { app: 'Resale', icon: MessageSquare, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  tax: { app: 'Налоги', icon: Receipt, bg: 'linear-gradient(145deg,#4a5568,#2d3748)', openApp: 'taxes' },
  market: { app: 'Resale', icon: TrendingUp, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  career: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#4ADE80,#065F46)', openApp: 'career' },
  quest: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#4ADE80,#065F46)', openApp: 'career' },
  achievement: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#4ADE80,#065F46)', openApp: 'career' },
  auction: { app: 'Аукцион', icon: Gavel, bg: 'linear-gradient(145deg,#fbbf24,#b45309)', openApp: 'auction' },
  delivery: { app: 'Доставки', icon: Truck, bg: 'linear-gradient(145deg,#34d399,#047857)', openApp: 'delivery' },
  leader: { app: 'Лидеры', icon: Crown, bg: 'linear-gradient(145deg,#fcd34d,#92400e)', openApp: 'leaderboard' },
  system: { app: 'Система', icon: Info, bg: 'linear-gradient(145deg,#9ca3af,#4b5563)', openApp: 'settings' },
}

const clampX = (x: number) => Math.max(-150, Math.min(150, x))
const SWIPE_DELETE = 88 // порог смахивания, px

// Винительный падеж для кнопки «Открыть …»: Система → Систему
const APP_ACC: Record<string, string> = { Система: 'Систему' }
const accName = (app: string) => APP_ACC[app] ?? app

// Живые тики — для даты в шапке шторки.
function useClock(): Date | null {
  const ts = useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, 1000)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  )
  return ts ? new Date(ts) : null
}

export default function NotificationCenter({
  open,
  onClose,
  onOpenApp,
}: {
  open: boolean
  onClose: () => void
  onOpenApp: (app: AppKey) => void
}) {
  const notifications = useOS((s) => s.notifications)
  const markNotificationsRead = useOS((s) => s.markNotificationsRead)
  const removeNotification = useOS((s) => s.removeNotification)
  const clearNotifications = useOS((s) => s.clearNotifications)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; dx: number } | null>(null)
  const dragRef = useRef<{ id: string } | null>(null)
  const suppressClick = useRef(false)
  const now = useClock()

  // Группировка: непрочитанные сверху, затем разделитель «Ранее» и прочитанные
  const unreadItems = notifications.filter((n) => !n.readAt)
  const readItems = notifications.filter((n) => n.readAt)
  const unreadLabel =
    unreadItems.length === 1 ? '1 новое' : `${unreadItems.length} новых`

  const readAll = () => {
    markNotificationsRead()
    api.readNotifications().catch(() => {})
  }

  const clearAll = () => {
    if (notifications.length > 0) sound.swipe()
    clearNotifications()
    setExpandedId(null)
    api.clearNotifications().catch(() => {})
  }

  const dismiss = (id: string) => {
    if (expandedId === id) setExpandedId(null)
    sound.swipe()
    removeNotification(id)
    api.deleteNotification(id).catch(() => {})
  }

  const toggle = (id: string) => {
    if (suppressClick.current) return
    setExpandedId((cur) => (cur === id ? null : id))
  }

  // Свайп-удаление: карточка следует за пальцем, дальше порога — краснеет и удаляется
  const { onPointerDown: onCardPointerDown } = useDrag({
    onStart: (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.notifId ?? ''
      if (!id) return
      dragRef.current = { id }
      setDragging({ id, dx: 0 })
    },
    onMove: (dx) => {
      if (!dragRef.current) return
      setDragging({ id: dragRef.current.id, dx })
    },
    onEnd: (dx) => {
      const cur = dragRef.current
      dragRef.current = null
      setDragging(null)
      if (!cur) return
      if (Math.abs(dx) > 12) {
        suppressClick.current = true
        setTimeout(() => {
          suppressClick.current = false
        }, 90)
      }
      if (Math.abs(dx) > SWIPE_DELETE) dismiss(cur.id)
    },
  })

  // Карточка уведомления (одна и та же для непрочитанных и прочитанных)
  const renderCard = (n: NotificationDTO) => {
    const meta = KIND_APP[n.kind] ?? KIND_APP.system
    const AppIcon = meta.icon
    const unread = !n.readAt
    const expanded = expandedId === n.id
    const isDrag = dragging?.id === n.id
    const dx = isDrag ? clampX(dragging.dx) : 0
    const willDelete = isDrag && Math.abs(dx) > SWIPE_DELETE
    return (
      <li key={n.id}>
        <div
          role="button"
          tabIndex={open ? 0 : -1}
          aria-expanded={expanded}
          aria-label={`${meta.app}: ${n.title}. ${expanded ? 'Свернуть' : 'Развернуть'}. Смахните в сторону, чтобы удалить.`}
          data-notif-id={n.id}
          onPointerDown={onCardPointerDown}
          onClick={() => toggle(n.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggle(n.id)
            }
          }}
          style={{
            transform: isDrag ? `translateX(${dx}px)` : undefined,
            opacity: isDrag ? Math.max(0, 1 - Math.abs(dx) / 170) : undefined,
            touchAction: 'pan-y',
          }}
          className={`relative cursor-pointer touch-pan-y select-none overflow-hidden rounded-[24px] px-4 py-3.5 outline-none ring-1 transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-white/60 ${
            willDelete
              ? 'bg-red-500/30 ring-red-400/50'
              : `backdrop-blur-md ${unread ? 'bg-white/[0.09] ring-white/[0.07]' : 'bg-white/[0.04] ring-white/[0.04]'}`
          } ${expanded && !isDrag ? 'bg-white/[0.13]' : !isDrag && !willDelete ? 'active:bg-white/[0.09]' : ''}`}
        >
          {/* Цветной акцент слева у непрочитанных — цвет приложения, как у тостов */}
          {unread && !isDrag && (
            <span
              aria-hidden="true"
              className="absolute inset-y-2.5 left-0 w-1 rounded-full"
              style={{ background: meta.bg }}
            />
          )}
          <div className="flex items-center gap-2.5">
            {/* иконка приложения — скруглённый тайл, как на рабочем столе */}
            <span
              className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-[12px] text-white shadow-sm"
              style={{ background: meta.bg }}
            >
              <AppIcon className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-white/50">
                  {meta.app}
                </span>
                <span className="shrink-0 text-[11px] text-white/45">{timeAgo(n.createdAt)}</span>
              </div>
              <div className="truncate text-[13px] font-bold leading-tight text-white">{n.title}</div>
            </div>
            {unread && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-400" />}
          </div>

          <p className={`mt-1.5 pl-[46px] text-[13px] leading-snug text-white/70 ${expanded ? '' : 'line-clamp-2'}`}>
            {n.body}
          </p>

          {expanded && (
            <div className="mt-2.5 flex items-center gap-2 pl-[46px]">
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                  onOpenApp(meta.openApp)
                }}
                className="min-h-[44px] rounded-full bg-[#21A038] px-5 text-[13px] font-bold text-white outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                Открыть {accName(meta.app)}
              </button>
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className={`pointer-events-none absolute inset-0 z-45 ${open ? '' : 'invisible'}`}>
      {/* Затемнение-фон */}
      <button
        type="button"
        aria-label="Закрыть уведомления"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/55 transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'opacity-0'
        }`}
      />

      {/* Панель */}
      <section
        aria-label="Центр уведомлений"
        className={`pointer-events-auto absolute inset-x-0 top-0 flex max-h-[80%] flex-col rounded-b-[28px] bg-[#0a0d0b]/95 text-white shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          open ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        {/* мелкий хендл — как в шторке Android 16 */}
        <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-14 rounded-full bg-white/30" />

        {/* шапка: дата слева, справа — «прочитать всё», настройки, «Очистить» */}
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-white/85" suppressHydrationWarning>
              {now
                ? now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
                : '\u00A0'}
            </span>
            {unreadItems.length > 0 && (
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80">
                {unreadLabel}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={readAll}
              tabIndex={open ? 0 : -1}
              disabled={unreadItems.length === 0}
              aria-label="Отметить всё прочитанным"
              className="flex size-11 items-center justify-center rounded-full text-white/65 outline-none transition-colors duration-200 enabled:active:bg-white/10 enabled:hover:text-white disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <CheckCheck className="size-[18px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onOpenApp('settings')}
              tabIndex={open ? 0 : -1}
              aria-label="Открыть настройки"
              className="flex size-11 items-center justify-center rounded-full text-white/65 outline-none transition-colors duration-200 active:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Settings className="size-[18px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearAll}
              tabIndex={open ? 0 : -1}
              disabled={notifications.length === 0}
              className="flex h-11 items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 text-[13px] font-semibold text-white/85 outline-none transition-colors duration-200 enabled:active:bg-white/15 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Очистить
            </button>
            <button
              type="button"
              aria-label="Свернуть панель уведомлений"
              onClick={onClose}
              tabIndex={open ? 0 : -1}
              className="flex size-11 items-center justify-center rounded-full text-white/65 outline-none transition-colors duration-200 active:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <ChevronDown className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Медиа-виджет: что играет сейчас (глобальный плеер ОС) */}
        <NowPlayingShade onOpenApp={onOpenApp} />

        {/* Одноразовая подсказка: как убрать карточку из шторки */}
        {notifications.length > 0 && (
          <p className="px-5 pb-1 text-[11px] text-white/35">Смахните карточку, чтобы удалить</p>
        )}

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10">
            <div className="flex size-14 items-center justify-center rounded-[18px] bg-white/[0.06]">
              <Bell className="size-6 text-white/30" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm text-white/50">Пока пусто</p>
            <p className="mt-1 text-[11px] text-white/30">Здесь появятся сообщения и события</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-3 pt-1">
            {/* Сначала непрочитанные — как в шторке настоящего телефона */}
            {unreadItems.map((n) => renderCard(n))}
            {unreadItems.length > 0 && readItems.length > 0 && (
              <li aria-hidden="true" className="px-1 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">
                Ранее
              </li>
            )}
            {readItems.map((n) => renderCard(n))}
          </ul>
        )}

        {/* мелкий хендл-подпись внизу панели */}
        <span aria-hidden="true" className="mx-auto mb-2.5 mt-1 block h-1 w-14 rounded-full bg-white/25" />
      </section>
    </div>
  )
}
