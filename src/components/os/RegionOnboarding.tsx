'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RegionOnboarding — при первом входе в игру спрашиваем регион (все субъекты
// РФ: республики, края, области, автономии). Выбор сохраняется на сервере
// (User.city) и в localStorage — больше не спрашиваем.
// Показывается поверх ОС после разблокировки, пока не сделан выбор.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, MapPin, Search } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import { RF_SUBJECTS, FEDERAL_DISTRICTS } from '@/lib/rf-regions'

export const REGION_FLAG_KEY = 'resale_region_v1'

export function regionPicked(): boolean {
  try {
    return localStorage.getItem(REGION_FLAG_KEY) === '1'
  } catch {
    return true // приватный режим — не мучаем пользователя
  }
}

export default function RegionOnboarding({ onDone }: { onDone?: () => void }) {
  const session = useOS((s) => s.session)
  const setSession = useOS((s) => s.setSession)

  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return RF_SUBJECTS_FILTERED(query)
  }, [q])

  const pick = async (name: string) => {
    if (busy) return
    setBusy(name)
    setErr('')
    try {
      await api.updateCity(name)
      if (session) setSession({ ...session, city: name })
      try {
        localStorage.setItem(REGION_FLAG_KEY, '1')
      } catch {}
      onDone?.()
    } catch {
      setErr('Не удалось сохранить. Проверьте связь и попробуйте снова')
      setBusy(null)
    }
  }

  const skip = () => {
    try {
      localStorage.setItem(REGION_FLAG_KEY, '1')
    } catch {}
    onDone?.()
  }

  return (
    <div className="absolute inset-0 z-[70] flex flex-col bg-[#0B0F0D] text-white" role="dialog" aria-label="Выбор региона">
      {/* фоновое свечение */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 60% at 50% 0%, rgba(33,160,56,.16), transparent 60%)' }} />

      <div className="relative flex flex-col items-center px-6 pt-10">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[#21A038]/15 ring-1 ring-[#21A038]/30">
          <MapPin className="size-7 text-[#4ADE80]" />
        </span>
        <h1 className="mt-4 text-center text-[21px] font-extrabold leading-tight">Из какого вы региона?</h1>
        <p className="mt-1.5 text-center text-[13px] leading-relaxed text-white/50">
          Регион влияет на рынок, цены и номера.
          <br />
          Выбор сохранится и больше не потревожит.
        </p>
      </div>

      <div className="relative mx-4 mt-5 flex items-center gap-2 rounded-2xl bg-white/[0.07] px-4 ring-1 ring-white/10 transition-colors focus-within:ring-[#21A038]/50">
        <Search size={17} className="text-white/35" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Москва, Тула, Татарстан…"
          className="h-11 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
          aria-label="Поиск региона"
        />
      </div>

      {err && <p className="mx-4 mt-3 rounded-xl bg-red-500/10 px-4 py-2.5 text-[12.5px] font-semibold text-red-300">{err}</p>}

      <div className="relative mt-3 flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:thin]">
        {filtered.map(([district, list]) => (
          <div key={district}>
            <p className="px-4 pb-1 pt-4 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/30">{district}</p>
            {list.map((s) => (
              <button
                key={s.name}
                onClick={() => pick(s.name)}
                disabled={!!busy}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all active:bg-white/[0.06] disabled:opacity-60"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14.5px] font-semibold">{s.name}</span>
                  <span className="text-[11px] text-white/35">{s.plateCodes.slice(0, 4).join(' · ')}</span>
                </span>
                {busy === s.name ? (
                  <Loader2 size={17} className="animate-spin text-[#4ADE80]" />
                ) : busy ? null : (
                  <Check size={16} className="text-white/15" />
                )}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] text-white/40">Регион не найден. Попробуйте «Тульская» или «Башкортостан»</p>
        )}
      </div>

      <div className="relative border-t border-white/[0.06] px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <button
          onClick={skip}
          disabled={!!busy}
          className="mx-auto block text-[12.5px] font-semibold text-white/40 transition-colors hover:text-white/70"
        >
          Пропустить — оставить Москву
        </button>
      </div>
    </div>
  )
}

// данные субъектов — из rf-regions
function RF_SUBJECTS_FILTERED(query: string): [string, { name: string; plateCodes: string[] }[]][] {
  const map = new Map<string, { name: string; plateCodes: string[] }[]>()
  for (const d of FEDERAL_DISTRICTS) map.set(d, [])
  for (const s of RF_SUBJECTS) {
    if (
      !query ||
      s.name.toLowerCase().includes(query) ||
      s.district.toLowerCase().includes(query) ||
      s.plateCodes.some((c) => c.startsWith(query))
    ) {
      map.get(s.district)!.push({ name: s.name, plateCodes: s.plateCodes })
    }
  }
  return [...map.entries()].filter(([, list]) => list.length > 0)
}
