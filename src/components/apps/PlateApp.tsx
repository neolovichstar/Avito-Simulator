'use client'

// ─────────────────────────────────────────────────────────────────────────────
// «Авто номера» — редизайн по макету (маркетплейс премиальных ГОСТ-знаков).
//
// Вкладки (нижний таб-бар как в макете): Главная / Поиск / (+ Разыграть) /
// Избранное / Профиль. Экраны:
//  1. Каталог: поиск, чипы Все/VIP/Блатные/Серии/Регион, сетка карточек
//     (бейдж VIP/ЭЛИТА/ТОП, сердце-избранное, ГОСТ-знак, цена, признаки).
//  2. Фильтры: регионы (быстрые + полный список в шторке), серия-буквы,
//     повторяющиеся цифры, премиум-категория, двойной слайдер цены, CTA.
//  3. Розыгрыш: вертикальная карусель знаков с золотым свечением,
//     «Крутить номер» (прокрутка бесплатна, выкуп по редкости).
//  4. Деталь: большой знак, цена, чипы-признаки, характеристики, покупка.
//  5. Профиль: мои номера, сделать основным, сдать номер.
//
// Бэкенд: /api/plates/market (витрина дня), /api/plates/roll (оффер),
// /api/plates (выкуп + мои номера). Анимации: screen-enter/press, transform.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Crown, Dices, Eye, Flame,
  Gem, Heart, MapPin, Search, ShieldCheck, SlidersHorizontal, Star, Trash2, UserRound, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { CarPlateDTO, PlateMarketItemDTO, PlateOfferDTO } from '@/lib/types'
import { RARITY_LABEL } from '@/lib/plate'
import { RF_SUBJECTS } from '@/lib/rf-regions'
import { fmtMoney } from '@/lib/format'
import { sound } from '@/lib/sound'
import { useOS } from '@/lib/store'
import { GostPlate } from '@/components/plates/GostPlate'

const GREEN = '#12894B'
const CAPS = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]'
const CARD = 'rounded-[20px] bg-white shadow-[0_2px_14px_rgba(23,24,26,0.05)]'

type Tab = 'home' | 'search' | 'raffle' | 'favs' | 'profile'
type Chip = 'all' | 'vip' | 'elite' | 'series'

const FAV_KEY = 'avito_sim_plate_favs_v1'

function loadFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function vibrate(ms: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms)
    } catch {
      /* ignore */
    }
  }
}

/** Бейдж категории над знаком (VIP/ЭЛИТА/ТОП как в макете). */
function CategoryBadge({ category }: { category: PlateMarketItemDTO['category'] }) {
  if (category === 'common') return null
  const map = {
    vip: { label: 'VIP', cls: 'bg-gradient-to-r from-[#D4A017] to-[#B8860B] text-white' },
    elite: { label: 'ЭЛИТА', cls: 'bg-gradient-to-r from-[#E8C46A] to-[#C99B2F] text-white' },
    top: { label: 'ТОП', cls: 'bg-[#17181A] text-white' },
  } as const
  const m = map[category]
  return <span className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-wide ${m.cls}`}>{m.label}</span>
}

/** Признак с иконкой (строки «Легендарный номер» / «Крайне редкий»). */
function TraitRow({ icon, text }: { icon: 'crown' | 'chart'; text: string }) {
  const gold = icon === 'crown' ? '#C99B2F' : '#94A3B8'
  return (
    <span className="flex items-center gap-1 text-[10.5px] leading-tight text-[#6B7280]">
      {icon === 'crown' ? (
        <Crown className="size-3 shrink-0" style={{ color: gold }} aria-hidden />
      ) : (
        <BarChart3 className="size-3 shrink-0" style={{ color: gold }} aria-hidden />
      )}
      <span className="truncate">{text}</span>
    </span>
  )
}

/** Карточка витрины (сетка 2 колонки как в макете). */
function MarketCard({
  item,
  faved,
  onOpen,
  onFav,
  index,
}: {
  item: PlateMarketItemDTO
  faved: boolean
  onOpen: () => void
  onFav: () => void
  index: number
}) {
  return (
    <div
      className={`${CARD} screen-enter overflow-hidden p-3`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="flex items-center justify-between">
        <CategoryBadge category={item.category} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            sound.tap()
            vibrate(12)
            onFav()
          }}
          aria-label={faved ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={faved}
          className="press flex size-8 items-center justify-center rounded-full"
        >
          <Heart
            className="size-4.5 transition-colors duration-200"
            style={{ color: faved ? '#E4573D' : '#C4C8CE', fill: faved ? '#E4573D' : 'transparent' }}
            aria-hidden
          />
        </button>
      </div>
      <button type="button" onClick={() => { sound.tap(); vibrate(8); onOpen() }} className="press mt-1.5 flex w-full flex-col items-center gap-2 text-left" aria-label={`Номер ${item.first} ${item.digits} ${item.letters} ${item.regionCode}, ${fmtMoney(item.price)}`}>
        <GostPlate first={item.first} digits={item.digits} letters={item.letters} regionCode={item.regionCode} rarity={item.rarity} size="sm" />
        <span className="text-[13.5px] font-bold text-[#17181A]">
          {item.first}
          {item.digits}
          {item.letters} {item.regionCode}
        </span>
        <span className="text-[16.5px] font-extrabold text-[#17181A]">{fmtMoney(item.price)}</span>
        <span className="w-full space-y-0.5 border-t border-[#F0F1F3] pt-2">
          <TraitRow icon="crown" text={item.trait} />
          <TraitRow icon="chart" text={RARITY_LABEL[item.rarity]} />
        </span>
      </button>
    </div>
  )
}

/** Двойной слайдер цены (два независимых инпута с золотым треком). */
function PriceRange({
  min,
  max,
  lo,
  hi,
  onLo,
  onHi,
}: {
  min: number
  max: number
  lo: number
  hi: number
  onLo: (v: number) => void
  onHi: (v: number) => void
}) {
  const pctLo = ((lo - min) / (max - min)) * 100
  const pctHi = ((hi - min) / (max - min)) * 100
  return (
    <div className="relative h-9" role="group" aria-label="Диапазон цены">
      <span className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#ECEEF1]" aria-hidden />
      <span
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{ left: `${pctLo}%`, width: `${Math.max(0, pctHi - pctLo)}%`, background: 'linear-gradient(90deg,#E8C46A,#C99B2F)' }}
        aria-hidden
      />
      <input
        type="range"
        min={min}
        max={max}
        step={10000}
        value={lo}
        onChange={(e) => onLo(Math.min(Number(e.target.value), hi - 10000))}
        aria-label="Цена от"
        className="absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#C99B2F] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
      />
      <input
        type="range"
        min={min}
        max={max}
        step={10000}
        value={hi}
        onChange={(e) => onHi(Math.max(Number(e.target.value), lo + 10000))}
        aria-label="Цена до"
        className="absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#C99B2F] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
      />
    </div>
  )
}

const PATTERNS = [
  { key: 'any', label: 'Любые', hint: '' },
  { key: 'same', label: 'Одинаковые', hint: '777' },
  { key: 'pairs', label: 'Две пары', hint: '7700' },
  { key: 'mirror', label: 'Зеркальные', hint: '1221' },
] as const
type PatternKey = (typeof PATTERNS)[number]['key']

const SERIES_LETTERS = ['А', 'В', 'Е', 'К', 'М', 'Н', 'О', 'Р', 'С', 'Т', 'У', 'Х']

const QUICK_REGIONS = [
  { code: '77', name: 'Москва' },
  { code: '99', name: 'Москва' },
  { code: '50', name: 'Московская обл.' },
  { code: '78', name: 'Санкт-Петербург' },
  { code: '97', name: 'Москва' },
]

function matchPattern(digits: string, p: PatternKey): boolean {
  const [a, b, c] = digits.split('')
  if (p === 'any') return true
  if (p === 'same') return a === b && b === c
  if (p === 'pairs') return a === b || b === c
  return a === c && a !== b
}

// ───────────────────────── главный компонент ─────────────────────────

export default function PlateApp({ embedded = false }: { embedded?: boolean }) {
  const session = useOS((s) => s.session)
  const refreshSession = useOS((s) => s.refreshSession)

  const [tab, setTab] = useState<Tab>('home')
  const [detail, setDetail] = useState<PlateMarketItemDTO | null>(null)
  const [items, setItems] = useState<PlateMarketItemDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [favs, setFavs] = useState<string[]>([])
  const [toast, setToast] = useState('')

  // фильтры
  const [chip, setChip] = useState<Chip>('all')
  const [regionCode, setRegionCode] = useState<string | null>(null)
  const [series, setSeries] = useState<string | null>(null)
  const [pattern, setPattern] = useState<PatternKey>('any')
  const [category, setCategory] = useState<'all' | 'vip' | 'elite' | 'top' | 'common'>('all')
  const [priceLo, setPriceLo] = useState(10000)
  const [priceHi, setPriceHi] = useState(5_000_000)
  const [regionSheet, setRegionSheet] = useState(false)
  const [regionQuery, setRegionQuery] = useState('')

  // розыгрыш
  const [spinning, setSpinning] = useState(false)
  const [offer, setOffer] = useState<PlateOfferDTO | null>(null)
  const [reel, setReel] = useState<PlateOfferDTO | null>(null)
  const [buying, setBuying] = useState(false)
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // мои номера
  const [mine, setMine] = useState<CarPlateDTO[]>([])

  useEffect(() => {
    setFavs(loadFavs())
  }, [])

  const showToast = useCallback((t: string) => {
    setToast(t)
    setTimeout(() => setToast(''), 2400)
  }, [])

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([api.platesMarket(), api.plates()])
      setItems(m.items)
      setMine(p.plates)
    } catch {
      /* сеть моргнула */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleFav = useCallback((key: string) => {
    setFavs((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      localStorage.setItem(FAV_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (chip === 'vip' && it.category !== 'vip') return false
      if (chip === 'elite' && it.category !== 'elite') return false
      if (chip === 'series' && !(it.letters[0] === it.letters[1] || it.first === it.letters[0] || it.first === it.letters[1])) return false
      if (regionCode && it.regionCode !== regionCode) return false
      if (series && !(it.first === series || it.letters.includes(series))) return false
      if (!matchPattern(it.digits, pattern)) return false
      if (category !== 'all' && it.category !== category) return false
      if (it.price < priceLo || it.price > priceHi) return false
      return true
    })
  }, [items, chip, regionCode, series, pattern, category, priceLo, priceHi])

  const favItems = useMemo(() => items.filter((i) => favs.includes(i.key)), [items, favs])

  // ── розыгрыш ──
  const offerRef = useRef<PlateOfferDTO | null>(null)
  const spin = useCallback(async () => {
    if (spinning) return
    sound.tap()
    vibrate([10, 40, 10])
    setSpinning(true)
    setOffer(null)
    offerRef.current = null

    // визуальная прокрутка случайных знаков (останавливается, когда пришёл оффер)
    const regions = RF_SUBJECTS
    const letters = ['А', 'В', 'Е', 'К', 'М', 'Н', 'О', 'Р', 'С', 'Т', 'У', 'Х']
    const fakeOffer = (): PlateOfferDTO => {
      const s = regions[Math.floor(Math.random() * regions.length)]
      const code = s.plateCodes[Math.floor(Math.random() * s.plateCodes.length)]
      return {
        first: letters[Math.floor(Math.random() * letters.length)],
        digits: `${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`,
        letters: `${letters[Math.floor(Math.random() * letters.length)]}${letters[Math.floor(Math.random() * letters.length)]}`,
        regionCode: code,
        regionName: s.name,
        rarity: 'common',
        beautyScore: 0,
        price: 0,
      }
    }
    const startMs = Date.now()
    setReel(fakeOffer())
    spinTimer.current = setInterval(() => {
      // оффер уже на экране — финальный знак больше не перебиваем
      if (offerRef.current) {
        if (spinTimer.current) clearInterval(spinTimer.current)
        spinTimer.current = null
        return
      }
      setReel(fakeOffer())
    }, 85)

    try {
      const s = regions[Math.floor(Math.random() * regions.length)]
      const r = await api.plateRoll({ subject: s.name, mode: 'full' })
      // даём прокрутке отыграть минимум ~1.1 с, чтобы глаз успел
      const elapsed = Date.now() - startMs
      await new Promise((res) => setTimeout(res, Math.max(0, 1100 - elapsed)))
      offerRef.current = r.offer
      setReel(r.offer)
      setOffer(r.offer)
      vibrate([20, 60, 20, 60, 40])
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Не удалось крутить. Попробуйте ещё')
    } finally {
      setTimeout(() => setSpinning(false), 120)
    }
  }, [spinning, showToast])

  useEffect(() => () => {
    if (spinTimer.current) clearInterval(spinTimer.current)
  }, [])

  const buyOffer = useCallback(async () => {
    if (!offer || buying) return
    setBuying(true)
    try {
      const r = await api.plateBuy({
        first: offer.first,
        digits: offer.digits,
        letters: offer.letters,
        regionCode: offer.regionCode,
        regionName: offer.regionName,
      })
      refreshSession({ balance: r.balance })
      setMine((m) => [r.plate, ...m])
      setOffer(null)
      setReel(null)
      vibrate([30, 40, 30])
      showToast(`Номер ${r.plate.first}${r.plate.digits}${r.plate.letters} ${r.plate.regionCode} ваш!`)
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Не удалось выкупить номер')
    } finally {
      setBuying(false)
    }
  }, [offer, buying, refreshSession, showToast])

  const buyItem = useCallback(
    async (item: PlateMarketItemDTO) => {
      if (buying) return
      setBuying(true)
      try {
        const r = await api.plateBuy({
          first: item.first,
          digits: item.digits,
          letters: item.letters,
          regionCode: item.regionCode,
          regionName: item.regionName,
        })
        refreshSession({ balance: r.balance })
        setMine((m) => [r.plate, ...m])
        setItems((list) => list.filter((i) => i.key !== item.key))
        setDetail(null)
        vibrate([30, 40, 30])
        showToast(`Номер ${item.first}${item.digits}${item.letters} ${item.regionCode} ваш!`)
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : 'Не удалось купить номер')
      } finally {
        setBuying(false)
      }
    },
    [buying, refreshSession, showToast],
  )

  const makeMain = useCallback(
    async (p: CarPlateDTO) => {
      try {
        await api.plateSetMain(p.id)
        setMine((m) => m.map((x) => ({ ...x, isMain: x.id === p.id })))
        showToast('Основной номер обновлён')
      } catch {
        showToast('Не удалось изменить основной номер')
      }
    },
    [showToast],
  )

  const release = useCallback(
    async (p: CarPlateDTO) => {
      try {
        await api.plateRelease(p.id)
        setMine((m) => m.filter((x) => x.id !== p.id))
        showToast('Номер сдан в ГИБДД')
      } catch {
        showToast('Не удалось сдать номер')
      }
    },
    [showToast],
  )

  // ── рендер ──
  return (
    <div className="relative flex h-full flex-col bg-[#F6F7F9] text-[#17181A]">
      {!embedded && detail === null && (
        <header className="shrink-0 px-4 pb-1 pt-1.5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] text-[#17181A]">Авто номера</h1>
              <p className={CAPS}>Премиальные номера для вашего статуса</p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-white text-[#374151] shadow-[0_2px_10px_rgba(23,24,26,0.06)]">
                <Bell className="size-5" />
              </span>
              <button
                type="button"
                onClick={() => {
                  sound.tap()
                  setTab('profile')
                }}
                aria-label="Профиль"
                className="press flex size-10 items-center justify-center rounded-full bg-[#ECEEF1] text-[#6B7280]"
              >
                <UserRound className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        </header>
      )}

      {embedded && detail === null && (
        <header className="shrink-0 px-4 pb-1 pt-1.5">
          <h1 className="text-[22px] font-bold leading-tight text-[#17181A]">Авто номера</h1>
          <p className={CAPS}>Премиальные номера для вашего статуса</p>
        </header>
      )}

      <main className="min-h-0 flex-1">
        <div key={`${tab}-${detail ? 'd' : 'r'}`} className="h-full screen-enter">
          {detail ? (
            <DetailScreen
              item={detail}
              faved={favs.includes(detail.key)}
              buying={buying}
              onFav={() => toggleFav(detail.key)}
              onBuy={() => void buyItem(detail)}
              onBack={() => setDetail(null)}
            />
          ) : tab === 'home' ? (
            <HomeTab
              loading={loading}
              items={items}
              filtered={filtered}
              chip={chip}
              favs={favs}
              onChip={(c) => { sound.tap(); setChip(c) }}
              onSearch={() => { sound.tap(); setTab('search') }}
              onOpen={setDetail}
              onFav={toggleFav}
            />
          ) : tab === 'search' ? (
            <FilterScreen
              filtered={filtered}
              regionCode={regionCode}
              series={series}
              pattern={pattern}
              category={category}
              priceLo={priceLo}
              priceHi={priceHi}
              regionSheet={regionSheet}
              regionQuery={regionQuery}
              setRegionCode={(c) => { sound.tap(); setRegionCode(c) }}
              setSeries={(s) => { sound.tap(); setSeries(s) }}
              setPattern={(p) => { sound.tap(); setPattern(p) }}
              setCategory={(c) => { sound.tap(); setCategory(c) }}
              setPriceLo={setPriceLo}
              setPriceHi={setPriceHi}
              openRegionSheet={() => { sound.tap(); setRegionSheet(true) }}
              closeRegionSheet={() => setRegionSheet(false)}
              setRegionQuery={setRegionQuery}
              onApply={() => { sound.tap(); setTab('home') }}
              onReset={() => {
                sound.tap()
                setRegionCode(null)
                setSeries(null)
                setPattern('any')
                setCategory('all')
                setPriceLo(10000)
                setPriceHi(5_000_000)
                setChip('all')
              }}
              items={items}
            />
          ) : tab === 'raffle' ? (
            <RaffleScreen
              spinning={spinning}
              offer={offer}
              reel={reel}
              buying={buying}
              onSpin={() => void spin()}
              onBuy={() => void buyOffer()}
              onAgain={() => {
                setOffer(null)
                setReel(null)
                void spin()
              }}
            />
          ) : tab === 'favs' ? (
            <div className="h-full overflow-y-auto px-4 pb-6 pt-2 [scrollbar-width:thin]">
              {favItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 px-8 pt-16 text-center">
                  <span className="flex size-16 items-center justify-center rounded-[22px] bg-white text-[#C4C8CE] shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
                    <Heart className="size-7" aria-hidden />
                  </span>
                  <h3 className="text-[15px] font-bold text-[#17181A]">В избранном пусто</h3>
                  <p className="text-[13px] leading-relaxed text-[#6B7280]">
                    Нажимайте на сердце у номера — он появится здесь для быстрого выкупа.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {favItems.map((it, i) => (
                    <MarketCard
                      key={it.key}
                      item={it}
                      index={i}
                      faved
                      onOpen={() => setDetail(it)}
                      onFav={() => toggleFav(it.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ProfileTab
              mine={mine}
              balance={session?.balance ?? 0}
              onMain={(p) => void makeMain(p)}
              onRelease={(p) => void release(p)}
            />
          )}
        </div>
      </main>

      {!embedded && detail === null && (
        <nav
          aria-label="Разделы авто номеров"
          className="absolute inset-x-0 bottom-0 z-20 flex h-[64px] items-stretch border-t border-black/[0.04] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <TabBtn label="Главная" active={tab === 'home'} icon={<HomeIcon />} onClick={() => { sound.tap(); setTab('home') }} />
          <TabBtn label="Поиск" active={tab === 'search'} icon={<Search className="size-[22px]" aria-hidden />} onClick={() => { sound.tap(); setTab('search') }} />
          <div className="relative flex w-1/5 items-start justify-center">
            <button
              type="button"
              onClick={() => {
                sound.tap()
                setTab('raffle')
              }}
              aria-label="Разыграть номер"
              className="press -mt-5 flex size-[52px] items-center justify-center rounded-full text-white"
              style={{ background: GREEN, boxShadow: '0 10px 22px rgba(18,137,75,0.4)' }}
            >
              <Dices className="size-6" aria-hidden />
            </button>
          </div>
          <TabBtn label="Избранное" active={tab === 'favs'} icon={<Heart className="size-[22px]" aria-hidden />} onClick={() => { sound.tap(); setTab('favs') }} />
          <TabBtn label="Профиль" active={tab === 'profile'} icon={<UserRound className="size-[22px]" aria-hidden />} onClick={() => { sound.tap(); setTab('profile') }} />
        </nav>
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-40 flex justify-center px-6" role="status">
          <span className="screen-enter rounded-full bg-[#17181A]/92 px-4 py-2.5 text-center text-[12.5px] font-medium text-white shadow-xl">
            {toast}
          </span>
        </div>
      )}

      {/* шторка регионов */}
      {regionSheet && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Выбор региона">
          <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/25 os-fade" onClick={() => setRegionSheet(false)} />
          <div className="relative rounded-t-[24px] bg-white pb-[calc(14px+env(safe-area-inset-bottom))] os-sheet-rise">
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-[#E1E4E8]" aria-hidden />
            <div className="flex items-center justify-between px-5 pb-2 pt-3.5">
              <h2 className="text-[16px] font-bold text-[#17181A]">Регион</h2>
              <button
                type="button"
                onClick={() => {
                  setRegionCode(null)
                  setRegionSheet(false)
                }}
                className="press text-[13px] font-semibold text-[#12894B]"
              >
                Все регионы
              </button>
            </div>
            <div className="px-5 pb-2">
              <div className="flex h-10 items-center gap-2 rounded-full bg-[#ECEEF1] px-3.5">
                <Search className="size-4 text-[#9CA3AF]" aria-hidden />
                <input
                  value={regionQuery}
                  onChange={(e) => setRegionQuery(e.target.value)}
                  placeholder="Найти регион…"
                  className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[#9CA3AF]"
                />
              </div>
            </div>
            <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto px-5 pb-2 [scrollbar-width:thin]">
              {RF_SUBJECTS.filter((s) => !regionQuery.trim() || s.name.toLowerCase().includes(regionQuery.trim().toLowerCase())).flatMap((s) =>
                s.plateCodes.slice(0, 2).map((code) => (
                  <button
                    key={`${s.name}-${code}`}
                    type="button"
                    onClick={() => {
                      sound.tap()
                      setRegionCode(code)
                      setRegionSheet(false)
                    }}
                    className={`press rounded-[14px] border p-2.5 text-center ${
                      regionCode === code ? 'border-[#17181A] bg-white shadow-[0_2px_10px_rgba(23,24,26,0.08)]' : 'border-[#ECEEF1] bg-[#F6F7F9]'
                    }`}
                  >
                    <span className="block text-[15px] font-extrabold tabular-nums text-[#17181A]">{code}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#9CA3AF]">{s.name}</span>
                  </button>
                )),
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-[22px]">
      <path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function TabBtn({ label, active, icon, onClick }: { label: string; active: boolean; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="press flex w-1/5 flex-col items-center justify-center gap-0.5 pb-1"
      style={{ color: active ? '#17181A' : '#9CA3AF' }}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

// ───────────────────────── вкладка «Главная» ─────────────────────────

function HomeTab({
  loading,
  items,
  filtered,
  chip,
  favs,
  onChip,
  onSearch,
  onOpen,
  onFav,
}: {
  loading: boolean
  items: PlateMarketItemDTO[]
  filtered: PlateMarketItemDTO[]
  chip: Chip
  favs: string[]
  onChip: (c: Chip) => void
  onSearch: () => void
  onOpen: (i: PlateMarketItemDTO) => void
  onFav: (key: string) => void
}) {
  const chips: { key: Chip; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'vip', label: 'VIP' },
    { key: 'elite', label: 'Блатные' },
    { key: 'series', label: 'Серии' },
  ]
  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 pb-6 pt-1 [scrollbar-width:thin]">
      {/* поиск */}
      <button type="button" onClick={onSearch} className="press block w-full text-left" aria-label="Поиск номера">
        <div className="flex h-11 items-center gap-2.5 rounded-full bg-white px-4 shadow-[0_2px_10px_rgba(23,24,26,0.05)]">
          <Search className="size-4.5 shrink-0 text-[#9CA3AF]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#9CA3AF]">Найти номер… Например: А001АА или 777</span>
          <SlidersHorizontal className="size-4.5 shrink-0 text-[#374151]" aria-hidden />
        </div>
      </button>

      {/* чипы */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onChip(c.key)}
            aria-pressed={chip === c.key}
            className={`press h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-colors ${
              chip === c.key ? 'bg-[#17181A] text-white' : 'bg-white text-[#374151] shadow-[0_1px_6px_rgba(23,24,26,0.06)]'
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onSearch}
          className="press h-9 shrink-0 rounded-full bg-white px-4 text-[13px] font-semibold text-[#374151] shadow-[0_1px_6px_rgba(23,24,26,0.06)]"
        >
          Регион <ChevronDown className="ml-0.5 inline size-3.5" aria-hidden />
        </button>
      </div>

      {/* витрина */}
      <div className="mt-4 flex items-baseline justify-between">
        <p className={CAPS}>Популярные номера</p>
        <button type="button" onClick={onSearch} className="press text-[12px] font-semibold text-[#374151]">
          Смотреть все ›
        </button>
      </div>

      {loading ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <div className="h-[196px] animate-pulse rounded-[20px] bg-white" />
          <div className="h-[196px] animate-pulse rounded-[20px] bg-white" />
          <div className="h-[196px] animate-pulse rounded-[20px] bg-white" />
          <div className="h-[196px] animate-pulse rounded-[20px] bg-white" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <Search className="size-8 text-[#C4C8CE]" aria-hidden />
          <p className="text-[14px] font-semibold text-[#17181A]">Ничего не найдено</p>
          <p className="text-[12.5px] text-[#9CA3AF]">Смягчите фильтры или загляните завтра — рынок обновляется каждый день.</p>
        </div>
      ) : (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {filtered.slice(0, 24).map((it, i) => (
            <MarketCard key={it.key} item={it} index={i} faved={favs.includes(it.key)} onOpen={() => onOpen(it)} onFav={() => onFav(it.key)} />
          ))}
        </div>
      )}

      {items.length > 0 && filtered.length > 24 && (
        <p className="mt-3 text-center text-[11.5px] text-[#9CA3AF]">Показаны топ-24 из {filtered.length}. Точнее — в фильтрах.</p>
      )}
    </div>
  )
}

// ───────────────────────── вкладка «Фильтры» ─────────────────────────

function FilterScreen({
  filtered,
  regionCode,
  series,
  pattern,
  category,
  priceLo,
  priceHi,
  regionSheet,
  regionQuery,
  setRegionCode,
  setSeries,
  setPattern,
  setCategory,
  setPriceLo,
  setPriceHi,
  openRegionSheet,
  closeRegionSheet,
  setRegionQuery,
  onApply,
  onReset,
  items,
}: {
  filtered: PlateMarketItemDTO[]
  regionCode: string | null
  series: string | null
  pattern: PatternKey
  category: 'all' | 'vip' | 'elite' | 'top' | 'common'
  priceLo: number
  priceHi: number
  regionSheet: boolean
  regionQuery: string
  setRegionCode: (c: string | null) => void
  setSeries: (s: string | null) => void
  setPattern: (p: PatternKey) => void
  setCategory: (c: 'all' | 'vip' | 'elite' | 'top' | 'common') => void
  setPriceLo: (v: number) => void
  setPriceHi: (v: number) => void
  openRegionSheet: () => void
  closeRegionSheet: () => void
  setRegionQuery: (q: string) => void
  onApply: () => void
  onReset: () => void
  items: PlateMarketItemDTO[]
}) {
  const cats = [
    { key: 'vip' as const, label: 'VIP', desc: 'Крайние редкие номера', icon: Crown },
    { key: 'elite' as const, label: 'Элита', desc: 'Высокий статус', icon: Gem },
    { key: 'top' as const, label: 'Популярные', desc: 'Востребованные номера', icon: Star },
    { key: 'common' as const, label: 'Обычные', desc: 'Хорошие варианты', icon: Flame },
  ]
  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 pb-28 pt-1 [scrollbar-width:thin]">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-[20px] font-bold text-[#17181A]">Фильтры</h2>
        <button type="button" onClick={onReset} className="press text-[13px] font-semibold text-[#6B7280]">
          Сбросить
        </button>
      </div>

      {/* регион */}
      <div className="flex items-baseline justify-between">
        <p className={CAPS}>Регион</p>
        <button type="button" onClick={openRegionSheet} className="press text-[12px] font-semibold text-[#374151]">
          {regionCode ? `Код ${regionCode}` : 'Все регионы'} ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {QUICK_REGIONS.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() => setRegionCode(regionCode === r.code ? null : r.code)}
            aria-pressed={regionCode === r.code}
            className={`press rounded-[14px] border p-2.5 text-center ${
              regionCode === r.code ? 'border-[#17181A] bg-white shadow-[0_2px_10px_rgba(23,24,26,0.08)]' : 'border-[#ECEEF1] bg-white'
            }`}
          >
            <span className="block text-[15px] font-extrabold tabular-nums text-[#17181A]">{r.code}</span>
            <span className="mt-0.5 block truncate text-[10px] text-[#9CA3AF]">{r.name}</span>
          </button>
        ))}
        <button type="button" onClick={openRegionSheet} className="press rounded-[14px] border border-[#ECEEF1] bg-white p-2.5 text-center">
          <span className="block text-[12.5px] font-bold text-[#17181A]">Регионы</span>
          <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] text-[#9CA3AF]">
            Выбрать <ChevronRight className="size-3" aria-hidden />
          </span>
        </button>
      </div>

      {/* серия */}
      <p className={`${CAPS} mt-5`}>Серия номера</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSeries(null)}
          aria-pressed={series === null}
          className={`press h-9 rounded-full px-4 text-[13px] font-semibold ${series === null ? 'bg-[#17181A] text-white' : 'bg-white text-[#374151] shadow-[0_1px_6px_rgba(23,24,26,0.06)]'}`}
        >
          Любая
        </button>
        {SERIES_LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setSeries(series === l ? null : l)}
            aria-pressed={series === l}
            className={`press size-9 rounded-full text-[14px] font-bold ${series === l ? 'bg-[#17181A] text-white' : 'bg-white text-[#374151] shadow-[0_1px_6px_rgba(23,24,26,0.06)]'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* рисунок */}
      <p className={`${CAPS} mt-5`}>Повторяющиеся цифры</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {PATTERNS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPattern(p.key)}
            aria-pressed={pattern === p.key}
            className={`press rounded-[14px] border p-3 text-left ${
              pattern === p.key ? 'border-[#17181A] bg-[#17181A] text-white' : 'border-[#ECEEF1] bg-white text-[#17181A]'
            }`}
          >
            <span className="block text-[13px] font-bold">{p.label}</span>
            {p.hint && <span className={`text-[10.5px] tabular-nums ${pattern === p.key ? 'text-white/60' : 'text-[#9CA3AF]'}`}>{p.hint}</span>}
          </button>
        ))}
      </div>

      {/* категория */}
      <p className={`${CAPS} mt-5`}>Премиум-категория</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {cats.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(category === c.key ? 'all' : c.key)}
            aria-pressed={category === c.key}
            className={`press flex flex-col items-center gap-1 rounded-[14px] border p-2.5 text-center ${
              category === c.key ? 'border-[#C99B2F] bg-[#FFF9EC]' : 'border-[#ECEEF1] bg-white'
            }`}
          >
            <c.icon className="size-4.5" style={{ color: category === c.key ? '#C99B2F' : '#9CA3AF' }} aria-hidden />
            <span className="text-[11px] font-bold text-[#17181A]">{c.label}</span>
            <span className="text-[9px] leading-tight text-[#9CA3AF]">{c.desc}</span>
          </button>
        ))}
      </div>

      {/* цена */}
      <p className={`${CAPS} mt-5`}>Цена</p>
      <div className="mt-1.5 flex items-baseline justify-between text-[12px] text-[#6B7280]">
        <span>От {fmtMoney(priceLo)}</span>
        <span>До {fmtMoney(priceHi)}</span>
      </div>
      <PriceRange min={10000} max={5_000_000} lo={priceLo} hi={priceHi} onLo={setPriceLo} onHi={setPriceHi} />

      {/* результаты */}
      <div className="mt-4 rounded-[16px] bg-white p-3.5 text-center shadow-[0_2px_10px_rgba(23,24,26,0.05)]">
        <p className="text-[13px] text-[#6B7280]">
          Подходит <span className="font-bold text-[#17181A]">{filtered.length}</span> из {items.length} номеров
        </p>
      </div>

      <button
        type="button"
        onClick={onApply}
        className="press mt-3 flex h-12 w-full items-center justify-center rounded-[16px] text-[15px] font-semibold text-white"
        style={{ background: GREEN, boxShadow: '0 8px 20px rgba(18,137,75,0.28)' }}
      >
        Показать {filtered.length} {plural(filtered.length)}
      </button>

      {regionSheet && <RegionSheetEmbedded query={regionQuery} setQuery={setRegionQuery} regionCode={regionCode} onPick={(c) => setRegionCode(c)} onClose={closeRegionSheet} />}
    </div>
  )
}

function plural(n: number): string {
  const d = n % 10
  if (n % 100 >= 11 && n % 100 <= 14) return 'номеров'
  if (d === 1) return 'номер'
  if (d >= 2 && d <= 4) return 'номера'
  return 'номеров'
}

function RegionSheetEmbedded({
  query,
  setQuery,
  regionCode,
  onPick,
  onClose,
}: {
  query: string
  setQuery: (q: string) => void
  regionCode: string | null
  onPick: (code: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Выбор региона">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/25 os-fade" onClick={onClose} />
      <div className="relative rounded-t-[24px] bg-white pb-[calc(14px+env(safe-area-inset-bottom))] os-sheet-rise">
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-[#E1E4E8]" aria-hidden />
        <div className="flex items-center justify-between px-5 pb-2 pt-3.5">
          <h2 className="text-[16px] font-bold text-[#17181A]">Регион</h2>
          <button
            type="button"
            onClick={() => {
              onPick(null)
              onClose()
            }}
            className="press text-[13px] font-semibold text-[#12894B]"
          >
            Все регионы
          </button>
        </div>
        <div className="px-5 pb-2">
          <div className="flex h-10 items-center gap-2 rounded-full bg-[#ECEEF1] px-3.5">
            <Search className="size-4 text-[#9CA3AF]" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти регион…"
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[#9CA3AF]"
            />
          </div>
        </div>
        <div className="grid max-h-[380px] grid-cols-3 gap-2 overflow-y-auto px-5 pb-2 [scrollbar-width:thin]">
          {RF_SUBJECTS.filter((s) => !query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase())).flatMap((s) =>
            s.plateCodes.slice(0, 2).map((code) => (
              <button
                key={`${s.name}-${code}`}
                type="button"
                onClick={() => {
                  onPick(code)
                  onClose()
                }}
                className={`press rounded-[14px] border p-2.5 text-center ${
                  regionCode === code ? 'border-[#17181A] bg-white shadow-[0_2px_10px_rgba(23,24,26,0.08)]' : 'border-[#ECEEF1] bg-[#F6F7F9]'
                }`}
              >
                <span className="block text-[15px] font-extrabold tabular-nums text-[#17181A]">{code}</span>
                <span className="mt-0.5 block truncate text-[10px] text-[#9CA3AF]">{s.name}</span>
              </button>
            )),
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── вкладка «Розыгрыш» ─────────────────────────

function RaffleScreen({
  spinning,
  offer,
  reel,
  buying,
  onSpin,
  onBuy,
  onAgain,
}: {
  spinning: boolean
  offer: PlateOfferDTO | null
  reel: PlateOfferDTO | null
  buying: boolean
  onSpin: () => void
  onBuy: () => void
  onAgain: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 pb-6 pt-1 [scrollbar-width:thin]">
      <div className="text-center">
        <h2 className="text-[19px] font-bold text-[#17181A]">Розыгрыш номера</h2>
        <p className="mx-auto mt-1 max-w-[280px] text-[12.5px] leading-relaxed text-[#9CA3AF]">
          Испытайте удачу и получите эксклюзивный номер из премиум-базы
        </p>
      </div>

      {/* карусель знаков */}
      <div className="relative mx-auto mt-4 flex h-[300px] w-full max-w-[340px] flex-col items-center justify-center overflow-hidden rounded-[24px] bg-gradient-to-b from-white via-[#FBF7EC] to-white shadow-[0_10px_34px_rgba(201,155,47,0.18)]">
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(232,196,106,0.5) 0%, rgba(232,196,106,0.16) 45%, transparent 70%)' }}
        />
        {/* верхний — размытый */}
        {reel && (
          <div className="mb-2 scale-[0.72] opacity-45 blur-[2.5px] transition-all duration-200">
            <GostPlate first={reel.first} digits={reel.digits} letters={reel.letters} regionCode={reel.regionCode} rarity={reel.rarity} size="sm" glow={false} />
          </div>
        )}
        {/* центральный */}
        <div className={`transition-transform duration-200 ${spinning ? 'scale-[0.98]' : 'scale-100'}`}>
          {reel ? (
            <GostPlate first={reel.first} digits={reel.digits} letters={reel.letters} regionCode={reel.regionCode} rarity={reel.rarity} size="lg" />
          ) : (
            <span className="flex h-[92px] items-center text-[13px] text-[#C4C8CE]">Номер появится здесь</span>
          )}
        </div>
        {/* нижний — размытый */}
        {reel && (
          <div className="mt-2 scale-[0.72] opacity-45 blur-[2.5px] transition-all duration-200">
            <GostPlate first={reel.letters[0]} digits={`${reel.digits[2]}${reel.digits[0]}${reel.digits[1]}`} letters={`${reel.letters[1]}${reel.first}`} regionCode={reel.regionCode} rarity={reel.rarity} size="sm" glow={false} />
          </div>
        )}
        {/* стрелки */}
        <span className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#374151] shadow-md" aria-hidden>
          <ChevronLeft className="size-5" />
        </span>
        <span className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#374151] shadow-md" aria-hidden>
          <ChevronRight className="size-5" />
        </span>
      </div>

      {/* точки */}
      <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((d) => (
          <span key={d} className={`size-1.5 rounded-full ${d === 2 ? 'w-4 bg-[#C99B2F]' : 'bg-[#E1E4E8]'} transition-all duration-300`} />
        ))}
      </div>

      {/* результат оффера */}
      {offer && !spinning && (
        <div className={`${CARD} screen-enter mx-auto mt-3 w-full max-w-[340px] p-4 text-center`}>
          <p className="text-[12px] text-[#9CA3AF]">Выпал номер</p>
          <p className="mt-0.5 text-[17px] font-extrabold text-[#17181A]">
            {offer.first} {offer.digits} {offer.letters} · {offer.regionCode}
          </p>
          <div className="mt-1.5 flex items-center justify-center gap-1.5">
            <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-semibold text-[#B45309]">{RARITY_LABEL[offer.rarity]}</span>
            <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#6B7280]">Красота {offer.beautyScore}</span>
          </div>
          <p className="mt-2 text-[18px] font-extrabold text-[#17181A]">Выкуп за {fmtMoney(offer.price)}</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onAgain}
              className="press flex h-11 items-center justify-center rounded-[14px] bg-[#F3F4F6] text-[13.5px] font-semibold text-[#374151]"
            >
              Ещё раз
            </button>
            <button
              type="button"
              onClick={onBuy}
              disabled={buying}
              className="press flex h-11 items-center justify-center rounded-[14px] text-[13.5px] font-semibold text-white disabled:opacity-60"
              style={{ background: GREEN }}
            >
              {buying ? 'Покупаем…' : 'Выкупить'}
            </button>
          </div>
        </div>
      )}

      {/* фичи */}
      <div className="mx-auto mt-4 grid w-full max-w-[380px] grid-cols-3 gap-2">
        {[
          { icon: ZapIcon, label: 'Премиум-база редких номеров' },
          { icon: ShieldIcon, label: 'Честный алгоритм' },
          { icon: GemIcon, label: 'Возможность VIP-номеров' },
        ].map((f) => (
          <div key={f.label} className={`${CARD} flex flex-col items-center gap-1.5 p-3 text-center`}>
            <f.icon />
            <span className="text-[10px] leading-tight text-[#6B7280]">{f.label}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      {!offer && (
        <div className="sticky bottom-0 mt-4 pb-2">
          <button
            type="button"
            onClick={onSpin}
            disabled={spinning}
            className="press flex h-14 w-full flex-col items-center justify-center rounded-[18px] text-white disabled:opacity-70"
            style={{ background: 'linear-gradient(180deg,#E8C46A 0%,#C99B2F 55%,#B8860B 100%)', boxShadow: '0 12px 28px rgba(201,155,47,0.45)' }}
          >
            <span className="flex items-center gap-2 text-[15px] font-bold">
              <Dices className="size-5" aria-hidden />
              {spinning ? 'Крутим…' : 'Крутить номер'}
            </span>
            <span className="text-[10.5px] font-medium text-white/85">Попытка бесплатна · выкуп по редкости</span>
          </button>
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-[10.5px] text-[#9CA3AF]">
            Возможные номера из всех регионов РФ
            <Eye className="size-3" aria-hidden />
          </p>
        </div>
      )}
    </div>
  )
}

function ZapIcon() {
  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-[#FFF4D6] text-[#C99B2F]" aria-hidden>
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
        <path d="M13 2 4.5 13.5H11L9.8 22 19 9.8h-6.6L13 2Z" />
      </svg>
    </span>
  )
}
function ShieldIcon() {
  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-[#EAF7F0] text-[#12894B]" aria-hidden>
      <ShieldCheck className="size-4" aria-hidden />
    </span>
  )
}
function GemIcon() {
  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-[#F1ECFE] text-[#7C5CD6]" aria-hidden>
      <Gem className="size-4" aria-hidden />
    </span>
  )
}

// ───────────────────────── экран детали ─────────────────────────

function DetailScreen({
  item,
  faved,
  buying,
  onFav,
  onBuy,
  onBack,
}: {
  item: PlateMarketItemDTO
  faved: boolean
  buying: boolean
  onFav: () => void
  onBuy: () => void
  onBack: () => void
}) {
  const rows = [
    { icon: MapPin, label: 'Регион', value: `${item.regionCode} — ${item.regionName}` },
    { icon: HashIcon, label: 'Серия', value: `${item.first} · ${item.digits} · ${item.letters}` },
    { icon: Gem, label: 'Категория', value: item.category === 'vip' ? 'VIP' : item.category === 'elite' ? 'Элита' : item.category === 'top' ? 'ТОП' : 'Обычная' },
    { icon: Check, label: 'Статус', value: 'Свободен', dot: '#12894B' },
    { icon: BarChart3, label: 'Редкость', value: RARITY_LABEL[item.rarity] },
    { icon: EyeIcon, label: 'Описание', value: `${item.trait}. Красота знака ${item.beautyScore}/100` },
  ]
  return (
    <div className="h-full min-h-0 overflow-y-auto pb-28 [scrollbar-width:thin]">
      <header className="flex items-center justify-between px-2 pt-1">
        <button type="button" onClick={onBack} aria-label="Назад" className="press flex size-10 items-center justify-center rounded-full text-[#17181A]">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onFav}
            aria-label={faved ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={faved}
            className="press flex size-10 items-center justify-center rounded-full text-[#17181A]"
          >
            <Heart className="size-5" style={{ color: faved ? '#E4573D' : undefined, fill: faved ? '#E4573D' : 'transparent' }} aria-hidden />
          </button>
        </div>
      </header>

      {/* большой знак */}
      <div className="mx-4 mt-1 flex h-[190px] items-center justify-center rounded-[22px] bg-gradient-to-b from-[#F1F2F4] via-[#E8EAED] to-[#F1F2F4]">
        <GostPlate first={item.first} digits={item.digits} letters={item.letters} regionCode={item.regionCode} rarity={item.rarity} size="lg" />
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden>
        <span className="h-1.5 w-4 rounded-full bg-[#17181A]" />
        <span className="size-1.5 rounded-full bg-[#E1E4E8]" />
        <span className="size-1.5 rounded-full bg-[#E1E4E8]" />
      </div>

      {/* шапка */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2">
          <h1 className="text-[24px] font-extrabold tracking-tight text-[#17181A]">
            {item.first}
            {item.digits}
            {item.letters} {item.regionCode}
          </h1>
          <CategoryBadge category={item.category} />
        </div>
        <p className="mt-0.5 text-[22px] font-extrabold text-[#17181A]">{fmtMoney(item.price)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="flex items-center gap-1 rounded-full bg-[#FFF9EC] px-2.5 py-1 text-[11.5px] font-semibold text-[#B45309]">
            <Crown className="size-3.5" aria-hidden />
            {item.trait}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[11.5px] font-semibold text-[#6B7280]">
            <BarChart3 className="size-3.5" aria-hidden />
            {RARITY_LABEL[item.rarity]}
          </span>
        </div>

        {/* характеристики */}
        <div className={`${CARD} mt-3.5 divide-y divide-[#F0F1F3] px-4`}>
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 py-3">
              <r.icon className="size-4.5 shrink-0 text-[#9CA3AF]" aria-hidden />
              <span className="w-[92px] shrink-0 text-[12.5px] text-[#9CA3AF]">{r.label}</span>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right text-[13px] font-semibold text-[#17181A]">
                <span className="truncate">{r.value}</span>
                {r.dot && <span className="size-2 shrink-0 rounded-full" style={{ background: r.dot }} aria-hidden />}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* покупка */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#F6F7F9] via-[#F6F7F9] to-transparent px-4 pb-4 pt-6">
        <button
          type="button"
          onClick={onBuy}
          disabled={buying}
          className="press flex h-12 w-full items-center justify-center rounded-[16px] text-[15px] font-semibold text-white disabled:opacity-60"
          style={{ background: GREEN, boxShadow: '0 8px 20px rgba(18,137,75,0.28)' }}
        >
          {buying ? 'Покупаем…' : `Купить за ${fmtMoney(item.price)}`}
        </button>
        <button
          type="button"
          onClick={onFav}
          className="press mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-white text-[14px] font-semibold text-[#17181A] shadow-[0_2px_10px_rgba(23,24,26,0.06)]"
        >
          <Heart className="size-4.5" style={{ color: faved ? '#E4573D' : '#374151', fill: faved ? '#E4573D' : 'transparent' }} aria-hidden />
          {faved ? 'В избранном' : 'Добавить в избранное'}
        </button>
      </div>
    </div>
  )
}

function HashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className ?? 'size-4.5'}>
      <path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function EyeIcon({ className }: { className?: string }) {
  return <Eye className={className ?? 'size-4.5'} aria-hidden />
}

// ───────────────────────── вкладка «Профиль» ─────────────────────────

function ProfileTab({
  mine,
  balance,
  onMain,
  onRelease,
}: {
  mine: CarPlateDTO[]
  balance: number
  onMain: (p: CarPlateDTO) => void
  onRelease: (p: CarPlateDTO) => void
}) {
  const session = useOS((s) => s.session)
  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 pb-6 pt-1 [scrollbar-width:thin]">
      <div className={`${CARD} flex items-center gap-3.5 p-5`}>
        <span className="flex size-14 items-center justify-center rounded-full text-[18px] font-bold text-white" style={{ background: 'linear-gradient(145deg,#D4A017,#B8860B)' }}>
          {(session?.displayName ?? 'И').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-bold text-[#17181A]">{session?.displayName ?? 'Игрок'}</h2>
          <p className="text-[12.5px] text-[#9CA3AF]">Баланс: {fmtMoney(balance)}</p>
        </div>
        <span className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-[12.5px] font-bold text-[#374151]">{mine.length} шт.</span>
      </div>

      <p className={`${CAPS} mt-4`}>Мои номера</p>
      {mine.length === 0 ? (
        <div className="mt-2.5 flex flex-col items-center gap-2 rounded-[20px] bg-white p-6 text-center shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
          <Dices className="size-7 text-[#C4C8CE]" aria-hidden />
          <p className="text-[13.5px] font-semibold text-[#17181A]">Номеров пока нет</p>
          <p className="text-[12px] text-[#9CA3AF]">Крутите в разделе «Разыграть» или выберите из витрины.</p>
        </div>
      ) : (
        <div className="mt-2.5 space-y-2.5">
          {mine.map((p) => (
            <div key={p.id} className={`${CARD} p-4`}>
              <div className="flex items-center gap-3">
                <GostPlate first={p.first} digits={p.digits} letters={p.letters} regionCode={p.regionCode} rarity={p.rarity} size="sm" />
                <div className="min-w-0 flex-1">
                  {p.isMain ? (
                    <span className="rounded-full bg-[#EAF7F0] px-2 py-0.5 text-[10px] font-bold text-[#12894B]">Основной</span>
                  ) : (
                    <span className="text-[12px] text-[#9CA3AF]">{RARITY_LABEL[p.rarity]}</span>
                  )}
                  <p className="text-[12px] text-[#9CA3AF]">Красота {p.beautyScore}</p>
                </div>
              </div>
              <div className="mt-2.5 flex gap-2">
                {!p.isMain && (
                  <button type="button" onClick={() => onMain(p)} className="press h-9 flex-1 rounded-full bg-[#F3F4F6] text-[12.5px] font-semibold text-[#374151]">
                    Сделать основным
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRelease(p)}
                  className="press flex h-9 items-center justify-center gap-1.5 rounded-full bg-[#FDEEEE] px-3 text-[12.5px] font-semibold text-[#C43D2E]"
                  aria-label={`Сдать номер ${p.plate}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Сдать
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
