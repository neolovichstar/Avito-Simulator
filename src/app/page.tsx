'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOS, type AppKey } from '@/lib/store'
import { api, setToken } from '@/lib/api'
import { useRealtime } from '@/lib/use-realtime'
import PhoneFrame from '@/components/os/PhoneFrame'
import StatusBar from '@/components/os/StatusBar'
import LockScreen from '@/components/os/LockScreen'
import HomeScreen from '@/components/os/HomeScreen'
import NavBar from '@/components/os/NavBar'
import NotificationCenter from '@/components/os/NotificationCenter'
import ControlCenter from '@/components/os/ControlCenter'
import ToastStack from '@/components/os/ToastStack'
import RecentsOverlay from '@/components/os/RecentsOverlay'
import DesktopShell from '@/components/desktop/DesktopShell'
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
const THEME_KEY = 'avito_sim_theme'
const WALLPAPER_KEY = 'avito_sim_wallpaper'
const WIDGETS_KEY = 'avito_sim_widgets'
const DND_KEY = 'avito_sim_dnd'
const DESKTOP_MIN_WIDTH = 1024

export default function Home() {
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [controlOpen, setControlOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const swipeStartY = useRef<number | null>(null)
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
  const flashlight = useOS((s) => s.flashlight)
  const brightness = useOS((s) => s.brightness)
  const theme = useOS((s) => s.theme)
  const setNotifications = useOS((s) => s.setNotifications)
  const pushToast = useOS((s) => s.pushToast)
  const setWallpaper = useOS((s) => s.setWallpaper)
  const setWidgets = useOS((s) => s.setWidgets)
  const authTried = useRef(false)

  // ---------- ПК / ТЕЛЕФОН ----------
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  // ---------- БАТАРЕЯ / ТЕМА / ОБОИ / ВИДЖЕТЫ ----------
  useEffect(() => {
    const saved = Number(localStorage.getItem(BATTERY_KEY) ?? '100')
    setBattery(Number.isFinite(saved) ? saved : 100)
    const savedTheme = localStorage.getItem(THEME_KEY)
    if (savedTheme === 'dark' || savedTheme === 'light') useOS.getState().setTheme(savedTheme)
    const savedDnd = localStorage.getItem(DND_KEY)
    if (savedDnd === '1') useOS.getState().setDnd(true)
    const savedWall = localStorage.getItem(WALLPAPER_KEY)
    if (savedWall) useOS.getState().setWallpaper(savedWall)
    try {
      const raw = localStorage.getItem(WIDGETS_KEY)
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        if (Array.isArray(arr) && arr.length) useOS.getState().setWidgets(arr as never)
      }
    } catch { /* ignore */ }
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

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // persist «Не беспокоить»
  useEffect(() => {
    const unsub = useOS.subscribe((s) => {
      localStorage.setItem(DND_KEY, s.dnd ? '1' : '0')
    })
    return unsub
  }, [])

  // persist обоев и виджетов
  useEffect(() => {
    const unsub1 = useOS.subscribe((s) => {
      if (s.wallpaper) localStorage.setItem(WALLPAPER_KEY, s.wallpaper)
      localStorage.setItem(WIDGETS_KEY, JSON.stringify(s.widgets))
    })
    return unsub1
  }, [])

  const claimDailyBonus = useCallback(async () => {
    try {
      const st = await api.bonusState()
      if (st.claimedToday) return
      const res = await api.bonusClaim()
      pushToast(
        'Бонус за вход',
        `+${res.reward.toLocaleString('ru-RU')} ₽ за ${res.streak} ${res.streak === 1 ? 'день' : res.streak < 5 ? 'дня' : 'дней'} подряд. Завтра будет больше`,
      )
      api.profile().then((p) => useOS.getState().refreshSession({ balance: p.user.balance })).catch(() => {})
    } catch { /* бонус не критичен */ }
  }, [pushToast])

  const unlock = () => {
    setLocked(false)
    setCharging(charging)
    // ежедневный бонус за вход: начисляем сразу при разблокировке нового дня
    claimDailyBonus()
  }

  // ---------- ЖЕСТ: СВАЙП СВЕРХУ ВНИЗ — ЦЕНТР УПРАВЛЕНИЯ (телефон) ----------
  const onTouchStart = (e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0]?.clientY ?? null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (swipeStartY.current === null) return
    const y = e.touches[0]?.clientY ?? 0
    if (y - swipeStartY.current > 34) {
      swipeStartY.current = null
      setControlOpen(true)
    }
  }

  const renderApp = (app?: AppKey) => {
    switch (app ?? currentApp) {
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

  // ---------- ПК-РЕЖИМ (Windows 11) ----------
  if (isDesktop) {
    return (
      <main className="min-h-[100dvh] bg-neutral-950">
        {!session ? (
          <div className="fixed inset-0 flex flex-col items-center justify-center gap-3" style={{ backgroundImage: 'linear-gradient(180deg,#0b0b16,#030307)' }}>
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <p className="text-xs text-white/50">Загрузка системы...</p>
          </div>
        ) : (
          <DesktopShell
            locked={locked}
            onUnlock={unlock}
            renderApp={(app) => renderApp(app)}
            theme={theme}
          />
        )}
        <ToastStack variant="desktop" />
        {/* яркость: затемняющий слой поверх всего */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[90] bg-black transition-opacity duration-200"
          style={{ opacity: (1 - brightness) * 0.6 }}
        />
      </main>
    )
  }

  // ---------- ТЕЛЕФОН ----------
  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-neutral-950">
      <PhoneFrame>
        {/* статус-бар */}
        <StatusBar variant={currentApp ? (theme === 'dark' ? 'dark' : 'light') : 'dark'} onBell={() => setNotifOpen(true)} />

        {/* контент */}
        <div className={`absolute inset-0 top-10 bottom-12 overflow-hidden bg-black ${theme === 'dark' ? 'theme-dark' : ''}`}>
          {!session ? (
            <div className="h-full flex flex-col items-center justify-center gap-3" style={{ backgroundImage: 'linear-gradient(180deg,#0b0b16,#030307)' }}>
              <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
              <p className="text-xs text-white/50">Загрузка системы...</p>
            </div>
          ) : currentApp ? (
            <div key={currentApp} className="screen-enter h-full">
              {renderApp()}
            </div>
          ) : (
            <HomeScreen onOpenApp={openApp} />
          )}
        </div>

        {/* лок-скрин поверх всего */}
        {locked && <LockScreen onUnlock={unlock} />}

        {/* уведомления и тосты */}
        <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} onOpenApp={(a) => { setNotifOpen(false); openApp(a) }} />
        <ControlCenter open={controlOpen} onClose={() => setControlOpen(false)} onOpenApp={(a) => { setControlOpen(false); openApp(a) }} />
        <ToastStack />
        <RecentsOverlay open={recentsOpen} onClose={() => setRecentsOpen(false)} onResume={() => setRecentsOpen(false)} />

        {/* яркость: затемняющий слой поверх всего */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[58] bg-black transition-opacity duration-200"
          style={{ opacity: (1 - brightness) * 0.72 }}
        />

        {/* свечение фонарика на экране (для устройств без вспышки) */}
        {flashlight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-[57] h-28"
            style={{ background: 'radial-gradient(ellipse at 50% -18%, rgba(255,255,230,0.55), transparent 68%)' }}
          />
        )}

        {/* верхняя зона-жест: свайп вниз или тап — центр управления */}
        <div
          role="button"
          aria-label="Открыть центр управления"
          className="absolute left-0 right-16 top-0 z-[59] h-8 outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onClick={() => setControlOpen(true)}
        />

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
