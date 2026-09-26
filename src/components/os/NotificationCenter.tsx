'use client'

// Уведомления в духе Android 17 (Material 3 Expressive):
//  • NotificationList — общий M3-список (используется системной шторкой Shade
//    и внутренней панелью приложения Resale);
//  • NotificationCenter (default) — автономная панель-оверлей для Resale:
//    скрим + панель сверху со списком уведомлений.
// Карточки: скругление 26px, тайл-иконка приложения, тап разворачивает,
// свайп в сторону удаляет (и на сервере тоже).
import { useRef, useState, useSyncExternalStore } from 'react'
import { CheckCheck, ChevronDown, Trash2 } from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { useDrag } from '@/lib/use-swipe'
import { sound } from '@/lib/sound'
import type { NotificationDTO } from '@/lib/types'
import { KIND_APP, accName, type NotifApp } from './notif-meta'

const clampX = (x: number) => Math.max(-150, Math.min(150, x))
const SWIPE_DELETE = 88 // порог смахивания, px

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

// ─── Карточка уведомления (M3 Expressive) ────────────────────────────────────
// Одна и та же для непрочитанных и прочитанных; непрочитанные — ярче + точка.
function NotifCard({
  n, open, expanded, isDrag, dx, willDelete,
  onToggle, onPointerDown, onOpen,
}: {
  n: NotificationDTO
  open: boolean
  expanded: boolean
  isDrag: boolean
  dx: number
  willDelete: boolean
  onToggle: () => void
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onOpen: (app: AppKey) => void
}) {
  const meta: NotifApp = KIND_APP[n.kind] ?? KIND_APP.system
  const AppIcon = meta.icon
  const unread = !n.readAt
  return (
    <div
      role="button"
      tabIndex={open ? 0 : -1}
      aria-expanded={expanded}
      aria-label={`${meta.app}: ${n.title}. ${expanded ? 'Свернуть' : 'Развернуть'}. Смахните в сторону, чтобы удалить.`}
      data-notif-id={n.id}
      onPointerDown={onPointerDown}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      style={{
        transform: isDrag ? `translateX(${dx}px)` : undefined,
        opacity: isDrag ? Math.max(0, 1 - Math.abs(dx) / 170) : undefined,
        touchAction: 'pan-y',
      }}
      className={`relative cursor-pointer touch-pan-y select-none overflow-hidden rounded-[26px] px-4 py-3.5 outline-none ring-1 transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-white/60 ${
        willDelete
          ? 'bg-red-500/30 ring-red-400/50'
          : expanded
            ? 'bg-white/[0.13] ring-white/[0.09]'
            : unread
              ? 'bg-white/[0.09] ring-white/[0.07]'
              : 'bg-white/[0.04] ring-white/[0.04]'
      } ${!isDrag && !willDelete ? 'active:bg-white/[0.1]' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* иконка приложения — скруглённый тайл, как на рабочем столе */}
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-[12px] text-white shadow-sm"
          style={{ background: meta.bg }}
        >
          <AppIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-white/50">
              {meta.app}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-white/45">{timeAgo(n.createdAt)}</span>
          </div>
          <div className="truncate text-[13.5px] font-bold leading-snug text-white">{n.title}</div>
          <p className={`mt-0.5 text-[12.5px] leading-snug text-white/70 ${expanded ? '' : 'line-clamp-2'}`}>
            {n.body}
          </p>
        </div>
        {unread && <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-emerald-400" />}
      </div>

      {expanded && (
        <div className="mt-2.5 flex items-center gap-2 pl-12">
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(meta.openApp)
            }}
            className="min-h-[44px] rounded-full bg-[#21A038] px-5 text-[13px] font-bold text-white outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Открыть {accName(meta.app)}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Общий список уведомлений ────────────────────────────────────────────────
export function NotificationList({
  onOpenApp,
  interactive = true,
}: {
  onOpenApp: (app: AppKey) => void
  /** false — список только для чтения (внутри свёрнутых состояний) */
  interactive?: boolean
}) {
  const notifications = useOS((s) => s.notifications)
  const markNotificationsRead = useOS((s) => s.markNotificationsRead)
  const removeNotification = useOS((s) => s.removeNotification)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; dx: number } | null>(null)
  const dragRef = useRef<{ id: string } | null>(null)
  const suppressClick = useRef(false)

  const unreadItems = notifications.filter((n) => !n.readAt)
  const readItems = notifications.filter((n) => n.readAt)

  const clearAll = () => {
    if (notifications.length > 0) sound.swipe()
    useOS.getState().clearNotifications()
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

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center px-5 py-8">
        <img
          src="/img/empty/notify.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-24"
        />
        <p className="mt-2 text-sm text-white/50">Пока пусто</p>
        <p className="mt-1 text-[11px] text-white/30">Здесь появятся сообщения и события</p>
      </div>
    )
  }

  return (
    <>
      {/* шапка действий: «прочитать всё» + «очистить» */}
      <div className="flex items-center justify-between px-5 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          {unreadItems.length > 0
            ? `${unreadItems.length === 1 ? '1 новое' : `${unreadItems.length} новых`}`
            : 'Прочитано'}
        </span>
        {interactive && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                markNotificationsRead()
                api.readNotifications().catch(() => {})
              }}
              disabled={unreadItems.length === 0}
              aria-label="Отметить всё прочитанным"
              className="flex size-9 items-center justify-center rounded-full text-white/65 outline-none transition-colors duration-200 enabled:active:bg-white/10 enabled:hover:text-white disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <CheckCheck className="size-[17px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearAll}
              aria-label="Очистить уведомления"
              className="flex size-9 items-center justify-center rounded-full text-white/65 outline-none transition-colors duration-200 enabled:active:bg-white/10 enabled:hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Trash2 className="size-[17px]" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <ul className="space-y-2.5 px-4">
        {/* Сначала непрочитанные — как в шторке настоящего телефона */}
        {unreadItems.map((n) => (
          <li key={n.id}>
            <NotifCard
              n={n}
              open={interactive}
              expanded={expandedId === n.id}
              isDrag={dragging?.id === n.id}
              dx={dragging?.id === n.id ? clampX(dragging.dx) : 0}
              willDelete={dragging?.id === n.id && Math.abs(clampX(dragging.dx)) > SWIPE_DELETE}
              onToggle={() => toggle(n.id)}
              onPointerDown={onCardPointerDown}
              onOpen={(a) => onOpenApp(a)}
            />
          </li>
        ))}
        {unreadItems.length > 0 && readItems.length > 0 && (
          <li aria-hidden="true" className="px-1 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">
            Ранее
          </li>
        )}
        {readItems.map((n) => (
          <li key={n.id}>
            <NotifCard
              n={n}
              open={interactive}
              expanded={expandedId === n.id}
              isDrag={dragging?.id === n.id}
              dx={dragging?.id === n.id ? clampX(dragging.dx) : 0}
              willDelete={dragging?.id === n.id && Math.abs(clampX(dragging.dx)) > SWIPE_DELETE}
              onToggle={() => toggle(n.id)}
              onPointerDown={onCardPointerDown}
              onOpen={(a) => onOpenApp(a)}
            />
          </li>
        ))}
      </ul>
    </>
  )
}

// ─── Автономная панель (внутри приложения Resale) ────────────────────────────
export default function NotificationCenter({
  open,
  onClose,
  onOpenApp,
}: {
  open: boolean
  onClose: () => void
  onOpenApp: (app: AppKey) => void
}) {
  const now = useClock()

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
        aria-label="Уведомления"
        className={`pointer-events-auto absolute inset-x-0 top-0 flex max-h-[80%] flex-col rounded-b-[28px] bg-[#0B0F0D]/95 text-white shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          open ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        {/* шапка: дата слева, свернуть справа */}
        <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[15px] font-bold tracking-[-0.01em] text-white" suppressHydrationWarning>
              Уведомления
            </span>
            <span className="truncate text-[12px] text-white/45" suppressHydrationWarning>
              {now ? now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '\u00A0'}
            </span>
          </div>
          <button
            type="button"
            aria-label="Свернуть панель уведомлений"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            className="flex size-10 items-center justify-center rounded-full bg-white/[0.08] text-white/80 outline-none transition-colors duration-200 active:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ChevronDown className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-2 [scrollbar-width:none]">
          <NotificationList onOpenApp={(a) => { onClose(); onOpenApp(a) }} />
        </div>

        {/* хендл */}
        <span aria-hidden="true" className="mx-auto mb-2.5 mt-1 block h-1 w-14 rounded-full bg-white/25" />
      </section>
    </div>
  )
}
