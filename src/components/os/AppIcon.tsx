'use client'

import { useRef, type ReactNode } from 'react'

/** Логотип из фирменного пака: картинка сама — плитка (фон уже «вшит» в PNG). */
function TileImage({ src, bg, loading }: { src: string; bg?: string; loading: 'eager' | 'lazy' }) {
  return (
    <>
      {/* подложка в тон логотипа — пока PNG грузится, плитка не мигает белым */}
      <span aria-hidden="true" className="absolute inset-0" style={bg ? { background: bg } : undefined} />
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading={loading}
        decoding="async"
        fetchPriority={loading === 'eager' ? 'high' : 'auto'}
        className="absolute inset-0 h-full w-full select-none object-cover"
      />
    </>
  )
}

// Осветление/затемнение hex-цвета для градиента плитки.
function shade(hex: string, amount: number): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const num = Number.parseInt(full, 16)
  if (Number.isNaN(num)) return hex
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)))
  return `rgb(${ch((num >> 16) & 255)} ${ch((num >> 8) & 255)} ${ch(num & 255)})`
}

// Тень «в тон базы» для ярких тайлов, нейтральная — для тёмных/светлых.
// Цвет вытягиваем из готового градиента (первый hex в строке).
function glowFromBg(bg?: string): string {
  if (!bg) return 'rgba(0,0,0,0.28)'
  const m = bg.match(/#([0-9a-fA-F]{6})/)
  if (!m) return 'rgba(0,0,0,0.28)'
  const n = Number.parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  if (mx - mn >= 60 && mx > 70) return `rgba(${r}, ${g}, ${b}, 0.36)`
  return 'rgba(0,0,0,0.28)'
}

export default function AppIcon({
  icon,
  label,
  color,
  background,
  image,
  imageBg,
  badge,
  small = false,
  hideLabel = false,
  loading = 'eager',
  tone = 'dark',
  staticTile = false,
  tileClass,
  tileStyle,
  tileW,
  tileRadius,
  labelW,
  enter = false,
  enterDelay = 0,
  onPointerDown,
  onLongPress,
  onClick,
}: {
  icon: ReactNode
  label: string
  /** Базовый цвет плитки: из него строится градиент (если нет background). */
  color?: string
  /** Готовый CSS-градиент/фон плитки — перекрывает color. */
  background?: string
  /** PNG-логотип из пака — заполняет плитку целиком, перекрывает icon/background. */
  image?: string
  /** Фон-подложка под PNG (пока картинка грузится — плитка уже окрашена). */
  imageBg?: string
  badge?: number
  /** Компактный режим (док): плитка 52px, подпись 9px. */
  small?: boolean
  /** Скрыть подпись (док Android — иконки без подписей). */
  hideLabel?: boolean
  /** Стратегия загрузки лого: экран 2 лончера — lazy (не тормозит старт). */
  loading?: 'eager' | 'lazy'
  /** Тон подписи: 'dark' — белая (тёмные обои), 'light' — графитовая (светлые обои). */
  tone?: 'dark' | 'light'
  /** Плитка без нажатий и трансформаций: драг, редактирование, библиотека. */
  staticTile?: boolean
  /** Класс-модификатор на плитке (jiggle-анимация, подсветка и т.п.). */
  tileClass?: string
  /** Инлайн-стиль плитки (позиция призрака при перетаскивании). */
  tileStyle?: React.CSSProperties
  /** Фиксированная ширина плитки в px (сетка дома 62px; по умолчанию — вся ячейка). */
  tileW?: number
  /** Радиус плитки (по умолчанию 22.5% тайла, у библиотеки — rounded-[15px]). */
  tileRadius?: string
  /** Ширина подписи в px (по умолчанию 74). */
  labelW?: number
  /** Stagger-вход лончера (после разблокировки): scale 0.96 → 1 + fade. */
  enter?: boolean
  /** Задержка входа в мс (через --d). */
  enterDelay?: number
  /** Прокидывание onPointerDown (драг-движок лончера). */
  onPointerDown?: (e: React.PointerEvent) => void
  onLongPress?: () => void
  onClick: (e: React.MouseEvent) => void
}) {
  const base = color ?? '#4B5563'
  const tileBackground =
    background ??
    `linear-gradient(145deg, ${shade(base, 45)}, ${shade(base, -40)})`
  // iOS-глубина: мягкая внешняя тень (+ цветной ореол у ярких тайлов) и
  // inset-хайлайт по верхней кромке. Через переменную, чтобы классы
  // os-lift/os-merge/os-ghost могли перекрыть box-shadow целиком.
  const glow = glowFromBg(background ?? imageBg)
  const radius = tileRadius ?? 'rounded-[22.5%]'
  const labelWidth = labelW ?? (small ? 52 : 82)

  // Долгий тап: таймер на 480 мс без движения больше 9px
  const lpTimer = useRef(0)
  const lpStart = useRef({ x: 0, y: 0 })
  const clearLp = () => {
    window.clearTimeout(lpTimer.current)
  }
  const handlePointerDown = (e: React.PointerEvent) => {
    onPointerDown?.(e)
    if (!onLongPress || e.button > 0) return
    lpStart.current = { x: e.clientX, y: e.clientY }
    clearLp()
    lpTimer.current = window.setTimeout(() => {
      onLongPress()
      lpTimer.current = 0
    }, 480)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!lpTimer.current) return
    if (Math.hypot(e.clientX - lpStart.current.x, e.clientY - lpStart.current.y) > 9) clearLp()
  }

  const btnStyle: React.CSSProperties = {
    ...(tileW ? { width: tileW } : undefined),
    ...(enter ? { ['--d' as string]: `${enterDelay}ms` } : undefined),
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearLp}
      onPointerCancel={clearLp}
      onContextMenu={(e) => {
        if (onLongPress) {
          e.preventDefault()
          clearLp()
          onLongPress()
        }
      }}
      style={btnStyle}
      className={`flex ${tileW ? '' : 'w-full'} flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
        small ? 'gap-0.5' : 'gap-[6px]'
      } ${enter ? 'os-enter' : ''} ${staticTile ? '' : 'transition-transform duration-200 active:scale-95'}`}
    >
      <span
        className={`relative ${small ? 'w-[52px]' : 'w-full'} block ${radius} aspect-square overflow-hidden shadow-[0_8px_16px_-6px_var(--tile-glow,rgba(0,0,0,0.28)),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-10px_14px_-12px_rgba(0,0,0,0.3)] transition-[transform,box-shadow] duration-200 ease-out ${
          image ? 'ring-1 ring-white/15' : ''
        } ${tileClass ?? ''}`}
        style={{
          ['--tile-glow' as string]: glow,
          ...(image ? undefined : { backgroundImage: tileBackground }),
          ...tileStyle,
        }}
      >
        {image ? (
          <TileImage src={image} bg={imageBg ?? background} loading={loading} />
        ) : (
          <>
            {/* Блик сверху — стеклянный отблеск, как у настоящих иконок ОС */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[inherit] bg-gradient-to-b from-white/25 to-transparent`}
            />
            <span className="absolute inset-0 flex items-center justify-center">{icon}</span>
          </>
        )}
        {badge !== undefined && badge > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex ${small ? 'h-4 min-w-4 text-[9px]' : 'h-[18px] min-w-[18px] text-[10px]'} items-center justify-center rounded-full bg-[#FF453A] px-1 font-semibold leading-none text-white shadow-md`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {!hideLabel && (
        <span
          style={{ width: labelWidth }}
          className={`truncate text-center ${small ? 'text-[9px]' : 'text-[11px] font-medium'} ${
            tone === 'light'
              ? 'text-[#1a1a1a] [text-shadow:0_1px_2px_rgba(255,255,255,0.65)]'
              : 'text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]'
          }`}
        >
          {label}
        </span>
      )}
    </button>
  )
}
