'use client'

// Центр управления (Quick Settings) в духе Android 16 / Material 3 Expressive:
// плитки-пилюли 2×N (активная залита фирменным зелёным #21A038), под ними —
// горизонтальный слайдер-капсула яркости, внизу — дата, батарея и мелкие
// кнопки настроек/питания. Фонарик — настоящая вспышка (Torch API),
// вибро — реальный тумблер тактильного отклика (sound.ts).
import { useRef, useState, useSyncExternalStore } from 'react'
import {
  BatteryCharging, Bluetooth, ChevronDown, Flashlight, Moon, MoonStar, Power,
  RotateCw, Settings, Sun, Vibrate, Wallet, Wifi, WifiOff, Zap,
} from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { setTorch } from '@/lib/torch'
import { sound } from '@/lib/sound'
import { useDrag } from '@/lib/use-swipe'

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
      className={`m3-rise-stagger flex h-[64px] items-center gap-3 rounded-[26px] px-3.5 text-left outline-none transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-white/70 ${
        disabled ? 'cursor-default opacity-70' : 'active:scale-[0.96]'
      } ${active ? 'bg-[#21A038] text-white shadow-[0_10px_26px_-10px_rgba(33,160,56,0.75)]' : 'bg-white/10 text-white'}`}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
          active ? 'bg-white/20' : 'bg-white/15'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-bold leading-tight">{label}</span>
        {sub && (
          <span className={`mt-0.5 block truncate text-[10.5px] leading-tight ${active ? 'text-white/80' : 'text-white/55'}`}>
            {sub}
          </span>
        )}
      </span>
    </button>
  )
}

export default function ControlCenter({
  open, onClose, onOpenApp,
}: {
  open: boolean
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

  // Визуальные переключатели Wi-Fi/Bluetooth/автоповорота (в симуляторе
  // сеть устройства реальная — плитка лишь отражает выбор пользователя).
  const [wifiOn, setWifiOn] = useState(true)
  const [btOn, setBtOn] = useState(false)
  const [rotateOn, setRotateOn] = useState(true)

  // Вибро-отклик — реальный тумблер (общий с Настройками через sound.ts).
  // useSyncExternalStore: без setState-в-эффекте и без рассинхрона гидрации.
  const vibro = useSyncExternalStore(
    (cb) => sound.subscribe(cb),
    () => sound.isEnabled(),
    () => true,
  )

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

  const netLabel = !netOnline ? 'Нет сети' : netKind === 'slow' ? 'Слабый сигнал' : netKind === 'wifi' ? 'Wi-Fi' : netKind === '4g' ? 'LTE' : netKind === '3g' ? '3G' : 'Сеть'

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
      setPct((e.clientX - r.left) / r.width) // мгновенный прыжок к точке касания
    },
    onMove: (dx) => {
      const { startVal, width } = dragState.current
      setBrightness(Math.max(BRIGHT_MIN, Math.min(1, startVal + (dx / width) * BRIGHT_SPAN)))
    },
    onEnd: () => {},
  })

  const brightPct = (brightness - BRIGHT_MIN) / BRIGHT_SPAN

  return (
    <div className={`pointer-events-none absolute inset-0 z-55 ${open ? '' : 'invisible'}`}>
      {/* фон-затемнение */}
      <button
        type="button"
        aria-label="Закрыть центр управления"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/55 transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'opacity-0'
        }`}
      />

      {/* панель */}
      <section
        aria-label="Центр управления"
        className={`pointer-events-auto absolute inset-x-0 top-0 rounded-b-[28px] bg-[#0a0d0b]/95 pb-4 pt-2.5 text-white shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          open ? 'translate-y-0' : '-translate-y-[110%]'
        }`}
      >
        {/* key по open: переигрываем вступительные анимации каждый раз при открытии */}
        <div key={open ? 'cc-open' : 'cc-closed'} className="px-4">
          {/* хендл — как в шторке Android 16 */}
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-14 rounded-full bg-white/30" />

          {/* верх: крупные часы слева, состояние сети справа */}
          <div className="m3-rise flex items-start justify-between px-1">
            <p className="text-[32px] font-light leading-none tabular-nums tracking-tight" suppressHydrationWarning>
              {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
            </p>
            <span
              className="mt-1 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold"
              title={`Сеть устройства: ${netLabel}`}
            >
              {netOnline ? (
                <Wifi className="size-3.5 text-emerald-300" aria-hidden="true" />
              ) : (
                <WifiOff className="size-3.5 text-red-400" aria-hidden="true" />
              )}
              {netLabel}
            </span>
          </div>

          {/* плитки-пилюли 2 колонки */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Tile
              delay={0}
              active={wifiOn}
              icon={<Wifi className="size-[18px]" aria-hidden="true" />}
              label="Wi-Fi"
              sub={wifiOn ? netLabel : 'Выключено'}
              onClick={() => setWifiOn((v) => !v)}
            />
            <Tile
              delay={30}
              active={btOn}
              icon={<Bluetooth className="size-[18px]" aria-hidden="true" />}
              label="Bluetooth"
              sub={btOn ? 'Включено' : 'Выключено'}
              onClick={() => setBtOn((v) => !v)}
            />
            <Tile
              delay={60}
              active={flashlight}
              icon={<Flashlight className="size-[18px]" aria-hidden="true" />}
              label="Фонарик"
              sub={flashlight ? 'Вспышка горит' : 'Выключен'}
              onClick={() => void toggleFlash()}
            />
            <Tile
              delay={90}
              active={dnd}
              icon={<MoonStar className="size-[18px]" aria-hidden="true" />}
              label="Не беспокоить"
              sub={dnd ? 'Тосты скрыты' : 'Всплывают'}
              onClick={toggleDnd}
            />
            <Tile
              delay={120}
              active={vibro}
              icon={<Vibrate className="size-[18px]" aria-hidden="true" />}
              label="Вибро"
              sub={vibro ? 'Отклик включён' : 'Тихий режим'}
              onClick={() => sound.setEnabled(!sound.isEnabled())}
            />
            <Tile
              delay={150}
              active={rotateOn}
              icon={<RotateCw className="size-[18px]" aria-hidden="true" />}
              label="Автоповорот"
              sub={rotateOn ? 'Включён' : 'Портрет'}
              onClick={() => setRotateOn((v) => !v)}
            />
            <Tile
              delay={180}
              active={theme === 'dark'}
              icon={theme === 'dark' ? <Moon className="size-[18px]" aria-hidden="true" /> : <Sun className="size-[18px]" aria-hidden="true" />}
              label="Тема"
              sub={theme === 'dark' ? 'Тёмная' : 'Светлая'}
              onClick={() => {
                toggleTheme()
                pushToast('Тема ОС', useOS.getState().theme === 'dark' ? 'Тёмная тема включена' : 'Светлая тема включена')
              }}
            />
            <Tile
              delay={210}
              icon={<Wallet className="size-[18px]" aria-hidden="true" />}
              label="Кошелёк"
              sub="Столичный Банк"
              onClick={() => {
                onClose()
                onOpenApp('bank')
              }}
            />
          </div>

          {/* слайдер-капсула яркости */}
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
            className="m3-rise relative mt-2.5 flex h-14 cursor-pointer touch-none select-none items-center overflow-hidden rounded-full bg-white/10 outline-none ring-1 ring-white/[0.08] transition-transform duration-200 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/70"
            style={{ animationDelay: '230ms' }}
          >
            {/* заливка */}
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

          {/* нижний ряд: дата/батарея слева, настройки и питание справа */}
          <div className="m3-rise mt-3 flex items-center justify-between px-1" style={{ animationDelay: '260ms' }}>
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!batteryReal) setCharging(!charging)
                }}
                aria-label={charging ? 'Отключить зарядку' : 'Подключить зарядку'}
                className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[11px] font-bold tabular-nums outline-none transition-all duration-200 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-white/70"
                title={batteryReal ? 'Батарея устройства' : 'Симулятор: тап — зарядка'}
              >
                {charging ? (
                  <BatteryCharging className="size-3.5 text-emerald-300" aria-hidden="true" />
                ) : (
                  <Zap className="size-3.5 text-white/80" aria-hidden="true" />
                )}
                {Math.round(battery)}%
              </button>
              <span className="truncate text-[11px] text-white/50" suppressHydrationWarning>
                {now ? now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }) : '\u00A0'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Открыть настройки"
                onClick={() => {
                  onClose()
                  onOpenApp('settings')
                }}
                className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/80 outline-none transition-all duration-200 active:scale-90 active:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <Settings className="size-[17px]" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Питание"
                onClick={() => pushToast('Питание', 'Это симулятор — телефон остаётся включённым')}
                className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/80 outline-none transition-all duration-200 active:scale-90 active:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <Power className="size-[17px]" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* ручка закрытия */}
          <button
            type="button"
            aria-label="Свернуть"
            onClick={onClose}
            className="mx-auto mt-2 flex h-11 w-24 items-center justify-center rounded-full bg-white/[0.08] outline-none transition-colors duration-200 active:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ChevronDown className="size-5 text-white/70" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  )
}
