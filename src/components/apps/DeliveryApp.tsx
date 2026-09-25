'use client'

// Приложение «Доставки» — светлая система (как Resale/Сбер):
// фон #F5F6FA, белые карточки radius 20 (тень 0 2px 8px rgba(0,0,0,0.04)),
// акцент изумрудный #0AA06E, «в пути» — янтарный #E8A020, вторичный текст #9AA0A8.
// Детали посылки: ВЕРТИКАЛЬНЫЙ таймлайн статусов (точки + линии:
// заказан → собран → в пути → доставлен; активный шаг изумрудный пульсирующий,
// пройденные — заполненные, будущие — серые), трек-номер моно, карта маршрута.
// Логика (api.deliveries, тихий refetch 5с, useTick ETA, поиск/фильтры, copyTrack,
// карта-переключатель, осмотр при получении) — без изменений.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Home, Package,
  PackageCheck, PackageOpen, Plus, Search, Star, Truck, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtMoney, fmtDateTime, timeAgo } from '@/lib/format'
import { CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import { useOS } from '@/lib/store'
import type { DeliveryDTO } from '@/lib/types'

// Токены светлой системы
const EMERALD = '#0AA06E'
const AMBER = '#E8A020'
const CARD = 'rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]'

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
  { label: 'Заказан', icon: PackageCheck },
  { label: 'Собран', icon: Package },
  { label: 'В пути', icon: Truck },
  { label: 'Доставлен', icon: Home },
]

// ---------- ВЕРТИКАЛЬНЫЙ таймлайн статусов: точки + линии ----------
function VerticalTimeline({ d, nowMs }: { d: DeliveryDTO; nowMs: number }) {
  const p = stageProgress(d, nowMs)
  const inTransit = d.status === 'in_transit'
  const remain = new Date(d.eta).getTime() - nowMs
  // подзаголовки шагов — из существующих полей createdAt/eta/deliveredAt
  const subs: string[] = [
    fmtDateTime(d.createdAt),
    p >= 2 ? 'Курьер забрал товар' : 'Готовится к отправке',
    inTransit
      ? remain > 0
        ? `Прибудет в город — ${fmtDateTime(d.eta)}`
        : 'Курьер уже в вашем городе'
      : p >= 3
        ? 'Прибыл в ваш город'
        : 'Направляется в ваш город',
    d.status === 'delivered'
      ? `Вручение ${fmtDateTime(d.deliveredAt ?? d.eta)}`
      : `ожидается ${fmtDateTime(d.eta)}`,
  ]
  return (
    <ol className="flex flex-col" aria-label="Статусы доставки">
      {STAGES.map((s, i) => {
        const done = i < p
        const active = i === p && inTransit
        const isLast = i === STAGES.length - 1
        return (
          <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
            {/* линия к следующей точке: пройденный участок — изумрудный, будущий — серый */}
            {!isLast && (
              <span
                className="absolute left-[11px] top-7 h-[calc(100%-28px)] w-0.5 rounded-full"
                style={{ backgroundColor: done ? EMERALD : '#E8EAED' }}
                aria-hidden
              />
            )}
            <span
              className={
                'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ' +
                (active ? 'animate-pulse' : '')
              }
              style={{
                backgroundColor: done || active ? EMERALD : '#F0F1F5',
                color: done || active ? '#FFFFFF' : '#C1C5CB',
              }}
              aria-hidden
            >
              {active && (
                <span
                  className="absolute -inset-1 animate-ping rounded-full opacity-40"
                  style={{ border: `2px solid ${EMERALD}` }}
                />
              )}
              {done ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div
                className={
                  'text-[13px] font-semibold leading-tight ' +
                  (done || active ? 'text-[#1A1A1A]' : 'text-[#9AA0A8]')
                }
              >
                {s.label}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[#9AA0A8]">{subs[i]}</div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ---------- стилизованная светлая SVG-карта с изумрудным пунктирным маршрутом ----------
function RouteMap() {
  return (
    <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <svg viewBox="0 0 320 140" className="h-36 w-full" role="img" aria-label="Карта маршрута курьера">
        <rect width="320" height="140" fill="#F0F1F5" />
        {/* «кварталы» — едва заметные белые улицы */}
        <g stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="8" strokeLinecap="round">
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
          stroke={EMERALD}
          strokeWidth="2.5"
          strokeDasharray="6 7"
          strokeLinecap="round"
        />
        {/* точка старта */}
        <circle cx="34" cy="108" r="5" fill={EMERALD} />
        <circle cx="34" cy="108" r="9" fill="none" stroke={EMERALD} strokeOpacity="0.35" strokeWidth="2" />
        {/* курьер в пути */}
        <circle cx="178" cy="57" r="6" fill={EMERALD} stroke="#FFFFFF" strokeWidth="2" className="animate-pulse" />
        {/* адрес */}
        <circle cx="284" cy="34" r="6" fill="none" stroke={EMERALD} strokeWidth="2" className="animate-pulse" />
        <text x="22" y="130" fill="#9AA0A8" fontSize="10">Сортировочный центр</text>
        <text x="222" y="20" fill="#9AA0A8" fontSize="10">Ваш адрес</text>
      </svg>
    </div>
  )
}

function StatusBadge({ d }: { d: DeliveryDTO }) {
  return d.status === 'in_transit' ? (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${AMBER}1F`, color: '#9A6B10' }}
    >
      <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: AMBER }} aria-hidden />
      В пути
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${EMERALD}1A`, color: EMERALD }}
    >
      <CheckCircle2 className="size-3" aria-hidden />
      Доставлено
    </span>
  )
}

function DefectBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#B3382E]">
      <AlertTriangle className="size-3" aria-hidden />
      Есть дефекты
    </span>
  )
}

function SectionHeader({ title, onAll }: { title: string; onAll?: () => void }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className="text-[18px] font-bold text-[#1A1A1A]">{title}</h2>
      {onAll && (
        <button type="button" onClick={onAll} className="text-[13px] text-[#9AA0A8] active:opacity-70">
          Все ›
        </button>
      )}
    </div>
  )
}

// ---------- строка-посылка в списке (с мини-точками стадий) ----------
function ParcelRow({ d, onOpen }: { d: DeliveryDTO; onOpen: () => void }) {
  const p = stageProgress(d, Date.now())
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Открыть посылку ${d.title}`}
      className={`${CARD} flex w-full items-center gap-3 p-3 text-left transition-transform active:scale-[0.99]`}
    >
      <img loading="lazy" decoding="async" src={d.image} alt="" className="size-14 shrink-0 rounded-xl bg-[#F0F1F5] object-cover"/>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-[#1A1A1A]">{d.title}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-[#9AA0A8]">{trackOf(d.id)}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge d={d} />
          {isWorse(d) && <DefectBadge />}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 self-stretch py-0.5">
        <span className="text-[11px] text-[#9AA0A8]">{timeAgo(d.createdAt)}</span>
        {/* мини-точки стадий: заказан → собран → в пути → доставлен */}
        <span className="mt-auto flex items-center gap-1" aria-hidden>
          {STAGES.map((s, i) => (
            <span
              key={s.label}
              className={'size-1.5 rounded-full ' + (i === p && d.status === 'in_transit' ? 'animate-pulse' : '')}
              style={{ backgroundColor: i < p ? EMERALD : i === p && d.status === 'in_transit' ? EMERALD : '#E0E3E8' }}
            />
          ))}
          <ChevronRight className="ml-0.5 size-4 text-[#C1C5CB]" />
        </span>
      </div>
    </button>
  )
}

// ---------- экран деталей посылки ----------
function ParcelDetails({ d, onBack, nowMs }: { d: DeliveryDTO; onBack: () => void; nowMs: number }) {
  const [copied, setCopied] = useState(false)
  const [mapOpen, setMapOpen] = useState(true)
  const remain = new Date(d.eta).getTime() - nowMs
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
      {/* белая шапка-бар с border-b #E8EAED */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#E8EAED] bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к посылкам"
          className="flex size-10 items-center justify-center rounded-full bg-[#F0F1F5] text-[#1A1A1A] transition active:scale-95"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <span className="truncate text-[16px] font-bold text-[#1A1A1A]">Посылка</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[#F5F6FA] p-4 [scrollbar-width:thin]">
        {/* фото + название + цена + трек */}
        <div className={`${CARD} p-4`}>
          <div className="flex gap-3">
            <img loading="lazy" decoding="async" src={d.image} alt="" className="size-20 shrink-0 rounded-xl bg-[#F0F1F5] object-cover"/>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[14px] font-semibold text-[#1A1A1A]">{d.title}</div>
              <div className="mt-1 text-[18px] font-bold tabular-nums text-[#1A1A1A]">{fmtMoney(d.price)}</div>
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
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-[#F0F1F5] px-3 py-2.5 text-left transition active:scale-[0.98]"
          >
            <span className="text-[11px] text-[#9AA0A8]">
              Трек: <span className="font-mono font-semibold text-[#1A1A1A]">{trackOf(d.id)}</span>
            </span>
            <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: EMERALD }}>
              <Copy className="size-3" aria-hidden />
              {copied ? 'Скопировано' : 'Копировать'}
            </span>
          </button>
        </div>

        {/* ВЕРТИКАЛЬНЫЙ таймлайн статусов */}
        <div className={`${CARD} p-4`}>
          <h3 className="mb-3 text-[15px] font-bold text-[#1A1A1A]">Движение посылки</h3>
          <VerticalTimeline d={d} nowMs={nowMs} />
        </div>

        {/* курьер: аватар + имя + рейтинг + ETA-баннер */}
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ backgroundColor: `hsl(${hueOf(d.courier)} 55% 45%)` }}
              aria-hidden
            >
              {initialsOf(d.courier)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-[#1A1A1A]">{d.courier}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#9AA0A8]">
                <Star className="size-3" style={{ color: AMBER }} fill={AMBER} aria-hidden />
                4.9 · Курьер Resale
              </div>
            </div>
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${EMERALD}1A`, color: EMERALD }}
              aria-hidden
            >
              <Truck className="size-4" />
            </span>
          </div>
          {d.status === 'in_transit' && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#F8F1E3] px-3 py-2.5">
              <Truck className="size-4 shrink-0" style={{ color: AMBER }} aria-hidden />
              <p className="text-[12px] font-semibold text-[#9A6B10]">
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
          className="h-12 w-full rounded-xl text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
          style={{ backgroundColor: EMERALD }}
        >
          {mapOpen ? 'Скрыть карту' : 'Показать на карте'}
        </button>
        {mapOpen && <RouteMap />}

        {d.status === 'in_transit' ? (
          // предупреждение о риске (логика сохранена)
          <div className="flex gap-2 rounded-[20px] bg-[#F8F1E3] p-3.5">
            <AlertTriangle className="size-4 shrink-0" style={{ color: AMBER }} aria-hidden />
            <p className="text-[11px] leading-relaxed text-[#8A6116]">
              Осмотр при получении невозможен. Курьерская доставка — риск скрытых дефектов.
            </p>
          </div>
        ) : (
          // итог осмотра (логика сохранена)
          <div className={`${CARD} p-4`}>
            <div
              className={
                'flex items-center justify-between gap-2 rounded-xl p-3 ' +
                (worse ? 'bg-[#FDEEEE]' : 'bg-[#E7F5EA]')
              }
            >
              <div className="flex items-center gap-2">
                {worse ? (
                  <>
                    <span className="flex size-8 items-center justify-center rounded-full bg-white text-[#B3382E]" aria-hidden>
                      <AlertTriangle className="size-4" />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-[#B3382E]">Есть дефекты</div>
                      <div className="text-[10px] text-[#9AA0A8]">Продавец приукрасил состояние</div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex size-8 items-center justify-center rounded-full bg-white" style={{ color: EMERALD }} aria-hidden>
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold" style={{ color: EMERALD }}>Как в описании</div>
                      <div className="text-[10px] text-[#9AA0A8]">Проверка пройдена</div>
                    </div>
                  </>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-[#9AA0A8]">{d.deliveredAt ? timeAgo(d.deliveredAt) : null}</span>
            </div>
            {d.realCondition && (
              <div className="mt-2 px-1 text-[11px] text-[#9AA0A8]">
                Фактическое состояние:{' '}
                <span className="font-medium text-[#1A1A1A]">{CONDITION_LABEL[d.realCondition] ?? d.realCondition}</span>
              </div>
            )}
          </div>
        )}

        <div className="pb-2 text-center text-[10px] text-[#9AA0A8]">Resale Доставка · это игра</div>
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
    <div className="flex h-full flex-col bg-[#F5F6FA]">
      {selected ? (
        <ParcelDetails d={selected} onBack={() => setSelectedId(null)} nowMs={nowMs} />
      ) : (
        <>
          {/* ---------- шапка: заголовок bold 22 + подзаголовок 13 + Search + Plus ---------- */}
          <div className="shrink-0 px-4 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${EMERALD}1A`, color: EMERALD }}>
                <Package className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[22px] font-bold leading-tight text-[#1A1A1A]">Доставки</h1>
                <p className="mt-0.5 text-[13px] text-[#9AA0A8]">
                  {inTransitCount > 0 ? `${inTransitCount} в пути — обновляем сами` : 'Посылки от продавцов'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                aria-label="Поиск по посылкам"
                aria-pressed={searchOpen}
                className={
                  'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95 ' +
                  (searchOpen ? 'text-white' : 'bg-white text-[#1A1A1A] shadow-[0_2px_8px_rgba(0,0,0,0.04)]')
                }
                style={searchOpen ? { backgroundColor: EMERALD } : undefined}
              >
                <Search className="size-4.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => pushToast('Доставки', 'Посылка появится здесь после покупки с курьером')}
                aria-label="Как получить посылку"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95"
                style={{ backgroundColor: EMERALD }}
              >
                <Plus className="size-4.5" aria-hidden />
              </button>
            </div>

            {searchOpen && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#F0F1F5] px-3.5">
                <Search className="size-4 shrink-0 text-[#9AA0A8]" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Название или трек-номер"
                  aria-label="Поиск по посылкам"
                  className="h-11 w-full bg-transparent text-[14px] text-[#1A1A1A] outline-none placeholder:text-[#9AA0A8]"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="Очистить поиск"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#9AA0A8] active:bg-black/5"
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
                      (isActive
                        ? 'font-semibold text-white'
                        : 'bg-white font-medium text-black/70 shadow-[0_2px_8px_rgba(0,0,0,0.04)]')
                    }
                    style={isActive ? { backgroundColor: EMERALD } : undefined}
                  >
                    {f.label}
                    {count > 0 && (
                      <span
                        className={
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ' +
                          (isActive ? 'bg-white/25 text-white' : 'bg-black/5 text-black/60')
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
                <div className="h-9 animate-pulse rounded-full bg-white" />
                <div className="h-20 animate-pulse rounded-[20px] bg-white" />
                <div className="h-20 animate-pulse rounded-[20px] bg-white" />
                <div className="h-20 animate-pulse rounded-[20px] bg-white" />
              </div>
            ) : error && !data ? (
              <div className="flex flex-col items-center gap-3 rounded-[20px] bg-[#FDEEEE] p-6 text-center">
                <p className="text-sm font-medium text-[#B3382E]">{error}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="h-11 rounded-xl px-6 text-sm font-bold text-white transition active:scale-95"
                  style={{ backgroundColor: EMERALD }}
                >
                  Повторить
                </button>
              </div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-12 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <div className="flex size-14 items-center justify-center rounded-full" style={{ backgroundColor: `${EMERALD}1A` }}>
                  <PackageOpen className="size-7" style={{ color: EMERALD }} aria-hidden />
                </div>
                <div className="mt-3 text-[15px] font-semibold text-[#1A1A1A]">Доставок пока нет</div>
                <div className="mt-1 max-w-64 text-[13px] leading-relaxed text-[#9AA0A8]">
                  Курьером можно получить товар при покупке в Resale — выберите доставку при оплате.
                </div>
              </div>
            ) : needle && searched.length === 0 ? (
              <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
                  <Search className="size-6 text-[#9AA0A8]" aria-hidden />
                </div>
                <div className="mt-3 text-[15px] font-semibold text-[#1A1A1A]">Ничего не нашлось</div>
                <div className="mt-1 text-[13px] text-[#9AA0A8]">Попробуйте другое название или трек-номер</div>
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
              <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
                  <PackageOpen className="size-7 text-[#9AA0A8]" aria-hidden />
                </div>
                <div className="mt-3 text-[15px] font-semibold text-[#1A1A1A]">
                  {filter === 'returns' ? 'Возвратов нет' : 'Здесь пока пусто'}
                </div>
                <div className="mt-1 text-[13px] text-[#9AA0A8]">
                  {filter === 'returns'
                    ? 'Все полученные посылки соответствуют описанию'
                    : 'Смените фильтр, чтобы увидеть другие посылки'}
                </div>
              </div>
            )}

            {sorted.length > 0 && (
              <div className="pb-2 pt-1 text-center text-[10px] text-[#9AA0A8]">
                Resale Доставка · осмотр при получении, это игра
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
