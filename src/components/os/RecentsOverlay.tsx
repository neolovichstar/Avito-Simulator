'use client'

// Недавние приложения КАК В НАСТОЯЩЕМ ТЕЛЕФОНЕ (Android 16 / Pixel):
//  • каждое открытое приложение живёт в своём слое и НЕ выгружается при выходе
//    на домашний экран — как в Android: возвращаешься ровно на тот же экран;
//  • при открытии recents слои съезжают в карточки-миниатюры — это ЖИВЫЕ превью
//    реального содержимого приложений, а не логотипы на плашках;
//  • тап по карточке — вернуться (слой разворачивается на весь экран, FLIP),
//    свайп карточки вверх — закрыть приложение,
//    горизонтальный драг — прокрутка ленты с притяжкой к карточке,
//    «Очистить все» — как в Pixel.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react'
import { Eraser } from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { sound } from '@/lib/sound'
import { APP_TILE, AppTileImage } from './app-logos'

const CLOSE_THRESHOLD = 64 // свайп карточки вверх для закрытия, px
const AXIS_LOCK = 7 // порог определения оси жеста, px
const CARD_SCALE = 0.62 // масштаб миниатюры относительно экрана
const CARD_GAP = 18 // зазор между карточками, px
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

// ─── Слой приложения ─────────────────────────────────────────────────────────
// Всегда смонтирован (пока приложение в недавних). Активный слой показывает
// приложение на весь экран, остальные — невидимы. В recents слой сжимается
// в карточку-миниатюру.
function AppLayer({
  app,
  active,
  open,
  style,
  children,
  onCardPointerDown,
  onCardActivate,
}: {
  app: AppKey
  active: boolean
  open: boolean
  style: CSSProperties
  /** Кэшированное поддерево приложения: ре-рендер RecentsOverlay его не трогает. */
  children: ReactNode
  onCardPointerDown?: (e: RPointerEvent<HTMLDivElement>) => void
  onCardActivate?: () => void
}) {
  const innerRef = useRef<HTMLDivElement>(null)
  const prevOpen = useRef(open)

  // Анимация «входа» в приложение при первом открытии / возврате из лончера.
  // Возврат ИЗ recents не анимируем здесь — траекторию даёт FLIP-переход слоя.
  useEffect(() => {
    const wasOpen = prevOpen.current
    prevOpen.current = open
    if (!active || wasOpen || open) return
    innerRef.current?.animate?.(
      [{ opacity: 0.55, transform: 'scale(0.985)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 320, easing: EASE },
    )
  }, [active, open])

  return (
    <div style={style} className="absolute inset-0 bg-black" aria-hidden={!(active || open)}>
      <div ref={innerRef} className="h-full w-full">{children}</div>
      {/* прозрачный перехватчик касаний поверх карточки в recents:
          тап — вернуться, драг — закрыть/прокрутить ленту.
          pointer-events:auto на ребёнке работает даже при none на родителе. */}
      {open && (onCardPointerDown || onCardActivate) && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Вернуться в приложение ${APP_TILE[app].label}. Смахните вверх, чтобы закрыть`}
          className="absolute inset-0 z-50 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{ touchAction: 'none', pointerEvents: 'auto' }}
          onPointerDown={onCardPointerDown}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onCardActivate?.()
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Recents ─────────────────────────────────────────────────────────────────
// Кэш поддеревьев приложений (module-level, RecentsOverlay — синглтон):
// БЕЗ него каждый перерисовочный тик ленты (setStrip на каждый pointermove)
// ре-рендерил бы ВСЕ открытые приложения — главный источник лагов recents.
// Инвалидация — по удалению из недавних.
const nodeCache = new Map<AppKey, ReactNode>()

export default function RecentsOverlay({
  open,
  onClose,
  onResume,
  renderApp,
}: {
  open: boolean
  onClose: () => void
  onResume: () => void
  renderApp: (app: AppKey) => ReactNode
}) {
  const openApps = useOS((s) => s.openApps)
  const currentApp = useOS((s) => s.currentApp)

  const nodes = useMemo(() => {
    for (const k of [...nodeCache.keys()]) {
      if (!openApps.includes(k)) nodeCache.delete(k)
    }
    const m = new Map<AppKey, ReactNode>()
    for (const k of openApps) {
      let node = nodeCache.get(k)
      if (!node) {
        node = renderApp(k)
        nodeCache.set(k, node)
      }
      m.set(k, node)
    }
    return m
  }, [openApps, renderApp])

  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 390, h: 780 })
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setBox({ w: el.offsetWidth || 390, h: el.offsetHeight || 780 })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const [strip, setStrip] = useState(0) // смещение ленты, px (во время драга и после притяжки)
  const [stripping, setStripping] = useState(false) // идёт горизонтальный драг ленты
  const [dragCard, setDragCard] = useState<{ key: AppKey; dy: number } | null>(null)
  const [flying, setFlying] = useState<AppKey[]>([]) // карточки, улетающие вверх
  const [clearing, setClearing] = useState(false)
  const stripRef = useRef(0)

  const n = openApps.length
  const cardW = Math.round(box.w * CARD_SCALE)
  const cardH = Math.round(box.h * CARD_SCALE)
  const pitch = cardW + CARD_GAP
  const cx = (box.w - cardW) / 2
  const cy = Math.max(14, (box.h - cardH) / 2 - 12)
  // Якорь ленты выводим из состояния: пока recents открыт, currentApp не меняется
  // (тап по карточке одновременно закрывает recents), значит он стабилен.
  const anchorRaw = open ? (currentApp ? openApps.indexOf(currentApp) : 0) : 0
  const anchor = Math.min(Math.max(0, anchorRaw), Math.max(0, n - 1))
  const minStrip = (anchor - Math.max(0, n - 1)) * pitch
  const maxStrip = anchor * pitch
  const clampedStrip = Math.min(maxStrip, Math.max(minStrip, strip))

  // Корректировка состояния при открытии recents (паттерн React «adjust state
  // when a prop changes»): сбрасываем ленту и жесты ровно один раз на открытие.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setStrip(0)
      setStripping(false)
      setDragCard(null)
      setFlying([])
      setClearing(false)
    }
  }
  // зеркало strip для слушателей Pointer Events (читается вне рендера)
  useEffect(() => {
    stripRef.current = strip
  }, [strip])

  // ── действия ───────────────────────────────────────────────────────────────
  const resume = (key: AppKey) => {
    if (clearing) return
    sound.tap()
    useOS.getState().openApp(key)
    onClose()
    onResume()
  }

  const flyAway = (key: AppKey) => {
    sound.swipe()
    setFlying((f) => (f.includes(key) ? f : [...f, key]))
    window.setTimeout(() => {
      useOS.getState().dismissApp(key)
      setFlying((f) => f.filter((k) => k !== key))
    }, 280)
  }

  const clearAll = () => {
    if (n === 0 || clearing) return
    sound.pop()
    setClearing(true)
    window.setTimeout(() => {
      for (const k of useOS.getState().openApps) useOS.getState().dismissApp(k)
      setClearing(false)
      onClose()
    }, 380 + n * 45)
  }

  // ── геометрия слоя ─────────────────────────────────────────────────────────
  // scale() работает вокруг ЦЕНТРА слоя, поэтому чтобы получить карточку с
  // левым-верхним углом в (X, Y), translate надо уменьшить на (1-scale)*size/2.
  const originShiftX = ((1 - CARD_SCALE) * box.w) / 2
  const originShiftY = ((1 - CARD_SCALE) * box.h) / 2

  const styleFor = (key: AppKey): CSSProperties => {
    const i = Math.max(0, openApps.indexOf(key))
    const isFlying = flying.includes(key)
    const gone = isFlying || clearing
    const isDrag = dragCard?.key === key

    if (open) {
      const x = cx + (i - anchor) * pitch + clampedStrip - originShiftX
      const dy = isDrag ? Math.min(0, dragCard.dy) : 0
      const y = cy + dy - (gone ? box.h * 0.95 : 0) - originShiftY
      const opacity = gone ? 0 : isDrag ? Math.max(0, 1 + dy / 280) : 1
      const noTransition = isDrag || (stripping && !gone)
      return {
        transform: `translate3d(${x}px, ${y}px, 0) scale(${CARD_SCALE})`,
        opacity,
        borderRadius: 28,
        overflow: 'hidden',
        boxShadow: '0 34px 80px -24px rgba(0,0,0,0.85)',
        pointerEvents: 'none',
        zIndex: 20 + (n - i),
        transition: noTransition
          ? 'opacity 240ms ease'
          : `transform 420ms ${EASE}, opacity 260ms ease, border-radius 420ms ${EASE}`,
        willChange: 'transform, opacity',
      }
    }

    const isActive = currentApp === key
    return {
      transform: 'translate3d(0, 0, 0) scale(1)',
      opacity: isActive ? 1 : 0,
      visibility: isActive ? 'visible' : 'hidden',
      borderRadius: 0,
      overflow: 'hidden',
      boxShadow: 'none',
      // скрытые слои: не создаём компоузитор-слои и изолируем paint —
      // фоновые приложения перестают давить на GPU
      pointerEvents: isActive ? 'auto' : 'none',
      zIndex: isActive ? 10 : 1,
      contain: isActive ? undefined : 'layout paint style',
      willChange: isActive ? 'transform, opacity' : 'auto',
      transition: `transform 420ms ${EASE}, opacity 240ms ease, visibility 0s linear ${isActive ? '0s' : '260ms'}`,
    } as CSSProperties
  }

  // ── жесты карточки: тап / вертикаль (закрыть) / горизонталь (лента) ────────
  const cardPointers = (key: AppKey) => ({
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      if (clearing || flying.includes(key) || (e.pointerType === 'mouse' && e.button !== 0)) return
      const startId = e.pointerId
      const sx = e.clientX
      const sy = e.clientY
      const base = stripRef.current
      const localMin = minStrip
      const localMax = maxStrip
      const localAnchor = anchor
      const localN = n
      let axis: 'x' | 'y' | null = null
      let dy = 0

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== startId) return
        const dx = ev.clientX - sx
        dy = ev.clientY - sy
        if (!axis && (Math.abs(dx) > AXIS_LOCK || Math.abs(dy) > AXIS_LOCK)) {
          axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
          if (axis === 'x') setStripping(true)
          else setDragCard({ key, dy: 0 })
        }
        if (axis === 'x') {
          const next = Math.min(localMax, Math.max(localMin, base + dx))
          stripRef.current = next
          setStrip(next)
        } else if (axis === 'y') {
          setDragCard({ key, dy: Math.min(0, dy) })
        }
      }
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== startId) return
        cleanup()
        if (!axis) {
          resume(key) // тап — вернуться
          return
        }
        if (axis === 'x') {
          // притяжка к ближайшей карточке
          let targetIdx = Math.round(localAnchor - stripRef.current / pitch)
          targetIdx = Math.min(Math.max(0, targetIdx), Math.max(0, localN - 1))
          const target = (localAnchor - targetIdx) * pitch
          stripRef.current = target
          setStrip(target)
          setStripping(false)
          return
        }
        setDragCard(null)
        if (dy < -CLOSE_THRESHOLD) flyAway(key)
      }
      const cancel = () => {
        cleanup()
        setStripping(false)
        setDragCard(null)
      }
      const cleanup = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
      }
      window.addEventListener('pointermove', move, { passive: true })
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    },
  })

  // ── жесты фона: тап — закрыть recents, горизонталь — лента ─────────────────
  const backdropPointers = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const startId = e.pointerId
      const sx = e.clientX
      const base = stripRef.current
      const localMin = minStrip
      const localMax = maxStrip
      const localAnchor = anchor
      const localN = n
      let moved = false

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== startId) return
        const dx = ev.clientX - sx
        if (!moved && Math.abs(dx) > AXIS_LOCK) moved = true
        if (moved) {
          const next = Math.min(localMax, Math.max(localMin, base + dx))
          stripRef.current = next
          setStrip(next)
        }
      }
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== startId) return
        cleanup()
        if (!moved) {
          sound.tap()
          onClose()
          return
        }
        let targetIdx = Math.round(localAnchor - stripRef.current / pitch)
        targetIdx = Math.min(Math.max(0, targetIdx), Math.max(0, localN - 1))
        const target = (localAnchor - targetIdx) * pitch
        stripRef.current = target
        setStrip(target)
      }
      const cancel = () => cleanup()
      const cleanup = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
      }
      window.addEventListener('pointermove', move, { passive: true })
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    },
  }

  const labelTop = cy + cardH + 14
  const labelTransition = stripping ? 'none' : `transform 420ms ${EASE}`

  return (
    <div ref={boxRef} className={`absolute inset-0 ${open ? '' : 'pointer-events-none'}`}>
      {/* фон-затемнение под карточками */}
      {open && (
        <div
          className="absolute inset-0 recents-fade"
          style={{ background: 'rgba(3, 6, 5, 0.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
          {...backdropPointers}
          role="presentation"
        />
      )}

      {/* живые слои-миниатюры приложений */}
      {openApps.map((key) => (
        <AppLayer
          key={key}
          app={key}
          active={currentApp === key}
          open={open}
          style={styleFor(key)}
          onCardPointerDown={open ? cardPointers(key).onPointerDown : undefined}
          onCardActivate={() => resume(key)}
        >
          {nodes.get(key)}
        </AppLayer>
      ))}

      {/* подписи под карточками: иконка + имя (как в Pixel) */}
      {open &&
        openApps.map((key) => {
          if (flying.includes(key) || clearing) return null
          const i = Math.max(0, openApps.indexOf(key))
          const x = cx + (i - anchor) * pitch + clampedStrip
          return (
            <div
              key={`label-${key}`}
              className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
              style={{ top: labelTop, transform: `translateX(${x - cx}px)`, transition: labelTransition }}
            >
              <div className="flex items-center gap-2" style={{ width: cardW }}>
                <span className="block size-6 shrink-0 overflow-hidden rounded-[8px] shadow-md ring-1 ring-black/20">
                  <AppTileImage app={key} className="size-6" />
                </span>
                <span className="truncate text-[12.5px] font-semibold text-white/95">{APP_TILE[key].label}</span>
              </div>
            </div>
          )
        })}

      {/* «Очистить все» — как в Pixel: слева внизу */}
      {open && n > 0 && !clearing && (
        <div className="absolute bottom-8 left-5 z-30">
          <button
            type="button"
            onClick={clearAll}
            aria-label="Очистить все недавние приложения"
            className="flex h-10 items-center gap-2 rounded-full bg-white/[0.12] px-5 text-[13px] font-bold text-white/90 outline-none ring-1 ring-white/[0.12] backdrop-blur-sm transition-all duration-200 active:scale-[0.96] active:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
          >
            <Eraser className="size-4" aria-hidden="true" />
            Очистить все
          </button>
        </div>
      )}

      {/* пусто */}
      {open && n === 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 recents-fade">
          <div className="flex size-16 items-center justify-center rounded-[24px] bg-white/[0.07]">
            <Eraser className="size-7 text-white/40" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-white/80">Нет недавних приложений</p>
          <p className="text-xs text-white/45">Откройте любое — оно появится здесь</p>
        </div>
      )}
    </div>
  )
}
