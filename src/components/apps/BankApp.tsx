'use client'

// Приложение «Банк» — редизайн 1:1 по интерфейсу СберБанк Онлайн (светлая тема):
// фон #F5F6FA, мягкий зелёный градиентный хедер (#D3ECD3→#F5F6FA) с аватаром-инициалами,
// белой пилюлей поиска и зелёным кружком-микрофоном; карусель карт в зелёном градиенте
// #21A03A→#4FCB62 с чипом «Дебетовая»; белый блок «Карты» radius 20 с рядами продуктов;
// быстрые действия — 4 белых круга 48px с зелёными иконками; «История» с цветными
// кругами-категориями (поступления +зелёные, списания чёрные); промо-баннер #D8E9FA;
// нижний таб-бар Главный/Платежи/История/Ещё (активный #21A03A, неактивный #9AA0A8).
// Вся бизнес-логика (api.bank/takeLoan/repayLoan/depositOp, поиск, аналитика, CSV,
// нижние листы, touch-action свайпов) сохранена 1:1.
import { useCallback, useEffect, useMemo, useState, type UIEvent } from 'react'
import {
  AlertTriangle, ArrowLeftRight, Banknote, Bell, Building2, Car, ChevronRight, Clock, CreditCard,
  FileDown, Gavel, Home, Info, Landmark, LayoutGrid, Loader2, Mic, Percent, PieChart,
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

type Screen = 'main' | 'payments' | 'analytics' | 'history'
type SheetKey = 'deposit' | 'loan' | 'qr' | 'more' | null
type ChartMode = 'inc' | 'exp'

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

  // Карусель карт под Сбер: зелёный градиент, белые данные, чип продукта
  const cards = data
    ? [
        {
          key: 'debit',
          chip: 'Дебетовая',
          num: maskedCard,
          label: 'Доступно',
          amount: fmtMoney(animatedBalance),
          sub: holderName,
          gradient: 'linear-gradient(135deg,#21A03A 0%,#4FCB62 100%)',
          aria: `Дебетовая карта ${maskedCard}, доступно ${fmtMoney(data.balance)}`,
          run: () => pushToast('Дебетовая карта', `Доступно: ${fmtMoney(data.balance)}`),
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
          gradient: 'linear-gradient(135deg,#177A2C 0%,#2FA34C 100%)',
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
          gradient: 'linear-gradient(135deg,#2FA34C 0%,#6FD584 100%)',
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
    key === 'more' ? screen === 'analytics' || sheet === 'more' : screen === key

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
    <div
      className="relative flex h-full flex-col text-[#1A1A1A]"
      style={{ background: '#F5F6FA' }}
    >
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
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
                {/* Хедер: мягкий зелёный градиент Сбера */}
                <div className="px-4 pb-5 pt-4" style={{ background: 'linear-gradient(180deg,#D3ECD3 0%,#F5F6FA 90%)' }}>
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
                  </div>

                  {/* приветствие */}
                  <div className="mt-4 px-1" suppressHydrationWarning>
                    <h1 className="text-[20px] font-bold leading-tight tracking-tight text-[#1A1A1A]">
                      {greeting()}, {firstName}
                    </h1>
                  </div>

                  {/* карусель карт: зелёный градиент #21A03A→#4FCB62, белые данные, чип «Дебетовая» */}
                  <div
                    role="region"
                    aria-label="Мои карты"
                    className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    style={{ touchAction: 'pan-x' }}
                    onScroll={onCardsScroll}
                  >
                    {cards.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={c.run}
                        aria-label={c.aria}
                        className="relative h-[140px] w-[82%] shrink-0 snap-center overflow-hidden rounded-[20px] p-4 text-left transition active:scale-[0.99]"
                        style={{ background: c.gradient }}
                      >
                        <span className="absolute -right-6 -top-12 size-36 rounded-full bg-white/10" aria-hidden="true" />
                        <span className="absolute -bottom-16 -left-8 size-40 rounded-full bg-white/[0.07]" aria-hidden="true" />
                        <span className="relative flex items-center justify-between">
                          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">{c.chip}</span>
                          <span className="text-[12px] font-medium tabular-nums tracking-[0.14em] text-white/80">{c.num}</span>
                        </span>
                        <span className="relative mt-4 block">
                          <span className="block text-[11px] text-white/75">{c.label}</span>
                          <span className="value-pop block text-[24px] font-bold leading-tight tabular-nums text-white">{c.amount}</span>
                        </span>
                        <span className="absolute inset-x-4 bottom-3 block truncate text-[11px] uppercase tracking-wide text-white/75">
                          {c.sub}
                        </span>
                      </button>
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
                        onClick={() => pushToast('Дебетовая карта', `Доступно: ${fmtMoney(data.balance)}`)}
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

                  {/* ПРОМО-БАННЕР (единственный синий элемент) */}
                  <button
                    type="button"
                    onClick={() => openApp('taxes')}
                    aria-label="Перейти в приложение Налоги"
                    className="flex w-full items-center gap-3 rounded-[20px] bg-[#D8E9FA] p-4 text-left transition active:scale-[0.99]"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white" aria-hidden="true">
                      <Receipt className="size-5 text-[#174F7C]" strokeWidth={2.1} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-[#174F7C]">Налоговый календарь</span>
                      <span className="block text-[12px] leading-snug text-[#4A708F]">
                        Проверьте начисления и оплатите вовремя — без пени и блокировки продаж
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-[#174F7C]" aria-hidden="true" />
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
                  <div className={`divide-y divide-[#F0F1F5] ${CARD} px-4 py-1`}>
                    {data.transactions.map((t) => (
                      <TxRow key={t.id} t={t} />
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
    </div>
  )
}
