'use client'

// Статус-бар как у настоящего смартфона: живые часы, реальный тип сети
// (Network Information API), настоящая батарея (Battery API) с уровнем,
// индикаторы фонарика и «Не беспокоить», счётчик онлайна, кнопка уведомлений.
import { useSyncExternalStore } from 'react'
import { Bell, Flashlight, Moon, Wifi, WifiOff } from 'lucide-react'
import { useOS } from '@/lib/store'

// ─── Сетка сигнала: 4 столбика, как в Android/iOS ───────────────────────────
function SignalBars({ kind }: { kind: 'offline' | 'slow' | '3g' | '4g' | 'wifi' }) {
  const level = kind === 'offline' ? 0 : kind === 'slow' ? 1 : kind === '3g' ? 2 : kind === '4g' ? 3 : 4
  const heights = [4, 6.5, 9, 11.5]
  return (
    <span className="flex items-end gap-[2px]" aria-label={`Сигнал: ${level} из 4`} role="img">
      {heights.map((h, i) => (
        <span
          key={h}
          aria-hidden="true"
          className="w-[3px] rounded-[1px] transition-colors"
          style={{
            height: `${h}px`,
            backgroundColor: i < level ? 'currentColor' : 'currentColor',
            opacity: i < level ? 1 : 0.28,
          }}
        />
      ))}
    </span>
  )
}

// ─── Батарея: корпус + заливка по уровню + молния при зарядке ───────────────
function BatteryIcon({ level, charging }: { level: number; charging: boolean }) {
  const fill = Math.max(4, Math.min(100, level))
  const color = level <= 15 ? '#FF453A' : level <= 30 ? '#FF9F0A' : '#ffffff'
  return (
    <span className="relative flex items-center" role="img" aria-label={`Батарея ${Math.round(level)}%`}>
      <span aria-hidden="true" className="relative block h-[12.5px] w-[25px] rounded-[4px] border border-current/40 p-[1.5px]">
        <span
          className="block h-full rounded-[2px] transition-[width] duration-500"
          style={{ width: `${fill}%`, backgroundColor: charging ? '#34D399' : color }}
        />
      </span>
      <span aria-hidden="true" className="ml-[1px] block h-[4px] w-[2px] rounded-r-sm bg-current/40" />
      {charging && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="absolute left-1/2 top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 fill-[#052E16] stroke-[#052E16]"
          style={{ color: '#052E16' }}
        >
          <path d="M13 2 L4.5 13.5 H11 L10 22 L19.5 9.5 H13 Z" strokeWidth="0.5" />
        </svg>
      )}
    </span>
  )
}

// Живые тики каждые 1000 мс без setState в эффекте (useSyncExternalStore).
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

export default function StatusBar({ variant, onBell }: { variant?: 'light' | 'dark'; onBell?: () => void }) {
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const netOnline = useOS((s) => s.netOnline)
  const netKind = useOS((s) => s.netKind)
  const online = useOS((s) => s.online)
  const flashlight = useOS((s) => s.flashlight)
  const dnd = useOS((s) => s.dnd)
  const unreadNotifs = useOS((s) => s.notifications.filter((n) => !n.readAt).length)
  const now = useClock()

  const isDark = variant !== 'light'

  return (
    <header
      className={`absolute inset-x-0 top-0 z-40 flex h-10 items-center justify-between px-5 ${
        isDark ? 'text-white' : 'text-slate-900'
      }`}
    >
      <time className="text-[13px] font-semibold tabular-nums" suppressHydrationWarning>
        {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}
      </time>

      <div className="flex items-center gap-2">
        <span
          className={`flex items-center gap-1 text-xs tabular-nums ${
            isDark ? 'text-white/80' : 'text-slate-900/70'
          }`}
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {online}
        </span>
        {/* сеть: реальные столбики сигнала + Wi-Fi/оффлайн */}
        <SignalBars kind={netOnline ? netKind : 'offline'} />
        {netOnline ? (
          <Wifi className="h-4 w-4" aria-hidden="true" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-400" aria-label="Нет подключения к интернету" role="img" />
        )}
        {flashlight && <Flashlight className="h-4 w-4 text-amber-300" aria-hidden="true" />}
        {dnd && (
          <span className="flex items-center" title="Не беспокоить">
            <Moon className="h-4 w-4 text-violet-300" aria-label="Включён режим «Не беспокоить»" role="img" />
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <BatteryIcon level={battery} charging={charging} />
          <span className="text-[12px] font-medium tabular-nums">{Math.round(battery)}%</span>
        </span>
        {onBell && (
          <button
            type="button"
            onClick={onBell}
            aria-label={`Уведомления: ${unreadNotifs} непрочитанных`}
            className="relative -mr-1 flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {unreadNotifs > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#FF4053] px-0.5 text-[9px] font-bold text-white">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  )
}
