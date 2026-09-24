'use client'

import { CreditCard, Globe, Receipt, Settings, ShoppingBag, Wrench, Gavel, Trophy, Truck, Crown, type LucideIcon } from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'

const APP_META: Record<AppKey, { name: string; icon: LucideIcon; from: string; to: string }> = {
  avito: { name: 'Сделка', icon: ShoppingBag, from: '#B37BF5', to: '#5B21B6' },
  bank: { name: 'Банк', icon: CreditCard, from: '#21A038', to: '#14532d' },
  taxes: { name: 'Налоги', icon: Receipt, from: '#4b5563', to: '#111827' },
  browser: { name: 'Браузер', icon: Globe, from: '#0ea5e9', to: '#0c4a6e' },
  settings: { name: 'Настройки', icon: Settings, from: '#9ca3af', to: '#374151' },
  repair: { name: 'Сервис', icon: Wrench, from: '#f59e0b', to: '#78350f' },
  auction: { name: 'Аукцион', icon: Gavel, from: '#d4a017', to: '#713f12' },
  career: { name: 'Задания', icon: Trophy, from: '#7c3aed', to: '#2e1065' },
  delivery: { name: 'Доставки', icon: Truck, from: '#059669', to: '#064e3b' },
  leaderboard: { name: 'Лидеры', icon: Crown, from: '#d4a017', to: '#78350f' },
}

export default function RecentsOverlay({
  open,
  onClose,
  onResume,
}: {
  open: boolean
  onClose: () => void
  onResume: () => void
}) {
  const openApps = useOS((s) => s.openApps)

  if (!open) return null

  return (
    <div className="absolute inset-0 z-40">
      <button
        type="button"
        aria-label="Закрыть недавние приложения"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-xl"
      />
      <div className="pointer-events-none relative flex h-full flex-col items-center justify-center gap-6">
        {openApps.length === 0 ? (
          <p className="text-sm text-white/60">Нет недавних приложений</p>
        ) : (
          <div className="flex w-full items-center gap-4 overflow-x-auto px-8 py-4">
            {openApps.map((key) => {
              const meta = APP_META[key] ?? APP_META.settings
              const Icon = meta.icon
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`Вернуться в приложение ${meta.name}`}
                  onClick={onResume}
                  className="pointer-events-auto flex h-[220px] w-[120px] shrink-0 flex-col rounded-2xl p-3 text-left shadow-2xl ring-1 ring-white/15 outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
                  style={{
                    backgroundImage: `linear-gradient(160deg, ${meta.from}, ${meta.to})`,
                  }}
                >
                  <span className="flex flex-1 items-center justify-center">
                    <Icon className="h-12 w-12 text-white" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium text-white">{meta.name}</span>
                </button>
              )
            })}
          </div>
        )}
        <p className="text-xs text-white/50">Нажмите на карточку, чтобы вернуться в приложение</p>
      </div>
    </div>
  )
}
