'use client'

// ─────────────────────────────────────────────────────────────────────────────
// «Номера» внутри Resale: два раздела — Телефоны и Автомобили.
//  • Телефоны: список моих номеров + кнопка «Крутить» (открывает системное
//    приложение «Номера» ОС, где крутка с бронями и выкупом).
//  • Автомобили: встроенная крутка ГОСТ-знаков (PlateApp) — белый минимализм,
//    неоновая подсветка по редкости, выкуп с ценой от редкости.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Car, Phone, RefreshCw, Star, Trash2 } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import PlateApp from '@/components/apps/PlateApp'
import { Card, Overline, ScreenTitle, Skeleton, cn } from './ui'

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
    <div className="flex h-full flex-col bg-[#F6F7F9] text-[#141414]">
      {/* заголовок + сегменты */}
      <div className="shrink-0 px-4 pb-3 pt-4">
        <Overline>Resale</Overline>
        <ScreenTitle className="mb-3">Номера</ScreenTitle>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-black/[0.05] p-1" role="tablist" aria-label="Тип номеров">
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
              className={cn(
                'flex h-10 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-bold transition-all active:scale-[0.98]',
                side === t.key
                  ? 'bg-white text-[#141414] shadow-[0_1px_6px_rgba(0,0,0,0.1)]'
                  : 'text-black/40',
              )}
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
    <div className="h-full overflow-y-auto p-4 pb-6 [scrollbar-width:thin]">
      {/* CTA крутки: тёмно-зелёный акцентный баннер */}
      <div className="flex items-center gap-3 rounded-[20px] bg-[#14532D] p-4 text-white shadow-[0_6px_18px_rgba(20,83,45,0.25)]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-hidden>
          <RefreshCw size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold leading-tight">Крутка номеров</p>
          <p className="mt-0.5 text-[12px] leading-snug text-white/60">
            777, блатные коды, бронь и выкуп. Крутите в системном приложении
          </p>
        </div>
        <button
          onClick={() => openApp('numbers')}
          className="shrink-0 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-[#14532D] transition-all active:scale-95"
        >
          Крутить
        </button>
      </div>

      {/* мои телефоны */}
      <Overline className="mb-2 mt-5 px-1">Мои номера · {rows?.length ?? 0}</Overline>
      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-[20px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] font-semibold text-black/60">Номеров ещё нет</p>
          <p className="mt-1 text-[12px] text-black/40">Крутите в приложении «Номера». Первый можно забрать бесплатно</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <Card key={p.id} className="flex items-center gap-3 p-3.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-bold tabular-nums text-[#141414]">{p.number}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10.5px] font-bold leading-none text-black/55">
                    {TIER_LABEL[p.tier] ?? p.tier}
                  </span>
                  <span className="text-[11px] text-black/40">
                    {p.regionName} · красота {p.beautyScore}
                  </span>
                </span>
              </span>
              {p.isMain ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/[0.12] px-2 py-1 text-[10.5px] font-bold text-amber-700">
                  <Star size={9} aria-hidden /> основной
                </span>
              ) : (
                <>
                  <button
                    onClick={() => setMain(p.id)}
                    disabled={busy}
                    aria-label="Сделать основным"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-black/30 transition-colors hover:bg-amber-50 hover:text-amber-600 active:bg-amber-500/[0.12]"
                  >
                    <Star size={16} aria-hidden />
                  </button>
                  <button
                    onClick={() => release(p.id)}
                    disabled={busy}
                    aria-label="Отпустить номер"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-black/30 transition-colors hover:bg-red-50 hover:text-red-500 active:bg-red-500/[0.12]"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </>
              )}
            </Card>
          ))}
        </div>
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
