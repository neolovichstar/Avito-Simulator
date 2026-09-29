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
  n, open, expanded, willDelete, tone = 'dark',
  onToggle, onPointerDown, onOpen,
}: {
  n: NotificationDTO
  open: boolean
  expanded: boolean
  willDelete: boolean
  /** 'dark' — белые тексты на стекле, 'light' — графит на белой карточке */
  tone?: 'dark' | 'light'
  onToggle: () => void
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onOpen: (app: AppKey) => void
}) {
  const meta: NotifApp = KIND_APP[n.kind] ?? KIND_APP.system
  const AppIcon = meta.icon
  const unread = !n.readAt
  // 55-a: единая стеклянная система (матовое стекло + те же тени, что на замке)
  const T = tone === 'light'
    ? {
        ring: 'focus-visible:ring-black/30',
        card: willDelete
          ? 'bg-red-100/90 ring-1 ring-red-300'
          : expanded
            ? 'bg-white/90 ring-1 ring-black/[0.08] backdrop-blur-2xl'
            : unread
              ? 'bg-white/75 ring-1 ring-black/[0.05] shadow-[0_8px_24px_rgba(15,15,20,0.08)] backdrop-blur-2xl'
              : 'bg-white/50 ring-1 ring-black/[0.04] backdrop-blur-xl',
        active: 'active:bg-neutral-100',
        app: 'text-neutral-400',
        time: 'text-neutral-400',
        title: 'text-neutral-900',
        body: 'text-neutral-600',
        openBtn: 'bg-neutral-900 text-white focus-visible:ring-neutral-300',
      }
    : {
        ring: 'focus-visible:ring-white/60',
        card: willDelete
          ? 'bg-red-500/30 ring-1 ring-red-400/50'
          : expanded
            ? 'bg-white/[0.14] ring-1 ring-white/[0.16] backdrop-blur-xl'
            : unread
              ? 'bg-[#1B1D22]/[0.78] ring-1 ring-white/[0.12] shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl'
              : 'bg-white/[0.05] ring-1 ring-white/[0.08] backdrop-blur-md',
        active: 'active:bg-white/[0.1]',
        app: 'text-white/50',
        time: 'text-white/45',
        title: 'text-white',
        body: 'text-white/70',
        openBtn: 'bg-[#21A038] text-white focus-visible:ring-emerald-300',
      }
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
        // transform/opacity во время свайпа пишутся напрямую в DOM
        // (NotificationList.onMove) — здесь их не трогаем, чтобы React
        // не затирал императивные стили при ре-рендере
        touchAction: 'pan-y',
      }}
      className={`relative cursor-pointer touch-pan-y select-none overflow-hidden rounded-[24px] px-4 py-3.5 outline-none ring-1 transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 ${T.ring} ${T.card} ${
        !willDelete ? T.active : ''
      }`}
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
            <span className={`truncate text-[10px] font-bold uppercase tracking-[0.08em] ${T.app}`}>
              {meta.app}
            </span>
            <span className={`shrink-0 text-[11px] tabular-nums ${T.time}`}>{timeAgo(n.createdAt)}</span>
          </div>
          <div className={`truncate text-[13.5px] font-bold leading-snug ${T.title}`}>{n.title}</div>
          <p className={`mt-0.5 text-[12.5px] leading-snug ${T.body} ${expanded ? '' : 'line-clamp-2'}`}>
            {n.body}
          </p>
        </div>
        {unread && <span aria-hidden="true" className={`mt-1 size-2 shrink-0 rounded-full ${tone === "light" ? "bg-emerald-500" : "bg-emerald-400"}`} />}
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
            className={`min-h-[44px] rounded-full px-5 text-[13px] font-bold outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 ${T.openBtn}`}
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
  tone = 'dark',
}: {
  onOpenApp: (app: AppKey) => void
  /** false — список только для чтения (внутри свёрнутых состояний) */
  interactive?: boolean
  /** 'dark' — стиль для тёмных панелей, 'light' — для светлого центра управления */
  tone?: 'dark' | 'light'
}) {
  const notifications = useOS((s) => s.notifications)
  const markNotificationsRead = useOS((s) => s.markNotificationsRead)
  const removeNotification = useOS((s) => s.removeNotification)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Свайп-удаление без ре-рендеров на каждый кадр: карточка следует за пальцем
  // через прямую запись transform/opacity в DOM; React-состояние — только
  // «перешли порог удаления» (краснеет — 1-2 ре-рендера на жест).
  const [willDeleteId, setWillDeleteId] = useState<string | null>(null)
  const willDeleteRef = useRef(false)
  const dragRef = useRef<{ id: string; el: HTMLElement } | null>(null)
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
      const el = e.currentTarget as HTMLElement
      const id = el.dataset.notifId ?? ''
      if (!id) return
      dragRef.current = { id, el }
      willDeleteRef.current = false
      el.style.willChange = 'transform, opacity'
    },
    onMove: (dx) => {
      const cur = dragRef.current
      if (!cur) return
      const x = clampX(dx)
      cur.el.style.transform = `translateX(${x}px)`
      cur.el.style.opacity = String(Math.max(0, 1 - Math.abs(x) / 170))
      const over = Math.abs(x) > SWIPE_DELETE
      if (over !== willDeleteRef.current) {
        willDeleteRef.current = over
        setWillDeleteId(over ? cur.id : null)
      }
    },
    onEnd: (dx, _dy, fling) => {
      const cur = dragRef.current
      dragRef.current = null
      if (!cur) return
      // плавный возврат/затухание вместо мгновенного прыжка
      cur.el.style.willChange = ''
      cur.el.style.transition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease'
      cur.el.style.transform = ''
      cur.el.style.opacity = ''
      window.setTimeout(() => {
        cur.el.style.transition = ''
      }, 260)
      if (willDeleteRef.current) {
        willDeleteRef.current = false
        setWillDeleteId(null)
      }
      const x = Math.abs(clampX(dx))
      if (x > 12 || Math.abs(fling.vx) > 0.5) {
        suppressClick.current = true
        setTimeout(() => {
          suppressClick.current = false
        }, 90)
      }
      // порог дистанции ИЛИ короткий резкий флик в сторону
      if (x > SWIPE_DELETE || (x > 40 && Math.abs(fling.vx) > 0.6)) dismiss(cur.id)
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
        <p className={`mt-2 text-sm ${tone === 'light' ? 'text-neutral-500' : 'text-white/50'}`}>Пока пусто</p>
        <p className={`mt-1 text-[11px] ${tone === 'light' ? 'text-neutral-400' : 'text-white/30'}`}>Здесь появятся сообщения и события</p>
      </div>
    )
  }

  return (
    <>
      {/* шапка действий: «прочитать всё» + «очистить» */}
      <div className="flex items-center justify-between px-5 pb-1.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${tone === "light" ? "text-neutral-400" : "text-white/40"}`}>
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
              className={`flex size-9 items-center justify-center rounded-full outline-none transition-colors duration-200 disabled:opacity-30 focus-visible:ring-2 ${tone === "light" ? "text-neutral-500 enabled:active:bg-black/5 enabled:hover:text-neutral-800 focus-visible:ring-black/30" : "text-white/65 enabled:active:bg-white/10 enabled:hover:text-white focus-visible:ring-white/70"}`}
            >
              <CheckCheck className="size-[17px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearAll}
              aria-label="Очистить уведомления"
              className={`flex size-9 items-center justify-center rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 ${tone === "light" ? "text-neutral-500 enabled:active:bg-black/5 enabled:hover:text-neutral-800 focus-visible:ring-black/30" : "text-white/65 enabled:active:bg-white/10 enabled:hover:text-white focus-visible:ring-white/70"}`}
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
              willDelete={willDeleteId === n.id}
              tone={tone}
              onToggle={() => toggle(n.id)}
              onPointerDown={onCardPointerDown}
              onOpen={(a) => onOpenApp(a)}
            />
          </li>
        ))}
        {unreadItems.length > 0 && readItems.length > 0 && (
          <li aria-hidden="true" className={`px-1 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider ${tone === "light" ? "text-neutral-400" : "text-white/35"}`}>
            Ранее
          </li>
        )}
        {readItems.map((n) => (
          <li key={n.id}>
            <NotifCard
              n={n}
              open={interactive}
              expanded={expandedId === n.id}
              willDelete={willDeleteId === n.id}
              tone={tone}
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
        className={`pointer-events-auto absolute inset-x-0 top-0 flex max-h-[80%] flex-col rounded-b-[26px] bg-[#0B0F0D]/95 text-white shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
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
