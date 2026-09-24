'use client'

// Приложение «Сервисный центр» — тёмная тех-мастерская: фон #111827, акцент #f59e0b.
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

const ORANGE = '#f59e0b'

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
    default: return 'bg-gray-500/15 text-gray-300 border-gray-500/30'
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
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-700 px-4 py-8 text-center">
      <Icon className="size-8 text-gray-600" />
      <div className="mt-2 text-sm font-medium text-gray-300">{title}</div>
      <div className="mt-1 max-w-60 text-xs leading-relaxed text-gray-500">{text}</div>
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
    <div className="flex h-full flex-col bg-[#111827] text-gray-100">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/15">
          <Wrench className="size-5 text-[#f59e0b]" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold text-white">Сервисный центр</div>
          <div className="text-xs text-gray-400">Ремонт и восстановление товаров</div>
        </div>
      </div>

      {/* Контент */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-2xl bg-gray-800" />
            <div className="h-24 animate-pulse rounded-2xl bg-gray-800" />
            <div className="h-10 animate-pulse rounded-2xl bg-gray-800" />
            <div className="h-20 animate-pulse rounded-2xl bg-gray-800" />
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 className="size-4 animate-spin" /> Мастерская открывается…
            </div>
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <Button
              className="mt-4 h-11 rounded-xl px-6 text-sm font-semibold text-gray-900"
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
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <Hammer className="size-4 text-[#f59e0b]" aria-hidden />
                В ремонте
                <span className="ml-auto rounded-full bg-gray-800 px-2 py-0.5 text-xs font-normal text-gray-400">
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
                    <div key={order.id} className="rounded-2xl border border-gray-700/60 bg-gray-800/60 p-3.5">
                      <div className="flex gap-3">
                        <img
                          src={order.itemImage}
                          alt={order.itemTitle}
                          className="size-20 shrink-0 rounded-xl border border-gray-700 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="truncate text-sm font-semibold text-gray-100">{order.itemTitle}</div>
                            {order.status === 'ready' ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                <CheckCircle2 className="size-3" aria-hidden /> Готов
                              </span>
                            ) : (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                <Timer className="size-3" aria-hidden /> В работе
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                            <ConditionBadge value={order.fromCondition} />
                            <ArrowRight className="size-3.5 shrink-0 text-[#f59e0b]" aria-hidden />
                            <ConditionBadge value={order.toCondition} />
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
                            <Coins className="size-3.5 shrink-0 text-[#f59e0b]" aria-hidden />
                            Стоимость:{' '}
                            <span className="font-medium text-gray-200">{fmtMoney(order.cost)}</span>
                          </div>
                        </div>
                      </div>

                      {order.status === 'ready' ? (
                        <Button
                          className="mt-3 h-11 w-full rounded-xl text-sm font-semibold text-gray-900"
                          style={{ backgroundColor: ORANGE }}
                          disabled={pickupBusy === order.id}
                          onClick={() => void pickup(order)}
                        >
                          {pickupBusy === order.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            'Забрать'
                          )}
                        </Button>
                      ) : (
                        <div className="mt-3">
                          <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-[width] duration-1000 ease-linear"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="mt-1.5 flex justify-between text-[11px] text-gray-400">
                            <span>{pct}% выполнено</span>
                            <span className="tabular-nums">{remainLabel}</span>
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
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <PackageOpen className="size-4 text-[#f59e0b]" aria-hidden />
                Доступно для ремонта
                <span className="ml-auto rounded-full bg-gray-800 px-2 py-0.5 text-xs font-normal text-gray-400">
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
                  <div key={item.id} className="rounded-2xl border border-gray-700/60 bg-gray-800/60 p-3.5">
                    <div className="flex gap-3">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="size-16 shrink-0 rounded-xl border border-gray-700 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-gray-100">{item.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ConditionBadge value={item.condition} />
                          <span className="text-[11px] text-gray-400">
                            Оценка: <span className="font-medium text-gray-200">{fmtMoney(item.estValue)}</span>
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleOpen(item.id)}
                        aria-expanded={openItem === item.id}
                        aria-label={`Ремонт: ${item.title}`}
                        className="inline-flex h-11 shrink-0 items-center gap-1 self-center rounded-xl border border-[#f59e0b]/40 px-3.5 text-sm font-medium text-[#f59e0b] transition active:scale-95"
                      >
                        Ремонт
                        <ChevronDown
                          className={'size-4 transition-transform ' + (openItem === item.id ? 'rotate-180' : '')}
                          aria-hidden
                        />
                      </button>
                    </div>

                    {openItem === item.id && (
                      <div className="mt-3 rounded-xl border border-gray-700 bg-gray-900/70 p-3">
                        <p className="text-[11px] leading-relaxed text-gray-400">
                          Мастер оценит работу при приёмке: цену и срок назовём в уведомлении сразу после отправки.
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-gray-400">Ваш баланс</span>
                          <span className="font-semibold text-gray-200">{fmtMoney(session?.balance ?? 0)}</span>
                        </div>
                        {itemError?.id === item.id && (
                          <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
                            {itemError.msg}
                          </div>
                        )}
                        <Button
                          className="mt-3 h-11 w-full rounded-xl text-sm font-semibold text-gray-900"
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

            <div className="pb-2 text-center text-[10px] text-gray-600">
              Сервисный центр · гарантия мастера, это игра
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
