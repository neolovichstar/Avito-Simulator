'use client'

// Профиль «Resale» — светлый дизайн 1:1 как настоящий Авито:
// аватар 72, имя bold 20, зелёная звезда рейтинга, карточка кошелька #F0F1F5,
// меню-список белых рядов с ChevronRight. Логика (цена/продвижение/снятие) сохранена.
import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Star, Package, Tag, Zap, Trash2, ChevronRight, MessageSquareText, Wallet,
  TrendingUp, ShoppingBag, PenLine, BadgeCheck, Pencil, Swords, Heart,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtNum, fmtMoney, timeAgo, initials, hueColor } from '@/lib/format'
import type { ProfileData, FeedListing, InventoryItemDTO, RivalsData } from '@/lib/types'
import { getFavs } from './FeedScreen'
import { ConditionBadge } from './AvitoApp'

const SUB_TABS = [
  { key: 'listings' as const, icon: Tag, label: 'Мои объявления' },
  { key: 'inventory' as const, icon: Package, label: 'Инвентарь' },
  { key: 'purchases' as const, icon: ShoppingBag, label: 'Заказы' },
]

export default function ProfileScreen({ onOpenListing, onGoSell, onGoFavorites }: {
  onOpenListing: (id: string) => void
  onGoSell: () => void
  onGoFavorites: () => void
}) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [items, setItems] = useState<InventoryItemDTO[]>([])
  const [myListings, setMyListings] = useState<FeedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subTab, setSubTab] = useState<'listings' | 'inventory' | 'purchases'>('listings')
  const [favsCount, setFavsCount] = useState(0)
  const [showReviews, setShowReviews] = useState(false)
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

  useEffect(() => {
    load()
    setFavsCount(getFavs().length)
  }, [load])

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
        'Resale',
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
      <div className="h-full bg-[#F7F8FA] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#8B8F99]" size={28} />
      </div>
    )
  }
  if (error && !data) {
    return <div className="p-6 text-sm text-[#D14343] text-center bg-[#F7F8FA] h-full">{error}</div>
  }
  if (!data) return null

  const rating = data.rating

  return (
    <div className="h-full overflow-y-auto [scrollbar-width:thin] bg-[#F7F8FA] pb-4">
      {/* шапка профиля: аватар 72, имя bold 20, зелёная звезда */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3.5">
          {data.user.photoUrl ? (
            <img src={data.user.photoUrl} alt={data.user.displayName} className="w-[72px] h-[72px] rounded-full object-cover ring-1 ring-[#EBEDF0]" />
          ) : (
            <div
              className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0 bg-[#5C616B]"
              aria-hidden
            >
              {initials(data.user.displayName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[20px] font-bold text-black leading-tight truncate">{data.user.displayName}</p>
            <p className="text-[13px] text-[#8B8F99] mt-1 flex items-center gap-1 flex-wrap">
              <Star size={12} className="text-[#0AC760] fill-[#0AC760]" aria-hidden />
              <span className="font-semibold text-black">{rating > 0 ? rating.toFixed(1) : '—'}</span>
              <span aria-hidden>•</span>
              <span>{data.user.city}</span>
              <span aria-hidden>•</span>
              <span>{data.user.level} уровень</span>
            </p>
          </div>
        </div>
        {data.user.bio && <p className="text-[13px] text-[#5C616B] mt-2.5">{data.user.bio}</p>}
      </div>

      {/* карточка кошелька */}
      <div className="px-4 mt-3.5">
        <div className="rounded-2xl bg-[#F0F1F5] p-4">
          <div className="flex items-center gap-2">
            <Wallet size={15} className="text-[#8B8F99]" aria-hidden />
            <span className="text-[12px] font-medium text-[#8B8F99]">Кошелёк</span>
          </div>
          <p className="text-[22px] font-bold text-black mt-1 tabular-nums leading-none">{fmtMoney(data.user.balance)}</p>
          <div className="flex items-center gap-4 mt-2.5 text-[12px] text-[#8B8F99]">
            <span className="flex items-center gap-1"><TrendingUp size={12} aria-hidden /> Сделок: <b className="text-black">{data.soldCount}</b></span>
            <span className="flex items-center gap-1"><Package size={12} aria-hidden /> Склад: <b className="text-black">{fmtMoney(data.inventoryValue)}</b></span>
          </div>
        </div>
      </div>

      {/* меню-список: белые ряды с шевронами */}
      <div className="px-4 mt-3">
        <div className="rounded-2xl bg-white overflow-hidden" role="tablist" aria-label="Разделы профиля">
          {SUB_TABS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              role="tab"
              aria-selected={subTab === key}
              className="w-full flex items-center gap-3 px-4 min-h-[50px] text-left transition-colors active:bg-[#F7F8FA] border-b border-[#EBEDF0] last:border-b-0"
            >
              <Icon size={19} className={subTab === key ? 'text-black' : 'text-[#8B8F99]'} aria-hidden />
              <span className={`flex-1 text-[14px] ${subTab === key ? 'font-semibold text-black' : 'font-medium text-black'}`}>{label}</span>
              <span className="text-[12px] tabular-nums text-[#8B8F99]">
                {key === 'listings' ? myListings.length : key === 'inventory' ? items.length : data.purchases.length}
              </span>
              <ChevronRight size={16} className="text-[#C4C8CF]" aria-hidden />
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-white overflow-hidden mt-2.5">
          <button
            onClick={onGoFavorites}
            className="w-full flex items-center gap-3 px-4 min-h-[50px] text-left active:bg-[#F7F8FA] border-b border-[#EBEDF0]"
          >
            <Heart size={19} className="text-[#8B8F99]" aria-hidden />
            <span className="flex-1 text-[14px] font-medium text-black">Избранное</span>
            <span className="text-[12px] tabular-nums text-[#8B8F99]">{favsCount}</span>
            <ChevronRight size={16} className="text-[#C4C8CF]" aria-hidden />
          </button>
          <button
            onClick={() => setShowReviews((v) => !v)}
            aria-expanded={showReviews}
            className="w-full flex items-center gap-3 px-4 min-h-[50px] text-left active:bg-[#F7F8FA]"
          >
            <MessageSquareText size={19} className="text-[#8B8F99]" aria-hidden />
            <span className="flex-1 text-[14px] font-medium text-black">Отзывы</span>
            <span className="text-[12px] tabular-nums text-[#8B8F99]">{data.reviews.length}</span>
            <ChevronRight size={16} className={`text-[#C4C8CF] transition-transform ${showReviews ? 'rotate-90' : ''}`} aria-hidden />
          </button>
        </div>
      </div>

      {/* контент выбранного раздела */}
      <div className="px-4 pt-3">
        {subTab === 'listings' && (
          myListings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#C4C8CF] bg-white p-8 text-center">
              <p className="text-sm text-[#5C616B]">Нет активных объявлений</p>
              <button onClick={onGoSell} className="mt-2.5 h-10 px-4 rounded-[12px] bg-black text-white text-xs font-bold active:bg-[#1A1A1A]">
                Выставить вещь из инвентаря
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {myListings.map((l) => (
                <div key={l.id} className="rounded-2xl bg-white p-3">
                  <button onClick={() => onOpenListing(l.id)} className="w-full flex gap-3 text-left">
                    <img src={l.image} alt={l.title} className="w-16 h-16 rounded-xl object-cover bg-[#F0F1F5] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-black truncate">{l.title}</p>
                      <p className="text-[15px] font-bold text-black mt-0.5 tabular-nums">{l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}</p>
                      <p className="text-[11px] text-[#8B8F99] mt-0.5 flex items-center gap-1">
                        <MessageSquareText size={10} aria-hidden /> {l.views} просмотров
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => openPriceEdit(l)}
                      disabled={busy === l.id}
                      className="h-9 px-3.5 rounded-[10px] bg-[#F0F1F5] text-black text-[12px] font-semibold flex items-center gap-1 disabled:opacity-50 active:bg-[#E6E8ED]"
                    >
                      <Pencil size={11} aria-hidden /> Цена
                    </button>
                    <button
                      onClick={() => boost(l.id)}
                      disabled={busy === l.id || l.boosted}
                      className="flex-1 h-9 rounded-[10px] bg-[#F0F1F5] text-black text-[12px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50 active:bg-[#E6E8ED]"
                    >
                      <Zap size={11} aria-hidden /> {l.boosted ? 'Продвинуто' : 'Продвинуть'}
                    </button>
                    <button
                      onClick={() => remove(l.id)}
                      disabled={busy === l.id}
                      className="h-9 px-3.5 rounded-[10px] bg-[#FDEBEB] text-[#D14343] text-[12px] font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 size={11} aria-hidden /> Снять
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {subTab === 'inventory' && (items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#C4C8CF] bg-white p-8 text-center">
            <p className="text-sm text-[#5C616B]">Инвентарь пуст</p>
            <p className="text-xs text-[#8B8F99] mt-1">Купите товары на главной — или ловите «Отдам даром»</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((i) => {
              const profit = i.estValue - i.purchasePrice
              return (
                <div key={i.id} className="rounded-2xl bg-white p-3 flex gap-3">
                  <img src={i.image} alt={i.title} className="w-16 h-16 rounded-xl object-cover bg-[#F0F1F5] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-black truncate">{i.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <ConditionBadge condition={i.condition} />
                      {i.listed && <span className="text-[10px] px-1.5 py-0.5 rounded-[10px] bg-[#E6F9EF] text-[#067A47] font-bold">ВЫСТАВЛЕНО</span>}
                    </div>
                    <p className="text-[11px] text-[#8B8F99] mt-1">
                      за {fmtNum(i.purchasePrice)} ₽ · рынок ~{fmtNum(i.estValue)} ₽
                    </p>
                    {profit !== 0 && (
                      <p className={`text-[11px] font-bold ${profit >= 0 ? 'text-[#067A47]' : 'text-[#D14343]'}`}>
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
            <div className="rounded-2xl border border-dashed border-[#C4C8CF] bg-white p-8 text-center">
              <p className="text-sm text-[#5C616B]">Покупок пока нет</p>
              <p className="text-xs text-[#8B8F99] mt-1">Купите что-нибудь — и оцените сделку</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.purchases.map((p) => (
                <div key={p.listingId} className="rounded-2xl bg-white p-3">
                  <button onClick={() => onOpenListing(p.listingId)} className="w-full flex gap-3 text-left">
                    <img src={p.image} alt={p.title} className="w-16 h-16 rounded-xl object-cover bg-[#F0F1F5] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-black truncate">{p.title}</p>
                      <p className="text-[15px] font-bold text-black mt-0.5 tabular-nums">{p.price === 0 ? 'Даром' : `${fmtNum(p.price)} ₽`}</p>
                      <p className="text-[11px] text-[#8B8F99] mt-0.5">{timeAgo(p.createdAt)}</p>
                    </div>
                  </button>
                  <div className="flex gap-2 mt-2.5">
                    {p.reviewed ? (
                      <span className="h-9 px-3.5 rounded-[10px] bg-[#E6F9EF] text-[#067A47] text-[12px] font-semibold flex items-center gap-1">
                        <BadgeCheck size={12} aria-hidden /> Отзыв отправлен
                      </span>
                    ) : (
                      <button
                        onClick={() => onOpenListing(p.listingId)}
                        className="h-9 px-3.5 rounded-[10px] bg-[#FFF4E5] text-[#B25E09] text-[12px] font-semibold flex items-center gap-1"
                      >
                        <PenLine size={12} aria-hidden /> Оценить сделку
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* отзывы — раскрываются из меню */}
        {showReviews && (
          <div className="mt-4">
            <h3 className="text-[15px] font-semibold text-black mb-2">Отзывы обо мне</h3>
            {data.reviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#C4C8CF] bg-white p-6 text-center text-xs text-[#8B8F99]">
                Отзывов пока нет — они появятся после первых сделок
              </div>
            ) : (
              <div className="space-y-2">
                {data.reviews.map((r) => (
                  <div key={r.id} className="rounded-2xl bg-white p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-black">{r.from}</span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={10} className={i < r.rating ? 'text-[#0AC760] fill-[#0AC760]' : 'text-[#EBEDF0]'} aria-hidden />
                        ))}
                      </span>
                      <span className="text-[10px] text-[#8B8F99] ml-auto">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="text-xs text-[#5C616B] mt-1">{r.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Изменение цены — bottom sheet */}
      {priceEdit && (
        <div
          className="absolute inset-0 z-50 flex items-end bg-black/50"
          onClick={() => !priceBusy && setPriceEdit(null)}
          role="dialog"
          aria-label="Изменение цены"
        >
          <div
            className="w-full rounded-t-3xl bg-white p-5 max-h-[88%] overflow-y-auto [scrollbar-width:thin] animate-[sheet-up_220ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#EBEDF0]" />
            <div className="flex items-center gap-3">
              <img src={priceEdit.image} alt={priceEdit.title} className="w-12 h-12 rounded-xl object-cover bg-[#F0F1F5]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-black truncate">{priceEdit.title}</p>
                <p className="text-xs text-[#8B8F99]">Текущая цена: {priceEdit.price === 0 ? 'Даром' : `${fmtNum(priceEdit.price)} ₽`}</p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-semibold text-[#8B8F99]" htmlFor="profile-price-input">Новая цена, ₽</label>
            <div className="mt-1.5">
              <input
                autoFocus
                id="profile-price-input"
                inputMode="numeric"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') void savePrice() }}
                placeholder="0 — отдать даром"
                className="w-full h-12 rounded-[12px] bg-[#F0F1F5] px-4 text-base font-bold text-black outline-none focus:ring-1 focus:ring-[#C4C8CF] placeholder:text-[#8B8F99]"
                aria-label="Новая цена"
              />
            </div>
            {priceEdit.price >= 500 && priceEdit.price > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#8B8F99]">
                <Swords size={12} className="mt-0.5 shrink-0 text-[#067A47]" aria-hidden />
                Если снизите цену — конкуренты с таким же товаром заметят и ответят: кто-то подрежет цену, кто-то напишет вам не самое приятное сообщение.
              </p>
            )}

            {/* Рынок этого товара: конкуренты и их цены */}
            {rivalsLoading && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#F7F8FA] py-3 text-[11px] text-[#8B8F99]">
                <Loader2 size={12} className="animate-spin" aria-hidden /> Смотрим, кто ещё продаёт такой товар…
              </div>
            )}
            {rivals && rivals.rivals.length > 1 && (
              <div className="mt-3 rounded-xl border border-[#EBEDF0] bg-white p-3" aria-label="Рынок этого товара">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] font-bold text-black">Рынок этого товара</p>
                  <p className="text-[10px] text-[#8B8F99]">
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
                          style={{ background: r.isMine ? '#0AC760' : hueColor(r.seller.length * 47 % 360) }}
                          aria-hidden
                        >
                          {initials(r.seller)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className={`text-[10px] truncate ${r.isMe ? 'font-bold text-[#067A47]' : 'text-[#5C616B]'}`}>
                              {r.isMe ? 'Вы' : r.seller}
                            </p>
                            {cheapest && !r.isMe && (
                              <span className="shrink-0 rounded bg-[#E6F9EF] px-1 text-[8px] font-bold text-[#067A47]">мин</span>
                            )}
                          </div>
                          <div className="mt-0.5 h-1 rounded-full bg-[#F0F1F5] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.isMe ? 'bg-[#0AC760]' : cheapest ? 'bg-[#8B8F99]' : 'bg-[#C4C8CF]'}`}
                              style={{ width: `${Math.max(8, Math.round((r.price / max) * 100))}%` }}
                            />
                          </div>
                        </div>
                        <span className={`text-[11px] font-bold shrink-0 tabular-nums ${r.isMe ? 'text-[#067A47]' : 'text-black'}`}>
                          {fmtNum(r.price)} ₽
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {rivals && rivals.rivals.length <= 1 && (
              <p className="mt-3 rounded-xl bg-[#F7F8FA] px-3 py-2 text-[11px] text-[#8B8F99]">
                Вы единственный активный продавец такого товара — рынок пока ваш.
              </p>
            )}

            {/* Позиция при новой цене */}
            {rivals && rivals.rivals.length > 1 && priceInput && Number(priceInput) > 0 && (
              <p className="mt-2 text-[11px] font-medium text-[#5C616B]" aria-live="polite">
                С ценой {fmtNum(Number(priceInput))} ₽ вы{' '}
                {(() => {
                  const cheaper = rivals.rivals.filter((r) => !r.isMe && r.price < Number(priceInput)).length
                  const place = cheaper + 1
                  return place === 1
                    ? <span className="text-[#067A47]">самый дешёвый — покупатели придут к вам</span>
                    : <span>будете №{place} из {rivals.rivals.length} по цене</span>
                })()}
              </p>
            )}
            {priceError && <p className="mt-2 text-[11px] text-[#D14343]">{priceError}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => !priceBusy && setPriceEdit(null)}
                className="h-12 rounded-[12px] bg-[#F0F1F5] text-sm font-semibold text-black active:bg-[#E6E8ED]"
              >
                Отмена
              </button>
              <button
                onClick={() => void savePrice()}
                disabled={priceBusy}
                className="h-12 rounded-[12px] bg-black text-sm font-bold text-white active:bg-[#1A1A1A] disabled:opacity-60 flex items-center justify-center"
              >
                {priceBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
