'use client'

// Профиль Avito: статистика, мои объявления, инвентарь, отзывы
import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Star, Package, Tag, Zap, Trash2, ChevronLeft, MessageSquareText, Wallet, TrendingUp, ShoppingBag, PenLine, BadgeCheck, Pencil, Swords,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtNum, fmtMoney, timeAgo, initials, hueColor } from '@/lib/format'
import type { ProfileData, FeedListing, InventoryItemDTO, RivalsData } from '@/lib/types'
import { ListingCard } from './FeedScreen'
import { ConditionBadge } from './AvitoApp'

export default function ProfileScreen({ onOpenListing, onGoSell }: {
  onOpenListing: (id: string) => void
  onGoSell: () => void
}) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [items, setItems] = useState<InventoryItemDTO[]>([])
  const [myListings, setMyListings] = useState<FeedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subTab, setSubTab] = useState<'listings' | 'inventory' | 'purchases'>('listings')
  const [busy, setBusy] = useState('')
  // изменение цены
  const [priceEdit, setPriceEdit] = useState<FeedListing | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [priceError, setPriceError] = useState('')
  const [priceBusy, setPriceBusy] = useState(false)
  // конкуренты по этому товару (видны прямо в шите цены)
  const [rivals, setRivals] = useState<RivalsData | null>(null)
  const [rivalsLoading, setRivalsLoading] = useState(false)
  const refreshSession = useOS((s) => s.refreshSession)
  const pushToast = useOS((s) => s.pushToast)

  const load = useCallback(async () => {
    try {
      const [profile, inv, feed] = await Promise.all([
        api.profile(), api.inventory(), api.feed({ mine: true, limit: 30 }),
      ])
      setData(profile)
      setItems(inv.items)
      setMyListings(feed.items)
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const boost = async (id: string) => {
    setBusy(id)
    try {
      const res = await api.boostListing(id)
      refreshSession({ balance: res.balance })
      await load()
    } catch { /* toast? */ } finally { setBusy('') }
  }
  const remove = async (id: string) => {
    setBusy(id)
    try {
      await api.removeListing(id)
      await load()
    } catch { /* ignore */ } finally { setBusy('') }
  }

  const openPriceEdit = (l: FeedListing) => {
    setPriceEdit(l)
    setPriceInput(l.price === 0 ? '' : String(l.price))
    setPriceError('')
    // подтягиваем рынок этого товара
    setRivals(null)
    setRivalsLoading(true)
    api.listingRivals(l.id)
      .then(setRivals)
      .catch(() => setRivals(null))
      .finally(() => setRivalsLoading(false))
  }

  const savePrice = async () => {
    if (!priceEdit) return
    const val = Math.floor(Number(priceInput.replace(/[^\d]/g, '')) || 0)
    if (val === priceEdit.price) {
      setPriceEdit(null)
      return
    }
    setPriceBusy(true)
    setPriceError('')
    try {
      const res = await api.updatePrice(priceEdit.id, val)
      setPriceEdit(null)
      pushToast(
        'Avito',
        res.warStarted
          ? `Цена изменена: ${fmtNum(res.oldPrice ?? priceEdit.price)} → ${fmtNum(val)} ₽. Конкуренты уже отреагируют`
          : 'Цена обновлена',
      )
      await load()
    } catch (e) {
      setPriceError(e instanceof ApiError ? e.message : 'Не удалось изменить цену')
    } finally {
      setPriceBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="h-full bg-[#f4f5f7] flex items-center justify-center">
        <Loader2 className="animate-spin text-neutral-300" size={28} />
      </div>
    )
  }
  if (error && !data) {
    return <div className="p-6 text-sm text-red-500 text-center">{error}</div>
  }
  if (!data) return null

  const rating = data.rating

  return (
    <div className="h-full overflow-y-auto [scrollbar-width:thin] bg-[#f4f5f7]">
      {/* карточка профиля */}
      <div className="bg-white p-4 border-b border-black/5">
        <div className="flex items-center gap-3">
          {data.user.photoUrl ? (
             
            <img src={data.user.photoUrl} alt={data.user.displayName} className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{ background: hueColor(205) }}
            >
              {initials(data.user.displayName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-neutral-900 truncate">{data.user.displayName}</p>
            <p className="text-xs text-neutral-400">{data.user.username} · {data.user.city}</p>
            <div className="flex items-center gap-1 mt-1">
              <Star size={13} className="text-amber-400 fill-amber-400" />
              <span className="text-sm font-semibold text-neutral-800">
                {rating > 0 ? rating.toFixed(1) : '—'}
              </span>
              <span className="text-xs text-neutral-400">({data.user.ratingCount})</span>
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold">
                {data.user.level} ур.
              </span>
            </div>
          </div>
        </div>
        {data.user.bio && <p className="text-xs text-neutral-500 mt-2.5">{data.user.bio}</p>}

        <div className="grid grid-cols-3 gap-2 mt-3">
          <StatCard icon={Wallet} label="Баланс" value={fmtMoney(data.user.balance)} />
          <StatCard icon={TrendingUp} label="Сделок" value={String(data.soldCount)} />
          <StatCard icon={Package} label="Склад" value={fmtMoney(data.inventoryValue)} />
        </div>
      </div>

      {/* переключатель */}
      <div className="flex gap-2 p-3 sticky top-0 z-10 bg-[#f4f5f7]">
        <button
          onClick={() => setSubTab('listings')}
          className={`flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
            subTab === 'listings' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'
          }`}
        >
          <Tag size={13} /> Объявления ({myListings.length})
        </button>
        <button
          onClick={() => setSubTab('inventory')}
          className={`flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
            subTab === 'inventory' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'
          }`}
        >
          <Package size={13} /> Инвентарь ({items.length})
        </button>
        <button
          onClick={() => setSubTab('purchases')}
          className={`flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
            subTab === 'purchases' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'
          }`}
        >
          <ShoppingBag size={13} /> Покупки ({data.purchases.length})
        </button>
      </div>

      <div className="px-3 pb-4">
        {subTab === 'listings' && (
          myListings.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <p className="text-sm text-neutral-500">Нет активных объявлений</p>
              <button onClick={onGoSell} className="mt-2 text-xs font-semibold text-[#00AAFF]">
                Выставить вещь из инвентаря
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {myListings.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl p-3">
                  <button onClick={() => onOpenListing(l.id)} className="w-full flex gap-3 text-left">
                    { }
                    <img src={l.image} alt={l.title} className="w-16 h-16 rounded-xl object-cover bg-neutral-100 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{l.title}</p>
                      <p className="text-sm font-bold text-neutral-900 mt-0.5">{l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-1">
                        <MessageSquareText size={10} /> {l.views} просмотров
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => openPriceEdit(l)}
                      disabled={busy === l.id}
                      className="h-8 px-3 rounded-lg bg-[#00AAFF]/10 text-[#0095E0] text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Pencil size={11} /> Цена
                    </button>
                    <button
                      onClick={() => boost(l.id)}
                      disabled={busy === l.id || l.boosted}
                      className="flex-1 h-8 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <Zap size={11} /> {l.boosted ? 'Продвинуто' : 'Продвинуть'}
                    </button>
                    <button
                      onClick={() => remove(l.id)}
                      disabled={busy === l.id}
                      className="h-8 px-3 rounded-lg bg-red-50 text-red-500 text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 size={11} /> Снять
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {subTab === 'inventory' && (items.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-sm text-neutral-500">Инвентарь пуст</p>
            <p className="text-xs text-neutral-400 mt-1">Купите товары на главной — или ловите «Отдам даром»</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((i) => {
              const profit = i.estValue - i.purchasePrice
              return (
                <div key={i.id} className="bg-white rounded-2xl p-3 flex gap-3">
                  { }
                  <img src={i.image} alt={i.title} className="w-16 h-16 rounded-xl object-cover bg-neutral-100 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{i.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <ConditionBadge condition={i.condition} />
                      {i.listed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00AAFF]/10 text-[#00AAFF] font-bold">ВЫСТАВЛЕНО</span>}
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      за {fmtNum(i.purchasePrice)} ₽ · рынок ~{fmtNum(i.estValue)} ₽
                    </p>
                    {profit !== 0 && (
                      <p className={`text-[11px] font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {profit >= 0 ? '+' : ''}{fmtNum(profit)} ₽
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {subTab === 'purchases' && (
          data.purchases.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <p className="text-sm text-neutral-500">Покупок пока нет</p>
              <p className="text-xs text-neutral-400 mt-1">Купите что-нибудь — и оцените сделку</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.purchases.map((p) => (
                <div key={p.listingId} className="bg-white rounded-2xl p-3">
                  <button onClick={() => onOpenListing(p.listingId)} className="w-full flex gap-3 text-left">
                    <img src={p.image} alt={p.title} className="w-16 h-16 rounded-xl object-cover bg-neutral-100 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{p.title}</p>
                      <p className="text-sm font-bold text-neutral-900 mt-0.5">{p.price === 0 ? 'Даром' : `${fmtNum(p.price)} ₽`}</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">{timeAgo(p.createdAt)}</p>
                    </div>
                  </button>
                  <div className="flex gap-2 mt-2">
                    {p.reviewed ? (
                      <span className="h-8 px-3 rounded-lg bg-green-50 text-green-600 text-[11px] font-semibold flex items-center gap-1">
                        <BadgeCheck size={12} /> Отзыв отправлен
                      </span>
                    ) : (
                      <button
                        onClick={() => onOpenListing(p.listingId)}
                        className="h-8 px-3 rounded-lg bg-amber-50 text-amber-600 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <PenLine size={12} /> Оценить сделку
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* отзывы */}
        {data.reviews.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold text-neutral-900 mb-2 px-1">Отзывы</h3>
            <div className="space-y-2">
              {data.reviews.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-neutral-800">{r.from}</span>
                    <span className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={10} className={i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-neutral-200'} />
                      ))}
                    </span>
                    <span className="text-[10px] text-neutral-300 ml-auto">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-1">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Изменение цены — bottom sheet */}
      {priceEdit && (
        <div
          className="absolute inset-0 z-50 flex items-end bg-black/40"
          onClick={() => !priceBusy && setPriceEdit(null)}
          role="dialog"
          aria-label="Изменение цены"
        >
          <div
            className="w-full rounded-t-3xl bg-white p-5 pb-8 max-h-[88%] overflow-y-auto [scrollbar-width:thin] animate-[sheet-up_220ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200" />
            <div className="flex items-center gap-3">
              <img src={priceEdit.image} alt={priceEdit.title} className="w-12 h-12 rounded-xl object-cover bg-neutral-100" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900 truncate">{priceEdit.title}</p>
                <p className="text-xs text-neutral-400">Текущая цена: {priceEdit.price === 0 ? 'Даром' : `${fmtNum(priceEdit.price)} ₽`}</p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-semibold text-neutral-500">Новая цена, ₽</label>
            <div className="relative mt-1.5">
              <input
                autoFocus
                inputMode="numeric"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') void savePrice() }}
                placeholder="0 — отдать даром"
                className="w-full h-12 rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-base font-bold text-neutral-900 outline-none focus:border-[#00AAFF]"
                aria-label="Новая цена"
              />
            </div>
            {priceEdit.price >= 500 && priceEdit.price > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-400">
                <Swords size={12} className="mt-0.5 shrink-0 text-violet-400" />
                Если снизите цену — конкуренты с таким же товаром заметят и ответят: кто-то подрежет цену, кто-то напишет вам не самое приятное сообщение.
              </p>
            )}

            {/* Рынок этого товара: конкуренты и их цены */}
            {rivalsLoading && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-neutral-50 py-3 text-[11px] text-neutral-400">
                <Loader2 size={12} className="animate-spin" /> Смотрим, кто ещё продаёт такой товар…
              </div>
            )}
            {rivals && rivals.rivals.length > 1 && (
              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3" aria-label="Рынок этого товара">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] font-bold text-neutral-700">Рынок этого товара</p>
                  <p className="text-[10px] text-neutral-400">
                    {rivals.count} шт · средняя {fmtNum(rivals.avg)} ₽
                  </p>
                </div>
                <div className="mt-2 space-y-1.5">
                  {rivals.rivals.slice(0, 5).map((r) => {
                    const max = Math.max(...rivals.rivals.map((x) => x.price), 1)
                    const cheapest = r.price === Math.min(...rivals.rivals.map((x) => x.price))
                    return (
                      <div key={r.id} className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                          style={{ background: r.isMine ? '#00AAFF' : hueColor(r.seller.length * 47 % 360) }}
                          aria-hidden
                        >
                          {initials(r.seller)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className={`text-[10px] truncate ${r.isMe ? 'font-bold text-[#0084c9]' : 'text-neutral-600'}`}>
                              {r.isMe ? 'Вы' : r.seller}
                            </p>
                            {cheapest && !r.isMe && (
                              <span className="shrink-0 rounded bg-emerald-100 px-1 text-[8px] font-bold text-emerald-600">мин</span>
                            )}
                          </div>
                          <div className="mt-0.5 h-1 rounded-full bg-neutral-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.isMe ? 'bg-[#00AAFF]' : cheapest ? 'bg-emerald-400' : 'bg-neutral-400'}`}
                              style={{ width: `${Math.max(8, Math.round((r.price / max) * 100))}%` }}
                            />
                          </div>
                        </div>
                        <span className={`text-[11px] font-bold shrink-0 ${r.isMe ? 'text-[#0084c9]' : 'text-neutral-700'}`}>
                          {fmtNum(r.price)} ₽
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {rivals && rivals.rivals.length <= 1 && (
              <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-[11px] text-neutral-400">
                Вы единственный активный продавец такого товара — рынок пока ваш.
              </p>
            )}

            {/* Позиция при новой цене */}
            {rivals && rivals.rivals.length > 1 && priceInput && Number(priceInput) > 0 && (
              <p className="mt-2 text-[11px] font-medium text-neutral-500" aria-live="polite">
                С ценой {fmtNum(Number(priceInput))} ₽ вы{' '}
                {(() => {
                  const cheaper = rivals.rivals.filter((r) => !r.isMe && r.price < Number(priceInput)).length
                  const place = cheaper + 1
                  return place === 1
                    ? <span className="text-emerald-600">самый дешёвый — покупатели придут к вам</span>
                    : <span>будете №{place} из {rivals.rivals.length} по цене</span>
                })()}
              </p>
            )}
            {priceError && <p className="mt-2 text-[11px] text-red-500">{priceError}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => !priceBusy && setPriceEdit(null)}
                className="h-12 rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-600 active:scale-[0.98] transition"
              >
                Отмена
              </button>
              <button
                onClick={() => void savePrice()}
                disabled={priceBusy}
                className="h-12 rounded-xl bg-[#00AAFF] text-sm font-bold text-white active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center"
              >
                {priceBusy ? <Loader2 size={16} className="animate-spin" /> : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="bg-[#f4f5f7] rounded-xl p-2.5">
      <div className="flex items-center gap-1 text-neutral-400">
        <Icon size={11} />
        <span className="text-[9px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xs font-bold text-neutral-900 mt-1 truncate">{value}</p>
    </div>
  )
}
