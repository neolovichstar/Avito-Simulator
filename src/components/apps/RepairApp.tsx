'use client'

// Приложение «Сервис» — Resale Dark: графит #050D09 + янтарь amber-500 (по макету юзера).
// Главная: подзаголовок «Инструменты для эффективной работы с товарами», сетка 2×3 плиток
// (Сканер/Калькулятор/Конвертер/Мои товары/Гайды/Советы — реальные функции и декоративная
// статика), баннер «Новые возможности», секции «В ремонте» и «Доступно для ремонта».
// Логика (api.repair / repairStart / repairPickup, живой прогресс) — без изменений.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowLeftRight, ArrowRight, BookOpen, Calculator, CheckCircle2, ChevronDown, ChevronRight, Coins, Hammer,
  Lightbulb, Loader2, PackageCheck, PackageOpen, ScanLine, Timer, Wrench, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import type { InventoryItemDTO, RepairOrderDTO } from '@/lib/types'

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
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ' +
        conditionClass(value)
      }
    >
      {CONDITION_LABEL[value] ?? value}
    </span>
  )
}

type ToolKey = 'scan' | 'calc' | 'conv' | 'items' | 'guide' | 'tips'
type SheetKey = 'scan' | 'calc' | 'conv' | 'guide' | 'tips' | null

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

  // Плитки по макету: Сканер/Калькулятор/Конвертер/Мои товары/Гайды/Советы.
  // «Мои товары» ведёт в реальный список инвентаря, остальные — статичные шторки-подсказки.
  const tools: { key: ToolKey; icon: typeof Wrench; title: string; sub: string; count: number | null; accent: boolean }[] = [
    { key: 'scan', icon: ScanLine, title: 'Сканер', sub: 'Шкала состояний товара', count: null, accent: true },
    { key: 'calc', icon: Calculator, title: 'Калькулятор', sub: 'Стоимость ремонта', count: null, accent: false },
    { key: 'conv', icon: ArrowLeftRight, title: 'Конвертер', sub: 'Состояние в цену', count: null, accent: true },
    { key: 'items', icon: PackageOpen, title: 'Мои товары', sub: 'Доступны для ремонта', count: repairable.length, accent: false },
    { key: 'guide', icon: BookOpen, title: 'Гайды', sub: 'Как работает мастер', count: null, accent: false },
    { key: 'tips', icon: Lightbulb, title: 'Советы', sub: 'Лайфхаки перепродажи', count: null, accent: false },
  ]

  const onTool = (key: ToolKey) => {
    if (key === 'items') scrollTo(itemsRef)
    else if (key === 'scan' || key === 'calc' || key === 'conv' || key === 'guide' || key === 'tips') setSheet(key as SheetKey)
  }

  return (
    <div
      className="flex h-full flex-col text-white"
      style={{ background: 'linear-gradient(180deg, #07130D 0%, #050D09 100%)' }}
    >
      {/* ---------- герой-шапка ---------- */}
      <div className="shrink-0 px-4 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/15">
            <Wrench className="size-5.5 text-amber-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold text-white">Сервис</div>
            <div className="mt-0.5 text-[11px] text-white/50">Ремонт и восстановление товаров</div>
          </div>
          <div className="flex shrink-0 flex-col items-end rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
            <span className="text-[9px] uppercase tracking-widest text-white/40">Баланс</span>
            <span className="text-xs font-bold tabular-nums text-white">{fmtMoney(session?.balance ?? 0)}</span>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-white/60">
          Инструменты для эффективной работы с товарами
        </p>
      </div>

      {/* ---------- контент ---------- */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 pt-0 [scrollbar-width:thin]">
        {/* сетка инструментов 2×3 */}
        <div className="grid grid-cols-2 gap-3">
          {tools.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTool(t.key)}
              aria-label={`${t.title}${t.count != null ? `: ${t.count}` : ''}`}
              className={
                'rounded-2xl border p-3.5 text-left transition active:scale-[0.98] ' +
                (t.accent
                  ? 'border-amber-400/20 bg-amber-500/10'
                  : 'border-white/[0.08] bg-white/[0.04]')
              }
            >
              <div className="flex items-start justify-between">
                <div className={'flex size-10 items-center justify-center rounded-xl ' + (t.accent ? 'bg-amber-500/15' : 'bg-emerald-500/15')}>
                  <t.icon className={'size-5 ' + (t.accent ? 'text-amber-400' : 'text-emerald-400')} aria-hidden />
                </div>
                {t.count != null && (
                  <span className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white/70">
                    {t.count}
                  </span>
                )}
              </div>
              <div className="mt-2.5 text-[14px] font-semibold leading-tight text-white">{t.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-white/50">{t.sub}</div>
            </button>
          ))}
        </div>

        {/* баннер «Новые возможности» */}
        <button
          type="button"
          onClick={() => setSheet('guide')}
          className="flex shrink-0 items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-left transition active:scale-[0.99]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15">
            <Lightbulb className="size-5 text-amber-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-white">Новые возможности</div>
            <div className="mt-0.5 text-[12px] leading-snug text-white/50">
              Ремонт поднимает состояние товара на шаг выше — и цену тоже
            </div>
          </div>
          <ChevronRight className="size-5 shrink-0 text-amber-400" aria-hidden />
        </button>

        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-32 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-20 animate-pulse rounded-xl bg-white/[0.06]" />
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex h-11 items-center rounded-2xl bg-amber-500 px-6 text-sm font-bold text-amber-950 transition active:scale-95"
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
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15">
                    <Hammer className="size-3.5 text-amber-400" aria-hidden />
                  </div>
                  <div className="text-[15px] font-semibold text-white">В ремонте</div>
                </div>
                {readyCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    <PackageCheck className="size-3" aria-hidden /> Готово: {readyCount}
                  </span>
                ) : (
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/60">
                    {orders.length}
                  </span>
                )}
              </div>

              {orders.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/15">
                    <Wrench className="size-6 text-amber-400" aria-hidden />
                  </div>
                  <div className="mt-2.5 text-sm font-semibold text-white/90">В ремонте пусто</div>
                  <div className="mt-1 max-w-64 text-xs leading-relaxed text-white/40">
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
                      className={
                        'shrink-0 rounded-2xl border p-4 ' +
                        (order.status === 'ready'
                          ? 'border-emerald-500/25 bg-[#0E1F16]'
                          : 'border-white/[0.08] bg-white/[0.04]')
                      }
                    >
                      <div className="flex gap-3">
                        <div className="relative">
                          <img
                            src={order.itemImage}
                            alt={order.itemTitle}
                            className="size-20 shrink-0 rounded-xl border border-white/10 object-cover"
                          />
                          {order.status === 'ready' && (
                            <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-[#052E16] shadow">
                              <CheckCircle2 className="size-3.5" aria-hidden />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold text-white">{order.itemTitle}</div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <ConditionBadge value={order.fromCondition} />
                            <ArrowRight className="size-3.5 shrink-0 text-amber-400" aria-hidden />
                            <ConditionBadge value={order.toCondition} />
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 text-[12px] text-white/50">
                            <Coins className="size-3.5 shrink-0 text-amber-400" aria-hidden />
                            Стоимость: <span className="font-semibold tabular-nums text-white">{fmtMoney(order.cost)}</span>
                          </div>
                        </div>
                      </div>

                      {order.status === 'ready' ? (
                        <div className="mt-3.5">
                          <button
                            type="button"
                            className="h-12 w-full rounded-2xl bg-[#22C55E] text-[15px] font-bold text-[#052E16] transition active:scale-[0.98] disabled:opacity-60"
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
                          {/* полоса прогресса работ */}
                          <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-[width] duration-1000 ease-linear"
                              style={{ width: `${pct}%` }}
                            />
                            <span
                              className="absolute top-0 h-full w-0.5 bg-white/90"
                              style={{ left: `calc(${pct}% - 1px)` }}
                              aria-hidden
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1 text-white/40">
                              <Timer className="size-3" aria-hidden />
                              {pct}% выполнено
                            </span>
                            <span className="font-semibold tabular-nums text-amber-300">{remainLabel}</span>
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
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15">
                    <PackageOpen className="size-3.5 text-amber-400" aria-hidden />
                  </div>
                  <div className="text-[15px] font-semibold text-white">Доступно для ремонта</div>
                </div>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/60">
                  {repairable.length}
                </span>
              </div>

              {repairable.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/15">
                    <PackageOpen className="size-6 text-amber-400" aria-hidden />
                  </div>
                  <div className="mt-2.5 text-sm font-semibold text-white/90">Ремонтировать нечего</div>
                  <div className="mt-1 max-w-64 text-xs leading-relaxed text-white/40">
                    В инвентаре нет товаров, нуждающихся в ремонте. Купите что-нибудь «на запчасти» — мастер приведёт это в порядок.
                  </div>
                </div>
              ) : (
                repairable.map((item) => (
                  <div
                    key={item.id}
                    className={
                      'shrink-0 rounded-2xl border ' +
                      (openItem === item.id ? 'border-amber-400/25 bg-[#0E1F16]' : 'border-white/[0.08] bg-white/[0.04]')
                    }
                  >
                    <div className="flex gap-3 p-4">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="size-16 shrink-0 rounded-xl border border-white/10 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-white">{item.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ConditionBadge value={item.condition} />
                          <span className="text-[11px] text-white/50">
                            Оценка после ремонта: <span className="font-semibold tabular-nums text-white">{fmtMoney(item.estValue)}</span>
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleOpen(item.id)}
                        aria-expanded={openItem === item.id}
                        aria-label={`Ремонт: ${item.title}`}
                        className="inline-flex h-10 shrink-0 items-center gap-1 self-center rounded-xl bg-amber-500/15 px-3.5 text-[13px] font-semibold text-amber-400 transition active:scale-95"
                      >
                        Ремонт
                        <ChevronDown
                          className={'size-4 transition-transform ' + (openItem === item.id ? 'rotate-180' : '')}
                          aria-hidden
                        />
                      </button>
                    </div>

                    {openItem === item.id && (
                      <div className="border-t border-white/[0.08] p-4">
                        <p className="text-[11px] leading-relaxed text-white/50">
                          Мастер оценит работу при приёмке: цену и срок назовём в уведомлении сразу после отправки.
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-white/50">Ваш баланс</span>
                          <span className="font-semibold tabular-nums text-white">{fmtMoney(session?.balance ?? 0)}</span>
                        </div>
                        {itemError?.id === item.id && (
                          <div className="mt-2 text-[11px] text-red-400">{itemError.msg}</div>
                        )}
                        <button
                          type="button"
                          className="mt-3 h-12 w-full rounded-2xl bg-amber-500 text-[15px] font-bold text-amber-950 transition active:scale-[0.98] disabled:opacity-60"
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

            <div className="pb-2 text-center text-[10px] text-white/30">
              Сервисный центр · гарантия мастера, это игра
            </div>
          </>
        ) : null}
      </div>

      {/* ---------- BOTTOM SHEET: статичные гайды/советы/калькулятор ---------- */}
      {sheet && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setSheet(null)}
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
          />
          <div className="relative max-h-[80%] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0E1F16] p-4 pb-6 [scrollbar-width:thin]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15">
                  {sheet === 'guide' ? (
                    <BookOpen className="size-4.5 text-amber-400" aria-hidden />
                  ) : sheet === 'tips' ? (
                    <Lightbulb className="size-4.5 text-amber-400" aria-hidden />
                  ) : sheet === 'scan' ? (
                    <ScanLine className="size-4.5 text-amber-400" aria-hidden />
                  ) : sheet === 'conv' ? (
                    <ArrowLeftRight className="size-4.5 text-amber-400" aria-hidden />
                  ) : (
                    <Calculator className="size-4.5 text-amber-400" aria-hidden />
                  )}
                </div>
                <div className="text-[15px] font-semibold text-white">
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
                className="flex size-8 items-center justify-center rounded-full text-white/50 transition active:scale-90"
              >
                <X className="size-4.5" aria-hidden />
              </button>
            </div>

            {sheet === 'scan' && (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-[12px] leading-relaxed text-white/60">
                  Шкала состояний товара: каждая ступень вверх — это дороже оценка на рынке.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['parts', 'used', 'good', 'excellent', 'new'] as const).map((c, i) => (
                    <span key={c} className="flex items-center gap-1.5">
                      {i > 0 && <ArrowRight className="size-3 text-amber-400" aria-hidden />}
                      <ConditionBadge value={c} />
                    </span>
                  ))}
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-[12px] leading-relaxed text-white/60">
                  «Сканируйте» свои товары в списке ниже: в карточке каждого уже видны текущее состояние и оценка после ремонта.
                </div>
              </div>
            )}

            {sheet === 'conv' && (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-[12px] leading-relaxed text-white/60">
                  Как ремонт конвертируется в цену: мастер поднимает состояние на ступень вверх — растёт и оценка товара.
                </p>
                <div className="flex flex-col gap-2">
                  {([
                    ['parts', 'good'],
                    ['used', 'excellent'],
                    ['good', 'new'],
                  ] as const).map(([from, to]) => (
                    <div key={from} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
                      <ConditionBadge value={from} />
                      <ArrowRight className="size-3.5 shrink-0 text-amber-400" aria-hidden />
                      <ConditionBadge value={to} />
                      <span className="ml-auto text-[11px] text-white/50">дороже оценка</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-white/70">
                  Точную сумму и срок мастер назовёт сразу после отправки товара в ремонт.
                </div>
              </div>
            )}

            {sheet === 'guide' && (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-[12px] leading-relaxed text-white/60">
                  Мастер улучшает состояние товара на один шаг вверх. Чем лучше состояние — тем выше рыночная оценка.
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    'Выбираете товар в инвентаре и отправляете в ремонт.',
                    'Мастер оценивает работу: цена списывается сразу, срок — считаные минуты.',
                    'Готовый товар возвращается в инвентарь в лучшем состоянии.',
                  ].map((step, i) => (
                    <div key={step} className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[11px] font-bold text-amber-300">
                        {i + 1}
                      </span>
                      <span className="text-[12px] leading-relaxed text-white/70">{step}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-[12px] leading-relaxed text-white/60">
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
                  <div key={tip} className="flex gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                    <span className="text-[12px] leading-relaxed text-white/70">{tip}</span>
                  </div>
                ))}
              </div>
            )}

            {sheet === 'calc' && (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-[12px] leading-relaxed text-white/60">
                  Мастер оценивает работу при приёмке: цена зависит от товара и его состояния, срок — считаные минуты.
                  Точную сумму и срок пришлём в уведомлении сразу после отправки товара.
                </p>
                <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
                  <Coins className="size-5 shrink-0 text-amber-400" aria-hidden />
                  <span className="text-[12px] leading-relaxed text-white/70">
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
