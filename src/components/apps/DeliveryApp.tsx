'use client'

// Приложение «Доставки» — служба доставки: белый фон, тёмно-зелёный акцент #065f46.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, PackageCheck, PackageOpen, Truck,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import type { DeliveryDTO } from '@/lib/types'

const GREEN = '#065f46'

// Тик раз в секунду через useSyncExternalStore — ETA-таймер живой, без setState внутри эффектов
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
  const s = Math.max(0, Math.ceil(ms / 1000))
  if (s >= 60) return `${Math.floor(s / 60)}м ${String(s % 60).padStart(2, '0')}с`
  return `${s} с`
}

export default function DeliveryApp() {
  const [data, setData] = useState<DeliveryDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useTick(1000) // живой отсчёт ETA

  const load = useCallback(async (silent = false) => {
    try {
      const d = await api.deliveries()
      setData(d.items)
      setError(null)
    } catch (e) {
      if (!silent) setError(e instanceof ApiError ? e.message : 'Не удалось загрузить доставки')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Тихий refetch каждые 5 секунд — доставки приходят в реальном времени
  useEffect(() => {
    const id = setInterval(() => {
      void load(true)
    }, 5000)
    return () => clearInterval(id)
  }, [load])

  const nowMs = Date.now()
  const items = data ?? []
  // Хронологический порядок: новые сверху
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <div className="flex h-full flex-col bg-white text-neutral-900">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50">
          <Truck className="size-5" style={{ color: GREEN }} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold text-neutral-900">Доставки</div>
          <div className="text-xs text-neutral-500">Посылки от продавцов и их статус</div>
        </div>
      </div>

      {/* Контент */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-40 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-40 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
              <Loader2 className="size-4 animate-spin" /> Загрузка доставок…
            </div>
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-4 h-11 rounded-xl px-6 text-sm font-semibold text-white transition active:scale-95"
              style={{ backgroundColor: GREEN }}
            >
              Повторить
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-600" aria-hidden />
              Посылки приходят в реальном времени — обновляем сами
            </div>

            {sorted.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center">
                <PackageOpen className="size-8 text-neutral-300" aria-hidden />
                <div className="mt-2 text-sm font-medium text-neutral-700">Доставок пока нет</div>
                <div className="mt-1 max-w-64 text-xs leading-relaxed text-neutral-400">
                  Курьером можно получить товар при покупке в Avito — выберите доставку при оплате.
                </div>
              </div>
            ) : (
              sorted.map((d) => {
                const remain = new Date(d.eta).getTime() - nowMs
                const worse =
                  d.status === 'delivered' &&
                  d.realCondition != null &&
                  (CONDITION_MULT[d.realCondition] ?? 1) < (CONDITION_MULT[d.listedCondition] ?? 1)
                return (
                  <div key={d.id} className="rounded-2xl border border-neutral-200 p-4 shadow-sm">
                    {/* Статус + курьер */}
                    <div className="flex items-center justify-between gap-2">
                      {d.status === 'in_transit' ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          <Truck className="size-3" aria-hidden /> В пути
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                          <PackageCheck className="size-3" aria-hidden /> Доставлено
                        </span>
                      )}
                      <span className="truncate text-[11px] text-neutral-500">Курьер: {d.courier}</span>
                    </div>

                    {/* Товар */}
                    <div className="mt-3 flex gap-3">
                      <img
                        src={d.image}
                        alt={d.title}
                        className="size-20 shrink-0 rounded-xl border border-neutral-200 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-neutral-900">{d.title}</div>
                        <div className="mt-0.5 text-base font-bold tabular-nums" style={{ color: GREEN }}>
                          {fmtMoney(d.price)}
                        </div>
                        <div className="mt-1 text-[11px] text-neutral-500">
                          Состояние по описанию:{' '}
                          <span className="font-medium text-neutral-700">
                            {CONDITION_LABEL[d.listedCondition] ?? d.listedCondition}
                          </span>
                        </div>
                      </div>
                    </div>

                    {d.status === 'in_transit' ? (
                      <>
                        {/* ETA */}
                        <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5">
                          <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                            <Clock className="size-3.5 text-amber-600" aria-hidden /> Прибудет через
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-amber-700">
                            {remain <= 0 ? 'Курьер уже близко' : `Осталось ${fmtRemain(remain)}`}
                          </span>
                        </div>
                        {/* Предупреждение */}
                        <div className="mt-2 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
                          <p className="text-[11px] leading-relaxed text-amber-800">
                            Осмотр при получении невозможен. Курьерская доставка — риск скрытых дефектов.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Итог осмотра */}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          {worse ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                              <AlertTriangle className="size-3" aria-hidden /> Есть дефекты
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="size-3" aria-hidden /> Как в описании
                            </span>
                          )}
                          <span className="shrink-0 text-[11px] text-neutral-400">
                            {d.deliveredAt ? timeAgo(d.deliveredAt) : null}
                          </span>
                        </div>
                        {worse && (
                          <p className="mt-1.5 text-[11px] font-medium text-red-600">
                            Продавец приукрасил состояние
                          </p>
                        )}
                        {d.realCondition && (
                          <div className="mt-1 text-[11px] text-neutral-500">
                            Фактическое состояние:{' '}
                            <span className="font-medium text-neutral-700">
                              {CONDITION_LABEL[d.realCondition] ?? d.realCondition}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })
            )}

            <div className="pb-2 text-center text-[10px] text-neutral-300">
              Avito Доставка · осмотр при получении, это игра
            </div>
          </>
        )}
      </div>
    </div>
  )
}
