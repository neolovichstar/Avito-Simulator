'use client'

// Страница продавца: шапка с рейтингом, статистика, объявления и отзывы
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Star, BadgeCheck, MapPin, Eye, ArrowRight } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { initials } from '@/lib/format'
import { timeAgo } from '@/lib/format'
import type { SellerProfile, FeedListing } from '@/lib/types'
import { ConditionBadge } from './AvitoApp'

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽'
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`Рейтинг ${value.toFixed(1)} из 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={i < Math.round(Math.min(5, value)) ? 'text-amber-400 fill-amber-400' : 'text-white/20'}
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
      <div className="h-full overflow-y-auto bg-[#050D09]">
        <Header onBack={onBack} title="Продавец" />
        <div className="p-4 pt-8 text-center space-y-3">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={onBack} className="h-12 px-6 rounded-2xl bg-[#22C55E] text-[#052E16] font-bold text-[15px]">
            Вернуться
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="h-full overflow-y-auto bg-[#050D09]">
        <Header onBack={onBack} title="Продавец" />
        <div className="p-3 space-y-3 animate-pulse">
          <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4 flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white/[0.06] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-white/[0.06] rounded" />
              <div className="h-3 w-24 bg-white/[0.06] rounded" />
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4 h-20" />
          <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4 h-40" />
        </div>
      </div>
    )
  }

  const { seller, stats } = data

  return (
    <div className="h-full overflow-y-auto bg-[#050D09]">
      <Header onBack={onBack} title="Продавец" />

      <div className="p-3 space-y-3 pb-8">
        {/* шапка профиля */}
        <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
          <div className="flex items-center gap-3">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0 ring-2 ring-emerald-500/25"
              style={{ background: seller.hue }}
              aria-hidden
            >
              {initials(seller.displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-bold text-white truncate">{seller.displayName}</h1>
                {seller.online && <span className="w-2 h-2 rounded-full bg-[#22C55E] shrink-0" aria-label="Продавец онлайн" />}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Stars value={seller.rating} />
                <span className="text-xs font-semibold text-white/80">
                  {seller.ratingCount > 0 ? seller.rating.toFixed(1) : 'новый'}
                </span>
                <span className="text-xs text-white/40">({seller.ratingCount})</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                <div className="flex items-center gap-1 text-xs text-white/40">
                  <MapPin size={11} aria-hidden /> {seller.city}
                </div>
                <div className="flex items-center gap-1 text-xs text-white/40">
                  <BadgeCheck size={11} className="text-emerald-400 shrink-0" aria-hidden />
                  В Resale с {joined}
                </div>
              </div>
            </div>
          </div>
          {seller.bio && (
            <p className="text-xs text-white/50 mt-3 pt-3 border-t border-white/[0.06] leading-relaxed">{seller.bio}</p>
          )}
        </div>

        {/* статистика */}
        <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4 grid grid-cols-3 divide-x divide-white/[0.06] text-center">
          <div>
            <div className="text-lg font-extrabold text-white">{stats.activeCount}</div>
            <div className="text-[11px] text-white/40 mt-0.5">объявлений</div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-white">{stats.salesCount}</div>
            <div className="text-[11px] text-white/40 mt-0.5">сделок</div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-white">{seller.ratingCount > 0 ? seller.rating.toFixed(1) : '—'}</div>
            <div className="text-[11px] text-white/40 mt-0.5">рейтинг</div>
          </div>
        </div>

        {/* объявления */}
        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-[15px] font-semibold text-white">
              Объявления <span className="text-white/40 font-normal">({total})</span>
            </h2>
          </div>
          {listings.length === 0 && !loadingListings ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-xs text-white/40">
              Сейчас объявлений нет — продавец всё распродал
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] divide-y divide-white/[0.06] overflow-hidden">
              {listings.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onOpenListing(l.id)}
                  className="w-full flex items-center gap-3 p-3 text-left active:bg-white/[0.04] transition-colors"
                >
                  <img
                    src={l.image}
                    alt={l.title}
                    className="w-20 h-20 rounded-xl object-cover shrink-0 bg-white/[0.06]"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-bold text-white">{l.price > 0 ? fmtMoney(l.price) : 'Даром'}</span>
                      {l.boosted && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold shrink-0">
                          ПРОДВИНУТО
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/70 truncate mt-0.5">{l.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <ConditionBadge condition={l.condition} />
                      <span className="text-[10px] text-white/40 flex items-center gap-1">
                        <Eye size={10} aria-hidden /> {l.views}
                      </span>
                      <span className="text-[10px] text-white/40">{timeAgo(l.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-white/30 shrink-0" aria-hidden />
                </button>
              ))}
            </div>
          )}
          {offset < total && (
            <button
              onClick={() => loadListings(offset)}
              disabled={loadingListings}
              className="w-full mt-2 h-11 rounded-2xl bg-white/[0.06] border border-white/10 text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loadingListings ? 'Загрузка…' : <>Показать ещё <ArrowRight size={14} aria-hidden /></>}
            </button>
          )}
        </section>

        {/* отзывы */}
        {data.reviews.length > 0 && (
          <section>
            <h2 className="text-[15px] font-semibold text-white px-1 mb-2">Отзывы покупателей</h2>
            <div className="space-y-2">
              {data.reviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">{r.from}</span>
                    <Stars value={r.rating} />
                    <span className="text-[10px] text-white/30 ml-auto shrink-0">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">{r.text}</p>
                  <p className="text-[10px] text-white/40 mt-1 truncate">{r.listing}</p>
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
    <div className="sticky top-0 z-10 bg-[#050D09]/95 backdrop-blur border-b border-white/[0.06] px-3 py-2.5 flex items-center gap-2">
      <button
        onClick={onBack}
        aria-label="Назад"
        className="w-11 h-11 -my-1.5 -ml-1 rounded-full flex items-center justify-center text-white active:bg-white/10"
      >
        <ChevronLeft size={22} aria-hidden />
      </button>
      <h1 className="text-base font-bold text-white">{title}</h1>
    </div>
  )
}
