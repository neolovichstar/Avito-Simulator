'use client'

// Приложение «Банк» — канон мобильного Сбербанка (без бренда):
// зелёный градиентный хедер, круглые действия, кошелёк-карусель со свайпами
// (мышь + палец), сторис, операции с цветными иконками, анализ с донатом,
// история с CSV, нижняя навигация.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight, Banknote, Bell, BellRing, Building2, Car,
  ChevronDown, ChevronRight, CreditCard, FileDown, Gauge, History, Home, Info, Landmark, Lightbulb, Loader2,
  Percent, PieChart, PiggyBank, Plus, QrCode, Receipt, Search, Send, ShieldAlert, ShieldCheck, ShoppingBag,
  Smartphone, TrendingUp, Undo2, Wifi, X, type LucideIcon,
} from 'lucide-react'
import { api, ApiError, exportCsvUrl } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { TX_TYPE_LABEL } from '@/lib/types'
import type { BankData, SessionUser, TransactionDTO } from '@/lib/types'
import { creditLabel, DEPOSIT_RATE_PER_HOUR } from '@/lib/economy'
import { useCountUp } from '@/lib/use-count-up'
import { useDrag } from '@/lib/use-swipe'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

type Screen = 'main' | 'payments' | 'analytics' | 'history'
type SectionKey = 'deposit' | 'security' | 'loan'

const GREEN = '#21A038'
const GREEN_DARK = '#12842F'

const MONTH_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTH_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

// Декоративные игровые курсы — детерминированы от дня
function dayRates(): { eur: string; eurUp: boolean; usd: string; usdUp: boolean } {
  const day = Math.floor(Date.now() / 86_400_000)
  const rnd = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  return {
    eur: (79.5 + rnd(day) * 6).toFixed(1).replace('.', ','),
    eurUp: rnd(day + 11) >= 0.5,
    usd: (72.5 + rnd(day + 77) * 5).toFixed(1).replace('.', ','),
    usdUp: rnd(day + 23) >= 0.5,
  }
}

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

const TIPS: { title: string; body: string }[] = [
  { title: 'Осторожно, курьер!', body: 'Курьер может подменить товар при доставке — в таких случаях работает страховка сделки.' },
  { title: 'Считайте профит', body: 'Не берите кредит на лот без профита — ставка съест всю маржу с перепродажи.' },
  { title: 'Налоги не ждут', body: 'Налоги лучше платить вовремя — за просрочку начисляется пеня 10% в сутки.' },
]

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

function ActionCircle({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5">
      <span className="flex size-14 items-center justify-center rounded-full bg-white/16 ring-1 ring-white/25 backdrop-blur-sm transition group-active:scale-95 group-hover:bg-white/25">
        <Icon className="size-[22px] text-white" strokeWidth={2} />
      </span>
      <span className="max-w-[72px] text-center text-[10.5px] font-medium leading-tight text-white/90">{label}</span>
    </button>
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

// ---- Кошелёк-карусель со свайпами (мышь + палец) ----
function WalletCarousel({
  data, animatedBalance, holderName, maskedCard, onDeposit, onWithdraw, onLoan, onRepay,
}: {
  data: BankData
  animatedBalance: number
  holderName: string
  maskedCard: string
  onDeposit: () => void
  onWithdraw: () => void
  onLoan: () => void
  onRepay: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [slide, setSlide] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const movedRef = useRef(false)

  const count = 3
  const { onPointerDown } = useDrag({
    onStart: () => {
      setDragging(true)
      movedRef.current = false
    },
    onMove: (dx, dy) => {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) movedRef.current = true
      // резина на краях
      const atEdge = (slide === 0 && dx > 0) || (slide === count - 1 && dx < 0)
      setDragX(atEdge ? dx * 0.35 : dx)
    },
    onEnd: (dx, dy) => {
      setDragging(false)
      setDragX(0)
      const w = viewportRef.current?.clientWidth ?? 320
      if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > Math.max(56, w * 0.16)) {
        setSlide((s) => Math.max(0, Math.min(count - 1, s + (dx < 0 ? 1 : -1))))
      }
    },
  })

  const rate = String(DEPOSIT_RATE_PER_HOUR * 100).replace('.', ',')

  const slides = [
    // ── Карта ──
    <div key="card" className="relative w-full shrink-0 select-none overflow-hidden rounded-2xl px-4 py-4 text-white" style={{ background: 'linear-gradient(135deg,#23B24A 0%,#0E8F33 55%,#0B6B27 100%)' }}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-8 size-36 rounded-full bg-black/10" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-7 w-10 rounded-md bg-gradient-to-br from-yellow-200 via-yellow-400 to-yellow-600 shadow-inner" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">Дебетовая</span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">Столичный Банк</span>
        </div>
        <div className="mt-4 font-mono text-[15px] tracking-[0.16em] text-white/90">{maskedCard}</div>
        <div className="mt-3.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9.5px] uppercase tracking-widest text-white/55">Держатель</div>
            <div className="truncate text-[11.5px] font-semibold uppercase text-white/90">{holderName}</div>
          </div>
          <div className="text-right">
            <div className="text-[9.5px] uppercase tracking-widest text-white/55">Доступно</div>
            <div className="text-[26px] font-bold leading-none tabular-nums text-white">{fmtMoney(animatedBalance)}</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onDeposit}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-white text-[13px] font-semibold text-[#0E7A2B] transition active:scale-[0.98]"
          >
            <Plus className="size-4" /> Пополнить
          </button>
          <button
            type="button"
            onClick={() => useOS.getState().pushToast('Реквизиты', 'Счёт №40817 · Столичный Банк')}
            className="flex h-9 items-center justify-center rounded-full bg-white/15 px-4 text-[13px] font-semibold text-white ring-1 ring-white/30 transition active:scale-[0.98]"
          >
            Реквизиты
          </button>
        </div>
      </div>
    </div>,
    // ── Вклад ──
    <div key="deposit" className="relative w-full shrink-0 select-none overflow-hidden rounded-2xl px-4 py-4 text-white" style={{ background: 'linear-gradient(135deg,#10B3A0 0%,#0C8A7B 60%,#08695E 100%)' }}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 size-36 rounded-full bg-white/10" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/75">
            <PiggyBank className="size-3.5" /> Вклад «Копилка»
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/90">{rate}% в час</span>
        </div>
        <div className="mt-4 text-[26px] font-bold leading-none tabular-nums text-white">{fmtMoney(data.deposit)}</div>
        <div className="mt-1 text-[11px] text-white/65">Деньги на вкладе не тратятся на покупки</div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onDeposit} className="flex h-9 flex-1 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#0B6E62] transition active:scale-[0.98]">
            Пополнить
          </button>
          <button type="button" onClick={onWithdraw} className="flex h-9 flex-1 items-center justify-center rounded-full bg-white/15 text-[13px] font-semibold text-white ring-1 ring-white/30 transition active:scale-[0.98]">
            Снять
          </button>
        </div>
      </div>
    </div>,
    // ── Кредит ──
    data.activeLoan ? (
      <div key="loan" className="relative w-full shrink-0 select-none overflow-hidden rounded-2xl px-4 py-4 text-white" style={{ background: 'linear-gradient(135deg,#E4605E 0%,#C93F3C 60%,#A32E2C 100%)' }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 size-36 rounded-full bg-white/10" />
        <div className="relative">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/75">Остаток долга</span>
          <div className="mt-4 text-[26px] font-bold leading-none tabular-nums text-white">{fmtMoney(data.activeLoan.owed)}</div>
          <div className="mt-1 text-[11px] text-white/70">
            Ставка {data.activeLoan.rate}% · до {new Date(data.activeLoan.dueAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
          <button type="button" onClick={onRepay} className="mt-4 flex h-9 w-full items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#A32E2C] transition active:scale-[0.98]">
            Погасить
          </button>
        </div>
      </div>
    ) : (
      <div key="loan" className="relative w-full shrink-0 select-none overflow-hidden rounded-2xl px-4 py-4 text-white" style={{ background: 'linear-gradient(135deg,#5C6B7E 0%,#3D4A5C 60%,#2C3644 100%)' }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 size-36 rounded-full bg-white/10" />
        <div className="relative">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/75">Кредитный лимит</span>
          <div className="mt-4 text-[26px] font-bold leading-none tabular-nums text-white">{fmtMoney(data.loanLimit)}</div>
          <div className="mt-1 text-[11px] text-white/65">Ставка {data.creditRate ?? 15}% · срок 7 дней</div>
          <button type="button" onClick={onLoan} className="mt-4 flex h-9 w-full items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#2C3644] transition active:scale-[0.98]">
            Взять кредит
          </button>
        </div>
      </div>
    ),
  ]

  return (
    <section className={CARD_CLS} aria-label="Кошелёк">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="text-[15px] font-semibold text-neutral-900">Кошелёк</div>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Слайды кошелька">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={slide === i}
              aria-label={`Слайд ${i + 1}`}
              onClick={() => setSlide(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${slide === i ? 'w-5 bg-[#21A038]' : 'w-1.5 bg-neutral-300 hover:bg-neutral-400'}`}
            />
          ))}
        </div>
      </div>
      <div
        ref={viewportRef}
        className="mt-3 cursor-grab overflow-hidden px-3 pb-3.5 active:cursor-grabbing"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(calc(${-slide * 100}% + ${dragX}px))`,
            transition: dragging ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {slides}
        </div>
      </div>
    </section>
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
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [loanAmount, setLoanAmount] = useState(5000)
  const [repayAmount, setRepayAmount] = useState(0)
  const [depositInput, setDepositInput] = useState('1000')
  const [openSection, setOpenSection] = useState<SectionKey | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [searchFocus, setSearchFocus] = useState(false)
  const [tipIdx, setTipIdx] = useState(0)
  const [tipClosed, setTipClosed] = useState(false)
  const [pinOn, setPinOn] = useState(true)
  const [opsNotifOn, setOpsNotifOn] = useState(true)
  const [analyticsMode, setAnalyticsMode] = useState<'out' | 'in'>('out')
  // плавный «счётчик денег» на карте
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

  // Ротация игровых советов
  useEffect(() => {
    if (tipClosed) return
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 7000)
    return () => clearInterval(id)
  }, [tipClosed])

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
  const rates = useMemo(() => dayRates(), [])
  const now = new Date()
  const monthNom = MONTH_NOM[now.getMonth()]
  const monthPrep = MONTH_PREP[now.getMonth()]

  const gotoSection = (s: SectionKey) => {
    setScreen('main')
    setOpenSection((cur) => (cur === s ? cur : s))
  }

  // Поиск по приложению: быстрые переходы
  const searchItems: { label: string; run: () => void }[] = [
    { label: 'Кошелёк и карты', run: () => setScreen('main') },
    { label: 'Вклады и счета', run: () => gotoSection('deposit') },
    { label: 'Кредиты', run: () => gotoSection('loan') },
    { label: 'Безопасность', run: () => gotoSection('security') },
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

  const cardLast4 = (data?.cardNumber ?? '').split(' ').pop() ?? '0000'
  const maskedCard = `**** **** **** ${cardLast4}`
  const score = data?.creditScore ?? 500
  const credit = creditLabel(score)

  const nav: { key: Screen; icon: LucideIcon; label: string }[] = [
    { key: 'main', icon: Home, label: 'Главный' },
    { key: 'payments', icon: ArrowLeftRight, label: 'Платежи' },
    { key: 'analytics', icon: PieChart, label: 'Анализ' },
    { key: 'history', icon: History, label: 'История' },
  ]

  const actions: { icon: LucideIcon; label: string; run: () => void }[] = [
    { icon: Send, label: 'Перевести', run: () => setScreen('payments') },
    { icon: Plus, label: 'Пополнить', run: () => gotoSection('deposit') },
    { icon: QrCode, label: 'Оплатить', run: () => setScreen('payments') },
    { icon: History, label: 'История', run: () => setScreen('history') },
    { icon: PiggyBank, label: 'Вклад', run: () => gotoSection('deposit') },
    { icon: Landmark, label: 'Кредит', run: () => gotoSection('loan') },
  ]

  const stories: { label: string; ring: string; icon: LucideIcon; color: string; run: () => void }[] = [
    { label: 'Курьеры', ring: 'conic-gradient(#F59E0B,#FBBF24,#F59E0B)', icon: ShieldAlert, color: '#D97706', run: () => pushToast('Осторожно, курьер!', 'Курьер может подменить товар при доставке — в таких случаях работает страховка сделки.') },
    { label: 'Копилка', ring: 'conic-gradient(#10B3A0,#2DD4BF,#10B3A0)', icon: PiggyBank, color: '#0C8A7B', run: () => gotoSection('deposit') },
    { label: 'Кредит', ring: 'conic-gradient(#5C6B7E,#94A3B8,#5C6B7E)', icon: Landmark, color: '#475569', run: () => gotoSection('loan') },
    { label: 'Налоги', ring: 'conic-gradient(#3F74E0,#6C9BF5,#3F74E0)', icon: Receipt, color: '#3F74E0', run: () => openApp('taxes') },
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
    <div className="flex h-full flex-col bg-[#F2F4F7] text-neutral-900">
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="space-y-4 p-4">
            <div className="h-56 rounded-b-[26px] bg-white/70 animate-pulse" />
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
                {/* ── Зелёный градиентный хедер ── */}
                <div
                  className="px-4 pb-10 pt-3.5"
                  style={{ background: `linear-gradient(165deg,#31BB4F 0%,#1FA243 46%,${GREEN_DARK} 100%)` }}
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
                        className="h-10 w-full rounded-full border border-white/25 bg-white/15 pl-9 pr-3 text-sm text-white outline-none backdrop-blur-sm transition placeholder:text-white/65 focus:border-white/50 focus:bg-white/25"
                      />
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

                  {/* приветствие + курсы */}
                  <div className="mt-4" suppressHydrationWarning>
                    <h1 className="text-[26px] font-bold leading-tight tracking-tight text-white">
                      {greeting()}, {firstName}
                    </h1>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20">
                        $ {rates.usd}
                        {rates.usdUp ? <ArrowUpRight className="size-3.5 text-[#B7F5C6]" /> : <ArrowDownRight className="size-3.5 text-[#FFD3D3]" />}
                      </span>
                      <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20">
                        € {rates.eur}
                        {rates.eurUp ? <ArrowUpRight className="size-3.5 text-[#B7F5C6]" /> : <ArrowDownRight className="size-3.5 text-[#FFD3D3]" />}
                      </span>
                    </div>
                  </div>

                  {/* круглые действия */}
                  <div className="mt-5 grid grid-cols-3 gap-y-3.5">
                    {actions.map((a) => (
                      <ActionCircle key={a.label} icon={a.icon} label={a.label} onClick={a.run} />
                    ))}
                  </div>
                </div>

                {/* ── Контент поверх хедера ── */}
                <div className="relative -mt-6 space-y-3 px-3 pb-2">
                  <WalletCarousel
                    data={data}
                    animatedBalance={animatedBalance}
                    holderName={holderName}
                    maskedCard={maskedCard}
                    onDeposit={() => gotoSection('deposit')}
                    onWithdraw={() => gotoSection('deposit')}
                    onLoan={() => gotoSection('loan')}
                    onRepay={() => gotoSection('loan')}
                  />

                  {/* сторис */}
                  <div className="flex justify-between gap-1 px-1.5">
                    {stories.map((s) => (
                      <button key={s.label} type="button" onClick={s.run} className="group flex w-16 flex-col items-center gap-1.5">
                        <span className="flex size-[54px] items-center justify-center rounded-full p-[2.5px] transition group-active:scale-95" style={{ background: s.ring }} aria-hidden="true">
                          <span className="flex size-full items-center justify-center rounded-full bg-white">
                            <s.icon className="size-5" style={{ color: s.color }} strokeWidth={2.1} />
                          </span>
                        </span>
                        <span className="text-[10.5px] font-medium leading-tight text-neutral-700">{s.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* совет дня (ротация) */}
                  {!tipClosed && (
                    <section className="relative rounded-2xl bg-[#FFF7E6] p-3.5 ring-1 ring-amber-200/80">
                      <button
                        type="button"
                        aria-label="Закрыть совет"
                        onClick={() => setTipClosed(true)}
                        className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full text-amber-500/70 transition hover:bg-amber-100 hover:text-amber-700"
                      >
                        <X className="size-3.5" />
                      </button>
                      <div className="flex gap-3 pr-6">
                        <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-500" />
                        <div>
                          <div className="text-[13.5px] font-semibold text-amber-800">{TIPS[tipIdx].title}</div>
                          <p className="mt-0.5 text-[12.5px] leading-snug text-amber-900/70">{TIPS[tipIdx].body}</p>
                        </div>
                      </div>
                    </section>
                  )}

                  {formError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                      {formError}
                    </div>
                  )}

                  {/* операции */}
                  <section className={`${CARD_CLS} px-4 py-3.5`}>
                    <div className="flex items-center justify-between">
                      <div className="text-[15px] font-semibold text-neutral-900">Операции</div>
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

                  {/* аккордеоны */}
                  <div className="space-y-2.5">
                    <Section
                      title="Вклады и счета"
                      open={openSection === 'deposit'}
                      onToggle={() => setOpenSection((s) => (s === 'deposit' ? null : 'deposit'))}
                    >
                      <div className="rounded-xl bg-[#EAF8F1] p-3.5 ring-1 ring-[#21A038]/15">
                        <div className="text-xs text-neutral-500">На вкладе</div>
                        <div className="text-2xl font-bold text-[#12842F]">{fmtMoney(data.deposit)}</div>
                        <div className="mt-0.5 text-[11px] text-neutral-500">
                          {String(DEPOSIT_RATE_PER_HOUR * 100).replace('.', ',')}% в час · начисление ежечасно
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                        Деньги на вкладе не тратятся на покупки — снимите их, когда соберётесь на закупку.
                      </p>
                      <div className="mt-3">
                        <div className="text-xs text-neutral-500">Сумма</div>
                        <Input
                          className="mt-1.5 h-11 rounded-xl border-neutral-200 bg-white text-base font-semibold text-neutral-900 placeholder:text-neutral-300"
                          inputMode="numeric"
                          value={depositInput}
                          placeholder="0"
                          onChange={(e) => setDepositInput(e.target.value)}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
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
                          disabled={busy || toAmount(depositInput) <= 0}
                          onClick={() => applyMutation(() => api.depositOp(toAmount(depositInput), 'withdraw'))}
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : 'Снять'}
                        </Button>
                      </div>
                    </Section>

                    <Section
                      title="Безопасность"
                      open={openSection === 'security'}
                      onToggle={() => setOpenSection((s) => (s === 'security' ? null : 'security'))}
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
                          <BellRing className="size-4.5 text-[#21A038]" />
                          <div>
                            <div className="text-sm font-medium text-neutral-900">Уведомления об операциях</div>
                            <div className="text-[11px] text-neutral-400">Пуш после каждой операции</div>
                          </div>
                        </div>
                        <Switch checked={opsNotifOn} onCheckedChange={setOpsNotifOn} className="data-[state=checked]:bg-[#21A038] data-[state=unchecked]:bg-neutral-200" />
                      </div>
                      <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
                        <div className="flex items-center gap-2.5">
                          <Gauge className="size-4.5 text-[#21A038]" />
                          <div>
                            <div className="text-sm font-medium text-neutral-900">Рейтинг: {score}</div>
                            <div className="text-[11px] text-neutral-400">Влияет на лимит и ставку</div>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold ${credit.cls}`}>{credit.label}</span>
                      </div>
                    </Section>

                    <Section
                      title="Кредиты"
                      open={openSection === 'loan'}
                      onToggle={() => setOpenSection((s) => (s === 'loan' ? null : 'loan'))}
                    >
                      <div className="mb-3 flex items-center justify-between rounded-xl bg-neutral-100 px-3.5 py-2.5 text-xs">
                        <span className="text-neutral-500">Лимит</span>
                        <span className="font-semibold text-neutral-900">{fmtMoney(data.loanLimit)}</span>
                        <span className="text-neutral-500">Ставка</span>
                        <span className="font-semibold text-neutral-900">{data.creditRate ?? 15}%</span>
                      </div>

                      {data.activeLoan ? (
                        <>
                          <div className="rounded-xl bg-red-50 p-3.5 ring-1 ring-red-200">
                            <div className="text-xs text-red-500/80">Остаток долга</div>
                            <div className="text-2xl font-bold text-red-600">{fmtMoney(data.activeLoan.owed)}</div>
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
                          <div className="mt-3">
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
                          <div className="rounded-xl bg-[#EAF8F1] p-3.5 ring-1 ring-[#21A038]/15">
                            <div className="text-xs text-neutral-500">Сумма кредита</div>
                            <div className="text-2xl font-bold text-[#12842F]">{fmtMoney(loanAmount)}</div>
                          </div>
                          <div className="mt-3">
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
                          <Button
                            className="mt-4 h-11 w-full rounded-xl text-sm font-semibold text-white"
                            style={{ backgroundColor: GREEN }}
                            disabled={busy || data.loanLimit < 1000 || loanAmount < 1000}
                            onClick={() => applyMutation(() => api.takeLoan(loanAmount))}
                          >
                            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Взять кредит'}
                          </Button>
                          <p className="mt-2 text-center text-[11px] leading-relaxed text-neutral-400">
                            Срок 7 дней. Погашение вовремя повышает рейтинг (+40), просрочка роняет его (−80).
                          </p>
                        </>
                      )}
                    </Section>
                  </div>

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
                          <span className="text-sm font-semibold text-neutral-900">{monthNom}</span>
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

      {/* Нижняя навигация */}
      <nav className="shrink-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
        <div className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {nav.map((n) => {
            const active = screen === n.key
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setScreen(n.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 transition ${
                  active ? 'text-[#21A038]' : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                <n.icon className="size-[22px]" strokeWidth={active ? 2.3 : 2} />
                <span className="text-[10px] font-semibold">{n.label}</span>
                <span className={`h-1 w-1 rounded-full transition ${active ? 'bg-[#21A038]' : 'bg-transparent'}`} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
