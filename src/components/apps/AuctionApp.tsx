'use client'

// Приложение «Аукцион» — премиальный аукционный дом: графит + золото в шапке,
// светлый лист лотов, фильтры, bottom-sheet панель ставки, живые таймеры и realtime-ставки.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Bot, CheckCircle2, Gavel, History, Loader2, Trophy, X } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { getSocket } from '@/lib/use-realtime'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import type { AuctionData, AuctionLotDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const GOLD = '#d4a017'

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

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

function conditionClass(c: string): string {
  switch (c) {
    case 'new': return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
    case 'excellent': return 'bg-lime-500/15 text-lime-700 border-lime-500/30'
    case 'good': return 'bg-sky-500/15 text-sky-700 border-sky-500/30'
    case 'used': return 'bg-amber-500/15 text-amber-700 border-amber-500/30'
    case 'parts': return 'bg-red-500/15 text-red-700 border-red-500/30'
    default: return 'bg-stone-500/15 text-stone-600 border-stone-500/30'
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

interface BidRow {
  id: string
  userName: string
  amount: number
  createdAt: string
  isMe: boolean
}

type LotFilter = 'all' | 'leading' | 'ending' | 'ended'

const FILTERS: { key: LotFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'leading', label: 'Мои лидерства' },
  { key: 'ending', label: 'Скоро финал' },
  { key: 'ended', label: 'Завершённые' },
]

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
  const filtered = sorted.filter((lot) => {
    const ended = new Date(lot.endsAt).getTime() <= nowMs
    if (filter === 'ended') return ended
    if (filter === 'leading') return !ended && lot.myBid > 0 && lot.currentBidderName != null && lot.isMine
    if (filter === 'ending') return !ended && new Date(lot.endsAt).getTime() - nowMs < 300_000
    return true
  })

  const biddingLot = openBid ? sorted.find((l) => l.id === openBid) ?? null : null

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#f6f4f1] text-neutral-900">
      {/* ---------- Шапка аукционного дома (тёмный графит + золото — фирменный блок) ---------- */}
      <div className="relative z-10 shrink-0 overflow-hidden bg-[#151210] text-stone-100">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, rgba(212,160,23,0.16) 0%, rgba(21,18,16,0) 55%), radial-gradient(120% 90% at 85% -10%, rgba(212,160,23,0.2) 0%, rgba(21,18,16,0) 60%)' }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3 px-4 pb-3 pt-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-[#d4a017]/30 bg-gradient-to-br from-[#3a2f1e] to-[#221d15] shadow-[inset_0_1px_0_rgba(212,160,23,0.25)]">
            <Gavel className="size-5 text-[#e9c05e]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold tracking-wide text-amber-50">Аукционный дом</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-400">
              <span className="relative flex size-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              {liveBids > 0 ? `Торги живьём · +${liveBids} ставок` : 'Торги идут в реальном времени'}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end rounded-xl border border-[#d4a017]/25 bg-black/40 px-3 py-1.5 text-right">
            <span className="text-[9px] uppercase tracking-widest text-stone-500">Побед</span>
            <span className="flex items-center gap-1 text-sm font-bold tabular-nums text-[#e9c05e]">
              <Trophy className="size-3.5" aria-hidden /> {data?.wonCount ?? 0}
            </span>
          </div>
        </div>
        <div className="relative flex items-center gap-2 px-4 pb-3">
          <span className="rounded-full border border-[#d4a017]/25 bg-[#d4a017]/15 px-2.5 py-1 text-[10px] font-semibold text-[#e9c05e]">
            Активных: {data?.activeCount ?? 0}
          </span>
          <span className="rounded-full border border-stone-600/50 bg-stone-800/60 px-2.5 py-1 text-[10px] font-medium text-stone-300">
            Ставка резервирует деньги
          </span>
        </div>
      </div>

      {/* ---------- Контент ---------- */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-10 animate-pulse rounded-2xl bg-neutral-200/80" />
            <div className="h-44 animate-pulse rounded-2xl bg-neutral-200/80" />
            <div className="h-44 animate-pulse rounded-2xl bg-neutral-200/80" />
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
              <Loader2 className="size-4 animate-spin" /> Аукционный дом открывается…
            </div>
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button
              className="mt-4 h-11 rounded-xl px-6 text-sm font-semibold text-stone-950"
              style={{ backgroundColor: GOLD }}
              onClick={() => void load()}
            >
              Повторить
            </Button>
          </div>
        ) : data ? (
          <>
            {/* Фильтры */}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={
                    'shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition active:scale-95 ' +
                    (filter === f.key
                      ? 'border-[#c99b14] bg-[#d4a017]/20 text-[#8a6a0c]'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300')
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Лоты */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-center">
                <Gavel className="size-8 text-neutral-300" aria-hidden />
                <div className="mt-2 text-sm font-medium text-neutral-700">
                  {filter === 'all' ? 'Лотов пока нет' : 'Под фильтр ничего не подошло'}
                </div>
                <div className="mt-1 max-w-60 text-xs leading-relaxed text-neutral-500">
                  Аукционный дом скоро выставит новую распродажу — заглядывайте позже.
                </div>
              </div>
            ) : (
              filtered.map((lot) => {
                const endMs = new Date(lot.endsAt).getTime()
                const remainMs = endMs - nowMs
                const ended = remainMs <= 0
                const base = lot.currentBid ?? lot.startPrice
                const leading = lot.isMine && lot.currentBidderName != null && !ended
                return (
                  <div
                    key={lot.id}
                    className={
                      'shrink-0 overflow-hidden rounded-2xl border bg-white shadow-sm transition ' +
                      (leading ? 'border-emerald-500/50' : extendedLot === lot.id ? 'border-red-400/60' : 'border-neutral-200')
                    }
                  >
                    {/* верх: фото с наложением */}
                    <div className="relative h-36 w-full overflow-hidden">
                      <img src={lot.image} alt={lot.title} className="size-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" aria-hidden />
                      {/* таймер-чип */}
                      <div
                        className={
                          'absolute right-3 top-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums backdrop-blur ' +
                          (ended
                            ? 'border-stone-500/40 bg-black/60 text-stone-200'
                            : remainMs < 60000
                              ? 'animate-pulse border-red-400/50 bg-black/60 text-red-200'
                              : 'border-[#d4a017]/50 bg-black/60 text-[#f0cd6e]')
                        }
                      >
                        <span className={'size-1.5 rounded-full ' + (ended ? 'bg-stone-500' : remainMs < 60000 ? 'bg-red-400' : 'bg-[#d4a017]')} aria-hidden />
                        {ended ? 'Завершён' : fmtTimer(remainMs)}
                      </div>
                      {/* статус-бейджи */}
                      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                        <ConditionBadge value={lot.condition} />
                        {leading && (
                          <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/25 px-2 py-0.5 text-[10px] font-medium text-emerald-100 backdrop-blur">
                            <CheckCircle2 className="size-3" aria-hidden /> Вы лидер
                          </span>
                        )}
                        {extendedLot === lot.id && (
                          <span className="inline-flex animate-pulse items-center rounded-full border border-red-400/50 bg-red-500/30 px-2 py-0.5 text-[10px] font-semibold text-red-100 backdrop-blur">
                            Финал: таймер продлён
                          </span>
                        )}
                        {ended && lot.isMine && (
                          <span className="inline-flex items-center rounded-full border border-[#d4a017]/50 bg-[#d4a017]/35 px-2 py-0.5 text-[10px] font-semibold text-[#ffe9a8] backdrop-blur">
                            <Trophy className="size-3" aria-hidden /> Победа
                          </span>
                        )}
                      </div>
                      {/* нижняя строка поверх фото */}
                      <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white drop-shadow">{lot.title}</div>
                          <div className="truncate text-[10px] text-stone-200/90">
                            Рынок: {fmtMoney(lot.baseValue)} · Старт: {fmtMoney(lot.startPrice)}
                          </div>
                        </div>
                        {lot.bidCount > 0 && (
                          <span className="shrink-0 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                            {lot.bidCount} {plural(lot.bidCount, 'ставка', 'ставки', 'ставок')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* тело карточки */}
                    <div className="p-3.5 pt-3">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-widest text-neutral-400">Текущая ставка</div>
                          {lot.currentBid != null ? (
                            <>
                              <div className="text-2xl font-bold tabular-nums text-[#a87f0e]">{fmtMoney(lot.currentBid)}</div>
                              <div className="truncate text-[11px] text-neutral-500">Лидер: {lot.currentBidderName ?? '—'}</div>
                            </>
                          ) : (
                            <div className="text-base font-semibold text-neutral-400">Ставок нет</div>
                          )}
                          {lot.myBid > 0 && (
                            <div className="mt-0.5 text-[11px] font-medium text-emerald-600">Ваша ставка: {fmtMoney(lot.myBid)}</div>
                          )}
                          {!ended && lot.myAutoBid > 0 && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <Bot className="size-3" aria-hidden /> Автоставка до {fmtMoney(lot.myAutoBid)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* История ставок */}
                      {lot.bidCount > 0 && (
                        <div className="mt-3">
                          <button
                            onClick={() => void toggleHist(lot.id)}
                            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100"
                            aria-expanded={openHist === lot.id}
                          >
                            <span className="flex items-center gap-1.5">
                              <History className="size-3.5 text-[#a87f0e]" aria-hidden />
                              История ставок ({lot.bidCount})
                            </span>
                            <span className="text-neutral-400">{openHist === lot.id ? 'скрыть' : 'показать'}</span>
                          </button>
                          {openHist === lot.id && (
                            <div className="mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300">
                              {histLoading && !histBids[lot.id] ? (
                                <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-neutral-500">
                                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Загружаем торги…
                                </div>
                              ) : (histBids[lot.id]?.length ?? 0) === 0 ? (
                                <div className="py-3 text-center text-[11px] text-neutral-500">Ставок пока не было</div>
                              ) : (
                                <div className="divide-y divide-neutral-200">
                                  {histBids[lot.id]!.map((b, i) => (
                                    <div
                                      key={b.id}
                                      className={'flex items-center gap-2 px-2.5 py-2 text-xs ' + (i === 0 ? 'bg-amber-50' : '')}
                                    >
                                      <span
                                        className={
                                          'flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ' +
                                          (i === 0 ? 'bg-[#d4a017] text-stone-950' : 'bg-neutral-200 text-neutral-500')
                                        }
                                      >
                                        {i + 1}
                                      </span>
                                      <span className={'min-w-0 flex-1 truncate ' + (b.isMe ? 'font-semibold text-emerald-600' : 'text-neutral-700')}>
                                        {b.userName}
                                        {b.isMe && <span className="ml-1 text-[10px] font-normal text-emerald-600/80">(вы)</span>}
                                      </span>
                                      <span className="shrink-0 text-[10px] text-neutral-400">{timeAgo(b.createdAt)}</span>
                                      <span className={'shrink-0 font-semibold tabular-nums ' + (i === 0 ? 'text-[#a87f0e]' : 'text-neutral-600')}>
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

                      {/* кнопки ставки */}
                      {!ended && (
                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                          <Button
                            className="h-11 rounded-xl text-sm font-semibold text-stone-950 shadow-[0_6px_18px_-6px_rgba(212,160,23,0.55)]"
                            style={{ backgroundColor: GOLD }}
                            onClick={() => openPanel(lot, 'manual')}
                          >
                            Сделать ставку
                          </Button>
                          <Button
                            variant="outline"
                            className={
                              'h-11 rounded-xl border px-3 text-xs font-semibold ' +
                              (lot.myAutoBid > 0
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                                : 'border-amber-300 bg-amber-50 text-[#8a6a0c]')
                            }
                            aria-label={lot.myAutoBid > 0 ? `Изменить автоставку для лота ${lot.title}` : `Включить автоставку для лота ${lot.title}`}
                            onClick={() => openPanel(lot, 'auto')}
                          >
                            <Bot className="size-4" aria-hidden />
                            Авто
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}

            <div className="pb-2 text-center text-[10px] text-neutral-400">Аукционный дом · молоток падает, это игра</div>
          </>
        ) : null}
      </div>

      {/* ---------- BOTTOM SHEET: панель ставки ---------- */}
      {biddingLot && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end">
          <button type="button" aria-label="Закрыть панель ставки" onClick={closePanel} className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
          <div className="relative max-h-[85%] overflow-y-auto rounded-t-3xl border-t border-neutral-200 bg-white p-4 pb-5 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] [scrollbar-width:thin]">
            {/* ручка */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300" aria-hidden />

            {/* заголовок лота */}
            <div className="flex items-center gap-3">
              <img src={biddingLot.image} alt={biddingLot.title} className="size-14 shrink-0 rounded-xl border border-neutral-200 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-neutral-900">{biddingLot.title}</div>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  Текущая: <span className="font-semibold text-[#a87f0e]">{fmtMoney(biddingLot.currentBid ?? biddingLot.startPrice)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Закрыть"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 active:scale-90"
              >
                <X className="size-4.5" />
              </button>
            </div>

            {/* переключатель режима ставки */}
            <div className="mt-3.5 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
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
                    (bidMode === mode ? 'bg-[#d4a017] text-stone-950' : 'text-neutral-500 hover:text-neutral-700')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {bidMode === 'manual' ? (
              <>
                <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
                  <span>Минимальная ставка</span>
                  <span className="font-semibold tabular-nums text-[#a87f0e]">{fmtMoney(minBid(biddingLot))}</span>
                </div>
                <Input
                  className="mt-2 h-12 rounded-xl border-neutral-300 bg-white text-base font-semibold text-neutral-900 placeholder:text-neutral-400"
                  inputMode="numeric"
                  value={bidInput}
                  placeholder={String(minBid(biddingLot))}
                  aria-label={`Ваша ставка для лота ${biddingLot.title}`}
                  onChange={(e) => setBidInput(e.target.value.replace(/[^\d]/g, ''))}
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { label: '+мин', value: minBid(biddingLot) },
                    { label: '+5%', value: Math.max(minBid(biddingLot), Math.round((biddingLot.currentBid ?? biddingLot.startPrice) * 1.05)) },
                    { label: '+10%', value: Math.max(minBid(biddingLot), Math.round((biddingLot.currentBid ?? biddingLot.startPrice) * 1.1)) },
                  ].map((b) => (
                    <button
                      key={b.label}
                      onClick={() => {
                        setBidInput(String(b.value))
                        setBidError(null)
                      }}
                      className="h-11 rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold text-[#8a6a0c] transition active:scale-95"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
                  Автоставка сама перебивает соперников минимально необходимой суммой, пока ставка не превысит ваш потолок.
                  Резервируются только фактические ставки.
                </p>
                <Input
                  className="mt-2 h-12 rounded-xl border-emerald-500/40 bg-white text-base font-semibold text-neutral-900 placeholder:text-neutral-400"
                  inputMode="numeric"
                  value={autoInput}
                  placeholder="Ваш максимум, ₽"
                  aria-label={`Потолок автоставки для лота ${biddingLot.title}`}
                  onChange={(e) => setAutoInput(e.target.value.replace(/[^\d]/g, ''))}
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
                  <span>Минимальный потолок</span>
                  <span className="font-semibold tabular-nums text-emerald-600">{fmtMoney(minBid(biddingLot))}</span>
                </div>
              </>
            )}

            {bidError && <div className="mt-2 text-[11px] text-red-600">{bidError}</div>}
            <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Ваш баланс</span>
              <span className="tabular-nums font-medium text-neutral-800">{fmtMoney(session?.balance ?? 0)}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12 rounded-xl border-neutral-300 text-xs font-medium text-neutral-600" onClick={closePanel}>
                Отмена
              </Button>
              {bidMode === 'manual' ? (
                <Button
                  className="h-12 rounded-xl text-xs font-semibold text-stone-950"
                  style={{ backgroundColor: GOLD }}
                  disabled={busy}
                  onClick={() => void placeBid(biddingLot)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Подтвердить ставку'}
                </Button>
              ) : (
                <Button
                  className="h-12 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/25"
                  disabled={autoBusy}
                  onClick={() => void placeAutoBid(biddingLot)}
                >
                  {autoBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : biddingLot.myAutoBid > 0 ? 'Обновить потолок' : 'Включить автоставку'}
                </Button>
              )}
            </div>
            {bidMode === 'auto' && biddingLot.myAutoBid > 0 && (
              <button
                onClick={() => void cancelAutoBid(biddingLot)}
                disabled={autoBusy}
                className="mt-2 h-10 w-full rounded-lg border border-red-500/30 bg-red-500/10 text-[11px] font-medium text-red-600 transition active:scale-95"
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
