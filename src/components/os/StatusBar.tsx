'use client'

// Статус-бар Resale OS (55-a: iOS-аккуратность): слева — время 15px semibold
// + до трёх иконок непрочитанных уведомлений, справа — компактный кластер:
// индикаторы режимов, чёткий сигнал 4 столбика (реальный Network Information
// API), Wi-Fi/LTE, капсула-батарея (реальная Battery API) с молнией при
// зарядке и колокольчик шторки. Цвет — существующая система variant/plain.
import { useMemo, useSyncExternalStore } from 'react'
import { Bell, Flashlight, Moon, WifiOff } from 'lucide-react'
import { useOS } from '@/lib/store'
import { KIND_APP } from './notif-meta'

// ─── Сигнал: 4 скруглённых столбика, как в iOS ──────────────────────────────
const BAR_H = [4.5, 6.8, 9.2, 12]
function SignalBars({ kind }: { kind: 'offline' | 'slow' | '3g' | '4g' | 'wifi' }) {
  const level = kind === 'offline' ? 0 : kind === 'slow' ? 1 : kind === '3g' ? 2 : kind === '4g' ? 3 : 4
  return (
    <svg viewBox="0 0 17 12" className="h-[11px] w-[16px]" role="img" aria-label={`Сигнал: ${level} из 4`}>
      {BAR_H.map((h, i) => (
        <rect
          key={h}
          x={i * 4.6}
          y={12 - h}
          width="3"
          height={h}
          rx="1"
          fill="currentColor"
          opacity={i < level ? 1 : 0.25}
        />
      ))}
    </svg>
  )
}

// ─── Wi-Fi: три дуги + точка, чёткий штрих как в iOS ────────────────────────
function WifiGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden="true" fill="none">
      <path d="M1.7 4.3a9.7 9.7 0 0 1 12.6 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M4.3 7.1a6 6 0 0 1 7.4 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="8" cy="10.1" r="1.55" fill="currentColor" />
    </svg>
  )
}

// ─── Батарея: капсула (корпус-кольцо + заливка по уровню), молния ───────────
function BatteryIcon({ level, charging }: { level: number; charging: boolean }) {
  const fill = Math.max(5, Math.min(100, level))
  const color = level <= 15 ? '#FF5A4E' : level <= 30 ? '#FFB25A' : 'currentColor'
  return (
    <span className="relative flex items-center" role="img" aria-label={`Батарея ${Math.round(level)}%`}>
      {/* корпус-капсула */}
      <span
        aria-hidden="true"
        className="relative flex h-[12px] w-[24px] items-center overflow-hidden rounded-full border border-current/40 p-[2px]"
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${fill}%`, backgroundColor: charging ? '#3ED598' : color }}
        />
        {charging && (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute left-1/2 top-1/2 size-[8px] -translate-x-1/2 -translate-y-1/2 fill-[#052e16]">
            <path d="M13 2 L4.5 13.5 H11 L10 22 L19.5 9.5 H13 Z" />
          </svg>
        )}
      </span>
      {/* контакт */}
      <span aria-hidden="true" className="ml-[1.5px] block h-[4px] w-[2px] rounded-r-full bg-current opacity-40" />
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
// 'light' — тёмные иконки (светлые приложения, светлые обои Resale OS).
// plain — прозрачный фон (лончер/локскрин поверх обоев), иначе светлая полоса.
// raised — поднять над локскрином (z-52), чтобы статус-бар был виден на замке.
export default function StatusBar({
  variant,
  onBell,
  plain = false,
  raised = false,
}: {
  variant?: 'light' | 'dark'
  onBell?: () => void
  plain?: boolean
  raised?: boolean
}) {
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
      className={`absolute inset-x-0 top-0 flex h-10 items-center justify-between pl-6 pr-3 transition-colors duration-200 ${
        raised ? 'z-[52]' : 'z-40'
      } ${
        isDark ? 'text-white' : plain ? 'text-black' : 'bg-[#F7F8FA] text-black'
      }`}
    >
      {/* время + иконки уведомлений слева */}
      <div className="flex min-w-0 items-center gap-2">
        <time className="text-[15px] font-semibold tabular-nums tracking-[-0.01em]" suppressHydrationWarning>
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
                <Icon className="size-[13px] opacity-80" aria-hidden="true" />
              </span>
            )
          })}
        </span>
      </div>

      <div className="flex items-center gap-2">
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
              <WifiGlyph className="h-[12px] w-4" />
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

        {/* капсула-батарея */}
        <BatteryIcon level={battery} charging={charging} />

        {/* колокольчик с точкой непрочитанных (явный вход в шторку); тач ≥44px */}
        {onBell && (
          <button
            type="button"
            onClick={onBell}
            aria-label={`Уведомления: ${unread.length} непрочитанных`}
            className="relative -mr-2.5 flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <Bell className="h-[17px] w-[17px]" aria-hidden="true" />
            {unread.length > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-[9px] top-[9px] size-[7px] rounded-full bg-[#FF4053]"
              />
            )}
          </button>
        )}
      </div>
    </header>
  )
}
