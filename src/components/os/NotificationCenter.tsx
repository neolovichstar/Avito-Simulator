'use client'

// Уведомления как в настоящем телефоне: иконка приложения, имя приложения,
// заголовок, текст. Тап разворачивает карточку — видно весь текст и кнопку «Открыть».
// Карточку можно смахнуть в сторону — она удалится (и на сервере тоже).
import { useRef, useState } from 'react'
import {
  Bell, ChevronDown, ChevronUp, Crown, Gavel, Info, MessageSquare, Receipt,
  ShoppingBag, Trash2, TrendingUp, Truck, Trophy, type LucideIcon,
} from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { useDrag } from '@/lib/use-swipe'
import { sound } from '@/lib/sound'

interface NotifApp {
  app: string
  icon: LucideIcon
  bg: string
  openApp: AppKey
}

const KIND_APP: Record<string, NotifApp> = {
  deal: { app: 'Сделка', icon: ShoppingBag, bg: 'linear-gradient(145deg,#B37BF5,#7C3AED)', openApp: 'avito' },
  message: { app: 'Сделка', icon: MessageSquare, bg: 'linear-gradient(145deg,#B37BF5,#7C3AED)', openApp: 'avito' },
  tax: { app: 'Налоги', icon: Receipt, bg: 'linear-gradient(145deg,#4a5568,#2d3748)', openApp: 'taxes' },
  market: { app: 'Сделка', icon: TrendingUp, bg: 'linear-gradient(145deg,#B37BF5,#7C3AED)', openApp: 'avito' },
  career: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#B37BF5,#5B21B6)', openApp: 'career' },
  quest: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#B37BF5,#5B21B6)', openApp: 'career' },
  achievement: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#B37BF5,#5B21B6)', openApp: 'career' },
  auction: { app: 'Аукцион', icon: Gavel, bg: 'linear-gradient(145deg,#fbbf24,#b45309)', openApp: 'auction' },
  delivery: { app: 'Доставки', icon: Truck, bg: 'linear-gradient(145deg,#34d399,#047857)', openApp: 'delivery' },
  leader: { app: 'Лидеры', icon: Crown, bg: 'linear-gradient(145deg,#fcd34d,#92400e)', openApp: 'leaderboard' },
  system: { app: 'Система', icon: Info, bg: 'linear-gradient(145deg,#9ca3af,#4b5563)', openApp: 'settings' },
}

const clampX = (x: number) => Math.max(-150, Math.min(150, x))
const SWIPE_DELETE = 88 // порог смахивания, px

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
        className={`pointer-events-auto absolute inset-x-0 top-0 flex max-h-[78%] flex-col rounded-b-[2rem] bg-neutral-900/92 text-white shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/90">
            <Bell className="size-4" aria-hidden="true" />
            Уведомления
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={clearAll}
              tabIndex={open ? 0 : -1}
              disabled={notifications.length === 0}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-white/70 outline-none transition-colors enabled:active:bg-white/10 enabled:hover:text-white disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Очистить
            </button>
            <button
              type="button"
              onClick={readAll}
              tabIndex={open ? 0 : -1}
              className="rounded-full px-3 py-1.5 text-xs text-sky-400 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Прочитать всё
            </button>
            <button
              type="button"
              aria-label="Свернуть панель уведомлений"
              onClick={onClose}
              tabIndex={open ? 0 : -1}
              className="rounded-full p-1.5 text-white/70 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <ChevronDown className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white/5">
              <Bell className="size-6 text-white/30" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm text-white/50">Пока пусто</p>
            <p className="mt-1 text-[11px] text-white/30">Здесь появятся сообщения и события</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-5 pt-1">
            {notifications.map((n) => {
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
                    className={`cursor-pointer touch-pan-y select-none rounded-2xl px-3.5 py-3 outline-none transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-white/60 ${
                      willDelete ? 'bg-red-500/30 ring-1 ring-red-400/50' : unread ? 'bg-white/10' : 'bg-white/[0.045]'
                    } ${expanded && !isDrag ? 'bg-white/[0.13]' : !isDrag && !willDelete ? 'active:bg-white/[0.09]' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* иконка приложения — квадрат с радиусом, как на рабочем столе */}
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-[0.7rem] text-white shadow-sm"
                        style={{ background: meta.bg }}
                      >
                        <AppIcon className="size-4.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-white/55">
                            {meta.app}
                          </span>
                          <span className="shrink-0 text-[11px] text-white/45">{timeAgo(n.createdAt)}</span>
                        </div>
                        <div className="truncate text-[13px] font-bold leading-tight text-white">{n.title}</div>
                      </div>
                      {unread && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-sky-400" />}
                    </div>

                    <p className={`mt-1.5 pl-[46px] text-[13px] leading-snug text-white/75 ${expanded ? '' : 'line-clamp-2'}`}>
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
                          className="h-9 rounded-full bg-white px-4 text-xs font-bold text-neutral-900 outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
                        >
                          Открыть {meta.app}
                        </button>
                        <span className="flex items-center gap-1 text-[11px] text-white/45">
                          {expanded ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
                          {expanded ? 'Свернуть' : 'Развернуть'}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
            <li aria-hidden="true" className="pt-1 text-center text-[11px] text-white/30">
              Смахните карточку в сторону, чтобы удалить
            </li>
          </ul>
        )}
      </section>
    </div>
  )
}
