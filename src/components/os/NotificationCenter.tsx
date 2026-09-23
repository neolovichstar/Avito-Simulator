'use client'

import {
  ChevronUp,
  Info,
  MessageSquare,
  Receipt,
  ShoppingBag,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'

const KIND_ICON: Record<string, LucideIcon> = {
  deal: ShoppingBag,
  message: MessageSquare,
  tax: Receipt,
  market: TrendingUp,
  system: Info,
}

export default function NotificationCenter({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const notifications = useOS((s) => s.notifications)
  const markNotificationsRead = useOS((s) => s.markNotificationsRead)

  const readAll = () => {
    markNotificationsRead()
    // fire-and-forget
    api.readNotifications().catch(() => {})
  }

  return (
    <div className={`pointer-events-none absolute inset-0 z-45 ${open ? '' : 'invisible'}`}>
      {/* Затемнение-фон */}
      <button
        type="button"
        aria-label="Закрыть уведомления"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'opacity-0'
        }`}
      />

      {/* Панель */}
      <section
        aria-label="Центр уведомлений"
        className={`pointer-events-auto absolute inset-x-0 top-0 flex max-h-[75%] flex-col rounded-b-3xl bg-black/85 text-white shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/90">
            Уведомления
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={readAll}
              tabIndex={open ? 0 : -1}
              className="rounded-full px-3 py-1.5 text-xs text-blue-400 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-400"
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
              <ChevronUp className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-white/50">Пока пусто</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto pb-4">
            {notifications.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? Info
              const unread = !n.readAt
              return (
                <li
                  key={n.id}
                  className={`relative flex gap-3 px-5 py-3 ${unread ? 'bg-white/5' : ''}`}
                >
                  {unread && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-9 w-1 -translate-y-1/2 rounded-r bg-blue-500"
                    />
                  )}
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Icon className="h-4.5 w-4.5 text-white/90" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold text-white">{n.title}</span>
                      <span className="shrink-0 text-[11px] text-white/50">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-white/70">{n.body}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
