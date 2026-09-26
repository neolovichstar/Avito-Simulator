'use client'

// ─────────────────────────────────────────────────────────────────────────────
// «Номера» внутри Resale: два отдельных раздела — Телефоны и Автомобили.
//  • Телефоны: список моих номеров + кнопка «Крутить» (открывает системное
//    приложение «Номера» ОС, где крутка с бронями и выкупом).
//  • Автомобили: встроенная крутка ГОСТ-знаков (PlateApp) — белый минимализм,
//    неоновая подсветка по редкости, выкуп с ценой от редкости.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Car, Loader2, Phone, RefreshCw, Star, Trash2 } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import PlateApp from '@/components/apps/PlateApp'

interface PhoneRow {
  id: string
  number: string
  regionName: string
  tier: string
  beautyScore: number
  isMain: boolean
  status: string
}

const TIER_LABEL: Record<string, string> = {
  basic: 'Базовый',
  silver: 'Серебряный',
  gold: 'Золотой',
  platinum: 'Платиновый',
  diamond: 'Бриллиантовый',
}

export default function NumbersScreen() {
  const [side, setSide] = useState<'phones' | 'cars'>('phones')

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      {/* заголовок + сегменты */}
      <div className="shrink-0 bg-white px-4 pb-3 pt-4 ring-1 ring-[#EBEDF0]">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-black">Номера</h1>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-[#F0F1F5] p-1" role="tablist" aria-label="Тип номеров">
          {(
            [
              { key: 'phones', label: 'Телефоны', icon: Phone },
              { key: 'cars', label: 'Автомобили', icon: Car },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={side === t.key}
              onClick={() => setSide(t.key)}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold transition-all ${
                side === t.key ? 'bg-white text-black shadow-[0_1px_4px_rgba(0,0,0,.1)]' : 'text-[#8B8F99] active:text-black'
              }`}
            >
              <t.icon size={15} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {side === 'phones' ? <PhonesPane /> : <CarsPane />}
      </div>
    </div>
  )
}

// ── Телефоны ──

function PhonesPane() {
  const openApp = useOS((s) => s.openApp)
  const [rows, setRows] = useState<PhoneRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .phonesList()
      .then((r) => setRows(r.numbers as PhoneRow[]))
      .catch(() => setRows([]))
  }, [])

  useEffect(load, [load])

  const setMain = async (id: string) => {
    setBusy(true)
    try {
      await fetch('/api/phones/set-main', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      load()
    } finally {
      setBusy(false)
    }
  }

  const release = async (id: string) => {
    setBusy(true)
    try {
      await fetch('/api/phones/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-6">
      {/* CTA крутки */}
      <div className="flex items-center gap-3 rounded-3xl bg-[#17181A] p-4 text-white">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <RefreshCw size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold leading-tight">Крутка номеров</p>
          <p className="mt-0.5 text-[12px] leading-snug text-white/55">
            777, блатные коды, бронь и выкуп — крутите в системном приложении
          </p>
        </div>
        <button
          onClick={() => openApp('numbers')}
          className="shrink-0 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-black transition-all active:scale-95"
        >
          Крутить
        </button>
      </div>

      {/* мои телефоны */}
      <h2 className="mb-2 mt-5 px-1 text-[12px] font-bold uppercase tracking-wider text-[#8B8F99]">
        Мои номера · {rows?.length ?? 0}
      </h2>
      {rows === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-[#8B8F99]" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-[#EBEDF0]">
          <p className="text-[13.5px] font-semibold text-black/70">Номеров ещё нет</p>
          <p className="mt-1 text-[12px] text-black/40">Крутите в приложении «Номера» — первый можно забрать бесплатно</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-[#EBEDF0]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-bold tabular-nums text-black">{p.number}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#F0F1F5] px-2 py-0.5 text-[10.5px] font-bold text-black/60">
                    {TIER_LABEL[p.tier] ?? p.tier}
                  </span>
                  <span className="text-[11px] text-black/40">
                    {p.regionName} · красота {p.beautyScore}
                  </span>
                </span>
              </span>
              {p.isMain ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-1 text-[10.5px] font-bold text-amber-600">
                  <Star size={9} /> основной
                </span>
              ) : (
                <>
                  <button
                    onClick={() => setMain(p.id)}
                    disabled={busy}
                    aria-label="Сделать основным"
                    className="flex size-9 items-center justify-center rounded-xl text-black/30 transition-colors hover:bg-amber-50 hover:text-amber-600"
                  >
                    <Star size={16} />
                  </button>
                  <button
                    onClick={() => release(p.id)}
                    disabled={busy}
                    aria-label="Отпустить номер"
                    className="flex size-9 items-center justify-center rounded-xl text-black/30 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Автомобили ──

function CarsPane() {
  return (
    <div className="h-full">
      <PlateApp embedded />
    </div>
  )
}
