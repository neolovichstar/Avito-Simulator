'use client'

import { useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import {
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Bell,
  Flashlight,
  Signal,
  Wifi,
} from 'lucide-react'
import { useOS } from '@/lib/store'

function batteryIndicator(battery: number, charging: boolean): ReactElement {
  const cls = 'h-4 w-4'
  if (charging) return <BatteryCharging className={cls} aria-hidden="true" />
  if (battery >= 85) return <BatteryFull className={cls} aria-hidden="true" />
  if (battery >= 40) return <BatteryMedium className={cls} aria-hidden="true" />
  if (battery >= 15) return <BatteryLow className={cls} aria-hidden="true" />
  return <BatteryWarning className={cls} aria-hidden="true" />
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

export default function StatusBar({ variant, onBell }: { variant: 'light' | 'dark'; onBell?: () => void }) {
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const online = useOS((s) => s.online)
  const flashlight = useOS((s) => s.flashlight)
  const unreadNotifs = useOS((s) => s.notifications.filter((n) => !n.readAt).length)
  const now = useClock()

  const batteryEl = batteryIndicator(battery, charging)
  const isDark = variant === 'dark'

  return (
    <header
      className={`absolute inset-x-0 top-0 z-40 flex h-10 items-center justify-between px-5 ${
        isDark ? 'text-white' : 'text-slate-900'
      }`}
    >
      <time className="text-sm font-semibold tabular-nums" suppressHydrationWarning>
        {now
          ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          : ''}
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
        <Signal className="h-4 w-4" aria-hidden="true" />
        <Wifi className="h-4 w-4" aria-hidden="true" />
        {flashlight && <Flashlight className="h-4 w-4 text-amber-300" aria-hidden="true" />}
        <span className="flex items-center gap-1">
          {batteryEl}
          <span className="text-xs font-medium tabular-nums">{battery}%</span>
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
