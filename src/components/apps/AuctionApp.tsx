'use client'

// Приложение «Аукцион» — Resale Dark: графит #050D09 + золото #F5B60A (по макету юзера).
// Композиция: шапка с поиском и колокольчиком, чипы, featured «живой» лот с красной
// точкой «Сейчас идёт», сетка лотов 2 колонки, детали лота с каунтдауном ЧЧ:ММ:СС
// и bottom-sheet ставки с быстрыми шагами и сводкой.
// Бизнес-логика (ставки, автоставка, история торгов, realtime, антиснайпинг) — без изменений.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  ArrowLeft, ArrowRight, Bell, Bot, Crown, Gavel, Heart, History, Loader2, Minus, Plus, Search, SearchX, Timer, Trophy, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { getSocket } from '@/lib/use-realtime'
import { CATEGORY_LABEL, CONDITION_LABEL } from '@/lib/catalog-types'
import type { AuctionData, AuctionLotDTO } from '@/lib/types'

const GOLD = '#F5B60A'
const GOLD_TEXT = '#3B2A02'

// Тик раз в секунду через useSyncExternalStore — таймеры лотов живые, без setState внутри эффектов
function useTick(intervalMs = 1000): number {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, intervalMs)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / intervalMs),
    () => 0,
  )
}

function bidStep(lot: AuctionLotDTO): number {
  return Math.max(100, Math.round((lot.currentBid ?? lot.startPrice) * 0.02))
}

function minBid(lot: AuctionLotDTO): number {
  return (lot.currentBid ?? lot.startPrice) + bidStep(lot)
}

function fmtTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}ч ${m}м ${String(ss).padStart(2, '0')}с`
  if (m > 0) return `${m}м ${String(ss).padStart(2, '0')}с`
  return `${ss} с`
}

// ЧЧ / ММ / СС для крупного каунтдауна в деталях лота
function timeParts(ms: number): { h: number; m: number; s: number } {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

function conditionClass(c: string): string {
  switch (c) {
    case 'new': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    case 'excellent': return 'bg-lime-500/15 text-lime-300 border-lime-500/30'
    case 'good': return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    case 'used': return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    case 'parts': return 'bg-red-500/15 text-red-300 border-red-500/30'
    default: return 'bg-white/10 text-white/60 border-white/15'
  }
}

function ConditionBadge({ value }: { value: string }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur ' +
        conditionClass(value)
      }
    >
      {CONDITION_LABEL[value] ?? value}
    </span>
  )
}

// Красное сердечко при лайке (лайки — сессионные, только визуал)
function HeartBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex size-9 items-center justify-center rounded-full bg-black/45 backdrop-blur transition active:scale-90"
    >
      <Heart className={'size-4 ' + (active ? 'fill-red-500 text-red-500' : 'text-white/85')} aria-hidden />
    </button>
  )
}

interface BidRow {
  id: string
  userName: string
  amount: number
  createdAt: string
  isMe: boolean
}

type LotFilter = 'all' | 'leading' | 'ending' | 'won' | 'ended' | 'fav'

const FILTERS: { key: LotFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'leading', label: 'Мои ставки' },
  { key: 'ending', label: 'Скоро финал' },
  { key: 'won', label: 'Победы' },
  { key: 'ended', label: 'Завершённые' },
  { key: 'fav', label: 'Избранное' },
]

const QUICK_STEPS = [500, 1000, 2500]

export default function AuctionApp() {
  const session = useOS((s) => s.session)
  const [data, setData] = useState<AuctionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<LotFilter>('all')
  const [openBid, setOpenBid] = useState<string | null>(null)
  const [bidInput, setBidInput] = useState('')
  const [bidError, setBidError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // автоставка (прокси-ставка): режим панели и ввод потолка
  const [bidMode, setBidMode] = useState<'manual' | 'auto'>('manual')
  const [autoInput, setAutoInput] = useState('')
  const [autoBusy, setAutoBusy] = useState(false)
  // история ставок
  const [openHist, setOpenHist] = useState<string | null>(null)
  const [histBids, setHistBids] = useState<Record<string, BidRow[]>>({})
  const [histLoading, setHistLoading] = useState(false)
  // лот, у которого только что продлили таймер (антиснайпинг)
  const [extendedLot, setExtendedLot] = useState<string | null>(null)
  const [liveBids, setLiveBids] = useState(0)
  // детали лота + поиск + избранное (клиентские, поверх существующих данных)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [favs, setFavs] = useState<Set<string>>(() => new Set())

  useTick(1000) // живые таймеры лотов

  const load = useCallback(async (silent = false) => {
    try {
      const d = await api.auction()
      setData(d)
      setError(null)
    } catch (e) {
      if (!silent) setError(e instanceof ApiError ? e.message : 'Не удалось загрузить аукцион')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refreshHist = useCallback(async (lotId: string) => {
    try {
      const res = await api.auctionBids(lotId)
      setHistBids((prev) => ({ ...prev, [lotId]: res.bids }))
    } catch {
      /* не критично */
    }
  }, [])

  // Тихий refetch каждые 10 секунд — боты торгуются живьём
  useEffect(() => {
    const id = setInterval(() => {
      void load(true)
      if (openHist) void refreshHist(openHist)
    }, 10000)
    return () => clearInterval(id)
  }, [load, openHist, refreshHist])

  // realtime: чужая ставка прилетает мгновенно, без ожидания поллинга
  useEffect(() => {
    let tries = 0
    let retry: ReturnType<typeof setTimeout> | null = null
    let detach: (() => void) | null = null
    const attach = () => {
      const sock = getSocket()
      if (!sock) {
        if (tries++ < 20) retry = setTimeout(attach, 1000)
        return
      }
      const onUpdate = (p: { lotId?: string; extended?: boolean }) => {
        void load(true)
        if (p.lotId && openHist === p.lotId) void refreshHist(p.lotId)
        setLiveBids((n) => n + 1)
        if (p.extended && p.lotId) {
          setExtendedLot(p.lotId)
          setTimeout(() => setExtendedLot((cur) => (cur === p.lotId ? null : cur)), 9000)
        }
      }
      sock.on('auction:update', onUpdate)
      detach = () => { sock.off('auction:update', onUpdate) }
    }
    attach()
    return () => {
      if (retry) clearTimeout(retry)
      if (detach) detach()
    }
  }, [load, openHist, refreshHist])

  const openPanel = (lot: AuctionLotDTO, mode: 'manual' | 'auto' = 'manual') => {
    setOpenBid(lot.id)
    setBidMode(mode)
    if (mode === 'auto') setAutoInput(lot.myAutoBid > 0 ? String(lot.myAutoBid) : String(minBid(lot)))
    else setBidInput(String(minBid(lot)))
    setBidError(null)
  }

  const closePanel = () => {
    setOpenBid(null)
    setBidError(null)
  }

  const toggleHist = async (lotId: string) => {
    if (openHist === lotId) {
      setOpenHist(null)
      return
    }
    setOpenHist(lotId)
    if (!histBids[lotId]) {
      setHistLoading(true)
      try {
        const res = await api.auctionBids(lotId)
        setHistBids((prev) => ({ ...prev, [lotId]: res.bids }))
      } catch {
        setHistBids((prev) => ({ ...prev, [lotId]: [] }))
      } finally {
        setHistLoading(false)
      }
    }
  }

  const placeBid = async (lot: AuctionLotDTO) => {
    const amount = Math.floor(Number(bidInput.replace(/[^\d]/g, '')) || 0)
    const min = minBid(lot)
    if (amount < min) {
      setBidError(`Минимальная ставка — ${fmtMoney(min)}`)
      return
    }
    setBusy(true)
    setBidError(null)
    try {
      const res = await api.auctionBid(lot.id, amount)
      const os = useOS.getState()
      os.refreshSession({ balance: res.balance })
      os.pushToast('Аукцион', 'Ставка принята')
      closePanel()
      await load()
    } catch (e) {
      setBidError(e instanceof ApiError ? e.message : 'Не удалось сделать ставку')
    } finally {
      setBusy(false)
    }
  }

  const placeAutoBid = async (lot: AuctionLotDTO) => {
    const maxAmount = Math.floor(Number(autoInput.replace(/[^\d]/g, '')) || 0)
    const min = minBid(lot)
    if (maxAmount < min) {
      setBidError(`Потолок не может быть ниже минимальной ставки — ${fmtMoney(min)}`)
      return
    }
    setAutoBusy(true)
    setBidError(null)
    try {
      const res = await api.auctionAutoBid(lot.id, maxAmount)
      const os = useOS.getState()
      os.refreshSession({ balance: res.balance })
      os.pushToast('Автоставка', res.fired ? `Сработала сразу: ставка ${fmtMoney(res.maxAmount)} или ниже` : `Потолок ${fmtMoney(res.maxAmount)} установлен`)
      closePanel()
      await load()
    } catch (e) {
      setBidError(e instanceof ApiError ? e.message : 'Не удалось включить автоставку')
    } finally {
      setAutoBusy(false)
    }
  }

  const cancelAutoBid = async (lot: AuctionLotDTO) => {
    setAutoBusy(true)
    try {
      await api.auctionAutoBidCancel(lot.id)
      useOS.getState().pushToast('Автоставка', 'Отменена — ваша ставка-лидер сохранена')
      closePanel()
      await load()
    } catch {
      setBidError('Не удалось отменить автоставку')
    } finally {
      setAutoBusy(false)
    }
  }

  const toggleFav = (lotId: string) => {
    setFavs((prev) => {
      const next = new Set(prev)
      if (next.has(lotId)) next.delete(lotId)
      else next.add(lotId)
      return next
    })
  }

  // Колокольчик: сводка по финалам из уже загруженных данных
  const notifyEnding = () => {
    const n = (data?.lots ?? []).filter((l) => {
      const r = new Date(l.endsAt).getTime() - Date.now()
      return r > 0 && r < 300_000
    }).length
    const os = useOS.getState()
    os.pushToast('Аукцион', n > 0 ? `Скоро финал: ${n} ${plural(n, 'лот', 'лота', 'лотов')} — успейте сделать ставку` : 'В ближайшие 5 минут финалов нет')
  }

  const nowMs = Date.now()
  const lots = data?.lots ?? []
  // Активные лоты первыми, внутри — по времени окончания
  const sorted = [...lots].sort((a, b) => {
    const aEnd = new Date(a.endsAt).getTime()
    const bEnd = new Date(b.endsAt).getTime()
    const aActive = aEnd > nowMs ? 0 : 1
    const bActive = bEnd > nowMs ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return aEnd - bEnd
  })
  const q = query.trim().toLowerCase()
  const filtered = sorted.filter((lot) => {
    if (q && !lot.title.toLowerCase().includes(q)) return false
    const ended = new Date(lot.endsAt).getTime() <= nowMs
    if (filter === 'ended') return ended
    if (filter === 'leading') return !ended && lot.myBid > 0 && lot.currentBidderName != null && lot.isMine
    if (filter === 'ending') return !ended && new Date(lot.endsAt).getTime() - nowMs < 300_000
    if (filter === 'won') return ended && lot.isMine
    if (filter === 'fav') return favs.has(lot.id)
    return true
  })
  // featured «живой» лот: ближайший к финалу активный лот
  const featured = filter === 'all' && !q ? sorted.find((l) => new Date(l.endsAt).getTime() > nowMs) ?? null : null
  const featuredRemain = featured ? new Date(featured.endsAt).getTime() - nowMs : 0

  const biddingLot = openBid ? sorted.find((l) => l.id === openBid) ?? null : null
  const detailLot = detailId ? sorted.find((l) => l.id === detailId) ?? null : null
  const bidAmount = Math.floor(Number(bidInput.replace(/[^\d]/g, '')) || 0)
  const autoAmount = Math.floor(Number(autoInput.replace(/[^\d]/g, '')) || 0)

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden text-white"
      style={{ background: 'linear-gradient(180deg, #07130D 0%, #050D09 100%)' }}
    >
      {/* ---------- Шапка: молоток в золотом квадратике + поиск + колокольчик ---------- */}
      <div className="relative z-10 shrink-0 border-b border-white/[0.06] bg-[#050D09]/95 px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/15">
            <Gavel className="size-5 text-amber-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold text-white">Аукцион</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/50">
              <span className="relative flex size-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
              </span>
              {liveBids > 0 ? `Торги живьём · +${liveBids} ставок` : 'Ставки приходят в реальном времени'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            aria-label={showSearch ? 'Скрыть поиск' : 'Поиск по лотам'}
            aria-expanded={showSearch}
            className={
              'flex size-10 shrink-0 items-center justify-center rounded-xl transition active:scale-95 ' +
              (showSearch ? 'bg-amber-400/15 text-amber-400' : 'bg-white/[0.06] text-white/70')
            }
          >
            <Search className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={notifyEnding}
            aria-label="Финалы в ближайшие 5 минут"
            className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 transition active:scale-95"
          >
            <Bell className="size-5" aria-hidden />
            {(data?.lots ?? []).some((l) => {
              const r = new Date(l.endsAt).getTime() - nowMs
              return r > 0 && r < 300_000
            }) && (
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-400" aria-hidden />
            )}
          </button>
        </div>

        {showSearch && (
          <div className="relative mt-3">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по лотам"
              aria-label="Поиск по лотам"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-9 text-[13px] text-white placeholder:text-white/40 outline-none focus:border-amber-400/50"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Очистить поиск"
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white/50 transition active:scale-90"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/70">
            Активных: {data?.activeCount ?? 0}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
            <Trophy className="size-3" aria-hidden /> Побед: {data?.wonCount ?? 0}
          </span>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/50">
            Ставка резервирует деньги
          </span>
        </div>
      </div>

      {/* ---------- Контент ---------- */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-48 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-52 animate-pulse rounded-xl bg-white/[0.06]" />
              <div className="h-52 animate-pulse rounded-xl bg-white/[0.06]" />
            </div>
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex h-11 items-center rounded-2xl px-6 text-sm font-bold transition active:scale-95"
              style={{ backgroundColor: GOLD, color: GOLD_TEXT }}
            >
              Повторить
            </button>
          </div>
        ) : data && detailLot ? (
          <>
            {/* ---------- ДЕТАЛИ ЛОТА ---------- */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDetailId(null)}
                aria-label="Назад к лотам"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/80 transition active:scale-95"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </button>
              <div className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">Детали лота</div>
              <HeartBtn
                active={favs.has(detailLot.id)}
                onClick={() => toggleFav(detailLot.id)}
                label={favs.has(detailLot.id) ? `Убрать ${detailLot.title} из избранного` : `В избранное: ${detailLot.title}`}
              />
            </div>

            {/* фото (в DTO одно изображение — карусель со счётчиком 1/1) */}
            <div className="relative shrink-0 overflow-hidden rounded-2xl border border-white/[0.08]">
              <img src={detailLot.image} alt={detailLot.title} className="aspect-[4/3] w-full object-cover" />
              <div className="absolute left-3 top-3">
                <ConditionBadge value={detailLot.condition} />
              </div>
              <span
                className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white backdrop-blur"
                aria-label="Фото 1 из 1"
              >
                1/1
              </span>
              {new Date(detailLot.endsAt).getTime() <= nowMs && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-bold text-white/85">
                  Аукцион завершён
                </div>
              )}
            </div>

            {/* название + чипы */}
            <div>
              <div className="text-[20px] font-bold leading-tight text-white">{detailLot.title}</div>
              <div className="mt-1 text-[12px] text-white/50">
                {CATEGORY_LABEL[detailLot.category] ?? detailLot.category} · Рынок: {fmtMoney(detailLot.baseValue)} · Старт: {fmtMoney(detailLot.startPrice)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/70">
                  {CATEGORY_LABEL[detailLot.category] ?? detailLot.category}
                </span>
                {detailLot.isMine && detailLot.currentBidderName != null && new Date(detailLot.endsAt).getTime() > nowMs && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-amber-950">
                    <Crown className="size-3" aria-hidden /> Вы лидер
                  </span>
                )}
                {extendedLot === detailLot.id && (
                  <span className="animate-pulse rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-300">
                    Финал: таймер продлён
                  </span>
                )}
                {detailLot.myAutoBid > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    <Bot className="size-3" aria-hidden /> Автоставка до {fmtMoney(detailLot.myAutoBid)}
                  </span>
                )}
              </div>
            </div>

            {/* каунтдаун ЧЧ:ММ:СС */}
            <div className="rounded-2xl border border-amber-400/20 bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-white/50">До завершения</span>
                {new Date(detailLot.endsAt).getTime() - nowMs > 0 && new Date(detailLot.endsAt).getTime() - nowMs < 60_000 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-300">
                    <span className="relative flex size-1.5" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                    </span>
                    Финальная минута
                  </span>
                )}
              </div>
              {new Date(detailLot.endsAt).getTime() <= nowMs ? (
                <div className="mt-2 text-[20px] font-bold text-white/50">Аукцион завершён</div>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {(() => {
                    const p = timeParts(new Date(detailLot.endsAt).getTime() - nowMs)
                    return ([
                      [p.h, 'Часы'],
                      [p.m, 'Минуты'],
                      [p.s, 'Секунды'],
                    ] as const).map(([v, label]) => (
                      <div key={label}>
                        <div className="text-[28px] font-bold tabular-nums leading-none text-amber-300">
                          {String(v).padStart(2, '0')}
                        </div>
                        <div className="mt-1 text-[10px] text-white/40">{label}</div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>

            {/* текущая и следующая ставка */}
            <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-white/40">Текущая ставка</div>
                  {detailLot.currentBid != null ? (
                    <>
                      <div className="mt-0.5 text-[24px] font-bold tabular-nums text-amber-300">{fmtMoney(detailLot.currentBid)}</div>
                      <div className="truncate text-[11px] text-white/50">Лидер: {detailLot.currentBidderName ?? '—'}</div>
                    </>
                  ) : (
                    <div className="mt-0.5 text-[18px] font-semibold text-white/50">Ставок нет</div>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/70">
                  {detailLot.bidCount} {plural(detailLot.bidCount, 'ставка', 'ставки', 'ставок')}
                </span>
              </div>
              <div className="mt-3 border-t border-white/[0.08] pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-white/50">Следующая ставка</span>
                  <span className="text-[14px] font-bold tabular-nums text-white">{fmtMoney(minBid(detailLot))}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[12px] text-white/50">Минимальный шаг</span>
                  <span className="text-[12px] tabular-nums text-white/50">+{fmtMoney(bidStep(detailLot))}</span>
                </div>
                {detailLot.myBid > 0 && (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[12px] text-emerald-300">Ваша ставка</span>
                    <span className="text-[12px] font-semibold tabular-nums text-emerald-300">{fmtMoney(detailLot.myBid)}</span>
                  </div>
                )}
              </div>
              {new Date(detailLot.endsAt).getTime() > nowMs && (
                <div className="mt-3.5 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => openPanel(detailLot, 'manual')}
                    className="h-12 w-full rounded-2xl text-[15px] font-bold transition active:scale-[0.98]"
                    style={{ backgroundColor: GOLD, color: GOLD_TEXT }}
                  >
                    Сделать ставку
                  </button>
                  <button
                    type="button"
                    onClick={() => openPanel(detailLot, 'auto')}
                    aria-label={detailLot.myAutoBid > 0 ? `Изменить автоставку для лота ${detailLot.title}` : `Включить автоставку для лота ${detailLot.title}`}
                    className={
                      'flex h-12 w-12 items-center justify-center rounded-2xl border transition active:scale-95 ' +
                      (detailLot.myAutoBid > 0
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/10 bg-white/[0.06] text-white/70')
                    }
                  >
                    <Bot className="size-5" aria-hidden />
                  </button>
                </div>
              )}
            </div>

            {/* история ставок */}
            {detailLot.bidCount > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => void toggleHist(detailLot.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 text-[12px] font-medium text-white/80 transition active:scale-[0.99]"
                  aria-expanded={openHist === detailLot.id}
                >
                  <span className="flex items-center gap-2">
                    <History className="size-4 text-amber-400" aria-hidden />
                    История ставок ({detailLot.bidCount})
                  </span>
                  <span className="text-white/40">{openHist === detailLot.id ? 'скрыть' : 'показать'}</span>
                </button>
                {openHist === detailLot.id && (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.04] p-1 [scrollbar-width:thin]">
                    {histLoading && !histBids[detailLot.id] ? (
                      <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-white/50">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Загружаем торги…
                      </div>
                    ) : (histBids[detailLot.id]?.length ?? 0) === 0 ? (
                      <div className="py-3 text-center text-[11px] text-white/50">Ставок пока не было</div>
                    ) : (
                      <div className="divide-y divide-white/[0.06]">
                        {histBids[detailLot.id]!.map((b, i) => (
                          <div key={b.id} className={'flex items-center gap-2 px-2.5 py-2 text-xs ' + (i === 0 ? 'bg-amber-400/10' : '')}>
                            <span
                              className={
                                'flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ' +
                                (i === 0 ? 'bg-amber-400 text-amber-950' : 'bg-white/10 text-white/50')
                              }
                            >
                              {i + 1}
                            </span>
                            <span className={'min-w-0 flex-1 truncate ' + (b.isMe ? 'font-semibold text-emerald-300' : 'text-white/80')}>
                              {b.userName}
                              {b.isMe && <span className="ml-1 text-[10px] font-normal text-emerald-300/70">(вы)</span>}
                            </span>
                            <span className="shrink-0 text-[10px] text-white/40">{timeAgo(b.createdAt)}</span>
                            <span className={'shrink-0 font-semibold tabular-nums ' + (i === 0 ? 'text-amber-300' : 'text-white/80')}>
                              {fmtMoney(b.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : data ? (
          <>
            {/* ---------- ЧИПЫ КАТЕГОРИЙ ---------- */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={
                    'h-9 shrink-0 rounded-full px-4 text-[13px] transition active:scale-95 ' +
                    (filter === f.key
                      ? 'bg-amber-400 font-semibold text-amber-950'
                      : 'bg-white/[0.06] text-white/70')
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* ---------- FEATURED «ЖИВОЙ» ЛОТ ---------- */}
            {featured && (
              <div className="relative shrink-0 overflow-hidden rounded-2xl border border-amber-400/25 bg-[#0E1F16]">
                <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-300">
                    <span className="relative flex size-1.5" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                    </span>
                    Сейчас идёт
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-black/40 px-2.5 py-1 text-[12px] font-bold tabular-nums text-amber-300">
                    <Timer className="size-3.5" aria-hidden /> {fmtTimer(featuredRemain)}
                  </span>
                </div>

                <div className="relative mt-3">
                  <button
                    type="button"
                    onClick={() => setDetailId(featured.id)}
                    aria-label={`Открыть лот ${featured.title}`}
                    className="block w-full"
                  >
                    <img src={featured.image} alt={featured.title} className="h-44 w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0E1F16] to-transparent" aria-hidden />
                  </button>
                  <div className="absolute right-3 top-3">
                    <HeartBtn
                      active={favs.has(featured.id)}
                      onClick={() => toggleFav(featured.id)}
                      label={favs.has(featured.id) ? `Убрать ${featured.title} из избранного` : `В избранное: ${featured.title}`}
                    />
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3 p-4 pt-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold text-white">{featured.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <ConditionBadge value={featured.condition} />
                      <span className="text-[11px] text-white/50">
                        Рынок: {fmtMoney(featured.baseValue)} · Старт: {fmtMoney(featured.startPrice)}
                      </span>
                    </div>
                    <div className="mt-2.5 text-[10px] uppercase tracking-widest text-white/40">Текущая ставка</div>
                    <div className="mt-0.5 text-[22px] font-bold tabular-nums text-amber-300">
                      {featured.currentBid != null ? fmtMoney(featured.currentBid) : 'Ставок нет'}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-white/50">
                      {featured.bidCount > 0
                        ? `${featured.bidCount} ${plural(featured.bidCount, 'ставка', 'ставки', 'ставок')}${featured.currentBidderName ? ` · Лидер: ${featured.currentBidderName}` : ''}`
                        : 'Будьте первым — сделайте ставку'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailId(featured.id)}
                    aria-label={`Подробнее о лоте ${featured.title}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                    style={{ backgroundColor: GOLD, color: GOLD_TEXT }}
                  >
                    <ArrowRight className="size-5" aria-hidden />
                  </button>
                </div>
              </div>
            )}

            {/* ---------- СЕТКА ЛОТОВ ---------- */}
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-semibold text-white">Все лоты</div>
              <span className="text-[13px] text-white/40">{filtered.length}</span>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
                <SearchX className="size-8 text-white/25" aria-hidden />
                <div className="mt-2 text-sm font-medium text-white/80">
                  {q ? 'Ничего не найдено' : filter === 'all' ? 'Лотов пока нет' : 'Под фильтр ничего не подошло'}
                </div>
                <div className="mt-1 max-w-60 text-xs leading-relaxed text-white/40">
                  Аукционный дом скоро выставит новую распродажу — заглядывайте позже.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((lot) => {
                  const endMs = new Date(lot.endsAt).getTime()
                  const remainMs = endMs - nowMs
                  const ended = remainMs <= 0
                  const leading = lot.isMine && lot.currentBidderName != null && !ended
                  return (
                    <div
                      key={lot.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailId(lot.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDetailId(lot.id)
                        }
                      }}
                      aria-label={`Открыть лот ${lot.title}`}
                      className="relative shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] transition active:scale-[0.98]"
                    >
                      <div className="relative aspect-square w-full overflow-hidden">
                        <img src={lot.image} alt={lot.title} className="size-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" aria-hidden />
                        {/* таймер-плашка */}
                        <div
                          className={
                            'absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums backdrop-blur ' +
                            (ended
                              ? 'border-white/10 bg-black/60 text-white/60'
                              : remainMs < 60000
                                ? 'animate-pulse border-red-400/40 bg-black/60 text-red-300'
                                : 'border-amber-400/25 bg-black/60 text-amber-300')
                          }
                        >
                          {!ended && (
                            <span className={'size-1.5 rounded-full ' + (remainMs < 60000 ? 'bg-red-400' : 'bg-amber-400')} aria-hidden />
                          )}
                          {ended ? 'Завершён' : fmtTimer(remainMs)}
                        </div>
                        <div className="absolute right-2 top-2">
                          <HeartBtn
                            active={favs.has(lot.id)}
                            onClick={() => toggleFav(lot.id)}
                            label={favs.has(lot.id) ? `Убрать ${lot.title} из избранного` : `В избранное: ${lot.title}`}
                          />
                        </div>
                        {leading && (
                          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                            <Crown className="size-3" aria-hidden /> Вы лидер
                          </span>
                        )}
                        {ended && lot.isMine && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-[#052E16]">
                            <Trophy className="size-3" aria-hidden /> Победа
                          </span>
                        )}
                        {extendedLot === lot.id && (
                          <span className="absolute bottom-2 right-2 animate-pulse rounded-full bg-red-500/30 px-2 py-0.5 text-[9px] font-semibold text-red-100 backdrop-blur">
                            Таймер продлён
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="truncate text-[13px] font-semibold text-white">{lot.title}</div>
                        <div className="mt-1 flex items-baseline justify-between gap-1.5">
                          <span className="text-[15px] font-bold tabular-nums text-amber-300">
                            {fmtMoney(lot.currentBid ?? lot.startPrice)}
                          </span>
                          <span className="shrink-0 text-[10px] text-white/50">
                            {lot.bidCount} {plural(lot.bidCount, 'ставка', 'ставки', 'ставок')}
                          </span>
                        </div>
                        {lot.myBid > 0 && (
                          <div className="mt-0.5 truncate text-[10px] text-emerald-300">
                            Ваша ставка: {fmtMoney(lot.myBid)}
                            {!ended && lot.myAutoBid > 0 ? ` · авто до ${fmtMoney(lot.myAutoBid)}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="pb-2 text-center text-[10px] text-white/30">Аукционный дом · молоток падает, это игра</div>
          </>
        ) : null}
      </div>

      {/* ---------- BOTTOM SHEET: панель ставки ---------- */}
      {biddingLot && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end">
          <button type="button" aria-label="Закрыть панель ставки" onClick={closePanel} className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
          <div className="relative max-h-[88%] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0E1F16] p-4 pb-5 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.6)] [scrollbar-width:thin]">
            {/* ручка */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />

            {/* заголовок лота */}
            <div className="flex items-center gap-3">
              <img src={biddingLot.image} alt={biddingLot.title} className="size-14 shrink-0 rounded-xl border border-white/10 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{biddingLot.title}</div>
                <div className="mt-0.5 text-[11px] text-white/50">
                  Текущая: <span className="font-semibold text-amber-300">{fmtMoney(biddingLot.currentBid ?? biddingLot.startPrice)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Закрыть"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/50 transition active:scale-90"
              >
                <X className="size-4.5" aria-hidden />
              </button>
            </div>

            {/* переключатель режима ставки */}
            <div className="mt-3.5 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.06] p-1">
              {([
                ['manual', 'Ставка вручную'],
                ['auto', 'Автоставка'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => {
                    setBidMode(mode)
                    if (mode === 'auto') setAutoInput(biddingLot.myAutoBid > 0 ? String(biddingLot.myAutoBid) : String(minBid(biddingLot)))
                    else setBidInput(String(minBid(biddingLot)))
                    setBidError(null)
                  }}
                  className={
                    'h-9 rounded-lg text-[11px] font-semibold transition ' +
                    (bidMode === mode ? 'bg-amber-400 text-amber-950' : 'text-white/60')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {bidMode === 'manual' ? (
              <>
                <div className="mt-3 flex items-center justify-between text-[11px] text-white/50">
                  <span>Минимальная ставка</span>
                  <span className="font-semibold tabular-nums text-amber-300">{fmtMoney(minBid(biddingLot))}</span>
                </div>
                {/* инпут-степпер */}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Math.floor(Number(bidInput.replace(/[^\d]/g, '')) || 0)
                      setBidInput(String(Math.max(minBid(biddingLot), cur - bidStep(biddingLot))))
                      setBidError(null)
                    }}
                    aria-label="Уменьшить ставку на минимальный шаг"
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white transition active:scale-95"
                  >
                    <Minus className="size-5" aria-hidden />
                  </button>
                  <input
                    className="h-12 w-full min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-center text-xl font-bold tabular-nums text-white placeholder:text-white/40 outline-none focus:border-amber-400/50"
                    inputMode="numeric"
                    value={bidInput}
                    placeholder={String(minBid(biddingLot))}
                    aria-label={`Ваша ставка для лота ${biddingLot.title}`}
                    onChange={(e) => setBidInput(e.target.value.replace(/[^\d]/g, ''))}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Math.floor(Number(bidInput.replace(/[^\d]/g, '')) || 0)
                      setBidInput(String(cur + bidStep(biddingLot)))
                      setBidError(null)
                    }}
                    aria-label="Увеличить ставку на минимальный шаг"
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white transition active:scale-95"
                  >
                    <Plus className="size-5" aria-hidden />
                  </button>
                </div>
                {/* быстрые шаги */}
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {QUICK_STEPS.map((step) => (
                    <button
                      key={step}
                      onClick={() => {
                        const cur = Math.floor(Number(bidInput.replace(/[^\d]/g, '')) || 0)
                        setBidInput(String(Math.max(cur, minBid(biddingLot)) + step))
                        setBidError(null)
                      }}
                      className="h-11 rounded-xl border border-amber-400/25 bg-amber-400/10 text-xs font-semibold text-amber-300 transition active:scale-95"
                    >
                      + {fmtMoney(step)}
                    </button>
                  ))}
                </div>

                {/* сводка: ставка / комиссия / итого */}
                <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-white/50">Ставка</span>
                    <span className="font-semibold tabular-nums text-white">{bidAmount > 0 ? fmtMoney(bidAmount) : '—'}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-white/50">Комиссия сервиса</span>
                    <span className="font-semibold tabular-nums text-emerald-300">0 ₽</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-white/[0.08] pt-2">
                    <span className="text-[13px] text-white/70">Итого при победе</span>
                    <span className="text-[15px] font-bold tabular-nums text-amber-300">{bidAmount > 0 ? fmtMoney(bidAmount) : '—'}</span>
                  </div>
                  <div className="mt-1.5 text-[10px] leading-relaxed text-white/40">
                    Победитель платит ровно свою ставку — без комиссии. Деньги резервируются с баланса и вернутся, если ставку перебьют.
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-[11px] leading-relaxed text-white/50">
                  Автоставка сама перебивает соперников минимально необходимой суммой, пока ставка не превысит ваш потолок.
                  Резервируются только фактические ставки.
                </p>
                <input
                  className="mt-2 h-12 w-full rounded-xl border border-emerald-500/40 bg-white/[0.06] px-4 text-base font-semibold tabular-nums text-white placeholder:text-white/40 outline-none focus:border-emerald-500/50"
                  inputMode="numeric"
                  value={autoInput}
                  placeholder="Ваш максимум, ₽"
                  aria-label={`Потолок автоставки для лота ${biddingLot.title}`}
                  onChange={(e) => setAutoInput(e.target.value.replace(/[^\d]/g, ''))}
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
                  <span>Минимальный потолок</span>
                  <span className="font-semibold tabular-nums text-emerald-300">{fmtMoney(minBid(biddingLot))}</span>
                </div>
                {autoAmount > 0 && (
                  <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
                    <div className="flex items-center justify-between border-t-0">
                      <span className="text-[13px] text-white/70">Потолок автоставки</span>
                      <span className="text-[15px] font-bold tabular-nums text-emerald-300">{fmtMoney(autoAmount)}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {bidError && <div className="mt-2 text-[11px] text-red-400">{bidError}</div>}
            <div className="mt-3 flex items-center justify-between text-[11px] text-white/50">
              <span>Ваш баланс</span>
              <span className="tabular-nums font-medium text-white">{fmtMoney(session?.balance ?? 0)}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closePanel}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] text-[13px] font-medium text-white/70 transition active:scale-[0.98]"
              >
                Отмена
              </button>
              {bidMode === 'manual' ? (
                <button
                  type="button"
                  className="h-12 rounded-2xl text-[13px] font-bold transition active:scale-[0.98] disabled:opacity-60"
                  style={{ backgroundColor: GOLD, color: GOLD_TEXT }}
                  disabled={busy}
                  onClick={() => void placeBid(biddingLot)}
                >
                  {busy ? <Loader2 className="mx-auto size-4 animate-spin" aria-hidden /> : 'Подтвердить ставку'}
                </button>
              ) : (
                <button
                  type="button"
                  className="h-12 rounded-2xl bg-[#22C55E] text-[13px] font-bold text-[#052E16] transition active:scale-[0.98] disabled:opacity-60"
                  disabled={autoBusy}
                  onClick={() => void placeAutoBid(biddingLot)}
                >
                  {autoBusy ? <Loader2 className="mx-auto size-4 animate-spin" aria-hidden /> : biddingLot.myAutoBid > 0 ? 'Обновить потолок' : 'Включить автоставку'}
                </button>
              )}
            </div>
            {bidMode === 'auto' && biddingLot.myAutoBid > 0 && (
              <button
                onClick={() => void cancelAutoBid(biddingLot)}
                disabled={autoBusy}
                className="mt-2 h-10 w-full rounded-xl border border-red-500/30 bg-red-500/10 text-[11px] font-medium text-red-400 transition active:scale-95"
              >
                Отменить автоставку
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
