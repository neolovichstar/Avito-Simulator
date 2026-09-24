'use client'

import { create } from 'zustand'
import type { SessionUser, NotificationDTO } from '@/lib/types'

export type AppKey = 'avito' | 'bank' | 'taxes' | 'browser' | 'settings' | 'repair' | 'auction' | 'career' | 'delivery'

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
  soundOn: boolean
  flashlight: boolean
  brightness: number // 0.4..1

  setBooted: (v: boolean) => void
  setLocked: (v: boolean) => void
  setSession: (u: SessionUser | null) => void
  setSessionLoading: (v: boolean) => void
  openApp: (app: AppKey) => void
  closeApp: () => void
  goHome: () => void
  setBattery: (v: number) => void
  setCharging: (v: boolean) => void
  setOnline: (n: number) => void
  setNotifications: (n: NotificationDTO[]) => void
  addNotification: (n: NotificationDTO) => void
  markNotificationsRead: () => void
  setUnreadChats: (n: number) => void
  pushToast: (title: string, body: string) => void
  dropToast: (id: number) => void
  setSound: (v: boolean) => void
  setFlashlight: (v: boolean) => void
  setBrightness: (v: number) => void
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
  soundOn: true,
  flashlight: false,
  brightness: 1,

  setBooted: (v) => set({ booted: v }),
  setLocked: (v) => set({ locked: v }),
  setSession: (u) => set({ session: u }),
  setSessionLoading: (v) => set({ sessionLoading: v }),
  openApp: (app) =>
    set((s) => ({
      currentApp: app,
      openApps: s.openApps[0] === app ? s.openApps : [app, ...s.openApps.filter((a) => a !== app)].slice(0, 6),
    })),
  closeApp: () => set({ currentApp: null }),
  goHome: () => set({ currentApp: null }),
  setBattery: (v) => set({ battery: Math.max(0, Math.min(100, v)) }),
  setCharging: (v) => set({ charging: v }),
  setOnline: (n) => set({ online: n }),
  setNotifications: (n) => set({ notifications: n }),
  addNotification: (n) => set((s) => ({ notifications: [n, ...s.notifications].slice(0, 40) })),
  markNotificationsRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) })),
  setUnreadChats: (n) => set({ unreadChats: n }),
  pushToast: (title, body) => {
    g.__osToastId = (g.__osToastId ?? 0) + 1
    const id = g.__osToastId
    set((s) => ({ toastQueue: [...s.toastQueue, { id, title, body }].slice(-3) }))
    setTimeout(() => {
      set((s) => ({ toastQueue: s.toastQueue.filter((t) => t.id !== id) }))
    }, 4200)
  },
  dropToast: (id) => set((s) => ({ toastQueue: s.toastQueue.filter((t) => t.id !== id) })),
  setSound: (v) => set({ soundOn: v }),
  setFlashlight: (v) => set({ flashlight: v }),
  setBrightness: (v) => set({ brightness: Math.max(0.4, Math.min(1, v)) }),
  refreshSession: (u) => set((s) => (s.session ? { session: { ...s.session, ...u } } : {})),
}))
