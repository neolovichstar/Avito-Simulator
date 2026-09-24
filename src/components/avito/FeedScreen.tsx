'use client'

// Лента объявлений: крупные фотокарточки 16:10, поиск, категории, сортировка, избранное
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, SlidersHorizontal, Heart, MapPin, Star, Zap, BellPlus, X, SearchX } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { CATEGORIES, CATEGORY_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import type { CategoryKey } from '@/lib/catalog-types'
import { fmtNum, initials, hueColor } from '@/lib/format'
import { useOS } from '@/lib/store'
import type { FeedListing, SavedSearchDTO } from '@/lib/types'

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

// Короткий формат «2 ч» для строки «Москва · 2 ч»
function shortAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`
  if (diff < 86400 * 2) return 'вчера'
  const days = Math.floor(diff / 86400)
  if (days < 7) return `${days} дн`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// «Дешевле рынка N%»: оценка рынка по состоянию товара (как marginHint на бэке)
function cheaperPercent(l: FeedListing): number {
  if (l.price <= 0) return 0
  const est = l.baseValue * (CONDITION_MULT[l.condition] ?? 0.8)
  if (l.price >= est) return 0
  return Math.min(90, Math.round(((est - l.price) / l.price) * 100))
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
  const [saved, setSaved] = useState<SavedSearchDTO[]>([])
  const pushToast = useOS((s) => s.pushToast)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(1)

  useEffect(() => { setFavs(getFavs()) }, [])

  const loadSaved = useCallback(() => {
    api.savedSearches().then((r) => setSaved(r.searches)).catch(() => {})
  }, [])
  useEffect(() => { loadSaved() }, [loadSaved])

  const saveCurrent = async () => {
    if (!query && category === 'all') return
    try {
      await api.createSavedSearch(query, category === 'all' ? null : category)
      loadSaved()
      pushToast('Avito', 'Поиск сохранён — будем сообщать о новых объявлениях')
    } catch (e) {
      pushToast('Avito', e instanceof ApiError ? e.message : 'Не удалось сохранить поиск')
    }
  }

  const applySaved = (s: SavedSearchDTO) => {
    setQ(s.query)
    setQuery(s.query)
    setCategory((s.category as CategoryKey | null) ?? 'all')
  }

  const removeSaved = async (id: string) => {
    setSaved((prev) => prev.filter((s) => s.id !== id))
    try { await api.deleteSavedSearch(id) } catch { loadSaved() }
  }

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    setError('')
    pageRef.current = page
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
      {/* поиск и фильтры */}
      <div className="bg-white px-3 pt-2 pb-2.5 border-b border-black/5 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()) }}
          className="flex gap-2"
        >
          <div className="flex-1 flex items-center gap-2 bg-[#f0f1f3] rounded-2xl px-3.5 h-11">
            <Search size={17} className="text-neutral-400 shrink-0" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск на Авито"
              aria-label="Поиск на Авито"
              className="bg-transparent outline-none text-sm w-full placeholder:text-neutral-400"
            />
          </div>
          {(query || category !== 'all') && (
            <button
              type="button"
              onClick={saveCurrent}
              aria-label="Сохранить поиск"
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-[#e7f6ff] text-[#0098e8] active:scale-95 transition-transform"
            >
              <BellPlus size={18} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSort((s) => !s)}
            aria-label="Сортировка"
            aria-expanded={showSort}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              showSort ? 'bg-[#00AAFF] text-white' : 'bg-[#f0f1f3] text-neutral-500'
            }`}
          >
            <SlidersHorizontal size={18} aria-hidden />
          </button>
        </form>
        {showSort && (
          <div className="flex gap-2 mt-2">
            {([['new', 'Свежие'], ['cheap', 'Дешевле'], ['expensive', 'Дороже']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setSort(k); setShowSort(false) }}
                className={`px-3.5 h-10 rounded-xl text-xs font-semibold transition-colors ${
                  sort === k ? 'bg-[#00AAFF] text-white' : 'bg-[#f0f1f3] text-neutral-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {/* категории */}
        <div className="flex gap-2 mt-2 overflow-x-auto [scrollbar-width:none]">
          <CatChip active={category === 'all'} onClick={() => setCategory('all')} label="Все" />
          {CATEGORIES.map((c) => (
            <CatChip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)} label={c.label} />
          ))}
        </div>
        {/* сохранённые поиски */}
        {saved.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto [scrollbar-width:none]" aria-label="Сохранённые поиски">
            {saved.map((s) => (
              <span
                key={s.id}
                className="shrink-0 flex items-center gap-1.5 h-9 pl-3 pr-1.5 rounded-full border border-[#00AAFF]/40 bg-[#f5fbff] text-xs font-medium text-[#0084c9]"
              >
                <button
                  onClick={() => applySaved(s)}
                  className="flex items-center gap-1.5 active:opacity-70"
                  aria-label={`Применить поиск ${s.query || CATEGORY_LABEL[s.category ?? ''] || ''}`}
                >
                  <Search size={12} aria-hidden />
                  {s.query || CATEGORY_LABEL[s.category ?? ''] || 'Все категории'}
                </button>
                <button
                  onClick={() => removeSaved(s.id)}
                  aria-label="Удалить поиск"
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[#0084c9]/60 active:bg-black/5"
                >
                  <X size={13} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* лента */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-width:thin] p-3 flex flex-col gap-3">
        {!favoritesMode && total > 0 && !loading && (
          <div className="shrink-0 text-[11px] text-neutral-400 px-1">{fmtNum(total)} объявлений рядом</div>
        )}
        {error && (
          <div className="shrink-0 bg-red-50 text-red-600 text-sm rounded-2xl p-3">{error}</div>
        )}
        {loading && items.length === 0 ? (
          <>
            {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
          </>
        ) : items.length === 0 ? (
          <div className="shrink-0 text-center pt-14 px-8 space-y-3">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-neutral-100 flex items-center justify-center" aria-hidden>
              <SearchX size={28} className="text-neutral-300" />
            </div>
            <p className="text-sm text-neutral-500 font-medium">
              {favoritesMode ? 'В избранном пусто' : 'Ничего не нашлось'}
            </p>
            <p className="text-xs text-neutral-400 leading-relaxed">
              {favoritesMode
                ? 'Нажимайте на сердечко у объявлений — они появятся здесь'
                : 'Попробуйте другой запрос или сохраните поиск — сообщим, когда товар появится'}
            </p>
          </div>
        ) : (
          <>
            {items.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                onOpen={() => onOpenListing(l.id)}
                onFav={() => onFav(l.id)}
                fav={favs.includes(l.id)}
              />
            ))}
            {!favoritesMode && items.length < total && (
              <button
                onClick={() => load(pageRef.current + 1)}
                disabled={loading}
                className="h-11 shrink-0 rounded-2xl bg-white text-sm font-semibold text-neutral-700 shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {loading ? 'Загрузка…' : 'Показать ещё'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CatChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 h-10 rounded-full text-xs font-semibold transition-colors ${
        active ? 'bg-neutral-900 text-white' : 'bg-[#f0f1f3] text-neutral-600'
      }`}
    >
      {label}
    </button>
  )
}

function CardSkeleton() {
  return (
    <div className="shrink-0 bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
      <div className="aspect-[16/10] bg-neutral-100" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 bg-neutral-100 rounded w-3/4" />
        <div className="h-3 bg-neutral-100 rounded w-1/2" />
      </div>
    </div>
  )
}

export function ListingCard({ listing: l, onOpen, onFav, fav }: {
  listing: FeedListing
  onOpen: () => void
  onFav?: () => void
  fav?: boolean
}) {
  const cheap = cheaperPercent(l)
  return (
    <div className="shrink-0 bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.99] transition-transform">
      <div className="relative aspect-[16/10] bg-neutral-100">
        <button onClick={onOpen} aria-label={l.title} className="absolute inset-0 w-full text-left">
          <img src={l.image} alt="" className="w-full h-full object-cover" loading="lazy" />
          {/* цена поверх фото */}
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />
          <span
            className={`absolute left-3 bottom-2.5 text-xl font-extrabold leading-none tracking-tight ${
              l.price === 0 ? 'text-[#4ade80]' : 'text-white'
            }`}
          >
            {l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}
          </span>
          {cheap >= 10 && (
            <span className="absolute right-3 bottom-2.5 bg-[#04E061] text-white text-[10px] font-bold px-1.5 py-1 rounded-md">
              Дешевле рынка {cheap}%
            </span>
          )}
          {l.boosted && (
            <span className="absolute top-2.5 left-2.5 bg-[#965EEB] text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
              <Zap size={10} aria-hidden /> ТОП
            </span>
          )}
        </button>
        {onFav && (
          <button
            onClick={onFav}
            aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
            className="absolute top-2 right-2 w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <Heart size={18} className={fav ? 'fill-[#FF4053] text-[#FF4053]' : 'text-white'} aria-hidden />
          </button>
        )}
      </div>
      {/* название, продавец, место */}
      <button onClick={onOpen} className="block w-full text-left p-3 space-y-2">
        <p className="text-sm font-semibold text-neutral-900 truncate">{l.title}</p>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
            style={{ background: hueColor(l.seller.id.length * 47 % 360) }}
            aria-hidden
          >
            {initials(l.seller.displayName)}
          </span>
          <span className="text-xs text-neutral-500 truncate">{l.seller.displayName}</span>
          {l.seller.online && <span className="w-1.5 h-1.5 rounded-full bg-[#04E061] shrink-0" aria-label="Продавец онлайн" />}
          <span className="ml-auto flex items-center gap-0.5 text-[11px] text-neutral-500 shrink-0">
            <Star size={10} className="text-amber-400 fill-amber-400" aria-hidden />
            {l.seller.rating > 0 ? Math.min(5, l.seller.rating).toFixed(1) : 'новый'}
          </span>
        </div>
        <div className="text-[11px] text-neutral-400 flex items-center gap-1">
          <MapPin size={11} aria-hidden /> {l.city} · {shortAgo(l.createdAt)}
        </div>
      </button>
    </div>
  )
}
