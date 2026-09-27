'use client'

// Создание объявления «Resale» — светлые формы по фирменному макету:
// выбор вещи из инвентаря, превью с характеристиками, цена, описание
// и тёмно-зелёная CTA «Опубликовать».
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Tag, PackageOpen, TrendingUp, Info, ChevronRight } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtNum, fmtMoney } from '@/lib/format'
import { CATEGORY_LABEL, CONDITION_LABEL } from '@/lib/catalog-types'
import type { InventoryItemDTO } from '@/lib/types'
import { ConditionBadge } from './AvitoApp'
import { Card, EmptyState, Overline, ScreenTitle, Skeleton, cn } from './ui'

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
      <div className="flex h-full flex-col bg-[#F6F7F9]">
        <div className="px-4 pb-2 pt-4">
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="h-7 w-32" />
        </div>
        <div className="space-y-2.5 p-4 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-[20px]" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#F6F7F9] text-[#141414]">
      {/* шапка */}
      <div className="shrink-0 px-4 pb-2 pt-3">
        {selected ? (
          <div className="flex items-center gap-1">
            <button onClick={() => { setSelected(null); setMsg('') }} aria-label="Назад" className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[#141414] transition-colors active:bg-black/[0.06]">
              <ChevronLeft size={24} aria-hidden />
            </button>
            <div>
              <Overline>Новое объявление</Overline>
              <h1 className="text-[20px] font-bold tracking-tight leading-tight">Публикация</h1>
            </div>
          </div>
        ) : (
          <>
            <Overline>Resale</Overline>
            <ScreenTitle>Продать</ScreenTitle>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pt-1 [scrollbar-width:thin]">
        {error && <div className="mb-3 rounded-[16px] bg-red-500/[0.08] p-3 text-sm text-red-600">{error}</div>}

        {!selected ? (
          items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<PackageOpen size={30} />}
                title="Инвентарь пуст"
                note="Купите что-то в Resale (можно даже «Отдам даром»), отремонтируйте в сервисе. И выставляйте на продажу"
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 rounded-[16px] bg-[#14532D]/[0.06] p-3.5 text-xs leading-relaxed text-[#14532D]">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                Совет: смотрите цену рынка у похожих объявлений и ставьте чуть ниже. Так вещь уйдёт быстрее. За каждую продажу налоговая возьмёт 4%.
              </div>
              {items.map((i) => {
                const profit = i.estValue - i.purchasePrice
                return (
                  <button
                    key={i.id}
                    onClick={() => { setSelected(i); setPrice(String(i.estValue)); setDesc('') }}
                    className="flex w-full gap-3 rounded-[20px] bg-white p-3 text-left ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all active:scale-[0.99]"
                  >
                    <img loading="lazy" decoding="async" src={i.image} alt={i.title} className="h-20 w-20 shrink-0 rounded-[14px] bg-[#F0F1F3] object-cover"/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-[#141414]">{i.title}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <ConditionBadge condition={i.condition} />
                        <span className="text-[11px] text-black/40">{CATEGORY_LABEL[i.category] ?? 'Товар'}</span>
                      </div>
                      <div className="mt-1.5 text-xs text-black/45">
                        Куплено за {fmtNum(i.purchasePrice)} ₽ · рынок ~{fmtNum(i.estValue)} ₽
                      </div>
                      {i.purchasePrice > 0 && (
                        <div className={cn('mt-0.5 text-xs font-semibold', profit >= 0 ? 'text-[#14532D]' : 'text-red-600')}>
                          {profit >= 0 ? '+' : ''}{fmtNum(profit)} ₽ потенциал
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="mt-6 shrink-0 text-black/20" aria-hidden />
                  </button>
                )
              })}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {/* превью вещи: фото + характеристики из реальных данных */}
            <Card className="flex gap-3 p-3.5">
              <img loading="lazy" decoding="async" src={selected.image} alt={selected.title} className="h-20 w-20 shrink-0 rounded-[14px] bg-[#F0F1F3] object-cover"/>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[#141414]">{selected.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <ConditionBadge condition={selected.condition} />
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium leading-none text-black/55">
                    {CATEGORY_LABEL[selected.category] ?? 'Товар'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-black/45">
                  Рыночная оценка ~{fmtNum(selected.estValue)} ₽
                </p>
              </div>
            </Card>

            <Card className="space-y-3.5 p-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40" htmlFor="price-input">
                  Цена, ₽ (0 = отдам даром)
                </label>
                <div className="flex h-12 items-center gap-2 rounded-[14px] bg-black/[0.04] px-4">
                  <Tag size={15} className="text-black/35" aria-hidden />
                  <input
                    id="price-input"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="0"
                    className="h-full w-full bg-transparent text-[16px] font-bold text-[#141414] outline-none placeholder:text-black/30"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  {[0.85, 0.95, 1.05].map((k) => (
                    <button
                      key={k}
                      onClick={() => setPrice(String(Math.round(selected.estValue * k)))}
                      className="flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[11px] font-medium text-black/60 ring-1 ring-black/[0.08] transition-all active:scale-[0.97]"
                    >
                      <TrendingUp size={10} aria-hidden /> {Math.round(k * 100)}% рынка
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40" htmlFor="desc-input">
                  Описание
                </label>
                <textarea
                  id="desc-input"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  placeholder="Расскажите про состояние, комплект, причину продажи..."
                  className="w-full resize-none rounded-[14px] bg-black/[0.04] p-3 text-sm text-[#141414] outline-none placeholder:text-black/30 focus:ring-1 focus:ring-black/[0.12]"
                />
              </div>
            </Card>

            {msg && <div className="px-1 text-xs text-red-600">{msg}</div>}
            <button
              onClick={publish}
              disabled={busy}
              className="flex h-12 w-full items-center justify-center rounded-full bg-[#14532D] text-[15px] font-bold text-white shadow-[0_4px_14px_rgba(20,83,45,0.25)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
            >
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : 'Опубликовать'}
            </button>
            <p className="px-4 text-center text-[11px] leading-relaxed text-black/40">
              После продажи получите {fmtMoney(Math.round(Number(price || 0) * 0.96))}. Минус 4% налог
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
