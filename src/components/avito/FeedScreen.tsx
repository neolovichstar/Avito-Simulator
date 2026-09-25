'use client'

// Лента «Resale» — светлый маркетплейс 1:1 как настоящий Авито:
// шапка с городом и круглым аватаром, серая пилюля поиска, чипы категорий,
// белые карточки (сердечко в белом кружке, цена bold 17, зелёная звезда продавца).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Search, SlidersHorizontal, Heart, Star, Zap, Bell, BellPlus, X, SearchX,
  History, Activity, Scale, Handshake, ArrowUpDown, ChevronDown,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { CATEGORIES, CATEGORY_LABEL, CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import type { CategoryKey } from '@/lib/catalog-types'
import { fmtNum, fmtTime, initials, hueColor, timeAgo } from '@/lib/format'
import { useOS } from '@/lib/store'
import { getViewed, clearViewed, type ViewedItem } from '@/lib/viewed'
import { getSocket } from '@/lib/use-realtime'
import { topMatches, fuzzyMatch, Highlight } from '@/lib/smart-search'
import type { FeedListing, SavedSearchDTO, PulseItemDTO } from '@/lib/types'

const FAV_KEY = 'avito_sim_favs'
const RECENT_Q_KEY = 'resale_avito_recent_q_v1'
const RECENT_Q_MAX = 6

function readRecentQueries(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(RECENT_Q_KEY) ?? '[]') as string[] } catch { return [] }
}

function saveRecentQuery(raw: string): string[] {
  const v = raw.trim()
  if (v.length < 2) return readRecentQueries()
  const next = [v, ...readRecentQueries().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, RECENT_Q_MAX)
  try { localStorage.setItem(RECENT_Q_KEY, JSON.stringify(next)) } catch { /* приватный режим */ }
  return next
}

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

// «Сегодня, 14:02» / «Вчера» / «12 марта» — как в настоящем Авито
function whenLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return `Сегодня, ${fmtTime(d)}`
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

// «Дешевле рынка N%»: оценка рынка по состоянию товара (как marginHint на бэке)
function cheaperPercent(l: FeedListing): number {
  if (l.price <= 0) return 0
  const est = l.baseValue * (CONDITION_MULT[l.condition] ?? 0.8)
  if (l.price >= est) return 0
  return Math.min(90, Math.round(((est - l.price) / l.price) * 100))
}

export default function FeedScreen({ onOpenListing, favoritesMode, searchMode, onCancelSearch, onOpenNotifications, onCompareActiveChange }: {
  onOpenListing: (id: string) => void
  favoritesMode: boolean
  searchMode?: boolean
  onCancelSearch?: () => void
  onOpenNotifications?: () => void
  onCompareActiveChange?: (v: boolean) => void
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
  const [pulseHeadline, setPulseHeadline] = useState<string | null>(null)
  const [pulseFlash, setPulseFlash] = useState(false)
  // умные подсказки: недавние запросы пользователя
  const [recentQ, setRecentQ] = useState<string[]>([])
  // сравнение объявлений: до трёх карточек, шит со сводной таблицей
  const [compare, setCompare] = useState<FeedListing[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const pushToast = useOS((s) => s.pushToast)
  const session = useOS((s) => s.session)
  const notifUnread = useOS((s) => s.notifications.some((n) => !n.readAt))
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef(1)

  // экран поиска: сразу фокус в поле, как в настоящем приложении
  useEffect(() => {
    if (searchMode) inputRef.current?.focus()
  }, [searchMode])

  // панель сравнения видна — прячем «+» в AvitoApp
  useEffect(() => {
    onCompareActiveChange?.(compare.length > 0 && !showCompare)
    return () => onCompareActiveChange?.(false)
  }, [compare.length, showCompare, onCompareActiveChange])

  useEffect(() => {
    setFavs(getFavs())
    setViewed(getViewed())
    setRecentQ(readRecentQueries())
    // разовая синхронизация избранного с сервером (для оповещений о снижении цены)
    const t = setTimeout(() => {
      api.favSyncAll(getFavs()).catch(() => {})
    }, 4000)
    return () => clearTimeout(t)
  }, [])

  const loadSaved = useCallback(() => {
    api.savedSearches().then((r) => setSaved(r.searches)).catch(() => {})
    api.feedCities().then((r) => setCities(r.cities.filter((c) => c.count > 0).slice(0, 12))).catch(() => {})
    api.marketPulse().then((r) => {
      setPulse(Array.isArray(r?.moves) ? r.moves : [])
      setPulseHeadline(r?.headline ?? null)
    }).catch(() => {})
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
            setPulse(Array.isArray(r?.moves) ? r.moves : [])
            setPulseHeadline(r?.headline ?? null)
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
      pushToast('Resale', 'Поиск сохранён — будем сообщать о новых объявлениях')
    } catch (e) {
      pushToast('Resale', e instanceof ApiError ? e.message : 'Не удалось сохранить поиск')
    }
  }

  const applySaved = (s: SavedSearchDTO) => {
    setQ(s.query)
    setQuery(s.query)
    if (s.query) setRecentQ(saveRecentQuery(s.query))
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
        pushToast('Resale', 'В сравнении максимум три товара')
        return prev
      }
      return [...prev, l]
    })
  }

  const cancelSearch = () => {
    setQ('')
    setQuery('')
    onCancelSearch?.()
  }

  const user = session
  const userCity = session?.city || 'Москва'
  const filtered = !favoritesMode && (Boolean(query) || category !== 'all' || city !== 'all')
  const sectionTitle = favoritesMode ? 'Избранное' : filtered ? `Найдено ${fmtNum(total)}` : 'Объявления рядом'

  // Умные подсказки под строкой поиска: категории + сохранённые поиски +
  // недавние запросы + пульс рынка, отобранные fuzzy по вводу.
  // Поиск по объявлениям — серверный (api.feed), поэтому локально НИЧЕГО
  // не перетариваем: только подсказываем, что искать.
  const qTrim = q.trim()
  const suggestItems = useMemo(() => {
    if (!qTrim || qTrim.length < 2) return []
    const pool: string[] = []
    for (const c of CATEGORIES) pool.push(c.label)
    for (const s of saved) if (s.query) pool.push(s.query)
    pool.push(...recentQ)
    for (const p of pulse) {
      const words = p.title.split(' ')
      pool.push(words.length <= 2 ? p.title : words.slice(0, 2).join(' '))
    }
    return topMatches(qTrim, pool, 5, 0.55).filter((m) => m.value.toLowerCase() !== qTrim.toLowerCase())
  }, [qTrim, saved, recentQ, pulse])
  const showSuggest = !favoritesMode && suggestItems.length > 0 && qTrim.toLowerCase() !== query.trim().toLowerCase()

  // В избранном поиск клиентский — применяем к нему fuzzy (только внутри уже
  // загруженного набора, серверные фильтры не трогаем).
  const visibleItems = favoritesMode && qTrim ? items.filter((l) => fuzzyMatch(qTrim, [l.title, l.city, CATEGORY_LABEL[l.category] ?? ''])) : items

  return (
    <div className="relative h-full flex flex-col bg-[#F7F8FA]">
      {/* ШАПКА (sticky): город + аватар, пилюля поиска, чипы категорий, фильтры */}
      <div className="shrink-0 bg-[#F7F8FA] px-4 pt-2 pb-2.5">
        {/* город + уведомления + аватар */}
        {!searchMode && (
          <div className="flex items-center mb-2.5">
            <button
              onClick={() => setShowSort((s) => !s)}
              aria-expanded={showSort}
              aria-label={`Город ${userCity}. Открыть фильтры`}
              className="flex items-center gap-0.5 text-[18px] font-bold text-black leading-none active:opacity-70"
            >
              {userCity}
              <ChevronDown size={17} className="ml-0.5" aria-hidden />
            </button>
            <div className="ml-auto flex items-center gap-1">
              {onOpenNotifications && (
                <button
                  onClick={onOpenNotifications}
                  aria-label="Уведомления"
                  className="relative w-10 h-10 flex items-center justify-center rounded-full text-black active:bg-black/[0.06]"
                >
                  <Bell size={21} aria-hidden />
                  {notifUnread && (
                    <span className="absolute top-2 right-2.5 size-2 rounded-full bg-[#0AC760] ring-2 ring-[#F7F8FA]" aria-hidden />
                  )}
                </button>
              )}
              <div
                className="size-9 rounded-full overflow-hidden bg-[#E6E8ED] ring-1 ring-[#EBEDF0] flex items-center justify-center text-[12px] font-bold text-[#5C616B]"
                aria-hidden
              >
                {user?.photoUrl
                  ? <img loading="lazy" decoding="async" src={user.photoUrl} alt="" className="h-full w-full object-cover"/>
                  : initials(user?.displayName ?? 'Я')}
              </div>
            </div>
          </div>
        )}

        {/* пилюля поиска + «Отмена» на экране поиска + умные подсказки */}
        <div className="flex items-center gap-1.5">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              const v = q.trim()
              setQuery(v)
              if (v) setRecentQ(saveRecentQuery(v))
            }}
          >
            <div className="flex items-center gap-2 bg-[#F0F1F5] rounded-[12px] px-3.5 h-11">
              <Search size={18} className="text-[#8B8F99] shrink-0" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Искать на Resale"
                aria-label="Искать на Resale"
                className="bg-transparent outline-none text-[15px] w-full text-black placeholder:text-[#8B8F99]"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(''); setQuery('') }}
                  aria-label="Очистить поиск"
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[#8B8F99] active:bg-black/[0.06]"
                >
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>

            {/* подсказки: категории/сохранённые/недавние/пульс — fuzzy по вводу; тап = применить */}
            {showSuggest && (
              <div
                className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[14px] bg-white shadow-[0_14px_40px_-10px_rgba(0,0,0,0.3)] ring-1 ring-[#EBEDF0]"
                role="listbox"
                aria-label="Подсказки поиска"
              >
                {suggestItems.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setQ(m.value)
                      setQuery(m.value)
                      setRecentQ(saveRecentQuery(m.value))
                    }}
                    className="flex min-h-[42px] w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors active:bg-[#F7F8FA]"
                  >
                    <Search size={14} className="shrink-0 text-[#8B8F99]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-black">
                      <Highlight text={m.value} query={qTrim} />
                    </span>
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[#8B8F99]">искать</span>
                  </button>
                ))}
              </div>
            )}
          </form>
          {searchMode && onCancelSearch && (
            <button
              onClick={cancelSearch}
              className="shrink-0 h-11 px-1 text-[15px] font-medium text-black active:opacity-70"
            >
              Отмена
            </button>
          )}
        </div>

        {/* категории — горизонтальный скролл чипов, активный чёрный */}
        {!searchMode && (
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
        )}

        {/* фильтры — светлые пилюли с иконками */}
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
                className="shrink-0 flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-full border border-[#0AC760]/40 bg-[#E6F9EF] text-xs font-medium text-[#067A47]"
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
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[#067A47]/60 active:bg-black/[0.06]"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* лента: заголовок секции + 2 колонки белых карточек */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-width:thin] overscroll-contain pb-4">
        <div className="px-4 pt-1.5 pb-2.5">
          <h2 className="text-[20px] font-bold text-black leading-tight">{sectionTitle}</h2>
          {!favoritesMode && !filtered && total > 0 && !loading && (
            <p className="text-[12px] text-[#8B8F99] mt-0.5">{fmtNum(total)} объявлений рядом с вами</p>
          )}
        </div>

        {/* Вы смотрели — только в чистой ленте без фильтров */}
        {!favoritesMode && !query && category === 'all' && viewed.length > 0 && items.length > 0 && !loading && (
          <ViewedStrip
            items={viewed}
            onOpen={(id) => onOpenListing(id)}
            onClear={() => { clearViewed(); setViewed([]) }}
          />
        )}
        {/* Пульс рынка — блок «Рынок»: новость волн + топ-5 движений цен (час+день) */}
        {!favoritesMode && !query && category === 'all' && (pulse.length > 0 || pulseHeadline) && !loading && (
          <MarketPulseStrip
            items={pulse}
            headline={pulseHeadline}
            flash={pulseFlash}
            onPick={(t) => { setQ(t); setQuery(t) }}
          />
        )}

        {error && (
          <div className="shrink-0 mx-4 bg-[#FDEBEB] text-[#D14343] text-sm rounded-2xl p-3">{error}</div>
        )}
        {loading && items.length === 0 ? (
          <div className="px-3 grid grid-cols-2 gap-x-2.5 gap-y-3 content-start">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-center pt-10 px-8 space-y-3">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-[#F0F1F5] flex items-center justify-center" aria-hidden>
              <SearchX size={28} className="text-[#8B8F99]" />
            </div>
            <p className="text-[15px] text-black font-semibold">
              {favoritesMode ? (qTrim ? 'В избранном нет такого' : 'В избранном пусто') : 'Ничего не нашлось'}
            </p>
            <p className="text-[13px] text-[#8B8F99] leading-relaxed">
              {favoritesMode
                ? qTrim
                  ? 'Попробуйте другой запрос — опечатки не страшны'
                  : 'Нажимайте на сердечко у объявлений — они появятся здесь'
                : 'Попробуйте другой запрос или сохраните поиск — сообщим, когда товар появится'}
            </p>
          </div>
        ) : (
          <>
            <div className="px-3 grid grid-cols-2 gap-x-2.5 gap-y-3 content-start">
              {visibleItems.map((l) => (
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
              <div className="px-4 pt-3">
                <button
                  onClick={() => load(pageRef.current + 1)}
                  disabled={loading}
                  className="h-11 w-full rounded-[12px] bg-[#F0F1F5] text-sm font-semibold text-black active:bg-[#E6E8ED] transition-colors disabled:opacity-50"
                >
                  {loading ? 'Загрузка…' : 'Показать ещё'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* панель сравнения — плавает над нижней навигацией */}
      {compare.length > 0 && !showCompare && (
        <div
          className="shrink-0 mx-3 mb-2 rounded-2xl bg-white border border-[#EBEDF0] text-black shadow-lg shadow-black/[0.06] p-2 flex items-center gap-2 animate-in slide-in-from-bottom-2"
          role="toolbar"
          aria-label="Панель сравнения"
        >
          <span className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-[#E6F9EF] shrink-0" aria-hidden>
            <Scale size={16} className="text-[#067A47]" />
            {compare.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0AC760] text-white text-[9px] font-bold flex items-center justify-center">
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
            className="ml-auto h-9 px-4 rounded-[10px] bg-black text-white text-xs font-bold active:bg-[#1A1A1A] disabled:opacity-40"
          >
            Сравнить
          </button>
          <button
            onClick={() => setCompare([])}
            aria-label="Очистить сравнение"
            className="w-9 h-9 rounded-xl bg-[#F0F1F5] flex items-center justify-center text-[#5C616B] active:bg-[#E6E8ED]"
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

// Категория-чип: высота 36, радиус 10, активная — чёрная с белым текстом
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
      className={`shrink-0 h-8 px-3.5 rounded-[10px] text-[13px] transition-colors active:scale-[0.97] ${
        active ? 'bg-black font-semibold text-white' : 'bg-[#F0F1F5] text-[#5C616B] font-medium'
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
      className={`shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-[10px] text-[13px] transition-colors active:scale-[0.97] ${
        active
          ? 'bg-black font-semibold text-white'
          : accent
            ? 'bg-[#E6F9EF] text-[#067A47] font-semibold'
            : 'bg-[#F0F1F5] text-[#5C616B] font-medium'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function CardSkeleton() {
  return (
    <div className="shrink-0 rounded-2xl bg-white overflow-hidden">
      <div className="aspect-[4/3] animate-pulse bg-[#F0F1F5]" />
      <div className="p-2.5 space-y-1.5">
        <div className="h-4 animate-pulse bg-[#F0F1F5] rounded w-2/3" />
        <div className="h-3 animate-pulse bg-[#F0F1F5] rounded w-full" />
        <div className="h-3 animate-pulse bg-[#F0F1F5] rounded w-1/2" />
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
    <div className="shrink-0 mx-3 mb-3 rounded-2xl bg-white p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <History size={13} className="text-[#8B8F99]" aria-hidden />
        <h2 className="text-[13px] font-semibold text-black">Вы смотрели</h2>
        <button
          onClick={onClear}
          className="ml-auto text-[11px] text-[#8B8F99] active:text-black px-1"
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
            <div className="aspect-square rounded-xl overflow-hidden bg-[#F0F1F5]">
              <img src={v.image} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            <p className="mt-1 text-[12px] font-bold text-black leading-none tabular-nums">
              {v.price === 0 ? 'Даром' : `${fmtNum(v.price)} ₽`}
            </p>
            <p className="text-[10px] text-[#8B8F99] truncate mt-0.5">{v.title}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// Карточка ленты 1:1 как в настоящем Авито: белая, фото 4:3, сердечко в белом кружке,
// цена bold 17 tabular-nums, название 14 (2 строки), «Москва • Сегодня 14:02», зелёная звезда.
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
    <div className={`press rounded-2xl bg-white overflow-hidden ${comparing ? 'ring-2 ring-black ring-offset-2 ring-offset-[#F7F8FA]' : ''}`}>
      <div className="relative">
        <button onClick={onOpen} aria-label={l.title} className="block w-full text-left">
          <div className="relative aspect-[4/3] bg-[#F0F1F5]">
            <img src={l.image} alt="" className="w-full h-full object-cover" loading="lazy" />
            {cheap >= 10 && (
              <span className="absolute left-1.5 bottom-1.5 bg-[#E6F9EF]/95 text-[#067A47] text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                Дешевле рынка {cheap}%
              </span>
            )}
            {l.boosted && (
              <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 backdrop-blur-sm">
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
            className="absolute top-1.5 left-1.5 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center active:scale-90 transition-transform duration-200 ease-out"
          >
            <Scale size={14} className={comparing ? 'text-[#0AC760]' : 'text-[#5C616B]'} aria-hidden />
          </button>
        )}
        {onFav && (
          <button
            onClick={onFav}
            aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={fav}
            className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center active:scale-90 transition-transform duration-200 ease-out"
          >
            <Heart
              size={16}
              className={`transition-all duration-200 ease-out ${fav ? 'fill-[#F44250] text-[#F44250] scale-110' : 'text-[#8B8F99]'}`}
              aria-hidden
            />
          </button>
        )}
      </div>
      <button onClick={onOpen} className="block w-full text-left p-2.5">
        <p className={`text-[17px] font-bold leading-none tabular-nums ${l.price === 0 ? 'text-[#067A47]' : 'text-black'}`}>
          {l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}
        </p>
        {l.negotiable && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#5C616B]">
            <Handshake size={11} aria-hidden /> Торг
          </span>
        )}
        <p className="mt-1 text-[14px] text-black leading-snug line-clamp-2 min-h-[36px]">{l.title}</p>
        <p className="mt-1 text-[12px] text-[#8B8F99] truncate">{l.city} • {whenLabel(l.createdAt)}</p>
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#8B8F99]">
          <Star size={12} className="text-[#0AC760] fill-[#0AC760] shrink-0" aria-hidden />
          <span className="font-semibold text-black">{l.seller.rating > 0 ? Math.min(5, l.seller.rating).toFixed(1) : 'новый'}</span>
          <span className="truncate">{l.seller.displayName}</span>
        </p>
      </button>
    </div>
  )
}

// ПУЛЬС РЫНКА (28-a): белая карточка — новостная строка волн рынка сверху,
// затем горизонтальный скролл топ-5 движений цен (за час + за день из индекса).
// Тап — применяем поиск по товару. deltaPct < 0 — подешевел (зелёный), > 0 — дороже (красный).
function MarketPulseStrip({ items, headline, flash, onPick }: {
  items: PulseItemDTO[]
  headline: string | null
  flash: boolean
  onPick: (query: string) => void
}) {
  const queryOf = (title: string) => {
    const words = title.split(' ')
    return words.length <= 2 ? title : words.slice(0, 2).join(' ')
  }
  return (
    <section
      className={`shrink-0 mx-3 mb-3 rounded-2xl bg-white border overflow-hidden transition-shadow ${flash ? 'border-[#0AC760] shadow-md' : 'border-[#EBEDF0]'}`}
      aria-label="Пульс рынка"
    >
      <div className="flex items-baseline gap-2 px-3 pt-3 pb-1">
        <Activity size={15} className="text-[#0AC760] self-center" aria-hidden />
        <h2 className="text-[16px] font-bold text-black leading-none">Рынок</h2>
        <span className="text-[12px] text-[#8B8F99]">час · индекс</span>
        {flash && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[#067A47]">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0AC760] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#0AC760]" />
            </span>
            живое
          </span>
        )}
      </div>
      {headline && (
        <p className="px-3 pb-1.5 text-[11px] leading-snug text-[#5C616B] flex items-start gap-1">
          <span className="shrink-0" aria-hidden>📰</span>
          <span>{headline}</span>
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto px-2.5 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((p) => {
          const down = p.deltaPct < 0
          return (
            <button
              key={p.itemKey}
              onClick={() => onPick(queryOf(p.title))}
              className="shrink-0 w-[124px] text-left rounded-xl border border-[#EBEDF0] overflow-hidden bg-white active:scale-[0.97] transition-transform"
              aria-label={`${p.title}, цена ${fmtNum(p.price)}, ${down ? 'подешевел' : 'подорожал'} на ${Math.abs(p.deltaPct)}%`}
            >
              <div className="relative aspect-[16/10] bg-[#F0F1F5]">
                <img src={p.image} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                <span
                  className={`absolute top-1 left-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${
                    down ? 'bg-[#E6F9EF] text-[#067A47]' : 'bg-[#FDEBEB] text-[#D14343]'
                  }`}
                >
                  {down ? '−' : '+'}
                  {Math.abs(p.deltaPct)}%
                </span>
              </div>
              <div className="p-1.5 space-y-0.5">
                <p className="text-[10px] font-semibold text-black truncate">{p.title}</p>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[11px] font-bold text-black tabular-nums">{fmtNum(p.price)} ₽</span>
                  <span className="text-[9px] text-[#8B8F99]">{p.moves} изм.</span>
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
      render: (l): ReactNode => <span className="text-[11px] font-medium text-black">{CONDITION_LABEL[l.condition] ?? l.condition}</span>,
    },
    {
      label: 'Город',
      render: (l): ReactNode => <span className="text-[11px] text-[#8B8F99]">{l.city}</span>,
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
          <span className="text-[11px] text-[#8B8F99] truncate">{l.seller.displayName}</span>
        </span>
      ),
    },
    {
      label: 'Рейтинг',
      render: (l): ReactNode => (
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-black">
          <Star size={10} className="text-[#0AC760] fill-[#0AC760]" aria-hidden />
          {l.seller.rating > 0 ? Math.min(5, l.seller.rating).toFixed(1) : 'новый'}
          {l.seller.ratingCount > 0 && <span className="text-[#8B8F99] font-normal">({l.seller.ratingCount})</span>}
        </span>
      ),
    },
    {
      label: 'К цене',
      render: (l): ReactNode => {
        const cheap = cheaperPercent(l)
        return cheap >= 10 ? (
          <span className="text-[11px] font-bold text-[#067A47]">Дешевле на {cheap}%</span>
        ) : (
          <span className="text-[11px] text-[#8B8F99]">По рынку</span>
        )
      },
    },
    {
      label: 'Смотрели',
      render: (l): ReactNode => <span className="text-[11px] text-[#8B8F99]">{l.views} раз</span>,
    },
    {
      label: 'Когда',
      render: (l): ReactNode => <span className="text-[11px] text-[#8B8F99]">{timeAgo(l.createdAt)}</span>,
    },
  ]

  return (
    <div
      className="absolute inset-0 z-50 flex items-end bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-label="Сравнение товаров"
    >
      <div
        className="w-full max-h-[92%] rounded-t-3xl bg-white flex flex-col animate-[sheet-up_220ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* шапка */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-[#EBEDF0]">
          <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-[#EBEDF0]" aria-hidden />
          <div className="flex items-center">
            <Scale size={16} className="text-black" aria-hidden />
            <h2 className="ml-1.5 text-sm font-bold text-black">Сравнение товаров</h2>
            <button
              onClick={onClear}
              className="ml-auto text-[11px] font-semibold text-[#8B8F99] active:text-black"
            >
              Очистить всё
            </button>
            <button
              onClick={onClose}
              aria-label="Закрыть сравнение"
              className="ml-3 w-8 h-8 rounded-full bg-[#F0F1F5] flex items-center justify-center text-[#5C616B] active:bg-[#E6E8ED]"
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
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-[#F0F1F5]">
                    <img loading="lazy" decoding="async" src={l.image} alt={l.title} className="w-full h-full object-cover"/>
                  </div>
                  <p className="mt-1.5 text-[11px] font-semibold text-black line-clamp-2 leading-snug min-h-[28px]">{l.title}</p>
                  <p
                    className={`text-base font-extrabold leading-tight tabular-nums ${
                      l.price > 0 && l.price === bestPrice ? 'text-[#067A47]' : 'text-black'
                    }`}
                  >
                    {l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}
                  </p>
                  {l.price > 0 && l.price === bestPrice && (
                    <span className="mt-0.5 inline-flex rounded bg-[#E6F9EF] px-1 py-0.5 text-[8px] font-bold text-[#067A47]">
                      лучшая цена
                    </span>
                  )}
                </button>
              </div>
            ))}

            {/* параметрные строки */}
            {rows.map((row) => (
              <div key={row.label} className="contents">
                <div className="py-2 pr-1 text-[10px] font-semibold uppercase tracking-wide text-[#8B8F99] self-center">{row.label}</div>
                {items.map((l) => (
                  <div key={l.id} className="px-1.5 py-2 border-t border-[#EBEDF0] min-w-0 flex items-center">
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
                  className="w-full h-9 rounded-[10px] bg-black text-white text-[11px] font-bold active:bg-[#1A1A1A]"
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
