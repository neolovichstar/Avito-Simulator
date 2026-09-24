'use client'

// Приложение «Банк» — канон мобильного Сбербанка по референсу:
// зелёный градиентный хедер с виджетами-карточками (крестик/плюс),
// белый лист «Финансы» с графиком поступлений/списаний (чёрная пилюля-тумблер),
// блок «Вклады» с зелёным «+», операции, нижняя навигация с крупной зелёной кнопкой.
// Тёмная тема ОС поддерживается через .theme-dark (bg-white / text-neutral-*).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeftRight, Banknote, Bell, Building2, Car, ChevronDown, ChevronRight, CreditCard,
  FileDown, Gavel, Gauge, History, Home, Info, Landmark, Loader2, Mic, MoreHorizontal, Percent, PieChart,
  PiggyBank, Plus, QrCode, Receipt, Search, Send, ShieldCheck, ShoppingBag, Smartphone, TrendingUp,
  Truck, Undo2, Wifi, X, type LucideIcon,
} from 'lucide-react'
import { api, ApiError, exportCsvUrl } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { TX_TYPE_LABEL } from '@/lib/types'
import type { BankData, SessionUser, TransactionDTO } from '@/lib/types'
import { creditLabel, DEPOSIT_RATE_PER_HOUR } from '@/lib/economy'
import { useCountUp } from '@/lib/use-count-up'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

type Screen = 'main' | 'payments' | 'analytics' | 'history'
type SheetKey = 'deposit' | 'loan' | 'qr' | null
type ChartMode = 'inc' | 'exp'

const GREEN = '#21A038'
const GREEN_DARK = '#12842F'
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

// ---- Агрегация операций для «Анализа» ----
interface AggCat {
  key: string
  label: string
  color: string
  total: number
  count: number
}

const CAT_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  purchase: { label: 'Покупки', color: '#E5484D', icon: ShoppingBag },
  sale: { label: 'Продажи', color: '#21A038', icon: TrendingUp },
  loan: { label: 'Кредиты', color: '#3F74E0', icon: Landmark },
  repay: { label: 'Погашение кредита', color: '#6C5CE7', icon: Undo2 },
  tax: { label: 'Налоги', color: '#D9980D', icon: Receipt },
  penalty: { label: 'Пени налоговой', color: '#E07A2F', icon: AlertTriangle },
  deposit: { label: 'Пополнение вклада', color: '#0FA98E', icon: PiggyBank },
  withdraw: { label: 'Снятие вклада', color: '#0E86B8', icon: Banknote },
  interest: { label: 'Проценты по вкладу', color: '#43A047', icon: Percent },
  boost: { label: 'Продвижение', color: '#C244CB', icon: TrendingUp },
  transfer: { label: 'Переводы людям', color: '#7B8794', icon: Send },
}
const FALLBACK_COLORS = ['#0E86B8', '#7CB305', '#C244CB', '#D9980D', '#7B8794', '#6C5CE7']

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
      key: '__other', label: 'Прочее', color: '#7B8794',
      total: rest.reduce((s, c) => s + c.total, 0),
      count: rest.reduce((s, c) => s + c.count, 0),
    }
    return [...arr.slice(0, 6), other]
  }
  return arr
}

// ---- Локальные UI-примитивы ----
const CARD_CLS = 'rounded-2xl bg-white ring-1 ring-black/[0.05] shadow-[0_1px_3px_rgba(16,35,47,0.06)]'

function Section({ title, open, onToggle, children }: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className={`overflow-hidden ${CARD_CLS}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left transition active:bg-neutral-50"
      >
        <span className="text-[15px] font-semibold text-neutral-900">{title}</span>
        <ChevronDown className={`size-4 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-neutral-100 px-4 py-4">{children}</div>}
    </div>
  )
}

function TxRow({ t }: { t: TransactionDTO }) {
  const { color, icon: Icon } = catMeta(t)
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1A`, color }}
        aria-hidden="true"
      >
        <Icon className="size-4" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-neutral-900">{TX_TYPE_LABEL[t.type] ?? t.type}</div>
        <div className="truncate text-[11px] text-neutral-400">
          {t.counterpartyName ?? t.note ?? '—'} · {timeAgo(t.createdAt)}
        </div>
      </div>
      <div className={`shrink-0 text-[13.5px] font-semibold tabular-nums ${t.amount >= 0 ? 'text-[#1B9A3E]' : 'text-neutral-900'}`}>
        {t.amount >= 0 ? '+' : ''}
        {fmtMoney(t.amount)}
      </div>
    </div>
  )
}

// Нижний лист (bottom sheet) как в Сбере
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div
        className="relative max-h-[82%] overflow-y-auto rounded-t-3xl bg-white px-5 pb-7 pt-3 shadow-2xl [scrollbar-width:thin]"
        style={{ animation: 'sheet-up 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-bold tracking-tight text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition active:scale-95"
          >
            <X className="size-4" />
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
  const isDark = useOS((s) => s.theme === 'dark')
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
  const [securityOpen, setSecurityOpen] = useState(false)
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
    { label: 'Безопасность', run: () => { setScreen('main'); setSecurityOpen(true) } },
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

  // График «Финансов»: поступления/списания за последние 6 месяцев
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

  const cardLast4 = (data?.cardNumber ?? '').split(' ').pop() ?? '0000'
  const maskedCard = `**** ${cardLast4}`
  const score = data?.creditScore ?? 500
  const credit = creditLabel(score)

  // Виджеты-карточки в шапке (как в референсе: иконка, крестик, подпись)
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
    { icon: Smartphone, label: 'Мобильная связь', sub: 'Сим-карты и связь', color: '#21A038' },
    { icon: Wifi, label: 'Интернет', sub: 'Провайдеры', color: '#3F74E0' },
    { icon: Building2, label: 'ЖКХ', sub: 'Квартплата', color: '#D9980D' },
    { icon: Receipt, label: 'Налоги', sub: 'Налоговая', color: '#E5484D', run: () => openApp('taxes') },
    { icon: Car, label: 'Штрафы', sub: 'Транспорт', color: '#7B8794' },
    { icon: Send, label: 'Переводы', sub: 'Людям по имени', color: '#C244CB' },
  ]

  return (
    <div className="relative flex h-full flex-col bg-[#F2F4F7] text-neutral-900">
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="space-y-4 p-4">
            <div className="h-64 rounded-b-[26px] bg-white/70 animate-pulse" />
            <div className="h-44 rounded-2xl bg-white animate-pulse" />
            <div className="h-16 rounded-2xl bg-white animate-pulse" />
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
              <Loader2 className="size-4 animate-spin" /> Загрузка банка…
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4">
            <div className={`${CARD_CLS} p-6 text-center`}>
              <p className="text-sm font-medium text-red-600">{error}</p>
              <Button className="mt-4 rounded-xl text-white" style={{ backgroundColor: GREEN }} onClick={load}>
                Повторить
              </Button>
            </div>
          </div>
        ) : data ? (
          <div key={screen} className="screen-enter pb-2">
            {/* ===== ГЛАВНЫЙ ===== */}
            {screen === 'main' && (
              <>
                {/* ── Зелёный градиентный хедер (как в референсе) ── */}
                <div
                  className="px-4 pb-12 pt-3"
                  style={{ background: `linear-gradient(160deg,#2FBF58 0%,#1FA243 42%,${GREEN_DARK} 100%)` }}
                >
                  {/* аватар / поиск / колокольчик */}
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-9 shrink-0 ring-2 ring-white/40">
                      {session?.photoUrl && <AvatarImage src={session.photoUrl} alt={holderName} />}
                      <AvatarFallback className="bg-white text-xs font-bold text-[#12842F]">
                        {firstName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/70" />
                      <input
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        onFocus={() => setSearchFocus(true)}
                        onBlur={() => setSearchFocus(false)}
                        placeholder="Платежи и переводы"
                        aria-label="Поиск по приложению"
                        className="h-10 w-full rounded-full border border-white/25 bg-white/15 pl-9 pr-9 text-sm text-white outline-none backdrop-blur-sm transition placeholder:text-white/65 focus:border-white/50 focus:bg-white/25"
                      />
                      <Mic className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/70" aria-hidden="true" />
                      {searchFocus && searchFound.length > 0 && (
                        <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
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
                              className="block w-full px-4 py-2.5 text-left text-sm text-neutral-800 transition hover:bg-neutral-50 hover:text-neutral-900"
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
                      className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm transition active:scale-95"
                    >
                      <Bell className="size-4.5" />
                      <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-white" />
                    </button>
                  </div>

                  {/* приветствие + «...» */}
                  <div className="mt-4 flex items-start justify-between gap-2" suppressHydrationWarning>
                    <div>
                      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-white">
                        {firstName},
                      </h1>
                      <p className="mt-0.5 text-[13px] font-medium text-white/75">ваша карта готова к покупкам</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Ещё"
                      onClick={() => setSheet('qr')}
                      className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 transition active:scale-95"
                    >
                      <MoreHorizontal className="size-5" />
                    </button>
                  </div>

                  {/* виджеты-карточки (горизонтальная лента с крестиками) */}
                  <div
                    ref={widgetsRef}
                    role="region"
                    aria-label="Виджеты"
                    className="-mx-1 mt-4 flex cursor-grab gap-2 overflow-x-auto pb-1 [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
                    style={{ touchAction: 'pan-x' }}
                    onPointerDown={onWMouseDown}
                    onPointerMove={onWMouseMove}
                    onPointerUp={onWMouseUp}
                    onPointerLeave={onWMouseUp}
                  >
                    {/* карточка «+» — вернуть скрытые */}
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
                      className="flex h-[104px] w-14 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
                    >
                      <Plus className="size-5" />
                      <span className="text-[9.5px] font-medium leading-tight text-white/80">Добавить</span>
                    </button>

                    {visibleWidgets.map((w) => (
                      <div
                        key={w.id}
                        className="relative h-[104px] w-[108px] shrink-0 select-none overflow-hidden rounded-2xl bg-white/12 p-2.5 ring-1 ring-white/20 backdrop-blur-sm"
                      >
                        <button
                          type="button"
                          onClick={w.run}
                          aria-label={w.label}
                          className="flex h-full w-full flex-col justify-between rounded-xl text-left"
                        >
                          <span className="flex size-8 items-center justify-center rounded-lg bg-white/20" aria-hidden="true">
                            <w.icon className="size-4 text-white" strokeWidth={2.1} />
                          </span>
                          <span>
                            <span className="block truncate text-[11.5px] font-semibold leading-tight text-white">{w.label}</span>
                            <span className="block truncate text-[10px] leading-tight text-white/65">{w.sub}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Скрыть ${w.label}`}
                          onClick={() => persistHidden([...hiddenWidgets, w.id])}
                          className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-white/60 transition hover:bg-white/15 hover:text-white active:scale-90"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Белый лист поверх хедера ── */}
                <div className="relative -mt-7 space-y-3 px-3 pb-2">
                  {formError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                      {formError}
                    </div>
                  )}

                  {/* ФИНАНСЫ: баланс + график + тумблер */}
                  <section className={`${CARD_CLS} px-4 pb-4 pt-4`} aria-label="Финансы">
                    <div className="text-[16px] font-bold tracking-tight text-neutral-900">Финансы</div>
                    <div className="mt-0.5 text-xs text-neutral-400" suppressHydrationWarning>{monthNom}</div>
                    <div className="value-pop mt-1.5 text-[30px] font-bold leading-none tabular-nums tracking-tight text-neutral-900">
                      {fmtMoney(animatedBalance)}
                    </div>

                    {/* график: 6 месяцев, столбики с треком + пунктирная сетка */}
                    <div className="relative mt-5 h-[104px]" aria-hidden="true">
                      <div className="absolute inset-x-0 top-[10%] border-t border-dashed border-neutral-200" />
                      <div className="absolute inset-x-0 top-[45%] border-t border-dashed border-neutral-200" />
                      <div className="absolute inset-x-0 top-[80%] border-t border-dashed border-neutral-200" />
                      <div className="relative flex h-full items-end justify-between gap-2 px-0.5">
                        {months.map((m, i) => {
                          const v = chartVals[i]
                          const h = Math.max(4, Math.round((v / chartMax) * 100))
                          const isLast = i === months.length - 1
                          return (
                            <div key={m.key} className="flex h-full w-7 flex-col items-center">
                              <div className="relative flex h-full w-full items-end overflow-hidden rounded-full bg-neutral-100">
                                <div
                                  className="w-full rounded-full transition-[height] duration-500"
                                  style={{ height: `${h}%`, backgroundColor: isLast ? GREEN : '#7FD99A' }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className="mt-1.5 flex justify-between px-0.5" aria-hidden="true">
                      {months.map((m, i) => (
                        <span key={m.key} className={`w-7 text-center text-[10px] font-medium ${i === months.length - 1 ? 'text-neutral-800' : 'text-neutral-400'}`}>
                          {m.label}
                        </span>
                      ))}
                    </div>

                    {/* низ: Детали + пилюли поступления/списания */}
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setScreen('analytics')}
                        className="text-[13px] font-semibold text-[#21A038] transition active:opacity-70"
                      >
                        Детали
                      </button>
                      <div className="flex items-center gap-1.5" role="tablist" aria-label="Режим графика">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={chartMode === 'inc'}
                          onClick={() => setChartMode('inc')}
                          className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                            chartMode === 'inc' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'
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
                            chartMode === 'exp' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          Списания
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-neutral-400">
                      {chartMode === 'inc' ? 'Зачисления' : 'Расход'} за полгода:{' '}
                      <span className="font-semibold tabular-nums text-neutral-800">{fmtMoney(modeSum)}</span>
                    </div>
                  </section>

                  {/* ВКЛАДЫ: зелёный «+», строки Копилка / Кредит */}
                  <section className={`${CARD_CLS} px-4 py-4`} aria-label="Вклады">
                    <div className="flex items-center justify-between">
                      <div className="text-[16px] font-bold tracking-tight text-neutral-900">Вклады</div>
                      <button
                        type="button"
                        aria-label="Пополнить вклад"
                        onClick={() => setSheet('deposit')}
                        className="flex size-8 items-center justify-center rounded-full bg-[#EAF8F1] text-[#12842F] transition active:scale-95"
                      >
                        <Plus className="size-4.5" />
                      </button>
                    </div>

                    {/* Копилка */}
                    <button
                      type="button"
                      onClick={() => setSheet('deposit')}
                      className="mt-3 flex w-full items-center gap-3 rounded-xl py-1 text-left transition active:bg-neutral-50"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF8F1]" aria-hidden="true">
                        <PiggyBank className="size-5 text-[#12842F]" strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold tabular-nums leading-tight text-neutral-900">{fmtMoney(data.deposit)}</span>
                        <span className="block truncate text-[11.5px] text-neutral-400">Пополнение вклада</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[12.5px] font-semibold text-[#12842F]">{rate}%</span>
                        <span className="block text-[10.5px] text-neutral-400">в час</span>
                      </span>
                    </button>

                    {/* Кредит */}
                    <button
                      type="button"
                      onClick={() => setSheet('loan')}
                      className="mt-2.5 flex w-full items-center gap-3 rounded-xl border-t border-neutral-100 pt-3 text-left transition active:bg-neutral-50"
                    >
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${data.activeLoan ? 'bg-red-50' : 'bg-neutral-100'}`}
                        aria-hidden="true"
                      >
                        <Landmark className={`size-5 ${data.activeLoan ? 'text-red-600' : 'text-neutral-500'}`} strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        {data.activeLoan ? (
                          <>
                            <span className="block text-[15px] font-bold tabular-nums leading-tight text-red-600">{fmtMoney(data.activeLoan.owed)}</span>
                            <span className="block truncate text-[11.5px] text-neutral-400">
                              Погашение до {new Date(data.activeLoan.dueAt).toLocaleDateString('ru-RU')}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block text-[15px] font-bold tabular-nums leading-tight text-neutral-900">{fmtMoney(data.loanLimit)}</span>
                            <span className="block truncate text-[11.5px] text-neutral-400">Кредитный лимит · ставка {data.creditRate ?? 15}%</span>
                          </>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[12.5px] font-semibold text-neutral-800">{score}</span>
                        <span className={`block text-[10.5px] font-medium ${credit.cls}`}>{credit.label}</span>
                      </span>
                    </button>
                  </section>

                  {/* ОПЕРАЦИИ */}
                  <section className={`${CARD_CLS} px-4 py-3.5`}>
                    <div className="flex items-center justify-between">
                      <div className="text-[16px] font-bold tracking-tight text-neutral-900">Операции</div>
                      <button className="flex items-center gap-0.5 text-[13px] font-semibold text-[#21A038] transition active:opacity-70" onClick={() => setScreen('history')}>
                        Все
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                    {data.transactions.length === 0 ? (
                      <p className="mt-3 pb-1 text-xs text-neutral-400">Операций пока нет — купите или продайте что-нибудь.</p>
                    ) : (
                      <div className="mt-1 divide-y divide-neutral-100">
                        {data.transactions.slice(0, 4).map((t) => (
                          <TxRow key={t.id} t={t} />
                        ))}
                      </div>
                    )}
                  </section>

                  {/* БЕЗОПАСНОСТЬ */}
                  <Section
                    title="Безопасность"
                    open={securityOpen}
                    onToggle={() => setSecurityOpen((v) => !v)}
                  >
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="size-4.5 text-[#21A038]" />
                        <div>
                          <div className="text-sm font-medium text-neutral-900">Вход по пину</div>
                          <div className="text-[11px] text-neutral-400">Код при входе в банк</div>
                        </div>
                      </div>
                      <Switch checked={pinOn} onCheckedChange={setPinOn} className="data-[state=checked]:bg-[#21A038] data-[state=unchecked]:bg-neutral-200" />
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-neutral-100 py-3">
                      <div className="flex items-center gap-2.5">
                        <Gauge className="size-4.5 text-[#21A038]" />
                        <div>
                          <div className="text-sm font-medium text-neutral-900">Уведомления об операциях</div>
                          <div className="text-[11px] text-neutral-400">Пуш после каждой операции</div>
                        </div>
                      </div>
                      <Switch checked={opsNotifOn} onCheckedChange={setOpsNotifOn} className="data-[state=checked]:bg-[#21A038] data-[state=unchecked]:bg-neutral-200" />
                    </div>
                    <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
                      <div className="flex items-center gap-2.5">
                        <Percent className="size-4.5 text-[#21A038]" />
                        <div>
                          <div className="text-sm font-medium text-neutral-900">Рейтинг: {score}</div>
                          <div className="text-[11px] text-neutral-400">Влияет на лимит и ставку</div>
                        </div>
                      </div>
                      <span className={`text-xs font-semibold ${credit.cls}`}>{credit.label}</span>
                    </div>
                  </Section>

                  <div className="pb-1 pt-1 text-center text-[10px] text-neutral-400">
                    Столичный Банк · вклады не застрахованы, это игра
                  </div>
                </div>
              </>
            )}

            {/* ===== ПЛАТЕЖИ ===== */}
            {screen === 'payments' && (
              <div className="space-y-4 p-4">
                <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">Платежи</h1>
                <p className="-mt-2.5 text-xs text-neutral-400">Услуги и переводы — выберите категорию</p>
                <div className="grid grid-cols-2 gap-3">
                  {services.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        if (s.run) s.run()
                        else pushToast('Платежи', 'Раздел скоро появится')
                      }}
                      className={`${CARD_CLS} p-4 text-left transition active:scale-[0.98]`}
                    >
                      <span
                        className="flex size-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${s.color}1A`, color: s.color }}
                      >
                        <s.icon className="size-5" />
                      </span>
                      <div className="mt-3 text-sm font-semibold text-neutral-900">{s.label}</div>
                      <div className="text-[11px] text-neutral-400">{s.sub}</div>
                    </button>
                  ))}
                </div>
                <div className={`${CARD_CLS} p-4 text-[11px] leading-relaxed text-neutral-400`}>
                  Переводы людям — из чата сделки: напишите продавцу и оплатите счёт, операция появится в истории банка.
                </div>
              </div>
            )}

            {/* ===== АНАЛИЗ ===== */}
            {screen === 'analytics' && (
              <div className="space-y-4 p-4">
                <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">Анализ финансов</h1>

                <div className="flex rounded-full bg-[#E8EBEF] p-1">
                  {(['out', 'in'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAnalyticsMode(m)}
                      className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition ${
                        analyticsMode === m ? 'bg-[#21A038] text-white shadow' : 'text-neutral-500 hover:text-neutral-800'
                      }`}
                    >
                      {m === 'out' ? 'Расходы' : 'Зачисления'}
                    </button>
                  ))}
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums tracking-tight text-neutral-900">{fmtMoney(catsTotal)}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {analyticsMode === 'out' ? 'Расход' : 'Зачисление'} в {monthPrep} · по последним операциям
                  </div>
                </div>

                {catsTotal <= 0 ? (
                  <div className={`flex flex-col items-center ${CARD_CLS} p-8 text-center`}>
                    <Info className="size-6 text-neutral-300" />
                    <p className="mt-2 text-sm text-neutral-500">Операций пока нет</p>
                    <p className="mt-1 text-xs text-neutral-400">Совершите покупки или продажи — аналитика появится здесь</p>
                  </div>
                ) : (
                  <>
                    {/* Донат */}
                    <div className={`flex justify-center ${CARD_CLS} py-6`}>
                      <div className="relative">
                        <svg viewBox="0 0 140 140" className="size-44" role="img" aria-label="Распределение по категориям">
                          <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(16,35,47,0.06)" strokeWidth={16} />
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
                          <span className="text-sm font-semibold text-neutral-900" suppressHydrationWarning>{monthNom}</span>
                          <span className="text-[11px] text-neutral-400">
                            {catsOps} {plural(catsOps, 'операция', 'операции', 'операций')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Категории */}
                    <div className={`divide-y divide-neutral-100 ${CARD_CLS} px-4`}>
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
                              <div className="truncate text-sm font-medium text-neutral-900">{c.label}</div>
                              <div className="text-[11px] text-neutral-400">
                                {c.count} {plural(c.count, 'операция', 'операции', 'операций')}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">{fmtMoney(c.total)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===== ИСТОРИЯ ===== */}
            {screen === 'history' && (
              <div className="space-y-4 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">История операций</h1>
                  {data.transactions.length > 0 && (
                    <a
                      href={exportCsvUrl()}
                      download
                      aria-label="Скачать историю операций в CSV"
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[#21A038]/10 px-3 text-[11px] font-semibold text-[#12842F] outline-none transition-colors hover:bg-[#21A038]/20 focus-visible:ring-2 focus-visible:ring-[#21A038]/40"
                    >
                      <FileDown className="size-3.5" aria-hidden="true" />
                      CSV
                    </a>
                  )}
                </div>
                {data.transactions.length === 0 ? (
                  <div className={`${CARD_CLS} p-6 text-center`}>
                    <p className="text-sm text-neutral-500">Здесь появятся все ваши покупки, продажи и операции с банком.</p>
                  </div>
                ) : (
                  <div className={`divide-y divide-neutral-100 ${CARD_CLS} px-4 py-1`}>
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
      <nav className="relative z-10 shrink-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
        <div className="grid grid-cols-5 items-end pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={() => setScreen('main')}
            aria-current={screen === 'main' ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition ${screen === 'main' ? 'text-[#21A038]' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <Home className="size-[22px]" strokeWidth={screen === 'main' ? 2.3 : 2} />
            <span className="text-[10px] font-semibold">Главная</span>
            <span className={`h-1 w-1 rounded-full transition ${screen === 'main' ? 'bg-[#21A038]' : 'bg-transparent'}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setScreen('payments')}
            aria-current={screen === 'payments' ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition ${screen === 'payments' ? 'text-[#21A038]' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <ArrowLeftRight className="size-[22px]" strokeWidth={screen === 'payments' ? 2.3 : 2} />
            <span className="text-[10px] font-semibold">Платежи</span>
            <span className={`h-1 w-1 rounded-full transition ${screen === 'payments' ? 'bg-[#21A038]' : 'bg-transparent'}`} aria-hidden="true" />
          </button>
          {/* центральная крупная зелёная кнопка */}
          <div className="relative flex justify-center">
            <button
              type="button"
              aria-label="Платежи и переводы по QR"
              onClick={() => setSheet('qr')}
              className={`-mt-7 flex size-14 items-center justify-center rounded-full text-white shadow-lg shadow-[#21A038]/40 ring-4 transition active:scale-95 ${isDark ? 'ring-[#262b31]' : 'ring-white'}`}
              style={{ background: `linear-gradient(150deg,#31BB4F 0%,${GREEN} 55%,${GREEN_DARK} 100%)` }}
            >
              <QrCode className="size-6" strokeWidth={2.2} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setScreen('analytics')}
            aria-current={screen === 'analytics' ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition ${screen === 'analytics' ? 'text-[#21A038]' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <PieChart className="size-[22px]" strokeWidth={screen === 'analytics' ? 2.3 : 2} />
            <span className="text-[10px] font-semibold">Анализ</span>
            <span className={`h-1 w-1 rounded-full transition ${screen === 'analytics' ? 'bg-[#21A038]' : 'bg-transparent'}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setScreen('history')}
            aria-current={screen === 'history' ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition ${screen === 'history' ? 'text-[#21A038]' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <History className="size-[22px]" strokeWidth={screen === 'history' ? 2.3 : 2} />
            <span className="text-[10px] font-semibold">История</span>
            <span className={`h-1 w-1 rounded-full transition ${screen === 'history' ? 'bg-[#21A038]' : 'bg-transparent'}`} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/* ===== НИЖНИЕ ЛИСТЫ ===== */}
      {sheet === 'qr' && data && (
        <Sheet title="Платежи и переводы" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Receipt, label: 'Оплатить налоги', color: '#E5484D', run: () => { setSheet(null); openApp('taxes') } },
              { icon: PiggyBank, label: 'Пополнить вклад', color: '#0FA98E', run: () => setSheet('deposit') },
              { icon: Landmark, label: data.activeLoan ? 'Погасить кредит' : 'Взять кредит', color: '#3F74E0', run: () => setSheet('loan') },
              { icon: Send, label: 'Перевести', color: '#C244CB', run: () => { setSheet(null); setScreen('payments') } },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.run}
                className="flex flex-col items-start gap-2.5 rounded-2xl bg-neutral-50 p-3.5 text-left ring-1 ring-black/[0.04] transition active:scale-[0.98]"
              >
                <span className="flex size-10 items-center justify-center rounded-full" style={{ backgroundColor: `${a.color}1A`, color: a.color }}>
                  <a.icon className="size-5" />
                </span>
                <span className="text-[13px] font-semibold leading-tight text-neutral-900">{a.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">
            Наведите камеру на QR-код продавца — или выберите операцию выше. Переводы людям доступны из чата сделки.
          </p>
        </Sheet>
      )}

      {sheet === 'deposit' && data && (
        <Sheet title="Вклад «Копилка»" onClose={() => setSheet(null)}>
          <div className="rounded-2xl bg-[#EAF8F1] p-4 ring-1 ring-[#21A038]/15">
            <div className="text-xs text-neutral-500">На вкладе</div>
            <div className="text-2xl font-bold tabular-nums text-[#12842F]">{fmtMoney(data.deposit)}</div>
            <div className="mt-0.5 text-[11px] text-neutral-500">
              {rate}% в час · начисление ежечасно · деньги на вкладе не тратятся на покупки
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs text-neutral-500">Сумма</div>
            <Input
              className="mt-1.5 h-11 rounded-xl border-neutral-200 bg-white text-base font-semibold text-neutral-900 placeholder:text-neutral-300"
              inputMode="numeric"
              value={depositInput}
              placeholder="0"
              onChange={(e) => setDepositInput(e.target.value)}
            />
          </div>
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              className="h-11 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: GREEN }}
              disabled={busy || toAmount(depositInput) <= 0}
              onClick={() => applyMutation(() => api.depositOp(toAmount(depositInput), 'top'))}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'Пополнить'}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl border-neutral-200 bg-white text-sm font-semibold text-[#12842F] hover:bg-[#EAF8F1] hover:text-[#12842F]"
              disabled={busy || toAmount(depositInput) <= 0 || data.deposit <= 0}
              onClick={() => applyMutation(() => api.depositOp(toAmount(depositInput), 'withdraw'))}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'Снять'}
            </Button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-neutral-400">
            Снимайте вклад перед крупной закупкой — деньги на вкладе недоступны для ставок и покупок.
          </p>
        </Sheet>
      )}

      {sheet === 'loan' && data && (
        <Sheet title={data.activeLoan ? 'Погашение кредита' : 'Кредит'} onClose={() => setSheet(null)}>
          <div className="mb-3 flex items-center justify-between rounded-xl bg-neutral-100 px-3.5 py-2.5 text-xs">
            <span className="text-neutral-500">Лимит</span>
            <span className="font-semibold text-neutral-900">{fmtMoney(data.loanLimit)}</span>
            <span className="text-neutral-500">Ставка</span>
            <span className="font-semibold text-neutral-900">{data.creditRate ?? 15}%</span>
          </div>

          {data.activeLoan ? (
            <>
              <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                <div className="text-xs text-red-500/80">Остаток долга</div>
                <div className="text-2xl font-bold tabular-nums text-red-600">{fmtMoney(data.activeLoan.owed)}</div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-neutral-500">
                <div className="flex justify-between">
                  <span>Выдано</span>
                  <span className="font-medium text-neutral-800">{fmtMoney(data.activeLoan.principal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ставка</span>
                  <span className="font-medium text-neutral-800">{data.activeLoan.rate}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Срок до</span>
                  <span className="font-medium text-neutral-800">
                    {new Date(data.activeLoan.dueAt).toLocaleString('ru-RU', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-neutral-500">Сумма погашения</div>
                <Input
                  className="mt-1.5 h-11 rounded-xl border-neutral-200 bg-white text-base font-semibold text-neutral-900 placeholder:text-neutral-300"
                  inputMode="numeric"
                  value={repayAmount ? String(repayAmount) : ''}
                  placeholder="0"
                  onChange={(e) => setRepayAmount(Math.min(toAmount(e.target.value), data.activeLoan?.owed ?? 0))}
                />
                <Slider
                  className="mt-4 [&_[data-slot=slider-range]]:bg-[#21A038] [&_[data-slot=slider-thumb]]:border-[#21A038] [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-neutral-200"
                  value={[Math.min(repayAmount, data.activeLoan.owed)]}
                  min={100}
                  max={Math.max(100, Math.round(data.activeLoan.owed))}
                  step={100}
                  onValueChange={(v) => setRepayAmount(v[0] ?? 0)}
                />
              </div>
              {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
              <Button
                className="mt-4 h-11 w-full rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: GREEN }}
                disabled={busy || repayAmount <= 0}
                onClick={() => applyMutation(() => api.repayLoan(repayAmount))}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : 'Погасить'}
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-[#EAF8F1] p-4 ring-1 ring-[#21A038]/15">
                <div className="text-xs text-neutral-500">Сумма кредита</div>
                <div className="text-2xl font-bold tabular-nums text-[#12842F]">{fmtMoney(loanAmount)}</div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-neutral-500">От 1 000 до {fmtMoney(Math.max(1000, data.loanLimit))}</div>
                <Input
                  className="mt-1.5 h-11 rounded-xl border-neutral-200 bg-white text-base font-semibold text-neutral-900 placeholder:text-neutral-300"
                  inputMode="numeric"
                  value={loanAmount ? String(loanAmount) : ''}
                  placeholder="0"
                  onChange={(e) => setLoanAmount(Math.min(toAmount(e.target.value), Math.max(1000, data.loanLimit)))}
                />
                <Slider
                  className="mt-4 [&_[data-slot=slider-range]]:bg-[#21A038] [&_[data-slot=slider-thumb]]:border-[#21A038] [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-neutral-200"
                  value={[Math.min(Math.max(loanAmount, 1000), Math.max(1000, data.loanLimit))]}
                  min={1000}
                  max={Math.max(1000, data.loanLimit)}
                  step={500}
                  onValueChange={(v) => setLoanAmount(v[0] ?? 1000)}
                />
              </div>
              {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
              <Button
                className="mt-4 h-11 w-full rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: GREEN }}
                disabled={busy || data.loanLimit < 1000 || loanAmount < 1000}
                onClick={() => applyMutation(() => api.takeLoan(loanAmount))}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : 'Взять кредит'}
              </Button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-neutral-400">
                Срок 7 дней. Погашение вовремя повышает рейтинг (+40), просрочка роняет его (−80).
              </p>
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}
