'use client'

// Приложение «Банк» — редизайн по макету юзера, дизайн-система «Resale Dark»:
// всегда тёмный зелёный фон #050D09, плоско-тёмная карта с зелёным чипом и крупным
// балансом (text-[34px]), 4 быстрых действия (первое — залитое), последние операции
// строками с иконками в квадратных плашках, тёмные формы кредита/вклада со слайдерами.
// Вся бизнес-логика (api.bank/takeLoan/repayLoan/depositOp, виджеты, поиск,
// аналитика, CSV, нижние листы) сохранена 1:1.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeftRight, Banknote, Bell, Building2, Car, ChevronRight, CreditCard,
  FileDown, Gavel, Gauge, History, Home, Info, Landmark, Loader2, Mic, MoreHorizontal, Percent, PieChart,
  PiggyBank, Plus, QrCode, Receipt, Search, Send, ShieldCheck, ShoppingBag, Smartphone, TrendingUp,
  Truck, Undo2, Wifi, X, type LucideIcon,
} from 'lucide-react'
import { api, ApiError, exportCsvUrl } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { TX_TYPE_LABEL } from '@/lib/types'
import type { BankData, SessionUser, TransactionDTO } from '@/lib/types'
import { DEPOSIT_RATE_PER_HOUR } from '@/lib/economy'
import { useCountUp } from '@/lib/use-count-up'
import { Slider } from '@/components/ui/slider'

type Screen = 'main' | 'payments' | 'analytics' | 'history'
type SheetKey = 'deposit' | 'loan' | 'qr' | null
type ChartMode = 'inc' | 'exp'

const WIDGETS_KEY = 'avito_sim_bank_widgets_v1'

const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
const MONTH_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTH_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

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

// Тёмные цвета кредитного рейтинга (пороги те же, что в economy.creditLabel)
function creditDark(score: number): { label: string; cls: string } {
  if (score >= 750) return { label: 'Отличный', cls: 'text-emerald-400' }
  if (score >= 620) return { label: 'Хороший', cls: 'text-green-400' }
  if (score >= 480) return { label: 'Средний', cls: 'text-amber-400' }
  return { label: 'Низкий', cls: 'text-red-400' }
}

// ---- Агрегация операций для «Анализа» ----
interface AggCat {
  key: string
  label: string
  color: string
  total: number
  count: number
}

const CAT_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  purchase: { label: 'Покупки', color: '#F87171', icon: ShoppingBag },
  sale: { label: 'Продажи', color: '#34D399', icon: TrendingUp },
  loan: { label: 'Кредиты', color: '#60A5FA', icon: Landmark },
  repay: { label: 'Погашение кредита', color: '#A78BFA', icon: Undo2 },
  tax: { label: 'Налоги', color: '#FBBF24', icon: Receipt },
  penalty: { label: 'Пени налоговой', color: '#FB923C', icon: AlertTriangle },
  deposit: { label: 'Пополнение вклада', color: '#2DD4BF', icon: PiggyBank },
  withdraw: { label: 'Снятие вклада', color: '#38BDF8', icon: Banknote },
  interest: { label: 'Проценты по вкладу', color: '#4ADE80', icon: Percent },
  boost: { label: 'Продвижение', color: '#E879F9', icon: TrendingUp },
  transfer: { label: 'Переводы людям', color: '#94A3B8', icon: Send },
}
const FALLBACK_COLORS = ['#38BDF8', '#A3E635', '#E879F9', '#FBBF24', '#94A3B8', '#A78BFA']

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
      key: '__other', label: 'Прочее', color: '#94A3B8',
      total: rest.reduce((s, c) => s + c.total, 0),
      count: rest.reduce((s, c) => s + c.count, 0),
    }
    return [...arr.slice(0, 6), other]
  }
  return arr
}

// ---- Локальные UI-примитивы (Resale Dark) ----
const CARD_CLS = 'rounded-2xl border border-emerald-500/15 bg-[#0E1F16]'
const CARD_SOFT = 'rounded-2xl border border-white/[0.08] bg-white/[0.04]'

function Chip() {
  return (
    <span className="flex h-7 w-9 shrink-0 flex-col justify-center gap-[3px] rounded-md bg-[#22C55E] px-1.5" aria-hidden="true">
      <span className="h-[2px] w-full rounded bg-[#052E16]/70" />
      <span className="h-[2px] w-3/4 rounded bg-[#052E16]/70" />
    </span>
  )
}

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
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#22C55E]' : 'bg-white/15'}`}
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
      <span className="text-[15px] font-semibold text-white">{title}</span>
      {onAll && (
        <button
          type="button"
          onClick={onAll}
          className="flex items-center text-[13px] font-semibold text-emerald-400 transition active:opacity-70"
        >
          Все
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function TxRow({ t }: { t: TransactionDTO }) {
  const { icon: Icon } = catMeta(t)
  const positive = t.amount >= 0
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${positive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
        aria-hidden="true"
      >
        <Icon className="size-4.5" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-white">{TX_TYPE_LABEL[t.type] ?? t.type}</div>
        <div className="truncate text-[12px] text-white/50">
          {t.counterpartyName ?? t.note ?? '—'} · {timeAgo(t.createdAt)}
        </div>
      </div>
      <div className={`shrink-0 text-[14px] font-semibold tabular-nums ${positive ? 'text-emerald-400' : 'text-white'}`}>
        {positive ? '+' : ''}
        {fmtMoney(t.amount)}
      </div>
    </div>
  )
}

// Нижний лист (bottom sheet) — тёмный, по дизайн-системе
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div
        className="relative max-h-[82%] overflow-y-auto rounded-t-3xl border-t border-white/[0.08] bg-[#0E1F16] px-5 pb-7 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] [scrollbar-width:thin]"
        style={{ animation: 'sheet-up 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-bold tracking-tight text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition active:scale-95"
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
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([])
  // плавный «счётчик денег» на главном экране
  const animatedBalance = useCountUp(data?.balance ?? 0)
  const widgetsRef = useRef<HTMLDivElement>(null)

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

  // Восстановление скрытых виджетов
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIDGETS_KEY)
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        if (Array.isArray(arr)) setHiddenWidgets(arr)
      }
    } catch { /* ignore */ }
  }, [])

  const persistHidden = (ids: string[]) => {
    setHiddenWidgets(ids)
    try {
      localStorage.setItem(WIDGETS_KEY, JSON.stringify(ids))
    } catch { /* ignore */ }
  }

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
  const monthIncome = months[months.length - 1]?.inc ?? 0

  const cardLast4 = (data?.cardNumber ?? '').split(' ').pop() ?? '0000'
  const maskedCard = `**** ${cardLast4}`
  const score = data?.creditScore ?? 500
  const credit = creditDark(score)

  // Виджеты-карточки (лента со скрытием, как на макете «ещё»)
  const widgets: { id: string; label: string; sub: string; icon: LucideIcon; run: () => void }[] = [
    { id: 'card', label: `Карта ${maskedCard}`, sub: fmtMoney(data?.balance ?? 0), icon: CreditCard, run: () => pushToast('Дебетовая карта', `Доступно: ${fmtMoney(data?.balance ?? 0)}`) },
    { id: 'kopilka', label: 'Копилка', sub: `${rate}% в час`, icon: PiggyBank, run: () => setSheet('deposit') },
    { id: 'credit', label: 'Кредит', sub: data?.activeLoan ? fmtMoney(data.activeLoan.owed) : fmtMoney(data?.loanLimit ?? 0), icon: Landmark, run: () => setSheet('loan') },
    { id: 'taxes', label: 'Налоги', sub: 'ФНС', icon: Receipt, run: () => openApp('taxes') },
    { id: 'deals', label: 'Сделки', sub: 'Объявления', icon: ShoppingBag, run: () => openApp('avito') },
    { id: 'auction', label: 'Аукцион', sub: 'Ставки', icon: Gavel, run: () => openApp('auction') },
    { id: 'courier', label: 'Курьеры', sub: 'Доставка', icon: Truck, run: () => openApp('delivery') },
  ]
  const visibleWidgets = widgets.filter((w) => !hiddenWidgets.includes(w.id))

  // drag-to-scroll для мыши (ПК) — виджеты в шапке
  const dragState = useRef({ down: false, startX: 0, startLeft: 0, moved: false })
  const onWMouseDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const el = widgetsRef.current
    if (!el) return
    dragState.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false }
  }
  const onWMouseMove = (e: React.PointerEvent) => {
    const st = dragState.current
    const el = widgetsRef.current
    if (!st.down || !el) return
    const dx = e.clientX - st.startX
    if (Math.abs(dx) > 4) st.moved = true
    el.scrollLeft = st.startLeft - dx
  }
  const onWMouseUp = () => {
    dragState.current.down = false
  }

  const nav: { key: Screen; icon: LucideIcon; label: string }[] = [
    { key: 'main', icon: Home, label: 'Главная' },
    { key: 'payments', icon: ArrowLeftRight, label: 'Платежи' },
    { key: 'analytics', icon: PieChart, label: 'Анализ' },
    { key: 'history', icon: History, label: 'История' },
  ]

  const services: { icon: LucideIcon; label: string; sub: string; color: string; run?: () => void }[] = [
    { icon: Smartphone, label: 'Мобильная связь', sub: 'Сим-карты и связь', color: '#34D399' },
    { icon: Wifi, label: 'Интернет', sub: 'Провайдеры', color: '#60A5FA' },
    { icon: Building2, label: 'ЖКХ', sub: 'Квартплата', color: '#FBBF24' },
    { icon: Receipt, label: 'Налоги', sub: 'Налоговая', color: '#F87171', run: () => openApp('taxes') },
    { icon: Car, label: 'Штрафы', sub: 'Транспорт', color: '#94A3B8' },
    { icon: Send, label: 'Переводы', sub: 'Людям по имени', color: '#E879F9' },
  ]

  // Быстрые действия главной: первое — залитое (как «Перевести» на макете)
  const quickActions: { label: string; icon: LucideIcon; primary?: boolean; run: () => void }[] = [
    { label: 'Перевести', icon: Send, primary: true, run: () => setScreen('payments') },
    { label: 'Пополнить', icon: PiggyBank, run: () => setSheet('deposit') },
    { label: 'Кредит', icon: Landmark, run: () => setSheet('loan') },
    { label: 'Ещё', icon: QrCode, run: () => setSheet('qr') },
  ]

  return (
    <div
      className="relative flex h-full flex-col text-white"
      style={{ background: 'linear-gradient(180deg,#07130D 0%,#050D09 100%)' }}
    >
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="space-y-3 p-4">
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-44 animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="h-20 animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="flex items-center justify-center gap-2 text-[13px] text-white/40">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Загрузка банка…
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4">
            <div className={`${CARD_SOFT} p-6 text-center`}>
              <p className="text-[13px] text-red-400">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 text-[13px] font-semibold text-emerald-400 transition active:opacity-70"
              >
                Повторить
              </button>
            </div>
          </div>
        ) : data ? (
          <div key={screen} className="screen-enter pb-2">
            {/* ===== ГЛАВНЫЙ ===== */}
            {screen === 'main' && (
              <div className="space-y-5 px-4 pb-2 pt-4">
                {/* шапка: аватар / поиск / колокольчик */}
                <div className="flex items-center gap-2.5">
                  {session?.photoUrl ? (
                    <img src={session.photoUrl} alt={holderName} className="size-9 shrink-0 rounded-full object-cover ring-2 ring-emerald-400/30" />
                  ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-300 ring-2 ring-emerald-400/30">
                      {firstName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
                    <input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      onFocus={() => setSearchFocus(true)}
                      onBlur={() => setSearchFocus(false)}
                      placeholder="Платежи и переводы"
                      aria-label="Поиск по приложению"
                      className="h-10 w-full rounded-full border border-white/10 bg-white/[0.06] pl-9 pr-9 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-emerald-500/50"
                    />
                    <Mic className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
                    {searchFocus && searchFound.length > 0 && (
                      <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#0E1F16] shadow-xl">
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
                            className="block w-full px-4 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Уведомления"
                    onClick={() => pushToast('Уведомления', 'Новых уведомлений нет')}
                    className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition active:scale-95"
                  >
                    <Bell className="size-4.5" aria-hidden="true" />
                    <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  </button>
                </div>

                {/* приветствие */}
                <div className="-mt-3 px-1" suppressHydrationWarning>
                  <h1 className="text-[22px] font-bold leading-tight tracking-tight text-white">{firstName},</h1>
                  <p className="mt-0.5 text-[13px] text-white/50">ваша карта готова к покупкам</p>
                </div>

                {/* карта-банковка: плоско-тёмная с зелёным чипом + главный баланс */}
                <button
                  type="button"
                  onClick={() => pushToast('Дебетовая карта', `Доступно: ${fmtMoney(data.balance)}`)}
                  aria-label={`Дебетовая карта ${maskedCard}, доступно ${fmtMoney(data.balance)}`}
                  className="block w-full rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 p-4 text-left transition active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12px] font-medium text-emerald-300">
                      <CreditCard className="size-4" aria-hidden="true" />
                      Дебетовая карта
                    </span>
                    <Chip />
                  </div>
                  <div className="value-pop mt-3 text-[34px] font-bold leading-none tabular-nums text-white">
                    {fmtMoney(animatedBalance)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 text-[12px]" suppressHydrationWarning>
                    {monthIncome > 0 ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <TrendingUp className="size-3.5" aria-hidden="true" />
                        +{fmtMoney(monthIncome)} за {MONTH_SHORT[now.getMonth()]}
                      </span>
                    ) : (
                      <span className="text-white/40">Поступлений за месяц пока нет</span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-[12px] text-white/55">
                    <span className="tabular-nums tracking-[0.18em]">{maskedCard}</span>
                    <span className="truncate uppercase">{holderName}</span>
                  </div>
                </button>

                {/* 4 быстрых действия */}
                <div className="grid grid-cols-4 gap-2.5" role="group" aria-label="Быстрые действия">
                  {quickActions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={a.run}
                      className={`flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border transition active:scale-[0.97] ${
                        a.primary
                          ? 'border-transparent bg-[#22C55E] text-[#052E16]'
                          : 'border-white/10 bg-white/[0.05] text-white'
                      }`}
                    >
                      <a.icon className={`size-5 ${a.primary ? 'text-[#052E16]' : 'text-emerald-400'}`} aria-hidden="true" />
                      <span className={`text-[11px] ${a.primary ? 'font-semibold text-[#052E16]' : 'text-white/70'}`}>{a.label}</span>
                    </button>
                  ))}
                </div>

                {/* лента виджетов (скрытие крестиком, drag на ПК) */}
                <div
                  ref={widgetsRef}
                  role="region"
                  aria-label="Виджеты"
                  className="-mx-1 flex cursor-grab gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
                  style={{ touchAction: 'pan-x' }}
                  onPointerDown={onWMouseDown}
                  onPointerMove={onWMouseMove}
                  onPointerUp={onWMouseUp}
                  onPointerLeave={onWMouseUp}
                >
                  <button
                    type="button"
                    aria-label="Вернуть виджеты"
                    onClick={() => {
                      if (hiddenWidgets.length > 0) {
                        persistHidden([])
                        pushToast('Виджеты', 'Скрытые виджеты возвращены на панель')
                      } else {
                        pushToast('Виджеты', 'Все виджеты уже на панели — скройте лишние крестиком')
                      }
                    }}
                    className="flex h-[84px] w-14 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] text-white transition active:scale-95"
                  >
                    <Plus className="size-5" aria-hidden="true" />
                    <span className="text-[9.5px] font-medium leading-tight text-white/70">Добавить</span>
                  </button>
                  {visibleWidgets.map((w) => (
                    <div
                      key={w.id}
                      className="relative h-[84px] w-[108px] shrink-0 select-none overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-2.5"
                    >
                      <button
                        type="button"
                        onClick={w.run}
                        aria-label={w.label}
                        className="flex h-full w-full flex-col justify-between rounded-xl text-left"
                      >
                        <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15" aria-hidden="true">
                          <w.icon className="size-4 text-emerald-400" strokeWidth={2.1} />
                        </span>
                        <span>
                          <span className="block truncate text-[11.5px] font-semibold leading-tight text-white">{w.label}</span>
                          <span className="block truncate text-[10px] leading-tight text-white/50">{w.sub}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Скрыть ${w.label}`}
                        onClick={() => persistHidden([...hiddenWidgets, w.id])}
                        className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white active:scale-90"
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>

                {formError && (
                  <p className="px-1 text-[13px] text-red-400">{formError}</p>
                )}

                {/* ПОСЛЕДНИЕ ОПЕРАЦИИ */}
                <div className="space-y-2">
                  <SectionHeader title="Последние операции" onAll={() => setScreen('history')} />
                  <div className={`${CARD_CLS} px-4 py-1`}>
                    {data.transactions.length === 0 ? (
                      <p className="py-4 text-[12px] text-white/40">Операций пока нет — купите или продайте что-нибудь.</p>
                    ) : (
                      <div className="divide-y divide-white/[0.06]">
                        {data.transactions.slice(0, 4).map((t) => (
                          <TxRow key={t.id} t={t} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* СБЕРЕЖЕНИЯ: Копилка + Кредит */}
                <div className="space-y-2">
                  <SectionHeader title="Сбережения" />
                  <div className={`${CARD_CLS} px-4 py-3`}>
                    <button
                      type="button"
                      onClick={() => setSheet('deposit')}
                      className="flex w-full items-center gap-3 rounded-xl py-1 text-left transition active:opacity-70"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15" aria-hidden="true">
                        <PiggyBank className="size-5 text-emerald-400" strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold tabular-nums leading-tight text-white">{fmtMoney(data.deposit)}</span>
                        <span className="block truncate text-[12px] text-white/50">Вклад «Копилка»</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[12.5px] font-semibold text-emerald-400">{rate}%</span>
                        <span className="block text-[10.5px] text-white/40">в час</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSheet('loan')}
                      className="mt-2 flex w-full items-center gap-3 rounded-xl border-t border-white/[0.06] pt-3 text-left transition active:opacity-70"
                    >
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${data.activeLoan ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}
                        aria-hidden="true"
                      >
                        <Landmark className="size-5" strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        {data.activeLoan ? (
                          <>
                            <span className="block text-[15px] font-bold tabular-nums leading-tight text-red-400">{fmtMoney(data.activeLoan.owed)}</span>
                            <span className="block truncate text-[12px] text-white/50">
                              Погашение до {new Date(data.activeLoan.dueAt).toLocaleDateString('ru-RU')}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block text-[15px] font-bold tabular-nums leading-tight text-white">{fmtMoney(data.loanLimit)}</span>
                            <span className="block truncate text-[12px] text-white/50">Кредитный лимит · ставка {data.creditRate ?? 15}%</span>
                          </>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[12.5px] font-semibold text-white">{score}</span>
                        <span className={`block text-[10.5px] font-medium ${credit.cls}`}>{credit.label}</span>
                      </span>
                    </button>
                  </div>
                </div>

                {/* БЕЗОПАСНОСТЬ */}
                <div className={`${CARD_CLS} px-4 py-3.5`}>
                  <div className="text-[15px] font-semibold text-white">Безопасность</div>
                  <div className="mt-1 flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="size-4.5 text-emerald-400" aria-hidden="true" />
                      <div>
                        <div className="text-sm font-medium text-white">Вход по пину</div>
                        <div className="text-[11px] text-white/40">Код при входе в банк</div>
                      </div>
                    </div>
                    <Toggle checked={pinOn} onCheckedChange={setPinOn} label="Вход по пину" />
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.06] py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Gauge className="size-4.5 text-emerald-400" aria-hidden="true" />
                      <div>
                        <div className="text-sm font-medium text-white">Уведомления об операциях</div>
                        <div className="text-[11px] text-white/40">Пуш после каждой операции</div>
                      </div>
                    </div>
                    <Toggle checked={opsNotifOn} onCheckedChange={setOpsNotifOn} label="Уведомления об операциях" />
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                    <div className="flex items-center gap-2.5">
                      <Percent className="size-4.5 text-emerald-400" aria-hidden="true" />
                      <div>
                        <div className="text-sm font-medium text-white">Рейтинг: {score}</div>
                        <div className="text-[11px] text-white/40">Влияет на лимит и ставку</div>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${credit.cls}`}>{credit.label}</span>
                  </div>
                </div>

                <div className="pb-1 pt-1 text-center text-[10px] text-white/30">
                  Столичный Банк · вклады не застрахованы, это игра
                </div>
              </div>
            )}

            {/* ===== ПЛАТЕЖИ ===== */}
            {screen === 'payments' && (
              <div className="space-y-4 p-4">
                <h1 className="text-[22px] font-bold tracking-tight text-white">Платежи</h1>
                <p className="-mt-2.5 text-xs text-white/50">Услуги и переводы — выберите категорию</p>
                <div className="grid grid-cols-2 gap-3">
                  {services.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        if (s.run) s.run()
                        else pushToast('Платежи', 'Раздел скоро появится')
                      }}
                      className={`${CARD_SOFT} p-4 text-left transition active:scale-[0.98]`}
                    >
                      <span
                        className="flex size-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${s.color}22`, color: s.color }}
                        aria-hidden="true"
                      >
                        <s.icon className="size-5" />
                      </span>
                      <div className="mt-3 text-sm font-semibold text-white">{s.label}</div>
                      <div className="text-[11px] text-white/50">{s.sub}</div>
                    </button>
                  ))}
                </div>
                <div className={`${CARD_SOFT} p-4 text-[11px] leading-relaxed text-white/50`}>
                  Переводы людям — из чата сделки: напишите продавцу и оплатите счёт, операция появится в истории банка.
                </div>
              </div>
            )}

            {/* ===== АНАЛИЗ ===== */}
            {screen === 'analytics' && (
              <div className="space-y-4 p-4">
                <h1 className="text-[22px] font-bold tracking-tight text-white">Анализ финансов</h1>

                <div className="flex gap-2" role="tablist" aria-label="Режим аналитики">
                  {(['out', 'in'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={analyticsMode === m}
                      onClick={() => setAnalyticsMode(m)}
                      className={`h-9 flex-1 rounded-full px-4 text-[13px] transition ${
                        analyticsMode === m ? 'bg-emerald-500 font-semibold text-[#052E16]' : 'bg-white/[0.06] text-white/70'
                      }`}
                    >
                      {m === 'out' ? 'Расходы' : 'Зачисления'}
                    </button>
                  ))}
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums tracking-tight text-white">{fmtMoney(catsTotal)}</div>
                  <div className="mt-0.5 text-xs text-white/50" suppressHydrationWarning>
                    {analyticsMode === 'out' ? 'Расход' : 'Зачисление'} в {monthPrep} · по последним операциям
                  </div>
                </div>

                {catsTotal <= 0 ? (
                  <div className={`flex flex-col items-center ${CARD_SOFT} p-8 text-center`}>
                    <Info className="size-6 text-white/30" aria-hidden="true" />
                    <p className="mt-2 text-sm text-white/60">Операций пока нет</p>
                    <p className="mt-1 text-xs text-white/40">Совершите покупки или продажи — аналитика появится здесь</p>
                  </div>
                ) : (
                  <>
                    {/* Донат */}
                    <div className={`flex justify-center ${CARD_CLS} py-6`}>
                      <div className="relative">
                        <svg viewBox="0 0 140 140" className="size-44" role="img" aria-label="Распределение по категориям">
                          <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={16} />
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
                          <span className="text-sm font-semibold text-white" suppressHydrationWarning>{monthNom}</span>
                          <span className="text-[11px] text-white/50">
                            {catsOps} {plural(catsOps, 'операция', 'операции', 'операций')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Категории */}
                    <div className={`divide-y divide-white/[0.06] ${CARD_CLS} px-4`}>
                      {cats.map((c) => (
                        <div key={c.key} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                              style={{ backgroundColor: `${c.color}22`, color: c.color }}
                              aria-hidden="true"
                            >
                              {c.label.charAt(0)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">{c.label}</div>
                              <div className="text-[11px] text-white/50">
                                {c.count} {plural(c.count, 'операция', 'операции', 'операций')}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-semibold tabular-nums text-white">{fmtMoney(c.total)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Динамика за полгода (график с тумблером поступления/списания) */}
                <div className={`${CARD_CLS} px-4 pb-4 pt-4`} aria-label="Динамика за полгода">
                  <div className="flex items-center justify-between">
                    <div className="text-[15px] font-semibold text-white">Динамика за полгода</div>
                    <div className="flex items-center gap-1.5" role="tablist" aria-label="Режим графика">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={chartMode === 'inc'}
                        onClick={() => setChartMode('inc')}
                        className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                          chartMode === 'inc' ? 'bg-emerald-500 text-[#052E16]' : 'bg-white/[0.06] text-white/60'
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
                          chartMode === 'exp' ? 'bg-emerald-500 text-[#052E16]' : 'bg-white/[0.06] text-white/60'
                        }`}
                      >
                        Списания
                      </button>
                    </div>
                  </div>
                  <div className="relative mt-5 h-[104px]" aria-hidden="true">
                    <div className="absolute inset-x-0 top-[10%] border-t border-dashed border-white/[0.08]" />
                    <div className="absolute inset-x-0 top-[45%] border-t border-dashed border-white/[0.08]" />
                    <div className="absolute inset-x-0 top-[80%] border-t border-dashed border-white/[0.08]" />
                    <div className="relative flex h-full items-end justify-between gap-2 px-0.5">
                      {months.map((m, i) => {
                        const v = chartVals[i]
                        const h = Math.max(4, Math.round((v / chartMax) * 100))
                        const isLast = i === months.length - 1
                        return (
                          <div key={m.key} className="flex h-full w-7 flex-col items-center">
                            <div className="relative flex h-full w-full items-end overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className="w-full rounded-full transition-[height] duration-500"
                                style={{ height: `${h}%`, backgroundColor: isLast ? '#22C55E' : 'rgba(52,211,153,0.55)' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="mt-1.5 flex justify-between px-0.5" aria-hidden="true" suppressHydrationWarning>
                    {months.map((m, i) => (
                      <span key={m.key} className={`w-7 text-center text-[10px] font-medium ${i === months.length - 1 ? 'text-white' : 'text-white/40'}`}>
                        {m.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-white/50">
                    {chartMode === 'inc' ? 'Зачисления' : 'Расход'} за полгода:{' '}
                    <span className="font-semibold tabular-nums text-white">{fmtMoney(modeSum)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ===== ИСТОРИЯ ===== */}
            {screen === 'history' && (
              <div className="space-y-4 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-[22px] font-bold tracking-tight text-white">История операций</h1>
                  {data.transactions.length > 0 && (
                    <a
                      href={exportCsvUrl()}
                      download
                      aria-label="Скачать историю операций в CSV"
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 text-[11px] font-semibold text-emerald-400 outline-none transition-colors hover:bg-emerald-500/25 focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                    >
                      <FileDown className="size-3.5" aria-hidden="true" />
                      CSV
                    </a>
                  )}
                </div>
                {data.transactions.length === 0 ? (
                  <div className={`${CARD_SOFT} p-6 text-center`}>
                    <p className="text-sm text-white/60">Здесь появятся все ваши покупки, продажи и операции с банком.</p>
                  </div>
                ) : (
                  <div className={`divide-y divide-white/[0.06] ${CARD_CLS} px-4 py-1`}>
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

      {/* ===== НИЖНЯЯ НАВИГАЦИЯ (5 слотов: Главная/Платежи/[QR]/Анализ/История) ===== */}
      <nav className="relative z-10 shrink-0 border-t border-white/[0.06] bg-[#07130D]/95 backdrop-blur">
        <div className="grid grid-cols-5 items-end pb-[env(safe-area-inset-bottom)]">
          {nav.slice(0, 1).map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setScreen(n.key)}
              aria-current={screen === n.key ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition ${screen === n.key ? 'text-emerald-400' : 'text-white/40 hover:text-white/70'}`}
            >
              <n.icon className="size-[22px]" strokeWidth={screen === n.key ? 2.3 : 2} aria-hidden="true" />
              <span className="text-[10px] font-semibold">{n.label}</span>
              <span className={`h-1 w-1 rounded-full transition ${screen === n.key ? 'bg-emerald-400' : 'bg-transparent'}`} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setScreen('payments')}
            aria-current={screen === 'payments' ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition ${screen === 'payments' ? 'text-emerald-400' : 'text-white/40 hover:text-white/70'}`}
          >
            <ArrowLeftRight className="size-[22px]" strokeWidth={screen === 'payments' ? 2.3 : 2} aria-hidden="true" />
            <span className="text-[10px] font-semibold">Платежи</span>
            <span className={`h-1 w-1 rounded-full transition ${screen === 'payments' ? 'bg-emerald-400' : 'bg-transparent'}`} aria-hidden="true" />
          </button>
          {/* центральная крупная зелёная кнопка */}
          <div className="relative flex justify-center">
            <button
              type="button"
              aria-label="Платежи и переводы по QR"
              onClick={() => setSheet('qr')}
              className="-mt-7 flex size-14 items-center justify-center rounded-full bg-[#22C55E] text-[#052E16] shadow-lg shadow-emerald-500/25 ring-4 ring-[#050D09] transition active:scale-95"
            >
              <QrCode className="size-6" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
          {nav.slice(2).map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setScreen(n.key)}
              aria-current={screen === n.key ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition ${screen === n.key ? 'text-emerald-400' : 'text-white/40 hover:text-white/70'}`}
            >
              <n.icon className="size-[22px]" strokeWidth={screen === n.key ? 2.3 : 2} aria-hidden="true" />
              <span className="text-[10px] font-semibold">{n.label}</span>
              <span className={`h-1 w-1 rounded-full transition ${screen === n.key ? 'bg-emerald-400' : 'bg-transparent'}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </nav>

      {/* ===== НИЖНИЕ ЛИСТЫ ===== */}
      {sheet === 'qr' && data && (
        <Sheet title="Платежи и переводы" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Receipt, label: 'Оплатить налоги', color: '#F87171', run: () => { setSheet(null); openApp('taxes') } },
              { icon: PiggyBank, label: 'Пополнить вклад', color: '#2DD4BF', run: () => setSheet('deposit') },
              { icon: Landmark, label: data.activeLoan ? 'Погасить кредит' : 'Взять кредит', color: '#60A5FA', run: () => setSheet('loan') },
              { icon: Send, label: 'Перевести', color: '#E879F9', run: () => { setSheet(null); setScreen('payments') } },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.run}
                className="flex flex-col items-start gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 text-left transition active:scale-[0.98]"
              >
                <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${a.color}22`, color: a.color }} aria-hidden="true">
                  <a.icon className="size-5" />
                </span>
                <span className="text-[13px] font-semibold leading-tight text-white">{a.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-white/40">
            Наведите камеру на QR-код продавца — или выберите операцию выше. Переводы людям доступны из чата сделки.
          </p>
        </Sheet>
      )}

      {sheet === 'deposit' && data && (
        <Sheet title="Вклад «Копилка»" onClose={() => setSheet(null)}>
          <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 p-4">
            <div className="text-xs text-white/60">На вкладе</div>
            <div className="text-2xl font-bold tabular-nums text-white">{fmtMoney(data.deposit)}</div>
            <div className="mt-0.5 text-[12px] text-emerald-300">
              {rate}% в час · начисление ежечасно · деньги на вкладе не тратятся на покупки
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs text-white/50">Сумма</div>
            <input
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base font-semibold text-white outline-none transition placeholder:text-white/40 focus:border-emerald-500/50"
              inputMode="numeric"
              value={depositInput}
              placeholder="0"
              aria-label="Сумма пополнения вклада"
              onChange={(e) => setDepositInput(e.target.value)}
            />
          </div>
          {formError && <p className="mt-2 text-[13px] text-red-400">{formError}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex h-11 items-center justify-center rounded-xl bg-[#22C55E] text-sm font-bold text-[#052E16] transition active:scale-[0.98] disabled:bg-white/[0.06] disabled:text-white/40"
              disabled={busy || toAmount(depositInput) <= 0}
              onClick={() => applyMutation(() => api.depositOp(toAmount(depositInput), 'top'))}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Пополнить'}
            </button>
            <button
              type="button"
              className="flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-sm font-semibold text-white transition active:scale-[0.98] disabled:text-white/30"
              disabled={busy || toAmount(depositInput) <= 0 || data.deposit <= 0}
              onClick={() => applyMutation(() => api.depositOp(toAmount(depositInput), 'withdraw'))}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Снять'}
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-white/40">
            Снимайте вклад перед крупной закупкой — деньги на вкладе недоступны для ставок и покупок.
          </p>
        </Sheet>
      )}

      {sheet === 'loan' && data && (
        <Sheet title={data.activeLoan ? 'Погашение кредита' : 'Кредит'} onClose={() => setSheet(null)}>
          <div className="mb-3 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-xs">
            <span className="text-white/50">Лимит</span>
            <span className="font-semibold text-white">{fmtMoney(data.loanLimit)}</span>
            <span className="text-white/50">Ставка</span>
            <span className="font-semibold text-white">{data.creditRate ?? 15}%</span>
          </div>

          {data.activeLoan ? (
            <>
              <div className="rounded-2xl border border-red-500/25 bg-gradient-to-br from-red-500/20 to-red-500/5 p-4">
                <div className="text-xs text-white/60">Остаток долга</div>
                <div className="text-2xl font-bold tabular-nums text-red-400">{fmtMoney(data.activeLoan.owed)}</div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-white/50">
                <div className="flex justify-between">
                  <span>Выдано</span>
                  <span className="font-medium text-white">{fmtMoney(data.activeLoan.principal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ставка</span>
                  <span className="font-medium text-white">{data.activeLoan.rate}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Срок до</span>
                  <span className="font-medium text-white">
                    {new Date(data.activeLoan.dueAt).toLocaleString('ru-RU', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-white/50">Сумма погашения</div>
                <input
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base font-semibold text-white outline-none transition placeholder:text-white/40 focus:border-emerald-500/50"
                  inputMode="numeric"
                  value={repayAmount ? String(repayAmount) : ''}
                  placeholder="0"
                  aria-label="Сумма погашения"
                  onChange={(e) => setRepayAmount(Math.min(toAmount(e.target.value), data.activeLoan?.owed ?? 0))}
                />
                <Slider
                  className="mt-4 [&_[data-slot=slider-range]]:bg-[#22C55E] [&_[data-slot=slider-thumb]]:border-[#22C55E] [&_[data-slot=slider-thumb]]:bg-[#0E1F16] [&_[data-slot=slider-track]]:bg-white/10"
                  value={[Math.min(repayAmount, data.activeLoan.owed)]}
                  min={100}
                  max={Math.max(100, Math.round(data.activeLoan.owed))}
                  step={100}
                  onValueChange={(v) => setRepayAmount(v[0] ?? 0)}
                  aria-label="Сумма погашения"
                />
              </div>
              {formError && <p className="mt-2 text-[13px] text-red-400">{formError}</p>}
              <button
                type="button"
                className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[#22C55E] text-[15px] font-bold text-[#052E16] transition active:scale-[0.98] disabled:bg-white/[0.06] disabled:text-white/40"
                disabled={busy || repayAmount <= 0}
                onClick={() => applyMutation(() => api.repayLoan(repayAmount))}
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : 'Погасить'}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 p-4">
                <div className="text-xs text-white/60">Сумма кредита</div>
                <div className="text-2xl font-bold tabular-nums text-white">{fmtMoney(loanAmount)}</div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-white/50">От 1 000 до {fmtMoney(Math.max(1000, data.loanLimit))}</div>
                <input
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base font-semibold text-white outline-none transition placeholder:text-white/40 focus:border-emerald-500/50"
                  inputMode="numeric"
                  value={loanAmount ? String(loanAmount) : ''}
                  placeholder="0"
                  aria-label="Сумма кредита"
                  onChange={(e) => setLoanAmount(Math.min(toAmount(e.target.value), Math.max(1000, data.loanLimit)))}
                />
                <Slider
                  className="mt-4 [&_[data-slot=slider-range]]:bg-[#22C55E] [&_[data-slot=slider-thumb]]:border-[#22C55E] [&_[data-slot=slider-thumb]]:bg-[#0E1F16] [&_[data-slot=slider-track]]:bg-white/10"
                  value={[Math.min(Math.max(loanAmount, 1000), Math.max(1000, data.loanLimit))]}
                  min={1000}
                  max={Math.max(1000, data.loanLimit)}
                  step={500}
                  onValueChange={(v) => setLoanAmount(v[0] ?? 1000)}
                  aria-label="Сумма кредита"
                />
              </div>
              {formError && <p className="mt-2 text-[13px] text-red-400">{formError}</p>}
              <button
                type="button"
                className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[#22C55E] text-[15px] font-bold text-[#052E16] transition active:scale-[0.98] disabled:bg-white/[0.06] disabled:text-white/40"
                disabled={busy || data.loanLimit < 1000 || loanAmount < 1000}
                onClick={() => applyMutation(() => api.takeLoan(loanAmount))}
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : 'Взять кредит'}
              </button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-white/40">
                Срок 7 дней. Погашение вовремя повышает рейтинг (+40), просрочка роняет его (−80).
              </p>
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}
