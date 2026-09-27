'use client'

// Шит «О приложении»: открывается из контекстного меню иконки (долгий тап).
// iOS-стиль: большая иконка, имя, описание, строки-свойства и действия.

import { Info, MinusCircle, Play } from 'lucide-react'
import type { AppKey } from '@/lib/store'
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
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px] sheet-fade"
      />
      <div className="sheet-rise relative mb-3 w-[calc(100%-16px)] max-w-[368px] rounded-[26px] bg-white p-5 text-left shadow-[0_28px_70px_-18px_rgba(0,0,0,0.45)]">
        {/* шапка: иконка + имя */}
        <div className="flex items-center gap-3.5">
          <span className="relative block size-16 shrink-0 overflow-hidden rounded-[18px] shadow-md" style={{ background: tile.background }}>
            <AppTileImage app={app} className="h-full w-full" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[19px] font-bold leading-tight text-neutral-900">{tile.label}</p>
            <p className="mt-0.5 text-[12px] font-medium text-neutral-500">Resale Labs · Версия 3.2</p>
          </div>
        </div>

        {/* описание */}
        <p className="mt-3.5 text-[13px] leading-snug text-neutral-600">{info.desc}</p>

        {/* свойства */}
        <dl className="mt-3.5 divide-y divide-neutral-100 rounded-[16px] bg-neutral-50 px-3.5 text-[12.5px]">
          {[
            ['Категория', info.category],
            ['Размер', info.size],
            ['Возраст', info.age],
            ['Язык', 'Русский'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2">
              <dt className="text-neutral-500">{k}</dt>
              <dd className="font-semibold text-neutral-800">{v}</dd>
            </div>
          ))}
        </dl>

        {/* действия */}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={open}
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-neutral-900 text-[14px] font-bold text-white outline-none transition-transform duration-150 active:scale-[0.98]"
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
              className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-neutral-100 text-[13px] font-semibold text-neutral-700 outline-none transition-transform duration-150 active:scale-[0.98]"
            >
              <MinusCircle className="size-4" aria-hidden="true" />
              Убрать с «Домашнего экрана»
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mx-auto mt-0.5 flex min-h-[44px] items-center gap-1.5 px-3 text-[12.5px] font-medium text-neutral-400 outline-none transition-colors active:text-neutral-600"
          >
            <Info className="size-3.5" aria-hidden="true" />
            Resale OS · Системная карточка
          </button>
        </div>
      </div>
    </div>
  )
}
