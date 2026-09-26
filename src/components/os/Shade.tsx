'use client'

// Единая системная шторка Android 17 (Material 3 Expressive).
// Одна панель на весь экран — как в настоящем Android:
//   • ШАПКА: крупные часы + дата, пилюля батареи (тап — симуляция зарядки);
//   • БЫСТРЫЕ НАСТРОЙКИ: плитки-пилюли в 2 колонки. Свёрнуто — 4 главных плитки
//     + компактный слайдер яркости; потяните вниз (или тап по шеврону) — полная
//     сетка из 9 плиток + крупный слайдер + футер с датой/сетью и кнопками
//     настроек/питания;
//   • МЕДИА-КАРТОЧКА: что играет сейчас (глобальный плеер ОС);
//   • УВЕДОМЛЕНИЯ: M3-карточки (тап — развернуть, свайп — смахнуть).
// Правая половина верхнего края открывает шторку сразу в режиме QS.
import { useRef, useState, useSyncExternalStore } from 'react'
import {
  BatteryCharging, Bluetooth, ChevronDown, Flashlight, Moon, MoonStar, Power,
  RotateCw, Settings, Sun, Vibrate, Wallet, Wifi, WifiOff, Zap,
} from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { usePrefs } from '@/lib/prefs'
import { setTorch } from '@/lib/torch'
import { sound } from '@/lib/sound'
import { useDrag } from '@/lib/use-swipe'
import NowPlayingShade from './NowPlayingShade'
import { NotificationList } from './NotificationCenter'

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

// ─── Плитка-пилюля Quick Settings ────────────────────────────────────────────
// Активная — залита акцентом #21A038 (Material 3 «filled»), неактивная — white/10.
function Tile({
  active = false, icon, label, sub, onClick, disabled = false, delay = 0,
}: {
  active?: boolean
  icon: React.ReactNode
  label: string
  sub?: string
  onClick: () => void
  disabled?: boolean
  delay?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={sub ? `${label}: ${sub}` : label}
      disabled={disabled}
      style={{ animationDelay: `${delay}ms` }}
      className={`m3-rise-stagger flex h-16 items-center gap-3 rounded-[26px] px-4 text-left outline-none transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-white/70 ${
        disabled ? 'cursor-default opacity-70' : 'active:scale-[0.96]'
      } ${active ? 'bg-[#21A038] text-white shadow-[0_10px_26px_-10px_rgba(33,160,56,0.75)]' : 'bg-white/[0.10] text-white'}`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
          active ? 'bg-white/20' : 'bg-white/[0.14]'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-bold leading-tight">{label}</span>
        {sub && (
          <span className={`mt-0.5 block truncate text-[10.5px] leading-tight ${active ? 'text-white/85' : 'text-white/55'}`}>
            {sub}
          </span>
        )}
      </span>
    </button>
  )
}

export default function Shade({
  open, qs, onClose, onOpenApp,
}: {
  open: boolean
  /** true — открыть сразу в режиме быстрых настроек (правая зона статус-бара) */
  qs?: boolean
  onClose: () => void
  onOpenApp: (app: AppKey) => void
}) {
  const flashlight = useOS((s) => s.flashlight)
  const setFlashlight = useOS((s) => s.setFlashlight)
  const dnd = useOS((s) => s.dnd)
  const setDnd = useOS((s) => s.setDnd)
  const charging = useOS((s) => s.charging)
  const setCharging = useOS((s) => s.setCharging)
  const batteryReal = useOS((s) => s.batteryReal)
  const netOnline = useOS((s) => s.netOnline)
  const netKind = useOS((s) => s.netKind)
  const brightness = useOS((s) => s.brightness)
  const setBrightness = useOS((s) => s.setBrightness)
  const battery = useOS((s) => s.battery)
  const pushToast = useOS((s) => s.pushToast)
  const theme = useOS((s) => s.theme)
  const toggleTheme = useOS((s) => s.toggleTheme)
  const now = useClock()

  // Визуальные переключатели Wi-Fi/Bluetooth/автоповорота — ГЛОБАЛЬНЫЙ prefs-стор.
  const wifiOn = usePrefs((s) => s.wifi)
  const btOn = usePrefs((s) => s.bt)
  const rotateOn = usePrefs((s) => s.rotate)
  const setPref = usePrefs((s) => s.setPref)

  // Вибро-отклик — реальный тумблер (общий с Настройками через sound.ts).
  const vibro = useSyncExternalStore(
    (cb) => sound.subscribe(cb),
    () => sound.isEnabled(),
    () => true,
  )

  // Режим QS: открыть в развёрнутом виде, если шторку вызвали из правой зоны.
  const [expanded, setExpanded] = useState(!!qs)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setExpanded(!!qs)
  }

  const netLabel = !netOnline
    ? 'Нет сети'
    : netKind === 'slow' ? 'Слабый сигнал' : netKind === 'wifi' ? 'Wi-Fi' : netKind === '4g' ? 'LTE' : netKind === '3g' ? '3G' : 'Сеть'

  const toggleFlash = async () => {
    const next = !flashlight
    const res = await setTorch(next)
    setFlashlight(next)
    if (next) {
      pushToast('Фонарик', res.real ? 'Вспышка включена на устройстве' : 'Устройство без вспышки — светим виртуально')
    }
  }

  const toggleDnd = () => {
    setDnd(!dnd)
    pushToast('Не беспокоить', !useOS.getState().dnd ? 'Тосты снова всплывают' : 'Уведомления копятся в центре')
  }

  // ─── Слайдер-капсула яркости: pointer-drag + клавиатура ──────────────────
  const sliderRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ startVal: 1, width: 1 })
  const BRIGHT_MIN = 0.4
  const BRIGHT_SPAN = 0.6
  const setPct = (pct: number) => setBrightness(BRIGHT_MIN + Math.max(0, Math.min(1, pct)) * BRIGHT_SPAN)

  const sliderDrag = useDrag({
    onStart: (e) => {
      const el = sliderRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      dragState.current = { startVal: useOS.getState().brightness, width: Math.max(1, r.width) }
      setPct((e.clientX - r.left) / r.width)
    },
    onMove: (dx) => {
      const { startVal, width } = dragState.current
      setBrightness(Math.max(BRIGHT_MIN, Math.min(1, startVal + (dx / width) * BRIGHT_SPAN)))
    },
    onEnd: () => {},
  })

  const brightPct = (brightness - BRIGHT_MIN) / BRIGHT_SPAN

  // Потяните шеврон/зону grip вниз — раскрывается QS, вверх — сворачивается.
  const gripDrag = useDrag({
    ignoreWithin: 'button',
    onEnd: (_dx, dy) => {
      if (!expanded && dy > 36) {
        sound.swipe()
        setExpanded(true)
      } else if (expanded && dy < -36) {
        setExpanded(false)
      }
    },
  })

  // Нижняя зона: свайп вверх (или флик) закрывает шторку — как в Android.
  const closeDrag = useDrag({
    onEnd: (_dx, dy, fling) => {
      if (dy < -36 || fling.vy < -0.55) {
        sound.swipe()
        onClose()
      }
    },
  })

  const tiles = (full: boolean) => {
    const list: React.ReactNode[] = [
      <Tile
        key="wifi"
        delay={0}
        active={wifiOn}
        icon={<Wifi className="size-[17px]" aria-hidden="true" />}
        label="Wi-Fi"
        sub={wifiOn ? netLabel : 'Выключено'}
        onClick={() => setPref('wifi', !wifiOn)}
      />,
      <Tile
        key="bt"
        delay={30}
        active={btOn}
        icon={<Bluetooth className="size-[17px]" aria-hidden="true" />}
        label="Bluetooth"
        sub={btOn ? 'Включено' : 'Выключено'}
        onClick={() => setPref('bt', !btOn)}
      />,
      <Tile
        key="flash"
        delay={60}
        active={flashlight}
        icon={<Flashlight className="size-[18px]" aria-hidden="true" />}
        label="Фонарик"
        sub={flashlight ? 'Вспышка горит' : 'Выключен'}
        onClick={() => void toggleFlash()}
      />,
      <Tile
        key="dnd"
        delay={90}
        active={dnd}
        icon={<MoonStar className="size-[18px]" aria-hidden="true" />}
        label="Не беспокоить"
        sub={dnd ? 'Тосты скрыты' : 'Всплывают'}
        onClick={toggleDnd}
      />,
    ]
    if (!full) return list
    return [
      ...list,
      <Tile
        key="vibro"
        delay={120}
        active={vibro}
        icon={<Vibrate className="size-[18px]" aria-hidden="true" />}
        label="Вибро"
        sub={vibro ? 'Отклик включён' : 'Тихий режим'}
        onClick={() => sound.setEnabled(!sound.isEnabled())}
      />,
      <Tile
        key="rotate"
        delay={150}
        active={rotateOn}
        icon={<RotateCw className="size-[18px]" aria-hidden="true" />}
        label="Автоповорот"
        sub={rotateOn ? 'Включён' : 'Портрет'}
        onClick={() => setPref('rotate', !rotateOn)}
      />,
      <Tile
        key="theme"
        delay={180}
        active={theme === 'dark'}
        icon={theme === 'dark' ? <Moon className="size-[18px]" aria-hidden="true" /> : <Sun className="size-[18px]" aria-hidden="true" />}
        label="Тема"
        sub={theme === 'dark' ? 'Тёмная' : 'Светлая'}
        onClick={() => {
          toggleTheme()
          pushToast('Тема ОС', useOS.getState().theme === 'dark' ? 'Тёмная тема включена' : 'Светлая тема включена')
        }}
      />,
      <Tile
        key="wallet"
        delay={210}
        icon={<Wallet className="size-[18px]" aria-hidden="true" />}
        label="Кошелёк"
        sub="Столичный Банк"
        onClick={() => {
          onClose()
          onOpenApp('bank')
        }}
      />,
      <Tile
        key="settings"
        delay={240}
        icon={<Settings className="size-[18px]" aria-hidden="true" />}
        label="Настройки"
        sub="Система"
        onClick={() => {
          onClose()
          onOpenApp('settings')
        }}
      />,
    ]
  }

  // key по open+expanded: переигрываем вступительные анимации при каждом открытии/развороте
  const animKey = open ? (expanded ? 'qs-full' : 'qs-compact') : 'closed'

  return (
    <div className={`pointer-events-none absolute inset-0 z-55 ${open ? '' : 'invisible'}`}>
      {/* скрим под панелью */}
      <button
        type="button"
        aria-label="Закрыть шторку"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'opacity-0'
        }`}
      />

      {/* панель на весь экран — как шторка Android */}
      <section
        aria-label="Шторка уведомлений и быстрых настроек"
        className={`pointer-events-auto absolute inset-0 flex flex-col bg-[#0B0F0D]/[0.96] text-white shadow-2xl backdrop-blur-2xl transition-transform duration-[350ms] ease-[cubic-bezier(0.2,0,0,1)] ${
          open ? 'translate-y-0' : '-translate-y-[102%]'
        }`}
      >
        {/* ─── Шапка: крупные часы, дата, батарея ─── */}
        <header className="flex shrink-0 items-start justify-between px-5 pb-1 pt-4">
          <div suppressHydrationWarning>
            <p className="text-[34px] font-medium leading-none tracking-[-0.02em] tabular-nums">
              {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
            </p>
            <p className="mt-1.5 text-[12.5px] font-medium text-white/55">
              {now ? now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }) : '\u00A0'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!batteryReal) setCharging(!charging)
            }}
            aria-label={charging ? 'Отключить зарядку' : 'Подключить зарядку'}
            className="flex h-10 items-center gap-1.5 rounded-full bg-white/[0.09] px-3.5 text-[12px] font-bold tabular-nums outline-none transition-all duration-200 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-white/70"
            title={batteryReal ? 'Батарея устройства' : 'Симулятор: тап — зарядка'}
          >
            {charging ? (
              <BatteryCharging className="size-4 text-emerald-300" aria-hidden="true" />
            ) : (
              <Zap className="size-4 text-white/80" aria-hidden="true" />
            )}
            {Math.round(battery)}%
          </button>
        </header>

        {/* ─── Grip: потяните вниз — полные быстрые настройки ─── */}
        <div
          {...gripDrag}
          className="flex shrink-0 cursor-grab touch-none items-center justify-between px-5 py-2 select-none"
          aria-hidden="true"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Быстрые настройки
          </span>
          <button
            type="button"
            aria-label={expanded ? 'Свернуть быстрые настройки' : 'Развернуть быстрые настройки'}
            onClick={() => setExpanded((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full text-white/70 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ChevronDown
              className={`size-5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {/* ─── Контент ─── */}
        <div key={animKey} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* плитки QS: компактно 4, полностью 9 */}
          <div className={`grid shrink-0 grid-cols-2 gap-2 px-4 ${expanded ? 'overflow-y-auto pb-1 [scrollbar-width:none]' : ''}`}>
            {tiles(expanded)}
          </div>

          {/* слайдер яркости */}
          <div
            ref={sliderRef}
            role="slider"
            tabIndex={open ? 0 : -1}
            aria-label="Яркость экрана"
            aria-valuemin={40}
            aria-valuemax={100}
            aria-valuenow={Math.round(brightness * 100)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault()
                setPct(brightPct + 0.08)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault()
                setPct(brightPct - 0.08)
              }
            }}
            {...sliderDrag}
            className={`m3-rise relative mx-4 mt-2.5 shrink-0 cursor-pointer touch-none select-none overflow-hidden rounded-[28px] bg-white/[0.10] outline-none ring-1 ring-white/[0.08] transition-transform duration-200 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/70 ${
              expanded ? 'h-14' : 'h-12'
            }`}
            style={{ animationDelay: '60ms' }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-white/90 transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.max(6, brightPct * 100)}%` }}
            />
            <Sun
              aria-hidden="true"
              className="relative z-10 ml-4 size-[18px] transition-colors duration-150"
              style={{ color: brightPct > 0.16 ? '#0b0f0d' : '#ffffff' }}
            />
            <span className="relative z-10 ml-3 text-[12px] font-bold" style={{ color: brightPct > 0.24 ? '#0b0f0d' : 'rgba(255,255,255,0.85)' }}>
              {Math.round(brightness * 100)}%
            </span>
          </div>

          {expanded ? (
            /* ─── Полный QS: медиа + футер с датой/сетью и настройками/питанием ─── */
            <div className="min-h-0 flex-1 overflow-y-auto pb-3 [scrollbar-width:none]">
              <div className="m3-rise mt-2.5" style={{ animationDelay: '100ms' }}>
                <NowPlayingShade onOpenApp={onOpenApp} />
              </div>
              <div className="m3-rise mt-3 flex items-center justify-between px-5" style={{ animationDelay: '140ms' }}>
                <div className="flex min-w-0 items-center gap-2 text-[12px]">
                  <span className="whitespace-nowrap text-white/55" suppressHydrationWarning>
                    {now ? now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }) : '\u00A0'}
                  </span>
                  <span className="flex items-center gap-1.5 text-white/45">
                    {netOnline ? (
                      <Wifi className="size-3.5 text-emerald-300" aria-hidden="true" />
                    ) : (
                      <WifiOff className="size-3.5 text-red-400" aria-hidden="true" />
                    )}
                    {netLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Открыть настройки"
                    onClick={() => {
                      onClose()
                      onOpenApp('settings')
                    }}
                    className="flex size-11 items-center justify-center rounded-full bg-white/[0.09] text-white/80 outline-none transition-all duration-200 active:scale-90 active:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <Settings className="size-[18px]" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Питание"
                    onClick={() => pushToast('Питание', 'Это симулятор — телефон остаётся включённым')}
                    className="flex size-11 items-center justify-center rounded-full bg-white/[0.09] text-white/80 outline-none transition-all duration-200 active:scale-90 active:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <Power className="size-[18px]" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ─── Компакт: медиа + список уведомлений ─── */
            <>
              <div className="m3-rise mt-2.5 shrink-0" style={{ animationDelay: '100ms' }}>
                <NowPlayingShade onOpenApp={onOpenApp} />
              </div>
              <div className="m3-rise min-h-0 flex-1 overflow-y-auto pb-2 pt-2.5 [scrollbar-width:none]" style={{ animationDelay: '140ms' }}>
                <NotificationList onOpenApp={(a) => { onClose(); onOpenApp(a) }} />
              </div>
            </>
          )}
        </div>

        {/* нижняя зона — свайп вверх или тап сворачивает шторку (полноширинная, как в Android) */}
        <button
          type="button"
          aria-label="Свернуть шторку"
          onClick={onClose}
          {...closeDrag}
          className="flex h-12 w-full shrink-0 items-start justify-center bg-gradient-to-b from-transparent to-white/[0.04] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 active:to-white/[0.10]"
        >
          <span aria-hidden="true" className="mt-2 block h-1 w-16 rounded-full bg-white/30" />
        </button>
      </section>
    </div>
  )
}
