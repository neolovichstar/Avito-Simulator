'use client'

// Приложение «Банк» — редизайн 1:1 по интерфейсу СберБанк Онлайн (светлая тема):
// фон #F5F6FA, мягкий зелёный градиентный хедер (#D3ECD3→#F5F6FA) с аватаром-инициалами,
// белой пилюлей поиска и зелёным кружком-микрофоном; карусель карт с фонами-изображениями
// из реестра public/img/cards (30 градиентов) + пикер «Оформление карты» (bottom-sheet,
// выбор каждой карты сохраняется в localStorage); белый блок «Карты» radius 20;
// быстрые действия — 4 белых круга 48px с зелёными иконками; «История» с цветными
// кругами-категориями (поступления +зелёные, списания чёрные); промо-баннер #D8E9FA;
// нижний таб-бар Главный/Платежи/История/Ещё (активный #21A03A, неактивный #9AA0A8).
// Вся бизнес-логика (api.bank/takeLoan/repayLoan/depositOp, поиск, аналитика, CSV,
// нижние листы, touch-action свайпов) сохранена 1:1.
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import {
  AlertTriangle, ArrowLeft, ArrowLeftRight, Banknote, Bell, Building2, Car, Check, ChevronRight, Clock, CreditCard,
  FileDown, Gavel, Home, Info, Landmark, LayoutGrid, Loader2, Mic, Palette, Percent, PieChart,
  PiggyBank, Plus, QrCode, Receipt, Search, Send, ShieldCheck, ShoppingBag, Smartphone, TrendingUp,
  Truck, Undo2, Wifi, X, type LucideIcon,
} from 'lucide-react'
import { api, ApiError, exportCsvUrl } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { TX_TYPE_LABEL } from '@/lib/types'
import type { BankData, SessionUser, TransactionDTO } from '@/lib/types'
import { DEPOSIT_RATE_PER_HOUR, cardNumberFor, creditLabel } from '@/lib/economy'
import { useCountUp } from '@/lib/use-count-up'
import { Slider } from '@/components/ui/slider'
import { sound } from '@/lib/sound'
import {
  ALL_CARD_BGS, CARD_COLORS, CARD_COLOR_LABEL, DEFAULT_CARD_BGS, cardBg,
  getCardBg, setCardBg, type CardBg, type CardColor,
} from '@/lib/cards'

type Screen = 'main' | 'payments' | 'analytics' | 'history' | 'card'
type SheetKey = 'deposit' | 'loan' | 'qr' | 'more' | null
type CardKey = 'debit' | 'credit' | 'savings'
type ChartMode = 'inc' | 'exp'

// Названия карт игрока для пикера оформления
const CARD_STYLE_LABEL: Record<CardKey, string> = {
  debit: 'Дебетовая',
  credit: 'Кредитная',
  savings: 'Накопительный счёт',
}

const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
const MONTH_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTH_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

// Токены Сбера
const GREEN = '#21A03A'
const TEXT = '#1A1A1A'
const TEXT2 = '#9AA0A8'
const CARD = 'rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]'

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

function toAmount(v: string): number {
  return Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, '')) || 0))
}

// ---- Агрегация операций для «Анализа» ----
interface AggCat {
  key: string
  label: string
  color: string
  total: number
  count: number
}

// Светлые цвета категорий (Сбер): пополнения зелёные, покупки янтарные, налоги красные, переводы фиолетовые
const CAT_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  purchase: { label: 'Покупки', color: '#F8A13A', icon: ShoppingBag },
  sale: { label: 'Продажи', color: GREEN, icon: TrendingUp },
  loan: { label: 'Кредиты', color: '#7B61FF', icon: Landmark },
  repay: { label: 'Погашение кредита', color: '#7B61FF', icon: Undo2 },
  tax: { label: 'Налоги', color: '#E5584B', icon: Receipt },
  penalty: { label: 'Пени налоговой', color: '#E5584B', icon: AlertTriangle },
  deposit: { label: 'Пополнение вклада', color: GREEN, icon: PiggyBank },
  withdraw: { label: 'Снятие вклада', color: '#F8A13A', icon: Banknote },
  interest: { label: 'Проценты по вкладу', color: GREEN, icon: Percent },
  boost: { label: 'Продвижение', color: '#F8A13A', icon: TrendingUp },
  transfer: { label: 'Переводы людям', color: '#7B61FF', icon: Send },
}
const FALLBACK_COLORS = ['#F8A13A', GREEN, '#7B61FF', '#E5584B', '#12A594', TEXT2]

function catMeta(t: TransactionDTO): { label: string; color: string; icon: LucideIcon } {
  const meta = CAT_META[t.type]
  if (meta) return meta
  const word = (t.note ?? '').trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}%-]/gu, '') || t.type
  let h = 0
  for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0
  const label = word.charAt(0).toUpperCase() + word.slice(1)
  return { label, color: FALLBACK_COLORS[h % FALLBACK_COLORS.length], icon: ArrowLeftRight }
}

function buildCats(txs: TransactionDTO[], mode: 'out' | 'in'): AggCat[] {
  const map = new Map<string, AggCat>()
  for (const t of txs) {
    if (mode === 'out' ? t.amount >= 0 : t.amount <= 0) continue
    const { label, color } = catMeta(t)
    const key = label.toLowerCase()
    const cur = map.get(key) ?? { key, label, color, total: 0, count: 0 }
    cur.total += Math.abs(t.amount)
    cur.count += 1
    map.set(key, cur)
  }
  const arr = [...map.values()].sort((a, b) => b.total - a.total)
  if (arr.length > 6) {
    const rest = arr.slice(6)
    const other: AggCat = {
      key: '__other', label: 'Прочее', color: TEXT2,
      total: rest.reduce((s, c) => s + c.total, 0),
      count: rest.reduce((s, c) => s + c.count, 0),
    }
    return [...arr.slice(0, 6), other]
  }
  return arr
}

// ---- Светлые UI-примитивы (Сбер) ----

function Toggle({ checked, onCheckedChange, label }: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#21A03A]' : 'bg-[#D9DCE1]'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

function SectionHeader({ title, onAll }: { title: string; onAll?: () => void }) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-[15px] font-semibold text-[#1A1A1A]">{title}</span>
      {onAll && (
        <button
          type="button"
          onClick={onAll}
          className="flex items-center text-[13px] font-semibold text-[#21A03A] transition active:opacity-70"
        >
          Все
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

// Ряд продукта в белом блоке «Карты»: цветной квадрат-иконка, имя + «•• 4489», сумма справа
function ProductRow({ icon: Icon, color, name, num, amount, amountCls, onClick, aria }: {
  icon: LucideIcon
  color: string
  name: string
  num: string
  amount: string
  amountCls: string
  onClick: () => void
  aria: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="flex w-full items-center gap-3 py-3 text-left transition active:opacity-70"
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <Icon className="size-5 text-white" strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-[#1A1A1A]">{name}</span>
        <span className="block text-[12px] tabular-nums text-[#9AA0A8]">{num}</span>
      </span>
      <span className={`shrink-0 text-[15px] font-bold tabular-nums ${amountCls}`}>{amount}</span>
    </button>
  )
}

// Ряд операции: цветной круг 44px (категория), название 15, дата 12, сумма (+зелёная / чёрная)
function TxRow({ t }: { t: TransactionDTO }) {
  const { icon: Icon, color } = catMeta(t)
  const positive = t.amount >= 0
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1A`, color }}
        aria-hidden="true"
      >
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-[#1A1A1A]">{TX_TYPE_LABEL[t.type] ?? t.type}</div>
        <div className="truncate text-[12px] text-[#9AA0A8]">
          {t.counterpartyName ?? t.note ?? '—'} · {timeAgo(t.createdAt)}
        </div>
      </div>
      <div className={`shrink-0 text-[15px] font-bold tabular-nums ${positive ? 'text-[#21A03A]' : 'text-[#1A1A1A]'}`}>
        {positive ? '+' : ''}
        {fmtMoney(t.amount)}
      </div>
    </div>
  )
}

// Плитка в нижних листах (QR / Ещё)
function SheetTile({ icon: Icon, label, color, onClick }: {
  icon: LucideIcon
  label: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2.5 rounded-2xl bg-[#F5F6FA] p-3.5 text-left transition active:scale-[0.98]"
    >
      <span
        className="flex size-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1A`, color }}
        aria-hidden="true"
      >
        <Icon className="size-5" strokeWidth={2.1} />
      </span>
      <span className="text-[13px] font-semibold leading-tight text-[#1A1A1A]">{label}</span>
    </button>
  )
}

// Нижний лист (bottom sheet) — светлый
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        className="relative max-h-[82%] overflow-y-auto rounded-t-[24px] bg-white px-5 pb-7 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.18)] [scrollbar-width:thin]"
        style={{ animation: 'sheet-up 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#E1E4E9]" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-bold tracking-tight text-[#1A1A1A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-8 items-center justify-center rounded-full bg-[#F5F6FA] text-[#9AA0A8] transition active:scale-95"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Пикер оформления карты: bottom-sheet на framer-motion (slide-up, свайп вниз за ручку),
// светлая тема: чипы-фильтры по цвету + сетка 3 колонки всех 30 фонов (2:1, rounded-[14px]).
// Тап по превью применяет фон мгновенно (persist делает родитель через applyCardBg).
function CardStyleSheet({ cardLabel, current, onPick, onClose }: {
  cardLabel: string
  current: CardBg
  onPick: (bg: CardBg) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState<'all' | CardColor>('all')
  const controls = useDragControls()

  const filters: { key: 'all' | CardColor; label: string }[] = [
    { key: 'all', label: 'Все' },
    ...CARD_COLORS.map((c) => ({ key: c, label: CARD_COLOR_LABEL[c] })),
  ]
  const list = filter === 'all' ? ALL_CARD_BGS : ALL_CARD_BGS.filter((i) => i.color === filter)

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Оформление карты «${cardLabel}»`}
    >
      <motion.button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.55 }}
        onDragEnd={(_e, info) => {
          if (info.offset.y > 72 || info.velocity.y > 550) onClose()
        }}
        className="relative max-h-[88%] rounded-t-[28px] bg-white pb-[max(18px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.18)]"
      >
        {/* ручка: свайп вниз закрывает пикер */}
        <div
          onPointerDown={(e) => controls.start(e)}
          className="mx-auto flex h-9 w-full cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          aria-hidden="true"
        >
          <span className="h-1 w-10 rounded-full bg-[#E1E4E9]" />
        </div>

        <div className="flex items-center justify-between gap-3 px-5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold tracking-tight text-[#1A1A1A]">Оформление карты</h2>
            <p className="mt-0.5 truncate text-[11px] text-[#9AA0A8]">
              {cardLabel} · Выбор сохраняется автоматически
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F5F6FA] text-[#9AA0A8] transition active:scale-95 after:absolute after:-inset-1 after:content-['']"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* чипы-фильтры по цвету */}
        <div
          role="group"
          aria-label="Фильтр по цвету"
          className="flex gap-2 overflow-x-auto px-5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filters.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={`relative flex h-10 shrink-0 items-center rounded-full px-4 text-[13px] transition after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] ${
                  active
                    ? 'bg-[#21A03A] font-semibold text-white'
                    : 'bg-[#F5F6FA] font-medium text-[#1A1A1A]'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* сетка всех фонов: 3 колонки, тап = применить */}
        <div
          role="radiogroup"
          aria-label="Фон карты"
          className="grid max-h-[46vh] grid-cols-3 gap-2.5 overflow-y-auto px-5 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ touchAction: 'pan-y' }}
        >
          {list.map(({ bg, color, style }) => {
            const active = bg === current
            return (
              <button
                key={bg}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${CARD_COLOR_LABEL[color]}, вариант ${style}`}
                onClick={() => onPick(bg)}
                className={`relative aspect-[2/1] overflow-hidden rounded-[14px] transition active:scale-[0.97] ${
                  active ? 'ring-2 ring-[#21A03A] ring-offset-2' : 'ring-1 ring-black/[0.06]'
                }`}
              >
                <img
                  src={cardBg(bg)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {active && (
                  <span
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-[#21A03A] text-white shadow"
                    aria-hidden="true"
                  >
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <p className="px-5 pt-2 text-center text-[10px] text-[#9AA0A8]">
          Оформление применяется сразу и остаётся на устройстве
        </p>
      </motion.div>
    </div>
  )
}

export default function BankApp() {
  const session = useOS((s) => s.session)
  const openApp = useOS((s) => s.openApp)
  const pushToast = useOS((s) => s.pushToast)
  const [data, setData] = useState<BankData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('main')
  const [sheet, setSheet] = useState<SheetKey>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [loanAmount, setLoanAmount] = useState(5000)
  const [repayAmount, setRepayAmount] = useState(0)
  const [depositInput, setDepositInput] = useState('1000')
  const [searchQ, setSearchQ] = useState('')
  const [searchFocus, setSearchFocus] = useState(false)
  const [pinOn, setPinOn] = useState(true)
  const [opsNotifOn, setOpsNotifOn] = useState(true)
  const [analyticsMode, setAnalyticsMode] = useState<'out' | 'in'>('out')
  const [chartMode, setChartMode] = useState<ChartMode>('inc')
  const [cardSlide, setCardSlide] = useState(0)
  // какая карта открыта на экране «Карта»
  const [cardKey, setCardKey] = useState<CardKey>('debit')
  // фоны карт игрока (реестр /img/cards) + открытый пикер оформления
  const [cardBgs, setCardBgs] = useState<Record<CardKey, CardBg>>(DEFAULT_CARD_BGS)
  const [styleFor, setStyleFor] = useState<CardKey | null>(null)
  // плавный «счётчик денег» на карте и в блоке «Карты»
  const animatedBalance = useCountUp(data?.balance ?? 0)

  const load = useCallback(async () => {
    try {
      setError(null)
      const d = await api.bank()
      setData(d)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить данные банка')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Оформления карт читаем после монтирования: localStorage доступен только на клиенте
  useEffect(() => {
    setCardBgs({
      debit: getCardBg('debit', DEFAULT_CARD_BGS.debit),
      credit: getCardBg('credit', DEFAULT_CARD_BGS.credit),
      savings: getCardBg('savings', DEFAULT_CARD_BGS.savings),
    })
  }, [])

  // Тап по превью в пикере: применяем сразу, persist в localStorage, лёгкий haptic
  const applyCardBg = useCallback((key: CardKey, bg: CardBg) => {
    setCardBgs((prev) => ({ ...prev, [key]: bg }))
    setCardBg(key, bg)
    sound.pop()
  }, [])

  // Открыть экран конкретной карты (вместо бестолкового тоста)
  const openCard = useCallback((k: CardKey) => {
    setCardKey(k)
    setScreen('card')
  }, [])

  // При смене экрана — скролл в начало (иначе заголовок уезжает под статус-бар)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [screen])

  // Подстраиваем суммы под актуальные данные банка
  useEffect(() => {
    if (!data) return
    if (data.activeLoan) {
      setRepayAmount(Math.max(0, Math.round(data.activeLoan.owed)))
    } else {
      const max = Math.max(1000, data.loanLimit)
      setLoanAmount((a) => Math.min(Math.max(a, 1000), max))
    }
  }, [data])

  const applyMutation = async (fn: () => Promise<{ ok: boolean; balance: number; debt?: number; deposit?: number }>) => {
    setBusy(true)
    setFormError(null)
    try {
      const res = await fn()
      const patch: Partial<SessionUser> = { balance: res.balance }
      if (typeof res.debt === 'number') patch.debt = res.debt
      if (typeof res.deposit === 'number') patch.deposit = res.deposit
      const os = useOS.getState()
      os.refreshSession(patch)
      os.pushToast('Банк', 'Операция выполнена')
      await load()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Не удалось выполнить операцию')
    } finally {
      setBusy(false)
    }
  }

  const holderName = session?.displayName ?? 'Игрок'
  const firstName = holderName.split(' ')[0] ?? 'Игрок'
  const now = new Date()
  const monthNom = MONTH_NOM[now.getMonth()]
  const monthPrep = MONTH_PREP[now.getMonth()]
  const rate = String(DEPOSIT_RATE_PER_HOUR * 100).replace('.', ',')

  // Поиск по приложению: быстрые переходы
  const searchItems: { label: string; run: () => void }[] = [
    { label: 'Финансы и карта', run: () => setScreen('main') },
    { label: 'Вклад «Копилка»', run: () => setSheet('deposit') },
    { label: 'Кредиты', run: () => setSheet('loan') },
    { label: 'Безопасность', run: () => setScreen('main') },
    { label: 'Платежи и услуги', run: () => setScreen('payments') },
    { label: 'Анализ финансов', run: () => setScreen('analytics') },
    { label: 'История операций', run: () => setScreen('history') },
    { label: 'Оплата налогов', run: () => openApp('taxes') },
  ]
  const q = searchQ.trim().toLowerCase()
  const searchFound = q ? searchItems.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 5) : []

  // Аналитика: считаем из последних операций на клиенте
  const outCats = useMemo(() => buildCats(data?.transactions ?? [], 'out'), [data])
  const inCats = useMemo(() => buildCats(data?.transactions ?? [], 'in'), [data])
  const cats = analyticsMode === 'out' ? outCats : inCats
  const catsTotal = cats.reduce((s, c) => s + c.total, 0)
  const catsOps = cats.reduce((s, c) => s + c.count, 0)

  // Геометрия доната
  const R = 56
  const CIRC = 2 * Math.PI * R
  const donutSegs = useMemo(() => {
    if (catsTotal <= 0) return []
    let acc = 0
    return cats.map((c) => {
      const frac = c.total / catsTotal
      const seg = { key: c.key, color: c.color, frac, offset: acc }
      acc += frac
      return seg
    })
  }, [cats, catsTotal])

  // График: поступления/списания за последние 6 месяцев
  const months = useMemo(() => {
    const arr: { key: string; label: string; inc: number; exp: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      arr.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_SHORT[d.getMonth()], inc: 0, exp: 0 })
    }
    const idx = new Map(arr.map((m, i) => [m.key, i]))
    for (const t of data?.transactions ?? []) {
      const d = new Date(t.createdAt)
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (i == null) continue
      if (t.amount >= 0) arr[i].inc += t.amount
      else arr[i].exp += -t.amount
    }
    return arr
  }, [data])

  const chartVals = months.map((m) => (chartMode === 'inc' ? m.inc : m.exp))
  const chartMax = Math.max(...chartVals, 1)
  const modeSum = chartVals.reduce((s, v) => s + v, 0)

  const cardLast4 = (data?.cardNumber ?? '0000 0000 0000 0000').split(' ').pop() ?? '0000'
  const creditLast4 = cardNumberFor(`${session?.id ?? 'player'}-credit`).split(' ').pop() ?? '0000'
  const depositLast4 = cardNumberFor(`${session?.id ?? 'player'}-deposit`).split(' ').pop() ?? '0000'
  const maskedCard = `•• ${cardLast4}`
  const score = data?.creditScore ?? 500
  const credit = creditLabel(score)

  // Карусель карт под Сбер: фон каждой карты — из реестра /img/cards, белые данные, чип продукта
  const cards: { key: CardKey; chip: string; num: string; label: string; amount: string; sub: string; bg: CardBg; aria: string; run: () => void }[] = data
    ? [
        {
          key: 'debit',
          chip: 'Дебетовая',
          num: maskedCard,
          label: 'Доступно',
          amount: fmtMoney(animatedBalance),
          sub: holderName,
          bg: cardBgs.debit,
          aria: `Дебетовая карта ${maskedCard}, доступно ${fmtMoney(data.balance)}`,
          run: () => openCard('debit'),
        },
        {
          key: 'credit',
          chip: 'Кредитная',
          num: `•• ${creditLast4}`,
          label: data.debt > 0 ? 'Задолженность' : 'Задолженности нет',
          amount: fmtMoney(data.debt),
          sub: data.activeLoan
            ? `Погашение до ${new Date(data.activeLoan.dueAt).toLocaleDateString('ru-RU')}`
            : `Лимит ${fmtMoney(data.loanLimit)}`,
          bg: cardBgs.credit,
          aria: 'Кредитная карта, открыть кредитный лист',
          run: () => setSheet('loan'),
        },
        {
          key: 'savings',
          chip: 'Счёт',
          num: `•• ${depositLast4}`,
          label: 'Накопительный счёт',
          amount: fmtMoney(data.deposit),
          sub: `«Копилка» · ${rate}% в час`,
          bg: cardBgs.savings,
          aria: 'Накопительный счёт, открыть вклад «Копилка»',
          run: () => setSheet('deposit'),
        },
      ]
    : []

  const onCardsScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const max = el.scrollWidth - el.clientWidth
    setCardSlide(max <= 0 ? 0 : Math.round((el.scrollLeft / max) * Math.max(1, cards.length - 1)))
  }

  // Экран «Карта»: герой-карточка выбранного продукта
  const cardHero = data
    ? cardKey === 'debit'
      ? { num: maskedCard, label: 'Доступно', amount: fmtMoney(data.balance), sub: holderName.toUpperCase() }
      : cardKey === 'credit'
        ? {
            num: `•• ${creditLast4}`,
            label: data.debt > 0 ? 'Задолженность' : 'Лимит',
            amount: fmtMoney(data.debt > 0 ? data.debt : data.loanLimit),
            sub: data.activeLoan
              ? `Погашение до ${new Date(data.activeLoan.dueAt).toLocaleDateString('ru-RU')}`
              : `Ставка ${data.creditRate ?? 15}%`,
          }
        : { num: `•• ${depositLast4}`, label: 'На счёте', amount: fmtMoney(data.deposit), sub: `«Копилка» · ${rate}% в час` }
    : null

  // Действия на экране карты — свои для каждого продукта
  const cardActions: { label: string; icon: LucideIcon; run: () => void }[] =
    cardKey === 'debit'
      ? [
          { label: 'Перевести', icon: Send, run: () => setScreen('payments') },
          { label: 'Оплатить', icon: QrCode, run: () => setSheet('qr') },
          { label: 'Оформление', icon: Palette, run: () => setStyleFor('debit') },
          { label: 'История', icon: Clock, run: () => setScreen('history') },
        ]
      : cardKey === 'credit'
        ? [
            { label: data?.activeLoan ? 'Погасить' : 'Взять', icon: Landmark, run: () => setSheet('loan') },
            { label: 'Оформление', icon: Palette, run: () => setStyleFor('credit') },
            { label: 'История', icon: Clock, run: () => setScreen('history') },
            { label: 'Анализ', icon: PieChart, run: () => setScreen('analytics') },
          ]
        : [
            { label: 'Пополнить', icon: Plus, run: () => setSheet('deposit') },
            { label: 'Снять', icon: Banknote, run: () => setSheet('deposit') },
            { label: 'Оформление', icon: Palette, run: () => setStyleFor('savings') },
            { label: 'Анализ', icon: PieChart, run: () => setScreen('analytics') },
          ]

  // Инфо-блок на экране карты
  const cardInfoRows: { k: string; v: string }[] = data
    ? cardKey === 'debit'
      ? [
          { k: 'Номер карты', v: data.cardNumber ?? '—' },
          { k: 'Держатель', v: holderName.toUpperCase() },
          { k: 'Платёжная система', v: 'МИР' },
          { k: 'Банк', v: 'Столичный Банк' },
        ]
      : cardKey === 'credit'
        ? [
            { k: 'Номер карты', v: `•• ${creditLast4}` },
            { k: 'Лимит', v: fmtMoney(data.loanLimit) },
            { k: 'Ставка', v: `${data.creditRate ?? 15}%` },
            { k: 'Рейтинг', v: `${score} · ${credit.label}` },
          ]
        : [
            { k: 'Номер счёта', v: `•• ${depositLast4}` },
            { k: 'Ставка', v: `${rate}% в час` },
            { k: 'Начисление', v: 'Ежечасно' },
            { k: 'Банк', v: 'Столичный Банк' },
          ]
    : []

  // Сторис-ряд (как в Сбере): цветные кольца + быстрые сценарии
  const stories: { key: string; label: string; icon: LucideIcon; ring: string; run: () => void }[] = [
    { key: 'savings', label: 'Копилка', icon: PiggyBank, ring: 'conic-gradient(from 140deg,#21A03A,#9BE0A9,#C8EDD2,#21A03A)', run: () => setSheet('deposit') },
    { key: 'credit', label: 'Кредит', icon: Landmark, ring: 'conic-gradient(from 140deg,#F8A13A,#FBD39E,#FDE7C4,#F8A13A)', run: () => setSheet('loan') },
    { key: 'tax', label: 'Налоги', icon: Receipt, ring: 'conic-gradient(from 140deg,#E5584B,#F5B7B1,#FAD3CF,#E5584B)', run: () => openApp('taxes') },
    { key: 'qr', label: 'Оплатить', icon: QrCode, ring: 'conic-gradient(from 140deg,#12A594,#9FDCD4,#D2F0EB,#12A594)', run: () => setSheet('qr') },
    { key: 'analytics', label: 'Анализ', icon: PieChart, ring: 'conic-gradient(from 140deg,#7B61FF,#C9BCFF,#E4DDFF,#7B61FF)', run: () => setScreen('analytics') },
  ]

  // История, сгруппированная по дням (Сегодня / Вчера / даты) — как в Сбере
  const historyGroups = useMemo(() => {
    const arr: { label: string; items: TransactionDTO[] }[] = []
    for (const t of data?.transactions ?? []) {
      const d = new Date(t.createdAt)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const diff = Math.round((today - start) / 86_400_000)
      const label = diff === 0 ? 'Сегодня' : diff === 1 ? 'Вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
      const last = arr[arr.length - 1]
      if (last && last.label === label) last.items.push(t)
      else arr.push({ label, items: [t] })
    }
    return arr
  }, [data, now])

  // Быстрые действия: белые круги 48px с зелёными иконками — линкуются на реальные секции/листы
  const quickActions: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: 'Перевести', icon: ArrowLeftRight, run: () => setScreen('payments') },
    { label: 'Оплатить', icon: QrCode, run: () => setSheet('qr') },
    { label: 'Пополнить', icon: Plus, run: () => setSheet('deposit') },
    { label: 'Ещё', icon: LayoutGrid, run: () => setSheet('more') },
  ]

  // Нижний таб-бар: Главный / Платежи / История / Ещё
  const tabs: { key: Screen | 'more'; icon: LucideIcon; label: string }[] = [
    { key: 'main', icon: Home, label: 'Главный' },
    { key: 'payments', icon: ArrowLeftRight, label: 'Платежи' },
    { key: 'history', icon: Clock, label: 'История' },
    { key: 'more', icon: LayoutGrid, label: 'Ещё' },
  ]
  const tabActive = (key: Screen | 'more') =>
    key === 'more'
      ? screen === 'analytics' || sheet === 'more'
      : key === 'main'
        ? screen === 'main' || screen === 'card'
        : screen === key

  const services: { icon: LucideIcon; label: string; sub: string; color: string; run?: () => void }[] = [
    { icon: Smartphone, label: 'Мобильная связь', sub: 'Сим-карты и связь', color: GREEN },
    { icon: Wifi, label: 'Интернет', sub: 'Провайдеры', color: '#12A594' },
    { icon: Building2, label: 'ЖКХ', sub: 'Квартплата', color: '#F8A13A' },
    { icon: Receipt, label: 'Налоги', sub: 'Налоговая', color: '#E5584B', run: () => openApp('taxes') },
    { icon: Car, label: 'Штрафы', sub: 'Транспорт', color: TEXT2 },
    { icon: Send, label: 'Переводы', sub: 'Людям по имени', color: '#7B61FF' },
  ]

  // Лист «Ещё»: реальные секции приложения + переходы в другие приложения
  const moreActions: { icon: LucideIcon; label: string; color: string; run: () => void }[] = [
    { icon: PieChart, label: 'Анализ финансов', color: '#7B61FF', run: () => { setSheet(null); setScreen('analytics') } },
    { icon: PiggyBank, label: 'Вклад «Копилка»', color: GREEN, run: () => setSheet('deposit') },
    { icon: Landmark, label: data?.activeLoan ? 'Погасить кредит' : 'Кредит', color: '#F8A13A', run: () => setSheet('loan') },
    { icon: QrCode, label: 'Оплата по QR', color: '#12A594', run: () => setSheet('qr') },
    { icon: Receipt, label: 'Оплатить налоги', color: '#E5584B', run: () => { setSheet(null); openApp('taxes') } },
    { icon: ShoppingBag, label: 'Сделки', color: GREEN, run: () => { setSheet(null); openApp('avito') } },
    { icon: Gavel, label: 'Аукцион', color: '#F8A13A', run: () => { setSheet(null); openApp('auction') } },
    { icon: Truck, label: 'Доставка', color: '#7B61FF', run: () => { setSheet(null); openApp('delivery') } },
  ]

  return (
    <div className="relative flex h-full flex-col bg-[#F5F6FA] text-[#1A1A1A]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="space-y-3 p-4">
            <div className="h-10 animate-pulse rounded-full bg-[#ECEFEE]" />
            <div className="h-36 animate-pulse rounded-[20px] bg-[#ECEFEE]" />
            <div className="h-28 animate-pulse rounded-[20px] bg-[#ECEFEE]" />
            <div className="h-16 animate-pulse rounded-[20px] bg-[#ECEFEE]" />
            <div className="flex items-center justify-center gap-2 text-[13px] text-[#9AA0A8]">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Загрузка банка…
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4 pt-8">
            <div className={`${CARD} p-6 text-center`}>
              <p className="text-[13px] text-[#E5584B]">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 text-[13px] font-semibold text-[#21A03A] transition active:opacity-70"
              >
                Повторить
              </button>
            </div>
          </div>
        ) : data ? (
          <div key={screen} className="screen-enter pb-2">
            {/* ===== ГЛАВНЫЙ ===== */}
            {screen === 'main' && (
              <div className="pb-2">
                {/* Хедер: мягкий зелёный градиент Сбера (в тёмной теме — тёмный градиент) */}
                <div className="bank-header px-4 pb-5 pt-4" style={{ background: 'linear-gradient(180deg,#D3ECD3 0%,#F5F6FA 90%)' }}>
                  {/* аватар / поиск / микрофон */}
                  <div className="flex items-center gap-2.5">
                    {session?.photoUrl ? (
                      <img src={session.photoUrl} alt={holderName} className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white" />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#21A03A] text-[12px] font-bold text-white ring-2 ring-white">
                        {firstName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9AA0A8]" aria-hidden="true" />
                      <input
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        onFocus={() => setSearchFocus(true)}
                        onBlur={() => setSearchFocus(false)}
                        placeholder="Поиск"
                        aria-label="Поиск по приложению"
                        className="h-10 w-full rounded-full border border-transparent bg-white pl-10 pr-12 text-sm text-[#1A1A1A] shadow-[0_1px_3px_rgba(0,0,0,0.06)] outline-none transition placeholder:text-[#9AA0A8] focus:border-[#21A03A]/40"
                      />
                      <span className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#E7F5EA]" aria-hidden="true">
                        <Mic className="size-3.5 text-[#21A03A]" />
                      </span>
                      {searchFocus && searchFound.length > 0 && (
                        <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-2xl border border-[#E8EAED] bg-white shadow-xl">
                          {searchFound.map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              // mousedown, чтобы blur не съел клик
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                item.run()
                                setSearchQ('')
                              }}
                              className="block w-full px-4 py-2.5 text-left text-sm text-[#1A1A1A] transition hover:bg-[#F5F6FA]"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSheet('qr')}
                      aria-label="Сканировать QR-код"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#21A03A] text-white shadow-[0_2px_8px_rgba(33,160,58,0.35)] transition active:scale-95"
                    >
                      <QrCode className="size-5" aria-hidden="true" />
                    </button>
                  </div>

                  {/* приветствие */}
                  <div className="mt-4 px-1" suppressHydrationWarning>
                    <h1 className="text-[20px] font-bold leading-tight tracking-tight text-[#1A1A1A]">
                      {greeting()}, {firstName}
                    </h1>
                  </div>

                  {/* сторис-ряд (как в Сбере): цветные кольца + быстрые сценарии */}
                  <div
                    role="group"
                    aria-label="Быстрые сценарии"
                    className="mt-4 flex gap-1 overflow-x-auto px-0 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {stories.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={s.run}
                        className="flex w-[70px] shrink-0 flex-col items-center gap-1.5 rounded-2xl py-0.5 transition active:scale-95"
                      >
                        <span aria-hidden="true" className="flex size-[56px] items-center justify-center rounded-full p-[2.5px]" style={{ background: s.ring }}>
                          <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-[#F5F6FA] bg-white">
                            <s.icon className="size-6 text-[#21A03A]" strokeWidth={2.1} />
                          </span>
                        </span>
                        <span className="max-w-full truncate text-[11px] leading-none text-[#1A1A1A]">{s.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* карусель карт: фон из реестра /img/cards + затемняющий градиент, белые данные, чип продукта */}
                  <div
                    role="region"
                    aria-label="Мои карты"
                    className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    style={{ touchAction: 'pan-x' }}
                    onScroll={onCardsScroll}
                  >
                    {cards.map((c) => (
                      <div key={c.key} className="relative h-[140px] w-[82%] shrink-0 snap-center">
                        <button
                          type="button"
                          onClick={c.run}
                          aria-label={c.aria}
                          className="absolute inset-0 overflow-hidden rounded-[20px] p-4 text-left transition active:scale-[0.99]"
                        >
                          {/* фон карты из реестра + затемняющий градиент для читаемости белого текста */}
                          <img
                            src={cardBg(c.bg)}
                            alt=""
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <span
                            className="absolute inset-0"
                            style={{ background: 'linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.38))' }}
                            aria-hidden="true"
                          />
                          <span className="absolute -right-6 -top-12 size-36 rounded-full bg-white/10" aria-hidden="true" />
                          <span className="absolute -bottom-16 -left-8 size-40 rounded-full bg-white/[0.07]" aria-hidden="true" />
                          <span className="relative flex items-center justify-between">
                            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{c.chip}</span>
                            <span className="text-[12px] font-medium tabular-nums tracking-[0.14em] text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{c.num}</span>
                          </span>
                          <span className="relative mt-4 block">
                            <span className="block text-[11px] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{c.label}</span>
                            <span className="value-pop block text-[24px] font-bold leading-tight tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{c.amount}</span>
                          </span>
                          <span className="absolute bottom-3 left-4 right-[124px] block truncate text-[11px] uppercase tracking-wide text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                            {c.sub}
                          </span>
                        </button>
                        {/* кнопка «Оформление» — открывает пикер фона этой карты */}
                        <button
                          type="button"
                          onClick={() => setStyleFor(c.key)}
                          aria-label={`Оформление карты «${c.chip}»`}
                          className="absolute bottom-2.5 right-2.5 z-10 flex h-9 items-center gap-1.5 rounded-full bg-black/35 px-3 text-[11px] font-semibold text-white backdrop-blur-[2px] transition active:scale-95 after:absolute after:-inset-1.5 after:content-['']"
                        >
                          <Palette className="size-3.5" aria-hidden="true" />
                          Оформление
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden="true">
                    {cards.map((c, i) => (
                      <span key={c.key} className={`h-1.5 rounded-full transition-all ${i === cardSlide ? 'w-5 bg-[#21A03A]' : 'w-1.5 bg-[#D9DCE1]'}`} />
                    ))}
                  </div>
                </div>

                <div className="space-y-5 px-4 pt-5">
                  {/* БЛОК «КАРТЫ»: белый, radius 20, ряды продуктов */}
                  <div className={`${CARD} px-4 py-1.5`}>
                    <div className="pt-3 text-[15px] font-semibold text-[#1A1A1A]">Карты</div>
                    <div className="divide-y divide-[#F0F1F5]">
                      <ProductRow
                        icon={CreditCard}
                        color="#21A03A"
                        name="Дебетовая карта"
                        num={maskedCard}
                        amount={fmtMoney(data.balance)}
                        amountCls="text-[#21A03A]"
                        onClick={() => openCard('debit')}
                        aria={`Дебетовая карта ${maskedCard}, доступно ${fmtMoney(data.balance)}`}
                      />
                      <ProductRow
                        icon={Landmark}
                        color="#F8A13A"
                        name="Кредитная карта"
                        num={`•• ${creditLast4}`}
                        amount={fmtMoney(data.debt)}
                        amountCls="text-[#1A1A1A]"
                        onClick={() => setSheet('loan')}
                        aria={`Кредитная карта, задолженность ${fmtMoney(data.debt)}`}
                      />
                      <ProductRow
                        icon={PiggyBank}
                        color="#7B61FF"
                        name="Накопительный счёт"
                        num={`•• ${depositLast4}`}
                        amount={fmtMoney(data.deposit)}
                        amountCls="text-[#21A03A]"
                        onClick={() => setSheet('deposit')}
                        aria={`Накопительный счёт, ${fmtMoney(data.deposit)}`}
                      />
                    </div>
                  </div>

                  {/* 4 быстрых действия: белые круги 48px + подписи 12px */}
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label="Быстрые действия">
                    {quickActions.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={a.run}
                        className="flex flex-col items-center gap-1.5 transition active:scale-95"
                      >
                        <span className="flex size-12 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                          <a.icon className="size-[22px] text-[#21A03A]" strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <span className="text-[12px] leading-tight text-[#9AA0A8]">{a.label}</span>
                      </button>
                    ))}
                  </div>

                  {formError && (
                    <p className="px-1 text-[13px] text-[#E5584B]">{formError}</p>
                  )}

                  {/* ИСТОРИЯ ОПЕРАЦИЙ: белый блок с цветными кругами-категориями */}
                  <div className="space-y-2">
                    <SectionHeader title="История" onAll={() => setScreen('history')} />
                    <div className={`${CARD} px-4 py-1`}>
                      {data.transactions.length === 0 ? (
                        <p className="py-4 text-[12px] text-[#9AA0A8]">Операций пока нет — купите или продайте что-нибудь.</p>
                      ) : (
                        <div className="divide-y divide-[#F0F1F5]">
                          {data.transactions.slice(0, 4).map((t) => (
                            <TxRow key={t.id} t={t} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ПРОМО-БАННЕР (зелёный — фирменный Сбер) */}
                  <button
                    type="button"
                    onClick={() => openApp('taxes')}
                    aria-label="Перейти в приложение Налоги"
                    className="flex w-full items-center gap-3 rounded-[20px] bg-[#E7F5EA] p-4 text-left transition active:scale-[0.99]"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white" aria-hidden="true">
                      <Receipt className="size-5 text-[#1B8A30]" strokeWidth={2.1} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-[#17632B]">Налоговый календарь</span>
                      <span className="block text-[12px] leading-snug text-[#3E7A4C]">
                        Проверьте начисления и оплатите вовремя — без пени и блокировки продаж
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-[#1B8A30]" aria-hidden="true" />
                  </button>

                  {/* БЕЗОПАСНОСТЬ */}
                  <div className={`${CARD} px-4 py-3.5`}>
                    <div className="text-[15px] font-semibold text-[#1A1A1A]">Безопасность</div>
                    <div className="mt-1 flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="size-4.5 text-[#21A03A]" aria-hidden="true" />
                        <div>
                          <div className="text-sm font-medium text-[#1A1A1A]">Вход по пину</div>
                          <div className="text-[11px] text-[#9AA0A8]">Код при входе в банк</div>
                        </div>
                      </div>
                      <Toggle checked={pinOn} onCheckedChange={setPinOn} label="Вход по пину" />
                    </div>
                    <div className="flex items-center justify-between border-t border-[#F0F1F5] py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Bell className="size-4.5 text-[#21A03A]" aria-hidden="true" />
                        <div>
                          <div className="text-sm font-medium text-[#1A1A1A]">Уведомления об операциях</div>
                          <div className="text-[11px] text-[#9AA0A8]">Пуш после каждой операции</div>
                        </div>
                      </div>
                      <Toggle checked={opsNotifOn} onCheckedChange={setOpsNotifOn} label="Уведомления об операциях" />
                    </div>
                    <div className="flex items-center justify-between border-t border-[#F0F1F5] pt-2.5">
                      <div className="flex items-center gap-2.5">
                        <Percent className="size-4.5 text-[#21A03A]" aria-hidden="true" />
                        <div>
                          <div className="text-sm font-medium text-[#1A1A1A]">Рейтинг: {score}</div>
                          <div className="text-[11px] text-[#9AA0A8]">Влияет на лимит и ставку</div>
                        </div>
                      </div>
                      <span className={`text-xs font-semibold ${credit.cls}`}>{credit.label}</span>
                    </div>
                  </div>

                  <div className="pb-1 pt-1 text-center text-[10px] text-[#9AA0A8]">
                    Столичный Банк · вклады не застрахованы, это игра
                  </div>
                </div>
              </div>
            )}

            {/* ===== ЭКРАН КАРТЫ (детали продукта) ===== */}
            {screen === 'card' && data && cardHero && (
              <div className="pb-3">
                <div className="flex items-center gap-3 px-4 pb-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setScreen('main')}
                    aria-label="Назад на главный экран"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition active:scale-95"
                  >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                  </button>
                  <h1 className="text-[18px] font-bold tracking-tight text-[#1A1A1A]">{CARD_STYLE_LABEL[cardKey]}</h1>
                </div>

                <div className="px-4">
                  {/* герой-карта с фоном игрока */}
                  <div className="relative h-[168px] overflow-hidden rounded-[22px] text-white">
                    <img
                      src={cardBg(cardBgs[cardKey])}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <span className="absolute inset-0" style={{ background: 'linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.42))' }} aria-hidden="true" />
                    <span className="absolute -right-6 -top-12 size-36 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="relative flex h-full flex-col justify-between p-4">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                          {CARD_STYLE_LABEL[cardKey]}
                        </span>
                        <span className="text-[12px] font-medium tabular-nums tracking-[0.14em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                          {cardHero.num}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{cardHero.label}</span>
                        <span className="block text-[26px] font-bold leading-tight tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{cardHero.amount}</span>
                        <span className="mt-0.5 block truncate text-[11px] uppercase tracking-wide text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{cardHero.sub}</span>
                      </div>
                    </div>
                  </div>

                  {/* действия по карте */}
                  <div className="mt-4 grid grid-cols-4 gap-2" role="group" aria-label="Действия по карте">
                    {cardActions.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={a.run}
                        className="flex flex-col items-center gap-1.5 transition active:scale-95"
                      >
                        <span className="flex size-12 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                          <a.icon className="size-[22px] text-[#21A03A]" strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <span className="text-[12px] leading-tight text-[#9AA0A8]">{a.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* статус-панель кредита */}
                  {cardKey === 'credit' && (
                    data.debt > 0 ? (
                      <div className="mt-4 rounded-[20px] bg-[#FDEEEE] p-4">
                        <div className="text-xs text-[#9AA0A8]">К погашению</div>
                        <div className="text-2xl font-bold tabular-nums text-[#E5584B]">{fmtMoney(data.debt)}</div>
                        {data.activeLoan && (
                          <p className="mt-1 text-[12px] leading-snug text-[#B26A63]">
                            Срок до {new Date(data.activeLoan.dueAt).toLocaleDateString('ru-RU')} · вовремя: рейтинг +40, просрочка: −80
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setSheet('loan')}
                          className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-[#E5584B] text-sm font-semibold text-white transition active:scale-[0.98]"
                        >
                          Погасить
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[20px] bg-[#E7F5EA] p-4">
                        <div className="text-sm font-semibold text-[#17632B]">Задолженности нет</div>
                        <p className="mt-0.5 text-[12px] leading-snug text-[#3E7A4C]">
                          Доступный лимит: {fmtMoney(data.loanLimit)} · ставка {data.creditRate ?? 15}%
                        </p>
                      </div>
                    )
                  )}

                  {/* статус-панель накопительного счёта */}
                  {cardKey === 'savings' && (
                    <div className="mt-4 rounded-[20px] bg-[#E7F5EA] p-4">
                      <div className="text-sm font-semibold text-[#17632B]">«Копилка» · {rate}% в час</div>
                      <p className="mt-0.5 text-[12px] leading-snug text-[#3E7A4C]">
                        Проценты начисляются ежечасно. Деньги на вкладе не тратятся на покупки и ставки.
                      </p>
                    </div>
                  )}

                  {/* инфо о продукте */}
                  <div className={`${CARD} mt-4 px-4 py-1`}>
                    {cardInfoRows.map((r) => (
                      <div key={r.k} className="flex items-center justify-between gap-3 border-b border-[#F0F1F5] py-2.5 last:border-b-0">
                        <span className="shrink-0 text-[13px] text-[#9AA0A8]">{r.k}</span>
                        <span className="min-w-0 truncate text-right text-[13px] font-semibold text-[#1A1A1A]">{r.v}</span>
                      </div>
                    ))}
                  </div>

                  {/* операции */}
                  <div className="mt-5 space-y-2">
                    <SectionHeader title="Операции" onAll={() => setScreen('history')} />
                    <div className={`${CARD} px-4 py-1`}>
                      {data.transactions.length === 0 ? (
                        <p className="py-4 text-[12px] text-[#9AA0A8]">Операций пока нет.</p>
                      ) : (
                        <div className="divide-y divide-[#F0F1F5]">
                          {data.transactions.slice(0, 8).map((t) => (
                            <TxRow key={t.id} t={t} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== ПЛАТЕЖИ ===== */}
            {screen === 'payments' && (
              <div className="space-y-4 p-4 pt-5">
                <h1 className="text-[22px] font-bold tracking-tight text-[#1A1A1A]">Платежи</h1>
                <p className="-mt-2.5 text-xs text-[#9AA0A8]">Услуги и переводы — выберите категорию</p>
                <div className="grid grid-cols-2 gap-3">
                  {services.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        if (s.run) s.run()
                        else pushToast('Платежи', 'Раздел скоро появится')
                      }}
                      className={`${CARD} p-4 text-left transition active:scale-[0.98]`}
                    >
                      <span
                        className="flex size-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${s.color}1A`, color: s.color }}
                        aria-hidden="true"
                      >
                        <s.icon className="size-5" strokeWidth={2.1} />
                      </span>
                      <div className="mt-3 text-sm font-semibold text-[#1A1A1A]">{s.label}</div>
                      <div className="text-[11px] text-[#9AA0A8]">{s.sub}</div>
                    </button>
                  ))}
                </div>
                <div className={`${CARD} p-4 text-[11px] leading-relaxed text-[#9AA0A8]`}>
                  Переводы людям — из чата сделки: напишите продавцу и оплатите счёт, операция появится в истории банка.
                </div>
              </div>
            )}

            {/* ===== АНАЛИЗ ===== */}
            {screen === 'analytics' && (
              <div className="space-y-4 p-4 pt-5">
                <h1 className="text-[22px] font-bold tracking-tight text-[#1A1A1A]">Анализ финансов</h1>

                <div className="flex gap-2" role="tablist" aria-label="Режим аналитики">
                  {(['out', 'in'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={analyticsMode === m}
                      onClick={() => setAnalyticsMode(m)}
                      className={`h-9 flex-1 rounded-full px-4 text-[13px] transition ${
                        analyticsMode === m
                          ? 'bg-[#21A03A] font-semibold text-white'
                          : 'bg-white font-medium text-[#1A1A1A] shadow-[0_1px_3px_rgba(0,0,0,0.05)]'
                      }`}
                    >
                      {m === 'out' ? 'Расходы' : 'Зачисления'}
                    </button>
                  ))}
                </div>

                <div className="text-center">
                  <div className="text-[30px] font-bold tabular-nums tracking-tight text-[#1A1A1A]">{fmtMoney(catsTotal)}</div>
                  <div className="mt-0.5 text-xs text-[#9AA0A8]" suppressHydrationWarning>
                    {analyticsMode === 'out' ? 'Расход' : 'Зачисление'} в {monthPrep} · по последним операциям
                  </div>
                </div>

                {catsTotal <= 0 ? (
                  <div className={`flex flex-col items-center ${CARD} p-8 text-center`}>
                    <Info className="size-6 text-[#C4C7CD]" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-[#1A1A1A]">Операций пока нет</p>
                    <p className="mt-1 text-xs text-[#9AA0A8]">Совершите покупки или продажи — аналитика появится здесь</p>
                  </div>
                ) : (
                  <>
                    {/* Донат */}
                    <div className={`flex justify-center ${CARD} py-6`}>
                      <div className="relative">
                        <svg viewBox="0 0 140 140" className="size-44" role="img" aria-label="Распределение по категориям">
                          <circle cx="70" cy="70" r={R} fill="none" stroke="#EEF0F3" strokeWidth={16} />
                          {donutSegs.map((s) => (
                            <circle
                              key={s.key}
                              cx="70"
                              cy="70"
                              r={R}
                              fill="none"
                              stroke={s.color}
                              strokeWidth={16}
                              strokeDasharray={`${Math.max(0, s.frac * CIRC - 1.5)} ${CIRC}`}
                              strokeDashoffset={-s.offset * CIRC}
                              transform="rotate(-90 70 70)"
                            />
                          ))}
                        </svg>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-sm font-semibold text-[#1A1A1A]" suppressHydrationWarning>{monthNom}</span>
                          <span className="text-[11px] text-[#9AA0A8]">
                            {catsOps} {plural(catsOps, 'операция', 'операции', 'операций')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Категории */}
                    <div className={`divide-y divide-[#F0F1F5] ${CARD} px-4`}>
                      {cats.map((c) => (
                        <div key={c.key} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-full"
                              style={{ backgroundColor: `${c.color}1A`, color: c.color }}
                              aria-hidden="true"
                            >
                              {c.label.charAt(0)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[#1A1A1A]">{c.label}</div>
                              <div className="text-[11px] text-[#9AA0A8]">
                                {c.count} {plural(c.count, 'операция', 'операции', 'операций')}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-semibold tabular-nums text-[#1A1A1A]">{fmtMoney(c.total)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Динамика за полгода (график с тумблером поступления/списания) */}
                <div className={`${CARD} px-4 pb-4 pt-4`} aria-label="Динамика за полгода">
                  <div className="flex items-center justify-between">
                    <div className="text-[15px] font-semibold text-[#1A1A1A]">Динамика за полгода</div>
                    <div className="flex items-center gap-1.5" role="tablist" aria-label="Режим графика">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={chartMode === 'inc'}
                        onClick={() => setChartMode('inc')}
                        className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                          chartMode === 'inc' ? 'bg-[#21A03A] text-white' : 'bg-[#F0F1F5] text-[#9AA0A8]'
                        }`}
                      >
                        Поступления
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={chartMode === 'exp'}
                        onClick={() => setChartMode('exp')}
                        className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                          chartMode === 'exp' ? 'bg-[#21A03A] text-white' : 'bg-[#F0F1F5] text-[#9AA0A8]'
                        }`}
                      >
                        Списания
                      </button>
                    </div>
                  </div>
                  <div className="relative mt-5 h-[104px]" aria-hidden="true">
                    <div className="absolute inset-x-0 top-[10%] border-t border-dashed border-[#E8EAED]" />
                    <div className="absolute inset-x-0 top-[45%] border-t border-dashed border-[#E8EAED]" />
                    <div className="absolute inset-x-0 top-[80%] border-t border-dashed border-[#E8EAED]" />
                    <div className="relative flex h-full items-end justify-between gap-2 px-0.5">
                      {months.map((m, i) => {
                        const v = chartVals[i]
                        const h = Math.max(4, Math.round((v / chartMax) * 100))
                        const isLast = i === months.length - 1
                        return (
                          <div key={m.key} className="flex h-full w-7 flex-col items-center">
                            <div className="relative flex h-full w-full items-end overflow-hidden rounded-full bg-[#F0F1F5]">
                              <div
                                className="w-full rounded-full transition-[height] duration-500"
                                style={{ height: `${h}%`, backgroundColor: isLast ? GREEN : 'rgba(33,160,58,0.4)' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="mt-1.5 flex justify-between px-0.5" aria-hidden="true" suppressHydrationWarning>
                    {months.map((m, i) => (
                      <span key={m.key} className={`w-7 text-center text-[10px] font-medium ${i === months.length - 1 ? 'text-[#1A1A1A]' : 'text-[#9AA0A8]'}`}>
                        {m.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-[#9AA0A8]">
                    {chartMode === 'inc' ? 'Зачисления' : 'Расход'} за полгода:{' '}
                    <span className="font-semibold tabular-nums text-[#1A1A1A]">{fmtMoney(modeSum)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ===== ИСТОРИЯ ===== */}
            {screen === 'history' && (
              <div className="space-y-4 p-4 pt-5">
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-[22px] font-bold tracking-tight text-[#1A1A1A]">История операций</h1>
                  {data.transactions.length > 0 && (
                    <a
                      href={exportCsvUrl()}
                      download
                      aria-label="Скачать историю операций в CSV"
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[#21A03A]/10 px-3 text-[11px] font-semibold text-[#21A03A] outline-none transition-colors hover:bg-[#21A03A]/20 focus-visible:ring-2 focus-visible:ring-[#21A03A]/40"
                    >
                      <FileDown className="size-3.5" aria-hidden="true" />
                      CSV
                    </a>
                  )}
                </div>
                {data.transactions.length === 0 ? (
                  <div className={`${CARD} p-6 text-center`}>
                    <p className="text-sm text-[#9AA0A8]">Здесь появятся все ваши покупки, продажи и операции с банком.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyGroups.map((g) => (
                      <div key={g.label}>
                        <div className="px-1 pb-1.5 text-[12px] font-semibold text-[#9AA0A8]" suppressHydrationWarning>{g.label}</div>
                        <div className={`divide-y divide-[#F0F1F5] ${CARD} px-4 py-1`}>
                          {g.items.map((t) => (
                            <TxRow key={t.id} t={t} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ===== НИЖНИЙ ТАБ-БАР (Сбер): Главный / Платежи / История / Ещё ===== */}
      <nav className="relative z-10 shrink-0 border-t border-[#E8EAED] bg-white" aria-label="Навигация банка">
        <div className="grid grid-cols-4 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
          {tabs.map((t) => {
            const active = tabActive(t.key)
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => (t.key === 'more' ? setSheet('more') : setScreen(t.key as Screen))}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-1 py-1.5 transition"
              >
                <t.icon className={`size-[22px] ${active ? 'text-[#21A03A]' : 'text-[#9AA0A8]'}`} strokeWidth={active ? 2.3 : 2} aria-hidden="true" />
                <span className={`text-[10px] ${active ? 'font-semibold text-[#21A03A]' : 'text-[#9AA0A8]'}`}>{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* ===== НИЖНИЕ ЛИСТЫ (светлые) ===== */}
      {sheet === 'more' && data && (
        <Sheet title="Ещё" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-3">
            {moreActions.map((a) => (
              <SheetTile key={a.label} icon={a.icon} label={a.label} color={a.color} onClick={a.run} />
            ))}
          </div>
        </Sheet>
      )}

      {sheet === 'qr' && data && (
        <Sheet title="Платежи и переводы" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Receipt, label: 'Оплатить налоги', color: '#E5584B', run: () => { setSheet(null); openApp('taxes') } },
              { icon: PiggyBank, label: 'Пополнить вклад', color: GREEN, run: () => setSheet('deposit') },
              { icon: Landmark, label: data.activeLoan ? 'Погасить кредит' : 'Взять кредит', color: '#7B61FF', run: () => setSheet('loan') },
              { icon: Send, label: 'Перевести', color: '#F8A13A', run: () => { setSheet(null); setScreen('payments') } },
            ].map((a) => (
              <SheetTile key={a.label} icon={a.icon} label={a.label} color={a.color} onClick={a.run} />
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-[#9AA0A8]">
            Наведите камеру на QR-код продавца — или выберите операцию выше. Переводы людям доступны из чата сделки.
          </p>
        </Sheet>
      )}

      {sheet === 'deposit' && data && (
        <Sheet title="Вклад «Копилка»" onClose={() => setSheet(null)}>
          <div className="rounded-2xl bg-[#E7F5EA] p-4">
            <div className="text-xs text-[#9AA0A8]">На вкладе</div>
            <div className="text-2xl font-bold tabular-nums text-[#1A1A1A]">{fmtMoney(data.deposit)}</div>
            <div className="mt-0.5 text-[12px] font-medium text-[#21A03A]">
              {rate}% в час · начисление ежечасно · деньги на вкладе не тратятся на покупки
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs text-[#9AA0A8]">Сумма</div>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#E8EAED] bg-[#F5F6FA] px-4 py-3 text-base font-semibold text-[#1A1A1A] outline-none transition placeholder:text-[#9AA0A8] focus:border-[#21A03A]/60"
              inputMode="numeric"
              value={depositInput}
              placeholder="0"
              aria-label="Сумма пополнения вклада"
              onChange={(e) => setDepositInput(e.target.value)}
            />
          </div>
          {formError && <p className="mt-2 text-[13px] text-[#E5584B]">{formError}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex h-11 items-center justify-center rounded-xl bg-[#21A03A] text-sm font-semibold text-white transition active:scale-[0.98] active:bg-[#1B8A30] disabled:bg-[#F0F1F5] disabled:text-[#9AA0A8]"
              disabled={busy || toAmount(depositInput) <= 0}
              onClick={() => applyMutation(() => api.depositOp(toAmount(depositInput), 'top'))}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Пополнить'}
            </button>
            <button
              type="button"
              className="flex h-11 items-center justify-center rounded-xl bg-[#F5F6FA] text-sm font-semibold text-[#1A1A1A] transition active:scale-[0.98] disabled:text-[#C4C7CD]"
              disabled={busy || toAmount(depositInput) <= 0 || data.deposit <= 0}
              onClick={() => applyMutation(() => api.depositOp(toAmount(depositInput), 'withdraw'))}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Снять'}
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-[#9AA0A8]">
            Снимайте вклад перед крупной закупкой — деньги на вкладе недоступны для ставок и покупок.
          </p>
        </Sheet>
      )}

      {sheet === 'loan' && data && (
        <Sheet title={data.activeLoan ? 'Погашение кредита' : 'Кредит'} onClose={() => setSheet(null)}>
          <div className="mb-3 flex items-center justify-between rounded-xl bg-[#F5F6FA] px-3.5 py-2.5 text-xs">
            <span className="text-[#9AA0A8]">Лимит</span>
            <span className="font-semibold text-[#1A1A1A]">{fmtMoney(data.loanLimit)}</span>
            <span className="text-[#9AA0A8]">Ставка</span>
            <span className="font-semibold text-[#1A1A1A]">{data.creditRate ?? 15}%</span>
          </div>

          {data.activeLoan ? (
            <>
              <div className="rounded-2xl bg-[#FDEEEE] p-4">
                <div className="text-xs text-[#9AA0A8]">Остаток долга</div>
                <div className="text-2xl font-bold tabular-nums text-[#E5584B]">{fmtMoney(data.activeLoan.owed)}</div>
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#9AA0A8]">Выдано</span>
                  <span className="font-medium text-[#1A1A1A]">{fmtMoney(data.activeLoan.principal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9AA0A8]">Ставка</span>
                  <span className="font-medium text-[#1A1A1A]">{data.activeLoan.rate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9AA0A8]">Срок до</span>
                  <span className="font-medium text-[#1A1A1A]">
                    {new Date(data.activeLoan.dueAt).toLocaleString('ru-RU', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-[#9AA0A8]">Сумма погашения</div>
                <input
                  className="mt-1.5 w-full rounded-xl border border-[#E8EAED] bg-[#F5F6FA] px-4 py-3 text-base font-semibold text-[#1A1A1A] outline-none transition placeholder:text-[#9AA0A8] focus:border-[#21A03A]/60"
                  inputMode="numeric"
                  value={repayAmount ? String(repayAmount) : ''}
                  placeholder="0"
                  aria-label="Сумма погашения"
                  onChange={(e) => setRepayAmount(Math.min(toAmount(e.target.value), data.activeLoan?.owed ?? 0))}
                />
                <Slider
                  className="mt-4 [&_[data-slot=slider-range]]:bg-[#21A03A] [&_[data-slot=slider-thumb]]:border-[#21A03A] [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-[#ECEFEE]"
                  value={[Math.min(repayAmount, data.activeLoan.owed)]}
                  min={100}
                  max={Math.max(100, Math.round(data.activeLoan.owed))}
                  step={100}
                  onValueChange={(v) => setRepayAmount(v[0] ?? 0)}
                  aria-label="Сумма погашения"
                />
              </div>
              {formError && <p className="mt-2 text-[13px] text-[#E5584B]">{formError}</p>}
              <button
                type="button"
                className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-[#21A03A] text-[15px] font-semibold text-white transition active:scale-[0.98] active:bg-[#1B8A30] disabled:bg-[#F0F1F5] disabled:text-[#9AA0A8]"
                disabled={busy || repayAmount <= 0}
                onClick={() => applyMutation(() => api.repayLoan(repayAmount))}
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : 'Погасить'}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-[#E7F5EA] p-4">
                <div className="text-xs text-[#9AA0A8]">Сумма кредита</div>
                <div className="text-2xl font-bold tabular-nums text-[#1A1A1A]">{fmtMoney(loanAmount)}</div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-[#9AA0A8]">От 1 000 до {fmtMoney(Math.max(1000, data.loanLimit))}</div>
                <input
                  className="mt-1.5 w-full rounded-xl border border-[#E8EAED] bg-[#F5F6FA] px-4 py-3 text-base font-semibold text-[#1A1A1A] outline-none transition placeholder:text-[#9AA0A8] focus:border-[#21A03A]/60"
                  inputMode="numeric"
                  value={loanAmount ? String(loanAmount) : ''}
                  placeholder="0"
                  aria-label="Сумма кредита"
                  onChange={(e) => setLoanAmount(Math.min(toAmount(e.target.value), Math.max(1000, data.loanLimit)))}
                />
                <Slider
                  className="mt-4 [&_[data-slot=slider-range]]:bg-[#21A03A] [&_[data-slot=slider-thumb]]:border-[#21A03A] [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-[#ECEFEE]"
                  value={[Math.min(Math.max(loanAmount, 1000), Math.max(1000, data.loanLimit))]}
                  min={1000}
                  max={Math.max(1000, data.loanLimit)}
                  step={500}
                  onValueChange={(v) => setLoanAmount(v[0] ?? 1000)}
                  aria-label="Сумма кредита"
                />
              </div>
              {formError && <p className="mt-2 text-[13px] text-[#E5584B]">{formError}</p>}
              <button
                type="button"
                className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-[#21A03A] text-[15px] font-semibold text-white transition active:scale-[0.98] active:bg-[#1B8A30] disabled:bg-[#F0F1F5] disabled:text-[#9AA0A8]"
                disabled={busy || data.loanLimit < 1000 || loanAmount < 1000}
                onClick={() => applyMutation(() => api.takeLoan(loanAmount))}
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : 'Взять кредит'}
              </button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-[#9AA0A8]">
                Срок 7 дней. Погашение вовремя повышает рейтинг (+40), просрочка роняет его (−80).
              </p>
            </>
          )}
        </Sheet>
      )}

      {/* ===== ПИКЕР ОФОРМЛЕНИЯ КАРТЫ (bottom-sheet, framer-motion) ===== */}
      <AnimatePresence>
        {styleFor && (
          <CardStyleSheet
            key={styleFor}
            cardLabel={CARD_STYLE_LABEL[styleFor]}
            current={cardBgs[styleFor]}
            onPick={(bg) => applyCardBg(styleFor, bg)}
            onClose={() => setStyleFor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
