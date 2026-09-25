'use client'

// Приложение «Аукцион» — светлая система Resale: фон #F5F6FA, белые карточки radius 20,
// янтарный акцент #E8A020 (ставки, таймеры, лид-бид), CTA-пилюли h-12 radius 12 с белым текстом.
// Композиция: крупная шапка 22 bold + подзаголовок 13 #9AA0A8, поиск/колокольчик, чипы-фильтры,
// featured «живой» лот, сетка лотов 2 колонки, детали лота с каунтдауном ЧЧ:ММ:СС, история ставок
// с аватарками, липкая нижняя CTA-панель и белая шторка ставки.
// Бизнес-логика (ставки, автоставка, история торгов, realtime, антиснайпинг) — без изменений.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  ArrowLeft, ArrowRight, Bell, Bot, Crown, Gavel, Heart, History, Loader2, Minus, Plus, Search, SearchX, Timer, Trophy, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, initials, hueColor, timeAgo } from '@/lib/format'
import { getSocket } from '@/lib/use-realtime'
import { CATEGORY_LABEL, CONDITION_LABEL } from '@/lib/catalog-types'
import type { AuctionData, AuctionLotDTO } from '@/lib/types'

// Единые токены светлой системы (акцент аукциона — янтарь)
const AMBER = '#E8A020'
const AMBER_DEEP = '#B25E09'
const CARD_SHADOW = '0 2px 8px rgba(0,0,0,0.04)'

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

// Светлые тона чипов состояния (без синего/фиолетового)
function conditionClass(c: string): string {
  switch (c) {
    case 'new': return 'bg-[#E6F6EC] text-[#067A47]'
    case 'excellent': return 'bg-[#EFF8E6] text-[#4C8A1F]'
    case 'good': return 'bg-[#F0F1F5] text-[#5F6368]'
    case 'used': return 'bg-[#FFF4DC] text-[#B25E09]'
    case 'parts': return 'bg-[#FDEEEE] text-[#D14343]'
    default: return 'bg-[#F0F1F5] text-[#9AA0A8]'
  }
}

function ConditionBadge({ value }: { value: string }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ' +
        conditionClass(value)
      }
    >
      {CONDITION_LABEL[value] ?? value}
    </span>
  )
}

// Красное сердечко при лайке в белом кружке (лайки — сессионные, только визуал)
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
      className="flex size-9 items-center justify-center rounded-full bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition active:scale-90"
    >
      <Heart className={'size-4 ' + (active ? 'fill-red-500 text-red-500' : 'text-[#9AA0A8]')} aria-hidden />
    </button>
  )
}

// Аватарка участника торгов в истории ставок (цвет — идентичность имени, как в чатах)
function BidAvatar({ name, top }: { name: string; top?: boolean }) {
  return (
    <span
      className={
        'flex size-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ' +
        (top ? 'ring-2 ring-[#E8A020] ring-offset-1' : '')
      }
      style={{ background: hueColor(name.length * 47 % 360) }}
      aria-hidden
    >
      {initials(name)}
    </span>
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
    <div className="relative flex h-full flex-col overflow-hidden bg-[#F5F6FA] text-[#1A1A1A]">
      {data && detailLot ? (
        <>
          {/* ================= ДЕТАЛИ ЛОТА ================= */}
          {/* верхний бар */}
          <div className="z-10 flex shrink-0 items-center gap-3 bg-[#F5F6FA] px-4 pb-2 pt-3">
            <button
              type="button"
              onClick={() => setDetailId(null)}
              aria-label="Назад к лотам"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition active:scale-95"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">Детали лота</div>
            <HeartBtn
              active={favs.has(detailLot.id)}
              onClick={() => toggleFav(detailLot.id)}
              label={favs.has(detailLot.id) ? `Убрать ${detailLot.title} из избранного` : `В избранное: ${detailLot.title}`}
            />
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-2 [scrollbar-width:thin]">
            {/* большое фото (в DTO одно изображение — счётчик 1/1) */}
            <div className="relative shrink-0 overflow-hidden rounded-[20px]" style={{ boxShadow: CARD_SHADOW }}>
              <img src={detailLot.image} alt={detailLot.title} className="aspect-[4/3] w-full object-cover" />
              <div className="absolute left-3 top-3">
                <ConditionBadge value={detailLot.condition} />
              </div>
              <span
                className="absolute bottom-3 right-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#1A1A1A]"
                aria-label="Фото 1 из 1"
              >
                1/1
              </span>
              {new Date(detailLot.endsAt).getTime() <= nowMs && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">
                  Аукцион завершён
                </div>
              )}
            </div>

            {/* название + чипы */}
            <div>
              <div className="text-[20px] font-bold leading-tight">{detailLot.title}</div>
              <div className="mt-1 text-[12px] text-[#9AA0A8]">
                {CATEGORY_LABEL[detailLot.category] ?? detailLot.category} · Рынок: {fmtMoney(detailLot.baseValue)} · Старт: {fmtMoney(detailLot.startPrice)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-[#F0F1F5] px-2.5 py-1 text-[11px] text-[#5F6368]">
                  {CATEGORY_LABEL[detailLot.category] ?? detailLot.category}
                </span>
                {detailLot.isMine && detailLot.currentBidderName != null && new Date(detailLot.endsAt).getTime() > nowMs && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: AMBER }}>
                    <Crown className="size-3" aria-hidden /> Вы лидер
                  </span>
                )}
                {extendedLot === detailLot.id && (
                  <span className="animate-pulse rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#D14343]">
                    Финал: таймер продлён
                  </span>
                )}
                {detailLot.myAutoBid > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F6EC] px-2.5 py-1 text-[11px] font-semibold text-[#067A47]">
                    <Bot className="size-3" aria-hidden /> Автоставка до {fmtMoney(detailLot.myAutoBid)}
                  </span>
                )}
              </div>
            </div>

            {/* каунтдаун ЧЧ:ММ:СС — янтарные моно-цифры */}
            <div className="shrink-0 rounded-[20px] bg-white p-4" style={{ boxShadow: CARD_SHADOW }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#9AA0A8]">До завершения</span>
                {new Date(detailLot.endsAt).getTime() - nowMs > 0 && new Date(detailLot.endsAt).getTime() - nowMs < 60_000 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#D14343]">
                    <span className="relative flex size-1.5" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                    </span>
                    Финальная минута
                  </span>
                )}
              </div>
              {new Date(detailLot.endsAt).getTime() <= nowMs ? (
                <div className="mt-2 text-[20px] font-bold text-[#9AA0A8]">Аукцион завершён</div>
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
                        <div className="text-[28px] font-bold tabular-nums leading-none" style={{ color: AMBER }}>
                          {String(v).padStart(2, '0')}
                        </div>
                        <div className="mt-1 text-[10px] text-[#9AA0A8]">{label}</div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>

            {/* текущая и следующая ставка */}
            <div className="shrink-0 rounded-[20px] bg-white p-4" style={{ boxShadow: CARD_SHADOW }}>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-widest text-[#9AA0A8]">Текущая ставка</div>
                  {detailLot.currentBid != null ? (
                    <>
                      <div className="mt-0.5 text-[24px] font-bold tabular-nums" style={{ color: AMBER }}>{fmtMoney(detailLot.currentBid)}</div>
                      <div className="truncate text-[11px] text-[#9AA0A8]">Лидер: {detailLot.currentBidderName ?? '—'}</div>
                    </>
                  ) : (
                    <div className="mt-0.5 text-[18px] font-semibold text-[#9AA0A8]">Ставок нет</div>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-[#F0F1F5] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#5F6368]">
                  {detailLot.bidCount} {plural(detailLot.bidCount, 'ставка', 'ставки', 'ставок')}
                </span>
              </div>
              <div className="mt-3 border-t border-[#E8EAED] pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-[#9AA0A8]">Следующая ставка</span>
                  <span className="text-[14px] font-bold tabular-nums">{fmtMoney(minBid(detailLot))}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[12px] text-[#9AA0A8]">Минимальный шаг</span>
                  <span className="text-[12px] tabular-nums text-[#9AA0A8]">+{fmtMoney(bidStep(detailLot))}</span>
                </div>
                {detailLot.myBid > 0 && (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[12px] text-[#067A47]">Ваша ставка</span>
                    <span className="text-[12px] font-semibold tabular-nums text-[#067A47]">{fmtMoney(detailLot.myBid)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* история ставок — белые ряды с аватарками */}
            {detailLot.bidCount > 0 && (
              <div className="shrink-0 overflow-hidden rounded-[20px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
                <button
                  type="button"
                  onClick={() => void toggleHist(detailLot.id)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-[13px] font-semibold transition active:scale-[0.99]"
                  aria-expanded={openHist === detailLot.id}
                >
                  <span className="flex items-center gap-2">
                    <History className="size-4" style={{ color: AMBER }} aria-hidden />
                    История ставок ({detailLot.bidCount})
                  </span>
                  <span className="text-[11px] font-normal text-[#9AA0A8]">{openHist === detailLot.id ? 'скрыть' : 'показать'}</span>
                </button>
                {openHist === detailLot.id && (
                  <div className="max-h-52 overflow-y-auto border-t border-[#E8EAED] [scrollbar-width:thin]">
                    {histLoading && !histBids[detailLot.id] ? (
                      <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-[#9AA0A8]">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Загружаем торги…
                      </div>
                    ) : (histBids[detailLot.id]?.length ?? 0) === 0 ? (
                      <div className="py-4 text-center text-[11px] text-[#9AA0A8]">Ставок пока не было</div>
                    ) : (
                      <div className="divide-y divide-[#F0F1F5]">
                        {histBids[detailLot.id]!.map((b, i) => (
                          <div key={b.id} className={'flex items-center gap-2.5 px-4 py-2.5 ' + (i === 0 ? 'bg-[#FFF9EC]' : '')}>
                            <BidAvatar name={b.userName} top={i === 0} />
                            <span className={'min-w-0 flex-1 truncate text-[13px] ' + (b.isMe ? 'font-semibold text-[#067A47]' : 'text-[#1A1A1A]')}>
                              {b.userName}
                              {b.isMe && <span className="ml-1 text-[10px] font-normal text-[#067A47]/70">(вы)</span>}
                            </span>
                            <span className="shrink-0 text-[10px] text-[#9AA0A8]">{timeAgo(b.createdAt)}</span>
                            <span className={'shrink-0 text-[13px] font-bold tabular-nums ' + (i === 0 ? '' : 'text-[#5F6368]')} style={i === 0 ? { color: AMBER_DEEP } : undefined}>
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

            <div className="pb-1 text-center text-[10px] text-[#9AA0A8]">Аукционный дом · молоток падает, это игра</div>
          </div>

          {/* липкая нижняя панель ставки */}
          {new Date(detailLot.endsAt).getTime() > nowMs ? (
            <div className="shrink-0 border-t border-[#E8EAED] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={() => openPanel(detailLot, 'manual')}
                  className="h-12 w-full rounded-xl text-[15px] font-bold text-white transition active:scale-[0.98]"
                  style={{ backgroundColor: AMBER }}
                >
                  Сделать ставку
                </button>
                <button
                  type="button"
                  onClick={() => openPanel(detailLot, 'auto')}
                  aria-label={detailLot.myAutoBid > 0 ? `Изменить автоставку для лота ${detailLot.title}` : `Включить автоставку для лота ${detailLot.title}`}
                  className={
                    'flex h-12 w-12 items-center justify-center rounded-xl transition active:scale-95 ' +
                    (detailLot.myAutoBid > 0 ? 'bg-[#E6F6EC] text-[#067A47]' : 'bg-[#F0F1F5] text-[#1A1A1A]')
                  }
                >
                  <Bot className="size-5" aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div className="shrink-0 border-t border-[#E8EAED] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
              <div className="flex h-12 w-full items-center justify-center rounded-xl bg-[#F0F1F5] text-[13px] font-medium text-[#9AA0A8]">
                Аукцион завершён
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ================= СПИСОК ЛОТОВ ================= */}
          {/* ---------- Шапка: крупный заголовок + поиск + колокольчик ---------- */}
          <div className="relative z-10 shrink-0 bg-[#F5F6FA] px-4 pb-2 pt-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[22px] font-bold leading-tight">Аукцион</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#9AA0A8]">
                  {liveBids > 0 && (
                    <span className="relative flex size-1.5" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0AC760] opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-[#0AC760]" />
                    </span>
                  )}
                  {liveBids > 0 ? `Торги живьём · +${liveBids} ставок` : 'Ставки приходят в реальном времени'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSearch((v) => !v)}
                aria-label={showSearch ? 'Скрыть поиск' : 'Поиск по лотам'}
                aria-expanded={showSearch}
                className={
                  'flex size-10 shrink-0 items-center justify-center rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition active:scale-95 ' +
                  (showSearch ? 'bg-[#FFF4DC] text-[#B25E09]' : 'bg-white text-[#1A1A1A]')
                }
              >
                <Search className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={notifyEnding}
                aria-label="Финалы в ближайшие 5 минут"
                className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition active:scale-95"
              >
                <Bell className="size-5" aria-hidden />
                {(data?.lots ?? []).some((l) => {
                  const r = new Date(l.endsAt).getTime() - nowMs
                  return r > 0 && r < 300_000
                }) && (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-500" aria-hidden />
                )}
              </button>
            </div>

            {showSearch && (
              <div className="relative mt-3">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9AA0A8]" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по лотам"
                  aria-label="Поиск по лотам"
                  className="h-11 w-full rounded-xl bg-[#F0F1F5] py-2.5 pl-10 pr-9 text-[13px] text-[#1A1A1A] placeholder:text-[#9AA0A8] outline-none focus:border focus:border-[#E8A020]"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Очистить поиск"
                    className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-[#9AA0A8] transition active:scale-90"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#5F6368] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                Активных: {data?.activeCount ?? 0}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4DC] px-2.5 py-1 text-[11px] font-semibold text-[#B25E09]">
                <Trophy className="size-3" aria-hidden /> Побед: {data?.wonCount ?? 0}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] text-[#9AA0A8] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <Gavel className="size-3" aria-hidden /> Ставка резервирует деньги
              </span>
            </div>
          </div>

          {/* ---------- Контент ---------- */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
            {loading && !data ? (
              <div className="flex flex-col gap-3">
                <div className="h-12 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
                <div className="h-48 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-52 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
                  <div className="h-52 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
                </div>
              </div>
            ) : error && !data ? (
              <div className="rounded-[20px] bg-white p-6 text-center" style={{ boxShadow: CARD_SHADOW }}>
                <p className="text-sm text-[#D14343]">{error}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-4 inline-flex h-12 items-center rounded-xl px-6 text-sm font-bold text-white transition active:scale-95"
                  style={{ backgroundColor: AMBER }}
                >
                  Повторить
                </button>
              </div>
            ) : data ? (
              <>
                {/* ---------- ЧИПЫ-ФИЛЬТРЫ ---------- */}
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={
                        'h-9 shrink-0 rounded-full px-4 text-[13px] transition active:scale-95 ' +
                        (filter === f.key
                          ? 'font-semibold text-white'
                          : 'bg-white text-[#1A1A1A] shadow-[0_2px_8px_rgba(0,0,0,0.04)]')
                      }
                      style={filter === f.key ? { backgroundColor: AMBER } : undefined}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* ---------- FEATURED «ЖИВОЙ» ЛОТ ---------- */}
                {featured && (
                  <div className="relative shrink-0 overflow-hidden rounded-[20px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
                    <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#D14343]">
                        <span className="relative flex size-1.5" aria-hidden>
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                        </span>
                        Сейчас идёт
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF4DC] px-2.5 py-1 text-[12px] font-bold tabular-nums text-[#B25E09]">
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
                        <div className="truncate text-[15px] font-bold">{featured.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <ConditionBadge value={featured.condition} />
                          <span className="text-[11px] text-[#9AA0A8]">
                            Рынок: {fmtMoney(featured.baseValue)} · Старт: {fmtMoney(featured.startPrice)}
                          </span>
                        </div>
                        <div className="mt-2.5 text-[10px] font-medium uppercase tracking-widest text-[#9AA0A8]">Текущая ставка</div>
                        <div className="mt-0.5 text-[22px] font-bold tabular-nums" style={{ color: AMBER }}>
                          {featured.currentBid != null ? fmtMoney(featured.currentBid) : 'Ставок нет'}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[#9AA0A8]">
                          {featured.bidCount > 0
                            ? `${featured.bidCount} ${plural(featured.bidCount, 'ставка', 'ставки', 'ставок')}${featured.currentBidderName ? ` · Лидер: ${featured.currentBidderName}` : ''}`
                            : 'Будьте первым — сделайте ставку'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailId(featured.id)}
                        aria-label={`Подробнее о лоте ${featured.title}`}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90"
                        style={{ backgroundColor: AMBER }}
                      >
                        <ArrowRight className="size-5" aria-hidden />
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------- СЕТКА ЛОТОВ ---------- */}
                <div className="flex items-center justify-between">
                  <div className="text-[18px] font-bold">Все лоты</div>
                  <span className="text-[13px] text-[#9AA0A8]">{filtered.length}</span>
                </div>

                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-10 text-center" style={{ boxShadow: CARD_SHADOW }}>
                    <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
                      <SearchX className="size-7 text-[#9AA0A8]" aria-hidden />
                    </div>
                    <div className="mt-3 text-[15px] font-semibold">
                      {q ? 'Ничего не найдено' : filter === 'all' ? 'Лотов пока нет' : 'Под фильтр ничего не подошло'}
                    </div>
                    <div className="mt-1 max-w-64 text-[13px] leading-relaxed text-[#9AA0A8]">
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
                          className="relative shrink-0 cursor-pointer overflow-hidden rounded-[20px] bg-white transition active:scale-[0.98]"
                          style={{ boxShadow: CARD_SHADOW }}
                        >
                          <div className="relative aspect-square w-full overflow-hidden">
                            <img src={lot.image} alt={lot.title} className="size-full object-cover" />
                            {/* таймер-плашка — янтарная, моно-цифры */}
                            <div
                              className={
                                'absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold tabular-nums backdrop-blur ' +
                                (ended
                                  ? 'text-[#9AA0A8]'
                                  : remainMs < 60000
                                    ? 'animate-pulse text-[#D14343]'
                                    : 'text-[#B25E09]')
                              }
                            >
                              {!ended && (
                                <span className={'size-1.5 rounded-full ' + (remainMs < 60000 ? 'bg-red-500' : '')} style={remainMs >= 60000 ? { backgroundColor: AMBER } : undefined} aria-hidden />
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
                              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: AMBER }}>
                                <Crown className="size-3" aria-hidden /> Вы лидер
                              </span>
                            )}
                            {ended && lot.isMine && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#21A03A] px-2 py-0.5 text-[10px] font-bold text-white">
                                <Trophy className="size-3" aria-hidden /> Победа
                              </span>
                            )}
                            {extendedLot === lot.id && (
                              <span className="absolute bottom-2 right-2 animate-pulse rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-semibold text-[#D14343] backdrop-blur">
                                Таймер продлён
                              </span>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="truncate text-[13px] font-semibold">{lot.title}</div>
                            <div className="mt-1">
                              <ConditionBadge value={lot.condition} />
                            </div>
                            <div className="mt-1.5 flex items-baseline justify-between gap-1.5">
                              <span className="text-[16px] font-bold tabular-nums" style={{ color: AMBER }}>
                                {fmtMoney(lot.currentBid ?? lot.startPrice)}
                              </span>
                              <span className="shrink-0 text-[10px] text-[#9AA0A8]">
                                Ставок: {lot.bidCount}
                              </span>
                            </div>
                            {lot.myBid > 0 && (
                              <div className="mt-0.5 truncate text-[10px] text-[#067A47]">
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

                <div className="pb-2 text-center text-[10px] text-[#9AA0A8]">Аукционный дом · молоток падает, это игра</div>
              </>
            ) : null}
          </div>
        </>
      )}

      {/* ---------- BOTTOM SHEET: панель ставки (белая) ---------- */}
      {biddingLot && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end">
          <button type="button" aria-label="Закрыть панель ставки" onClick={closePanel} className="absolute inset-0 bg-black/40" />
          <div className="relative max-h-[88%] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.18)] [scrollbar-width:thin]">
            {/* ручка */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#E8EAED]" aria-hidden />

            {/* заголовок лота */}
            <div className="flex items-center gap-3">
              <img src={biddingLot.image} alt={biddingLot.title} className="size-14 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{biddingLot.title}</div>
                <div className="mt-0.5 text-[11px] text-[#9AA0A8]">
                  Текущая: <span className="font-semibold" style={{ color: AMBER_DEEP }}>{fmtMoney(biddingLot.currentBid ?? biddingLot.startPrice)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Закрыть"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F0F1F5] text-[#9AA0A8] transition active:scale-90"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {/* переключатель режима ставки */}
            <div className="mt-3.5 grid grid-cols-2 gap-1 rounded-xl bg-[#F0F1F5] p-1">
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
                    (bidMode === mode ? 'bg-white shadow-sm text-[#B25E09]' : 'text-[#9AA0A8]')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {bidMode === 'manual' ? (
              <>
                <div className="mt-3 flex items-center justify-between text-[11px] text-[#9AA0A8]">
                  <span>Минимальная ставка</span>
                  <span className="font-semibold tabular-nums" style={{ color: AMBER_DEEP }}>{fmtMoney(minBid(biddingLot))}</span>
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
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F0F1F5] text-[#1A1A1A] transition active:scale-95"
                  >
                    <Minus className="size-5" aria-hidden />
                  </button>
                  <input
                    className="h-12 w-full min-w-0 flex-1 rounded-xl border border-transparent bg-[#F0F1F5] px-3 text-center text-xl font-bold tabular-nums text-[#1A1A1A] placeholder:text-[#9AA0A8] outline-none focus:border-[#E8A020]"
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
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F0F1F5] text-[#1A1A1A] transition active:scale-95"
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
                      className="h-11 rounded-xl bg-[#FFF4DC] text-xs font-semibold text-[#B25E09] transition active:scale-95"
                    >
                      + {fmtMoney(step)}
                    </button>
                  ))}
                </div>

                {/* сводка: ставка / комиссия / итого */}
                <div className="mt-3 rounded-2xl bg-[#F5F6FA] p-3.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#9AA0A8]">Ставка</span>
                    <span className="font-semibold tabular-nums text-[#1A1A1A]">{bidAmount > 0 ? fmtMoney(bidAmount) : '—'}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-[#9AA0A8]">Комиссия сервиса</span>
                    <span className="font-semibold tabular-nums text-[#067A47]">0 ₽</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-[#E8EAED] pt-2">
                    <span className="text-[13px] text-[#5F6368]">Итого при победе</span>
                    <span className="text-[15px] font-bold tabular-nums" style={{ color: AMBER }}>{bidAmount > 0 ? fmtMoney(bidAmount) : '—'}</span>
                  </div>
                  <div className="mt-1.5 text-[10px] leading-relaxed text-[#9AA0A8]">
                    Победитель платит ровно свою ставку — без комиссии. Деньги резервируются с баланса и вернутся, если ставку перебьют.
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-[11px] leading-relaxed text-[#9AA0A8]">
                  Автоставка сама перебивает соперников минимально необходимой суммой, пока ставка не превысит ваш потолок.
                  Резервируются только фактические ставки.
                </p>
                <input
                  className="mt-2 h-12 w-full rounded-xl border border-[#21A03A]/40 bg-[#F0F1F5] px-4 text-base font-semibold tabular-nums text-[#1A1A1A] placeholder:text-[#9AA0A8] outline-none focus:border-[#21A03A]"
                  inputMode="numeric"
                  value={autoInput}
                  placeholder="Ваш максимум, ₽"
                  aria-label={`Потолок автоставки для лота ${biddingLot.title}`}
                  onChange={(e) => setAutoInput(e.target.value.replace(/[^\d]/g, ''))}
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#9AA0A8]">
                  <span>Минимальный потолок</span>
                  <span className="font-semibold tabular-nums text-[#067A47]">{fmtMoney(minBid(biddingLot))}</span>
                </div>
                {autoAmount > 0 && (
                  <div className="mt-3 rounded-2xl bg-[#F5F6FA] p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-[#5F6368]">Потолок автоставки</span>
                      <span className="text-[15px] font-bold tabular-nums text-[#067A47]">{fmtMoney(autoAmount)}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {bidError && <div className="mt-2 text-[11px] text-[#D14343]">{bidError}</div>}
            <div className="mt-3 flex items-center justify-between text-[11px] text-[#9AA0A8]">
              <span>Ваш баланс</span>
              <span className="font-medium tabular-nums text-[#1A1A1A]">{fmtMoney(session?.balance ?? 0)}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closePanel}
                className="h-12 rounded-xl bg-[#F0F1F5] text-[13px] font-medium text-[#1A1A1A] transition active:scale-[0.98]"
              >
                Отмена
              </button>
              {bidMode === 'manual' ? (
                <button
                  type="button"
                  className="h-12 rounded-xl text-[13px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
                  style={{ backgroundColor: AMBER }}
                  disabled={busy}
                  onClick={() => void placeBid(biddingLot)}
                >
                  {busy ? <Loader2 className="mx-auto size-4 animate-spin" aria-hidden /> : 'Подтвердить ставку'}
                </button>
              ) : (
                <button
                  type="button"
                  className="h-12 rounded-xl text-[13px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
                  style={{ backgroundColor: AMBER }}
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
                className="mt-2 h-10 w-full rounded-xl bg-[#FDEEEE] text-[11px] font-medium text-[#D14343] transition active:scale-95"
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
