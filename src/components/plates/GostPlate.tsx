'use client'

// ─────────────────────────────────────────────────────────────────────────────
// GostPlate — автомобильный знак в стиле ГОСТ: белое поле, чёрная рамка,
// справа блок с кодом региона и RUS-флажком. По редкости знак подсвечивается
// неоном (epic — фиолетовый, legendary — янтарь, mythic — розовый и т.д.).
// Используется в PlateApp (крутка) и в ленте «Номера · Автомобили» Resale.
// ─────────────────────────────────────────────────────────────────────────────

import { RARITY_NEON, type PlateRarity } from '@/lib/plate'

export function GostPlate({
  first,
  digits,
  letters,
  regionCode,
  rarity = 'common',
  size = 'md',
  glow = true,
}: {
  first: string
  digits: string
  letters: string
  regionCode: string
  rarity?: PlateRarity
  size?: 'sm' | 'md' | 'lg'
  glow?: boolean
}) {
  const dim = {
    sm: { pad: 'px-2 py-1', text: 'text-[15px]', region: 'text-[11px]', radius: 'rounded-md', border: 'border-2', flagW: 14 },
    md: { pad: 'px-3 py-2', text: 'text-[26px]', region: 'text-[15px]', radius: 'rounded-lg', border: 'border-[3px]', flagW: 18 },
    lg: { pad: 'px-4 py-3', text: 'text-[40px]', region: 'text-[19px]', radius: 'rounded-xl', border: 'border-4', flagW: 22 },
  }[size]

  const neon = RARITY_NEON[rarity]
  const strong = rarity !== 'common'

  return (
    <div
      className={`relative inline-flex items-stretch bg-white ${dim.radius} ${dim.border} ${dim.pad} ${
        strong ? 'border-black' : 'border-black/85'
      }`}
      style={
        glow && strong
          ? {
              boxShadow: `0 0 14px ${neon}AA, 0 0 38px ${neon}55, inset 0 0 12px ${neon}22`,
            }
          : { boxShadow: '0 1px 3px rgba(0,0,0,.18)' }
      }
      role="img"
      aria-label={`Автомобильный номер ${first} ${digits} ${letters}, регион ${regionCode}`}
    >
      {/* тело знака */}
      <span
        className={`flex items-center font-extrabold tracking-[0.08em] text-[#17181A] ${dim.text}`}
        style={{ fontFamily: '"Arial Narrow", Arial, sans-serif', fontStretch: 'condensed' }}
      >
        <span className="mr-[0.18em]">{first}</span>
        <span className="mr-[0.18em] tabular-nums">{digits}</span>
        <span>{letters}</span>
      </span>

      {/* правый блок: код региона + RUS флаг */}
      <span className={`ml-2 flex flex-col items-center justify-center border-l-[2.5px] border-[#17181A]/85 pl-2 ${size === 'sm' ? 'ml-1.5 pl-1.5' : ''}`}>
        <span className={`font-extrabold leading-none text-[#17181A] ${dim.region} tabular-nums`}>{regionCode}</span>
        <span className="mt-[3px] flex flex-col items-center gap-[1px]">
          <span className="flex" style={{ width: dim.flagW }}>
            <span className="h-[2.5px] flex-1 bg-white ring-1 ring-black/30" />
          </span>
          <span className="flex" style={{ width: dim.flagW }}>
            <span className="h-[2.5px] flex-1 bg-[#00529F]" />
            <span className="h-[2.5px] flex-1 bg-[#D52B1E]" />
          </span>
          <span className="text-[6px] font-bold leading-none tracking-wider text-[#17181A]" style={{ fontSize: size === 'sm' ? 5 : size === 'lg' ? 8 : 6.5 }}>
            RUS
          </span>
        </span>
      </span>
    </div>
  )
}

/** Неоновая подпись редкости под знаком. */
export function RarityTag({ rarity, className = '' }: { rarity: PlateRarity; className?: string }) {
  const label: Record<PlateRarity, string> = {
    common: 'Обычный',
    rare: 'Редкий',
    epic: 'Эпический',
    legendary: 'Легендарный',
    mythic: 'Блатной',
  }
  const neon = RARITY_NEON[rarity]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${className}`}
      style={{ color: neon, background: `${neon}14`, boxShadow: `0 0 10px ${neon}40` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: neon, boxShadow: `0 0 6px ${neon}` }} />
      {label[rarity]}
    </span>
  )
}
