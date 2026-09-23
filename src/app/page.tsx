'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOS } from '@/lib/store'
import { api, setToken } from '@/lib/api'
import { useRealtime } from '@/lib/use-realtime'
import PhoneFrame from '@/components/os/PhoneFrame'
import StatusBar from '@/components/os/StatusBar'
import LockScreen from '@/components/os/LockScreen'
import HomeScreen from '@/components/os/HomeScreen'
import NavBar from '@/components/os/NavBar'
import NotificationCenter from '@/components/os/NotificationCenter'
import ToastStack from '@/components/os/ToastStack'
import RecentsOverlay from '@/components/os/RecentsOverlay'
import AvitoApp from '@/components/avito/AvitoApp'
import BankApp from '@/components/apps/BankApp'
import TaxesApp from '@/components/apps/TaxesApp'
import BrowserApp from '@/components/apps/BrowserApp'
import SettingsApp from '@/components/apps/SettingsApp'
import RepairApp from '@/components/apps/RepairApp'
import AuctionApp from '@/components/apps/AuctionApp'
import CareerApp from '@/components/apps/CareerApp'
import DeliveryApp from '@/components/apps/DeliveryApp'

const BATTERY_KEY = 'avito_sim_battery'

export default function Home() {
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const booted = useOS((s) => s.booted)
  const locked = useOS((s) => s.locked)
  const session = useOS((s) => s.session)
  const currentApp = useOS((s) => s.currentApp)
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const openApp = useOS((s) => s.openApp)
  const closeApp = useOS((s) => s.closeApp)
  const setSession = useOS((s) => s.setSession)
  const setLocked = useOS((s) => s.setLocked)
  const setBattery = useOS((s) => s.setBattery)
  const setCharging = useOS((s) => s.setCharging)
  const setOnline = useOS((s) => s.setOnline)
  const setNotifications = useOS((s) => s.setNotifications)
  const pushToast = useOS((s) => s.pushToast)
  const authTried = useRef(false)

  // ---------- AUTH ----------
  const doAuth = useCallback(async () => {
    try {
      const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } }).Telegram?.WebApp
      tg?.ready?.()
      tg?.expand?.()
      const initData = tg?.initData ?? null
      const res = await api.auth(initData)
      setToken(res.token)
      setSession(res.user)
      const [stats, notif] = await Promise.all([
        api.stats().catch(() => ({ online: 0 })),
        api.notifications().catch(() => ({ items: [] })),
      ])
      setOnline(stats.online)
      setNotifications(notif.items)
      if (res.user.isNew) {
        pushToast('Добро пожаловать', 'Вам начислено 35 000 ₽ стартового капитала. Удачных сделок!')
      }
    } catch {
      pushToast('Ошибка сети', 'Не удалось подключиться к серверу. Проверьте соединение')
    }
  }, [setSession, setNotifications, setOnline, pushToast])

  useEffect(() => {
    if (authTried.current) return
    authTried.current = true
    doAuth()
  }, [doAuth])

  // ---------- REALTIME ----------
  useRealtime(session?.id, {
    onDeal: (d) => {
      pushToast(
        d.role === 'buyer' ? 'Покупка' : 'Продажа',
        `«${d.title}» — сделка на ${Math.round(d.price).toLocaleString('ru-RU')} ₽`,
      )
      if (session) {
        api.profile().then((p) => useOS.getState().refreshSession({ balance: p.user.balance })).catch(() => {})
      }
    },
  })

  // ---------- ОНЛАЙН ----------
  useEffect(() => {
    if (!session) return
    const t = setInterval(() => {
      api.stats().then((s) => setOnline(s.online)).catch(() => {})
    }, 20_000)
    return () => clearInterval(t)
  }, [session, setOnline])

  // ---------- БАТАРЕЯ ----------
  useEffect(() => {
    const saved = Number(localStorage.getItem(BATTERY_KEY) ?? '100')
    setBattery(Number.isFinite(saved) ? saved : 100)
  }, [setBattery])

  useEffect(() => {
    if (!booted) return
    const drain = setInterval(() => {
      if (useOS.getState().charging) {
        setBattery(useOS.getState().battery + 2)
      } else {
        setBattery(useOS.getState().battery - 1)
      }
    }, 30_000)
    return () => clearInterval(drain)
  }, [booted, setBattery])

  useEffect(() => {
    if (!booted) return
    localStorage.setItem(BATTERY_KEY, String(Math.round(battery)))
  }, [battery, booted])

  const unlock = () => {
    setLocked(false)
    setCharging(charging)
  }

  const renderApp = () => {
    switch (currentApp) {
      case 'avito': return <AvitoApp />
      case 'bank': return <BankApp />
      case 'taxes': return <TaxesApp />
      case 'browser': return <BrowserApp onOpenApp={(a) => openApp(a)} />
      case 'settings': return <SettingsApp />
      case 'repair': return <RepairApp />
      case 'auction': return <AuctionApp />
      case 'career': return <CareerApp />
      case 'delivery': return <DeliveryApp />
      default: return null
    }
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-neutral-950">
      <PhoneFrame>
        {/* статус-бар */}
        <StatusBar variant={currentApp ? 'light' : 'dark'} />

        {/* контент */}
        <div className="absolute inset-0 top-10 bottom-12 overflow-hidden bg-black">
          {!session ? (
            <div className="h-full flex flex-col items-center justify-center gap-3" style={{ backgroundImage: 'linear-gradient(180deg,#0b0b16,#030307)' }}>
              <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
              <p className="text-xs text-white/50">Загрузка системы...</p>
            </div>
          ) : currentApp ? (
            renderApp()
          ) : (
            <HomeScreen onOpenApp={openApp} />
          )}
        </div>

        {/* лок-скрин поверх всего */}
        {locked && <LockScreen onUnlock={unlock} />}

        {/* уведомления и тосты */}
        <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
        <ToastStack />
        <RecentsOverlay open={recentsOpen} onClose={() => setRecentsOpen(false)} onResume={() => setRecentsOpen(false)} />

        {/* навигационная панель */}
        <NavBar
          onBack={closeApp}
          onHome={closeApp}
          onRecents={() => setRecentsOpen((v) => !v)}
          recentsActive={recentsOpen}
        />
      </PhoneFrame>
    </main>
  )
}
