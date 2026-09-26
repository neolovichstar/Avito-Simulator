'use client'

import type { ReactNode } from 'react'

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
  onClick: () => void
}) {
  const base = color ?? '#4B5563'
  const tileBackground =
    background ??
    `linear-gradient(145deg, ${shade(base, 45)}, ${shade(base, -40)})`

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex w-full flex-col items-center outline-none transition-transform duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-white/80 ${
        small ? 'gap-0.5' : 'gap-1'
      }`}
    >
      <span
        className={`relative ${small ? 'w-[52px]' : 'w-full'} block ${small ? 'rounded-[0.95rem]' : 'rounded-[1.15rem]'} aspect-square overflow-hidden shadow-[0_8px_18px_-6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-8px_12px_-10px_rgba(0,0,0,0.35)] ${
          image ? 'ring-1 ring-white/15' : ''
        }`}
        style={image ? undefined : { backgroundImage: tileBackground }}
      >
        {image ? (
          <TileImage src={image} bg={imageBg ?? background} loading={loading} />
        ) : (
          <>
            {/* Блик сверху — стеклянный отблеск, как у настоящих иконок ОС */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 h-[46%] ${small ? 'rounded-t-[0.95rem]' : 'rounded-t-[1.15rem]'} bg-gradient-to-b from-white/25 via-white/5 to-transparent`}
            />
            <span className="absolute inset-0 flex items-center justify-center">{icon}</span>
          </>
        )}
        {badge !== undefined && badge > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex ${small ? 'h-4 min-w-4 text-[9px]' : 'h-[18px] min-w-[18px] text-[10px]'} items-center justify-center rounded-full bg-[#E5484D] px-1 font-semibold leading-none text-white shadow-md`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {!hideLabel && (
        <span
          className={`${small ? 'w-[52px] text-[9px]' : 'w-[62px] text-[10px]'} truncate text-center text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]`}
        >
          {label}
        </span>
      )}
    </button>
  )
}
