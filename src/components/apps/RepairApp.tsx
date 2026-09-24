'use client'

// Приложение «Сервисный центр» — светлая мастерская: тёплый бежевый фон,
// оранжевый акцент, живой прогресс работ, оценка мастера.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  ArrowRight, CheckCircle2, ChevronDown, Coins, Hammer, Loader2, PackageOpen, Timer, Wrench,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import type { InventoryItemDTO, RepairOrderDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'

const ORANGE = '#ea580c'

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
    case 'new': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'excellent': return 'bg-lime-50 text-lime-700 border-lime-200'
    case 'good': return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'used': return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'parts': return 'bg-red-50 text-red-700 border-red-200'
    default: return 'bg-neutral-50 text-neutral-600 border-neutral-200'
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

function EmptyState({ icon: Icon, title, text }: { icon: typeof Wrench; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-4 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-50">
        <Icon className="size-6 text-orange-500" />
      </div>
      <div className="mt-2.5 text-sm font-semibold text-neutral-800">{title}</div>
      <div className="mt-1 max-w-64 text-xs leading-relaxed text-neutral-400">{text}</div>
    </div>
  )
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

  const nowMs = Date.now()
  const orders = data?.orders ?? []
  const repairable = data?.repairable ?? []

  return (
    <div className="flex h-full flex-col bg-[#faf9f7] text-neutral-900">
      {/* ---------- герой-шапка ---------- */}
      <div className="shrink-0 bg-gradient-to-br from-[#f59e0b] via-[#ea7c0c] to-[#d9560b] px-4 pb-5 pt-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <Wrench className="size-5.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold">Сервисный центр</div>
            <div className="mt-0.5 text-[11px] text-white/80">Ремонт и восстановление товаров</div>
          </div>
          <div className="flex shrink-0 flex-col items-end rounded-xl bg-white/15 px-3 py-1.5 backdrop-blur">
            <span className="text-[9px] uppercase tracking-widest text-white/70">Баланс</span>
            <span className="text-xs font-bold tabular-nums">{fmtMoney(session?.balance ?? 0)}</span>
          </div>
        </div>

        {/* шаги работы */}
        <div className="mt-4 flex items-center gap-2 text-[10px] font-medium text-white/85">
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 backdrop-blur">
            <PackageOpen className="size-3" aria-hidden /> Приёмка
          </span>
          <span className="h-px flex-1 bg-white/30" aria-hidden />
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 backdrop-blur">
            <Hammer className="size-3" aria-hidden /> Ремонт
          </span>
          <span className="h-px flex-1 bg-white/30" aria-hidden />
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 backdrop-blur">
            <CheckCircle2 className="size-3" aria-hidden /> Выдача
          </span>
        </div>
      </div>

      {/* ---------- контент ---------- */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-28 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-28 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-20 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
              <Loader2 className="size-4 animate-spin" /> Мастерская открывается…
            </div>
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <Button
              className="mt-4 h-11 rounded-xl px-6 text-sm font-semibold text-white"
              style={{ backgroundColor: ORANGE }}
              onClick={() => void load()}
            >
              Повторить
            </Button>
          </div>
        ) : data ? (
          <>
            {/* В ремонте */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-orange-100">
                  <Hammer className="size-3.5 text-orange-600" aria-hidden />
                </div>
                <div className="text-sm font-bold text-neutral-800">В ремонте</div>
                <span className="ml-auto rounded-full bg-neutral-200/80 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                  {orders.length}
                </span>
              </div>

              {orders.length === 0 ? (
                <EmptyState
                  icon={Wrench}
                  title="В ремонте пусто"
                  text="Отдайте мастеру товар в плохом состоянии — он вернётся в лучшем виде и дороже на рынке."
                />
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
                    <div key={order.id} className="shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                      <div className="flex gap-3 p-4">
                        <div className="relative">
                          <img
                            src={order.itemImage}
                            alt={order.itemTitle}
                            className="size-20 shrink-0 rounded-xl border border-neutral-200 object-cover"
                          />
                          {order.status === 'ready' && (
                            <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                              <CheckCircle2 className="size-3.5" aria-hidden />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-neutral-900">{order.itemTitle}</div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <ConditionBadge value={order.fromCondition} />
                            <ArrowRight className="size-3.5 shrink-0 text-orange-500" aria-hidden />
                            <ConditionBadge value={order.toCondition} />
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 text-xs text-neutral-500">
                            <Coins className="size-3.5 shrink-0 text-orange-500" aria-hidden />
                            Стоимость: <span className="font-semibold text-neutral-800">{fmtMoney(order.cost)}</span>
                          </div>
                        </div>
                      </div>

                      {order.status === 'ready' ? (
                        <div className="px-4 pb-4">
                          <Button
                            className="h-11 w-full rounded-xl text-sm font-semibold text-white shadow-[0_6px_18px_-6px_rgba(234,88,12,0.6)]"
                            style={{ backgroundColor: ORANGE }}
                            disabled={pickupBusy === order.id}
                            onClick={() => void pickup(order)}
                          >
                            {pickupBusy === order.id ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                              'Забрать из мастерской'
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="px-4 pb-4">
                          {/* полоса прогресса работ */}
                          <div className="relative h-2.5 overflow-hidden rounded-full bg-neutral-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-[width] duration-1000 ease-linear"
                              style={{ width: `${pct}%` }}
                            />
                            <span
                              className="absolute top-0 h-full w-0.5 bg-white/90 shadow"
                              style={{ left: `calc(${pct}% - 1px)` }}
                              aria-hidden
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1 text-neutral-400">
                              <Timer className="size-3" aria-hidden />
                              {pct}% выполнено
                            </span>
                            <span className="font-semibold tabular-nums text-orange-600">{remainLabel}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </section>

            {/* Доступно для ремонта */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-orange-100">
                  <PackageOpen className="size-3.5 text-orange-600" aria-hidden />
                </div>
                <div className="text-sm font-bold text-neutral-800">Доступно для ремонта</div>
                <span className="ml-auto rounded-full bg-neutral-200/80 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                  {repairable.length}
                </span>
              </div>

              {repairable.length === 0 ? (
                <EmptyState
                  icon={PackageOpen}
                  title="Ремонтировать нечего"
                  text="В инвентаре нет товаров, нуждающихся в ремонте. Купите что-нибудь «на запчасти» — мастер приведёт это в порядок."
                />
              ) : (
                repairable.map((item) => (
                  <div key={item.id} className="shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                    <div className="flex gap-3 p-4">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="size-16 shrink-0 rounded-xl border border-neutral-200 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-neutral-900">{item.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ConditionBadge value={item.condition} />
                          <span className="text-[11px] text-neutral-500">
                            Оценка после ремонта: <span className="font-semibold text-neutral-800">{fmtMoney(item.estValue)}</span>
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleOpen(item.id)}
                        aria-expanded={openItem === item.id}
                        aria-label={`Ремонт: ${item.title}`}
                        className="inline-flex h-10 shrink-0 items-center gap-1 self-center rounded-xl border border-orange-200 bg-orange-50 px-3.5 text-sm font-semibold text-orange-700 transition active:scale-95"
                      >
                        Ремонт
                        <ChevronDown
                          className={'size-4 transition-transform ' + (openItem === item.id ? 'rotate-180' : '')}
                          aria-hidden
                        />
                      </button>
                    </div>

                    {openItem === item.id && (
                      <div className="border-t border-dashed border-neutral-200 bg-neutral-50/70 p-4">
                        <p className="text-[11px] leading-relaxed text-neutral-500">
                          Мастер оценит работу при приёмке: цену и срок назовём в уведомлении сразу после отправки.
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-neutral-500">Ваш баланс</span>
                          <span className="font-semibold text-neutral-900">{fmtMoney(session?.balance ?? 0)}</span>
                        </div>
                        {itemError?.id === item.id && (
                          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">
                            {itemError.msg}
                          </div>
                        )}
                        <Button
                          className="mt-3 h-11 w-full rounded-xl text-sm font-semibold text-white"
                          style={{ backgroundColor: ORANGE }}
                          disabled={busyItem === item.id}
                          onClick={() => void sendToRepair(item)}
                        >
                          {busyItem === item.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            'Отправить в ремонт'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </section>

            <div className="pb-2 text-center text-[10px] text-neutral-400">
              Сервисный центр · гарантия мастера, это игра
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
