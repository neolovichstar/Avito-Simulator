'use client'

import type { ReactNode } from 'react'

/** Логотип из фирменного пака: картинка сама — плитка (фон уже «вшит» в PNG). */
function TileImage({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="absolute inset-0 h-full w-full select-none object-cover"
    />
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
  badge,
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
  badge?: number
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
      className="flex w-full flex-col items-center gap-1.5 rounded-2xl outline-none transition-transform duration-150 active:scale-90 focus-visible:ring-2 focus-visible:ring-white/80"
    >
      <span
        className={`relative block aspect-square w-full overflow-hidden rounded-[1.4rem] shadow-[0_12px_26px_-6px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-10px_16px_-10px_rgba(0,0,0,0.35)] ${
          image ? 'ring-1 ring-white/15' : ''
        }`}
        style={image ? undefined : { backgroundImage: tileBackground }}
      >
        {image ? (
          <TileImage src={image} />
        ) : (
          <>
            {/* Блик сверху — стеклянный отблеск, как у настоящих иконок ОС */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[46%] rounded-t-[1.4rem] bg-gradient-to-b from-white/25 via-white/5 to-transparent"
            />
            <span className="absolute inset-0 flex items-center justify-center">{icon}</span>
          </>
        )}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold leading-none text-white shadow-md">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="w-20 truncate text-center text-xs text-white/90">{label}</span>
    </button>
  )
}
