'use client'

import { useSyncExternalStore } from 'react'
import { useOS, type AppKey } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import AppIcon from './AppIcon'
import { APP_TILE, DOCK_APPS, HOME_GRID } from './app-logos'

const WALLPAPER =
  'radial-gradient(circle at 18% 10%, rgba(124,58,237,0.4), transparent 50%),' +
  'radial-gradient(circle at 85% 22%, rgba(37,99,235,0.35), transparent 48%),' +
  'radial-gradient(circle at 55% 92%, rgba(14,165,233,0.28), transparent 55%),' +
  'linear-gradient(180deg, #0b0b16 0%, #06060c 60%, #030307 100%)'

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

export default function HomeScreen({ onOpenApp }: { onOpenApp: (app: AppKey) => void }) {
  const balance = useOS((s) => s.session?.balance ?? 0)
  const unreadChats = useOS((s) => s.unreadChats)
  const online = useOS((s) => s.online)
  const now = useClock()

  return (
    <div
      className="absolute inset-0 flex flex-col pt-14"
      style={{ backgroundImage: WALLPAPER }}
      role="region"
      aria-label="Домашний экран"
    >
      {/* Виджеты: время + онлайн + кошелёк — компактный стеклянный ряд */}
      <div className="flex items-stretch justify-between gap-2.5 px-6">
        <div
          aria-label="Время и дата"
          className="flex flex-col justify-center rounded-2xl bg-white/10 px-3.5 py-2 backdrop-blur-md"
        >
          <p
            className="text-2xl font-light leading-none tabular-nums text-white"
            suppressHydrationWarning
          >
            {now
              ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : '\u00A0'}
          </p>
          <p className="mt-1.5 text-[11px] leading-none text-white/70" suppressHydrationWarning>
            {now
              ? now.toLocaleDateString('ru-RU', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                })
              : '\u00A0'}
          </p>
        </div>

        <div className="flex items-stretch gap-2.5">
          <div
            aria-label={`Онлайн: ${online}`}
            className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 backdrop-blur-md"
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-base font-semibold tabular-nums text-white">{online}</span>
          </div>

          <button
            type="button"
            aria-label="Открыть кошелёк в приложении Банк"
            onClick={() => onOpenApp('bank')}
            className="min-h-11 rounded-2xl bg-white/10 px-3.5 py-2 text-left backdrop-blur-md outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <span className="block text-[10px] uppercase tracking-wider text-white/60">
              Кошелёк
            </span>
            <span className="mt-0.5 block text-base font-semibold tabular-nums text-white">
              {fmtMoney(balance)}
            </span>
          </button>
        </div>
      </div>

      {/* Сетка приложений */}
      <div className="mt-7 grid grid-cols-4 gap-5 px-6">
        {HOME_GRID.map((app) => (
          <AppIcon
            key={app}
            icon={APP_TILE[app].icon}
            label={APP_TILE[app].label}
            background={APP_TILE[app].background}
            badge={app === 'avito' ? unreadChats : undefined}
            onClick={() => onOpenApp(app)}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* Page-dots */}
      <div className="mb-3 flex items-center justify-center gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
      </div>

      {/* Док */}
      <div className="mx-4 mb-2 rounded-3xl bg-white/10 p-3 backdrop-blur-md">
        <div className="grid grid-cols-4 gap-5">
          {DOCK_APPS.map((app) => (
            <AppIcon
              key={app}
              icon={APP_TILE[app].icon}
              label={APP_TILE[app].label}
              background={APP_TILE[app].background}
              badge={app === 'avito' ? unreadChats : undefined}
              onClick={() => onOpenApp(app)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
