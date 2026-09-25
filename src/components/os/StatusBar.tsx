'use client'

// Статус-бар в духе Android 16: минимализм без подложек.
// Слева — время. Справа — компактный кластер состояния: индикаторы режима,
// сеть (реальный Network Information API), вертикальная капсула-батарея
// (реальная Battery API) с молнией при зарядке и колокольчик уведомлений
// с точкой непрочитанных.
import { useSyncExternalStore } from 'react'
import { Bell, Flashlight, Moon, Wifi, WifiOff } from 'lucide-react'
import { useOS } from '@/lib/store'

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

// ─── Батарея: ВЕРТИКАЛЬНАЯ капсула с зарядом внутри, молния при зарядке ─────
// Android-стиль: узкий скруглённый корпус, заливка снизу вверх, вывод-контакт
// сверху. Цвет заливки следует за темой статус-бара (currentColor).
function BatteryIcon({ level, charging }: { level: number; charging: boolean }) {
  const fill = Math.max(5, Math.min(100, level))
  const color = level <= 15 ? '#FF5A4E' : level <= 30 ? '#FFB25A' : 'currentColor'
  return (
    <span className="relative flex flex-col items-center" role="img" aria-label={`Батарея ${Math.round(level)}%`}>
      {/* контакт батареи */}
      <span aria-hidden="true" className="mb-[1.5px] block h-[2px] w-[4px] rounded-t-[1.5px] bg-current opacity-50" />
      <span
        aria-hidden="true"
        className="relative flex h-[14px] w-[8px] items-end overflow-hidden rounded-[2.5px] border border-current/45 p-[1.5px]"
      >
        <span
          className="block w-full rounded-[1.5px] transition-[height] duration-500"
          style={{ height: `${fill}%`, backgroundColor: charging ? '#3ED598' : color }}
        />
      </span>
      {charging && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="absolute bottom-[1px] left-1/2 size-[9px] -translate-x-1/2 fill-[#052e16]"
        >
          <path d="M13 2 L4.5 13.5 H11 L10 22 L19.5 9.5 H13 Z" />
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

// variant: 'dark' — белые иконки (лончер, тёмные приложения, локскрин),
// 'light' — тёмные иконки на светлой полосе (светлые приложения Resale/Банк).
export default function StatusBar({ variant, onBell }: { variant?: 'light' | 'dark'; onBell?: () => void }) {
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const netOnline = useOS((s) => s.netOnline)
  const netKind = useOS((s) => s.netKind)
  const flashlight = useOS((s) => s.flashlight)
  const dnd = useOS((s) => s.dnd)
  const unreadNotifs = useOS((s) => s.notifications.filter((n) => !n.readAt).length)
  const now = useClock()

  const isDark = variant !== 'light'

  return (
    <header
      className={`absolute inset-x-0 top-0 z-40 flex h-10 items-center justify-between pl-6 pr-3.5 transition-colors duration-200 ${
        isDark ? 'text-white' : 'bg-[#F7F8FA] text-black'
      }`}
    >
      {/* время — единственный элемент слева, как в Android 16 */}
      <time className="text-[13px] font-semibold tabular-nums" suppressHydrationWarning>
        {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}
      </time>

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

        {/* вертикальная капсула-батарея */}
        <BatteryIcon level={battery} charging={charging} />

        {/* колокольчик с точкой непрочитанных */}
        {onBell && (
          <button
            type="button"
            onClick={onBell}
            aria-label={`Уведомления: ${unreadNotifs} непрочитанных`}
            className="relative -mr-1.5 flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <Bell className="h-[17px] w-[17px]" aria-hidden="true" />
            {unreadNotifs > 0 && (
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
