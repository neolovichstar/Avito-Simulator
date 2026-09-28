'use client'

// Страница продавца «Resale» — светлый минимализм:
// белые карточки, зелёные звёзды, список объявлений и отзывы.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Star, BadgeCheck, MapPin, Eye, ArrowRight } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtNum, timeAgo } from '@/lib/format'
import { UserAvatar } from '@/components/shared/UserAvatar'
import type { SellerProfile, FeedListing } from '@/lib/types'
import { ConditionBadge } from './AvitoApp'
import { Card, EmptyState, Overline, ScreenTitle, Skeleton } from './ui'

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`Рейтинг ${value.toFixed(1)} из 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={i < Math.round(Math.min(5, value)) ? 'fill-[#16A34A] text-[#16A34A]' : 'text-[#17181A]/25'}
          aria-hidden
        />
      ))}
    </span>
  )
}

export default function SellerScreen({ sellerId, onBack, onOpenListing }: {
  sellerId: string
  onBack: () => void
  onOpenListing: (id: string) => void
}) {
  const [data, setData] = useState<SellerProfile | null>(null)
  const [listings, setListings] = useState<FeedListing[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loadingListings, setLoadingListings] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setData(null)
    setError('')
    setListings([])
    setOffset(0)
    api.seller(sellerId)
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e.message : 'Не удалось загрузить профиль') })
    return () => { alive = false }
  }, [sellerId])

  const loadListings = useCallback(async (off: number) => {
    setLoadingListings(true)
    try {
      const r = await api.sellerListings(sellerId, off)
      setListings((prev) => (off === 0 ? r.items : [...prev, ...r.items]))
      setTotal(r.total)
      setOffset(off + r.items.length)
    } catch { /* не критично */ }
    finally { setLoadingListings(false) }
  }, [sellerId])

  useEffect(() => { loadListings(0) }, [loadListings])

  const joined = data ? new Date(data.seller.joinedAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''

  if (error) {
    return (
      <div className="h-full overflow-y-auto bg-[#F5F6F8]">
        <Header onBack={onBack} title="Продавец" />
        <div className="space-y-3 p-4 pt-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={onBack} className="h-11 rounded-full bg-[#14532D] px-6 font-bold text-[15px] text-white transition-all active:scale-[0.98]">
            Вернуться
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="h-full overflow-y-auto bg-[#F5F6F8]">
        <Header onBack={onBack} title="Продавец" />
        <div className="space-y-3 p-4">
          <Card className="flex items-center gap-3 p-4">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
          </Card>
          <Card className="h-20 p-4" />
          <Card className="h-40 p-4" />
        </div>
      </div>
    )
  }

  const { seller, stats } = data

  return (
    <div className="h-full overflow-y-auto bg-[#F5F6F8] [scrollbar-width:thin]">
      <Header onBack={onBack} title="Продавец" />

      <div className="space-y-3 p-4 pb-8">
        {/* шапка профиля */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={seller.displayName} className="h-16 w-16 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[17px] font-bold tracking-tight text-[#17181A]">{seller.displayName}</h2>
                {seller.online && <span className="size-2 shrink-0 rounded-full bg-[#16A34A]" aria-label="Продавец онлайн" />}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <Stars value={seller.rating} />
                <span className="text-xs font-semibold text-[#17181A]">
                  {seller.ratingCount > 0 ? seller.rating.toFixed(1) : 'новый'}
                </span>
                <span className="text-xs text-black/40">({seller.ratingCount})</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                <div className="flex items-center gap-1 text-xs text-[#17181A]/45">
                  <MapPin size={11} aria-hidden /> {seller.city}
                </div>
                <div className="flex items-center gap-1 text-xs text-[#17181A]/45">
                  <BadgeCheck size={11} className="shrink-0 text-[#16A34A]" aria-hidden />
                  На Resale с {joined}
                </div>
              </div>
            </div>
          </div>
          {seller.bio && (
            <p className="mt-3 border-t border-black/[0.05] pt-3 text-xs leading-relaxed text-[#17181A]/50">{seller.bio}</p>
          )}
        </Card>

        {/* статистика */}
        <Card className="grid grid-cols-3 divide-x divide-[#EBEDF0] p-4 text-center">
          <div>
            <div className="text-lg font-extrabold tabular-nums text-[#17181A]">{stats.activeCount}</div>
            <div className="mt-0.5 text-[11px] text-black/40">объявлений</div>
          </div>
          <div>
            <div className="text-lg font-extrabold tabular-nums text-[#17181A]">{stats.salesCount}</div>
            <div className="mt-0.5 text-[11px] text-black/40">сделок</div>
          </div>
          <div>
            <div className="text-lg font-extrabold tabular-nums text-[#17181A]">{seller.ratingCount > 0 ? seller.rating.toFixed(1) : '—'}</div>
            <div className="mt-0.5 text-[11px] text-black/40">рейтинг</div>
          </div>
        </Card>

        {/* объявления */}
        <section>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <Overline>Объявления</Overline>
            <span className="text-[11px] text-black/40">{total}</span>
          </div>
          {listings.length === 0 && !loadingListings ? (
            <Card>
              <EmptyState
                icon={<Eye size={26} />}
                title="Объявлений нет"
                note="Продавец всё распродал. Загляните позже"
                className="py-8"
              />
            </Card>
          ) : (
            <Card className="divide-y divide-[#EBEDF0] overflow-hidden">
              {listings.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onOpenListing(l.id)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-[#F5F6F8]"
                >
                  <img
                    src={l.image}
                    alt={l.title}
                    className="h-20 w-20 shrink-0 rounded-[14px] bg-[#f0f1f3] object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-extrabold tabular-nums text-[#17181A]">{l.price > 0 ? `${fmtNum(l.price)} ₽` : 'Даром'}</span>
                      {l.boosted && (
                        <span className="shrink-0 rounded bg-neutral-200/60 px-1.5 py-0.5 text-[9px] font-bold text-black/50">
                          ПРОДВИНУТО
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-[#17181A]">{l.title}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ConditionBadge condition={l.condition} />
                      <span className="flex items-center gap-1 text-[10px] text-black/40">
                        <Eye size={10} aria-hidden /> {l.views}
                      </span>
                      <span className="text-[10px] text-black/40">{timeAgo(l.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-[#17181A]/25" aria-hidden />
                </button>
              ))}
            </Card>
          )}
          {offset < total && (
            <button
              onClick={() => loadListings(offset)}
              disabled={loadingListings}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-white text-sm font-semibold text-[#17181A] ring-1 ring-black/[0.08] transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loadingListings ? 'Загрузка…' : <>Показать ещё <ArrowRight size={14} aria-hidden /></>}
            </button>
          )}
        </section>

        {/* отзывы */}
        {data.reviews.length > 0 && (
          <section>
            <Overline className="mb-2 px-1">Отзывы покупателей</Overline>
            <div className="space-y-2">
              {data.reviews.map((r) => (
                <Card key={r.id} className="p-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-[#17181A]">{r.from}</span>
                    <Stars value={r.rating} />
                    <span className="ml-auto shrink-0 text-[10px] text-black/40">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#17181A]/50">{r.text}</p>
                  <p className="mt-1 truncate text-[10px] text-black/40">{r.listing}</p>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-black/[0.05] bg-white/95 px-3 py-2.5 backdrop-blur-md">
      <button
        onClick={onBack}
        aria-label="Назад"
        className="-ml-1 -my-1.5 flex h-11 w-11 items-center justify-center rounded-full text-[#17181A] transition-colors active:bg-neutral-200/60"
      >
        <ChevronLeft size={24} aria-hidden />
      </button>
      <ScreenTitle className="text-[20px]">{title}</ScreenTitle>
    </div>
  )
}
