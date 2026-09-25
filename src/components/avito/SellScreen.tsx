'use client'

// Продажа: выбрать вещь из инвентаря, назначить цену, опубликовать
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Tag, PackageOpen, TrendingUp, Info } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtNum, fmtMoney } from '@/lib/format'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import type { InventoryItemDTO } from '@/lib/types'
import { ConditionBadge } from './AvitoApp'

export default function SellScreen({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<InventoryItemDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<InventoryItemDTO | null>(null)
  const [price, setPrice] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const refreshSession = useOS((s) => s.refreshSession)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { items } = await api.inventory()
      setItems(items.filter((i) => !i.listed))
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const publish = async () => {
    if (!selected) return
    const p = Math.round(Number(price.replace(/\s/g, '')))
    if (!Number.isFinite(p) || p < 0) { setMsg('Укажите цену'); return }
    setBusy(true)
    setMsg('')
    try {
      await api.createListing({
        itemId: selected.id,
        title: selected.title,
        description: desc.trim() || `Продаю «${selected.title}». Состояние: ${CONDITION_LABEL[selected.condition] ?? selected.condition}.`,
        category: selected.category as never,
        condition: selected.condition,
        price: p,
      })
      setSelected(null)
      setPrice('')
      setDesc('')
      await load()
      useOS.getState().pushToast('Resale', `Объявление «${selected.title}» опубликовано`)
      onDone()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Не удалось опубликовать')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full bg-[#050D09] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/30" size={28} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[#050D09]">
      <div className="shrink-0 px-2 py-2 flex items-center bg-[#050D09] border-b border-white/[0.06]">
        {selected && (
          <button onClick={() => { setSelected(null); setMsg('') }} aria-label="Назад" className="w-10 h-10 flex items-center justify-center rounded-full text-white active:bg-white/10">
            <ChevronLeft size={22} aria-hidden />
          </button>
        )}
        <span className="text-sm font-semibold text-white">
          {selected ? 'Публикация' : 'Мои вещи на продажу'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] p-3">
        {error && <div className="border border-red-500/20 bg-red-500/10 text-red-400 text-sm rounded-xl p-3 mb-3">{error}</div>}

        {!selected ? (
          items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center space-y-2">
              <PackageOpen size={32} className="mx-auto text-white/30" aria-hidden />
              <p className="text-sm text-white/60 font-medium">Инвентарь пуст</p>
              <p className="text-xs text-white/40">
                Купите что-то в Resale (можно даже «Отдам даром»), отремонтируйте в сервисе — и выставляйте на продажу
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 flex items-start gap-2 text-xs text-white/60">
                <Info size={14} className="text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                Совет: смотрите цену рынка у похожих объявлений и ставьте чуть ниже — так быстрее уйдёт. За каждую продажу налоговая возьмёт 4%.
              </div>
              {items.map((i) => {
                const profit = i.estValue - i.purchasePrice
                return (
                  <button
                    key={i.id}
                    onClick={() => { setSelected(i); setPrice(String(i.estValue)); setDesc('') }}
                    className="w-full rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-3 flex gap-3 text-left active:scale-[0.99] transition-transform"
                  >

                    <img src={i.image} alt={i.title} className="w-20 h-20 rounded-xl object-cover bg-white/[0.06] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{i.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ConditionBadge condition={i.condition} />
                      </div>
                      <div className="text-xs text-white/40 mt-1.5">
                        Куплено за {fmtNum(i.purchasePrice)} ₽ · рынок ~{fmtNum(i.estValue)} ₽
                      </div>
                      {i.purchasePrice > 0 && (
                        <div className={`text-xs font-semibold mt-0.5 ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {profit >= 0 ? '+' : ''}{fmtNum(profit)} ₽ потенциал
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-3 flex gap-3">

              <img src={selected.image} alt={selected.title} className="w-20 h-20 rounded-xl object-cover bg-white/[0.06] shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">{selected.title}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <ConditionBadge condition={selected.condition} />
                </div>
                <p className="text-xs text-white/40 mt-1">
                  Рыночная оценка ~{fmtNum(selected.estValue)} ₽
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-white/50 block mb-1.5" htmlFor="price-input">
                  Цена, ₽ (0 — отдам даром)
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 focus-within:border-emerald-500/50">
                  <Tag size={15} className="text-white/40" aria-hidden />
                  <input
                    id="price-input"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="0"
                    className="h-11 bg-transparent outline-none text-base font-bold w-full text-white placeholder:text-white/40"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[0.85, 0.95, 1.05].map((k) => (
                    <button
                      key={k}
                      onClick={() => setPrice(String(Math.round(selected.estValue * k)))}
                      className="px-3 h-8 rounded-full bg-white/[0.06] text-[11px] font-medium text-white/70 flex items-center gap-1 active:scale-[0.97] transition-transform"
                    >
                      <TrendingUp size={10} aria-hidden /> {Math.round(k * 100)}% рынка
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-white/50 block mb-1.5" htmlFor="desc-input">
                  Описание
                </label>
                <textarea
                  id="desc-input"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  placeholder="Расскажите про состояние, комплект, причину продажи..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm outline-none resize-none text-white placeholder:text-white/40 focus:border-emerald-500/50"
                />
              </div>
            </div>

            {msg && <div className="text-xs text-red-400 px-1">{msg}</div>}
            <button
              onClick={publish}
              disabled={busy}
              className="w-full h-12 rounded-2xl bg-[#22C55E] text-[#052E16] text-[15px] font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {busy ? 'Публикуем...' : 'Разместить объявление'}
            </button>
            <p className="text-[11px] text-white/40 text-center px-4">
              После продажи получите {fmtMoney(Math.round(Number(price || 0) * 0.96))} (минус 4% налог)
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
