'use client'

// Приложение «Аукцион», редизайн по макету upload/mockups/02-auction.png.
// Светлая тёплая система: фон #FAF6EE, белые карточки rounded-[20px] ring-black/[0.05],
// янтарный акцент #C77B28 (CTA ставки, активные чипы и табы), таймеры заканчивающихся
// лотов красные #D14343, обычные таймеры text-[#17181A]/45 tabular-nums.
// Экраны: список лотов (чипы категорий, строки с фото 96x96), карточка лота (галерея,
// каунтдаун, текущая ставка, история, «О лоте»), шторка «Ваша ставка» (крупная сумма,
// чипы инкрементов, плашка «Следующая минимальная ставка»), Избранное с сегментами
// Лоты / Мои ставки / Выигранные, нижний таб-бар Аукцион / Избранное / Мои ставки / Профиль.
// Бизнес-логика (api.auction*, ставки, автоставка, история торгов, realtime, антиснайпинг)
// сохранена без изменений. Общие детали в src/components/apps/auction/parts.tsx.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  ArrowLeft, Bell, Bot, ChevronDown, ChevronRight, Crown, FileText, Gavel, History, Loader2,
  Search, SearchX, Share, ShieldCheck, Tag, Timer, TrendingUp, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { getSocket } from '@/lib/use-realtime'
import { CATEGORY_LABEL, CONDITION_LABEL } from '@/lib/catalog-types'
import type { AuctionData, AuctionLotDTO } from '@/lib/types'
import {
  AMBER, BidAvatar, Cap, CountdownCard, EmptyCard, HeartBtn, ListSkeleton, LotRow, PLATE, RED,
  Segmented, StepChip, TabBar, bidStep, lotFlags, minBid, plural,
} from './auction/parts'
import type { AuctionTab } from './auction/parts'

// Тик раз в секунду через useSyncExternalStore, таймеры лотов живые, без setState внутри эффектов
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

interface BidRow {
  id: string
  userName: string
  amount: number
  createdAt: string
  isMe: boolean
}

type FavSegment = 'lots' | 'bids' | 'won'

export default function AuctionApp() {
  const session = useOS((s) => s.session)
  // тёмная тема ОС: тёплый кремовый фон заменяется системной тёмной страницей
  const osTheme = useOS((s) => s.theme)
  const [data, setData] = useState<AuctionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // нижние табы приложения + сегменты избранного
  const [tab, setTab] = useState<AuctionTab>('auction')
  const [favSeg, setFavSeg] = useState<FavSegment>('lots')
  // категории-чипы и поиск (список лотов)
  const [category, setCategory] = useState<string>('all')
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [openBid, setOpenBid] = useState<string | null>(null)
  const [bidInput, setBidInput] = useState('')
  const [bidError, setBidError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // автоставка (прокси-ставка): режим шторки и ввод потолка
  const [bidMode, setBidMode] = useState<'manual' | 'auto'>('manual')
  const [autoInput, setAutoInput] = useState('')
  const [autoBusy, setAutoBusy] = useState(false)
  // чип инкремента, подсвеченный янтарным сразу после нажатия
  const [pressedStep, setPressedStep] = useState<number | null>(null)
  // история ставок
  const [openHist, setOpenHist] = useState<string | null>(null)
  const [histBids, setHistBids] = useState<Record<string, BidRow[]>>({})
  const [histLoading, setHistLoading] = useState(false)
  // «О лоте»: раскрытые характеристики
  const [aboutOpen, setAboutOpen] = useState(false)
  // лот, у которого только что продлили таймер (антиснайпинг)
  const [extendedLot, setExtendedLot] = useState<string | null>(null)
  const [liveBids, setLiveBids] = useState(0)
  // карточка лота + избранное (клиентские, поверх существующих данных)
  const [detailId, setDetailId] = useState<string | null>(null)
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

  // Тихий refetch каждые 10 секунд, боты торгуются живьём
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
    setPressedStep(null)
  }

  const closePanel = () => {
    setOpenBid(null)
    setBidError(null)
    setPressedStep(null)
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

  const digits = (s: string): number => Math.floor(Number(s.replace(/[^\d]/g, '')) || 0)

  const placeBid = async (lot: AuctionLotDTO) => {
    const amount = digits(bidInput)
    const min = minBid(lot)
    if (amount < min) {
      setBidError(`Минимальная ставка ${fmtMoney(min)}`)
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
    const maxAmount = digits(autoInput)
    const min = minBid(lot)
    if (maxAmount < min) {
      setBidError(`Потолок не может быть ниже ${fmtMoney(min)}`)
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
      useOS.getState().pushToast('Автоставка', 'Отменена, ваша ставка-лидер сохранена')
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

  // чип инкремента: прибавляет сумму к текущему вводу и подсвечивается янтарным
  const applyStep = (stepValue: number, min: number) => {
    const cur = digits(bidMode === 'auto' ? autoInput : bidInput)
    const nextValue = String(Math.max(cur, min) + stepValue)
    if (bidMode === 'auto') setAutoInput(nextValue)
    else setBidInput(nextValue)
    setBidError(null)
    setPressedStep(stepValue)
    setTimeout(() => setPressedStep((curStep) => (curStep === stepValue ? null : curStep)), 550)
  }

  // колокольчик: сводка по финалам из уже загруженных данных
  const notifyEnding = () => {
    const n = (data?.lots ?? []).filter((l) => {
      const r = new Date(l.endsAt).getTime() - Date.now()
      return r > 0 && r < 300_000
    }).length
    const os = useOS.getState()
    os.pushToast('Аукцион', n > 0 ? `Скоро финал: ${n} ${plural(n, 'лот', 'лота', 'лотов')}, успейте сделать ставку` : 'В ближайшие 5 минут финалов нет')
  }

  // поделиться лотом (кнопка на карточке лота)
  const shareLot = async (lot: AuctionLotDTO) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: lot.title, text: `Аукцион: ${lot.title}` })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href)
        useOS.getState().pushToast('Аукцион', 'Ссылка на лот скопирована')
      }
    } catch {
      /* пользователь отменил шаринг */
    }
  }

  const nowMs = Date.now()
  const lots = data?.lots ?? []
  // Активные лоты первыми, внутри по времени окончания
  const sorted = [...lots].sort((a, b) => {
    const aEnd = new Date(a.endsAt).getTime()
    const bEnd = new Date(b.endsAt).getTime()
    const aActive = aEnd > nowMs ? 0 : 1
    const bActive = bEnd > nowMs ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return aEnd - bEnd
  })
  // категории-чипы из реальных лотов
  const categories = Array.from(new Set(lots.map((l) => l.category)))
  const q = query.trim().toLowerCase()
  const byQuery = (lot: AuctionLotDTO) => !q || lot.title.toLowerCase().includes(q)
  const byCategory = (lot: AuctionLotDTO) => category === 'all' || lot.category === category
  const isBidding = (lot: AuctionLotDTO) => lot.myBid > 0
  const isWon = (lot: AuctionLotDTO) => new Date(lot.endsAt).getTime() <= nowMs && lot.isMine

  // списки для табов
  const listLots =
    tab === 'auction'
      ? sorted.filter(byCategory).filter(byQuery)
      : tab === 'fav'
        ? sorted.filter((l) => {
            if (favSeg === 'lots') return favs.has(l.id)
            if (favSeg === 'bids') return isBidding(l)
            return isWon(l)
          }).filter(byQuery)
        : sorted.filter(isBidding).filter(byQuery)
  const bidsCount = lots.filter(isBidding).length

  const biddingLot = openBid ? sorted.find((l) => l.id === openBid) ?? null : null
  const detailLot = detailId ? sorted.find((l) => l.id === detailId) ?? null : null
  const bidAmount = digits(bidInput)
  const chipSteps = biddingLot ? [bidStep(biddingLot), bidStep(biddingLot) * 2, bidStep(biddingLot) * 5] : []

  const openLot = (id: string) => {
    setDetailId(id)
    setAboutOpen(false)
    setOpenHist(null)
  }

  const renderRows = (rows: AuctionLotDTO[]) => (
    <div className="flex flex-col gap-2.5">
      {rows.map((lot) => (
        <LotRow
          key={lot.id}
          lot={lot}
          flags={lotFlags(lot, nowMs)}
          fav={favs.has(lot.id)}
          extended={extendedLot === lot.id}
          onOpen={openLot}
          onFav={toggleFav}
        />
      ))}
    </div>
  )

  const renderListBody = () => {
    if (loading && !data) return <ListSkeleton />
    if (error && !data) {
      return (
        <div className="rounded-[20px] bg-white p-6 text-center ring-1 ring-black/[0.05]">
          <p className="text-sm text-[#D14343]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex h-12 items-center rounded-[14px] px-6 text-sm font-bold text-white transition active:scale-95"
            style={{ backgroundColor: AMBER }}
          >
            Повторить
          </button>
        </div>
      )
    }
    if (!data) return null
    if (listLots.length === 0) {
      if (tab === 'auction') {
        return (
          <EmptyCard
            icon={SearchX}
            title={q ? 'Ничего не найдено' : 'Лотов пока нет'}
            text={q ? 'Попробуйте изменить запрос или выбрать другую категорию.' : 'Аукционный дом скоро выставит новую распродажу, заглядывайте позже.'}
          />
        )
      }
      if (tab === 'fav') {
        return (
          <EmptyCard
            icon={SearchX}
            title={favSeg === 'lots' ? 'В избранном пусто' : favSeg === 'bids' ? 'Ставок ещё нет' : 'Пока нет побед'}
            text={
              favSeg === 'lots'
                ? 'Нажмите на сердечко у лота, чтобы вернуться к нему позже.'
                : favSeg === 'bids'
                  ? 'Сделайте ставку на любой лот, и он появится здесь.'
                  : 'Победы появятся, когда завершатся аукционы с вашими ставками.'
            }
          />
        )
      }
      return <EmptyCard icon={FileText} title="Ставок ещё нет" text="Сделайте ставку на любой лот, и он появится здесь." />
    }
    return renderRows(listLots)
  }

  return (
    <div className={`relative flex h-full flex-col overflow-hidden ${osTheme === 'dark' ? 'bg-[#121417]' : 'bg-[#FAF6EE]'} text-[#17181A]`}>
      {data && detailLot ? (
        <>
          {/* ================= КАРТОЧКА ЛОТА ================= */}
          {/* верхний бар: назад, сердце, поделиться */}
          <div className="z-10 flex shrink-0 items-center gap-1 px-4 pb-2 pt-3">
            <button
              type="button"
              onClick={() => setDetailId(null)}
              aria-label="Назад к лотам"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#17181A] ring-1 ring-black/[0.05] transition active:scale-95"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            <div className="flex-1" />
            <HeartBtn
              plain
              active={favs.has(detailLot.id)}
              onClick={() => toggleFav(detailLot.id)}
              label={favs.has(detailLot.id) ? `Убрать ${detailLot.title} из избранного` : `В избранное: ${detailLot.title}`}
            />
            <button
              type="button"
              onClick={() => void shareLot(detailLot)}
              aria-label="Поделиться лотом"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[#17181A] transition active:scale-95"
            >
              <Share className="size-[20px]" aria-hidden />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4 [scrollbar-width:thin]">
            {/* большая фотогалерея (в DTO одно изображение, счётчик 1/1) */}
            <div className="relative shrink-0">
              <img
                loading="lazy"
                decoding="async"
                src={detailLot.image}
                alt={detailLot.title}
                className="h-[290px] w-full object-cover"
              />
              <span
                className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white backdrop-blur"
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

            <div className="flex flex-col gap-3 px-4">
              {/* название и характеристики */}
              <div>
                <h1 className="text-[20px] font-bold leading-snug text-[#17181A]">{detailLot.title}</h1>
                <div className="mt-1 text-[14px] text-gray-500">
                  {CATEGORY_LABEL[detailLot.category] ?? detailLot.category} · Состояние: {CONDITION_LABEL[detailLot.condition] ?? detailLot.condition}
                </div>
                <div className="mt-0.5 text-[13px] text-gray-400">
                  Рыночная цена {fmtMoney(detailLot.baseValue)} · Старт {fmtMoney(detailLot.startPrice)}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-500">
                    <Tag className="size-4 text-[#17181A]/35" aria-hidden />
                    {CATEGORY_LABEL[detailLot.category] ?? detailLot.category}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-500">
                    <ShieldCheck className="size-4 text-[#17181A]/35" aria-hidden />
                    {CONDITION_LABEL[detailLot.condition] ?? detailLot.condition}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-500">
                    <TrendingUp className="size-4 text-[#17181A]/35" aria-hidden />
                    Рынок {fmtMoney(detailLot.baseValue)}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {detailLot.isMine && detailLot.currentBidderName != null && new Date(detailLot.endsAt).getTime() > nowMs && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                      style={{ backgroundColor: AMBER }}
                    >
                      <Crown className="size-3" aria-hidden /> Вы лидер
                    </span>
                  )}
                  {detailLot.myAutoBid > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F6EC] px-2.5 py-1 text-[11px] font-semibold text-[#067A47]">
                      <Bot className="size-3" aria-hidden /> Автоставка до {fmtMoney(detailLot.myAutoBid)}
                    </span>
                  )}
                  {extendedLot === detailLot.id && (
                    <span className="animate-pulse rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#D14343]">
                      Финал: таймер продлён
                    </span>
                  )}
                </div>
              </div>

              {/* блок «До окончания» с крупным таймером */}
              <CountdownCard remainMs={new Date(detailLot.endsAt).getTime() - nowMs} ended={new Date(detailLot.endsAt).getTime() <= nowMs} />

              {/* текущая ставка */}
              <div className="rounded-[20px] bg-white p-4 ring-1 ring-black/[0.05]">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <Cap>Текущая ставка</Cap>
                    {detailLot.currentBid != null ? (
                      <div className="mt-1 text-[26px] font-extrabold tabular-nums leading-none text-[#17181A]">
                        {fmtMoney(detailLot.currentBid)}
                      </div>
                    ) : (
                      <div className="mt-1 text-[18px] font-semibold text-gray-400">Ставок нет</div>
                    )}
                    {detailLot.currentBidderName && (
                      <div className="mt-1 truncate text-[12px] text-gray-500">Лидер: {detailLot.currentBidderName}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-[13px] tabular-nums text-gray-400">
                    {detailLot.bidCount} {plural(detailLot.bidCount, 'ставка', 'ставки', 'ставок')}
                  </span>
                </div>
                <div className="mt-3 border-t border-black/[0.05] pt-3">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-gray-500">Следующая минимальная ставка</span>
                    <span className="whitespace-nowrap font-bold tabular-nums text-[#17181A]">{fmtMoney(minBid(detailLot))}</span>
                  </div>
                  {detailLot.myBid > 0 && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-gray-500">Ваша ставка</span>
                      <span className="whitespace-nowrap font-semibold tabular-nums text-[#C97B1D]">{fmtMoney(detailLot.myBid)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* история ставок */}
              {detailLot.bidCount > 0 && (
                <div className="overflow-hidden rounded-[20px] bg-white ring-1 ring-black/[0.05]">
                  <button
                    type="button"
                    onClick={() => void toggleHist(detailLot.id)}
                    className="flex w-full items-center justify-between px-4 py-3.5 text-[14px] font-semibold text-[#17181A] transition active:scale-[0.99]"
                    aria-expanded={openHist === detailLot.id}
                  >
                    <span className="flex items-center gap-2">
                      <History className="size-4 text-[#C97B1D]" aria-hidden />
                      История ставок ({detailLot.bidCount})
                    </span>
                    {openHist === detailLot.id ? (
                      <ChevronDown className="size-4 text-gray-400" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4 text-gray-400" aria-hidden />
                    )}
                  </button>
                  {openHist === detailLot.id && (
                    <div className="max-h-52 overflow-y-auto border-t border-black/[0.05] [scrollbar-width:thin]">
                      {histLoading && !histBids[detailLot.id] ? (
                        <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-gray-400">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Загружаем торги…
                        </div>
                      ) : (histBids[detailLot.id]?.length ?? 0) === 0 ? (
                        <div className="py-4 text-center text-[12px] text-gray-400">Ставок пока не было</div>
                      ) : (
                        <div className="divide-y divide-[#EBEDF0]">
                          {histBids[detailLot.id]!.map((b, i) => (
                            <div key={b.id} className={'flex items-center gap-2.5 px-4 py-2.5 ' + (i === 0 ? 'bg-[#F8F1E3]/60' : '')}>
                              <BidAvatar name={b.userName} top={i === 0} />
                              <span className={'min-w-0 flex-1 truncate text-[13px] ' + (b.isMe ? 'font-semibold text-[#C97B1D]' : 'text-[#17181A]')}>
                                {b.userName}
                                {b.isMe && <span className="ml-1 text-[10px] font-normal text-[#C97B1D]/70">(вы)</span>}
                              </span>
                              <span className="shrink-0 text-[11px] text-gray-400">{timeAgo(b.createdAt)}</span>
                              <span className={'shrink-0 text-[13px] font-bold tabular-nums ' + (i === 0 ? 'text-[#C97B1D]' : 'text-[#17181A]')}>
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

              {/* «О лоте»: раскрытые характеристики */}
              <div className="overflow-hidden rounded-[20px] bg-white ring-1 ring-black/[0.05]">
                <button
                  type="button"
                  onClick={() => setAboutOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-[14px] font-semibold text-[#17181A] transition active:scale-[0.99]"
                  aria-expanded={aboutOpen}
                >
                  О лоте
                  {aboutOpen ? (
                    <ChevronDown className="size-4 text-gray-400" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4 text-gray-400" aria-hidden />
                  )}
                </button>
                {aboutOpen && (
                  <div className="border-t border-black/[0.05] px-4 py-3">
                    {([
                      ['Категория', CATEGORY_LABEL[detailLot.category] ?? detailLot.category, false],
                      ['Состояние', CONDITION_LABEL[detailLot.condition] ?? detailLot.condition, false],
                      ['Рыночная цена', fmtMoney(detailLot.baseValue), true],
                      ['Стартовая цена', fmtMoney(detailLot.startPrice), true],
                      ['Минимальный шаг', `+${fmtMoney(bidStep(detailLot))}`, true],
                      ['Лидер', detailLot.currentBidderName ?? 'Ставок нет', false],
                    ] as const).map(([label, value, num]) => (
                      <div key={label} className="mt-1.5 flex items-center justify-between gap-3 text-[13px] first:mt-0">
                        <span className="text-gray-500">{label}</span>
                        <span className={'truncate text-right ' + (num ? 'font-semibold tabular-nums text-[#17181A]' : 'font-medium text-[#17181A]')}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* нижняя CTA-панель */}
          {new Date(detailLot.endsAt).getTime() > nowMs ? (
            <div className="shrink-0 border-t border-black/[0.06] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
              <button
                type="button"
                onClick={() => openPanel(detailLot, 'manual')}
                className="h-[54px] w-full rounded-[14px] text-[16px] font-bold text-white transition active:scale-[0.98]"
                style={{ backgroundColor: AMBER }}
              >
                Сделать ставку
              </button>
            </div>
          ) : (
            <div className="shrink-0 border-t border-black/[0.06] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
              <div className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-neutral-200/50 text-[14px] font-semibold text-gray-400">
                Аукцион завершён
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ================= СПИСОК / ТАБЫ ================= */}
          <div className="shrink-0 px-4 pb-1 pt-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="text-[26px] font-bold leading-tight text-[#17181A]">
                  {tab === 'auction' ? 'Аукцион' : tab === 'fav' ? 'Избранное' : tab === 'bids' ? 'Мои ставки' : 'Профиль'}
                </h1>
                {tab === 'auction' && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-gray-500">
                    {liveBids > 0 && (
                      <span className="relative flex size-1.5" aria-hidden>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: AMBER }} />
                        <span className="relative inline-flex size-1.5 rounded-full" style={{ backgroundColor: AMBER }} />
                      </span>
                    )}
                    {liveBids > 0 ? `Торги живьём · +${liveBids} ставок` : 'Ставки приходят в реальном времени'}
                  </div>
                )}
                {tab === 'bids' && (
                  <div className="mt-0.5 text-[13px] text-gray-500">
                    {bidsCount > 0 ? `${bidsCount} ${plural(bidsCount, 'лот', 'лота', 'лотов')} с вашими ставками` : 'Здесь появятся лоты со ставками'}
                  </div>
                )}
              </div>
              {tab === 'auction' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSearch((v) => !v)}
                    aria-label={showSearch ? 'Скрыть поиск' : 'Поиск по лотам'}
                    aria-expanded={showSearch}
                    className={
                      'flex size-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 ' +
                      (showSearch ? 'text-[#C97B1D] ring-1' : 'bg-white text-[#17181A] ring-1 ring-black/[0.05]')
                    }
                    style={showSearch ? { backgroundColor: PLATE } : undefined}
                  >
                    <Search className="size-[18px]" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={notifyEnding}
                    aria-label="Финалы в ближайшие 5 минут"
                    className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#17181A] ring-1 ring-black/[0.05] transition active:scale-95"
                  >
                    <Bell className="size-[18px]" aria-hidden />
                    {(data?.lots ?? []).some((l) => {
                      const r = new Date(l.endsAt).getTime() - nowMs
                      return r > 0 && r < 300_000
                    }) && (
                      <span className="absolute right-2 top-2 size-1.5 rounded-full" style={{ backgroundColor: RED }} aria-hidden />
                    )}
                  </button>
                </>
              )}
            </div>

            {tab === 'auction' && showSearch && (
              <div className="relative mt-3">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по лотам"
                  aria-label="Поиск по лотам"
                  className="h-11 w-full rounded-full bg-white py-2.5 pl-10 pr-9 text-[13px] text-[#17181A] ring-1 ring-black/[0.06] outline-none placeholder:text-gray-400 focus:ring-[#C77B28]"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Очистить поиск"
                    className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition active:scale-90"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            )}

            {tab === 'fav' && (
              <div className="mt-3">
                <Segmented<FavSegment>
                  ariaLabel="Разделы избранного"
                  value={favSeg}
                  onChange={setFavSeg}
                  options={[
                    { key: 'lots', label: 'Лоты' },
                    { key: 'bids', label: 'Мои ставки' },
                    { key: 'won', label: 'Выигранные' },
                  ]}
                />
              </div>
            )}

            {tab === 'auction' && categories.length > 0 && (
              <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setCategory('all')}
                  className={
                    'h-10 shrink-0 rounded-full px-4 text-[13px] transition active:scale-95 ' +
                    (category === 'all' ? 'font-semibold text-white' : 'bg-white text-gray-500 ring-1 ring-black/[0.06]')
                  }
                  style={category === 'all' ? { backgroundColor: AMBER } : undefined}
                >
                  Все
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={
                      'h-10 shrink-0 rounded-full px-4 text-[13px] transition active:scale-95 ' +
                      (category === c ? 'font-semibold text-white' : 'bg-white text-gray-500 ring-1 ring-black/[0.06]')
                    }
                    style={category === c ? { backgroundColor: AMBER } : undefined}
                  >
                    {CATEGORY_LABEL[c] ?? c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---------- Контент таба ---------- */}
          <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-2 [scrollbar-width:thin]">
            {tab === 'profile' ? (
              /* ---------- Профиль ---------- */
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-[20px] bg-white p-4 ring-1 ring-black/[0.05]">
                  <span
                    className="flex size-14 shrink-0 items-center justify-center rounded-full text-[18px]"
                    style={{ backgroundColor: PLATE, color: AMBER }}
                    aria-hidden
                  >
                    <Gavel className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-bold text-[#17181A]">{session?.displayName ?? 'Игрок'}</div>
                    <div className="mt-0.5 text-[13px] text-gray-500">
                      {session?.city ? `${session.city} · ` : ''}Уровень {session?.level ?? 1}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Cap>Баланс</Cap>
                    <div className="mt-0.5 text-[18px] font-extrabold tabular-nums text-[#17181A]">
                      {fmtMoney(session?.balance ?? 0)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    ['Активные', data?.activeCount ?? 0],
                    ['Ставки', bidsCount],
                    ['Победы', data?.wonCount ?? 0],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="rounded-[20px] bg-white p-3 text-center ring-1 ring-black/[0.05]">
                      <div className="text-[20px] font-extrabold tabular-nums text-[#17181A]">{value}</div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-black/40">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-[20px] bg-white p-4 ring-1 ring-black/[0.05]">
                  <div className="text-[15px] font-bold text-[#17181A]">Как проходят торги</div>
                  <div className="mt-3 flex flex-col gap-3">
                    {([
                      [Gavel, 'Ставка резервирует сумму с баланса. Если её перебьют, деньги вернутся автоматически.'],
                      [Bot, 'Автоставка в шторке ставки сама перебивает соперников в пределах вашего потолка.'],
                      [Timer, 'Ставка в последнюю минуту продлевает финал: снайпинг бесполезен.'],
                    ] as const).map(([Icon, text]) => (
                      <div key={text} className="flex items-start gap-2.5">
                        <Icon className="mt-0.5 size-4 shrink-0 text-[#C97B1D]" aria-hidden />
                        <span className="text-[13px] leading-relaxed text-gray-500">{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              renderListBody()
            )}
          </div>

          {/* ---------- Нижний таб-бар ---------- */}
          <TabBar active={tab} bidsCount={bidsCount} onSelect={setTab} />
        </>
      )}

      {/* ---------- ШТОРКА «ВАША СТАВКА» ---------- */}
      {biddingLot && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end">
          <button type="button" aria-label="Закрыть панель ставки" onClick={closePanel} className="absolute inset-0 bg-neutral-400" />
          <div className="relative max-h-[90%] overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.18)] [scrollbar-width:thin]">
            {/* ручка-хваталка */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200" aria-hidden />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[22px] font-bold leading-tight text-[#17181A]">Ваша ставка</div>
                <div className="mt-0.5 truncate text-[14px] font-medium text-[#17181A]">{biddingLot.title}</div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Закрыть"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-200/50 text-gray-500 transition active:scale-90"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-0.5 text-[13px] text-gray-500">
              Текущая ставка {fmtMoney(biddingLot.currentBid ?? biddingLot.startPrice)}
            </div>

            {/* режим: вручную / автоставка */}
            <div className="mt-4">
              <Segmented<'manual' | 'auto'>
                ariaLabel="Режим ставки"
                value={bidMode}
                onChange={(mode) => {
                  setBidMode(mode)
                  if (mode === 'auto') setAutoInput(biddingLot.myAutoBid > 0 ? String(biddingLot.myAutoBid) : String(minBid(biddingLot)))
                  else setBidInput(String(minBid(biddingLot)))
                  setBidError(null)
                  setPressedStep(null)
                }}
                options={[
                  { key: 'manual', label: 'Ставка' },
                  { key: 'auto', label: 'Автоставка' },
                ]}
              />
            </div>

            {/* крупная сумма */}
            <div className="mt-4 flex h-[76px] items-center rounded-2xl bg-white ring-1 ring-black/[0.08]">
              <input
                className="h-full w-full bg-transparent text-center text-[34px] font-extrabold tabular-nums text-[#17181A] outline-none placeholder:text-[#17181A]/25"
                inputMode="numeric"
                value={bidMode === 'auto' ? autoInput : bidInput}
                placeholder={bidMode === 'auto' ? 'Потолок, ₽' : 'Ставка, ₽'}
                aria-label={bidMode === 'auto' ? `Потолок автоставки для лота ${biddingLot.title}` : `Ваша ставка для лота ${biddingLot.title}`}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, '')
                  if (bidMode === 'auto') setAutoInput(v)
                  else setBidInput(v)
                  setBidError(null)
                }}
              />
            </div>

            {/* чипы инкрементов */}
            <div className="mt-3 flex gap-2">
              {chipSteps.map((stepValue) => (
                <StepChip key={stepValue} value={stepValue} active={pressedStep === stepValue} onClick={() => applyStep(stepValue, minBid(biddingLot))} />
              ))}
            </div>

            {/* плашка следующей минимальной ставки */}
            <div className="mt-4 flex items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: PLATE }}>
              <Gavel className="size-6 shrink-0 text-[#C97B1D]" aria-hidden />
              <div className="min-w-0">
                <div className="text-[13px] text-gray-500">
                  {bidMode === 'manual' ? 'Следующая минимальная ставка' : 'Минимальный потолок автоставки'}
                </div>
                <div className="whitespace-nowrap text-[15px] font-bold tabular-nums text-[#17181A]">{fmtMoney(minBid(biddingLot))}</div>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <div className="text-[11px] uppercase tracking-[0.12em] text-black/40">Баланс</div>
                <div className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-[#17181A]">{fmtMoney(session?.balance ?? 0)}</div>
              </div>
            </div>

            {bidMode === 'auto' && (
              <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                Автоставка сама перебивает соперников минимально необходимой суммой, пока ставка не превысит ваш потолок. Резервируются только фактические ставки.
              </p>
            )}
            {bidError && <div className="mt-2 text-[12px] text-[#D14343]">{bidError}</div>}
            {bidMode === 'manual' && bidAmount > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-gray-400">
                <span className="min-w-0 flex-1">Победитель платит ровно свою ставку, без комиссии</span>
                <span className="whitespace-nowrap font-semibold tabular-nums text-[#17181A]">{fmtMoney(bidAmount)}</span>
              </div>
            )}

            {/* подтверждение */}
            <button
              type="button"
              className="mt-4 h-[54px] w-full rounded-[14px] text-[16px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: AMBER }}
              disabled={bidMode === 'manual' ? busy : autoBusy}
              onClick={() => (bidMode === 'manual' ? void placeBid(biddingLot) : void placeAutoBid(biddingLot))}
            >
              {bidMode === 'manual' ? (
                busy ? <Loader2 className="mx-auto size-5 animate-spin" aria-hidden /> : 'Подтвердить ставку'
              ) : autoBusy ? (
                <Loader2 className="mx-auto size-5 animate-spin" aria-hidden />
              ) : biddingLot.myAutoBid > 0 ? (
                'Обновить потолок'
              ) : (
                'Включить автоставку'
              )}
            </button>
            {bidMode === 'auto' && biddingLot.myAutoBid > 0 && (
              <button
                type="button"
                onClick={() => void cancelAutoBid(biddingLot)}
                disabled={autoBusy}
                className="mt-2 h-11 w-full rounded-[14px] bg-[#FDEEEE] text-[13px] font-semibold text-[#D14343] transition active:scale-95 disabled:opacity-60"
              >
                Отменить автоставку
              </button>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              Нажимая кнопку, вы соглашаетесь с правилами аукциона. Сумма ставки резервируется с баланса и вернётся, если её перебьют.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
