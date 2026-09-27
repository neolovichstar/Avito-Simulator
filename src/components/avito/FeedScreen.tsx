'use client'

// Лента «Resale» — светлое минималистичное приложение по фирменному макету:
// капс-надзаголовок и город 26px, белая пилюля поиска, чипы-пилюли категорий,
// сетка 2 колонки с квадратными фото, сердечко в белом кружке/70.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Search, SlidersHorizontal, Heart, Star, Zap, Bell, BellPlus, X, SearchX,
  History, Activity, Scale, Handshake, ArrowUpDown, ChevronDown, MapPin,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { CATEGORIES, CATEGORY_LABEL, CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import type { CategoryKey } from '@/lib/catalog-types'
import { fmtNum, initials, hueColor, timeAgo } from '@/lib/format'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { useOS } from '@/lib/store'
import { getViewed, clearViewed, type ViewedItem } from '@/lib/viewed'
import { getSocket } from '@/lib/use-realtime'
import { topMatches, fuzzyMatch, Highlight } from '@/lib/smart-search'
import type { FeedListing, SavedSearchDTO, PulseItemDTO } from '@/lib/types'
import { Card, Chip, EmptyState, Overline, Skeleton, cn } from './ui'

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

// «Дешевле рынка N%»: оценка рынка по состоянию товара (как marginHint на бэке)
function cheaperPercent(l: FeedListing): number {
  if (l.price <= 0) return 0
  const est = l.baseValue * (CONDITION_MULT[l.condition] ?? 0.8)
  if (l.price >= est) return 0
  return Math.min(90, Math.round(((est - l.price) / l.price) * 100))
}

export default function FeedScreen({ onOpenListing, favoritesMode, searchMode, onCancelSearch, onOpenNotifications, initialCategory, lockCategory, headerHero, headerExtra }: {
  onOpenListing: (id: string) => void
  favoritesMode: boolean
  searchMode?: boolean
  onCancelSearch?: () => void
  onOpenNotifications?: () => void
  /** стартовая категория (например, «auto» для вкладки Авто) */
  initialCategory?: CategoryKey | 'all'
  /** спрятать чипы категорий и держать фиксированную (вкладка Авто) */
  lockCategory?: boolean
  /** баннер между поиском и лентой (акцент вкладки) */
  headerHero?: React.ReactNode
  /** сервисная строка под категориями (Авто/Номера на главной) */
  headerExtra?: React.ReactNode
}) {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryKey | 'all'>(initialCategory ?? 'all')
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

  const onFav = useCallback((id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      // синк на сервер (не блокирует UI)
      void import('@/lib/api').then(({ api }) => api.favToggle(id, next.includes(id)).catch(() => {}))
      return next
    })
  }, [])

  const toggleCompare = useCallback((l: FeedListing) => {
    setCompare((prev) => {
      if (prev.some((c) => c.id === l.id)) return prev.filter((c) => c.id !== l.id)
      if (prev.length >= 3) {
        pushToast('Resale', 'В сравнении максимум три товара')
        return prev
      }
      return [...prev, l]
    })
  }, [])

  const comparingIds = useMemo(() => new Set(compare.map((c) => c.id)), [compare])

  const cancelSearch = () => {
    setQ('')
    setQuery('')
    onCancelSearch?.()
  }

  const user = session
  const userCity = session?.city || 'Москва'
  const filtered = !favoritesMode && (Boolean(query) || category !== 'all' || city !== 'all')
  const sectionTitle = favoritesMode ? 'Избранное' : filtered ? 'Результаты поиска' : 'Объявления рядом'

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
    <div className="relative h-full flex flex-col bg-[#F6F7F9]">
      {/* ШАПКА: надзаголовок + город 26px, пилюля поиска, чипы, фильтры */}
      <div className="shrink-0 bg-[#F6F7F9] px-4 pt-2 pb-2.5">
        {/* надзаголовок + город + уведомления + аватар */}
        {!searchMode && (
          <div className="mb-3 flex items-center">
            <div className="min-w-0">
              <Overline>Resale</Overline>
              <button
                onClick={() => setShowSort((s) => !s)}
                aria-expanded={showSort}
                aria-label={`Город ${userCity}. Открыть фильтры`}
                className="flex items-center text-[26px] font-bold tracking-tight leading-tight text-[#141414] transition-opacity active:opacity-70"
              >
                <span className="truncate">{userCity}</span>
                <ChevronDown size={20} className="ml-1 shrink-0 text-black/40" aria-hidden />
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {onOpenNotifications && (
                <button
                  onClick={onOpenNotifications}
                  aria-label="Уведомления"
                  className="relative flex size-11 items-center justify-center rounded-full text-[#141414] transition-colors active:bg-black/[0.06]"
                >
                  <Bell size={21} aria-hidden />
                  {notifUnread && (
                    <span className="absolute right-2.5 top-2 size-2 rounded-full bg-[#16A34A] ring-2 ring-[#F6F7F9]" aria-hidden />
                  )}
                </button>
              )}
              <div className="size-9 overflow-hidden rounded-full ring-1 ring-black/[0.08]" aria-hidden>
                {user?.photoUrl
                  ? <img loading="lazy" decoding="async" src={user.photoUrl} alt="" className="h-full w-full object-cover"/>
                  : <UserAvatar name={user?.displayName ?? 'Я'} className="h-full w-full" />}
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
            <div className="flex h-11 items-center gap-2 rounded-full bg-white px-4 ring-1 ring-black/[0.08]">
              <Search size={18} className="shrink-0 text-black/35" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Искать на Resale"
                aria-label="Искать на Resale"
                className="w-full bg-transparent text-[15px] text-[#141414] outline-none placeholder:text-black/35"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(''); setQuery('') }}
                  aria-label="Очистить поиск"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-black/35 transition-colors active:bg-black/[0.06]"
                >
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>

            {/* подсказки: категории/сохранённые/недавние/пульс — fuzzy по вводу; тап = применить */}
            {showSuggest && (
              <div
                className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[16px] bg-white shadow-[0_14px_40px_-10px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.05]"
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
                    className="flex min-h-[44px] w-full items-center gap-2.5 px-4 py-2 text-left transition-colors active:bg-[#F6F7F9]"
                  >
                    <Search size={14} className="shrink-0 text-black/35" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-[#141414]">
                      <Highlight text={m.value} query={qTrim} />
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/35">искать</span>
                  </button>
                ))}
              </div>
            )}
          </form>
          {searchMode && onCancelSearch && (
            <button
              onClick={cancelSearch}
              className="h-11 shrink-0 px-1 text-[15px] font-medium text-[#141414] transition-opacity active:opacity-70"
            >
              Отмена
            </button>
          )}
        </div>

        {/* категории — горизонтальный скролл чипов-пилюль */}
        {!searchMode && !lockCategory && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Категории">
            <Chip role="tab" aria-selected={category === 'all'} active={category === 'all'} onClick={() => setCategory('all')}>
              Все
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.key}
                role="tab"
                aria-selected={category === c.key}
                active={category === c.key}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        )}

        {/* акцент-баннер вкладки (Авто/Номера) */}
        {headerHero && !searchMode && <div className="mt-3">{headerHero}</div>}

        {/* сервисы (Авто/Номера) — только на главной */}
        {headerExtra && !searchMode && !lockCategory && <div className="mt-2.5">{headerExtra}</div>}

        {/* фильтры — пилюли с иконками */}
        <div className="mt-2.5 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Фильтры и сортировка">
          <Chip active={showSort} aria-expanded={showSort} onClick={() => setShowSort((s) => !s)}>
            <SlidersHorizontal size={13} aria-hidden />
            Фильтры
          </Chip>
          <Chip aria-expanded={showSort} onClick={() => setShowSort((s) => !s)}>
            <ArrowUpDown size={13} aria-hidden />
            Сортировка: {SORT_LABEL[sort]}
          </Chip>
          {(query || category !== 'all') && (
            <Chip onClick={() => saveCurrent()} className="bg-[#14532D]/[0.07] text-[#14532D] ring-[#14532D]/20" aria-label="Сохранить поиск">
              <BellPlus size={13} aria-hidden />
              Сохранить поиск
            </Chip>
          )}
        </div>

        {/* панель фильтров: сортировка + город */}
        {showSort && (
          <div className="mt-2.5 flex flex-col gap-2">
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Сортировка">
              {([['new', 'По дате'], ['cheap', 'Сначала дешевле'], ['expensive', 'Сначала дороже']] as const).map(([k, label]) => (
                <Chip key={k} active={sort === k} onClick={() => setSort(k)}>{label}</Chip>
              ))}
            </div>
            {cities.length > 1 && (
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Фильтр по городу">
                <Chip active={city === 'all'} onClick={() => setCity('all')}>Вся Россия</Chip>
                {cities.map((c) => (
                  <Chip key={c.city} active={city === c.city} onClick={() => setCity(c.city)}>{c.city} · {c.count}</Chip>
                ))}
              </div>
            )}
          </div>
        )}

        {/* сохранённые поиски */}
        {saved.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Сохранённые поиски">
            {saved.map((s) => (
              <span
                key={s.id}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#14532D]/[0.07] pl-3 pr-1.5 text-xs font-medium text-[#14532D]"
              >
                <button
                  onClick={() => applySaved(s)}
                  className="flex items-center gap-1.5 transition-opacity active:opacity-70"
                  aria-label={`Применить поиск ${s.query || CATEGORY_LABEL[s.category ?? ''] || ''}`}
                >
                  <Search size={12} aria-hidden />
                  {s.query || CATEGORY_LABEL[s.category ?? ''] || 'Все категории'}
                </button>
                <button
                  onClick={() => removeSaved(s.id)}
                  aria-label="Удалить поиск"
                  className="flex size-5 items-center justify-center rounded-full text-[#14532D]/60 transition-colors active:bg-black/[0.06]"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* лента: заголовок секции + сетка 2 колонки */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain pb-4 [scrollbar-width:thin]">
        <div className="flex items-baseline justify-between px-4 pb-2.5 pt-1.5">
          <h2 className="text-[18px] font-bold tracking-tight text-[#141414]">{sectionTitle}</h2>
          {!favoritesMode && total > 0 && !loading && (
            <p className="text-[12px] text-black/40">{fmtNum(total)} объявл.</p>
          )}
          {favoritesMode && visibleItems.length > 0 && (
            <p className="text-[12px] text-black/40">{visibleItems.length}</p>
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
        {/* Пульс рынка — новость волн + топ-5 движений цен (час) */}
        {!favoritesMode && !query && category === 'all' && (pulse.length > 0 || pulseHeadline) && !loading && (
          <MarketPulseStrip
            items={pulse}
            headline={pulseHeadline}
            flash={pulseFlash}
            onPick={(t) => { setQ(t); setQuery(t) }}
          />
        )}

        {error && (
          <div className="mx-4 shrink-0 rounded-[16px] bg-red-500/[0.08] p-3 text-sm text-red-600">{error}</div>
        )}
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-2 content-start gap-3 px-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon={<SearchX size={28} />}
            title={favoritesMode ? (qTrim ? 'В избранном нет такого' : 'В избранном пусто') : 'Ничего не нашлось'}
            note={favoritesMode
              ? qTrim
                ? 'Попробуйте другой запрос. Опечатки не страшны'
                : 'Нажимайте на сердечко у объявлений. Они появятся здесь'
              : 'Попробуйте другой запрос или сохраните поиск. Сообщим, когда товар появится'}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 content-start gap-3 px-4">
              {visibleItems.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  onOpen={onOpenListing}
                  onFav={onFav}
                  fav={favs.includes(l.id)}
                  comparing={comparingIds.has(l.id)}
                  onCompareToggle={!favoritesMode ? toggleCompare : undefined}
                />
              ))}
            </div>
            {!favoritesMode && items.length < total && (
              <div className="px-4 pt-3.5">
                <button
                  onClick={() => load(pageRef.current + 1)}
                  disabled={loading}
                  className="h-11 w-full rounded-full bg-white text-sm font-semibold text-[#141414] ring-1 ring-black/[0.08] transition-all active:scale-[0.98] disabled:opacity-50"
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
          className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-[20px] bg-white p-2 text-[#141414] shadow-[0_8px_28px_-8px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.05] animate-in slide-in-from-bottom-2"
          role="toolbar"
          aria-label="Панель сравнения"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#14532D]/[0.08]" aria-hidden>
            <Scale size={16} className="text-[#14532D]" />
            {compare.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#16A34A] text-[9px] font-bold text-white">
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
            className="ml-auto flex h-9 items-center rounded-full bg-[#14532D] px-4 text-xs font-bold text-white transition-all active:scale-[0.97] disabled:opacity-40"
          >
            Сравнить
          </button>
          <button
            onClick={() => setCompare([])}
            aria-label="Очистить сравнение"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/[0.05] text-black/50 transition-colors active:bg-black/[0.09]"
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

function CardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-square w-full rounded-[16px]" />
      <div className="space-y-1.5 px-0.5 pt-2">
        <Skeleton className="h-4 w-2/3 rounded-md" />
        <Skeleton className="h-3.5 w-full rounded-md" />
        <Skeleton className="h-3 w-1/2 rounded-md" />
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
    <Card className="mx-4 mb-3 shrink-0 p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <History size={13} className="text-black/35" aria-hidden />
        <Overline>Вы смотрели</Overline>
        <button
          onClick={onClear}
          className="ml-auto px-1 text-[11px] text-black/40 transition-colors active:text-black/70"
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
            className="w-[96px] shrink-0 text-left transition-transform active:scale-[0.97]"
            aria-label={v.title}
          >
            <div className="aspect-square overflow-hidden rounded-[12px] bg-[#F0F1F3]">
              <img src={v.image} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <p className="mt-1 text-[12px] font-bold leading-none text-[#141414] tabular-nums">
              {v.price === 0 ? 'Даром' : `${fmtNum(v.price)} ₽`}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-black/40">{v.title}</p>
          </button>
        ))}
      </div>
    </Card>
  )
}

// Карточка ленты по макету: квадратное фото rounded-[16px] на #F0F1F3,
// сердечко в белом кружке/70, цена 15 extrabold, название 14 semibold,
// состояние и город с MapPin 12 black/45. memo: ре-рендер только изменённых.
const ListingCard = memo(function ListingCard({ listing: l, onOpen, onFav, fav, comparing, onCompareToggle }: {
  listing: FeedListing
  onOpen: (id: string) => void
  onFav?: (id: string) => void
  fav?: boolean
  comparing?: boolean
  onCompareToggle?: (l: FeedListing) => void
}) {
  const cheap = cheaperPercent(l)
  return (
    <div className="relative">
      <button onClick={() => onOpen(l.id)} aria-label={l.title} className="block w-full text-left">
        <div className={cn(
          'relative aspect-square overflow-hidden rounded-[16px] bg-[#F0F1F3] transition-all',
          comparing && 'ring-2 ring-[#14532D] ring-offset-2 ring-offset-[#F6F7F9]',
        )}>
          <img src={l.image} alt="" className="h-full w-full object-cover" loading="lazy" />
          {cheap >= 10 && (
            <span className="absolute bottom-2 left-2 rounded-full bg-[#14532D] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              Дешевле рынка на {cheap}%
            </span>
          )}
          {l.boosted && (
            <span className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
              <Zap size={9} aria-hidden /> ТОП
            </span>
          )}
        </div>
        <div className="px-0.5 pt-2">
          <p className={`text-[15px] font-extrabold leading-none tabular-nums ${l.price === 0 ? 'text-[#16A34A]' : 'text-[#141414]'}`}>
            {l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}
          </p>
          <p className="mt-1 min-h-[38px] text-[14px] font-semibold leading-snug text-[#141414] line-clamp-2">{l.title}</p>
          <p className="mt-1 text-[12px] leading-none text-black/45">
            {CONDITION_LABEL[l.condition] ?? 'Б/у'}
            {l.negotiable && <span aria-hidden> · </span>}
            {l.negotiable && <span className="inline-flex items-center gap-0.5"><Handshake size={10} className="-mt-px" aria-hidden />Торг</span>}
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-[12px] leading-none text-black/45">
            <MapPin size={11} className="shrink-0" aria-hidden />
            <span className="truncate">{l.city}</span>
          </p>
        </div>
      </button>
      {onCompareToggle && (
        <button
          onClick={() => onCompareToggle?.(l)}
          aria-label={comparing ? `Убрать ${l.title} из сравнения` : `Добавить ${l.title} к сравнению`}
          aria-pressed={comparing}
          className="absolute left-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/70 shadow-sm backdrop-blur-sm transition-transform duration-200 ease-out active:scale-90"
        >
          <Scale size={14} className={comparing ? 'text-[#14532D]' : 'text-black/50'} aria-hidden />
        </button>
      )}
      {onFav && (
        <button
          onClick={() => onFav?.(l.id)}
          aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={fav}
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/70 shadow-sm backdrop-blur-sm transition-transform duration-200 ease-out active:scale-90"
        >
          <Heart
            size={16}
            className={`transition-all duration-200 ease-out ${fav ? 'scale-110 fill-[#F44250] text-[#F44250]' : 'text-black/45'}`}
            aria-hidden
          />
        </button>
      )}
    </div>
  )
})

// ПУЛЬС РЫНКА: белая карточка — новостная строка волн рынка сверху,
// затем горизонтальный скролл топ-5 движений цен. Тап — применяем поиск.
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
    <Card
      className={cn('mx-4 mb-3 shrink-0 overflow-hidden transition-shadow', flash && 'shadow-[0_4px_20px_rgba(22,163,74,0.18)] ring-[#16A34A]/40')}
      aria-label="Пульс рынка"
    >
      <div className="flex items-center gap-2 px-3.5 pb-1 pt-3">
        <Activity size={14} className="text-[#16A34A]" aria-hidden />
        <Overline>Пульс рынка</Overline>
        <span className="text-[10px] text-black/35">час · индекс</span>
        {flash && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[#16A34A]">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16A34A] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
            </span>
            живое
          </span>
        )}
      </div>
      {headline && (
        <p className="px-3.5 pb-1.5 text-[11px] leading-snug text-black/55">{headline}</p>
      )}
      <div className="flex gap-2 overflow-x-auto px-2.5 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((p) => {
          const down = p.deltaPct < 0
          return (
            <button
              key={p.itemKey}
              onClick={() => onPick(queryOf(p.title))}
              className="w-[124px] shrink-0 overflow-hidden rounded-[14px] bg-[#F6F7F9] text-left ring-1 ring-black/[0.04] transition-transform active:scale-[0.97]"
              aria-label={`${p.title}, цена ${fmtNum(p.price)}, ${down ? 'подешевел' : 'подорожал'} на ${Math.abs(p.deltaPct)}%`}
            >
              <div className="relative aspect-[16/10] bg-[#F0F1F3]">
                <img src={p.image} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                <span
                  className={`absolute left-1 top-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${
                    down ? 'bg-[#14532D] text-white' : 'bg-red-500/[0.92] text-white'
                  }`}
                >
                  {down ? '−' : '+'}
                  {Math.abs(p.deltaPct)}%
                </span>
              </div>
              <div className="space-y-0.5 p-1.5">
                <p className="truncate text-[10px] font-semibold text-[#141414]">{p.title}</p>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[11px] font-bold tabular-nums text-[#141414]">{fmtNum(p.price)} ₽</span>
                  <span className="text-[9px] text-black/40">{p.moves} изм.</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </Card>
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
      render: (l): ReactNode => <span className="text-[11px] font-medium text-[#141414]">{CONDITION_LABEL[l.condition] ?? l.condition}</span>,
    },
    {
      label: 'Город',
      render: (l): ReactNode => <span className="text-[11px] text-black/45">{l.city}</span>,
    },
    {
      label: 'Продавец',
      render: (l): ReactNode => (
        <span className="flex min-w-0 items-center gap-1">
          <span
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white"
            style={{ background: hueColor(l.seller.id.length * 47 % 360) }}
            aria-hidden
          >
            {initials(l.seller.displayName)}
          </span>
          <span className="truncate text-[11px] text-black/45">{l.seller.displayName}</span>
        </span>
      ),
    },
    {
      label: 'Рейтинг',
      render: (l): ReactNode => (
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-[#141414]">
          <Star size={10} className="fill-[#16A34A] text-[#16A34A]" aria-hidden />
          {l.seller.rating > 0 ? Math.min(5, l.seller.rating).toFixed(1) : 'новый'}
          {l.seller.ratingCount > 0 && <span className="font-normal text-black/40">({l.seller.ratingCount})</span>}
        </span>
      ),
    },
    {
      label: 'К цене',
      render: (l): ReactNode => {
        const cheap = cheaperPercent(l)
        return cheap >= 10 ? (
          <span className="text-[11px] font-bold text-[#14532D]">Дешевле на {cheap}%</span>
        ) : (
          <span className="text-[11px] text-black/40">По рынку</span>
        )
      },
    },
    {
      label: 'Смотрели',
      render: (l): ReactNode => <span className="text-[11px] text-black/45">{l.views} раз</span>,
    },
    {
      label: 'Когда',
      render: (l): ReactNode => <span className="text-[11px] text-black/45">{timeAgo(l.createdAt)}</span>,
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
        className="flex max-h-[92%] w-full flex-col rounded-t-[24px] bg-white animate-[sheet-up_220ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* шапка */}
        <div className="shrink-0 border-b border-black/[0.05] px-4 pb-2 pt-3">
          <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-black/[0.08]" aria-hidden />
          <div className="flex items-center">
            <Scale size={16} className="text-[#14532D]" aria-hidden />
            <h2 className="ml-1.5 text-sm font-bold text-[#141414]">Сравнение товаров</h2>
            <button
              onClick={onClear}
              className="ml-auto text-[11px] font-semibold text-black/40 transition-colors active:text-black/70"
            >
              Очистить всё
            </button>
            <button
              onClick={onClose}
              aria-label="Закрыть сравнение"
              className="ml-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] text-black/50 transition-colors active:bg-black/[0.09]"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>

        {/* таблица */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin]">
          <div className="grid min-w-0 gap-x-1" style={gridCols}>
            {/* строка: фото, название, цена, кнопка */}
            <div />
            {items.map((l) => (
              <div key={l.id} className="min-w-0 px-1.5">
                <button onClick={() => onOpen(l.id)} className="block w-full text-left" aria-label={`Открыть ${l.title}`}>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-[#F0F1F3]">
                    <img loading="lazy" decoding="async" src={l.image} alt={l.title} className="h-full w-full object-cover"/>
                  </div>
                  <p className="mt-1.5 min-h-[28px] text-[11px] font-semibold leading-snug text-[#141414] line-clamp-2">{l.title}</p>
                  <p
                    className={`text-base font-extrabold leading-tight tabular-nums ${
                      l.price > 0 && l.price === bestPrice ? 'text-[#14532D]' : 'text-[#141414]'
                    }`}
                  >
                    {l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}
                  </p>
                  {l.price > 0 && l.price === bestPrice && (
                    <span className="mt-0.5 inline-flex rounded bg-[#14532D]/[0.08] px-1 py-0.5 text-[8px] font-bold text-[#14532D]">
                      лучшая цена
                    </span>
                  )}
                </button>
              </div>
            ))}

            {/* параметрные строки */}
            {rows.map((row) => (
              <div key={row.label} className="contents">
                <div className="self-center py-2 pr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/40">{row.label}</div>
                {items.map((l) => (
                  <div key={l.id} className="flex min-w-0 items-center border-t border-black/[0.05] px-1.5 py-2">
                    {row.render(l)}
                  </div>
                ))}
              </div>
            ))}

            {/* строка кнопок */}
            <div />
            {items.map((l) => (
              <div key={l.id} className="px-1.5 pb-1 pt-2">
                <button
                  onClick={() => onOpen(l.id)}
                  className="h-9 w-full rounded-full bg-[#14532D] text-[11px] font-bold text-white transition-all active:scale-[0.97]"
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
