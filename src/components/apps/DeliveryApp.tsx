'use client'

// Приложение «Доставки» — трекинг посылок как в сервисах доставки:
// зелёная тема, вертикальный таймлайн статусов, карточка курьера, живой ETA.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, CheckCircle2, Clock, Copy, MapPin, PackageCheck, PackageOpen, Truck,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}

function hueOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 360
}

// ---------- вертикальный таймлайн посылки ----------
function TrackTimeline({ status, remain }: { status: DeliveryDTO['status']; remain: number }) {
  const steps = [
    { key: 'paid', label: 'Оплачено и собрано', icon: PackageCheck },
    { key: 'transit', label: 'Курьер в пути', icon: Truck },
    { key: 'done', label: 'Доставлено', icon: MapPin },
  ]
  const activeIdx = status === 'in_transit' ? 1 : 2
  return (
    <div className="relative pl-1">
      {steps.map((s, i) => {
        const done = i < activeIdx
        const active = i === activeIdx
        const last = i === steps.length - 1
        return (
          <div key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {/* линия */}
            {!last && (
              <span
                className={'absolute left-[13px] top-7 h-[calc(100%-28px)] w-0.5 rounded-full ' + (i < activeIdx ? 'bg-emerald-600' : 'bg-neutral-200')}
                aria-hidden
              />
            )}
            {/* точка */}
            <span
              className={
                'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 ' +
                (done
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : active
                    ? 'border-emerald-600 bg-white text-emerald-700'
                    : 'border-neutral-200 bg-white text-neutral-300')
              }
              aria-hidden
            >
              <s.icon className="size-3.5" />
              {active && status === 'in_transit' && (
                <span className="absolute -inset-1 animate-ping rounded-full border border-emerald-400 opacity-60" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div
                className={
                  'text-xs font-medium leading-tight ' +
                  (done ? 'text-neutral-500' : active ? 'text-neutral-900' : 'text-neutral-300')
                }
              >
                {s.label}
              </div>
              {active && status === 'in_transit' && (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  <Clock className="size-3" aria-hidden />
                  {remain <= 0 ? 'Курьер уже близко' : `Прибудет через ${fmtRemain(remain)}`}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function DeliveryApp() {
  const [data, setData] = useState<DeliveryDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  const copyTrack = (id: string) => {
    const code = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase() || 'SD000000'
    try {
      void navigator.clipboard?.writeText(`SD-${code}`)
    } catch { /* не критично */ }
    setCopiedId(id)
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600)
  }

  const nowMs = Date.now()
  const items = data ?? []
  // Хронологический порядок: новые сверху
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const inTransit = sorted.filter((d) => d.status === 'in_transit').length

  return (
    <div className="flex h-full flex-col bg-[#f6f7f5] text-neutral-900">
      {/* ---------- герой-шапка ---------- */}
      <div className="shrink-0 bg-gradient-to-br from-[#065f46] to-[#047857] px-4 pb-5 pt-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Truck className="size-5.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold">Доставки</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/75">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
              {inTransit > 0 ? `${inTransit} в пути — обновляем сами` : 'Посылки от продавцов'}
            </div>
          </div>
        </div>

        {/* стат-пилюли */}
        <div className="mt-4 flex gap-2">
          <div className="flex-1 rounded-2xl bg-white/12 px-3 py-2.5 backdrop-blur">
            <div className="text-[10px] text-white/70">Всего посылок</div>
            <div className="text-lg font-bold tabular-nums">{items.length}</div>
          </div>
          <div className="flex-1 rounded-2xl bg-white/12 px-3 py-2.5 backdrop-blur">
            <div className="text-[10px] text-white/70">В пути</div>
            <div className="text-lg font-bold tabular-nums">{inTransit}</div>
          </div>
          <div className="flex-1 rounded-2xl bg-white/12 px-3 py-2.5 backdrop-blur">
            <div className="text-[10px] text-white/70">Доставлено</div>
            <div className="text-lg font-bold tabular-nums">{items.length - inTransit}</div>
          </div>
        </div>
      </div>

      {/* ---------- контент ---------- */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-56 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-56 animate-pulse rounded-2xl bg-neutral-200" />
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
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-4 py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50">
                  <PackageOpen className="size-7 text-emerald-600" aria-hidden />
                </div>
                <div className="mt-3 text-sm font-semibold text-neutral-800">Доставок пока нет</div>
                <div className="mt-1 max-w-64 text-xs leading-relaxed text-neutral-400">
                  Курьером можно получить товар при покупке в Сделке — выберите доставку при оплате.
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
                  <div key={d.id} className="shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                    {/* шапка посылки: товар */}
                    <div className="flex gap-3 p-4">
                      <div className="relative">
                        <img
                          src={d.image}
                          alt={d.title}
                          className="size-20 shrink-0 rounded-xl border border-neutral-200 object-cover"
                        />
                        {d.status === 'in_transit' && (
                          <span className="absolute -right-1.5 -top-1.5 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-bold text-amber-950 shadow">
                            <Truck className="size-2.5" aria-hidden /> В пути
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-neutral-900">{d.title}</div>
                        <div className="mt-0.5 text-base font-bold tabular-nums text-emerald-800">{fmtMoney(d.price)}</div>
                        <div className="mt-1 text-[11px] text-neutral-500">
                          Состояние по описанию:{' '}
                          <span className="font-medium text-neutral-700">
                            {CONDITION_LABEL[d.listedCondition] ?? d.listedCondition}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* трек-номер */}
                    <button
                      type="button"
                      onClick={() => copyTrack(d.id)}
                      className="mx-4 mb-3 flex w-[calc(100%-2rem)] items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-left transition active:scale-[0.98]"
                      aria-label="Скопировать трек-номер"
                    >
                      <span className="text-[11px] text-neutral-400">
                        Трек: <span className="font-mono font-semibold text-neutral-700">SD-{d.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase() || '0000000000'}</span>
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                        <Copy className="size-3" aria-hidden />
                        {copiedId === d.id ? 'Скопировано' : 'Копировать'}
                      </span>
                    </button>

                    {/* таймлайн */}
                    <div className="mx-4 mb-3 rounded-2xl border border-neutral-100 p-3.5">
                      <TrackTimeline status={d.status} remain={remain} />
                    </div>

                    {/* курьер */}
                    <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-neutral-50 px-3 py-2.5">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: `hsl(${hueOf(d.courier)} 45% 38%)` }}
                        aria-hidden
                      >
                        {initialsOf(d.courier)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-neutral-800">{d.courier}</div>
                        <div className="text-[10px] text-neutral-400">Курьер Сделки</div>
                      </div>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden>
                        <Truck className="size-4" />
                      </span>
                    </div>

                    {d.status === 'in_transit' ? (
                      // предупреждение о риске
                      <div className="mx-4 mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
                        <p className="text-[11px] leading-relaxed text-amber-800">
                          Осмотр при получении невозможен. Курьерская доставка — риск скрытых дефектов.
                        </p>
                      </div>
                    ) : (
                      // итог осмотра
                      <div className="px-4 pb-4">
                        <div
                          className={
                            'flex items-center justify-between gap-2 rounded-xl p-3 ' +
                            (worse ? 'bg-red-50' : 'bg-emerald-50')
                          }
                        >
                          <div className="flex items-center gap-2">
                            {worse ? (
                              <>
                                <span className="flex size-8 items-center justify-center rounded-full bg-red-100 text-red-600" aria-hidden>
                                  <AlertTriangle className="size-4" />
                                </span>
                                <div>
                                  <div className="text-xs font-semibold text-red-700">Есть дефекты</div>
                                  <div className="text-[10px] text-red-500">Продавец приукрасил состояние</div>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden>
                                  <CheckCircle2 className="size-4" />
                                </span>
                                <div>
                                  <div className="text-xs font-semibold text-emerald-800">Как в описании</div>
                                  <div className="text-[10px] text-emerald-600">Проверка пройдена</div>
                                </div>
                              </>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] text-neutral-400">
                            {d.deliveredAt ? timeAgo(d.deliveredAt) : null}
                          </span>
                        </div>
                        {d.realCondition && (
                          <div className="mt-2 text-[11px] text-neutral-500">
                            Фактическое состояние:{' '}
                            <span className="font-medium text-neutral-700">
                              {CONDITION_LABEL[d.realCondition] ?? d.realCondition}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}

            <div className="pb-2 text-center text-[10px] text-neutral-400">
              Сделка Доставка · осмотр при получении, это игра
            </div>
          </>
        )}
      </div>
    </div>
  )
}
