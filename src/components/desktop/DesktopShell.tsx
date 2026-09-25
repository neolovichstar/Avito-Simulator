'use client'

// ПК-режим в стиле Windows 11: рабочий стол с обоями, панель задач,
// меню «Пуск», окна приложений, панель уведомлений, виджеты, экран блокировки.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  Bell, Lock, Power, Search, Wifi, BatteryMedium, Volume2, ChevronUp,
} from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { wallpaperClass } from '@/lib/wallpapers'
import { fmtMoney } from '@/lib/format'
import { APP_TILE, AppTileImage, HOME_GRID } from '@/components/os/app-logos'
import { api } from '@/lib/api'
import type { NotificationDTO } from '@/lib/types'
import WindowFrame, { type WindowState } from './WindowFrame'

function useClock(): Date | null {
  const ts = useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, 1000)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  )
  return ts ? new Date(ts) : null
}

const TASKBAR_H = 40

interface Props {
  locked: boolean
  onUnlock: () => void
  renderApp: (app: AppKey) => React.ReactNode
  theme: 'light' | 'dark'
}

export default function DesktopShell({ locked, onUnlock, renderApp, theme }: Props) {
  const session = useOS((s) => s.session)
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const online = useOS((s) => s.online)
  const notifications = useOS((s) => s.notifications)
  const unreadChats = useOS((s) => s.unreadChats)
  const wallpaper = useOS((s) => s.wallpaper)
  const widgets = useOS((s) => s.widgets)
  const openAppStore = useOS((s) => s.openApp)
  const setLocked = useOS((s) => s.setLocked)
  const markRead = useOS((s) => s.markNotificationsRead)

  const [wins, setWins] = useState<WindowState[]>([])
  const [topZ, setTopZ] = useState(10)
  const [startOpen, setStartOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [startQuery, setStartQuery] = useState('')
  const [questHint, setQuestHint] = useState<string | null>(null)
  const winId = useRef(0)
  const now = useClock()

  // Виджет «Задания» на рабочем столе
  useEffect(() => {
    api.career().then((c) => {
      const q = c.quests.find((x) => !x.claimed)
      if (q) setQuestHint(`${q.title} · ${Math.min(q.progress, q.target)}/${q.target}`)
    }).catch(() => {})
  }, [])

  const focusWin = useCallback((id: AppKey) => {
    setTopZ((z) => z + 1)
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z: topZ + 1, minimized: false } : w)))
  }, [topZ])

  const openWindow = useCallback((app: AppKey) => {
    setStartOpen(false)
    setNotifOpen(false)
    openAppStore(app)
    setWins((ws) => {
      const existing = ws.find((w) => w.id === app)
      if (existing) {
        return ws.map((w) => (w.id === app ? { ...w, z: topZ + 1, minimized: false } : w))
      }
      const maxW = Math.min(860, window.innerWidth - 280)
      const maxH = Math.min(620, window.innerHeight - 110)
      const w = Math.max(500, maxW)
      const h = Math.max(420, maxH)
      const n = winId.current++
      const x = Math.min(90 + n * 36, Math.max(40, window.innerWidth - w - 40))
      const y = Math.min(46 + n * 30, Math.max(20, window.innerHeight - h - 70))
      return [...ws, { id: app, x, y, w, h, z: topZ + 1, minimized: false, maximized: false }]
    })
    setTopZ((z) => z + 1)
  }, [topZ, openAppStore])

  const closeWindow = useCallback((app: AppKey) => {
    setWins((ws) => ws.filter((w) => w.id !== app))
  }, [])

  const patchWin = useCallback((app: AppKey, patch: Partial<WindowState>) => {
    setWins((ws) => ws.map((w) => (w.id === app ? { ...w, ...patch } : w)))
  }, [])

  const focusedId = useMemo(() => {
    const visible = wins.filter((w) => !w.minimized)
    if (visible.length === 0) return null
    return visible.reduce((a, b) => (a.z > b.z ? a : b)).id
  }, [wins])

  const unreadNotifications = notifications.filter((n) => !n.readAt).length
  const filteredApps = HOME_GRID.filter((a) =>
    APP_TILE[a].label.toLowerCase().includes(startQuery.trim().toLowerCase()),
  )

  // ---------- ЭКРАН БЛОКИРОВКИ ----------
  if (locked) {
    return (
      <div
        className={`fixed inset-0 z-[100] flex flex-col items-center justify-center ${wallpaperClass(wallpaper)}`}
        role="dialog"
        aria-label="Экран блокировки"
      >
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" aria-hidden />
        <div className="relative flex flex-col items-center">
          <p className="text-base font-light text-white/85" suppressHydrationWarning>
            {now ? now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) : '\u00A0'}
          </p>
          <p className="mt-1 text-6xl font-extralight tabular-nums text-white drop-shadow-lg" suppressHydrationWarning>
            {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
          </p>
          <button
            type="button"
            onClick={onUnlock}
            className="mt-8 flex h-10 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-[13px] font-medium text-white backdrop-blur-md outline-none transition hover:bg-white/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Lock className="size-3.5" aria-hidden /> Войти
          </button>
        </div>
      </div>
    )
  }

  // ---------- РАБОЧИЙ СТОЛ ----------
  return (
    <div
      className={`fixed inset-0 select-none overflow-hidden ${wallpaperClass(wallpaper)}`}
      role="region"
      aria-label="Рабочий стол"
    >
      {/* лёгкое затемнение для читаемости виджетов */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20" aria-hidden />

      {/* виджеты справа (стеклянные карточки как в Win11) */}
      <div className="absolute right-4 top-4 z-[5] flex w-52 flex-col gap-2">
        {widgets.includes('clock') && (
          <div className="rounded-xl border border-white/15 bg-black/35 p-3 backdrop-blur-xl">
            <p className="text-2xl font-light tabular-nums text-white" suppressHydrationWarning>
              {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
            </p>
            <p className="mt-0.5 text-[11px] text-white/70" suppressHydrationWarning>
              {now ? now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) : '\u00A0'}
            </p>
          </div>
        )}
        {widgets.includes('online') && (
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/35 p-3 backdrop-blur-xl">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[13px] font-medium text-white">Сейчас онлайн: <span className="font-bold tabular-nums">{online}</span></span>
          </div>
        )}
        {widgets.includes('quest') && (
          <button
            type="button"
            onClick={() => openWindow('career')}
            className="rounded-xl border border-white/15 bg-black/35 p-3 text-left backdrop-blur-xl transition hover:bg-black/45 active:scale-[0.98]"
          >
            <p className="text-[9px] uppercase tracking-wider text-white/60">Задания</p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-white">{questHint ?? 'Все задания выполнены'}</p>
          </button>
        )}
        {widgets.includes('delivery') && (
          <button
            type="button"
            onClick={() => openWindow('delivery')}
            className="rounded-xl border border-white/15 bg-black/35 p-3 text-left backdrop-blur-xl transition hover:bg-black/45 active:scale-[0.98]"
          >
            <p className="text-[9px] uppercase tracking-wider text-white/60">Доставка</p>
            <p className="mt-0.5 text-[13px] font-medium text-white">Открыть список посылок</p>
          </button>
        )}
      </div>

      {/* окна приложений */}
      {wins.map((w) => (
        <WindowFrame
          key={w.id}
          win={w}
          focused={focusedId === w.id}
          onFocus={() => focusWin(w.id)}
          onClose={() => closeWindow(w.id)}
          onMinimize={() => patchWin(w.id, { minimized: true })}
          onToggleMax={() => patchWin(w.id, { maximized: !w.maximized })}
          onChange={(patch) => patchWin(w.id, patch)}
        >
          <div className={`h-full w-full overflow-hidden ${theme === 'dark' ? 'theme-dark' : ''}`}>
            {renderApp(w.id)}
          </div>
        </WindowFrame>
      ))}

      {/* МЕНЮ ПУСК */}
      {startOpen && (
        <>
          <button aria-label="Закрыть меню Пуск" className="fixed inset-0 z-[60] cursor-default" onClick={() => setStartOpen(false)} />
          <div
            className="fixed left-1/2 z-[61] w-[440px] -translate-x-1/2 rounded-xl border border-white/15 p-4 shadow-2xl"
            style={{ bottom: TASKBAR_H + 10, background: 'rgba(28,30,38,0.88)', backdropFilter: 'blur(28px)' }}
            role="menu"
            aria-label="Меню Пуск"
          >
            <div className="mx-auto flex h-8 max-w-sm items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3">
              <Search className="size-4 text-white/50" aria-hidden />
              <input
                value={startQuery}
                onChange={(e) => setStartQuery(e.target.value)}
                placeholder="Поиск приложений"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                aria-label="Поиск приложений"
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-white/70">Все приложения</p>
              <button
                onClick={() => setLocked(true)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <Power className="size-3" aria-hidden /> Блокировка
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-6 gap-0.5">
              {filteredApps.map((app) => (
                <button
                  key={app}
                  onClick={() => openWindow(app)}
                  className="flex flex-col items-center gap-1 rounded-lg px-0.5 py-2 transition hover:bg-white/10"
                  role="menuitem"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg shadow ring-1 ring-black/20">
                    <AppTileImage app={app} className="h-full w-full rounded-lg" />
                  </span>
                  <span className="max-w-full truncate text-[9px] text-white/85">{APP_TILE[app].label}</span>
                </button>
              ))}
            </div>
            {session && (
              <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2.5">
                {session.photoUrl ? (
                  <img loading="lazy" decoding="async" src={session.photoUrl} alt="" className="size-7 rounded-full object-cover"/>
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-full bg-[#16A34A] text-[11px] font-bold text-white">
                    {(session.displayName ?? 'И')[0]}
                  </span>
                )}
                <span className="text-[13px] font-medium text-white">{session.displayName}</span>
                <span className="ml-auto text-[11px] text-white/50">{fmtMoney(session.balance)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* ПАНЕЛЬ УВЕДОМЛЕНИЙ + КАЛЕНДАРЬ */}
      {notifOpen && (
        <>
          <button aria-label="Закрыть центр уведомлений" className="fixed inset-0 z-[60] cursor-default" onClick={() => setNotifOpen(false)} />
          <div
            className="fixed right-3 z-[61] flex w-80 flex-col overflow-hidden rounded-xl border border-white/15 shadow-2xl"
            style={{ bottom: TASKBAR_H + 10, maxHeight: 'min(520px, 68vh)', background: 'rgba(28,30,38,0.9)', backdropFilter: 'blur(28px)' }}
            role="dialog"
            aria-label="Центр уведомлений"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-semibold text-white">Уведомления</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { markRead(); void api.readNotifications().catch(() => {}) }}
                  className="rounded-md px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  Прочитать все
                </button>
                <button onClick={() => setNotifOpen(false)} className="rounded-md px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white">
                  Закрыть
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {notifications.length === 0 ? (
                <p className="py-10 text-center text-xs text-white/40">Пока пусто — всё спокойно</p>
              ) : (
                notifications.slice(0, 30).map((n: NotificationDTO) => (
                  <div
                    key={n.id}
                    className={`mb-1.5 rounded-lg border p-2.5 ${n.readAt ? 'border-white/5 bg-white/[0.03]' : 'border-[#16A34A]/30 bg-[#16A34A]/10'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{n.title}</span>
                      {!n.readAt && <span className="size-1.5 rounded-full bg-[#16A34A]" aria-label="Непрочитано" />}
                      <span className="ml-auto text-[10px] text-white/40" suppressHydrationWarning>
                        {new Date(n.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/70">{n.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ПАНЕЛЬ ЗАДАЧ */}
      <div
        className="fixed inset-x-0 bottom-0 z-[62] flex items-center justify-center border-t border-white/10"
        style={{ height: TASKBAR_H, background: 'rgba(20,22,28,0.82)', backdropFilter: 'blur(28px)' }}
        role="toolbar"
        aria-label="Панель задач"
      >
        <div className="flex items-center gap-1">
          <button
            aria-label="Пуск"
            aria-expanded={startOpen}
            onClick={() => { setStartOpen((v) => !v); setNotifOpen(false) }}
            className={`group relative flex size-8 items-center justify-center rounded-md transition hover:bg-white/10 ${startOpen ? 'bg-white/15' : ''}`}
          >
            {/* логотип Пуск: 4 квадратика */}
            <span className="grid grid-cols-2 gap-[2.5px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="size-[6px] rounded-[2px] bg-[#16A34A] transition group-hover:bg-[#4ADE80]" />
              ))}
            </span>
          </button>
          {HOME_GRID.map((app) => {
            const win = wins.find((w) => w.id === app)
            const active = focusedId === app && win && !win.minimized
            const unreadBadge = app === 'avito' ? unreadChats : 0
            return (
              <button
                key={app}
                aria-label={APP_TILE[app].label}
                title={APP_TILE[app].label}
                onClick={() => {
                  if (win && active) patchWin(app, { minimized: true })
                  else openWindow(app)
                }}
                className={`relative flex size-8 items-center justify-center rounded-md transition hover:bg-white/10 ${active ? 'bg-white/15' : ''}`}
              >
                <span className="flex size-6 items-center justify-center overflow-hidden rounded-[7px] shadow ring-1 ring-black/20">
                  <AppTileImage app={app} className="h-full w-full" />
                </span>
                {win && (
                  <span
                    className={`absolute bottom-0 h-[2.5px] rounded-full transition-all ${active ? 'w-3 bg-[#16A34A]' : 'w-1 bg-white/40'}`}
                    aria-hidden
                  />
                )}
                {unreadBadge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#04E061] px-0.5 text-[8px] font-bold text-white">
                    {unreadBadge > 9 ? '9+' : unreadBadge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* трей */}
        <div className="absolute right-2 flex items-center gap-1">
          <button
            onClick={() => { setNotifOpen((v) => !v); setStartOpen(false) }}
            aria-label="Открыть центр уведомлений"
            aria-expanded={notifOpen}
            className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-white/85 transition hover:bg-white/10"
          >
            <span className="relative">
              <ChevronUp className="size-3" aria-hidden />
              {unreadNotifications > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-[#16A34A] px-0.5 text-[7px] font-bold text-white">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </span>
            <Wifi className="size-3.5" aria-hidden />
            <Volume2 className="size-3.5" aria-hidden />
            <span className="flex items-center gap-0.5 text-[11px] tabular-nums">
              <BatteryMedium className="size-3.5" aria-hidden />
              {battery}%
            </span>
            <span className="flex flex-col items-end leading-tight" suppressHydrationWarning>
              <span className="text-[11px] font-medium tabular-nums">
                {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
              </span>
              <span className="text-[9px] text-white/60 tabular-nums">
                {now ? now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '\u00A0'}
              </span>
            </span>
            {unreadNotifications > 0 && <Bell className="size-3.5 text-[#4ADE80]" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  )
}
