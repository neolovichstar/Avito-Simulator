'use client'

import { create } from 'zustand'
import type { SessionUser, NotificationDTO } from '@/lib/types'
import { levelFromXp } from '@/lib/economy'
import { sound } from '@/lib/sound'

export type AppKey = 'avito' | 'bank' | 'taxes' | 'browser' | 'settings' | 'repair' | 'auction' | 'career' | 'delivery' | 'leaderboard'

// Виджеты домашнего экрана / рабочего стола ПК
export type WidgetKey = 'clock' | 'wallet' | 'online' | 'quest' | 'delivery'
export const ALL_WIDGETS: WidgetKey[] = ['clock', 'wallet', 'online', 'quest', 'delivery']
export const WIDGET_LABEL: Record<WidgetKey, string> = {
  clock: 'Часы и дата',
  wallet: 'Кошелёк',
  online: 'Онлайн',
  quest: 'Задания',
  delivery: 'Доставки',
}

interface OSState {
  booted: boolean
  locked: boolean
  session: SessionUser | null
  sessionLoading: boolean
  currentApp: AppKey | null
  openApps: AppKey[] // история открытых приложений (для recents)
  battery: number
  charging: boolean
  online: number
  notifications: NotificationDTO[]
  unreadChats: number
  toastQueue: { id: number; title: string; body: string }[]
  dnd: boolean // «Не беспокоить»: тосты не всплывают, уведомления копятся в центре
  flashlight: boolean
  brightness: number // 0.4..1
  theme: 'light' | 'dark'
  wallpaper: string // id из реестра обоев (src/lib/wallpapers.ts)
  widgets: WidgetKey[] // какие виджеты показывать

  setBooted: (v: boolean) => void
  setLocked: (v: boolean) => void
  setSession: (u: SessionUser | null) => void
  setSessionLoading: (v: boolean) => void
  openApp: (app: AppKey) => void
  closeApp: () => void
  goHome: () => void
  dismissApp: (app: AppKey) => void // убрать приложение из недавних (свайп в recents)
  setBattery: (v: number) => void
  setCharging: (v: boolean) => void
  setOnline: (n: number) => void
  setNotifications: (n: NotificationDTO[]) => void
  addNotification: (n: NotificationDTO) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  markNotificationsRead: () => void
  setUnreadChats: (n: number) => void
  pushToast: (title: string, body: string) => void
  dropToast: (id: number) => void
  setDnd: (v: boolean) => void
  setFlashlight: (v: boolean) => void
  setBrightness: (v: number) => void
  setTheme: (t: 'light' | 'dark') => void
  toggleTheme: () => void
  setWallpaper: (id: string) => void
  setWidgets: (w: WidgetKey[]) => void
  refreshSession: (u: Partial<SessionUser>) => void
}

const g = globalThis as unknown as { __osToastId?: number }

export const useOS = create<OSState>((set, get) => ({
  booted: false,
  locked: true,
  session: null,
  sessionLoading: true,
  currentApp: null,
  openApps: [],
  battery: 100,
  charging: false,
  online: 0,
  notifications: [],
  unreadChats: 0,
  toastQueue: [],
  dnd: false,
  flashlight: false,
  brightness: 1,
  theme: 'light',
  wallpaper: 'wave',
  widgets: ['clock', 'wallet', 'online'],

  setBooted: (v) => set({ booted: v }),
  setLocked: (v) => set({ locked: v }),
  setSession: (u) => set({ session: u }),
  setSessionLoading: (v) => set({ sessionLoading: v }),
  openApp: (app) => {
    sound.tap()
    set((s) => ({
      currentApp: app,
      openApps: s.openApps[0] === app ? s.openApps : [app, ...s.openApps.filter((a) => a !== app)].slice(0, 6),
    }))
  },
  closeApp: () => set({ currentApp: null }),
  goHome: () => set({ currentApp: null }),
  dismissApp: (app) =>
    set((s) => ({
      openApps: s.openApps.filter((a) => a !== app),
      currentApp: s.currentApp === app ? null : s.currentApp,
    })),
  setBattery: (v) => set({ battery: Math.max(0, Math.min(100, v)) }),
  setCharging: (v) => set({ charging: v }),
  setOnline: (n) => set({ online: n }),
  setNotifications: (n) => set({ notifications: n }),
  addNotification: (n) => set((s) => ({ notifications: [n, ...s.notifications].slice(0, 40) })),
  removeNotification: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  clearNotifications: () => set({ notifications: [] }),
  markNotificationsRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) })),
  setUnreadChats: (n) => set({ unreadChats: n }),
  pushToast: (title, body) => {
    // «Не беспокоить»: уведомление всё равно попадает в центр, но не всплывает поверх экрана
    if (get().dnd) return
    sound.pop()
    g.__osToastId = (g.__osToastId ?? 0) + 1
    const id = g.__osToastId
    set((s) => ({ toastQueue: [...s.toastQueue, { id, title, body }].slice(-3) }))
    setTimeout(() => {
      set((s) => ({ toastQueue: s.toastQueue.filter((t) => t.id !== id) }))
    }, 4200)
  },
  dropToast: (id) => set((s) => ({ toastQueue: s.toastQueue.filter((t) => t.id !== id) })),
  setDnd: (v) => set({ dnd: v }),
  setFlashlight: (v) => set({ flashlight: v }),
  setBrightness: (v) => set({ brightness: Math.max(0.4, Math.min(1, v)) }),
  setTheme: (t) => set({ theme: t }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setWallpaper: (id) => set({ wallpaper: id }),
  setWidgets: (w) => set({ widgets: w.length ? w : ['clock', 'wallet', 'online'] }),
  refreshSession: (u) => {
    const s = get()
    if (!s.session) return
    const prevLevel = s.session.level
    set({ session: { ...s.session, ...u } })
    // XP-нотификация: уровень вырос — heads-up как в настоящем телефоне.
    // Если бэк не прислал level, но прислал xp — считаем по единой формуле.
    const nextLevel = u.level ?? (u.xp != null ? levelFromXp(u.xp) : prevLevel)
    if (nextLevel > prevLevel) {
      sound.levelup()
      s.pushToast(
        `Новый уровень ${nextLevel}!`,
        'Опыт вырос: лимит кредита повышен, а задания стали щедрее.',
      )
    }
  },
}))
