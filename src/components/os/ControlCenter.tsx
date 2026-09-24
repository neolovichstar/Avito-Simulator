'use client'

// Центр управления: свайп сверху вниз, как в настоящем телефоне.
// Фонарик включает РЕАЛЬНУЮ вспышку (Torch API), яркость затемняет экран,
// зарядка — системный переключатель ОС.
import { useSyncExternalStore } from 'react'
import {
  BatteryCharging, ChevronDown, Flashlight, Moon, MoonStar, Settings, Sun, SunDim, Wallet, Zap, Wifi,
} from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { enableTorch, stopTorch } from '@/lib/torch'

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

function Tile({
  active, icon, label, sub, onClick, activeCls = 'bg-white text-neutral-900', className = '',
}: {
  active?: boolean
  icon: React.ReactNode
  label: string
  sub?: string
  onClick: () => void
  activeCls?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`flex min-h-[68px] items-center gap-3 rounded-3xl px-4 py-3 text-left outline-none transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/70 ${
        active ? activeCls : 'bg-white/10 text-white'
      } ${className}`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          active ? 'bg-neutral-900/10' : 'bg-white/15'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold">{label}</span>
        {sub && (
          <span className={`block truncate text-[11px] ${active ? 'text-neutral-600' : 'text-white/60'}`}>
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
  const brightness = useOS((s) => s.brightness)
  const setBrightness = useOS((s) => s.setBrightness)
  const battery = useOS((s) => s.battery)
  const online = useOS((s) => s.online)
  const pushToast = useOS((s) => s.pushToast)
  const theme = useOS((s) => s.theme)
  const toggleTheme = useOS((s) => s.toggleTheme)
  const now = useClock()

  const toggleFlash = async () => {
    if (flashlight) {
      stopTorch()
      setFlashlight(false)
      return
    }
    const ok = await enableTorch()
    if (ok) {
      setFlashlight(true)
      pushToast('Фонарик', 'Вспышка включена на реальном устройстве')
    } else {
      setFlashlight(true) // визуально работает даже без вспышки
      pushToast('Фонарик', 'Устройство без вспышки — светим виртуально')
    }
  }

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
        className={`pointer-events-auto absolute inset-x-0 top-0 rounded-b-[2rem] bg-neutral-900/90 pb-4 pt-5 text-white shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : '-translate-y-[110%]'
        }`}
        style={{ WebkitBackdropFilter: 'blur(24px)' }}
      >
        <div className="px-5">
          {/* верх: часы и батарея */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-4xl font-extralight tabular-nums" suppressHydrationWarning>
                {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
              </p>
              <p className="mt-0.5 text-[11px] text-white/60" suppressHydrationWarning>
                {now
                  ? now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
                  : '\u00A0'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
                <Wifi className="size-3.5 text-emerald-400" aria-hidden="true" />
                {online}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold tabular-nums">
                {charging ? (
                  <BatteryCharging className="size-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Zap className="size-3.5 text-white/80" aria-hidden="true" />
                )}
                {Math.round(battery)}%
              </span>
            </div>
          </div>

          {/* плитки */}
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Tile
              active={flashlight}
              activeCls="bg-amber-300 text-neutral-900"
              icon={<Flashlight className="size-4.5" aria-hidden="true" />}
              label="Фонарик"
              sub={flashlight ? 'Вспышка включена' : 'Выключен'}
              onClick={toggleFlash}
            />
            <Tile
              active
              activeCls="bg-emerald-500 text-white"
              icon={<Wallet className="size-4.5" aria-hidden="true" />}
              label="Кошелёк"
              sub="Открыть Столичный Банк"
              onClick={() => {
                onClose()
                onOpenApp('bank')
              }}
            />
            <Tile
              active={dnd}
              activeCls="bg-emerald-400 text-neutral-900"
              icon={<MoonStar className="size-4.5" aria-hidden="true" />}
              label="Не беспокоить"
              sub={dnd ? 'Тосты скрыты' : 'Уведомления всплывают'}
              onClick={() => {
                setDnd(!dnd)
                pushToast('Не беспокоить', !useOS.getState().dnd ? 'Тосты снова всплывают' : 'Уведомления копятся в центре')
              }}
            />
            <Tile
              active={charging}
              activeCls="bg-emerald-400 text-neutral-900"
              icon={<Zap className="size-4.5" aria-hidden="true" />}
              label="Зарядка"
              sub={charging ? 'Питание подключено' : 'Батарея'}
              onClick={() => setCharging(!charging)}
            />
            <Tile
              active={theme === 'dark'}
              activeCls="bg-emerald-300 text-neutral-900"
              icon={theme === 'dark' ? <Moon className="size-4.5" aria-hidden="true" /> : <Sun className="size-4.5" aria-hidden="true" />}
              label="Тема"
              sub={theme === 'dark' ? 'Тёмная' : 'Светлая'}
              onClick={() => {
                toggleTheme()
                pushToast('Тема ОС', useOS.getState().theme === 'dark' ? 'Тёмная тема включена' : 'Светлая тема включена')
              }}
            />
            <Tile
              icon={<Settings className="size-4.5" aria-hidden="true" />}
              label="Настройки"
              sub="Тема, Telegram"
              onClick={() => {
                onClose()
                onOpenApp('settings')
              }}
            />
          </div>

          {/* яркость */}
          <div className="mt-2.5 flex min-h-12 items-center gap-3 rounded-3xl bg-white/10 px-4 py-2">
            {brightness > 0.62 ? (
              <Sun className="size-4.5 shrink-0 text-white" aria-hidden="true" />
            ) : (
              <SunDim className="size-4.5 shrink-0 text-white" aria-hidden="true" />
            )}
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.02}
              value={brightness}
              aria-label="Яркость экрана"
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.95) ${((brightness - 0.4) / 0.6) * 100}%, rgba(255,255,255,0.25) ${((brightness - 0.4) / 0.6) * 100}%)`,
              }}
            />
          </div>

          {/* ручка закрытия */}
          <button
            type="button"
            aria-label="Свернуть"
            onClick={onClose}
            className="mx-auto mt-4 flex h-8 w-24 items-center justify-center rounded-full bg-white/10 outline-none transition-colors active:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ChevronDown className="size-5 text-white/70" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  )
}
