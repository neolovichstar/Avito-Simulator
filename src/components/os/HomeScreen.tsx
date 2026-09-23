'use client'

import { useSyncExternalStore } from 'react'
import { CreditCard, Globe, Receipt, Settings, Wrench, Gavel, Trophy, Truck } from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import AppIcon from './AppIcon'

const WALLPAPER =
  'radial-gradient(circle at 18% 10%, rgba(124,58,237,0.4), transparent 50%),' +
  'radial-gradient(circle at 85% 22%, rgba(37,99,235,0.35), transparent 48%),' +
  'radial-gradient(circle at 55% 92%, rgba(14,165,233,0.28), transparent 55%),' +
  'linear-gradient(180deg, #0b0b16 0%, #06060c 60%, #030307 100%)'

// Стилизация лого Авито: два фирменных кружка (синий + зелёный).
function AvitoLogo() {
  return (
    <svg
      width="36"
      height="26"
      viewBox="0 0 36 26"
      fill="none"
      aria-hidden="true"
      className="text-white"
    >
      <circle cx="11" cy="13" r="9" fill="#00AAFF" />
      <circle cx="27" cy="16" r="6.5" fill="#04E061" />
      <circle cx="11" cy="13" r="3.4" fill="#ffffff" />
      <circle cx="27" cy="16" r="2.6" fill="#ffffff" />
    </svg>
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

export default function HomeScreen({ onOpenApp }: { onOpenApp: (app: AppKey) => void }) {
  const balance = useOS((s) => s.session?.balance ?? 0)
  const unreadChats = useOS((s) => s.unreadChats)
  const now = useClock()

  return (
    <div
      className="absolute inset-0 flex flex-col pt-14"
      style={{ backgroundImage: WALLPAPER }}
      role="region"
      aria-label="Домашний экран"
    >
      {/* Виджеты: время + кошелёк */}
      <div className="flex items-start justify-between px-6">
        <div aria-label="Время и дата">
          <p className="text-5xl font-extralight tabular-nums text-white" suppressHydrationWarning>
            {now
              ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : '\u00A0'}
          </p>
          <p className="mt-1 text-xs text-white/70" suppressHydrationWarning>
            {now
              ? now.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              : '\u00A0'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Открыть кошелёк в приложении Банк"
          onClick={() => onOpenApp('bank')}
          className="min-h-11 rounded-2xl bg-white/10 px-4 py-2.5 text-left backdrop-blur-md outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <span className="block text-[11px] uppercase tracking-wider text-white/60">
            Кошелёк
          </span>
          <span className="mt-0.5 block text-lg font-semibold tabular-nums text-white">
            {fmtMoney(balance)}
          </span>
        </button>
      </div>

      {/* Сетка приложений */}
      <div className="mt-8 grid grid-cols-4 gap-5 px-6">
        <AppIcon
          icon={<AvitoLogo />}
          label="Avito"
          color="#FFFFFF"
          badge={unreadChats}
          onClick={() => onOpenApp('avito')}
        />
        <AppIcon
          icon={<CreditCard className="h-7 w-7 text-white" aria-hidden="true" />}
          label="Банк"
          color="#21A038"
          onClick={() => onOpenApp('bank')}
        />
        <AppIcon
          icon={<Receipt className="h-7 w-7 text-white" aria-hidden="true" />}
          label="Налоги"
          color="#2D3748"
          onClick={() => onOpenApp('taxes')}
        />
        <AppIcon
          icon={<Globe className="h-7 w-7 text-white" aria-hidden="true" />}
          label="Браузер"
          color="#0EA5E9"
          onClick={() => onOpenApp('browser')}
        />
        <AppIcon
          icon={<Settings className="h-7 w-7 text-white" aria-hidden="true" />}
          label="Настройки"
          color="#6B7280"
          onClick={() => onOpenApp('settings')}
        />
        <AppIcon
          icon={<Wrench className="h-7 w-7 text-white" aria-hidden="true" />}
          label="Сервис"
          color="#F59E0B"
          onClick={() => onOpenApp('repair')}
        />
        <AppIcon
          icon={<Gavel className="h-7 w-7 text-white" aria-hidden="true" />}
          label="Аукцион"
          color="#D4A017"
          onClick={() => onOpenApp('auction')}
        />
        <AppIcon
          icon={<Trophy className="h-7 w-7 text-white" aria-hidden="true" />}
          label="Задания"
          color="#7C3AED"
          onClick={() => onOpenApp('career')}
        />
        <AppIcon
          icon={<Truck className="h-7 w-7 text-white" aria-hidden="true" />}
          label="Доставки"
          color="#065F46"
          onClick={() => onOpenApp('delivery')}
        />
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
          <AppIcon
            icon={<AvitoLogo />}
            label="Avito"
            color="#FFFFFF"
            badge={unreadChats}
            onClick={() => onOpenApp('avito')}
          />
          <AppIcon
            icon={<CreditCard className="h-7 w-7 text-white" aria-hidden="true" />}
            label="Банк"
            color="#21A038"
            onClick={() => onOpenApp('bank')}
          />
          <AppIcon
            icon={<Gavel className="h-7 w-7 text-white" aria-hidden="true" />}
            label="Аукцион"
            color="#D4A017"
            onClick={() => onOpenApp('auction')}
          />
          <AppIcon
            icon={<Trophy className="h-7 w-7 text-white" aria-hidden="true" />}
            label="Задания"
            color="#7C3AED"
            onClick={() => onOpenApp('career')}
          />
        </div>
      </div>
    </div>
  )
}
