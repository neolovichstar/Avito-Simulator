'use client'

// Страница продавца — светлый дизайн 1:1 как настоящий Авито:
// белая шапка, карточка профиля, зелёные звёзды, список объявлений и отзывы.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Star, BadgeCheck, MapPin, Eye, ArrowRight } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtNum, timeAgo } from '@/lib/format'
import { UserAvatar } from '@/components/shared/UserAvatar'
import type { SellerProfile, FeedListing } from '@/lib/types'
import { ConditionBadge } from './AvitoApp'

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`Рейтинг ${value.toFixed(1)} из 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={i < Math.round(Math.min(5, value)) ? 'text-[#0AC760] fill-[#0AC760]' : 'text-[#EBEDF0]'}
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
      <div className="h-full overflow-y-auto bg-[#F7F8FA]">
        <Header onBack={onBack} title="Продавец" />
        <div className="p-4 pt-8 text-center space-y-3">
          <p className="text-sm text-[#D14343]">{error}</p>
          <button onClick={onBack} className="h-11 px-6 rounded-[12px] bg-black text-white font-bold text-[15px] active:bg-[#1A1A1A]">
            Вернуться
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="h-full overflow-y-auto bg-[#F7F8FA]">
        <Header onBack={onBack} title="Продавец" />
        <div className="p-3 space-y-3 animate-pulse">
          <div className="rounded-2xl bg-white p-4 flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-[#F0F1F5] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-[#F0F1F5] rounded" />
              <div className="h-3 w-24 bg-[#F0F1F5] rounded" />
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 h-20" />
          <div className="rounded-2xl bg-white p-4 h-40" />
        </div>
      </div>
    )
  }

  const { seller, stats } = data

  return (
    <div className="h-full overflow-y-auto bg-[#F7F8FA]">
      <Header onBack={onBack} title="Продавец" />

      <div className="p-3 space-y-3 pb-8">
        {/* шапка профиля */}
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={seller.displayName} className="w-16 h-16 rounded-full" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[17px] font-bold text-black truncate">{seller.displayName}</h1>
                {seller.online && <span className="w-2 h-2 rounded-full bg-[#0AC760] shrink-0" aria-label="Продавец онлайн" />}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Stars value={seller.rating} />
                <span className="text-xs font-semibold text-black">
                  {seller.ratingCount > 0 ? seller.rating.toFixed(1) : 'новый'}
                </span>
                <span className="text-xs text-[#8B8F99]">({seller.ratingCount})</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                <div className="flex items-center gap-1 text-xs text-[#8B8F99]">
                  <MapPin size={11} aria-hidden /> {seller.city}
                </div>
                <div className="flex items-center gap-1 text-xs text-[#8B8F99]">
                  <BadgeCheck size={11} className="text-[#0AC760] shrink-0" aria-hidden />
                  На Resale с {joined}
                </div>
              </div>
            </div>
          </div>
          {seller.bio && (
            <p className="text-xs text-[#5C616B] mt-3 pt-3 border-t border-[#EBEDF0] leading-relaxed">{seller.bio}</p>
          )}
        </div>

        {/* статистика */}
        <div className="rounded-2xl bg-white p-4 grid grid-cols-3 divide-x divide-[#EBEDF0] text-center">
          <div>
            <div className="text-lg font-extrabold text-black tabular-nums">{stats.activeCount}</div>
            <div className="text-[11px] text-[#8B8F99] mt-0.5">объявлений</div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-black tabular-nums">{stats.salesCount}</div>
            <div className="text-[11px] text-[#8B8F99] mt-0.5">сделок</div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-black tabular-nums">{seller.ratingCount > 0 ? seller.rating.toFixed(1) : '—'}</div>
            <div className="text-[11px] text-[#8B8F99] mt-0.5">рейтинг</div>
          </div>
        </div>

        {/* объявления */}
        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-[15px] font-semibold text-black">
              Объявления <span className="text-[#8B8F99] font-normal">({total})</span>
            </h2>
          </div>
          {listings.length === 0 && !loadingListings ? (
            <div className="rounded-2xl border border-dashed border-[#C4C8CF] bg-white p-6 text-center text-xs text-[#8B8F99]">
              Сейчас объявлений нет — продавец всё распродал
            </div>
          ) : (
            <div className="rounded-2xl bg-white divide-y divide-[#EBEDF0] overflow-hidden">
              {listings.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onOpenListing(l.id)}
                  className="w-full flex items-center gap-3 p-3 text-left active:bg-[#F7F8FA] transition-colors"
                >
                  <img
                    src={l.image}
                    alt={l.title}
                    className="w-20 h-20 rounded-xl object-cover shrink-0 bg-[#F0F1F5]"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-bold text-black tabular-nums">{l.price > 0 ? `${fmtNum(l.price)} ₽` : 'Даром'}</span>
                      {l.boosted && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#F0F1F5] text-[#5C616B] font-semibold shrink-0">
                          ПРОДВИНУТО
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-black truncate mt-0.5">{l.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <ConditionBadge condition={l.condition} />
                      <span className="text-[10px] text-[#8B8F99] flex items-center gap-1">
                        <Eye size={10} aria-hidden /> {l.views}
                      </span>
                      <span className="text-[10px] text-[#8B8F99]">{timeAgo(l.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-[#C4C8CF] shrink-0" aria-hidden />
                </button>
              ))}
            </div>
          )}
          {offset < total && (
            <button
              onClick={() => loadListings(offset)}
              disabled={loadingListings}
              className="w-full mt-2 h-11 rounded-[12px] bg-[#F0F1F5] text-sm font-semibold text-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:bg-[#E6E8ED]"
            >
              {loadingListings ? 'Загрузка…' : <>Показать ещё <ArrowRight size={14} aria-hidden /></>}
            </button>
          )}
        </section>

        {/* отзывы */}
        {data.reviews.length > 0 && (
          <section>
            <h2 className="text-[15px] font-semibold text-black px-1 mb-2">Отзывы покупателей</h2>
            <div className="space-y-2">
              {data.reviews.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-black truncate">{r.from}</span>
                    <Stars value={r.rating} />
                    <span className="text-[10px] text-[#8B8F99] ml-auto shrink-0">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-[#5C616B] mt-1 leading-relaxed">{r.text}</p>
                  <p className="text-[10px] text-[#8B8F99] mt-1 truncate">{r.listing}</p>
                </div>
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
    <div className="sticky top-0 z-10 bg-white border-b border-[#EBEDF0] px-3 py-2.5 flex items-center gap-2">
      <button
        onClick={onBack}
        aria-label="Назад"
        className="w-11 h-11 -my-1.5 -ml-1 rounded-full flex items-center justify-center text-black active:bg-[#F0F1F5]"
      >
        <ChevronLeft size={22} aria-hidden />
      </button>
      <h1 className="text-base font-bold text-black">{title}</h1>
    </div>
  )
}
