'use client'

// Шит «О приложении»: открывается из контекстного меню иконки (долгий тап).
// iOS-стиль: большая иконка, имя, описание, строки-свойства и действия.

import { Info, MinusCircle, Play } from 'lucide-react'
import type { AppKey } from '@/lib/store'
import { useOS } from '@/lib/store'
import { APP_INFO, APP_TILE, AppTileImage } from './app-logos'

export default function AppInfoSheet({
  app,
  onClose,
  onOpenApp,
  onRemove,
  canRemove,
}: {
  app: AppKey
  onClose: () => void
  onOpenApp: (app: AppKey) => void
  /** Убрать с «Домашнего экрана» (не удаляет приложение, только ярлык). */
  onRemove?: () => void
  canRemove?: boolean
}) {
  const tile = APP_TILE[app]
  const info = APP_INFO[app]
  const dark = useOS((s) => s.theme) === 'dark'

  const open = () => {
    onClose()
    onOpenApp(app)
  }

  return (
    <div
      className="absolute inset-0 z-[70] flex items-end justify-center"
      role="dialog"
      aria-label={`О приложении ${tile.label}`}
    >
      <button
        type="button"
        aria-label="Закрыть"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 backdrop-blur-[2px] sheet-fade ${dark ? 'bg-black/60' : 'bg-black/35'}`}
      />
      <div className={`sheet-rise relative mb-3 w-[calc(100%-16px)] max-w-[368px] rounded-[26px] p-5 text-left ring-1 backdrop-blur-2xl ${
        dark
          ? 'bg-[#232529]/[0.94] ring-white/[0.12] shadow-[0_28px_80px_-18px_rgba(0,0,0,0.85)]'
          : 'bg-white/85 ring-black/[0.05] shadow-[0_10px_30px_-12px_rgba(10,10,15,0.14),0_28px_70px_-18px_rgba(0,0,0,0.3)]'
      }`}>
        {/* шапка: иконка + имя */}
        <div className="flex items-center gap-3.5">
          <span
            className="relative block size-16 shrink-0 overflow-hidden rounded-[15px] shadow-[0_8px_16px_-6px_rgba(0,0,0,0.28)] ring-1 ring-black/[0.05]"
            style={{ background: tile.background }}
          >
            <AppTileImage app={app} className="h-full w-full" />
          </span>
          <div className="min-w-0">
            <p className={`truncate text-[19px] font-bold leading-tight ${dark ? 'text-white' : 'text-[#111114]'}`}>{tile.label}</p>
            <p className={`mt-0.5 text-[12px] font-medium ${dark ? 'text-white/50' : 'text-[rgba(60,60,67,0.62)]'}`}>Resale Labs · Версия 3.2</p>
          </div>
        </div>

        {/* описание */}
        <p className={`mt-3.5 text-[13px] leading-snug ${dark ? 'text-white/55' : 'text-[rgba(60,60,67,0.62)]'}`}>{info.desc}</p>

        {/* свойства */}
        <dl className={`mt-3.5 divide-y rounded-[16px] px-3.5 text-[12.5px] ${dark ? 'divide-white/[0.08] bg-white/[0.06]' : 'divide-black/[0.06] bg-black/[0.04]'}`}>
          {[
            ['Категория', info.category],
            ['Размер', info.size],
            ['Возраст', info.age],
            ['Язык', 'Русский'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2">
              <dt className={dark ? 'text-white/50' : 'text-[rgba(60,60,67,0.62)]'}>{k}</dt>
              <dd className={`font-semibold ${dark ? 'text-white' : 'text-[#111114]'}`}>{v}</dd>
            </div>
          ))}
        </dl>

        {/* действия */}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={open}
            className={`flex h-12 items-center justify-center gap-2 rounded-[14px] text-[14px] font-bold outline-none transition-transform duration-150 active:scale-[0.98] ${
              dark ? 'bg-white text-neutral-900' : 'bg-[#111114] text-white'
            }`}
          >
            <Play className="size-4 fill-current" aria-hidden="true" />
            Открыть
          </button>
          {canRemove && onRemove && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onRemove()
              }}
              className={`flex h-11 items-center justify-center gap-2 rounded-[14px] text-[13px] font-semibold outline-none transition-transform duration-150 active:scale-[0.98] ${
                dark ? 'bg-white/[0.08] text-white' : 'bg-black/[0.06] text-[#111114]'
              }`}
            >
              <MinusCircle className="size-4" aria-hidden="true" />
              Убрать с «Домашнего экрана»
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`mx-auto mt-0.5 flex min-h-[44px] items-center gap-1.5 px-3 text-[12.5px] font-medium outline-none transition-colors ${
              dark ? 'text-white/35 active:text-white/60' : 'text-[rgba(60,60,67,0.35)] active:text-[rgba(60,60,67,0.62)]'
            }`}
          >
            <Info className="size-3.5" aria-hidden="true" />
            Resale OS · Системная карточка
          </button>
        </div>
      </div>
    </div>
  )
}
