'use client'

// Приложение «Доставки» — светлая система (как Resale/Сбер):
// фон #F5F6FA, белые карточки radius 20 (тень 0 2px 8px rgba(0,0,0,0.04)),
// акцент изумрудный #0AA06E, «в пути» — янтарный #E8A020, вторичный текст #9AA0A8.
// ЛОГИСТИКА (28-b): две вкладки (Активные / История), живой прогресс-бар + ETA мин,
// фазы «Собираем → В пути → Прибыл в ПВЗ → Получено», возврат невостребованного за 24 ч.
// Покупки И продажи игрока: у продаж — «Курьер забирает → Деньги зачислены».
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, Banknote, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Home, Package,
  PackageCheck, Plus, Search, Star, Truck, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtMoney, fmtDateTime, timeAgo } from '@/lib/format'
import { CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import { useOS } from '@/lib/store'
import { sound } from '@/lib/sound'
import type { DeliveryDTO } from '@/lib/types'

// Токены светлой системы
const EMERALD = '#0AA06E'
const AMBER = '#E8A020'
const CARD = 'rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]'

type TabKey = 'active' | 'history'

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
  if (s >= 3600) return `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`
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
    d.kind === 'purchase' &&
    d.realCondition != null &&
    (CONDITION_MULT[d.realCondition] ?? 1) < (CONDITION_MULT[d.listedCondition] ?? 1)
  )
}

const isActive = (d: DeliveryDTO) => d.status === 'collecting' || d.status === 'in_transit' || d.status === 'arrived'

// Общий прогресс 0..1 от создания до eta (живая полоска)
function progressOf(d: DeliveryDTO, nowMs: number): number {
  const start = new Date(d.createdAt).getTime()
  const end = new Date(d.eta).getTime()
  if (!(end > start)) return d.status === 'collecting' ? 0.05 : 1
  return Math.min(1, Math.max(0.02, (nowMs - start) / (end - start)))
}

// Стадии жизненного цикла (kind-aware): для деталей — вертикальный таймлайн
function stagesOf(d: DeliveryDTO): { label: string; icon: typeof Package }[] {
  if (d.kind === 'sale') {
    return [
      { label: 'Продано', icon: PackageCheck },
      { label: 'Курьер забирает', icon: Package },
      { label: 'В пути к покупателю', icon: Truck },
      { label: 'Деньги зачислены', icon: Banknote },
    ]
  }
  return [
    { label: 'Заказан', icon: PackageCheck },
    { label: 'Собираем', icon: Package },
    { label: 'В пути', icon: Truck },
    { label: 'Прибыл в пункт выдачи', icon: Home },
    { label: 'Получено', icon: CheckCircle2 },
  ]
}

// Индекс текущей стадии (0-based), -1 если всё пройдено
function stageIndex(d: DeliveryDTO): number {
  if (d.kind === 'sale') {
    if (d.status === 'collecting') return 1
    if (d.status === 'in_transit') return 2
    return -1 // delivered
  }
  if (d.status === 'collecting') return 1
  if (d.status === 'in_transit') return 2
  if (d.status === 'arrived') return 3
  return -1 // delivered / returned
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
        <text x="222" y="20" fill="#9AA0A8" fontSize="10">Пункт выдачи</text>
      </svg>
    </div>
  )
}

function StatusBadge({ d }: { d: DeliveryDTO }) {
  if (d.status === 'returned') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#B3382E]">
        <AlertTriangle className="size-3" aria-hidden />
        Возврат
      </span>
    )
  }
  const label =
    d.status === 'collecting'
      ? d.kind === 'sale' ? 'Курьер забирает' : 'Собираем'
      : d.status === 'in_transit'
        ? 'В пути'
        : d.status === 'arrived'
          ? 'Прибыл — заберите'
          : d.kind === 'sale' ? 'Доставлено' : 'Доставлено'
  const color = d.status === 'in_transit' || d.status === 'collecting' ? AMBER : EMERALD
  const dark = d.status === 'in_transit' || d.status === 'collecting' ? '#9A6B10' : EMERALD
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${color}1F`, color: dark }}
    >
      <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  )
}

function KindBadge({ d }: { d: DeliveryDTO }) {
  return d.kind === 'sale' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F0F1F5] px-2 py-1 text-[10px] font-bold text-[#5C616B]">
      <Banknote className="size-3" aria-hidden /> Продажа
    </span>
  ) : null
}

function DefectBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#B3382E]">
      <AlertTriangle className="size-3" aria-hidden />
      Есть дефекты
    </span>
  )
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-1">
      <h2 className="text-[18px] font-bold text-[#1A1A1A]">{title}</h2>
      {sub && <p className="mt-0.5 text-[12px] text-[#9AA0A8]">{sub}</p>}
    </div>
  )
}

// ---------- строка-посылка: прогресс-бар + ETA + фаза ----------
function ParcelRow({ d, onOpen, nowMs }: { d: DeliveryDTO; onOpen: () => void; nowMs: number }) {
  const pct = Math.round(progressOf(d, nowMs) * 100)
  const etaLeft = new Date(d.eta).getTime() - nowMs
  const arrivedWait = new Date(d.pickupDeadline ?? d.eta).getTime() - nowMs
  const sub =
    d.status === 'collecting'
      ? d.kind === 'sale' ? 'Курьер выехал к вам за товаром' : 'Продавец собирает посылку'
      : d.status === 'in_transit'
        ? etaLeft > 0
          ? `Прибудет через ${fmtRemain(etaLeft)}`
          : 'Курьер уже совсем рядом'
        : d.status === 'arrived'
          ? arrivedWait > 0
            ? `Ждёт в пункте выдачи · ${fmtRemain(arrivedWait)}`
            : 'Курьер оформляет возврат…'
          : d.status === 'returned'
            ? 'Возврат: деньги вернулись на счёт'
            : d.kind === 'sale' ? 'Деньги зачислены на счёт' : 'Получено'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Открыть посылку ${d.title}`}
      className={`${CARD} w-full p-3 text-left transition-transform active:scale-[0.99]`}
    >
      <div className="flex items-center gap-3">
        <img loading="lazy" decoding="async" src={d.image} alt="" className="size-14 shrink-0 rounded-xl bg-[#F0F1F5] object-cover"/>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-[#1A1A1A]">{d.title}</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-[#9AA0A8]">{trackOf(d.id)} · {d.courier}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge d={d} />
            <KindBadge d={d} />
            {isWorse(d) && <DefectBadge />}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 self-stretch py-0.5">
          <span className="text-[13px] font-bold tabular-nums text-[#1A1A1A]">
            {d.kind === 'sale' ? '+' : ''}{fmtMoney(d.price)}
          </span>
          <span className="text-[11px] text-[#9AA0A8]">{timeAgo(d.createdAt)}</span>
          <ChevronRight className="mt-auto size-4 text-[#C1C5CB]" />
        </div>
      </div>
      {isActive(d) && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F1F5]">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-linear"
              style={{ width: `${pct}%`, backgroundColor: d.status === 'arrived' ? EMERALD : AMBER }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#5C616B]">
            {d.status === 'arrived' ? 'готово' : d.status === 'in_transit' ? fmtRemain(etaLeft) : `${pct}%`}
          </span>
        </div>
      )}
    </button>
  )
}

// ---------- ВЕРТИКАЛЬНЫЙ таймлайн статусов: точки + линии ----------
function VerticalTimeline({ d, nowMs }: { d: DeliveryDTO; nowMs: number }) {
  const stages = stagesOf(d)
  const cur = stageIndex(d)
  const returned = d.status === 'returned'
  const etaLeft = new Date(d.eta).getTime() - nowMs
  const deadline = new Date(d.pickupDeadline ?? d.eta).getTime()
  const subs = stages.map((s, i) => {
    const done = cur === -1 || i < cur
    const base = fmtDateTime(d.createdAt)
    if (i === 0) return base
    if (i === 1) {
      return d.status === 'collecting'
        ? d.kind === 'sale' ? 'Курьер выехал к вам' : 'Готовится к отправке'
        : `Забран · ${fmtDateTime(d.collectEndsAt)}`
    }
    if (i === 2) {
      if (d.status === 'in_transit') return etaLeft > 0 ? `Прибудет через ${fmtRemain(etaLeft)}` : 'Курьер уже в вашем городе'
      return done ? `Прибыл · ${fmtDateTime(d.eta)}` : `Ожидается ${fmtDateTime(d.eta)}`
    }
    if (i === 3 && d.kind === 'purchase') {
      if (d.status === 'arrived') return deadline > nowMs ? `Хранится ещё ${fmtRemain(deadline - nowMs)}` : 'Возврат…'
      return returned ? 'Не забрали за 24 ч — вернули продавцу' : `Заберите до ${fmtDateTime(d.pickupDeadline ?? d.eta)}`
    }
    if (d.status === 'delivered' || d.status === 'returned') return d.deliveredAt ? `Вручение · ${fmtDateTime(d.deliveredAt)}` : '—'
    return 'Ожидается'
  })
  return (
    <ol className="flex flex-col" aria-label="Статусы доставки">
      {stages.map((s, i) => {
        const done = cur === -1 || i < cur
        const active = i === cur
        const isLast = i === stages.length - 1
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
      {returned && (
        <li className="flex gap-2 rounded-xl bg-[#FDEEEE] p-3">
          <AlertTriangle className="size-4 shrink-0 text-[#B3382E]" aria-hidden />
          <p className="text-[11px] leading-relaxed text-[#B3382E]">
            Посылку не забрали за 24 ч — курьер вернул её. Возврат {fmtMoney(Math.round(d.price * 0.95))} (комиссия 5%).
          </p>
        </li>
      )}
    </ol>
  )
}

// ---------- экран деталей посылки ----------
function ParcelDetails({ d, onBack, nowMs, onPicked }: { d: DeliveryDTO; onBack: () => void; nowMs: number; onPicked: () => void }) {
  const [copied, setCopied] = useState(false)
  const [mapOpen, setMapOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const etaLeft = new Date(d.eta).getTime() - nowMs
  const deadline = new Date(d.pickupDeadline ?? d.eta).getTime() - nowMs
  const worse = isWorse(d)
  const canPickup = d.status === 'arrived' && d.kind === 'purchase'

  const copyTrack = () => {
    try {
      void navigator.clipboard?.writeText(trackOf(d.id))
    } catch { /* не критично */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const pickup = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await api.pickupDelivery(d.id)
      sound.success()
      pushToastSafe('Resale Доставка', `«${d.title}» — посылка получена, вещь в инвентаре`)
      if (typeof res.balance === 'number') refreshBalance(res.balance)
      onPicked()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Не удалось получить посылку')
    } finally {
      setBusy(false)
    }
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
        <span className="truncate text-[16px] font-bold text-[#1A1A1A]">
          {d.kind === 'sale' ? 'Продажа · доставка' : 'Посылка'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[#F5F6FA] p-4 [scrollbar-width:thin]">
        {/* фото + название + цена + трек */}
        <div className={`${CARD} p-4`}>
          <div className="flex gap-3">
            <img loading="lazy" decoding="async" src={d.image} alt="" className="size-20 shrink-0 rounded-xl bg-[#F0F1F5] object-cover"/>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[14px] font-semibold text-[#1A1A1A]">{d.title}</div>
              <div className="mt-1 text-[18px] font-bold tabular-nums text-[#1A1A1A]">
                {d.kind === 'sale' ? '+' : ''}{fmtMoney(d.price)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge d={d} />
                <KindBadge d={d} />
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
                {etaLeft <= 0 ? 'Курьер уже близко' : `Прибудет через ${fmtRemain(etaLeft)}`}
              </p>
            </div>
          )}
          {d.status === 'collecting' && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#F8F1E3] px-3 py-2.5">
              <Package className="size-4 shrink-0" style={{ color: AMBER }} aria-hidden />
              <p className="text-[12px] font-semibold text-[#9A6B10]">
                {d.kind === 'sale' ? 'Курьер забирает товар у вас' : 'Продавец собирает посылку'}
              </p>
            </div>
          )}
          {d.status === 'arrived' && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#E7F5EA] px-3 py-2.5">
              <Home className="size-4 shrink-0" style={{ color: EMERALD }} aria-hidden />
              <p className="text-[12px] font-semibold" style={{ color: EMERALD }}>
                Ждёт в пункте выдачи{deadline > 0 ? ` · ещё ${fmtRemain(deadline)}` : ''}
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

        {/* КНОПКА ПОЛУЧЕНИЯ — главная фаза логистики */}
        {canPickup && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void pickup()}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-[16px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: EMERALD }}
            >
              <PackageCheck className="size-5" aria-hidden />
              {busy ? 'Оформляем…' : 'Забрать посылку'}
            </button>
            <p className="text-center text-[10px] text-[#9AA0A8]">
              Не забрали за 24 ч — курьер вернёт товар, возврат денег минус 5%
            </p>
          </div>
        )}
        {err && <p className="text-center text-[12px] font-medium text-[#B3382E]">{err}</p>}

        {d.status === 'in_transit' && d.kind === 'purchase' && (
          // предупреждение о риске (логика сохранена)
          <div className="flex gap-2 rounded-[20px] bg-[#F8F1E3] p-3.5">
            <AlertTriangle className="size-4 shrink-0" style={{ color: AMBER }} aria-hidden />
            <p className="text-[11px] leading-relaxed text-[#8A6116]">
              Осмотр при получении невозможен. Курьерская доставка — риск скрытых дефектов.
            </p>
          </div>
        )}

        {(d.status === 'delivered' || d.status === 'returned') && d.kind === 'purchase' && (
          // итог осмотра (логика сохранена)
          <div className={`${CARD} p-4`}>
            <div
              className={
                'flex items-center justify-between gap-2 rounded-xl p-3 ' +
                (worse || d.status === 'returned' ? 'bg-[#FDEEEE]' : 'bg-[#E7F5EA]')
              }
            >
              <div className="flex items-center gap-2">
                {worse || d.status === 'returned' ? (
                  <>
                    <span className="flex size-8 items-center justify-center rounded-full bg-white text-[#B3382E]" aria-hidden>
                      <AlertTriangle className="size-4" />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-[#B3382E]">
                        {d.status === 'returned' ? 'Возвращено продавцу' : 'Есть дефекты'}
                      </div>
                      <div className="text-[10px] text-[#9AA0A8]">
                        {d.status === 'returned' ? 'Комиссия 5% удержана' : 'Продавец приукрасил состояние'}
                      </div>
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
            {!worse && d.status === 'delivered' && d.realCondition && (
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

// тост/баланс через стор ОС (без импорт-циклов в хелперах)
function pushToastSafe(title: string, body: string) {
  try {
    useOS.getState().pushToast(title, body)
  } catch { /* стор не готов — не критично */ }
}
function refreshBalance(balance: number) {
  try {
    const s = useOS.getState()
    if (s.session) s.refreshSession({ balance })
  } catch { /* не критично */ }
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Активные' },
  { key: 'history', label: 'История' },
]

export default function DeliveryApp() {
  const [data, setData] = useState<DeliveryDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('active')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const pushToast = useOS((s) => s.pushToast)

  useTick(1000) // живой отсчёт ETA и прогресс-бара

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
  const active = sorted.filter(isActive)
  const history = sorted.filter((d) => !isActive(d))

  // локальный поиск по названию/треку — чисто UI, данные те же
  const needle = q.trim().toLowerCase()
  const searched = needle
    ? sorted.filter(
        (d) => d.title.toLowerCase().includes(needle) || trackOf(d.id).toLowerCase().includes(needle),
      )
    : sorted
  const list = tab === 'active' ? searched.filter(isActive) : searched.filter((d) => !isActive(d))

  const selected = selectedId ? sorted.find((d) => d.id === selectedId) ?? null : null

  return (
    <div className="flex h-full flex-col bg-[#F5F6FA]">
      {selected ? (
        <ParcelDetails
          d={selected}
          onBack={() => setSelectedId(null)}
          nowMs={nowMs}
          onPicked={() => { setSelectedId(null); void load() }}
        />
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
                  {active.length > 0 ? `${active.length} едут — обновляем сами` : 'Посылки и выплаты с продаж'}
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
                onClick={() => pushToast('Доставки', 'Посылка появится здесь после покупки или продажи')}
                aria-label="Как работает доставка"
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

            {/* ---------- 2 вкладки: Активные / История ---------- */}
            <div className="mt-3 flex gap-2" role="tablist" aria-label="Разделы доставок">
              {TABS.map((t) => {
                const isActiveTab = tab === t.key
                const count = t.key === 'active' ? active.length : history.length
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={isActiveTab}
                    onClick={() => setTab(t.key)}
                    className={
                      'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] transition-colors active:scale-[0.97] ' +
                      (isActiveTab
                        ? 'font-semibold text-white'
                        : 'bg-white font-medium text-black/70 shadow-[0_2px_8px_rgba(0,0,0,0.04)]')
                    }
                    style={isActiveTab ? { backgroundColor: EMERALD } : undefined}
                  >
                    {t.label}
                    {count > 0 && (
                      <span
                        className={
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ' +
                          (isActiveTab ? 'bg-white/25 text-white' : 'bg-black/5 text-black/60')
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
                <div className="h-24 animate-pulse rounded-[20px] bg-white" />
                <div className="h-24 animate-pulse rounded-[20px] bg-white" />
              </div>
            ) : error && !data ? (
              <div className="flex flex-col items-center gap-1 rounded-[20px] bg-[#FDEEEE] p-6 text-center">
                <img
                  src="/img/empty/deal-fail.webp"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-24"
                />
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
              <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <img
                  src="/img/empty/delivery.webp"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-24"
                />
                <div className="mt-3 text-[15px] font-semibold text-[#1A1A1A]">Доставок пока нет</div>
                <div className="mt-1 max-w-64 text-[13px] leading-relaxed text-[#9AA0A8]">
                  Каждая покупка едет посылкой: собираем → в пути → забирайте в пункте выдачи.
                </div>
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <img
                  src="/img/empty/deal-success.webp"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-24"
                />
                <div className="mt-3 text-[15px] font-semibold text-[#1A1A1A]">
                  {tab === 'active' ? 'Всё доставлено' : 'История пуста'}
                </div>
                <div className="mt-1 text-[13px] text-[#9AA0A8]">
                  {tab === 'active' ? 'Активных посылок нет — загляните в историю' : 'Завершённые доставки появятся здесь'}
                </div>
              </div>
            ) : (
              <>
                <SectionHeader
                  title={tab === 'active' ? 'Едут к вам' : 'История доставок'}
                  sub={tab === 'active' ? 'Статусы обновляются сами' : undefined}
                />
                <div className="flex flex-col gap-2.5">
                  {list.map((d) => (
                    <ParcelRow key={d.id} d={d} onOpen={() => setSelectedId(d.id)} nowMs={nowMs} />
                  ))}
                </div>
              </>
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
