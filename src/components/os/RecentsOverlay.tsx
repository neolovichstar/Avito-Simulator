'use client'

// Недавние приложения в духе Android 16: горизонтальная карусель карточек
// («скриншот» = логотип приложения на фирменном фоне), в шапке карточки —
// иконка и имя, внизу — кнопки «Открыть» и закрыть. Свайп карточки вверх —
// закрывает приложение из недавних, в конце ленты — «Очистить все».
import { useRef, useState } from 'react'
import { Eraser, X } from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { useDrag } from '@/lib/use-swipe'
import { APP_TILE, AppTileImage } from './app-logos'

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

  // Тап по карточке — вернуться в приложение (как в настоящих recents)
  const resume = (key: AppKey) => {
    if (suppressClick.current) return
    if (useOS.getState().currentApp !== key) useOS.getState().openApp(key)
    onClose()
    onResume()
  }

  const clearAll = () => {
    for (const key of useOS.getState().openApps) dismissApp(key)
    onClose()
    onResume()
  }

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
          <div className="m3-rise flex flex-col items-center gap-3">
            <div className="flex size-16 items-center justify-center rounded-[22px] bg-white/[0.07]">
              <Eraser className="size-7 text-white/40" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-white/80">Нет недавних приложений</p>
            <p className="text-xs text-white/45">Откройте любое — оно появится здесь</p>
          </div>
        ) : (
          <div className="flex w-full items-center gap-4 overflow-x-auto px-7 py-4">
            {openApps.map((key) => {
              const tile = APP_TILE[key]
              const isDrag = dragging?.key === key
              const dy = isDrag ? Math.min(0, dragging.dy) : 0
              const willClose = isDrag && dy < -SWIPE_CLOSE
              return (
                <div
                  key={key}
                  data-appkey={key}
                  onPointerDown={onCardPointerDown}
                  onClick={() => resume(key)}
                  style={{
                    transform: isDrag ? `translateY(${dy}px)` : undefined,
                    opacity: isDrag ? Math.max(0, 1 - Math.abs(dy) / 130) : undefined,
                    touchAction: 'pan-x',
                  }}
                  className="pointer-events-auto m3-rise-stagger shrink-0 select-none"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Вернуться в приложение ${tile.label}. Смахните вверх, чтобы закрыть`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        resume(key)
                      }
                    }}
                    className={`w-[168px] cursor-pointer overflow-hidden rounded-[20px] bg-neutral-900 shadow-[0_26px_60px_-18px_rgba(0,0,0,0.9)] ring-1 outline-none transition-shadow ${
                      willClose ? 'ring-2 ring-red-400/80' : 'ring-white/15'
                    }`}
                  >
                    {/* шапка карточки: иконка + имя приложения */}
                    <div className="flex items-center gap-2 bg-black/45 px-3 py-2.5">
                      <span className="block size-6 shrink-0 overflow-hidden rounded-[7px]">
                        <AppTileImage app={key} className="size-6" />
                      </span>
                      <span className="truncate text-[12px] font-bold text-white/95">{tile.label}</span>
                    </div>
                    {/* «скриншот»: логотип приложения на фирменном фоне */}
                    <div
                      className="flex h-[164px] items-center justify-center"
                      style={{ backgroundImage: tile.background }}
                    >
                      <AppTileImage app={key} className="size-[74px] rounded-[1.15rem] shadow-xl ring-1 ring-black/10" />
                    </div>
                    {/* низ: «Открыть» + крестик */}
                    <div className="flex items-center gap-1.5 bg-black/45 p-2">
                      <span className="flex h-9 flex-1 items-center justify-center rounded-full bg-white/12 text-[11px] font-bold text-white transition-colors active:bg-white/20">
                        Открыть
                      </span>
                      <button
                        type="button"
                        aria-label={`Закрыть ${tile.label} из недавних`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (suppressClick.current) return
                          dismissApp(key)
                        }}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-white/85 outline-none transition-colors active:bg-white/25 focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* «Очистить все» в конце ленты */}
            <div className="pointer-events-auto flex shrink-0 items-center pl-1">
              <button
                type="button"
                onClick={clearAll}
                aria-label="Очистить все недавние приложения"
                className="flex h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-[13px] font-bold text-white/90 outline-none ring-1 ring-white/10 transition-all duration-200 active:scale-[0.96] active:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
              >
                <Eraser className="size-4" aria-hidden="true" />
                Очистить все
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-white/50">
          {openApps.length > 0
            ? 'Нажмите, чтобы вернуться · смахните вверх, чтобы закрыть'
            : 'Смахните вверх от низа экрана, чтобы вернуться домой'}
        </p>
      </div>
    </div>
  )
}
