'use client'

// Лента объявлений: поиск, категории, сортировка, карточки
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, SlidersHorizontal, Heart, Eye, MapPin, Zap, Gift } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { CATEGORIES, CATEGORY_IMAGE, CONDITION_LABEL } from '@/lib/catalog-types'
import { timeAgo, fmtNum } from '@/lib/format'
import type { FeedListing } from '@/lib/types'
import type { CategoryKey } from '@/lib/catalog-types'
import { ConditionBadge } from './AvitoApp'

const FAV_KEY = 'avito_sim_favs'

export function getFavs(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[] } catch { return [] }
}
function toggleFav(id: string): string[] {
  const cur = getFavs()
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur]
  localStorage.setItem(FAV_KEY, JSON.stringify(next))
  return next
}

export default function FeedScreen({ onOpenListing, favoritesMode }: {
  onOpenListing: (id: string) => void
  favoritesMode: boolean
}) {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryKey | 'all'>('all')
  const [sort, setSort] = useState<'new' | 'cheap' | 'expensive'>('new')
  const [showSort, setShowSort] = useState(false)
  const [items, setItems] = useState<FeedListing[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favs, setFavs] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setFavs(getFavs()) }, [])

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    setError('')
    try {
      if (favoritesMode) {
        const ids = getFavs()
        if (!ids.length) { setItems([]); setTotal(0); return }
        const all = await Promise.all(ids.slice(0, 40).map((id) => api.listing(id).catch(() => null)))
        const ok = all.filter(Boolean) as FeedListing[]
        setItems(ok)
        setTotal(ok.length)
        return
      }
      const res = await api.feed({ q: query, category, sort, page, limit: 20 })
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]))
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить ленту')
    } finally {
      setLoading(false)
    }
  }, [query, category, sort, favoritesMode])

  useEffect(() => { load(1) }, [load])

  const onFav = (id: string) => setFavs(toggleFav(id))

  return (
    <div className="h-full flex flex-col">
      {/* поиск */}
      <div className="bg-white px-3 pt-2 pb-2 border-b border-black/5 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()) }}
          className="flex gap-2"
        >
          <div className="flex-1 flex items-center gap-2 bg-[#f0f1f3] rounded-xl px-3 h-10">
            <Search size={16} className="text-neutral-400 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск на Авито"
              aria-label="Поиск на Авито"
              className="bg-transparent outline-none text-sm w-full placeholder:text-neutral-400"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowSort((s) => !s)}
            aria-label="Сортировка"
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${showSort ? 'bg-[#00AAFF] text-white' : 'bg-[#f0f1f3] text-neutral-500'}`}
          >
            <SlidersHorizontal size={17} />
          </button>
        </form>
        {showSort && (
          <div className="flex gap-2 mt-2">
            {([['new', 'Свежие'], ['cheap', 'Дешевле'], ['expensive', 'Дороже']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setSort(k); setShowSort(false) }}
                className={`px-3 h-8 rounded-lg text-xs font-medium ${sort === k ? 'bg-[#00AAFF] text-white' : 'bg-[#f0f1f3] text-neutral-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {/* категории */}
        <div className="flex gap-2 mt-2 overflow-x-auto [scrollbar-width:none] pb-0.5">
          <CatChip active={category === 'all'} onClick={() => setCategory('all')} label="Все" />
          {CATEGORIES.map((c) => (
            <CatChip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)} label={c.label} />
          ))}
        </div>
      </div>

      {/* лента */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-width:thin] p-3">
        {!favoritesMode && total > 0 && (
          <div className="text-xs text-neutral-400 mb-2 px-1">
            {fmtNum(total)} объявлений рядом
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-3">{error}</div>
        )}
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-square bg-neutral-100" />
                <div className="p-2.5 space-y-1.5">
                  <div className="h-3 bg-neutral-100 rounded w-2/3" />
                  <div className="h-2.5 bg-neutral-100 rounded w-full" />
                  <div className="h-2.5 bg-neutral-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-sm text-neutral-400 pt-16">
            {favoritesMode ? 'В избранном пусто. Жмите на сердечко у объявлений' : 'Ничего не нашлось. Попробуйте другой запрос'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                onOpen={() => onOpenListing(l.id)}
                onFav={() => onFav(l.id)}
                fav={favs.includes(l.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CatChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 h-8 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-neutral-900 text-white' : 'bg-[#f0f1f3] text-neutral-600'
      }`}
    >
      {label}
    </button>
  )
}

export function ListingCard({ listing: l, onOpen, onFav, fav }: {
  listing: FeedListing
  onOpen: () => void
  onFav?: () => void
  fav?: boolean
}) {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform">
      <button onClick={onOpen} className="block w-full text-left" aria-label={l.title}>
        <div className="relative aspect-square bg-neutral-100">
          { }
          <img src={l.image} alt={l.title} className="w-full h-full object-cover" loading="lazy" />
          {l.price === 0 && (
            <span className="absolute top-1.5 left-1.5 bg-[#04E061] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
              <Gift size={10} /> Даром
            </span>
          )}
          {l.boosted && (
            <span className="absolute top-1.5 right-1.5 bg-[#965EEB] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
              <Zap size={10} /> Продвинуто
            </span>
          )}
        </div>
        <div className="p-2.5">
          <div className="flex items-center gap-1">
            <span className={`font-bold text-[15px] leading-tight ${l.price === 0 ? 'text-[#04a94e]' : 'text-neutral-900'}`}>
              {l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}
            </span>
          </div>
          <p className="text-xs text-neutral-700 mt-1 line-clamp-2 leading-snug">{l.title}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <ConditionBadge condition={l.condition} />
            {l.seller.online && <span className="w-1.5 h-1.5 rounded-full bg-[#04E061]" aria-label="Продавец онлайн" />}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1.5 flex items-center gap-1">
            <MapPin size={9} /> {l.city} · {timeAgo(l.createdAt)}
          </div>
        </div>
      </button>
      {onFav && (
        <button
          onClick={onFav}
          aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
          className="absolute" style={{ display: 'none' }}
        >hidden</button>
      )}
      {onFav && (
        <div className="px-2.5 pb-2 -mt-1">
          <button
            onClick={onFav}
            aria-label="Избранное"
            className="text-neutral-300 active:scale-90 transition-transform"
          >
            <Heart size={16} className={fav ? 'fill-[#FF4053] text-[#FF4053]' : ''} />
          </button>
        </div>
      )}
    </div>
  )
}
