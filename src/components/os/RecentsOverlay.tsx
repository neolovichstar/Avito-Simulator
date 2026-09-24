'use client'

// Недавние приложения: тап возвращает в приложение, свайп карточки вверх —
// закрывает его из списка недавних (как на настоящем телефоне).
import { useRef, useState } from 'react'
import { CreditCard, Globe, Receipt, Settings, ShoppingBag, Wrench, Gavel, Trophy, Truck, Crown, X, type LucideIcon } from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { useDrag } from '@/lib/use-swipe'

const APP_META: Record<AppKey, { name: string; icon: LucideIcon; from: string; to: string }> = {
  avito: { name: 'Resale', icon: ShoppingBag, from: '#4ADE80', to: '#065F46' },
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

const SWIPE_CLOSE = 64 // порог свайпа вверх, px

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
  const dismissApp = useOS((s) => s.dismissApp)
  const [dragging, setDragging] = useState<{ key: AppKey; dy: number } | null>(null)
  const dragRef = useRef<{ key: AppKey } | null>(null)
  const suppressClick = useRef(false)

  // Свайп вверх — карточка уезжает, приложение закрывается из недавних
  const { onPointerDown: onCardPointerDown } = useDrag({
    onStart: (e) => {
      const key = ((e.currentTarget as HTMLElement).dataset.appkey ?? '') as AppKey
      if (!key) return
      dragRef.current = { key }
      setDragging({ key, dy: 0 })
    },
    onMove: (_dx, dy) => {
      if (!dragRef.current) return
      setDragging({ key: dragRef.current.key, dy })
    },
    onEnd: (_dx, dy) => {
      const cur = dragRef.current
      dragRef.current = null
      setDragging(null)
      if (!cur) return
      if (dy < -8) {
        suppressClick.current = true
        setTimeout(() => {
          suppressClick.current = false
        }, 90)
      }
      if (dy < -SWIPE_CLOSE) dismissApp(cur.key)
    },
  })

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
              const isDrag = dragging?.key === key
              const dy = isDrag ? Math.min(0, dragging.dy) : 0
              const willClose = isDrag && dy < -SWIPE_CLOSE
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`Вернуться в приложение ${meta.name}. Смахните вверх, чтобы закрыть`}
                  data-appkey={key}
                  onPointerDown={onCardPointerDown}
                  onClick={() => {
                    if (suppressClick.current) return
                    onResume()
                  }}
                  style={{
                    backgroundImage: `linear-gradient(160deg, ${meta.from}, ${meta.to})`,
                    transform: isDrag ? `translateY(${dy}px) scale(${willClose ? 0.92 : 1})` : undefined,
                    opacity: isDrag ? Math.max(0, 1 - Math.abs(dy) / 130) : undefined,
                    touchAction: 'pan-x',
                  }}
                  className={`pointer-events-auto relative flex h-[220px] w-[120px] shrink-0 flex-col rounded-2xl p-3 text-left shadow-2xl ring-1 outline-none transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-white ${
                    willClose ? 'ring-red-400/70' : 'ring-white/15'
                  }`}
                >
                  {/* бейдж «закрыть» проявляется при драге */}
                  {isDrag && dy < -20 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-2 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full bg-red-500 text-white shadow-lg"
                    >
                      <X className="size-3.5" />
                    </span>
                  )}
                  <span className="flex flex-1 items-center justify-center">
                    <Icon className="h-12 w-12 text-white" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium text-white">{meta.name}</span>
                </button>
              )
            })}
          </div>
        )}
        <p className="text-xs text-white/50">
          {openApps.length > 0
            ? 'Нажмите, чтобы вернуться · смахните вверх, чтобы закрыть'
            : 'Откройте любое приложение — оно появится здесь'}
        </p>
      </div>
    </div>
  )
}
