'use client'

// Лента объявлений: крупные фотокарточки 16:10, поиск, категории, сортировка, избранное
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal, Heart, MapPin, Star, Zap, BellPlus, X, SearchX, History, Activity, Scale } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { CATEGORIES, CATEGORY_LABEL, CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import type { CategoryKey } from '@/lib/catalog-types'
import { fmtNum, initials, hueColor } from '@/lib/format'
import { useOS } from '@/lib/store'
import { getViewed, clearViewed, type ViewedItem } from '@/lib/viewed'
import { getSocket } from '@/lib/use-realtime'
import type { FeedListing, SavedSearchDTO, PulseItemDTO } from '@/lib/types'

const FAV_KEY = 'avito_sim_favs'

export function getFavs(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[] } catch { return [] }
}
export function toggleFavLocal(id: string): string[] {
  const cur = getFavs()
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur]
  localStorage.setItem(FAV_KEY, JSON.stringify(next))
  return next
}
const toggleFav = toggleFavLocal

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
  const [viewed, setViewed] = useState<ViewedItem[]>([])
  const [city, setCity] = useState<string>('all')
  const [cities, setCities] = useState<{ city: string; count: number }[]>([])
  const [pulse, setPulse] = useState<PulseItemDTO[]>([])
  const [pulseFlash, setPulseFlash] = useState(false)
  // сравнение объявлений: до трёх карточек, шит со сводной таблицей
  const [compare, setCompare] = useState<FeedListing[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const pushToast = useOS((s) => s.pushToast)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(1)

  useEffect(() => {
    setFavs(getFavs())
    setViewed(getViewed())
    // разовая синхронизация избранного с сервером (для оповещений о снижении цены)
    const t = setTimeout(() => {
      api.favSyncAll(getFavs()).catch(() => {})
    }, 4000)
    return () => clearTimeout(t)
  }, [])

  const loadSaved = useCallback(() => {
    api.savedSearches().then((r) => setSaved(r.searches)).catch(() => {})
    api.feedCities().then((r) => setCities(r.cities.filter((c) => c.count > 0).slice(0, 12))).catch(() => {})
    api.marketPulse().then((r) => setPulse(Array.isArray(r) ? r : [])).catch(() => {})
  }, [])
  useEffect(() => { loadSaved() }, [loadSaved])

  // живой пульс: рынок дёрнулся — обновляем полосу и подсвечиваем её
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let tries = 0
    let detach: (() => void) | null = null
    const attach = () => {
      const sock = getSocket()
      if (!sock) {
        if (tries++ < 20) retry = setTimeout(attach, 1000)
        return
      }
      const onPulse = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          api.marketPulse().then((r) => {
            setPulse(Array.isArray(r) ? r : [])
            setPulseFlash(true)
            setTimeout(() => setPulseFlash(false), 1600)
          }).catch(() => {})
        }, 2500)
      }
      sock.on('market:pulse', onPulse)
      detach = () => { sock.off('market:pulse', onPulse) }
    }
    attach()
    return () => {
      if (retry) clearTimeout(retry)
      if (timer) clearTimeout(timer)
      if (detach) detach()
    }
  }, [])

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
      const res = await api.feed({ q: query, category, city, sort, page, limit: 20 })
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]))
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить ленту')
    } finally {
      setLoading(false)
    }
  }, [query, category, city, sort, favoritesMode])

  useEffect(() => { load(1) }, [load])

  const onFav = (id: string) => {
    const next = toggleFav(id)
    setFavs(next)
    // синк на сервер (не блокирует UI): оповещения «цена снизилась» приходят только по синхронизированным
    api.favToggle(id, next.includes(id)).catch(() => {})
  }

  const toggleCompare = (l: FeedListing) => {
    setCompare((prev) => {
      if (prev.some((c) => c.id === l.id)) return prev.filter((c) => c.id !== l.id)
      if (prev.length >= 3) {
        pushToast('Avito', 'В сравнении максимум три товара')
        return prev
      }
      return [...prev, l]
    })
  }

  return (
    <div className="relative h-full flex flex-col">
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
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex gap-2">
              {([['new', 'Свежие'], ['cheap', 'Дешевле'], ['expensive', 'Дороже']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => { setSort(k) }}
                  className={`px-3.5 h-10 rounded-xl text-xs font-semibold transition-colors ${
                    sort === k ? 'bg-[#00AAFF] text-white' : 'bg-[#f0f1f3] text-neutral-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* город */}
            {cities.length > 1 && (
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Фильтр по городу">
                <CatChip active={city === 'all'} onClick={() => setCity('all')} label="Вся Россия" />
                {cities.map((c) => (
                  <CatChip key={c.city} active={city === c.city} onClick={() => setCity(c.city)} label={`${c.city} · ${c.count}`} />
                ))}
              </div>
            )}
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
        {/* Вы смотрели — только в чистой ленте без фильтров */}
        {!favoritesMode && !query && category === 'all' && viewed.length > 0 && items.length > 0 && !loading && (
          <ViewedStrip
            items={viewed}
            onOpen={(id) => onOpenListing(id)}
            onClear={() => { clearViewed(); setViewed([]) }}
          />
        )}
        {/* Пульс рынка — живые движения цен за час */}
        {!favoritesMode && !query && category === 'all' && pulse.length > 0 && !loading && (
          <MarketPulseStrip
            items={pulse}
            flash={pulseFlash}
            onPick={(t) => { setQ(t); setQuery(t) }}
          />
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
                comparing={compare.some((c) => c.id === l.id)}
                onCompareToggle={!favoritesMode ? () => toggleCompare(l) : undefined}
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

      {/* панель сравнения — плавает над нижней навигацией */}
      {compare.length > 0 && !showCompare && (
        <div
          className="shrink-0 mx-3 mb-2 rounded-2xl bg-neutral-900 text-white shadow-xl p-2 flex items-center gap-2 animate-in slide-in-from-bottom-2"
          role="toolbar"
          aria-label="Панель сравнения"
        >
          <span className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-[#965EEB]/20 shrink-0" aria-hidden>
            <Scale size={16} className="text-[#c5a6f5]" />
            {compare.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#965EEB] text-[9px] font-bold flex items-center justify-center">
                {compare.length}
              </span>
            )}
          </span>
          <span className="text-xs font-semibold leading-tight">
            {compare.length < 2 ? 'Выберите ещё товар для сравнения' : 'Сравниваем товары'}
          </span>
          <button
            onClick={() => setShowCompare(true)}
            disabled={compare.length < 2}
            className="ml-auto h-9 px-4 rounded-xl bg-[#965EEB] text-xs font-bold active:scale-95 transition-transform disabled:opacity-40"
          >
            Сравнить
          </button>
          <button
            onClick={() => setCompare([])}
            aria-label="Очистить сравнение"
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center active:bg-white/20"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      {/* шит сравнения товаров */}
      {showCompare && compare.length >= 2 && (
        <CompareSheet
          items={compare}
          onClose={() => setShowCompare(false)}
          onClear={() => { setCompare([]); setShowCompare(false) }}
          onOpen={(id) => { setShowCompare(false); onOpenListing(id) }}
        />
      )}
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

// «Вы смотрели»: история просмотров из localStorage, горизонтальная лента миниатюр
function ViewedStrip({ items, onOpen, onClear }: {
  items: ViewedItem[]
  onOpen: (id: string) => void
  onClear: () => void
}) {
  return (
    <div className="shrink-0 bg-white rounded-2xl shadow-sm p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <History size={13} className="text-neutral-400" aria-hidden />
        <h2 className="text-xs font-semibold text-neutral-800">Вы смотрели</h2>
        <button
          onClick={onClear}
          className="ml-auto text-[11px] text-neutral-400 active:text-neutral-600 px-1"
          aria-label="Очистить историю просмотров"
        >
          Очистить
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((v) => (
          <button
            key={v.id}
            onClick={() => onOpen(v.id)}
            className="shrink-0 w-[96px] text-left active:scale-[0.97] transition-transform"
            aria-label={v.title}
          >
            <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100">
              <img src={v.image} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            <p className="mt-1 text-[11px] font-bold text-neutral-800 leading-none truncate">
              {v.price === 0 ? 'Даром' : `${fmtNum(v.price)} ₽`}
            </p>
            <p className="text-[10px] text-neutral-400 truncate mt-0.5">{v.title}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ListingCard({ listing: l, onOpen, onFav, fav, comparing, onCompareToggle }: {
  listing: FeedListing
  onOpen: () => void
  onFav?: () => void
  fav?: boolean
  comparing?: boolean
  onCompareToggle?: () => void
}) {
  const cheap = cheaperPercent(l)
  return (
    <div className={`shrink-0 bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.99] transition-all ${comparing ? 'ring-2 ring-[#965EEB] ring-offset-1 ring-offset-[#f4f5f7]' : ''}`}>
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
            <span className={`absolute top-2.5 bg-[#965EEB] text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 ${onCompareToggle ? 'left-14' : 'left-2.5'}`}>
              <Zap size={10} aria-hidden /> ТОП
            </span>
          )}
        </button>
        {onCompareToggle && (
          <button
            onClick={onCompareToggle}
            aria-label={comparing ? `Убрать ${l.title} из сравнения` : `Добавить ${l.title} к сравнению`}
            aria-pressed={comparing}
            className={`absolute top-2 left-2 w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center active:scale-90 transition-all ${
              comparing ? 'bg-[#965EEB] shadow-md' : 'bg-black/30'
            }`}
          >
            <Scale size={15} className={comparing ? 'text-white' : 'text-white/90'} aria-hidden />
          </button>
        )}
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

// ПУЛЬС РЫНКА: карточки товаров, чья цена заметно двигалась за последний час.
// Тап — применяем поиск по товару. Вспышка при живом обновлении с рынка.
// deltaPct < 0 — подешевел (зелёный), > 0 — подорожал (красный).
function MarketPulseStrip({ items, flash, onPick }: {
  items: PulseItemDTO[]
  flash: boolean
  onPick: (query: string) => void
}) {
  const queryOf = (title: string) => {
    const words = title.split(' ')
    return words.length <= 2 ? title : words.slice(0, 2).join(' ')
  }
  return (
    <section
      className={`shrink-0 rounded-2xl bg-white shadow-sm overflow-hidden transition-shadow ${flash ? 'ring-2 ring-[#00AAFF]/50 shadow-md' : ''}`}
      aria-label="Пульс рынка"
    >
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
        <Activity size={13} className="text-[#00AAFF]" aria-hidden />
        <h2 className="text-xs font-semibold text-neutral-800">Пульс рынка</h2>
        <span className="text-[10px] text-neutral-400">за час</span>
        {flash && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[#00AAFF]">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00AAFF] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00AAFF]" />
            </span>
            живое
          </span>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto px-2.5 pb-2.5 [scrollbar-width:none]">
        {items.map((p) => {
          const down = p.deltaPct < 0
          return (
            <button
              key={p.itemKey}
              onClick={() => onPick(queryOf(p.title))}
              className="shrink-0 w-[124px] text-left rounded-xl border border-black/5 overflow-hidden bg-neutral-50 active:scale-[0.97] transition-transform"
              aria-label={`${p.title}, цена ${fmtNum(p.price)}, ${down ? 'подешевел' : 'подорожал'} на ${Math.abs(p.deltaPct)}%`}
            >
              <div className="relative aspect-[16/10] bg-neutral-200">
                <img src={p.image} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                <span
                  className={`absolute top-1 left-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm ${
                    down ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                >
                  {down ? '−' : '+'}
                  {Math.abs(p.deltaPct)}%
                </span>
              </div>
              <div className="p-1.5 space-y-0.5">
                <p className="text-[10px] font-semibold text-neutral-800 truncate">{p.title}</p>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[11px] font-bold text-neutral-900">{fmtNum(p.price)} ₽</span>
                  <span className="text-[9px] text-neutral-400">{p.moves} изм.</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ШИТ СРАВНЕНИЯ: сводная таблица по 2-3 выбранным объявлениям.
// Лучшая цена подсвечена зелёным, тап по колонке открывает объявление.
function CompareSheet({ items, onClose, onClear, onOpen }: {
  items: FeedListing[]
  onClose: () => void
  onClear: () => void
  onOpen: (id: string) => void
}) {
  const activePrices = items.map((l) => l.price).filter((p) => p > 0)
  const bestPrice = activePrices.length ? Math.min(...activePrices) : null
  const cols = items.length
  const gridCols = { gridTemplateColumns: `76px repeat(${cols}, minmax(0, 1fr))` }

  const rows: { label: string; render: (l: FeedListing) => React.ReactNode }[] = [
    {
      label: 'Состояние',
      render: (l): ReactNode => <span className="text-[11px] font-medium text-neutral-700">{CONDITION_LABEL[l.condition] ?? l.condition}</span>,
    },
    {
      label: 'Город',
      render: (l): ReactNode => <span className="text-[11px] text-neutral-600">{l.city}</span>,
    },
    {
      label: 'Продавец',
      render: (l): ReactNode => (
        <span className="flex items-center gap-1 min-w-0">
          <span
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
            style={{ background: hueColor(l.seller.id.length * 47 % 360) }}
            aria-hidden
          >
            {initials(l.seller.displayName)}
          </span>
          <span className="text-[11px] text-neutral-600 truncate">{l.seller.displayName}</span>
        </span>
      ),
    },
    {
      label: 'Рейтинг',
      render: (l): ReactNode => (
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-neutral-700">
          <Star size={10} className="text-amber-400 fill-amber-400" aria-hidden />
          {l.seller.rating > 0 ? Math.min(5, l.seller.rating).toFixed(1) : 'новый'}
          {l.seller.ratingCount > 0 && <span className="text-neutral-400 font-normal">({l.seller.ratingCount})</span>}
        </span>
      ),
    },
    {
      label: 'К цене',
      render: (l): ReactNode => {
        const cheap = cheaperPercent(l)
        return cheap >= 10 ? (
          <span className="text-[11px] font-bold text-emerald-600">Дешевле на {cheap}%</span>
        ) : (
          <span className="text-[11px] text-neutral-400">По рынку</span>
        )
      },
    },
    {
      label: 'Смотрели',
      render: (l): ReactNode => <span className="text-[11px] text-neutral-600">{l.views} раз</span>,
    },
    {
      label: 'Когда',
      render: (l): ReactNode => <span className="text-[11px] text-neutral-600">{shortAgo(l.createdAt)}</span>,
    },
  ]

  return (
    <div
      className="absolute inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-label="Сравнение товаров"
    >
      <div
        className="w-full max-h-[92%] rounded-t-3xl bg-white flex flex-col animate-[sheet-up_220ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* шапка */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-black/5">
          <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-neutral-200" aria-hidden />
          <div className="flex items-center">
            <Scale size={16} className="text-[#965EEB]" aria-hidden />
            <h2 className="ml-1.5 text-sm font-bold text-neutral-900">Сравнение товаров</h2>
            <button
              onClick={onClear}
              className="ml-auto text-[11px] font-semibold text-neutral-400 active:text-neutral-600"
            >
              Очистить всё
            </button>
            <button
              onClick={onClose}
              aria-label="Закрыть сравнение"
              className="ml-3 w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 active:bg-neutral-200"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>

        {/* таблица */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin]">
          <div className="grid gap-x-1 min-w-0" style={gridCols}>
            {/* строка: фото, название, цена, кнопка */}
            <div />
            {items.map((l) => (
              <div key={l.id} className="px-1.5 min-w-0">
                <button onClick={() => onOpen(l.id)} className="block w-full text-left" aria-label={`Открыть ${l.title}`}>
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-neutral-100">
                    <img src={l.image} alt={l.title} className="w-full h-full object-cover" />
                  </div>
                  <p className="mt-1.5 text-[11px] font-semibold text-neutral-800 line-clamp-2 leading-snug min-h-[28px]">{l.title}</p>
                  <p
                    className={`text-base font-extrabold leading-tight ${
                      l.price > 0 && l.price === bestPrice ? 'text-emerald-600' : 'text-neutral-900'
                    }`}
                  >
                    {l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}
                  </p>
                  {l.price > 0 && l.price === bestPrice && (
                    <span className="mt-0.5 inline-flex rounded bg-emerald-100 px-1 py-0.5 text-[8px] font-bold text-emerald-600">
                      лучшая цена
                    </span>
                  )}
                </button>
              </div>
            ))}

            {/* параметрные строки */}
            {rows.map((row) => (
              <div key={row.label} className="contents">
                <div className="py-2 pr-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 self-center">{row.label}</div>
                {items.map((l) => (
                  <div key={l.id} className="px-1.5 py-2 border-t border-neutral-100 min-w-0 flex items-center">
                    {row.render(l)}
                  </div>
                ))}
              </div>
            ))}

            {/* строка кнопок */}
            <div />
            {items.map((l) => (
              <div key={l.id} className="px-1.5 pt-2 pb-1">
                <button
                  onClick={() => onOpen(l.id)}
                  className="w-full h-9 rounded-xl bg-neutral-900 text-white text-[11px] font-bold active:scale-[0.97] transition-transform"
                >
                  Открыть
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
