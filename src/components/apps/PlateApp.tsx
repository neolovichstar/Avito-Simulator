'use client'

// ─────────────────────────────────────────────────────────────────────────────
// «Автономера» — крутка автомобильных номеров (ГОСТ-знаки) как в GTA RP.
// Белый минимализм: знак на весь экран с неоновой подсветкой по редкости
// (epic — фиолетовый и т.д.), выбор субъекта РФ из 89 регионов, прокрутка
// всего знака / только букв / только цифр, выкуп с ценой от редкости.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Car, Check, Loader2, MapPin, RefreshCw, Search, Star, Trash2, X } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import { fmtMoney } from '@/lib/format'
import { RARITY_LABEL, type PlateRarity } from '@/lib/plate'
import { RF_SUBJECTS } from '@/lib/rf-regions'
import { GostPlate, RarityTag } from '@/components/plates/GostPlate'
import type { CarPlateDTO, PlateOfferDTO } from '@/lib/types'

type Mode = 'full' | 'letters' | 'digits'

const MODES: { key: Mode; label: string }[] = [
  { key: 'full', label: 'Всё' },
  { key: 'letters', label: 'Буквы' },
  { key: 'digits', label: 'Цифры' },
]

interface SubjectLite {
  name: string
  district: string
  prestige: number
}

const SPIN_MS = 950

export default function PlateApp({ embedded = false }: { embedded?: boolean }) {
  const session = useOS((s) => s.session)
  const setSession = useOS((s) => s.setSession)

  const [subjects, setSubjects] = useState<SubjectLite[]>([])
  const [subject, setSubject] = useState<string>('Москва')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQ, setPickerQ] = useState('')

  const [mode, setMode] = useState<Mode>('full')
  const [offer, setOffer] = useState<PlateOfferDTO | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [rollBusy, setRollBusy] = useState(false)
  const [buyBusy, setBuyBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')

  const [plates, setPlates] = useState<CarPlateDTO[]>([])
  const [keep, setKeep] = useState<{ digits?: string; letters?: string; first?: string }>({})

  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [demo, setDemo] = useState({ first: 'А', digits: '123', letters: 'ВС' })

  const balance = session?.balance ?? 0

  // каталог субъектов + мои номера
  useEffect(() => {
    let alive = true
    api.plateSubjects().then((r) => {
      if (!alive) return
      setSubjects(r.subjects)
      // дефолт — город профиля, если он субъект РФ
      const city = session?.city
      if (city && r.subjects.some((s) => s.name === city)) setSubject(city)
    }).catch(() => {})
    api.plates().then((r) => {
      if (!alive) return
      setPlates(r.plates)
      if (alive && r.plates[0]) setOffer(null)
    }).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const subjectsFiltered = useMemo(() => {
    const q = pickerQ.trim().toLowerCase()
    if (!q) return subjects
    return subjects.filter((s) => s.name.toLowerCase().includes(q) || s.district.toLowerCase().includes(q))
  }, [subjects, pickerQ])

  const grouped = useMemo(() => {
    const map = new Map<string, SubjectLite[]>()
    for (const s of subjectsFiltered) {
      const arr = map.get(s.district) ?? []
      arr.push(s)
      map.set(s.district, arr)
    }
    return [...map.entries()]
  }, [subjectsFiltered])

  const spin = async () => {
    if (spinning || rollBusy) return
    setRollBusy(true)
    setErr('')
    try {
      const r = await api.plateRoll({ subject, mode, keep: mode === 'full' ? undefined : keep })
      const o = r.offer
      // анимация быстрой смены знаков
      setSpinning(true)
      const letters = 'АВЕКМНОРСТУХ'
      if (spinTimer.current) clearInterval(spinTimer.current)
      const started = Date.now()
      spinTimer.current = setInterval(() => {
        const p = (Date.now() - started) / SPIN_MS
        setDemo({
          first: mode === 'digits' && o.first ? o.first : letters[Math.floor(Math.random() * letters.length)],
          digits:
            mode === 'letters' && o.digits
              ? o.digits
              : String(Math.floor(Math.random() * 1000)).padStart(3, '0'),
          letters:
            mode === 'digits' && o.letters
              ? o.letters
              : letters[Math.floor(Math.random() * letters.length)] + letters[Math.floor(Math.random() * letters.length)],
        })
        if (p >= 1) {
          if (spinTimer.current) clearInterval(spinTimer.current)
          spinTimer.current = null
          setDemo({ first: o.first, digits: o.digits, letters: o.letters })
          setOffer(o)
          setSpinning(false)
        }
      }, 70)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось прокрутить')
    } finally {
      setRollBusy(false)
    }
  }

  const buy = async () => {
    if (!offer || buyBusy) return
    setBuyBusy(true)
    setErr('')
    try {
      const r = await api.plateBuy({
        first: offer.first,
        digits: offer.digits,
        letters: offer.letters,
        regionCode: offer.regionCode,
        regionName: offer.regionName,
      })
      setPlates((p) => [r.plate, ...p])
      setKeep({ first: offer.first, digits: offer.digits, letters: offer.letters })
      setToast(`Номер выкуплен · −${fmtMoney(offer.price)}`)
      if (session) setSession({ ...session, balance: r.balance })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось выкупить номер')
    } finally {
      setBuyBusy(false)
    }
  }

  const release = async (id: string) => {
    try {
      await api.plateRelease(id)
      setPlates((p) => p.filter((x) => x.id !== id))
      setToast('Номер снят с учёта')
    } catch {
      setToast('Не удалось снять номер')
    }
  }

  const setMain = async (id: string) => {
    try {
      await api.plateSetMain(id)
      setPlates((p) => p.map((x) => ({ ...x, isMain: x.id === id })))
      setToast('Основной номер обновлён')
    } catch {
      setToast('Не удалось обновить')
    }
  }

  const cur: PlateOfferDTO | null = offer
  const canAfford = cur ? balance >= cur.price : false

  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain bg-[#F6F7F9] text-[#17181A]" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* шапка */}
      {!embedded && (
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.06] bg-white/85 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#17181A] text-white">
              <Car size={18} />
            </span>
            <div>
              <h1 className="text-[16px] font-bold leading-tight">Автономера</h1>
              <p className="text-[11px] text-black/45">Крутка ГОСТ-знаков · субъекты РФ</p>
            </div>
          </div>
          <div className="rounded-full bg-black/[0.05] px-3 py-1.5 text-[13px] font-bold tabular-nums">
            {fmtMoney(balance)} ₽
          </div>
        </div>
      )}

      <div className="space-y-4 p-4 pb-8">
        {/* выбор региона */}
        <button
          onClick={() => setPickerOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.05)] ring-1 ring-black/[0.05] transition-all active:scale-[0.99]"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#F1F3F5]">
            <MapPin size={18} className="text-black/60" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-black/40">Регион</span>
            <span className="block truncate text-[14.5px] font-bold">{subject}</span>
          </span>
          <span className="text-[12px] font-semibold text-black/35">сменить</span>
        </button>

        {/* знак */}
        <div className="relative flex flex-col items-center gap-3 rounded-3xl bg-white px-4 py-6 shadow-[0_1px_2px_rgba(0,0,0,.05)] ring-1 ring-black/[0.05]">
          <GostPlate
            first={cur && !spinning ? cur.first : demo.first}
            digits={cur && !spinning ? cur.digits : demo.digits}
            letters={cur && !spinning ? cur.letters : demo.letters}
            regionCode={cur?.regionCode ?? RF_SUBJECTS.find((s) => s.name === subject)?.plateCodes?.[0] ?? '77'}
            rarity={spinning ? 'common' : (cur?.rarity ?? 'common')}
            size="lg"
          />
          <div className="flex h-6 items-center gap-2">
            {cur && !spinning ? (
              <>
                <RarityTag rarity={cur.rarity} />
                <span className="text-[11.5px] text-black/40">красота {cur.beautyScore}/100</span>
              </>
            ) : (
              <span className="text-[11.5px] text-black/35">
                {spinning ? 'Крутим…' : 'Нажмите «Крутить», чтобы выбить знак'}
              </span>
            )}
          </div>
        </div>

        {/* режим прокрутки */}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,.05)] ring-1 ring-black/[0.05]">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMode(m.key)
                setOffer(null)
              }}
              className={`h-10 rounded-xl text-[13.5px] font-bold transition-all ${
                mode === m.key ? 'bg-[#17181A] text-white shadow' : 'text-black/50 active:bg-black/[0.04]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* оффер */}
        {cur && !spinning && (
          <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.05)] ring-1 ring-black/[0.05]">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-black/40">Цена выкупа</p>
              <p className="text-[20px] font-extrabold tabular-nums">{fmtMoney(cur.price)} ₽</p>
            </div>
            <button
              onClick={buy}
              disabled={buyBusy || !canAfford}
              className={`flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40 ${
                canAfford ? 'bg-[#17181A]' : 'bg-black/40'
              }`}
            >
              {buyBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {canAfford ? 'Выкупить' : `Не хватает ${fmtMoney(cur.price - balance)} ₽`}
            </button>
          </div>
        )}

        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-[12.5px] font-semibold text-red-600">{err}</p>}

        {/* крутить */}
        <button
          onClick={spin}
          disabled={spinning || rollBusy}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#17181A] text-[16px] font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(0,0,0,.55)] transition-all hover:bg-black active:scale-[0.98] disabled:opacity-50"
        >
          {spinning ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={19} />}
          {spinning ? 'Крутим…' : 'Крутить'}
        </button>

        {/* мои номера */}
        <div>
          <h2 className="mb-2 px-1 text-[12px] font-bold uppercase tracking-wider text-black/40">
            Мои номера · {plates.length}
          </h2>
          {plates.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,.05)] ring-1 ring-black/[0.05]">
              <p className="text-[13.5px] font-semibold text-black/60">Пока нет номеров</p>
              <p className="mt-1 text-[12px] text-black/40">Выбейте знак и выкупите его — он появится здесь</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {plates.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,.05)] ring-1 ring-black/[0.05]"
                >
                  <GostPlate first={p.first} digits={p.digits} letters={p.letters} regionCode={p.regionCode} rarity={p.rarity} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <RarityTag rarity={p.rarity} />
                      {p.isMain && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                          <Star size={9} /> основной
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-black/40">
                      {p.regionName} · куплен за {fmtMoney(p.price)} ₽
                    </p>
                  </div>
                  {!p.isMain && (
                    <button
                      onClick={() => setMain(p.id)}
                      aria-label="Сделать основным"
                      className="flex size-9 items-center justify-center rounded-xl text-black/35 transition-colors hover:bg-amber-50 hover:text-amber-600"
                    >
                      <Star size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => release(p.id)}
                    aria-label="Снять номер"
                    className="flex size-9 items-center justify-center rounded-xl text-black/35 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* пикер региона */}
      {pickerOpen && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40" onClick={() => setPickerOpen(false)}>
          <div
            className="flex max-h-[82%] flex-col rounded-t-3xl bg-white"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Выбор региона"
          >
            <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-3">
              <Search size={17} className="text-black/35" />
              <input
                value={pickerQ}
                onChange={(e) => setPickerQ(e.target.value)}
                placeholder="Регион, край, республика…"
                autoFocus
                className="h-9 flex-1 bg-transparent text-[14px] outline-none placeholder:text-black/30"
              />
              <button onClick={() => setPickerOpen(false)} aria-label="Закрыть" className="flex size-8 items-center justify-center rounded-full bg-black/[0.05] text-black/50">
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2 pb-6">
              {grouped.map(([district, list]) => (
                <div key={district}>
                  <p className="px-3 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-black/35">{district}</p>
                  {list.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => {
                        setSubject(s.name)
                        setOffer(null)
                        setKeep({})
                        setPickerOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors active:bg-black/[0.04] ${
                        subject === s.name ? 'bg-black/[0.05]' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{s.name}</span>
                        <span className="block text-[11px] text-black/40">
                          {s.district} округ · престиж ×{s.prestige.toFixed(2)}
                        </span>
                      </span>
                      {subject === s.name && <Check size={16} className="text-black" />}
                    </button>
                  ))}
                </div>
              ))}
              {grouped.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-black/40">Ничего не найдено</p>}
            </div>
          </div>
        </div>
      )}

      {/* тост */}
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-6">
          <p className="rounded-full bg-[#17181A] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-xl">{toast}</p>
        </div>
      )}
    </div>
  )
}

// реэкспорт для удобства типизации редкости
export type { PlateRarity }
