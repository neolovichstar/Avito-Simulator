'use client'

// Приложение «Доставки» — трекинг посылок Resale Dark (по макету):
// шапка с зелёным кубиком Package, чипы-фильтры, список посылок,
// детали: горизонтальный степпер, таймлайн событий, курьер, SVG-карта маршрута.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Home, MapPin,
  Package, PackageCheck, PackageOpen, Plus, Search, Star, Truck, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtMoney, fmtDateTime, timeAgo } from '@/lib/format'
import { CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import { useOS } from '@/lib/store'
import type { DeliveryDTO } from '@/lib/types'

type FilterKey = 'all' | 'in_transit' | 'delivered' | 'returns'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'in_transit', label: 'В пути' },
  { key: 'delivered', label: 'Доставлены' },
  { key: 'returns', label: 'Возвраты' },
]

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
  if (s >= 60) return `${Math.floor(s / 60)} мин`
  return `${s} с`
}

function trackOf(id: string): string {
  return `SD-${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase() || '0000000000'}`
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

// У хуже ли реальное состояние по сравнению с заявленным (логика осмотра — как была)
function isWorse(d: DeliveryDTO): boolean {
  return (
    d.status === 'delivered' &&
    d.realCondition != null &&
    (CONDITION_MULT[d.realCondition] ?? 1) < (CONDITION_MULT[d.listedCondition] ?? 1)
  )
}

// Прогресс по 4 стадиям из существующих полей (status/createdAt/eta), без новых статусов
function stageProgress(d: DeliveryDTO, nowMs: number): number {
  if (d.status === 'delivered') return 4
  const start = new Date(d.createdAt).getTime()
  const end = new Date(d.eta).getTime()
  if (!(end > start)) return 1
  const frac = Math.min(1, Math.max(0, (nowMs - start) / (end - start)))
  return 1 + Math.min(2, Math.floor(frac * 3))
}

const STAGES = [
  { label: 'Принят', icon: PackageCheck },
  { label: 'В пути', icon: Truck },
  { label: 'В городе', icon: MapPin },
  { label: 'К адресату', icon: Home },
]

// ---------- горизонтальный степпер 4 стадии ----------
function Stepper({ d, nowMs }: { d: DeliveryDTO; nowMs: number }) {
  const p = stageProgress(d, nowMs)
  return (
    <div>
      <div className="flex items-center">
        {STAGES.map((s, i) => {
          const done = i < p
          const active = i === p && d.status === 'in_transit'
          return (
            <div key={s.label} className="flex min-w-0 flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={
                    'relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ' +
                    (done
                      ? 'bg-emerald-500 text-[#052E16]'
                      : active
                        ? 'border-2 border-emerald-500 bg-[#0B1710] text-emerald-400'
                        : 'bg-white/[0.06] text-white/30')
                  }
                  aria-hidden
                >
                  {done ? <Check className="size-4" /> : <s.icon className="size-4" />}
                  {active && (
                    <span className="absolute -inset-1 animate-ping rounded-full border border-emerald-400 opacity-50" />
                  )}
                </span>
                <span
                  className={
                    'text-[10px] leading-none ' + (done || active ? 'text-white/70' : 'text-white/30')
                  }
                >
                  {s.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <span
                  className={
                    'mx-1 mb-4 h-0.5 min-w-3 flex-1 rounded-full ' +
                    (i < p ? 'bg-emerald-500' : 'bg-white/10')
                  }
                  aria-hidden
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- таймлайн событий: иконки в зелёных квадратиках + текст + дата ----------
type Ev = { icon: typeof Truck; title: string; at: string; done: boolean }

function buildEvents(d: DeliveryDTO, p: number): Ev[] {
  const created = fmtDateTime(d.createdAt)
  const evs: Ev[] = [{ icon: PackageCheck, title: 'Посылка оформлена и принята', at: created, done: true }]
  if (p >= 1) evs.push({ icon: Truck, title: 'Курьер забрал товар', at: created, done: true })
  if (d.status === 'delivered') {
    const at = fmtDateTime(d.deliveredAt ?? d.eta)
    evs.push({ icon: MapPin, title: 'Прибытие в ваш город', at, done: true })
    evs.push({ icon: CheckCircle2, title: 'Доставлено получателю', at, done: true })
  } else {
    const at = `ожидается ${fmtDateTime(d.eta)}`
    evs.push({ icon: MapPin, title: 'Курьер в пути к вам', at, done: p >= 3 })
    evs.push({ icon: CheckCircle2, title: 'Вручение адресату', at, done: false })
  }
  return evs
}

function EventTimeline({ d, p }: { d: DeliveryDTO; p: number }) {
  const evs = buildEvents(d, p)
  return (
    <div className="relative">
      <span className="absolute bottom-3 left-[15px] top-3 w-px bg-white/[0.08]" aria-hidden />
      <div className="flex flex-col gap-3">
        {evs.map((e, i) => (
          <div key={`${e.title}-${i}`} className="relative flex items-center gap-3">
            <span
              className={
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg ' +
                (e.done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.06] text-white/30')
              }
              aria-hidden
            >
              <e.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className={'text-[13px] font-medium leading-tight ' + (e.done ? 'text-white' : 'text-white/40')}>
                {e.title}
              </div>
              <div className={'mt-0.5 text-[11px] ' + (e.done ? 'text-white/40' : 'text-white/30')}>{e.at}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- стилизованная тёмная SVG-карта с зелёным пунктирным маршрутом ----------
function RouteMap() {
  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-500/15 bg-[#0B1710]">
      <svg viewBox="0 0 320 140" className="h-36 w-full" role="img" aria-label="Карта маршрута курьера">
        <rect width="320" height="140" fill="#0B1710" />
        {/* «кварталы» — едва заметная тёмная сетка улиц */}
        <g stroke="#FFFFFF" strokeOpacity="0.05" strokeWidth="8" strokeLinecap="round">
          <path d="M-10 40 H330" />
          <path d="M-10 96 H330" />
          <path d="M70 -10 V150" />
          <path d="M180 -10 V150" />
          <path d="M262 -10 V150" />
        </g>
        {/* маршрут: сортировочный центр → адрес */}
        <path
          d="M34 108 C 92 100, 96 52, 150 50 S 246 66, 284 34"
          fill="none"
          stroke="#22C55E"
          strokeWidth="2.5"
          strokeDasharray="6 7"
          strokeLinecap="round"
        />
        {/* точка старта */}
        <circle cx="34" cy="108" r="5" fill="#22C55E" />
        <circle cx="34" cy="108" r="9" fill="none" stroke="#22C55E" strokeOpacity="0.35" strokeWidth="2" />
        {/* курьер в пути */}
        <circle cx="178" cy="57" r="6" fill="#4ADE80" stroke="#052E16" strokeWidth="2" className="animate-pulse" />
        {/* адрес */}
        <circle cx="284" cy="34" r="6" fill="none" stroke="#4ADE80" strokeWidth="2" className="animate-pulse" />
        <text x="22" y="130" fill="#FFFFFF" fillOpacity="0.4" fontSize="10">Сортировочный центр</text>
        <text x="222" y="20" fill="#FFFFFF" fillOpacity="0.4" fontSize="10">Ваш адрес</text>
      </svg>
    </div>
  )
}

function StatusBadge({ d }: { d: DeliveryDTO }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
      {d.status === 'in_transit' && <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />}
      {d.status === 'in_transit' ? 'В пути' : 'Доставлено'}
    </span>
  )
}

function DefectBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-300">
      <AlertTriangle className="size-3" aria-hidden />
      Есть дефекты
    </span>
  )
}

function SectionHeader({ title, onAll }: { title: string; onAll?: () => void }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className="text-[15px] font-semibold text-white">{title}</h2>
      {onAll && (
        <button type="button" onClick={onAll} className="text-[13px] text-emerald-400 active:opacity-70">
          Все ›
        </button>
      )}
    </div>
  )
}

// ---------- строка-посылка в списке ----------
function ParcelRow({ d, onOpen }: { d: DeliveryDTO; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Открыть посылку ${d.title}`}
      className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-3 text-left transition-transform active:scale-[0.99]"
    >
      <img src={d.image} alt="" className="size-14 shrink-0 rounded-xl bg-white/[0.06] object-cover" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-white">{d.title}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-white/40">{trackOf(d.id)}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge d={d} />
          {isWorse(d) && <DefectBadge />}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 self-stretch py-0.5">
        <span className="text-[11px] text-white/40">{timeAgo(d.createdAt)}</span>
        <ChevronRight className="mt-auto size-4 text-white/30" aria-hidden />
      </div>
    </button>
  )
}

// ---------- экран деталей посылки ----------
function ParcelDetails({ d, onBack, nowMs }: { d: DeliveryDTO; onBack: () => void; nowMs: number }) {
  const [copied, setCopied] = useState(false)
  const [mapOpen, setMapOpen] = useState(true)
  const remain = new Date(d.eta).getTime() - nowMs
  const p = stageProgress(d, nowMs)
  const worse = isWorse(d)

  const copyTrack = () => {
    try {
      void navigator.clipboard?.writeText(trackOf(d.id))
    } catch { /* не критично */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к посылкам"
          className="flex size-11 items-center justify-center rounded-full text-white active:bg-white/10"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <span className="truncate text-[15px] font-semibold text-white">Посылка</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 [scrollbar-width:thin]">
        {/* фото + название + трек */}
        <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
          <div className="flex gap-3">
            <img src={d.image} alt="" className="size-20 shrink-0 rounded-xl bg-white/[0.06] object-cover" />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[14px] font-semibold text-white">{d.title}</div>
              <div className="mt-1 text-base font-bold tabular-nums text-emerald-400">{fmtMoney(d.price)}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge d={d} />
                {worse && <DefectBadge />}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={copyTrack}
            aria-label="Скопировать трек-номер"
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-white/[0.06] px-3 py-2.5 text-left transition active:scale-[0.98]"
          >
            <span className="text-[11px] text-white/40">
              Трек: <span className="font-mono font-semibold text-white">{trackOf(d.id)}</span>
            </span>
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
              <Copy className="size-3" aria-hidden />
              {copied ? 'Скопировано' : 'Копировать'}
            </span>
          </button>
        </div>

        {/* степпер 4 стадии */}
        <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
          <Stepper d={d} nowMs={nowMs} />
        </div>

        {/* таймлайн событий */}
        <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
          <h3 className="mb-3 text-[15px] font-semibold text-white">История перемещений</h3>
          <EventTimeline d={d} p={p} />
        </div>

        {/* курьер: аватар + имя + рейтинг + ETA-баннер */}
        <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ backgroundColor: `hsl(${hueOf(d.courier)} 45% 32%)` }}
              aria-hidden
            >
              {initialsOf(d.courier)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-white">{d.courier}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/40">
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                4.9 · Курьер Resale
              </div>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden>
              <Truck className="size-4" />
            </span>
          </div>
          {d.status === 'in_transit' && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/15 px-3 py-2.5">
              <Truck className="size-4 shrink-0 text-emerald-400" aria-hidden />
              <p className="text-[12px] font-semibold text-emerald-300">
                {remain <= 0 ? 'Курьер уже близко' : `Прибудет через ${fmtRemain(remain)}`}
              </p>
            </div>
          )}
        </div>

        {/* карта маршрута (декоративная) + кнопка «Показать на карте» */}
        <button
          type="button"
          onClick={() => setMapOpen((v) => !v)}
          aria-expanded={mapOpen}
          className="h-12 w-full rounded-2xl bg-[#22C55E] text-[15px] font-bold text-[#052E16] transition-transform active:scale-[0.98]"
        >
          {mapOpen ? 'Скрыть карту' : 'Показать на карте'}
        </button>
        {mapOpen && <RouteMap />}

        {d.status === 'in_transit' ? (
          // предупреждение о риске (логика сохранена)
          <div className="flex gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
            <AlertTriangle className="size-4 shrink-0 text-amber-400" aria-hidden />
            <p className="text-[11px] leading-relaxed text-amber-300/90">
              Осмотр при получении невозможен. Курьерская доставка — риск скрытых дефектов.
            </p>
          </div>
        ) : (
          // итог осмотра (логика сохранена)
          <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
            <div
              className={
                'flex items-center justify-between gap-2 rounded-xl p-3 ' +
                (worse ? 'bg-red-500/10' : 'bg-emerald-500/10')
              }
            >
              <div className="flex items-center gap-2">
                {worse ? (
                  <>
                    <span className="flex size-8 items-center justify-center rounded-full bg-red-500/15 text-red-400" aria-hidden>
                      <AlertTriangle className="size-4" />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-red-300">Есть дефекты</div>
                      <div className="text-[10px] text-white/40">Продавец приукрасил состояние</div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400" aria-hidden>
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-emerald-300">Как в описании</div>
                      <div className="text-[10px] text-white/40">Проверка пройдена</div>
                    </div>
                  </>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-white/40">{d.deliveredAt ? timeAgo(d.deliveredAt) : null}</span>
            </div>
            {d.realCondition && (
              <div className="mt-2 px-1 text-[11px] text-white/40">
                Фактическое состояние:{' '}
                <span className="font-medium text-white/80">{CONDITION_LABEL[d.realCondition] ?? d.realCondition}</span>
              </div>
            )}
          </div>
        )}

        <div className="pb-2 text-center text-[10px] text-white/30">Resale Доставка · это игра</div>
      </div>
    </div>
  )
}

export default function DeliveryApp() {
  const [data, setData] = useState<DeliveryDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const pushToast = useOS((s) => s.pushToast)

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
  // Хронологический порядок: новые сверху (как было)
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const inTransitCount = sorted.filter((d) => d.status === 'in_transit').length
  const deliveredCount = sorted.length - inTransitCount
  const returnsCount = sorted.filter(isWorse).length

  // локальный поиск по названию/треку — чисто UI, данные те же
  const needle = q.trim().toLowerCase()
  const searched = needle
    ? sorted.filter(
        (d) => d.title.toLowerCase().includes(needle) || trackOf(d.id).toLowerCase().includes(needle),
      )
    : sorted

  const active = searched.filter((d) => d.status === 'in_transit')
  const history = searched.filter((d) => d.status === 'delivered')
  const counts: Record<FilterKey, number> = {
    all: searched.length,
    in_transit: inTransitCount,
    delivered: deliveredCount,
    returns: returnsCount,
  }

  const filtered: DeliveryDTO[] | null =
    filter === 'all'
      ? null
      : filter === 'in_transit'
        ? active
        : filter === 'delivered'
          ? history
          : searched.filter(isWorse)

  const selected = selectedId ? sorted.find((d) => d.id === selectedId) ?? null : null

  return (
    <div className="flex h-full flex-col bg-[#050D09] text-white">
      {selected ? (
        <ParcelDetails d={selected} onBack={() => setSelectedId(null)} nowMs={nowMs} />
      ) : (
        <>
          {/* ---------- шапка: зелёный кубик Package + Search + Plus ---------- */}
          <div className="shrink-0 px-4 pb-3 pt-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
                <Package className="size-5 text-emerald-400" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-bold leading-tight">Доставки</div>
                <div className="mt-0.5 text-[11px] text-white/40">
                  {inTransitCount > 0 ? `${inTransitCount} в пути — обновляем сами` : 'Посылки от продавцов'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                aria-label="Поиск по посылкам"
                aria-pressed={searchOpen}
                className={
                  'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95 ' +
                  (searchOpen ? 'bg-emerald-500 text-[#052E16]' : 'bg-white/[0.06] text-white/70')
                }
              >
                <Search className="size-4.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => pushToast('Доставки', 'Посылка появится здесь после покупки с курьером')}
                aria-label="Как получить посылку"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-[#052E16] transition-transform active:scale-95"
              >
                <Plus className="size-4.5" aria-hidden />
              </button>
            </div>

            {searchOpen && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 focus-within:border-emerald-500/50">
                <Search className="size-4 shrink-0 text-white/40" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Название или трек-номер"
                  aria-label="Поиск по посылкам"
                  className="h-11 w-full bg-transparent text-[14px] text-white outline-none placeholder:text-white/40"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="Очистить поиск"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/40 active:bg-white/10"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            )}

            {/* ---------- чипы-фильтры со счётчиками ---------- */}
            <div
              className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Фильтры доставок"
            >
              {FILTERS.map((f) => {
                const isActive = filter === f.key
                const count = counts[f.key]
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setFilter(f.key)}
                    className={
                      'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] transition-colors active:scale-[0.97] ' +
                      (isActive ? 'bg-emerald-500 font-semibold text-[#052E16]' : 'bg-white/[0.06] text-white/70')
                    }
                  >
                    {f.label}
                    {count > 0 && (
                      <span
                        className={
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ' +
                          (isActive ? 'bg-[#052E16]/20 text-[#052E16]' : 'bg-white/15 text-white/80')
                        }
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ---------- контент ---------- */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 pt-0 [scrollbar-width:thin]">
            {loading && !data ? (
              <div className="flex flex-col gap-3">
                <div className="h-9 animate-pulse rounded-full bg-white/[0.06]" />
                <div className="h-20 animate-pulse rounded-2xl bg-white/[0.06]" />
                <div className="h-20 animate-pulse rounded-2xl bg-white/[0.06]" />
                <div className="h-20 animate-pulse rounded-2xl bg-white/[0.06]" />
              </div>
            ) : error && !data ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
                <p className="text-sm font-medium text-red-400">{error}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="h-11 rounded-2xl bg-[#22C55E] px-6 text-sm font-bold text-[#052E16] transition active:scale-95"
                >
                  Повторить
                </button>
              </div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.06]">
                  <PackageOpen className="size-7 text-emerald-400" aria-hidden />
                </div>
                <div className="mt-3 text-sm font-semibold text-white">Доставок пока нет</div>
                <div className="mt-1 max-w-64 text-xs leading-relaxed text-white/40">
                  Курьером можно получить товар при покупке в Resale — выберите доставку при оплате.
                </div>
              </div>
            ) : needle && searched.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.06]">
                  <Search className="size-6 text-white/30" aria-hidden />
                </div>
                <div className="mt-3 text-sm font-semibold text-white">Ничего не нашлось</div>
                <div className="mt-1 text-xs text-white/40">Попробуйте другое название или трек-номер</div>
              </div>
            ) : filter === 'all' ? (
              <>
                {active.length > 0 && (
                  <>
                    <SectionHeader title="Активные" />
                    <div className="flex flex-col gap-2.5">
                      {active.map((d) => (
                        <ParcelRow key={d.id} d={d} onOpen={() => setSelectedId(d.id)} />
                      ))}
                    </div>
                  </>
                )}
                {history.length > 0 && (
                  <>
                    <SectionHeader title="История доставок" />
                    <div className="flex flex-col gap-2.5">
                      {history.map((d) => (
                        <ParcelRow key={d.id} d={d} onOpen={() => setSelectedId(d.id)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : filtered && filtered.length > 0 ? (
              <>
                <SectionHeader
                  title={FILTERS.find((f) => f.key === filter)?.label ?? ''}
                  onAll={() => setFilter('all')}
                />
                <div className="flex flex-col gap-2.5">
                  {filtered.map((d) => (
                    <ParcelRow key={d.id} d={d} onOpen={() => setSelectedId(d.id)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.06]">
                  <PackageOpen className="size-7 text-white/30" aria-hidden />
                </div>
                <div className="mt-3 text-sm font-semibold text-white">
                  {filter === 'returns' ? 'Возвратов нет' : 'Здесь пока пусто'}
                </div>
                <div className="mt-1 text-xs text-white/40">
                  {filter === 'returns'
                    ? 'Все полученные посылки соответствуют описанию'
                    : 'Смените фильтр, чтобы увидеть другие посылки'}
                </div>
              </div>
            )}

            {sorted.length > 0 && (
              <div className="pb-2 pt-1 text-center text-[10px] text-white/30">
                Resale Доставка · осмотр при получении, это игра
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
