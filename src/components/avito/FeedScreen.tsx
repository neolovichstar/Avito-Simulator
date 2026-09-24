'use client'

// Лента объявлений в стиле Авито: 2 колонки плоских карточек, поиск, категории-чипы, фильтры-пилюли
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal, Heart, Star, Zap, BellPlus, X, SearchX, History, Activity, Scale, Handshake, ArrowUpDown, Truck } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { CATEGORIES, CATEGORY_LABEL, CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import type { CategoryKey } from '@/lib/catalog-types'
import { fmtNum, initials, hueColor, timeAgo } from '@/lib/format'
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

const SORT_LABEL: Record<'new' | 'cheap' | 'expensive', string> = {
  new: 'по дате',
  cheap: 'сначала дешевле',
  expensive: 'сначала дороже',
}

// Короткий формат «2 ч» для строки «Когда» в шите сравнения
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
      pushToast('Сделка', 'Поиск сохранён — будем сообщать о новых объявлениях')
    } catch (e) {
      pushToast('Сделка', e instanceof ApiError ? e.message : 'Не удалось сохранить поиск')
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
        pushToast('Сделка', 'В сравнении максимум три товара')
        return prev
      }
      return [...prev, l]
    })
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* ШАПКА (sticky): большой скруглённый поиск + категории-чипы + фильтры-пилюли */}
      <div className="bg-white px-3 pt-1.5 pb-2.5 border-b border-black/5 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()) }}
        >
          <div className="flex items-center gap-2 bg-[#f0f1f3] rounded-xl px-3.5 h-11">
            <Search size={18} className="text-neutral-500 shrink-0" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск на Сделке"
              aria-label="Поиск на Сделке"
              className="bg-transparent outline-none text-[15px] w-full placeholder:text-neutral-500"
            />
            {q && (
              <button
                type="button"
                onClick={() => { setQ(''); setQuery('') }}
                aria-label="Очистить поиск"
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 active:bg-black/5"
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
        </form>

        {/* категории — горизонтальный скролл мелких чипов с бордером */}
        <div className="flex gap-2 mt-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-0.5" role="tablist" aria-label="Категории">
          <CatChip label="Все" active={category === 'all'} onClick={() => setCategory('all')} role="tab" ariaSelected={category === 'all'} />
          {CATEGORIES.map((c) => (
            <CatChip
              key={c.key}
              label={c.label}
              active={category === c.key}
              onClick={() => setCategory(c.key)}
              role="tab"
              ariaSelected={category === c.key}
            />
          ))}
        </div>

        {/* фильтры — мелкие пилюли с иконками */}
        <div className="flex gap-2 mt-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Фильтры и сортировка">
          <FilterPill
            icon={<SlidersHorizontal size={13} aria-hidden />}
            label="Фильтры"
            active={showSort}
            ariaExpanded={showSort}
            onClick={() => setShowSort((s) => !s)}
          />
          <FilterPill
            icon={<ArrowUpDown size={13} aria-hidden />}
            label={`Сортировка: ${SORT_LABEL[sort]}`}
            ariaExpanded={showSort}
            onClick={() => setShowSort((s) => !s)}
          />
          {(query || category !== 'all') && (
            <FilterPill
              icon={<BellPlus size={13} aria-hidden />}
              label="Сохранить поиск"
              accent
              onClick={() => saveCurrent()}
            />
          )}
        </div>

        {/* панель фильтров: сортировка + город */}
        {showSort && (
          <div className="flex flex-col gap-2 mt-2.5">
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Сортировка">
              {([['new', 'По дате'], ['cheap', 'Сначала дешевле'], ['expensive', 'Сначала дороже']] as const).map(([k, label]) => (
                <CatChip key={k} label={label} active={sort === k} onClick={() => setSort(k)} />
              ))}
            </div>
            {cities.length > 1 && (
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Фильтр по городу">
                <CatChip label="Вся Россия" active={city === 'all'} onClick={() => setCity('all')} />
                {cities.map((c) => (
                  <CatChip key={c.city} label={`${c.city} · ${c.count}`} active={city === c.city} onClick={() => setCity(c.city)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* сохранённые поиски */}
        {saved.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Сохранённые поиски">
            {saved.map((s) => (
              <span
                key={s.id}
                className="shrink-0 flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-full border border-[#7C3AED]/40 bg-[#7C3AED]/5 text-xs font-medium text-[#7C3AED]"
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
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[#7C3AED]/60 active:bg-black/5"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* лента: 2 колонки плоских карточек */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-width:thin] px-2 pt-2 pb-4 flex flex-col gap-3">
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
          <div className="grid grid-cols-2 gap-x-2 gap-y-4 content-start">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
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
            <div className="grid grid-cols-2 gap-x-2 gap-y-4 content-start">
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
            </div>
            {!favoritesMode && items.length < total && (
              <button
                onClick={() => load(pageRef.current + 1)}
                disabled={loading}
                className="h-11 shrink-0 rounded-full border border-neutral-200 bg-white text-sm font-semibold text-neutral-800 active:scale-[0.98] transition-transform disabled:opacity-50"
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
          className="shrink-0 mx-2 mb-2 rounded-2xl bg-neutral-900 text-white shadow-xl p-2 flex items-center gap-2 animate-in slide-in-from-bottom-2"
          role="toolbar"
          aria-label="Панель сравнения"
        >
          <span className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-[#7C3AED]/25 shrink-0" aria-hidden>
            <Scale size={16} className="text-[#c5a6f5]" />
            {compare.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#7C3AED] text-[9px] font-bold flex items-center justify-center">
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
            className="ml-auto h-9 px-4 rounded-xl bg-[#7C3AED] text-xs font-bold active:scale-95 transition-transform disabled:opacity-40"
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

// Категория-чип: высота 32, пилюля, активная — чёрная с белым текстом
function CatChip({ label, active, onClick, role, ariaSelected }: {
  label: string
  active: boolean
  onClick: () => void
  role?: 'tab'
  ariaSelected?: boolean
}) {
  return (
    <button
      onClick={onClick}
      role={role}
      aria-selected={ariaSelected}
      className={`shrink-0 h-8 px-3.5 rounded-full text-[13px] font-medium border transition-colors active:scale-[0.97] ${
        active ? 'bg-black text-white border-black' : 'bg-white border-neutral-200 text-neutral-800'
      }`}
    >
      {label}
    </button>
  )
}

// Фильтр-пилюля с иконкой (Фильтры / Сортировка / Сохранить поиск)
function FilterPill({ icon, label, onClick, active, accent, ariaExpanded }: {
  icon: ReactNode
  label: string
  onClick: () => void
  active?: boolean
  accent?: boolean
  ariaExpanded?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-pressed={active}
      className={`shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium border transition-colors active:scale-[0.97] ${
        active
          ? 'bg-black text-white border-black'
          : accent
            ? 'bg-[#7C3AED]/5 border-[#7C3AED]/40 text-[#7C3AED]'
            : 'bg-white border-neutral-200 text-neutral-800'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function CardSkeleton() {
  return (
    <div className="shrink-0">
      <div className="aspect-[4/3] skeleton-shimmer bg-neutral-100 rounded-xl" />
      <div className="pt-1.5 px-0.5 space-y-1.5">
        <div className="h-3.5 skeleton-shimmer bg-neutral-100 rounded w-2/3" />
        <div className="h-3 skeleton-shimmer bg-neutral-100 rounded w-full" />
        <div className="h-3 skeleton-shimmer bg-neutral-100 rounded w-1/2" />
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
    <div className="shrink-0 bg-white rounded-2xl p-3">
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

// Карточка ленты в стиле Авито: плоская, без рамки и тени.
// Фото 4/3 с круглыми белыми кнопками (сердечко, сравнение), под фото —
// цена 15px bold, бейдж «Доставка Сделки», заголовок 13px, город, время.
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
    <div className={`press flex flex-col ${comparing ? 'ring-2 ring-[#7C3AED] ring-offset-2 ring-offset-[#f4f5f7] rounded-xl' : ''}`}>
      <div className="relative">
        <button onClick={onOpen} aria-label={l.title} className="block w-full text-left">
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-neutral-100">
            <img src={l.image} alt="" className="w-full h-full object-cover" loading="lazy" />
            {cheap >= 10 && (
              <span className="absolute left-1.5 bottom-1.5 bg-[#04E061] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                Дешевле рынка {cheap}%
              </span>
            )}
            {l.boosted && (
              <span className={`absolute top-1.5 bg-[#7C3AED] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${onCompareToggle ? 'left-10' : 'left-1.5'}`}>
                <Zap size={9} aria-hidden /> ТОП
              </span>
            )}
          </div>
        </button>
        {onCompareToggle && (
          <button
            onClick={onCompareToggle}
            aria-label={comparing ? `Убрать ${l.title} из сравнения` : `Добавить ${l.title} к сравнению`}
            aria-pressed={comparing}
            className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center active:scale-90 transition-transform duration-200 ease-out"
          >
            <Scale size={13} className={comparing ? 'text-[#7C3AED]' : 'text-neutral-700'} aria-hidden />
          </button>
        )}
        {onFav && (
          <button
            onClick={onFav}
            aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={fav}
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center active:scale-90 transition-transform duration-200 ease-out"
          >
            <Heart
              size={14}
              className={`transition-all duration-200 ease-out ${fav ? 'fill-[#FF5555] text-[#FF5555] scale-110' : 'text-neutral-600'}`}
              aria-hidden
            />
          </button>
        )}
      </div>
      <button onClick={onOpen} className="block w-full text-left px-0.5 pt-1.5">
        <p className={`text-[15px] font-bold leading-tight ${l.price === 0 ? 'text-emerald-600' : 'text-neutral-900'}`}>
          {l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}
        </p>
        {(l.price > 0 || l.negotiable) && (
          <div className="mt-1 flex items-center flex-wrap gap-x-2.5 gap-y-0.5">
            {l.price > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <Truck size={11} aria-hidden /> Доставка Сделки
              </span>
            )}
            {l.negotiable && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-[#7C3AED]">
                <Handshake size={11} aria-hidden /> Торг
              </span>
            )}
          </div>
        )}
        <p className="mt-1 text-[13px] text-neutral-900 truncate">{l.title}</p>
        <p className="mt-0.5 text-xs text-neutral-500 truncate">{l.city}</p>
        <p className="mt-0.5 text-[11px] text-neutral-400">{timeAgo(l.createdAt)}</p>
      </button>
    </div>
  )
}

// ПУЛЬС РЫНКА: карточка-вставка с заголовком 18px и горизонтальным скроллом
// товаров, чья цена заметно двигалась за последний час.
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
      className={`shrink-0 rounded-2xl bg-white overflow-hidden transition-shadow ${flash ? 'ring-2 ring-[#7C3AED]/50 shadow-md' : ''}`}
      aria-label="Пульс рынка"
    >
      <div className="flex items-baseline gap-2 px-3 pt-3 pb-1">
        <Activity size={15} className="text-[#7C3AED] self-center" aria-hidden />
        <h2 className="text-lg font-bold text-neutral-900 leading-none">Пульс рынка</h2>
        <span className="text-xs text-neutral-400">за час</span>
        {flash && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[#7C3AED]">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7C3AED] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
            </span>
            живое
          </span>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto px-2.5 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((p) => {
          const down = p.deltaPct < 0
          return (
            <button
              key={p.itemKey}
              onClick={() => onPick(queryOf(p.title))}
              className="shrink-0 w-[124px] text-left rounded-xl border border-neutral-200 overflow-hidden bg-neutral-50 active:scale-[0.97] transition-transform"
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
            <Scale size={16} className="text-[#7C3AED]" aria-hidden />
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
