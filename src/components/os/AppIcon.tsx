'use client'

import type { ReactNode } from 'react'

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
  badge,
  onClick,
}: {
  icon: ReactNode
  label: string
  color: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex w-full flex-col items-center gap-1.5 rounded-2xl outline-none transition-transform duration-150 active:scale-90 focus-visible:ring-2 focus-visible:ring-white/80"
    >
      <span
        className="relative block aspect-square w-full rounded-[1.4rem] shadow-[0_10px_24px_-6px_rgba(0,0,0,0.6)]"
        style={{
          backgroundImage: `linear-gradient(145deg, ${shade(color, 45)}, ${shade(color, -40)})`,
        }}
      >
        <span className="absolute inset-0 flex items-center justify-center text-white">
          {icon}
        </span>
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
