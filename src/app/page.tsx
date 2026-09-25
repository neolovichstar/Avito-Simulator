'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useOS, type AppKey, WALLPAPER_TOP } from '@/lib/store'
import { hydratePrefs } from '@/lib/prefs'
import { hydrateVolume, initVolumeEngineBridge } from '@/lib/volume'
import { api, getToken, setToken } from '@/lib/api'
import { useRealtime } from '@/lib/use-realtime'
import { useSwipe } from '@/lib/use-swipe'
import { initDeviceSensors } from '@/lib/device'
import PhoneFrame from '@/components/os/PhoneFrame'
import StatusBar from '@/components/os/StatusBar'
import LockScreen from '@/components/os/LockScreen'
import HomeScreen from '@/components/os/HomeScreen'
import GestureNav from '@/components/os/GestureNav'
import NotificationCenter from '@/components/os/NotificationCenter'
import ControlCenter from '@/components/os/ControlCenter'
import ToastStack from '@/components/os/ToastStack'
import VolumePlate from '@/components/os/VolumePlate'
import CallOverlay from '@/components/os/CallOverlay'
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
import LeaderboardApp from '@/components/apps/LeaderboardApp'
import CalcApp from '@/components/apps/CalcApp'
import ClockApp from '@/components/apps/ClockApp'
import CalendarApp from '@/components/apps/CalendarApp'
import NotesApp from '@/components/apps/NotesApp'
import WeatherApp from '@/components/apps/WeatherApp'
import GalleryApp from '@/components/apps/GalleryApp'
import MusicApp from '@/components/apps/MusicApp'
import PhoneApp from '@/components/apps/PhoneApp'
import GosuslugiApp from '@/components/apps/GosuslugiApp'

const BATTERY_KEY = 'avito_sim_battery'
const THEME_KEY = 'avito_sim_theme'
const WALLPAPER_KEY = 'avito_sim_wallpaper_v2' // v2: дефолт — зелёные обои Resale
const WIDGETS_KEY = 'avito_sim_widgets'
const DND_KEY = 'avito_sim_dnd'
const DESKTOP_MIN_WIDTH = 1024
const DEVICE_KEY = 'avito_sim_device_id'

// Стабильный id этого браузера/телефона для фолбэк-входа без Telegram.
// Сервер ключует девиант-аккаунт по нему, поэтому прогресс больше не
// «сбрасывается»: у каждого устройства — свой постоянный профиль.
function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return null // приватный режим — сервер создаст общий dev-аккаунт, как раньше
  }
}

// Приложения со СВЕТЛОЙ темой интерфейса. Когда открыто одно из них, хром ОС
// подстраивается: иконки статус-бара становятся тёмными, а рамки Telegram —
// светлыми. Все остальные приложения и лончер остаются тёмными.
const LIGHT_APPS: Partial<Record<AppKey, true>> = { avito: true, bank: true, taxes: true, auction: true, repair: true, career: true, delivery: true, leaderboard: true, music: true, gosuslugi: true }

// Экран «нет связи с сервером» — показывается после 3 неудачных попыток авторизации.
function OfflineScreen({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return (
    <div
      role="alert"
      className={`${compact ? 'h-full' : 'fixed inset-0'} flex flex-col items-center justify-center gap-4 px-8 text-center`}
      style={{ backgroundImage: 'linear-gradient(180deg,#08120d,#030705)' }}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
        <WifiOff className="size-6 text-emerald-300" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Нет связи с сервером</p>
        <p className="mt-1 text-xs leading-relaxed text-white/50">
          Прогресс сохранён, а товары ждут. Проверьте интернет и попробуйте ещё раз
        </p>
      </div>
      <button
        onClick={onRetry}
        className="press inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-emerald-500 px-6 text-xs font-bold text-neutral-950 shadow-lg shadow-emerald-500/25 active:scale-[0.98]"
      >
        <RefreshCw className="size-4" aria-hidden />
        Повторить подключение
      </button>
    </div>
  )
}

export default function Home() {
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [controlOpen, setControlOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [authError, setAuthError] = useState(false)
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

  // ---------- TELEGRAM: прозрачные рамки — цвет шапки/низа Telegram = цвет верха контента ----------
  const applyTelegramChrome = useCallback((color: string) => {
    const tg = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            version?: string
            setHeaderColor?: (v: string) => void
            setBackgroundColor?: (v: string) => void
            setBottomBarColor?: (v: string) => void
          }
        }
      }
    ).Telegram?.WebApp
    if (!tg) return
    try {
      // Гвард по версии клиента: старое вебвью на каждый вызов кидает warning
      // «not supported in version X» и всё равно не применяет цвет — не засоряем
      // консоль (в дев-оверлее каждая warning считается «Issue»).
      const ver = Number.parseFloat(tg.version || '0')
      if (ver >= 6.1) tg.setHeaderColor?.(color) // верхняя панель Telegram сливается с контентом
      if (ver >= 6.1) tg.setBackgroundColor?.(color) // фон окна
      if (ver >= 9) tg.setBottomBarColor?.(color) // нижняя панель (Bot API 9+)
    } catch {
      /* старый клиент без поддержки — просто игнорируем */
    }
  }, [])

  // Светлый хром ОС — только когда открыто светлое приложение и тема светлая
  // (в тёмной теме все приложения перекрашиваются в тёмные через .theme-dark):
  // статус-бар получает тёмные иконки на светлой полосе, Telegram — светлые рамки.
  const lightChrome = !!(session && currentApp && LIGHT_APPS[currentApp] && theme !== 'dark')

  // Перекрашиваем рамки Telegram под текущий экран: локскрин/загрузка — чёрно-зелёные,
  // дом — верх обоев, тёмные приложения — их фирменный фон #050D09,
  // светлые приложения — светло-серый #F7F8FA.
  const wallpaper = useOS((s) => s.wallpaper)
  useEffect(() => {
    const chrome = locked || !session
      ? '#050d09'
      : currentApp
        ? (LIGHT_APPS[currentApp] && theme !== 'dark' ? '#F7F8FA' : '#050d09')
        : (WALLPAPER_TOP[wallpaper] ?? '#07130d')
    applyTelegramChrome(chrome)
  }, [locked, session, currentApp, wallpaper, theme, applyTelegramChrome])

  // ---------- AUTH (3 ретрая, затем экран повтора) ----------
  const doAuth = useCallback(async () => {
    setAuthError(false)
    // SDK Telegram (telegram-web-app.js) подключён тегом async: на мобильной
    // сети он появляется позже первого рендера. Ждём его до 3с — иначе
    // initData = null и сервер создаёт безликого «Игрока» вместо профиля.
    let tg: { initData?: string; ready?: () => void; expand?: () => void } | undefined
    for (let i = 0; i < 30; i++) {
      tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } }).Telegram?.WebApp
      if (tg) break
      await new Promise((r) => setTimeout(r, 100))
    }
    tg?.ready?.()
    tg?.expand?.()
    applyTelegramChrome('#050d09')

    // ВАЖНО: быстрый путь по живому токену — ТОЛЬКО когда Telegram-данных нет
    // (браузер/превью). Внутри Telegram авторизуемся ВСЕГДА по initData:
    // иначе устаревший токен дев-аккаунта навсегда блокировал привязку
    // Telegram-профиля (жалоба «профиль и данные с телеграма не работают»).
    const stored = getToken()
    const initData = tg?.initData ?? null
    if (stored && !initData) {
      try {
        const p = await api.profile()
        setSession(p.user)
        const [stats, notif] = await Promise.all([
          api.stats().catch(() => ({ online: 0 })),
          api.notifications().catch(() => ({ items: [] })),
        ])
        setOnline(stats.online)
        setNotifications(notif.items)
        return
      } catch {
        /* токен умер — идём обычным путём полной авторизации */
      }
    }

    let lastErr: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt))
      try {
        const res = await api.auth(initData, getDeviceId())
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
        return
      } catch (e) {
        lastErr = e
      }
    }
    console.error('[auth] сервер недоступен после 3 попыток', lastErr)
    setAuthError(true)
  }, [setSession, setNotifications, setOnline, pushToast, applyTelegramChrome])

  useEffect(() => {
    if (authTried.current) return
    authTried.current = true
    doAuth()
    initDeviceSensors()
    hydratePrefs() // накатываем сохранённые свитчи (Wi-Fi/пин/…) поверх дефолтов
    hydrateVolume() // медиа-громкость из localStorage (дефолт 50%)
    initVolumeEngineBridge() // применяем громкость к аудио-движку + клавиатура ↑/↓
  }, [doAuth])

  // ---------- АВТО-ПЕРЕПОДКЛЮЧЕНИЕ: сеть вернулась — тихо повторяем авторизацию ----------
  useEffect(() => {
    const onOnline = () => {
      if (useOS.getState().session) return
      doAuth()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
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
    // Настоящая батарея устройства — симуляция разряда не нужна.
    if (useOS.getState().batteryReal) return
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

  // ---------- ЖЕСТЫ ШТОРКИ (как в настоящем Android): -----------------------
  // свайп вниз от ЛЕВОЙ половины верхнего края — центр уведомлений,
  // от ПРАВОЙ половины — центр управления (яркость/фонарик и т.д.).
  const notifSwipe = useSwipe({
    threshold: 30,
    onSwipe: (dir) => {
      if (dir === 'down') {
        setControlOpen(false)
        setNotifOpen(true)
      }
    },
  })
  const controlSwipe = useSwipe({
    threshold: 30,
    onSwipe: (dir) => {
      if (dir === 'down') {
        setNotifOpen(false)
        setControlOpen(true)
      }
    },
  })

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
      case 'leaderboard': return <LeaderboardApp />
      case 'calc': return <CalcApp />
      case 'clock': return <ClockApp />
      case 'calendar': return <CalendarApp />
      case 'notes': return <NotesApp />
      case 'weather': return <WeatherApp />
      case 'gallery': return <GalleryApp />
      case 'music': return <MusicApp />
      case 'phone': return <PhoneApp />
      case 'gosuslugi': return <GosuslugiApp />
      default: return null
    }
  }

  // ---------- ПК-РЕЖИМ (Windows 11) ----------
  if (isDesktop) {
    return (
      <main className="min-h-[100dvh] bg-neutral-950">
        {!session ? (
          authError ? (
            <OfflineScreen onRetry={doAuth} />
          ) : (
            <div className="fixed inset-0 flex flex-col items-center justify-center gap-3" style={{ backgroundImage: 'linear-gradient(180deg,#08120d,#030705)' }}>
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-300/80" />
              <p className="text-xs text-white/50">Загрузка системы...</p>
            </div>
          )
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
        {/* статус-бар: тёмные иконки на тёмных экранах,
            над светлыми приложениями (Resale/Банк) — тёмные иконки на светлой полосе */}
        <StatusBar variant={lightChrome ? 'light' : 'dark'} onBell={() => { setControlOpen(false); setNotifOpen(true) }} />

        {/* контент — до самого низа: пилюля-жест накладывается поверх.
            Приложения живут в СЛОЯХ внутри RecentsOverlay (keep-alive как в
            настоящем телефоне): recents показывает их живые миниатюры. */}
        <div className={`absolute inset-0 top-10 bottom-6 overflow-hidden bg-black ${theme === 'dark' ? 'theme-dark' : ''}`}>
          {!session ? (
            authError ? (
              <OfflineScreen compact onRetry={doAuth} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3" style={{ backgroundImage: 'linear-gradient(180deg,#08120d,#030705)' }}>
                <div className="w-10 h-10 rounded-full border-2 border-emerald-400/20 border-t-emerald-300/80 animate-spin" />
                <p className="text-xs text-white/50">Загрузка системы...</p>
              </div>
            )
          ) : (
            <>
              {currentApp === null && <HomeScreen onOpenApp={openApp} />}
              <RecentsOverlay
                open={recentsOpen}
                onClose={() => setRecentsOpen(false)}
                onResume={() => setRecentsOpen(false)}
                renderApp={renderApp}
              />
            </>
          )}
        </div>

        {/* лок-скрин поверх всего */}
        {locked && <LockScreen onUnlock={unlock} />}

        {/* уведомления и тосты */}
        <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} onOpenApp={(a) => { setNotifOpen(false); openApp(a) }} />
        <ControlCenter open={controlOpen} onClose={() => setControlOpen(false)} onOpenApp={(a) => { setControlOpen(false); openApp(a) }} />
        <ToastStack />
        <VolumePlate />
        <CallOverlay /> {/* системный звонок поверх приложений (26-d) */}

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

        {/* верхние зоны-жесты (как в настоящем телефоне): левая половина —
            уведомления, правая — центр управления. Тап тоже работает. */}
        <div
          role="button"
          aria-label="Открыть уведомления"
          className="absolute left-0 top-0 z-[59] h-8 w-1/2 touch-none outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          onPointerDown={notifSwipe.onPointerDown}
          onClick={() => { setControlOpen(false); setNotifOpen(true) }}
        />
        <div
          role="button"
          aria-label="Открыть центр управления"
          className="absolute right-0 top-0 z-[59] h-8 w-1/2 touch-none outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          onPointerDown={controlSwipe.onPointerDown}
          onClick={() => { setNotifOpen(false); setControlOpen(true) }}
        />

        {/* жестовая навигация: пилюля + свайпы от краёв (вместо кнопок).
            Из recents: свайп вверх — домой, назад/тап по фону — закрыть ленту. */}
        <GestureNav
          canGoBack={!!currentApp}
          onBack={() => {
            if (recentsOpen) setRecentsOpen(false)
            else closeApp()
          }}
          onHome={() => {
            setRecentsOpen(false)
            closeApp()
          }}
          onRecents={() => setRecentsOpen((v) => !v)}
        />
      </PhoneFrame>
    </main>
  )
}
