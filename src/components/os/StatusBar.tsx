'use client'

// Статус-бар Android 17: слева — время + до трёх иконок непрочитанных
// уведомлений (как в настоящем Android), справа — компактный кластер:
// индикаторы режимов, сеть (реальный Network Information API), Wi-Fi/LTE и
// ГОРИЗОНТАЛЬНАЯ капсула-батарея (реальная Battery API) с молнией при зарядке.
import { useMemo, useSyncExternalStore } from 'react'
import { Bell, Flashlight, Moon, Wifi, WifiOff } from 'lucide-react'
import { useOS } from '@/lib/store'
import { KIND_APP } from './notif-meta'

// ─── Сетка сигнала: 4 столбика, как в Android ───────────────────────────────
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
          style={{ height: `${h}px`, backgroundColor: 'currentColor', opacity: i < level ? 1 : 0.28 }}
        />
      ))}
    </span>
  )
}

// ─── Батарея: ГОРИЗОНТАЛЬНАЯ капсула, заливка слева направо, молния ─────────
function BatteryIcon({ level, charging }: { level: number; charging: boolean }) {
  const fill = Math.max(4, Math.min(100, level))
  const color = level <= 15 ? '#FF5A4E' : level <= 30 ? '#FFB25A' : 'currentColor'
  return (
    <span className="relative flex items-center" role="img" aria-label={`Батарея ${Math.round(level)}%`}>
      {/* корпус */}
      <span
        aria-hidden="true"
        className="relative flex h-[11.5px] w-[21px] items-center overflow-hidden rounded-[3.5px] border border-current/45 p-[1.5px]"
      >
        <span
          className="block h-full rounded-[1.5px] transition-[width] duration-500"
          style={{ width: `${fill}%`, backgroundColor: charging ? '#3ED598' : color }}
        />
        {charging && (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute left-1/2 top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 fill-[#052e16]">
            <path d="M13 2 L4.5 13.5 H11 L10 22 L19.5 9.5 H13 Z" />
          </svg>
        )}
      </span>
      {/* контакт */}
      <span aria-hidden="true" className="ml-[1.5px] block h-[4px] w-[1.5px] rounded-r-[1px] bg-current opacity-50" />
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

// variant: 'dark' — белые иконки (лончер, тёмные приложения, локскрин),
// 'light' — тёмные иконки на светлой полосе (светлые приложения Resale/Банк).
export default function StatusBar({ variant, onBell }: { variant?: 'light' | 'dark'; onBell?: () => void }) {
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const netOnline = useOS((s) => s.netOnline)
  const netKind = useOS((s) => s.netKind)
  const flashlight = useOS((s) => s.flashlight)
  const dnd = useOS((s) => s.dnd)
  const notifications = useOS((s) => s.notifications)
  const now = useClock()

  const isDark = variant !== 'light'
  // до трёх маленьких иконок приложений с непрочитанными — как в Android
  const unread = useMemo(() => notifications.filter((n) => !n.readAt), [notifications])
  const notifIcons = unread.slice(0, 3).map((n) => KIND_APP[n.kind] ?? KIND_APP.system)

  return (
    <header
      className={`absolute inset-x-0 top-0 z-40 flex h-10 items-center justify-between pl-6 pr-3.5 transition-colors duration-200 ${
        isDark ? 'text-white' : 'bg-[#F7F8FA] text-black'
      }`}
    >
      {/* время + иконки уведомлений слева, как в Android */}
      <div className="flex min-w-0 items-center gap-2">
        <time className="text-[13px] font-semibold tabular-nums" suppressHydrationWarning>
          {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}
        </time>
        <span className="flex items-center gap-1">
          {notifIcons.map((m, i) => {
            const Icon = m.icon
            return (
              <span
                key={`${m.app}-${i}`}
                className="flex items-center"
                title={m.app}
                aria-label={`Уведомление: ${m.app}`}
                role="img"
              >
                <Icon className="size-[13px] opacity-75" aria-hidden="true" />
              </span>
            )
          })}
        </span>
      </div>

      <div className="flex items-center gap-[7px]">
        {/* индикаторы активных режимов — только когда включены */}
        {dnd && (
          <span className="flex items-center" title="Не беспокоить">
            <Moon className="size-[15px] opacity-80" aria-label="Включён режим «Не беспокоить»" role="img" />
          </span>
        )}
        {flashlight && (
          <span className="flex items-center" title="Фонарик включён">
            <Flashlight className="size-[15px] opacity-90" aria-hidden="true" />
          </span>
        )}

        {/* сеть: столбики сигнала + Wi-Fi / LTE / оффлайн */}
        <span className="flex items-center gap-1.5">
          <SignalBars kind={netOnline ? netKind : 'offline'} />
          {netOnline ? (
            netKind === 'wifi' ? (
              <Wifi className="size-4" aria-hidden="true" />
            ) : netKind === '4g' ? (
              <span className="text-[10px] font-bold leading-none tracking-tight" aria-label="Мобильная сеть LTE">
                LTE
              </span>
            ) : netKind === '3g' ? (
              <span className="text-[10px] font-bold leading-none tracking-tight" aria-label="Мобильная сеть 3G">
                3G
              </span>
            ) : null
          ) : (
            <WifiOff className={`size-4 ${isDark ? 'text-red-400' : 'text-red-500'}`} aria-label="Нет подключения к интернету" role="img" />
          )}
        </span>

        {/* горизонтальная капсула-батарея */}
        <BatteryIcon level={battery} charging={charging} />

        {/* колокольчик с точкой непрочитанных (явный вход в шторку) */}
        {onBell && (
          <button
            type="button"
            onClick={onBell}
            aria-label={`Уведомления: ${unread.length} непрочитанных`}
            className="relative -mr-1.5 flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <Bell className="h-[17px] w-[17px]" aria-hidden="true" />
            {unread.length > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-[5px] top-[6px] size-[7px] rounded-full bg-[#FF4053]"
              />
            )}
          </button>
        )}
      </div>
    </header>
  )
}
