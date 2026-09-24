'use client'

// Приложение «Аукцион» — роскошный тёмный аукционный дом: фон #0c0a09, золотой акцент #d4a017.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Bot, ChevronDown, ChevronUp, Gavel, History, Info, Loader2, Trophy } from 'lucide-react'
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
    case 'new': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    case 'excellent': return 'bg-lime-500/15 text-lime-300 border-lime-500/30'
    case 'good': return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    case 'used': return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    case 'parts': return 'bg-red-500/15 text-red-300 border-red-500/30'
    default: return 'bg-stone-500/15 text-stone-300 border-stone-500/30'
  }
}

function ConditionBadge({ value }: { value: string }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ' +
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

export default function AuctionApp() {
  const session = useOS((s) => s.session)
  const [data, setData] = useState<AuctionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

  return (
    <div className="flex h-full flex-col bg-[#0c0a09] text-stone-100">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#d4a017]/25 bg-[#d4a017]/10">
          <Gavel className="size-5 text-[#d4a017]" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold text-amber-50">Аукцион</div>
          <div className="text-xs text-stone-400">Роскошные лоты и живые торги</div>
        </div>
      </div>

      {/* Контент */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="h-20 animate-pulse rounded-2xl bg-stone-900" />
              <div className="h-20 animate-pulse rounded-2xl bg-stone-900" />
            </div>
            <div className="h-44 animate-pulse rounded-2xl bg-stone-900" />
            <div className="h-44 animate-pulse rounded-2xl bg-stone-900" />
            <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
              <Loader2 className="size-4 animate-spin" /> Аукционный дом открывается…
            </div>
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-300">{error}</p>
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
            {/* Статы */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#d4a017]/15 bg-[#1c1917] p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                  <Gavel className="size-3.5 text-[#d4a017]" aria-hidden /> Активных лотов
                </div>
                <div className="mt-1 text-xl font-bold text-amber-50 tabular-nums">{data.activeCount}</div>
              </div>
              <div className="rounded-2xl border border-[#d4a017]/15 bg-[#1c1917] p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                  <Trophy className="size-3.5 text-[#d4a017]" aria-hidden /> Ваших побед
                </div>
                <div className="mt-1 text-xl font-bold text-amber-50 tabular-nums">{data.wonCount}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-stone-600">
              <span className="relative flex size-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              {liveBids > 0
                ? `Ставки приходят в реальном времени · только что +${liveBids}`
                : 'Ставки ботов приходят в реальном времени'}
            </div>

            {/* Лоты */}
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-800 px-4 py-10 text-center">
                <Gavel className="size-8 text-stone-700" aria-hidden />
                <div className="mt-2 text-sm font-medium text-stone-300">Лотов пока нет</div>
                <div className="mt-1 max-w-60 text-xs leading-relaxed text-stone-500">
                  Аукционный дом скоро выставит новую распродажу — заглядывайте позже.
                </div>
              </div>
            ) : (
              sorted.map((lot) => {
                const endMs = new Date(lot.endsAt).getTime()
                const remainMs = endMs - nowMs
                const ended = remainMs <= 0
                const base = lot.currentBid ?? lot.startPrice
                const quick5 = Math.max(minBid(lot), Math.round(base * 1.05))
                const quick10 = Math.max(minBid(lot), Math.round(base * 1.1))
                return (
                  <div key={lot.id} className="rounded-2xl border border-[#d4a017]/15 bg-[#1c1917] p-3.5">
                    <div className="flex gap-3">
                      <img
                        src={lot.image}
                        alt={lot.title}
                        className="size-20 shrink-0 rounded-xl border border-[#d4a017]/20 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-amber-50">{lot.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ConditionBadge value={lot.condition} />
                          {ended ? (
                            lot.isMine ? (
                              <span className="inline-flex items-center rounded-full border border-[#d4a017]/40 bg-[#d4a017]/15 px-2 py-0.5 text-[10px] font-semibold text-[#d4a017]">
                                Победа
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-stone-700 bg-stone-800/60 px-2 py-0.5 text-[10px] font-medium text-stone-400">
                                Завершён
                              </span>
                            )
                          ) : lot.isMine ? (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              Ваша ставка лидирует
                            </span>
                          ) : null}
                          {!ended && extendedLot === lot.id && (
                            <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                              Финал: таймер продлён
                            </span>
                          )}
                          {!ended && remainMs < 60000 && extendedLot !== lot.id && (
                            <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                              Последние торги
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] text-stone-500">
                          Рынок: {fmtMoney(lot.baseValue)} · Старт: {fmtMoney(lot.startPrice)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-stone-500">Текущая ставка</div>
                        {lot.currentBid != null ? (
                          <>
                            <div className="text-xl font-bold tabular-nums text-[#d4a017]">
                              {fmtMoney(lot.currentBid)}
                            </div>
                            <div className="truncate text-[11px] text-stone-400">
                              Лидер: {lot.currentBidderName ?? '—'}
                            </div>
                          </>
                        ) : (
                          <div className="text-base font-semibold text-stone-500">Ставок нет</div>
                        )}
                        {lot.myBid > 0 && (
                          <div className="mt-0.5 text-[11px] font-medium text-emerald-400">
                            Ваша ставка: {fmtMoney(lot.myBid)}
                          </div>
                        )}
                        {!ended && lot.myAutoBid > 0 && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            <Bot className="size-3" aria-hidden /> Автоставка до {fmtMoney(lot.myAutoBid)}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={
                            'text-sm font-semibold tabular-nums ' +
                            (ended
                              ? 'text-stone-500'
                              : remainMs < 60000
                                ? 'animate-pulse text-red-400'
                                : 'text-[#d4a017]')
                          }
                        >
                          {ended ? 'Завершён' : fmtTimer(remainMs)}
                        </div>
                        <div className="flex items-center justify-end gap-1 text-[11px] text-stone-500">
                          {!ended && lot.bidCount > 0 && (
                            <span className="relative flex size-1" aria-hidden>
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d4a017] opacity-75" />
                              <span className="relative inline-flex size-1 rounded-full bg-[#d4a017]" />
                            </span>
                          )}
                          {lot.bidCount} {plural(lot.bidCount, 'ставка', 'ставки', 'ставок')}
                        </div>
                      </div>
                    </div>

                    {/* История ставок */}
                    {lot.bidCount > 0 && (
                      <div className="mt-3">
                        <button
                          onClick={() => void toggleHist(lot.id)}
                          className="flex w-full items-center justify-between rounded-lg border border-[#d4a017]/15 bg-black/20 px-3 py-2 text-[11px] font-medium text-stone-300 transition hover:border-[#d4a017]/35 hover:text-amber-50"
                          aria-expanded={openHist === lot.id}
                        >
                          <span className="flex items-center gap-1.5">
                            <History className="size-3.5 text-[#d4a017]" aria-hidden />
                            История ставок ({lot.bidCount})
                          </span>
                          {openHist === lot.id ? (
                            <ChevronUp className="size-3.5 text-stone-500" aria-hidden />
                          ) : (
                            <ChevronDown className="size-3.5 text-stone-500" aria-hidden />
                          )}
                        </button>
                        {openHist === lot.id && (
                          <div className="mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-[#d4a017]/10 bg-black/30 p-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d4a017]/25">
                            {histLoading && !histBids[lot.id] ? (
                              <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-stone-500">
                                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Загружаем торги…
                              </div>
                            ) : (histBids[lot.id]?.length ?? 0) === 0 ? (
                              <div className="py-3 text-center text-[11px] text-stone-500">Ставок пока не было</div>
                            ) : (
                              <div className="divide-y divide-stone-800/60">
                                {histBids[lot.id]!.map((b, i) => (
                                  <div
                                    key={b.id}
                                    className={
                                      'flex items-center gap-2 px-2.5 py-2 text-xs ' +
                                      (i === 0 ? 'bg-[#d4a017]/[0.07]' : '')
                                    }
                                  >
                                    <span
                                      className={
                                        'flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ' +
                                        (i === 0
                                          ? 'bg-[#d4a017] text-stone-950'
                                          : 'bg-stone-800 text-stone-400')
                                      }
                                    >
                                      {i + 1}
                                    </span>
                                    <span
                                      className={
                                        'min-w-0 flex-1 truncate ' +
                                        (b.isMe ? 'font-semibold text-emerald-400' : 'text-stone-300')
                                      }
                                    >
                                      {b.userName}
                                      {b.isMe && <span className="ml-1 text-[10px] font-normal text-emerald-500/80">(вы)</span>}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-stone-500">{timeAgo(b.createdAt)}</span>
                                    <span
                                      className={
                                        'shrink-0 font-semibold tabular-nums ' +
                                        (i === 0 ? 'text-[#d4a017]' : 'text-stone-400')
                                      }
                                    >
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

                    {!ended &&
                      (openBid === lot.id ? (
                        <div className="mt-3 rounded-xl border border-[#d4a017]/25 bg-black/40 p-3">
                          {/* переключатель режима ставки */}
                          <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/50 p-1">
                            {([
                              ['manual', 'Ставка вручную'],
                              ['auto', 'Автоставка'],
                            ] as const).map(([mode, label]) => (
                              <button
                                key={mode}
                                onClick={() => {
                                  setBidMode(mode)
                                  if (mode === 'auto') setAutoInput(lot.myAutoBid > 0 ? String(lot.myAutoBid) : String(minBid(lot)))
                                  else setBidInput(String(minBid(lot)))
                                  setBidError(null)
                                }}
                                className={
                                  'h-8 rounded-md text-[11px] font-semibold transition ' +
                                  (bidMode === mode
                                    ? 'bg-[#d4a017] text-stone-950'
                                    : 'text-stone-400 hover:text-stone-200')
                                }
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          {bidMode === 'manual' ? (
                            <>
                              <div className="mt-2 flex items-center justify-between text-[11px] text-stone-400">
                                <span>Минимальная ставка</span>
                                <span className="font-semibold tabular-nums text-[#d4a017]">{fmtMoney(minBid(lot))}</span>
                              </div>
                              <Input
                                className="mt-2 h-11 rounded-xl border-[#d4a017]/25 bg-[#0c0a09] text-base font-semibold text-amber-50 placeholder:text-stone-600"
                                inputMode="numeric"
                                value={bidInput}
                                placeholder={String(minBid(lot))}
                                aria-label={`Ваша ставка для лота ${lot.title}`}
                                onChange={(e) => setBidInput(e.target.value.replace(/[^\d]/g, ''))}
                              />
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                {[
                                  { label: '+мин', value: minBid(lot) },
                                  { label: '+5%', value: quick5 },
                                  { label: '+10%', value: quick10 },
                                ].map((b) => (
                                  <button
                                    key={b.label}
                                    onClick={() => {
                                      setBidInput(String(b.value))
                                      setBidError(null)
                                    }}
                                    className="h-11 rounded-lg border border-[#d4a017]/30 bg-[#d4a017]/10 text-xs font-semibold text-[#d4a017] transition active:scale-95"
                                  >
                                    {b.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
                                Автоставка сама перебивает соперников минимально необходимой суммой, пока ставка не превысит ваш потолок. Резервируются только фактические ставки.
                              </p>
                              <Input
                                className="mt-2 h-11 rounded-xl border-emerald-500/30 bg-[#0c0a09] text-base font-semibold text-amber-50 placeholder:text-stone-600"
                                inputMode="numeric"
                                value={autoInput}
                                placeholder="Ваш максимум, ₽"
                                aria-label={`Потолок автоставки для лота ${lot.title}`}
                                onChange={(e) => setAutoInput(e.target.value.replace(/[^\d]/g, ''))}
                              />
                              <div className="mt-2 flex items-center justify-between text-[11px] text-stone-400">
                                <span>Минимальный потолок</span>
                                <span className="font-semibold tabular-nums text-emerald-400">{fmtMoney(minBid(lot))}</span>
                              </div>
                            </>
                          )}

                          {bidError && <div className="mt-2 text-[11px] text-red-400">{bidError}</div>}
                          <div className="mt-2 flex items-center justify-between text-[11px] text-stone-500">
                            <span>Ваш баланс</span>
                            <span className="tabular-nums text-stone-300">{fmtMoney(session?.balance ?? 0)}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              className="h-11 rounded-xl border-stone-700 text-xs font-medium text-stone-300"
                              onClick={closePanel}
                            >
                              Отмена
                            </Button>
                            {bidMode === 'manual' ? (
                              <Button
                                className="h-11 rounded-xl text-xs font-semibold text-stone-950"
                                style={{ backgroundColor: GOLD }}
                                disabled={busy}
                                onClick={() => void placeBid(lot)}
                              >
                                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Подтвердить ставку'}
                              </Button>
                            ) : (
                              <Button
                                className="h-11 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                                disabled={autoBusy}
                                onClick={() => void placeAutoBid(lot)}
                              >
                                {autoBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : lot.myAutoBid > 0 ? 'Обновить потолок' : 'Включить автоставку'}
                              </Button>
                            )}
                          </div>
                          {bidMode === 'auto' && lot.myAutoBid > 0 && (
                            <button
                              onClick={() => void cancelAutoBid(lot)}
                              disabled={autoBusy}
                              className="mt-2 h-9 w-full rounded-lg border border-red-500/30 bg-red-500/10 text-[11px] font-medium text-red-300 transition active:scale-95"
                            >
                              Отменить автоставку
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                          <Button
                            className="h-11 rounded-xl text-sm font-semibold text-stone-950"
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
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                : 'border-[#d4a017]/30 bg-transparent text-[#d4a017]')
                            }
                            aria-label={lot.myAutoBid > 0 ? `Изменить автоставку для лота ${lot.title}` : `Включить автоставку для лота ${lot.title}`}
                            onClick={() => openPanel(lot, 'auto')}
                          >
                            <Bot className="size-4" aria-hidden />
                            Авто
                          </Button>
                        </div>
                      ))}
                  </div>
                )
              })
            )}

            {/* Как это работает */}
            <div className="rounded-2xl border border-[#d4a017]/20 bg-[#d4a017]/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#d4a017]">
                <Info className="size-4" aria-hidden /> Как это работает
              </div>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-stone-300">
                <li className="flex gap-2">
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-[#d4a017]" aria-hidden />
                  Лоты выставляет аукционный дом — редко, но метко.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-[#d4a017]" aria-hidden />
                  Боты торгуются живьём: ставки растут, пока идёт таймер.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-[#d4a017]" aria-hidden />
                  Победитель платит свою ставку и получает товар.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  Автоставка перебивает ботов за вас — до вашего потолка.
                </li>
              </ul>
            </div>

            <div className="pb-2 text-center text-[10px] text-stone-700">
              Аукционный дом · молоток падает, это игра
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
