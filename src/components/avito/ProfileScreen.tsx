'use client'

// Профиль «Resale» — светлый минимализм: аватар 72, имя 26 bold, бейдж ★ PRO,
// белая карточка кошелька, меню-ряды с шевронами, разделы объявлений/склада/заказов.
// Логика (цена/продвижение/снятие/отзывы) сохранена 1:1.
import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Star, Package, Tag, Zap, Trash2, ChevronRight, MessageSquareText, Wallet,
  TrendingUp, ShoppingBag, PenLine, BadgeCheck, Pencil, Swords, Heart, Truck, PackageCheck, CloudOff,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtNum, fmtMoney, timeAgo, initials, hueColor } from '@/lib/format'
import { UserAvatar } from '@/components/shared/UserAvatar'
import type { ProfileData, FeedListing, InventoryItemDTO, RivalsData, TransitItemDTO } from '@/lib/types'
import { getFavs } from './FeedScreen'
import { ConditionBadge } from './AvitoApp'
import { Card, EmptyState, ErrorState, Overline, Skeleton, cn } from './ui'

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
  const [inTransit, setInTransit] = useState<TransitItemDTO[]>([])
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
      setInTransit(inv.inTransit ?? [])
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
      <div className="h-full overflow-y-auto bg-[#F5F6F8]">
        <div className="flex items-center gap-3.5 px-4 pt-5">
          <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-40 rounded-md" />
            <Skeleton className="h-3.5 w-48 rounded-md" />
          </div>
        </div>
        <div className="px-4 pt-4">
          <Skeleton className="h-[104px] w-full rounded-[20px]" />
        </div>
        <div className="px-4 pt-3">
          <Skeleton className="h-[150px] w-full rounded-[20px]" />
        </div>
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="h-full overflow-y-auto bg-[#F5F6F8]">
        <ErrorState
          icon={<CloudOff size={28} />}
          note={error}
          onRetry={() => void load()}
          className="pt-16"
        />
      </div>
    )
  }
  if (!data) return null

  const rating = data.rating

  return (
    <div className="h-full overflow-y-auto bg-[#F5F6F8] pb-4 [scrollbar-width:thin]">
      {/* шапка профиля: аватар 72, имя 26, бейдж ★ PRO */}
      <div className="px-4 pt-5">
        <Overline>Профиль</Overline>
        <div className="mt-1.5 flex items-center gap-3.5">
          {data.user.photoUrl ? (
            <img loading="lazy" decoding="async" src={data.user.photoUrl} alt={data.user.displayName} className="h-[72px] w-[72px] shrink-0 rounded-full object-cover ring-1 ring-black/[0.08]"/>
          ) : (
            <UserAvatar name={data.user.displayName} className="h-[72px] w-[72px] shrink-0 rounded-full ring-1 ring-black/[0.08]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[26px] font-bold tracking-tight leading-tight text-[#17181A]">
              <span className="truncate">{data.user.displayName}</span>
              {data.badge && (
                <span title="Resale+" aria-label="Бейдж Resale+" className="shrink-0 rounded-md bg-gradient-to-br from-amber-300 to-amber-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-[#3a2a05] shadow-sm">
                  ★ PRO
                </span>
              )}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[13px] text-[#17181A]/45">
              <Star size={12} className="fill-[#16A34A] text-[#16A34A]" aria-hidden />
              <span className="font-semibold text-[#17181A]">{rating > 0 ? rating.toFixed(1) : '—'}</span>
              <span aria-hidden>·</span>
              <span>{data.user.city}</span>
              <span aria-hidden>·</span>
              <span>{data.user.level} уровень</span>
            </p>
          </div>
        </div>
        {data.user.bio && <p className="mt-2.5 text-[13px] leading-relaxed text-[#17181A]/50">{data.user.bio}</p>}
      </div>

      {/* карточка кошелька */}
      <div className="px-4 pt-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Wallet size={14} className="text-[#17181A]/35" aria-hidden />
            <Overline>Кошелёк</Overline>
          </div>
          <p className="mt-1 text-[26px] font-extrabold tracking-tight leading-none text-[#17181A] tabular-nums">{fmtMoney(data.user.balance)}</p>
          <div className="mt-2.5 flex items-center gap-4 text-[12px] text-[#17181A]/45">
            <span className="flex items-center gap-1"><TrendingUp size={12} aria-hidden /> Сделок: <b className="font-semibold text-[#17181A]">{data.soldCount}</b></span>
            <span className="flex items-center gap-1"><Package size={12} aria-hidden /> Склад: <b className="font-semibold text-[#17181A]">{fmtMoney(data.inventoryValue)}</b></span>
          </div>
        </Card>
      </div>

      {/* меню-список: белые ряды с шевронами */}
      <div className="px-4 pt-3">
        <Card className="overflow-hidden" role="tablist" aria-label="Разделы профиля">
          {SUB_TABS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              role="tab"
              aria-selected={subTab === key}
              className={cn(
                'flex w-full min-h-[52px] items-center gap-3 border-b border-black/[0.05] px-4 text-left transition-colors last:border-b-0 active:bg-[#F5F6F8]',
                subTab === key && 'bg-[#14532D]/[0.04]',
              )}
            >
              <Icon size={19} className={subTab === key ? 'text-[#15803D]' : 'text-[#17181A]/35'} aria-hidden />
              <span className={cn('flex-1 text-[14px]', subTab === key ? 'font-semibold text-[#15803D]' : 'font-medium text-[#17181A]')}>{label}</span>
              <span className="text-[12px] tabular-nums text-black/40">
                {key === 'listings' ? myListings.length : key === 'inventory' ? items.length : data.purchases.length}
              </span>
              <ChevronRight size={16} className="text-[#17181A]/25" aria-hidden />
            </button>
          ))}
        </Card>

        <Card className="mt-2.5 overflow-hidden">
          <button
            onClick={onGoFavorites}
            className="flex w-full min-h-[52px] items-center gap-3 border-b border-black/[0.05] px-4 text-left transition-colors active:bg-[#F5F6F8]"
          >
            <Heart size={19} className="text-[#17181A]/35" aria-hidden />
            <span className="flex-1 text-[14px] font-medium text-[#17181A]">Избранное</span>
            <span className="text-[12px] tabular-nums text-black/40">{favsCount}</span>
            <ChevronRight size={16} className="text-[#17181A]/25" aria-hidden />
          </button>
          <button
            onClick={() => setShowReviews((v) => !v)}
            aria-expanded={showReviews}
            className="flex w-full min-h-[52px] items-center gap-3 px-4 text-left transition-colors active:bg-[#F5F6F8]"
          >
            <MessageSquareText size={19} className="text-[#17181A]/35" aria-hidden />
            <span className="flex-1 text-[14px] font-medium text-[#17181A]">Отзывы</span>
            <span className="text-[12px] tabular-nums text-black/40">{data.reviews.length}</span>
            <ChevronRight size={16} className={cn('text-[#17181A]/25 transition-transform', showReviews && 'rotate-90')} aria-hidden />
          </button>
        </Card>
      </div>

      {/* контент выбранного раздела */}
      <div className="px-4 pt-3">
        {subTab === 'listings' && (
          myListings.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Tag size={26} />}
                title="Нет активных объявлений"
                note="Выставите вещь из инвентаря. Её увидят покупатели в ленте"
                action={
                  <button onClick={onGoSell} className="flex h-11 items-center rounded-full bg-[#14532D] px-5 text-xs font-bold text-white shadow-[0_4px_14px_rgba(20,83,45,0.25)] transition-all active:scale-[0.98]">
                    Выставить вещь из инвентаря
                  </button>
                }
                className="py-8"
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {myListings.map((l) => (
                <Card key={l.id} className="p-3">
                  <button onClick={() => onOpenListing(l.id)} className="flex w-full gap-3 text-left">
                    <img loading="lazy" decoding="async" src={l.image} alt={l.title} className="h-16 w-16 shrink-0 rounded-[12px] bg-[#f0f1f3] object-cover"/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-[#17181A]">{l.title}</p>
                      <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[#17181A]">{l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#17181A]/45">
                        <MessageSquareText size={10} aria-hidden /> {l.views} просмотров
                      </p>
                    </div>
                  </button>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => openPriceEdit(l)}
                      disabled={busy === l.id}
                      className="flex h-9 items-center gap-1 rounded-full bg-neutral-200/60 px-3.5 text-[12px] font-semibold text-[#17181A] transition-all active:scale-[0.97] disabled:opacity-50"
                    >
                      <Pencil size={11} aria-hidden /> Цена
                    </button>
                    <button
                      onClick={() => boost(l.id)}
                      disabled={busy === l.id || l.boosted}
                      className="flex h-9 flex-1 items-center justify-center gap-1 rounded-full bg-neutral-200/60 text-[12px] font-semibold text-[#17181A] transition-all active:scale-[0.97] disabled:opacity-50"
                    >
                      <Zap size={11} aria-hidden /> {l.boosted ? 'Продвинуто' : 'Продвинуть'}
                    </button>
                    <button
                      onClick={() => remove(l.id)}
                      disabled={busy === l.id}
                      className="flex h-9 items-center gap-1 rounded-full bg-red-500/[0.09] px-3.5 text-[12px] font-semibold text-red-600 transition-all active:scale-[0.97] disabled:opacity-50"
                    >
                      <Trash2 size={11} aria-hidden /> Снять
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}

        {subTab === 'inventory' && (
          items.length === 0 && inTransit.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Package size={26} />}
                title="Инвентарь пуст"
                note="Купите товары на главной. Или ловите «Отдам даром»"
                className="py-8"
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {/* ЛОГИСТИКА (28-b): вещи, которые ещё едут, — серой секцией с ETA. Тап → Доставки */}
              {inTransit.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => useOS.getState().openApp('delivery')}
                    aria-label={`В пути ${inTransit.length} — открыть Доставки`}
                    className="mb-2 flex w-full items-center gap-2 rounded-[16px] bg-neutral-200/50 p-3 text-left transition-opacity active:opacity-80"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-black/50" aria-hidden>
                      <Truck size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold text-black/60">В пути ({inTransit.length})</span>
                      <span className="block truncate text-[11px] text-black/40">
                        {inTransit[0].title}
                        {inTransit.length > 1 ? ` и ещё ${inTransit.length - 1}` : ''} · заберите в Доставках
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-[#17181A]/25" aria-hidden />
                  </button>

                  <div className="space-y-2">
                    {inTransit.slice(0, 3).map((t) => {
                      const etaLeft = new Date(t.eta).getTime() - Date.now()
                      const label =
                        t.status === 'collecting'
                          ? 'Собираем'
                          : t.status === 'in_transit'
                            ? etaLeft > 0 ? `Прибудет через ~${Math.max(1, Math.ceil(etaLeft / 60000))} мин` : 'Курьер рядом'
                            : 'Прибыл — заберите'
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => useOS.getState().openApp('delivery')}
                          aria-label={`${t.title}: ${label}. Открыть Доставки`}
                          className="flex w-full items-center gap-3 rounded-[16px] bg-neutral-200/40 p-3 text-left opacity-80 transition active:opacity-60"
                        >
                          <img loading="lazy" decoding="async" src={t.image} alt="" className="h-12 w-12 shrink-0 rounded-[12px] bg-neutral-200/60 object-cover grayscale" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-black/60">{t.title}</span>
                            <span className={cn('mt-0.5 block text-[11px] font-medium', t.status === 'arrived' ? 'text-[#15803D]' : 'text-black/40')}>
                              {label}
                            </span>
                          </span>
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-black/50" aria-hidden>
                            {t.status === 'arrived' ? <PackageCheck size={15} /> : <Truck size={15} />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {items.map((i) => {
              const profit = i.estValue - i.purchasePrice
              return (
                <Card key={i.id} className="flex gap-3 p-3">
                  <img loading="lazy" decoding="async" src={i.image} alt={i.title} className="h-16 w-16 shrink-0 rounded-[12px] bg-[#f0f1f3] object-cover"/>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[#17181A]">{i.title}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <ConditionBadge condition={i.condition} />
                      {i.listed && <span className="rounded-full bg-[#14532D]/[0.08] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#15803D]">ВЫСТАВЛЕНО</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-[#17181A]/45">
                      за {fmtNum(i.purchasePrice)} ₽ · рынок ~{fmtNum(i.estValue)} ₽
                    </p>
                    {profit !== 0 && (
                      <p className={cn('text-[11px] font-bold', profit >= 0 ? 'text-[#15803D]' : 'text-red-600')}>
                        {profit >= 0 ? '+' : ''}{fmtNum(profit)} ₽
                      </p>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        ))}

        {subTab === 'purchases' && (
          data.purchases.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ShoppingBag size={26} />}
                title="Покупок пока нет"
                note="Купите что-нибудь. И оцените сделку"
                className="py-8"
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {data.purchases.map((p) => (
                <Card key={p.listingId} className="p-3">
                  <button onClick={() => onOpenListing(p.listingId)} className="flex w-full gap-3 text-left">
                    <img loading="lazy" decoding="async" src={p.image} alt={p.title} className="h-16 w-16 shrink-0 rounded-[12px] bg-[#f0f1f3] object-cover"/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-[#17181A]">{p.title}</p>
                      <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[#17181A]">{p.price === 0 ? 'Даром' : `${fmtNum(p.price)} ₽`}</p>
                      <p className="mt-0.5 text-[11px] text-[#17181A]/45">{timeAgo(p.createdAt)}</p>
                    </div>
                  </button>
                  <div className="mt-2.5 flex gap-2">
                    {p.reviewed ? (
                      <span className="flex h-9 items-center gap-1 rounded-full bg-[#14532D]/[0.08] px-3.5 text-[12px] font-semibold text-[#15803D]">
                        <BadgeCheck size={12} aria-hidden /> Отзыв отправлен
                      </span>
                    ) : (
                      <button
                        onClick={() => onOpenListing(p.listingId)}
                        className="flex h-9 items-center gap-1 rounded-full bg-amber-500/[0.12] px-3.5 text-[12px] font-semibold text-amber-700 transition-all active:scale-[0.97]"
                      >
                        <PenLine size={12} aria-hidden /> Оценить сделку
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )
        )}

        {/* отзывы — раскрываются из меню */}
        {showReviews && (
          <div className="mt-4">
            <Overline className="mb-2 px-1">Отзывы обо мне</Overline>
            {data.reviews.length === 0 ? (
              <Card className="p-6 text-center text-xs text-[#17181A]/45">
                Отзывов пока нет. Они появятся после первых сделок
              </Card>
            ) : (
              <div className="space-y-2">
                {data.reviews.map((r) => (
                  <Card key={r.id} className="p-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[#17181A]">{r.from}</span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={10} className={i < r.rating ? 'fill-[#16A34A] text-[#16A34A]' : 'text-[#17181A]/25'} aria-hidden />
                        ))}
                      </span>
                      <span className="ml-auto text-[10px] text-black/40">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#17181A]/50">{r.text}</p>
                  </Card>
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
            className="max-h-[88%] w-full overflow-y-auto rounded-t-[24px] bg-white p-5 [scrollbar-width:thin] animate-[sheet-up_220ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200/70" />
            <div className="flex items-center gap-3">
              <img loading="lazy" decoding="async" src={priceEdit.image} alt={priceEdit.title} className="h-12 w-12 rounded-[12px] bg-[#f0f1f3] object-cover"/>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#17181A]">{priceEdit.title}</p>
                <p className="text-xs text-[#17181A]/45">Текущая цена: {priceEdit.price === 0 ? 'Даром' : `${fmtNum(priceEdit.price)} ₽`}</p>
              </div>
            </div>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40" htmlFor="profile-price-input">Новая цена, ₽</label>
            <div className="mt-1.5">
              <input
                autoFocus
                id="profile-price-input"
                inputMode="numeric"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') void savePrice() }}
                placeholder="0 = отдать даром"
                className="h-12 w-full rounded-[14px] bg-neutral-200/50 px-4 text-base font-bold text-[#17181A] outline-none focus:ring-1 focus:ring-black/[0.12] placeholder:text-[#17181A]/30"
                aria-label="Новая цена"
              />
            </div>
            {priceEdit.price >= 500 && priceEdit.price > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#17181A]/45">
                <Swords size={12} className="mt-0.5 shrink-0 text-[#15803D]" aria-hidden />
                Если снизите цену, конкуренты с таким же товаром заметят и ответят: кто-то подрежет цену, кто-то напишет вам не самое приятное сообщение.
              </p>
            )}

            {/* Рынок этого товара: конкуренты и их цены */}
            {rivalsLoading && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-[14px] bg-[#F5F6F8] py-3 text-[11px] text-[#17181A]/45">
                <Loader2 size={12} className="animate-spin" aria-hidden /> Смотрим, кто ещё продаёт такой товар…
              </div>
            )}
            {rivals && rivals.rivals.length > 1 && (
              <div className="mt-3 rounded-[14px] bg-[#F5F6F8] p-3" aria-label="Рынок этого товара">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] font-bold text-[#17181A]">Рынок этого товара</p>
                  <p className="text-[10px] text-black/40">
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
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                          style={{ background: r.isMine ? '#14532D' : hueColor(r.seller.length * 47 % 360) }}
                          aria-hidden
                        >
                          {initials(r.seller)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className={cn('truncate text-[10px]', r.isMe ? 'font-bold text-[#15803D]' : 'text-[#17181A]/50')}>
                              {r.isMe ? 'Вы' : r.seller}
                            </p>
                            {cheapest && !r.isMe && (
                              <span className="shrink-0 rounded bg-[#14532D]/[0.08] px-1 text-[8px] font-bold text-[#15803D]">мин</span>
                            )}
                          </div>
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-neutral-200/70">
                            <div
                              className={cn('h-full rounded-full', r.isMe ? 'bg-[#14532D]' : cheapest ? 'bg-neutral-400' : 'bg-neutral-300')}
                              style={{ width: `${Math.max(8, Math.round((r.price / max) * 100))}%` }}
                            />
                          </div>
                        </div>
                        <span className={cn('shrink-0 text-[11px] font-bold tabular-nums', r.isMe ? 'text-[#15803D]' : 'text-[#17181A]')}>
                          {fmtNum(r.price)} ₽
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {rivals && rivals.rivals.length <= 1 && (
              <p className="mt-3 rounded-[14px] bg-[#F5F6F8] px-3 py-2 text-[11px] text-[#17181A]/45">
                Вы единственный активный продавец такого товара. Рынок пока ваш.
              </p>
            )}

            {/* Позиция при новой цене */}
            {rivals && rivals.rivals.length > 1 && priceInput && Number(priceInput) > 0 && (
              <p className="mt-2 text-[11px] font-medium text-[#17181A]/50" aria-live="polite">
                С ценой {fmtNum(Number(priceInput))} ₽ вы{' '}
                {(() => {
                  const cheaper = rivals.rivals.filter((r) => !r.isMe && r.price < Number(priceInput)).length
                  const place = cheaper + 1
                  return place === 1
                    ? <span className="text-[#15803D]">самый дешёвый. Покупатели придут к вам</span>
                    : <span>будете №{place} из {rivals.rivals.length} по цене</span>
                })()}
              </p>
            )}
            {priceError && <p className="mt-2 text-[11px] text-red-600">{priceError}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2 pb-[max(0px,env(safe-area-inset-bottom))]">
              <button
                onClick={() => !priceBusy && setPriceEdit(null)}
                className="h-12 rounded-full bg-neutral-200/60 text-sm font-semibold text-[#17181A] transition-all active:scale-[0.98]"
              >
                Отмена
              </button>
              <button
                onClick={() => void savePrice()}
                disabled={priceBusy}
                className="flex h-12 items-center justify-center rounded-full bg-[#14532D] text-sm font-bold text-white shadow-[0_4px_14px_rgba(20,83,45,0.25)] transition-all active:scale-[0.98] disabled:opacity-60"
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
