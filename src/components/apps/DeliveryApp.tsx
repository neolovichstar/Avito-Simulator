'use client'

// Приложение «Доставки» — редизайн по макету upload/mockups/01-dostavki.png.
// Светлая система: фон #F6F7F9, белые карточки rounded-[20px] ring-black/[0.05],
// акцент зелёный #12894B, статус «В пути» синий #2B7BF3 (плашка #EBF2FE),
// вторичный текст #6B7280/#9CA3AF, капс-лейблы text-[11px] tracking-[0.12em].
//
// Экраны (нижний таб-бар: Доставки / Карта / История / Профиль):
//  1. Список посылок: чипы-фильтры Все/В пути/Доставлены/Архив, карточки
//     с фото, трек-номером, статусной точкой (синяя/зелёная) и подписью.
//  2. Трекинг: шапка с фото/названием/треком, синяя плашка статуса с
//     грузовиком, ВЕРТИКАЛЬНЫЙ таймлайн шагов (синие/серые точки + даты + город).
//  3. Детали: кнопки «Отследить» (зелёная) и «Поделиться», характеристики
//     с иконками (Отправитель, Получатель, Адрес, Плановая доставка,
//     Содержимое, Вес).
//  4. Курьер: 2D игровая карта (GameMap) с маршрутом и пузырём ETA,
//     нижняя карточка курьера (аватар, рейтинг, звонок/чат, машина).
//
// Логистика 28-b сохранена полностью: api.deliveries/pickupDelivery, фазы
// collecting -> in_transit -> arrived -> delivered/returned, возврат 24 ч
// (минус 5%), подтверждение получения, живые ETA-тайминги, тихий refetch 5 с.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, Banknote, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Copy, Crosshair,
  History, Home, Map as MapIcon, MapPin, MessageCircle, Navigation, Package, PackageCheck, Phone,
  Plus, RotateCcw, Search, Share2, ShieldCheck, Star, Truck, User, UserRound, Weight, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtMoney, fmtDateTime, fmtTime, timeAgo } from '@/lib/format'
import { CONDITION_LABEL, CONDITION_MULT } from '@/lib/catalog-types'
import { useOS } from '@/lib/store'
import { sound } from '@/lib/sound'
import type { DeliveryDTO } from '@/lib/types'
import GameMap from '@/components/delivery/GameMap'

// Токены дизайн-системы
const GREEN = '#12894B'
const BLUE = '#2B7BF3'
const RED = '#B3382E'
const AMBER = '#F5A623'
const CARD = 'rounded-[20px] bg-white ring-1 ring-black/[0.05]'
const CAPS = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40'

type Tone = 'blue' | 'green' | 'red'
const TONE: Record<Tone, { text: string; sub: string; plate: string }> = {
  blue: { text: BLUE, sub: '#6C93E8', plate: '#EBF2FE' },
  green: { text: GREEN, sub: '#57A078', plate: '#E6F3EB' },
  red: { text: RED, sub: '#C97068', plate: '#FDECEA' },
}

type TabKey = 'deliveries' | 'map' | 'history' | 'profile'
type FilterKey = 'all' | 'transit' | 'delivered' | 'archive'

const TABS: { key: TabKey; label: string; icon: typeof Package }[] = [
  { key: 'deliveries', label: 'Доставки', icon: Package },
  { key: 'map', label: 'Карта', icon: MapIcon },
  { key: 'history', label: 'История', icon: History },
  { key: 'profile', label: 'Профиль', icon: UserRound },
]

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'transit', label: 'В пути' },
  { key: 'delivered', label: 'Доставлены' },
  { key: 'archive', label: 'Архив' },
]

// Тик раз в секунду через useSyncExternalStore: живые ETA-отсчёты,
// без setState внутри эффектов (правило next-16 eslint)
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

function hashOf(key: string): number {
  let h = 7
  for (let i = 0; i < key.length; i++) h = (h * 131 + key.charCodeAt(i)) >>> 0
  return h
}

function isToday(date: Date, nowMs: number): boolean {
  return date.toDateString() === new Date(nowMs).toDateString()
}

function dateOnly(date: Date): string {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// Ухе ли реальное состояние по сравнению с заявленным (логика осмотра)
function isWorse(d: DeliveryDTO): boolean {
  return (
    d.status === 'delivered' &&
    d.kind === 'purchase' &&
    d.realCondition != null &&
    (CONDITION_MULT[d.realCondition] ?? 1) < (CONDITION_MULT[d.listedCondition] ?? 1)
  )
}

const isActive = (d: DeliveryDTO) => d.status === 'collecting' || d.status === 'in_transit' || d.status === 'arrived'

// Стадии жизненного цикла (kind-aware): для вертикального таймлайна
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

function statusMeta(d: DeliveryDTO): { label: string; tone: Tone } {
  if (d.status === 'returned') return { label: 'Возврат', tone: 'red' }
  if (d.status === 'collecting') return { label: d.kind === 'sale' ? 'Курьер забирает' : 'Собираем', tone: 'blue' }
  if (d.status === 'in_transit') return { label: 'В пути', tone: 'blue' }
  if (d.status === 'arrived') return { label: 'Готов к выдаче', tone: 'green' }
  return { label: 'Доставлен', tone: 'green' }
}

// Серая подпись под статусом в карточке (как в макете: «Доставка сегодня»)
function captionOf(d: DeliveryDTO, nowMs: number): string {
  const etaLeft = new Date(d.eta).getTime() - nowMs
  const deadline = new Date(d.pickupDeadline ?? d.eta).getTime() - nowMs
  switch (d.status) {
    case 'collecting':
      return d.kind === 'sale' ? 'Курьер выехал к вам' : 'Продавец собирает посылку'
    case 'in_transit': {
      if (etaLeft <= 0) return 'Курьер уже совсем рядом'
      const etaDate = new Date(d.eta)
      return isToday(etaDate, nowMs) ? 'Доставка сегодня' : `Ожидается ${dateOnly(etaDate)}`
    }
    case 'arrived':
      return deadline > 0 ? 'Можно забрать сегодня' : 'Оформляем возврат'
    case 'returned':
      return 'Возвращено продавцу'
    default:
      return d.deliveredAt ? fmtDateTime(d.deliveredAt) : 'Доставлено'
  }
}

// Декоративные, но детерминированные данные деталей заказа
const SENDER_NAMES = ['А. Смирнов', 'М. Козлова', 'Д. Волков', 'Е. Соколова', 'И. Петров', 'С. Орлов', 'Н. Фёдорова', 'П. Белов']
const STREETS = ['ул. Лесная', 'ул. Садовая', 'пр. Мира', 'ул. Полевая', 'ул. Липовая']
const CITIES_OUT = ['Санкт-Петербург', 'Казань', 'Екатеринбург', 'Нижний Новгород', 'Самара']
const CARS = ['Белый фургон · ГАЗель Next', 'Серый фургон · Соболь ГНА', 'Белый универсал · Lada Largus', 'Голубой фургон · Peugeot Partner']
const PLATE_LETTERS = 'АВЕКМНОРСТУХ'

function plateOf(key: string): string {
  const h = hashOf(key)
  const l = (i: number) => PLATE_LETTERS[(h >>> (i * 3)) % PLATE_LETTERS.length]
  return `${l(0)} ${100 + ((h >>> 9) % 900)} ${l(1)}${l(2)} ${77 + ((h >>> 15) % 23)}`
}

// тост/баланс через стор ОС (без импорт-циклов в хелперах)
function pushToastSafe(title: string, body: string) {
  try {
    useOS.getState().pushToast(title, body)
  } catch { /* стор не готов, не критично */ }
}
function refreshBalance(balance: number) {
  try {
    const s = useOS.getState()
    if (s.session) s.refreshSession({ balance })
  } catch { /* не критично */ }
}

// ---------- карточка посылки в списке (макет: экран 1) ----------
function ParcelCard({ d, nowMs, onOpen }: { d: DeliveryDTO; nowMs: number; onOpen: () => void }) {
  const meta = statusMeta(d)
  const t = TONE[meta.tone]
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Открыть посылку ${d.title}`}
      className={`${CARD} w-full p-3 text-left transition-transform active:scale-[0.99]`}
    >
      <div className="flex items-center gap-3">
        <img
          loading="lazy"
          decoding="async"
          src={d.image}
          alt=""
          className="size-14 shrink-0 rounded-[14px] bg-[#F1F2F4] object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-[#141414]">{d.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate font-mono text-[11px] text-[#9CA3AF]">{trackOf(d.id)} · {d.courier}</span>
            {d.kind === 'sale' && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#F1F2F4] px-1.5 py-0.5 text-[9.5px] font-bold text-[#6B7280]">
                <Banknote className="size-2.5" aria-hidden /> Продажа
              </span>
            )}
            {isWorse(d) && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#FDECEA] px-1.5 py-0.5 text-[9.5px] font-bold text-[#B3382E]">
                <AlertTriangle className="size-2.5" aria-hidden /> Дефекты
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {meta.label === 'Доставлен' ? (
              <CheckCircle2 className="size-3.5 shrink-0" style={{ color: t.text }} aria-hidden />
            ) : d.status === 'returned' ? (
              <AlertTriangle className="size-3.5 shrink-0" style={{ color: t.text }} aria-hidden />
            ) : (
              <span className="size-2 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: t.text }} aria-hidden />
            )}
            <span className="shrink-0 text-[12px] font-semibold" style={{ color: t.text }}>{meta.label}</span>
            <span className="truncate text-[12px] text-[#9CA3AF]">{captionOf(d, nowMs)}</span>
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-[#C6CAD1]" aria-hidden />
      </div>
    </button>
  )
}

// ---------- статус-плашка (макет: синяя с грузовиком «В пути / Сегодня до 18:00») ----------
function StatusPlate({ d, nowMs }: { d: DeliveryDTO; nowMs: number }) {
  const meta = statusMeta(d)
  const t = TONE[meta.tone]
  const etaLeft = new Date(d.eta).getTime() - nowMs
  const deadline = new Date(d.pickupDeadline ?? d.eta).getTime() - nowMs
  const Icon =
    d.status === 'collecting' ? Package
      : d.status === 'in_transit' ? Truck
        : d.status === 'arrived' ? Home
          : d.status === 'delivered' ? CheckCircle2
            : AlertTriangle
  const when =
    d.status === 'delivered' || d.status === 'returned' ? d.deliveredAt ?? d.eta
      : d.status === 'arrived' ? d.pickupDeadline ?? d.eta
        : d.eta
  const whenDate = new Date(when)
  const closed = d.status === 'delivered' || d.status === 'returned'
  const sub =
    d.status === 'collecting'
      ? d.kind === 'sale' ? 'Курьер выехал к вам' : 'Продавец собирает посылку'
      : d.status === 'in_transit'
        ? etaLeft > 0 ? 'Курьер в вашем городе' : 'Курьер уже рядом'
        : d.status === 'arrived'
          ? deadline > 0 ? 'Ждёт в пункте выдачи' : 'Оформляем возврат'
          : d.status === 'returned'
            ? 'Деньги вернулись, комиссия 5%'
            : d.kind === 'sale' ? 'Деньги зачислены на счёт' : 'Получение подтверждено'
  return (
    <div className="flex items-center gap-3 rounded-[20px] px-3.5 py-3" style={{ backgroundColor: t.plate }}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white" style={{ color: t.text }} aria-hidden>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold leading-tight" style={{ color: t.text }}>{meta.label}</div>
        <div className="mt-0.5 truncate text-[12px]" style={{ color: t.sub }}>{sub}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[13px] font-bold" style={{ color: t.text }}>
          {isToday(whenDate, nowMs) ? 'Сегодня' : dateOnly(whenDate)}
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: t.sub }}>
          {closed ? fmtTime(whenDate) : `до ${fmtTime(whenDate)}`}
        </div>
      </div>
    </div>
  )
}

// ---------- ВЕРТИКАЛЬНЫЙ таймлайн (макет: экран 2) ----------
function VerticalTimeline({ d, nowMs, city }: { d: DeliveryDTO; nowMs: number; city: string }) {
  const stages = stagesOf(d)
  const cur = stageIndex(d)
  const returned = d.status === 'returned'
  const etaLeft = new Date(d.eta).getTime() - nowMs
  const deadline = new Date(d.pickupDeadline ?? d.eta).getTime()
  const origin = CITIES_OUT[hashOf(d.id) % CITIES_OUT.length]
  const dest = CITIES_OUT[hashOf(`${d.id}d`) % CITIES_OUT.length]
  const cityAt = (i: number) => (d.kind === 'purchase' ? (i <= 2 ? origin : city) : i <= 1 ? city : dest)

  const rows = stages.map((stage, i) => {
    const done = cur === -1 || i < cur
    let date = ''
    if (i === 0) date = fmtDateTime(d.createdAt)
    else if (i === 1) {
      date = d.status === 'collecting'
        ? d.kind === 'sale' ? 'Курьер выехал к вам' : 'Готовится к отправке'
        : `Забран · ${fmtDateTime(d.collectEndsAt)}`
    } else if (i === 2) {
      date = d.status === 'in_transit'
        ? etaLeft > 0 ? `Прибудет через ${fmtRemain(etaLeft)}` : 'Курьер уже в вашем городе'
        : done ? `Прибыл · ${fmtDateTime(d.eta)}` : `Ожидается ${fmtDateTime(d.eta)}`
    } else if (i === 3 && d.kind === 'purchase') {
      date = d.status === 'arrived'
        ? deadline > nowMs ? `Хранится ещё ${fmtRemain(deadline - nowMs)}` : 'Оформляется возврат'
        : returned ? 'Не забрали за 24 ч, вернули продавцу' : `Заберите до ${fmtDateTime(d.pickupDeadline ?? d.eta)}`
    } else {
      date = d.status === 'delivered' || d.status === 'returned'
        ? d.deliveredAt ? `Вручение · ${fmtDateTime(d.deliveredAt)}` : ''
        : 'Ожидается'
    }
    return { stage, done, date, city: cityAt(i) }
  })

  return (
    <ol className="flex flex-col" aria-label="Статусы доставки">
      {rows.map((row, i) => {
        const active = i === cur
        const isLast = i === rows.length - 1
        const lineBlue = cur === -1 || i < cur
        return (
          <li key={row.stage.label} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && (
              <span
                className="absolute left-[8px] top-6 h-[calc(100%-24px)] w-[2px] rounded-full"
                style={{ backgroundColor: lineBlue ? BLUE : '#E8EAEE' }}
                aria-hidden
              />
            )}
            {/* точка: текущая залита синим, прошедшая — синее кольцо, будущая серая */}
            <span
              className={'relative z-10 mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full' + (active ? ' animate-pulse' : '')}
              style={
                active
                  ? { backgroundColor: BLUE, boxShadow: '0 0 0 4px rgba(43,123,243,0.15)' }
                  : row.done
                    ? { backgroundColor: '#FFFFFF', border: `2.5px solid ${BLUE}` }
                    : { backgroundColor: '#EEF0F3', border: '2px solid #E1E4E9' }
              }
              aria-hidden
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <div
                className={'text-[13.5px] font-semibold leading-tight ' + (row.done || active ? 'text-[#141414]' : 'text-[#9CA3AF]')}
              >
                {row.stage.label}
              </div>
              {row.date && <div className="mt-0.5 text-[12px] leading-snug text-black/45">{row.date}</div>}
              <div className="text-[12px] leading-snug text-black/35">{row.city}</div>
            </div>
          </li>
        )
      })}
      {returned && (
        <li className="mt-1 flex gap-2 rounded-xl bg-[#FDECEA] p-3">
          <AlertTriangle className="size-4 shrink-0 text-[#B3382E]" aria-hidden />
          <p className="text-[11.5px] leading-relaxed text-[#B3382E]">
            Посылку не забрали за 24 ч, курьер вернул её продавцу. Возврат {fmtMoney(Math.round(d.price * 0.95))}, комиссия 5%.
          </p>
        </li>
      )}
    </ol>
  )
}

// ---------- экран посылки: трекинг + детали (макет: экраны 2 и 3) ----------
function ParcelScreen({ d, onBack, onTrack, nowMs }: { d: DeliveryDTO; onBack: () => void; onTrack: () => void; nowMs: number }) {
  const session = useOS((s) => s.session)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const etaLeft = new Date(d.eta).getTime() - nowMs
  const worse = isWorse(d)
  const canPickup = d.status === 'arrived' && d.kind === 'purchase'
  const meta = statusMeta(d)
  const playerCity = session?.city ?? 'Москва'

  const copyTrack = () => {
    try {
      void navigator.clipboard?.writeText(trackOf(d.id))
    } catch { /* не критично */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const share = async () => {
    const text = `Resale Доставка · ${trackOf(d.id)} · ${d.title} · статус: ${meta.label}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Resale Доставка', text })
      } else {
        await navigator.clipboard?.writeText(text)
        setShared(true)
        setTimeout(() => setShared(false), 1800)
      }
    } catch { /* отмена шаринга, не критично */ }
  }

  const pickup = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await api.pickupDelivery(d.id)
      sound.success()
      pushToastSafe('Resale Доставка', `«${d.title}»: посылка получена, вещь в инвентаре`)
      if (typeof res.balance === 'number') refreshBalance(res.balance)
      onBack()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Не удалось получить посылку')
    } finally {
      setBusy(false)
    }
  }

  const hash = hashOf(d.id)
  const sender = d.kind === 'sale' ? (session?.displayName ?? 'Вы') : SENDER_NAMES[hash % SENDER_NAMES.length]
  const receiver = d.kind === 'sale' ? 'Покупатель Resale' : (session?.displayName ?? 'Вы')
  const address = `г. ${playerCity}, ${STREETS[hash % STREETS.length]}, д. ${1 + ((hash >>> 7) % 38)}`
  const planned = isToday(new Date(d.eta), nowMs) ? `Сегодня, до ${fmtTime(d.eta)}` : fmtDateTime(d.eta)
  const weight = `${((3 + (hashOf(`${d.id}w`) % 97)) / 10).toFixed(1)} кг`
  const details: { icon: typeof Package; label: string; value: string }[] = [
    { icon: UserRound, label: 'Отправитель', value: sender },
    { icon: User, label: 'Получатель', value: receiver },
    { icon: MapPin, label: 'Адрес доставки', value: address },
    { icon: CalendarDays, label: 'Плановая доставка', value: planned },
    { icon: Package, label: 'Содержимое', value: d.title },
    { icon: Weight, label: 'Вес посылки', value: weight },
  ]

  return (
    <div className="flex h-full flex-col">
      {/* шапка */}
      <div className="flex shrink-0 items-center gap-2.5 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к посылкам"
          className="flex size-10 items-center justify-center rounded-full bg-white text-[#141414] ring-1 ring-black/[0.05] transition active:scale-95"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <div className="truncate text-[16px] font-bold leading-tight text-[#141414]">
            {d.kind === 'sale' ? 'Продажа · доставка' : 'Посылка'}
          </div>
          <div className="font-mono text-[11px] text-[#9CA3AF]">{trackOf(d.id)}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 pt-1 [scrollbar-width:thin]">
        {/* товар: фото + название + цена + трек с копированием */}
        <div className={`${CARD} p-3.5`}>
          <div className="flex gap-3">
            <img
              loading="lazy"
              decoding="async"
              src={d.image}
              alt=""
              className="size-[72px] shrink-0 rounded-2xl bg-[#F1F2F4] object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#141414]">{d.title}</div>
              <div className="mt-1 text-[17px] font-bold tabular-nums text-[#141414]">
                {d.kind === 'sale' ? '+' : ''}{fmtMoney(d.price)}
              </div>
              <div className="mt-1 text-[11px] text-[#9CA3AF]">
                {d.kind === 'sale' ? 'Продажа' : 'Покупка'} · {timeAgo(d.createdAt)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={copyTrack}
            aria-label="Скопировать трек-номер"
            className="mt-3 flex h-11 w-full items-center justify-between rounded-xl bg-[#F1F2F4] px-3 text-left transition active:scale-[0.98]"
          >
            <span className="font-mono text-[12px] font-semibold text-[#141414]">{trackOf(d.id)}</span>
            <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: GREEN }}>
              <Copy className="size-3" aria-hidden />
              {copied ? 'Скопировано' : 'Копировать'}
            </span>
          </button>
        </div>

        {/* статус-плашка */}
        <StatusPlate d={d} nowMs={nowMs} />

        {/* «Отследить» + «Поделиться» */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onTrack}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
            style={{ backgroundColor: GREEN }}
          >
            <Navigation className="size-4.5" aria-hidden />
            Отследить
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className={`${CARD} flex h-12 flex-1 items-center justify-center gap-2 text-[15px] font-semibold text-[#141414] transition-transform active:scale-[0.98]`}
          >
            <Share2 className="size-4.5 text-[#6B7280]" aria-hidden />
            {shared ? 'Готово' : 'Поделиться'}
          </button>
        </div>

        {/* вертикальный таймлайн статусов */}
        <div className={`${CARD} p-4`}>
          <h3 className={`${CAPS} mb-3`}>Статус доставки</h3>
          <VerticalTimeline d={d} nowMs={nowMs} city={playerCity} />
        </div>

        {/* характеристики заказа с иконками */}
        <div className={`${CARD} p-4`}>
          <h3 className={CAPS}>Детали заказа</h3>
          <div className="mt-2 divide-y divide-black/[0.05]">
            {details.map((row) => (
              <div key={row.label} className="flex items-center gap-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#6B7280]" aria-hidden>
                  <row.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#6B7280]">{row.label}</span>
                <span className="max-w-[55%] text-right text-[13px] font-medium leading-snug text-[#141414]">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* КНОПКА ПОЛУЧЕНИЯ — главная фаза логистики */}
        {canPickup && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void pickup()}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: GREEN }}
            >
              <PackageCheck className="size-5" aria-hidden />
              {busy ? 'Оформляем…' : 'Забрать посылку'}
            </button>
            <p className="text-center text-[10px] text-[#9CA3AF]">
              Не забрали за 24 ч: курьер вернёт товар, возврат денег минус 5%
            </p>
          </div>
        )}
        {err && <p className="text-center text-[12px] font-medium text-[#B3382E]">{err}</p>}

        {d.status === 'in_transit' && d.kind === 'purchase' && (
          <div className="flex gap-2 rounded-[20px] bg-[#FBF3E2] p-3.5 ring-1 ring-[#F0E4C4]">
            <AlertTriangle className="size-4 shrink-0 text-[#9A6B10]" aria-hidden />
            <p className="text-[11px] leading-relaxed text-[#8A6116]">
              Осмотр при получении невозможен. Курьерская доставка: риск скрытых дефектов.
            </p>
          </div>
        )}

        {(d.status === 'delivered' || d.status === 'returned') && d.kind === 'purchase' && (
          <div className={`${CARD} p-4`}>
            <h3 className={CAPS}>Осмотр при получении</h3>
            <div
              className={
                'mt-3 flex items-center justify-between gap-2 rounded-xl p-3 ' +
                (worse || d.status === 'returned' ? 'bg-[#FDECEA]' : 'bg-[#E6F3EB]')
              }
            >
              <div className="flex items-center gap-2.5">
                {worse || d.status === 'returned' ? (
                  <>
                    <span className="flex size-8 items-center justify-center rounded-full bg-white text-[#B3382E]" aria-hidden>
                      <AlertTriangle className="size-4" />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-[#B3382E]">
                        {d.status === 'returned' ? 'Возвращено продавцу' : 'Есть дефекты'}
                      </div>
                      <div className="text-[10px] text-[#9CA3AF]">
                        {d.status === 'returned' ? 'Комиссия 5% удержана' : 'Продавец приукрасил состояние'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex size-8 items-center justify-center rounded-full bg-white" style={{ color: GREEN }} aria-hidden>
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold" style={{ color: GREEN }}>Как в описании</div>
                      <div className="text-[10px] text-[#9CA3AF]">Проверка пройдена</div>
                    </div>
                  </>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-[#9CA3AF]">{d.deliveredAt ? timeAgo(d.deliveredAt) : null}</span>
            </div>
            {!worse && d.status === 'delivered' && d.realCondition && (
              <div className="mt-2 px-1 text-[11px] text-[#9CA3AF]">
                Фактическое состояние:{' '}
                <span className="font-medium text-[#141414]">{CONDITION_LABEL[d.realCondition] ?? d.realCondition}</span>
              </div>
            )}
          </div>
        )}

        <div className="pb-2 pt-1 text-center text-[10px] text-[#9CA3AF]">Resale Доставка · осмотр при получении · это игра</div>
      </div>
    </div>
  )
}

// ---------- экран курьера: карта + нижняя карточка (макет: экран 4) ----------
function CourierScreen({ d, nowMs, showBack, onBack }: { d: DeliveryDTO; nowMs: number; showBack: boolean; onBack?: () => void }) {
  const pushToast = useOS((s) => s.pushToast)
  const session = useOS((s) => s.session)
  const etaLeft = new Date(d.eta).getTime() - nowMs
  const etaMin = d.status === 'in_transit' ? Math.max(1, Math.min(180, Math.ceil(etaLeft / 60000))) : 15
  const courierSub =
    d.status === 'in_transit' ? 'Доставляет вашу посылку'
      : d.status === 'arrived' ? 'Ждёт в пункте выдачи'
        : d.kind === 'sale' ? 'Скоро заберёт ваш товар' : 'Продавец собирает посылку'
  const mapBtn =
    'flex size-11 items-center justify-center rounded-full bg-white text-[#141414] shadow-[0_4px_16px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.05] transition active:scale-95'

  return (
    <div className="flex h-full flex-col bg-[#F6F7F9]">
      {/* карта на весь остаток экрана */}
      <div className="relative min-h-0 flex-1">
        <GameMap etaMin={etaMin} className="absolute inset-0" />
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Назад"
            className={`${mapBtn} absolute left-3 top-3 z-10`}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        )}
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-2.5">
          <button
            type="button"
            aria-label="Построить маршрут"
            className={mapBtn}
            onClick={() => pushToast('Карта', 'Маршрут построен до пункта выдачи')}
          >
            <Navigation className="size-[19px]" style={{ color: GREEN }} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Моё местоположение"
            className={mapBtn}
            onClick={() => pushToast('Карта', `Вы в ${session?.city ?? 'Москве'} · это игра`)}
          >
            <Crosshair className="size-[19px]" aria-hidden />
          </button>
        </div>
      </div>

      {/* нижняя карточка курьера */}
      <div className="shrink-0 rounded-t-[24px] bg-white px-4 pb-4 pt-2 shadow-[0_-6px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/10" aria-hidden />
        <div className="flex items-center gap-3">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{ backgroundColor: `hsl(${hueOf(d.courier)} 55% 45%)` }}
            aria-hidden
          >
            {initialsOf(d.courier)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold text-[#141414]">{d.courier}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-[#6B7280]">
              <Star className="size-3" style={{ color: AMBER }} fill={AMBER} aria-hidden />
              4.9 · Курьер Resale
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[#9CA3AF]">{courierSub}</div>
          </div>
          <button
            type="button"
            aria-label="Позвонить курьеру"
            onClick={() => pushToast('Курьер', `Соединяем с ${d.courier}…`)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#141414] transition active:scale-95"
          >
            <Phone className="size-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Написать курьеру"
            onClick={() => pushToast('Курьер', 'Чат с курьером скоро появится')}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#141414] transition active:scale-95"
          >
            <MessageCircle className="size-[18px]" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-black/[0.06] pt-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#6B7280]" aria-hidden>
            <Truck className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-[#141414]">{CARS[hashOf(d.courier) % CARS.length]}</div>
            <div className="mt-0.5 font-mono text-[12px] text-[#6B7280]">{plateOf(d.courier)}</div>
          </div>
          <span
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: TONE[statusMeta(d).tone].plate, color: TONE[statusMeta(d).tone].text }}
          >
            {statusMeta(d).label}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------- карта без активных доставок ----------
function MapEmptyScreen({ onGo }: { onGo: () => void }) {
  return (
    <div className="flex h-full flex-col bg-[#F6F7F9]">
      <div className="relative min-h-0 flex-1">
        <GameMap className="absolute inset-0" />
      </div>
      <div className="shrink-0 rounded-t-[24px] bg-white px-6 pb-6 pt-2 text-center shadow-[0_-6px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/10" aria-hidden />
        <img
          src="/img/empty/delivery.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="mx-auto h-20"
        />
        <div className="mt-2 text-[15px] font-bold text-[#141414]">Машины на маршруте нет</div>
        <p className="mx-auto mt-1 max-w-[250px] text-[12.5px] leading-relaxed text-[#9CA3AF]">
          Карта оживёт, когда посылка выйдет в путь. Загляните в список доставок.
        </p>
        <button
          type="button"
          onClick={onGo}
          className="mt-3 h-11 w-full rounded-2xl text-[14px] font-bold text-white transition-transform active:scale-[0.98]"
          style={{ backgroundColor: GREEN }}
        >
          К посылкам
        </button>
      </div>
    </div>
  )
}

// ---------- история: доставлены + возвраты ----------
function HistoryScreen({ items, nowMs, onOpen }: { items: DeliveryDTO[]; nowMs: number; onOpen: (id: string) => void }) {
  const delivered = items.filter((d) => d.status === 'delivered')
  const returned = items.filter((d) => d.status === 'returned')
  if (delivered.length === 0 && returned.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
        <img
          src="/img/empty/deal-success.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-24"
        />
        <div className="mt-3 text-[15px] font-semibold text-[#141414]">История пуста</div>
        <div className="mt-1 max-w-64 text-[13px] leading-relaxed text-[#9CA3AF]">
          Завершённые доставки и возвраты появятся здесь
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4 pt-1 [scrollbar-width:thin]">
      {delivered.length > 0 && (
        <>
          <h2 className={`${CAPS} px-1 pb-1`}>Доставлены</h2>
          {delivered.map((d) => (
            <ParcelCard key={d.id} d={d} nowMs={nowMs} onOpen={() => onOpen(d.id)} />
          ))}
        </>
      )}
      {returned.length > 0 && (
        <>
          <h2 className={`${CAPS} px-1 pb-1 pt-2`}>Возвраты</h2>
          {returned.map((d) => (
            <ParcelCard key={d.id} d={d} nowMs={nowMs} onOpen={() => onOpen(d.id)} />
          ))}
        </>
      )}
      <div className="pb-2 pt-1 text-center text-[10px] text-[#9CA3AF]">Resale Доставка · это игра</div>
    </div>
  )
}

// ---------- профиль: сессия + статистика доставок ----------
function ProfileScreen({ items }: { items: DeliveryDTO[] }) {
  const session = useOS((s) => s.session)
  const purchases = items.filter((d) => d.kind === 'purchase')
  const sales = items.filter((d) => d.kind === 'sale')
  const spent = purchases.reduce((s, d) => s + d.price, 0)
  const earned = sales.reduce((s, d) => s + d.price, 0)
  const rating = session && session.ratingCount > 0 ? (session.ratingSum / session.ratingCount).toFixed(1) : '5.0'
  const stats = [
    { n: items.length, label: 'всего посылок' },
    { n: items.filter((d) => d.status === 'delivered').length, label: 'доставлено' },
    { n: items.filter(isActive).length, label: 'в пути' },
    { n: items.filter((d) => d.status === 'returned').length, label: 'возвраты' },
  ]
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 pt-1 [scrollbar-width:thin]">
      <div className={`${CARD} p-4`}>
        <div className="flex items-center gap-3.5">
          {session?.photoUrl ? (
            <img
              src={session.photoUrl}
              alt=""
              className="size-16 shrink-0 rounded-full bg-[#F1F2F4] object-cover"
            />
          ) : (
            <span
              className="flex size-16 shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white"
              style={{ backgroundColor: `hsl(${hueOf(session?.username ?? 'player')} 55% 45%)` }}
              aria-hidden
            >
              {initialsOf(session?.displayName ?? 'Игрок')}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-bold text-[#141414]">{session?.displayName ?? 'Игрок'}</div>
            <div className="truncate text-[12.5px] text-[#6B7280]">{session?.username ? `@${session.username}` : 'игрок Resale'}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F3EB] px-2 py-0.5 text-[10.5px] font-semibold text-[#12894B]">
                <MapPin className="size-2.5" aria-hidden />
                {session?.city ?? 'Москва'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FBF3E2] px-2 py-0.5 text-[10.5px] font-semibold text-[#9A6B10]">
                <Star className="size-2.5" aria-hidden />
                {rating}
              </span>
              <span className="inline-flex items-center rounded-full bg-[#F1F2F4] px-2 py-0.5 text-[10.5px] font-semibold text-[#6B7280]">
                Уровень {session?.level ?? 1}
              </span>
            </div>
          </div>
        </div>
      </div>

      <h2 className={`${CAPS} px-1`}>Доставки</h2>
      <div className={`${CARD} p-4`}>
        <div className="grid grid-cols-2 gap-2.5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-[#F6F7F9] p-3">
              <div className="text-[20px] font-bold tabular-nums text-[#141414]">{s.n}</div>
              <div className="mt-0.5 text-[11px] text-[#6B7280]">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 divide-y divide-black/[0.05]">
          <div className="flex items-center gap-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#6B7280]" aria-hidden>
              <Banknote className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[#6B7280]">Потрачено на доставки</span>
            <span className="text-[13px] font-semibold tabular-nums text-[#141414]">{fmtMoney(spent)}</span>
          </div>
          <div className="flex items-center gap-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#6B7280]" aria-hidden>
              <PackageCheck className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[#6B7280]">Выручка с продаж</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: GREEN }}>{fmtMoney(earned)}</span>
          </div>
        </div>
      </div>

      <h2 className={`${CAPS} px-1`}>О сервисе</h2>
      <div className={`${CARD} p-4`}>
        <div className="divide-y divide-black/[0.05]">
          {[
            { icon: Truck, title: 'Курьеры Resale', sub: 'От продавца до пункта выдачи за пару часов' },
            { icon: ShieldCheck, title: 'Осмотр при получении', sub: 'Проверяйте вещь, когда забираете посылку' },
            { icon: RotateCcw, title: 'Возврат 24 часа', sub: 'Не забрали за 24 ч, вернём деньги (комиссия 5%)' },
          ].map((row) => (
            <div key={row.title} className="flex items-center gap-3 py-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#6B7280]" aria-hidden>
                <row.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[#141414]">{row.title}</div>
                <div className="truncate text-[11.5px] text-[#9CA3AF]">{row.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pb-2 pt-1 text-center text-[10px] text-[#9CA3AF]">Resale Доставка · версия 1.0 · это игра</div>
    </div>
  )
}

// ---------- нижний таб-бар (макет: Доставки / Карта / История / Профиль) ----------
function TabBar({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <nav className="shrink-0 bg-white ring-1 ring-black/[0.05]" aria-label="Разделы доставок">
      <div className="grid grid-cols-4">
        {TABS.map((t) => {
          const on = tab === t.key
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.key)}
              className="flex h-[62px] flex-col items-center justify-center gap-0.5 transition active:scale-[0.97]"
              style={{ color: on ? GREEN : '#9CA3AF' }}
            >
              <span
                className="flex h-7 items-center rounded-full px-3.5"
                style={{ backgroundColor: on ? 'rgba(18,137,75,0.10)' : 'transparent' }}
              >
                <Icon className="size-[19px]" aria-hidden />
              </span>
              <span className={'text-[10px] leading-none ' + (on ? 'font-bold' : 'font-medium')}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default function DeliveryApp() {
  const [data, setData] = useState<DeliveryDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('deliveries')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'parcel' | 'courier' | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const pushToast = useOS((s) => s.pushToast)

  useTick(1000) // живой отсчёт ETA
  const nowMs = Date.now()

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

  // Тихий refetch каждые 5 секунд: доставки приходят в реальном времени
  useEffect(() => {
    const id = setInterval(() => {
      void load(true)
    }, 5000)
    return () => clearInterval(id)
  }, [load])

  const items = data ?? []
  // Хронологический порядок: новые сверху
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const active = sorted.filter(isActive)
  const deliveredAll = sorted.filter((d) => d.status === 'delivered')
  const returnedAll = sorted.filter((d) => d.status === 'returned')

  // локальный поиск по названию/треку — чисто UI, данные те же
  const needle = q.trim().toLowerCase()
  const searched = needle
    ? sorted.filter(
        (d) => d.title.toLowerCase().includes(needle) || trackOf(d.id).toLowerCase().includes(needle),
      )
    : sorted
  const filtered =
    filter === 'all' ? searched
      : filter === 'transit' ? searched.filter(isActive)
        : filter === 'delivered' ? searched.filter((d) => d.status === 'delivered')
          : searched.filter((d) => d.status === 'returned')

  const selected = selectedId ? sorted.find((d) => d.id === selectedId) ?? null : null
  const activeDelivery =
    sorted.find((d) => d.status === 'in_transit') ??
    sorted.find((d) => d.status === 'arrived') ??
    sorted.find((d) => d.status === 'collecting') ??
    null

  const counts: Record<FilterKey, number> = {
    all: sorted.length,
    transit: active.length,
    delivered: deliveredAll.length,
    archive: returnedAll.length,
  }

  const openParcel = (id: string) => {
    setSelectedId(id)
    setView('parcel')
  }

  return (
    <div className="flex h-full flex-col bg-[#F6F7F9] text-[#141414]">
      {/* ---------- оверлеи: посылка / курьер ---------- */}
      {view === 'parcel' && selected ? (
        <ParcelScreen
          d={selected}
          onBack={() => setView(null)}
          onTrack={() => setView('courier')}
          nowMs={nowMs}
        />
      ) : view === 'courier' && (selected ?? activeDelivery) ? (
        <CourierScreen
          d={(selected ?? activeDelivery) as DeliveryDTO}
          nowMs={nowMs}
          showBack
          onBack={() => setView(selected ? 'parcel' : null)}
        />
      ) : (
        <>
          {tab === 'deliveries' && (
            <>
              {/* ---------- шапка: заголовок + поиск + подсказка ---------- */}
              <div className="shrink-0 px-4 pb-2 pt-4">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#141414]">Доставки</h1>
                    <p className="mt-0.5 text-[13px] text-[#6B7280]">
                      {active.length > 0 ? `${active.length} едут · обновляем сами` : 'Посылки и выплаты с продаж'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchOpen((v) => !v)}
                    aria-label="Поиск по посылкам"
                    aria-pressed={searchOpen}
                    className={
                      'flex size-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 ' +
                      (searchOpen ? 'text-white' : 'bg-white text-[#141414] ring-1 ring-black/[0.05]')
                    }
                    style={searchOpen ? { backgroundColor: GREEN } : undefined}
                  >
                    <Search className="size-[18px]" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => pushToast('Доставки', 'Посылка появится здесь после покупки или продажи')}
                    aria-label="Как работает доставка"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#141414] ring-1 ring-black/[0.05] transition active:scale-95"
                  >
                    <Plus className="size-[18px]" aria-hidden />
                  </button>
                </div>

                {searchOpen && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3.5 ring-1 ring-black/[0.05]">
                    <Search className="size-4 shrink-0 text-[#9CA3AF]" aria-hidden />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Название или трек-номер"
                      aria-label="Поиск по посылкам"
                      className="h-11 w-full bg-transparent text-[14px] text-[#141414] outline-none placeholder:text-[#9CA3AF]"
                    />
                    {q && (
                      <button
                        type="button"
                        onClick={() => setQ('')}
                        aria-label="Очистить поиск"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#9CA3AF] active:bg-black/5"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                )}

                {/* ---------- чипы-фильтры: Все / В пути / Доставлены / Архив ---------- */}
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Фильтры посылок">
                  {FILTERS.map((f) => {
                    const on = filter === f.key
                    const count = counts[f.key]
                    return (
                      <button
                        key={f.key}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setFilter(f.key)}
                        className={
                          'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition active:scale-[0.97] ' +
                          (on ? 'font-semibold text-white' : 'bg-white font-medium text-[#141414] ring-1 ring-black/[0.05]')
                        }
                        style={on ? { backgroundColor: GREEN } : undefined}
                      >
                        {f.label}
                        {count > 0 && (
                          <span
                            className={
                              'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ' +
                              (on ? 'bg-white/25 text-white' : 'bg-black/5 text-[#6B7280]')
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

              {/* ---------- список посылок ---------- */}
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4 pt-1 [scrollbar-width:thin]">
                {loading && !data ? (
                  <div className="flex flex-col gap-2.5">
                    <div className="h-9 w-44 animate-pulse rounded-full bg-white" />
                    <div className="h-[86px] animate-pulse rounded-[20px] bg-white" />
                    <div className="h-[86px] animate-pulse rounded-[20px] bg-white" />
                    <div className="h-[86px] animate-pulse rounded-[20px] bg-white" />
                  </div>
                ) : error && !data ? (
                  <div className="flex flex-col items-center gap-1 rounded-[20px] bg-[#FDECEA] p-6 text-center">
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
                      className="h-11 rounded-2xl px-6 text-sm font-bold text-white transition active:scale-95"
                      style={{ backgroundColor: GREEN }}
                    >
                      Повторить
                    </button>
                  </div>
                ) : sorted.length === 0 ? (
                  <div className={`${CARD} flex flex-col items-center px-4 py-10 text-center`}>
                    <img
                      src="/img/empty/delivery.webp"
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="h-24"
                    />
                    <div className="mt-3 text-[15px] font-semibold text-[#141414]">Доставок пока нет</div>
                    <div className="mt-1 max-w-64 text-[13px] leading-relaxed text-[#9CA3AF]">
                      Каждая покупка едет посылкой: собираем, в пути, забирайте в пункте выдачи.
                    </div>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className={`${CARD} flex flex-col items-center px-4 py-10 text-center`}>
                    <img
                      src="/img/empty/deal-success.webp"
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="h-24"
                    />
                    <div className="mt-3 text-[15px] font-semibold text-[#141414]">
                      {needle ? 'Ничего не нашлось' : 'Здесь пока пусто'}
                    </div>
                    <div className="mt-1 text-[13px] text-[#9CA3AF]">
                      {needle ? 'Попробуйте другое название или трек' : 'Смените фильтр, чтобы увидеть другие посылки'}
                    </div>
                  </div>
                ) : (
                  filtered.map((d) => (
                    <ParcelCard key={d.id} d={d} nowMs={nowMs} onOpen={() => openParcel(d.id)} />
                  ))
                )}
                {sorted.length > 0 && filtered.length > 0 && (
                  <div className="pb-2 pt-1 text-center text-[10px] text-[#9CA3AF]">
                    Resale Доставка · осмотр при получении · это игра
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'map' && (
            activeDelivery ? (
              <CourierScreen d={activeDelivery} nowMs={nowMs} showBack={false} />
            ) : (
              <MapEmptyScreen onGo={() => setTab('deliveries')} />
            )
          )}

          {tab === 'history' && (
            <>
              <div className="shrink-0 px-4 pb-2 pt-4">
                <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#141414]">История</h1>
                <p className="mt-0.5 text-[13px] text-[#6B7280]">
                  {deliveredAll.length + returnedAll.length > 0
                    ? `${deliveredAll.length} доставлено · ${returnedAll.length} возвратов`
                    : 'Доставленное и возвраты'}
                </p>
              </div>
              <HistoryScreen items={sorted} nowMs={nowMs} onOpen={openParcel} />
            </>
          )}

          {tab === 'profile' && (
            <>
              <div className="shrink-0 px-4 pb-2 pt-4">
                <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#141414]">Профиль</h1>
                <p className="mt-0.5 text-[13px] text-[#6B7280]">Resale Доставка</p>
              </div>
              <ProfileScreen items={sorted} />
            </>
          )}

          <TabBar tab={tab} onChange={setTab} />
        </>
      )}
    </div>
  )
}
