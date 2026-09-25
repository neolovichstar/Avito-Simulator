'use client'

// Приложение «Сервис» (Ремонт) — светлая система Resale: фон #F5F6FA, белые карточки radius 20,
// оранжевый акцент #E8702A (работы, стоимость), CTA-пилюли h-12 radius 12 с белым текстом.
// Композиция: крупная шапка 22 bold + баланс, сетка инструментов 2×3 (белые карточки с иконками),
// секции «В ремонте» (прогресс-бары с плавной заливкой) и «Доступно для ремонта» (состояние-HP
// прогресс-бар, оценка после ремонта, разворачиваемая CTA «Отправить в ремонт»), история ремонтов.
// Логика (api.repair / repairStart / repairPickup, живой прогресс) — без изменений.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowLeftRight, ArrowRight, BookOpen, Calculator, CheckCircle2, ChevronDown, ChevronRight, Coins,
  Lightbulb, Loader2, PackageCheck, PackageOpen, ScanLine, Timer, Wrench, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import type { InventoryItemDTO, RepairOrderDTO } from '@/lib/types'

// Единые токены светлой системы (акцент сервиса — оранжевый)
const ORANGE = '#E8702A'
const ORANGE_DEEP = '#C2620A'
const GREEN = '#21A03A'
const CARD_SHADOW = '0 2px 8px rgba(0,0,0,0.04)'

// Тик раз в секунду через useSyncExternalStore — прогресс-бары живые, без setState внутри эффектов
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

function fmtRemain(ms: number): string {
  const s = Math.ceil(ms / 1000)
  if (s >= 60) {
    const m = Math.floor(s / 60)
    const ss = s % 60
    return ss > 0 ? `${m} мин ${ss} с` : `${m} мин`
  }
  return `${s} с`
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

// «HP» вещи: условный процент состояния для прогресс-бара (UI-шкала, данные не меняет)
function conditionPct(c: string): number {
  switch (c) {
    case 'new': return 100
    case 'excellent': return 82
    case 'good': return 60
    case 'used': return 35
    case 'parts': return 12
    default: return 50
  }
}

// Цвет заливки по уровню состояния: плохо — оранжевый акцент, лучше — янтарь/зелёный
function conditionBarColor(pct: number): string {
  if (pct >= 75) return GREEN
  if (pct >= 45) return '#E8A020'
  return ORANGE
}

function ConditionBar({ value }: { value: string }) {
  const pct = conditionPct(value)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F1F5]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: conditionBarColor(pct) }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[10px] font-semibold tabular-nums text-[#9AA0A8]">{pct}%</span>
    </div>
  )
}

type ToolKey = 'scan' | 'calc' | 'conv' | 'items' | 'guide' | 'tips'
type SheetKey = 'scan' | 'calc' | 'conv' | 'guide' | 'tips' | null

// Локальная (сессионная) история завершённых ремонтов — заполняется при выдаче товара
interface HistEntry {
  id: string
  itemTitle: string
  fromCondition: string
  toCondition: string
  cost: number
  at: string
}

export default function RepairApp() {
  const session = useOS((s) => s.session)
  const [data, setData] = useState<{ orders: RepairOrderDTO[]; repairable: InventoryItemDTO[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [itemError, setItemError] = useState<{ id: string; msg: string } | null>(null)
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [pickupBusy, setPickupBusy] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetKey>(null)
  const [history, setHistory] = useState<HistEntry[]>([])
  const ordersRef = useRef<HTMLDivElement | null>(null)
  const itemsRef = useRef<HTMLDivElement | null>(null)

  useTick(1000) // перерисовка прогресса ремонта каждую секунду

  const load = useCallback(async () => {
    try {
      setError(null)
      const d = await api.repair()
      setData(d)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить сервисный центр')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleOpen = (id: string) => {
    setOpenItem((cur) => (cur === id ? null : id))
    setItemError(null)
  }

  const sendToRepair = async (item: InventoryItemDTO) => {
    setBusyItem(item.id)
    setItemError(null)
    try {
      const res = await api.repairStart(item.id)
      const os = useOS.getState()
      os.refreshSession({ balance: res.balance })
      os.pushToast('Ремонт', `Ремонт: цена ${fmtMoney(res.quote.cost)}, срок ${res.quote.minutes} мин`)
      setOpenItem(null)
      await load()
    } catch (e) {
      setItemError({
        id: item.id,
        msg: e instanceof ApiError ? e.message : 'Не удалось отправить товар в ремонт',
      })
    } finally {
      setBusyItem(null)
    }
  }

  const pickup = async (order: RepairOrderDTO) => {
    setPickupBusy(order.id)
    try {
      await api.repairPickup(order.id)
      const os = useOS.getState()
      os.refreshSession({}) // баланс не меняется — товар появляется в инвентаре
      os.pushToast('Ремонт', 'Товар готов')
      setHistory((prev) => [
        { id: order.id, itemTitle: order.itemTitle, fromCondition: order.fromCondition, toCondition: order.toCondition, cost: order.cost, at: new Date().toISOString() },
        ...prev,
      ].slice(0, 30))
      await load()
    } catch (e) {
      useOS.getState().pushToast('Ремонт', e instanceof ApiError ? e.message : 'Не удалось забрать товар')
    } finally {
      setPickupBusy(null)
    }
  }

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const nowMs = Date.now()
  const orders = data?.orders ?? []
  const repairable = data?.repairable ?? []
  const readyCount = orders.filter((o) => o.status === 'ready').length

  // Плитки: Сканер/Калькулятор/Конвертер/Мои товары/Гайды/Советы.
  // «Мои товары» ведёт в реальный список инвентаря, остальные — статичные шторки-подсказки.
  const tools: { key: ToolKey; icon: typeof Wrench; title: string; sub: string; count: number | null }[] = [
    { key: 'scan', icon: ScanLine, title: 'Сканер', sub: 'Шкала состояний товара', count: null },
    { key: 'calc', icon: Calculator, title: 'Калькулятор', sub: 'Стоимость ремонта', count: null },
    { key: 'conv', icon: ArrowLeftRight, title: 'Конвертер', sub: 'Состояние в цену', count: null },
    { key: 'items', icon: PackageOpen, title: 'Мои товары', sub: 'Доступны для ремонта', count: repairable.length },
    { key: 'guide', icon: BookOpen, title: 'Гайды', sub: 'Как работает мастер', count: null },
    { key: 'tips', icon: Lightbulb, title: 'Советы', sub: 'Лайфхаки перепродажи', count: null },
  ]

  const onTool = (key: ToolKey) => {
    if (key === 'items') scrollTo(itemsRef)
    else if (key === 'scan' || key === 'calc' || key === 'conv' || key === 'guide' || key === 'tips') setSheet(key as SheetKey)
  }

  return (
    <div className="flex h-full flex-col bg-[#F5F6FA] text-[#1A1A1A]">
      {/* ---------- шапка: крупный заголовок + баланс ---------- */}
      <div className="shrink-0 bg-[#F5F6FA] px-4 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-bold leading-tight">Сервис</div>
            <div className="mt-0.5 text-[13px] text-[#9AA0A8]">Ремонт и восстановление товаров</div>
          </div>
          <div className="flex shrink-0 flex-col items-end rounded-[14px] bg-white px-3 py-1.5" style={{ boxShadow: CARD_SHADOW }}>
            <span className="text-[9px] font-medium uppercase tracking-widest text-[#9AA0A8]">Баланс</span>
            <span className="text-xs font-bold tabular-nums">{fmtMoney(session?.balance ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* ---------- контент ---------- */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 pt-3 [scrollbar-width:thin]">
        {/* сетка инструментов 2×3 — белые карточки */}
        <div className="grid grid-cols-2 gap-3">
          {tools.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTool(t.key)}
              aria-label={`${t.title}${t.count != null ? `: ${t.count}` : ''}`}
              className="rounded-[20px] bg-white p-3.5 text-left transition active:scale-[0.98]"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <div className="flex items-start justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#FDEEE3]">
                  <t.icon className="size-5" style={{ color: ORANGE }} aria-hidden />
                </div>
                {t.count != null && (
                  <span className="rounded-full bg-[#F0F1F5] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#1A1A1A]">
                    {t.count}
                  </span>
                )}
              </div>
              <div className="mt-2.5 text-[14px] font-semibold leading-tight">{t.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-[#9AA0A8]">{t.sub}</div>
            </button>
          ))}
        </div>

        {/* баннер «Новые возможности» */}
        <button
          type="button"
          onClick={() => setSheet('guide')}
          className="flex shrink-0 items-center gap-3 rounded-[20px] bg-[#FDEEE3] p-4 text-left transition active:scale-[0.99]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white">
            <Lightbulb className="size-5" style={{ color: ORANGE }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">Новые возможности</div>
            <div className="mt-0.5 text-[12px] leading-snug" style={{ color: ORANGE_DEEP }}>
              Ремонт поднимает состояние товара на шаг выше — и цену тоже
            </div>
          </div>
          <ChevronRight className="size-5 shrink-0" style={{ color: ORANGE }} aria-hidden />
        </button>

        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-12 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
            <div className="h-32 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
            <div className="h-20 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
          </div>
        ) : error && !data ? (
          <div className="rounded-[20px] bg-white p-6 text-center" style={{ boxShadow: CARD_SHADOW }}>
            <p className="text-sm text-[#D14343]">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex h-12 items-center rounded-xl px-6 text-sm font-bold text-white transition active:scale-95"
              style={{ backgroundColor: ORANGE }}
            >
              Повторить
            </button>
          </div>
        ) : data ? (
          <>
            {/* В ремонте */}
            <section ref={ordersRef} className="flex flex-col gap-3 scroll-mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-[18px] font-bold">В ремонте</div>
                </div>
                {readyCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F6EC] px-2.5 py-1 text-[11px] font-semibold text-[#067A47]">
                    <PackageCheck className="size-3" aria-hidden /> Готово: {readyCount}
                  </span>
                ) : (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#9AA0A8] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                    {orders.length}
                  </span>
                )}
              </div>

              {orders.length === 0 ? (
                <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-8 text-center" style={{ boxShadow: CARD_SHADOW }}>
                  <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
                    <Wrench className="size-6 text-[#9AA0A8]" aria-hidden />
                  </div>
                  <div className="mt-3 text-[15px] font-semibold">В ремонте пусто</div>
                  <div className="mt-1 max-w-64 text-[13px] leading-relaxed text-[#9AA0A8]">
                    Отдайте мастеру товар в плохом состоянии — он вернётся в лучшем виде и дороже на рынке.
                  </div>
                </div>
              ) : (
                orders.map((order) => {
                  const start = new Date(order.startedAt).getTime()
                  const ready = new Date(order.readyAt).getTime()
                  const total = Math.max(1000, ready - start)
                  const elapsed = Math.min(Math.max(nowMs - start, 0), total)
                  const pct = Math.min(100, Math.round((elapsed / total) * 100))
                  const remain = Math.max(0, ready - nowMs)
                  const remainLabel =
                    order.status === 'ready'
                      ? 'Готов'
                      : remain <= 0
                        ? 'Завершается…'
                        : `Осталось ${fmtRemain(remain)}`
                  return (
                    <div
                      key={order.id}
                      className="shrink-0 rounded-[20px] bg-white p-4"
                      style={{ boxShadow: CARD_SHADOW }}
                    >
                      <div className="flex gap-3">
                        <div className="relative">
                          <img
                            src={order.itemImage}
                            alt={order.itemTitle}
                            className="size-20 shrink-0 rounded-2xl object-cover"
                          />
                          {order.status === 'ready' && (
                            <span
                              className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full text-white shadow"
                              style={{ backgroundColor: GREEN }}
                            >
                              <CheckCircle2 className="size-3.5" aria-hidden />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold">{order.itemTitle}</div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <ConditionBadge value={order.fromCondition} />
                            <ArrowRight className="size-3.5 shrink-0" style={{ color: ORANGE }} aria-hidden />
                            <ConditionBadge value={order.toCondition} />
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 text-[12px] text-[#9AA0A8]">
                            <Coins className="size-3.5 shrink-0" style={{ color: ORANGE }} aria-hidden />
                            Стоимость: <span className="font-semibold tabular-nums" style={{ color: ORANGE }}>{fmtMoney(order.cost)}</span>
                          </div>
                        </div>
                      </div>

                      {order.status === 'ready' ? (
                        <div className="mt-3.5">
                          <button
                            type="button"
                            className="h-12 w-full rounded-xl text-[15px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
                            style={{ backgroundColor: GREEN }}
                            disabled={pickupBusy === order.id}
                            onClick={() => void pickup(order)}
                          >
                            {pickupBusy === order.id ? (
                              <Loader2 className="mx-auto size-4 animate-spin" aria-hidden />
                            ) : (
                              'Забрать из мастерской'
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3.5">
                          {/* полоса прогресса работ — плавная оранжевая заливка */}
                          <div className="relative h-2 overflow-hidden rounded-full bg-[#F0F1F5]">
                            <div
                              className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                              style={{ width: `${pct}%`, backgroundColor: ORANGE }}
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1 text-[#9AA0A8]">
                              <Timer className="size-3" aria-hidden />
                              {pct}% выполнено
                            </span>
                            <span className="font-semibold tabular-nums" style={{ color: ORANGE_DEEP }}>{remainLabel}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </section>

            {/* Доступно для ремонта */}
            <section ref={itemsRef} className="flex flex-col gap-3 scroll-mt-2">
              <div className="flex items-center justify-between">
                <div className="text-[18px] font-bold">Доступно для ремонта</div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#9AA0A8] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                  {repairable.length}
                </span>
              </div>

              {repairable.length === 0 ? (
                <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-8 text-center" style={{ boxShadow: CARD_SHADOW }}>
                  <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
                    <PackageOpen className="size-6 text-[#9AA0A8]" aria-hidden />
                  </div>
                  <div className="mt-3 text-[15px] font-semibold">Ремонтировать нечего</div>
                  <div className="mt-1 max-w-64 text-[13px] leading-relaxed text-[#9AA0A8]">
                    В инвентаре нет товаров, нуждающихся в ремонте. Купите что-нибудь «на запчасти» — мастер приведёт это в порядок.
                  </div>
                </div>
              ) : (
                repairable.map((item) => (
                  <div
                    key={item.id}
                    className="shrink-0 rounded-[20px] bg-white"
                    style={{ boxShadow: CARD_SHADOW }}
                  >
                    <div className="flex gap-3 p-4">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="size-16 shrink-0 rounded-2xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold">{item.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ConditionBadge value={item.condition} />
                          <span className="text-[11px] text-[#9AA0A8]">
                            Оценка после ремонта: <span className="font-semibold tabular-nums text-[#1A1A1A]">{fmtMoney(item.estValue)}</span>
                          </span>
                        </div>
                        {/* состояние-«HP» вещи */}
                        <div className="mt-2">
                          <ConditionBar value={item.condition} />
                        </div>
                      </div>
                      <button
                        onClick={() => toggleOpen(item.id)}
                        aria-expanded={openItem === item.id}
                        aria-label={`Ремонт: ${item.title}`}
                        className="inline-flex h-10 shrink-0 items-center gap-1 self-center rounded-xl bg-[#FDEEE3] px-3.5 text-[13px] font-semibold transition active:scale-95"
                        style={{ color: ORANGE_DEEP }}
                      >
                        Ремонт
                        <ChevronDown
                          className={'size-4 transition-transform ' + (openItem === item.id ? 'rotate-180' : '')}
                          aria-hidden
                        />
                      </button>
                    </div>

                    {openItem === item.id && (
                      <div className="border-t border-[#F0F1F5] p-4">
                        <p className="text-[11px] leading-relaxed text-[#9AA0A8]">
                          Мастер оценит работу при приёмке: цену и срок назовём в уведомлении сразу после отправки.
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-[#9AA0A8]">Ваш баланс</span>
                          <span className="font-semibold tabular-nums">{fmtMoney(session?.balance ?? 0)}</span>
                        </div>
                        {itemError?.id === item.id && (
                          <div className="mt-2 text-[11px] text-[#D14343]">{itemError.msg}</div>
                        )}
                        <button
                          type="button"
                          className="mt-3 h-12 w-full rounded-xl text-[15px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
                          style={{ backgroundColor: ORANGE }}
                          disabled={busyItem === item.id}
                          onClick={() => void sendToRepair(item)}
                        >
                          {busyItem === item.id ? (
                            <Loader2 className="mx-auto size-4 animate-spin" aria-hidden />
                          ) : (
                            'Отправить в ремонт'
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </section>

            {/* История ремонтов (сессия): белые ряды */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="text-[18px] font-bold">История ремонтов</div>
                {history.length > 0 && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#9AA0A8] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                    {history.length}
                  </span>
                )}
              </div>
              <div className="overflow-hidden rounded-[20px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
                {history.length === 0 ? (
                  <div className="px-4 py-5 text-center text-[12px] text-[#9AA0A8]">
                    Забранные из мастерской товары появятся здесь
                  </div>
                ) : (
                  <div className="divide-y divide-[#F0F1F5]">
                    {history.map((h) => (
                      <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E6F6EC]">
                          <CheckCircle2 className="size-4" style={{ color: GREEN }} aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold">{h.itemTitle}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#9AA0A8]">
                            {CONDITION_LABEL[h.fromCondition] ?? h.fromCondition}
                            <ArrowRight className="size-3 shrink-0" style={{ color: ORANGE }} aria-hidden />
                            {CONDITION_LABEL[h.toCondition] ?? h.toCondition}
                            <span className="text-[#9AA0A8]/70">· {timeAgo(h.at)}</span>
                          </div>
                        </div>
                        <span className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: ORANGE }}>
                          −{fmtMoney(h.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="pb-2 text-center text-[10px] text-[#9AA0A8]">
              Сервисный центр · гарантия мастера, это игра
            </div>
          </>
        ) : null}
      </div>

      {/* ---------- BOTTOM SHEET: статичные гайды/советы/калькулятор (белая) ---------- */}
      {sheet && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setSheet(null)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative max-h-[80%] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(24px+env(safe-area-inset-bottom))] [scrollbar-width:thin]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#E8EAED]" aria-hidden />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-[#FDEEE3]">
                  {sheet === 'guide' ? (
                    <BookOpen className="size-4" style={{ color: ORANGE }} aria-hidden />
                  ) : sheet === 'tips' ? (
                    <Lightbulb className="size-4" style={{ color: ORANGE }} aria-hidden />
                  ) : sheet === 'scan' ? (
                    <ScanLine className="size-4" style={{ color: ORANGE }} aria-hidden />
                  ) : sheet === 'conv' ? (
                    <ArrowLeftRight className="size-4" style={{ color: ORANGE }} aria-hidden />
                  ) : (
                    <Calculator className="size-4" style={{ color: ORANGE }} aria-hidden />
                  )}
                </div>
                <div className="text-[15px] font-semibold">
                  {sheet === 'guide'
                    ? 'Гайд: как работает мастер'
                    : sheet === 'tips'
                      ? 'Советы мастера'
                      : sheet === 'scan'
                        ? 'Сканер состояния'
                        : sheet === 'conv'
                          ? 'Конвертер состояния'
                          : 'Стоимость ремонта'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSheet(null)}
                aria-label="Закрыть"
                className="flex size-8 items-center justify-center rounded-full bg-[#F0F1F5] text-[#9AA0A8] transition active:scale-90"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {sheet === 'scan' && (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-[12px] leading-relaxed text-[#5F6368]">
                  Шкала состояний товара: каждая ступень вверх — это дороже оценка на рынке.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['parts', 'used', 'good', 'excellent', 'new'] as const).map((c, i) => (
                    <span key={c} className="flex items-center gap-1.5">
                      {i > 0 && <ArrowRight className="size-3" style={{ color: ORANGE }} aria-hidden />}
                      <ConditionBadge value={c} />
                    </span>
                  ))}
                </div>
                <div className="rounded-xl bg-[#F5F6FA] p-3 text-[12px] leading-relaxed text-[#5F6368]">
                  «Сканируйте» свои товары в списке ниже: в карточке каждого уже видны текущее состояние и оценка после ремонта.
                </div>
              </div>
            )}

            {sheet === 'conv' && (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-[12px] leading-relaxed text-[#5F6368]">
                  Как ремонт конвертируется в цену: мастер поднимает состояние на ступень вверх — растёт и оценка товара.
                </p>
                <div className="flex flex-col gap-2">
                  {([
                    ['parts', 'good'],
                    ['used', 'excellent'],
                    ['good', 'new'],
                  ] as const).map(([from, to]) => (
                    <div key={from} className="flex items-center gap-2 rounded-xl bg-[#F5F6FA] px-3 py-2.5">
                      <ConditionBadge value={from} />
                      <ArrowRight className="size-3.5 shrink-0" style={{ color: ORANGE }} aria-hidden />
                      <ConditionBadge value={to} />
                      <span className="ml-auto text-[11px] text-[#9AA0A8]">дороже оценка</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-[#FDEEE3] p-3 text-[12px] leading-relaxed" style={{ color: ORANGE_DEEP }}>
                  Точную сумму и срок мастер назовёт сразу после отправки товара в ремонт.
                </div>
              </div>
            )}

            {sheet === 'guide' && (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-[12px] leading-relaxed text-[#5F6368]">
                  Мастер улучшает состояние товара на один шаг вверх. Чем лучше состояние — тем выше рыночная оценка.
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    'Выбираете товар в инвентаре и отправляете в ремонт.',
                    'Мастер оценивает работу: цена списывается сразу, срок — считаные минуты.',
                    'Готовый товар возвращается в инвентарь в лучшем состоянии.',
                  ].map((step, i) => (
                    <div key={step} className="flex items-center gap-2.5 rounded-xl bg-[#F5F6FA] p-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#FDEEE3] text-[11px] font-bold" style={{ color: ORANGE_DEEP }}>
                        {i + 1}
                      </span>
                      <span className="text-[12px] leading-relaxed text-[#5F6368]">{step}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-[#F5F6FA] p-3 text-[12px] leading-relaxed text-[#5F6368]">
                  Купите товар «на запчасти» дешевле рынка, отправьте в ремонт и выставите снова — разница в оценке и есть ваш заработок.
                </div>
              </div>
            )}

            {sheet === 'tips' && (
              <div className="mt-3 flex flex-col gap-2">
                {[
                  'Следите за балансом: стоимость ремонта спишется сразу при отправке.',
                  'Готовый товар появится в инвентаре — сразу выставляйте его на продажу.',
                  'Товары в состоянии «Запчасти» стоят копейки — идеальный кандидат на мастерскую.',
                  'Держите пару заказов в работе: пока один ремонтируется, продаёте другой.',
                ].map((tip) => (
                  <div key={tip} className="flex gap-2.5 rounded-xl bg-[#F5F6FA] p-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: GREEN }} aria-hidden />
                    <span className="text-[12px] leading-relaxed text-[#5F6368]">{tip}</span>
                  </div>
                ))}
              </div>
            )}

            {sheet === 'calc' && (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-[12px] leading-relaxed text-[#5F6368]">
                  Мастер оценивает работу при приёмке: цена зависит от товара и его состояния, срок — считаные минуты.
                  Точную сумму и срок пришлём в уведомлении сразу после отправки товара.
                </p>
                <div className="flex items-center gap-3 rounded-xl bg-[#FDEEE3] p-3">
                  <Coins className="size-5 shrink-0" style={{ color: ORANGE }} aria-hidden />
                  <span className="text-[12px] leading-relaxed" style={{ color: ORANGE_DEEP }}>
                    Оценка после ремонта видна в карточке каждого товара в списке «Доступно для ремонта».
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
