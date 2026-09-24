'use client'

// Приложение «Банк» — тёмный банковский редизайн (градиент, круглые действия,
// кошелёк с картой, аккордеоны, нижняя навигация, экран «Анализ»).
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight, ArrowLeftRight, ArrowUpRight, Bell, BellRing, Building2, Car, ChevronDown,
  ChevronRight, CreditCard, FileDown, Gauge, History, Home, Info, Landmark, Lightbulb, Loader2,
  PieChart, PiggyBank, Plus, QrCode, Receipt, Search, Send, ShieldCheck, Smartphone, Wifi, X,
  type LucideIcon,
} from 'lucide-react'
import { api, ApiError, exportCsvUrl } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { TX_TYPE_LABEL } from '@/lib/types'
import type { BankData, SessionUser, TransactionDTO } from '@/lib/types'
import { creditLabel, DEPOSIT_RATE_PER_HOUR } from '@/lib/economy'
import { useCountUp } from '@/lib/use-count-up'
import { playSound } from '@/lib/sounds'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

type Screen = 'main' | 'payments' | 'analytics' | 'history'
type SectionKey = 'deposit' | 'security' | 'loan'

const GREEN = '#21A038'
const GREEN_SOFT = '#5FD989'

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

const TIPS: { title: string; body: string }[] = [
  { title: 'Осторожно, курьер!', body: 'Курьер может подменить товар при доставке — в таких случаях работает страховка сделки.' },
  { title: 'Считайте профит', body: 'Не берите кредит на лот без профита — ставка съест всю маржу с перепродажи.' },
  { title: 'Налоги не ждут', body: 'Налоги лучше платить вовремя — за просрочку начисляется пеня 10% в сутки.' },
]

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
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

const CAT_META: Record<string, { label: string; color: string }> = {
  purchase: { label: 'Покупки', color: '#F87171' },
  sale: { label: 'Продажи', color: '#34D399' },
  loan: { label: 'Кредиты', color: '#60A5FA' },
  repay: { label: 'Погашение кредита', color: '#818CF8' },
  tax: { label: 'Налоги', color: '#FBBF24' },
  penalty: { label: 'Пени налоговой', color: '#FB923C' },
  deposit: { label: 'Пополнение вклада', color: '#2DD4BF' },
  withdraw: { label: 'Снятие вклада', color: '#38BDF8' },
  interest: { label: 'Проценты по вкладу', color: '#4ADE80' },
  boost: { label: 'Продвижение', color: '#E879F9' },
  transfer: { label: 'Переводы людям', color: '#22D3EE' },
}
const FALLBACK_COLORS = ['#22D3EE', '#A3E635', '#F472B6', '#FACC15', '#94A3B8', '#C084FC']

function catFor(t: TransactionDTO): { label: string; color: string } {
  const meta = CAT_META[t.type]
  if (meta) return meta
  const word = (t.note ?? '').trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}%-]/gu, '') || t.type
  let h = 0
  for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0
  const label = word.charAt(0).toUpperCase() + word.slice(1)
  return { label, color: FALLBACK_COLORS[h % FALLBACK_COLORS.length] }
}

function buildCats(txs: TransactionDTO[], mode: 'out' | 'in'): AggCat[] {
  const map = new Map<string, AggCat>()
  for (const t of txs) {
    if (mode === 'out' ? t.amount >= 0 : t.amount <= 0) continue
    const { label, color } = catFor(t)
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

// ---- Локальные UI-примитивы ----
function Section({ title, open, onToggle, children }: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-[#141e17] ring-1 ring-white/5">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3.5 text-left transition active:bg-white/5">
        <span className="text-sm font-semibold text-white">{title}</span>
        <ChevronDown className={`size-4 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-white/5 px-4 py-4">{children}</div>}
    </div>
  )
}

function ActionCircle({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-2">
      <span className="flex size-16 items-center justify-center rounded-full border border-emerald-300/10 bg-[#182f20] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition group-active:scale-95">
        <Icon className="size-5 text-[#6FD98A]" />
      </span>
      <span className="text-[11px] font-medium text-white/60">{label}</span>
    </button>
  )
}

function TxRow({ t }: { t: TransactionDTO }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{TX_TYPE_LABEL[t.type] ?? t.type}</div>
        <div className="truncate text-[11px] text-white/40">
          {t.counterpartyName ?? t.note ?? '—'} · {timeAgo(t.createdAt)}
        </div>
      </div>
      <div className={`shrink-0 text-sm font-semibold tabular-nums ${t.amount >= 0 ? 'text-[#4CCB63]' : 'text-red-400'}`}>
        {t.amount >= 0 ? '+' : ''}
        {fmtMoney(t.amount)}
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
      playSound('cash')
      await load()
    } catch (e) {
      playSound('error')
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

  const services: { icon: LucideIcon; label: string; sub: string; color: string; run?: () => void }[] = [
    { icon: Smartphone, label: 'Мобильная связь', sub: 'Сим-карты и связь', color: '#34D399' },
    { icon: Wifi, label: 'Интернет', sub: 'Провайдеры', color: '#60A5FA' },
    { icon: Building2, label: 'ЖКХ', sub: 'Квартплата', color: '#FBBF24' },
    { icon: Receipt, label: 'Налоги', sub: 'Налоговая', color: '#F87171', run: () => openApp('taxes') },
    { icon: Car, label: 'Штрафы', sub: 'Транспорт', color: '#94A3B8' },
    { icon: Send, label: 'Переводы', sub: 'Людям по имени', color: '#E879F9' },
  ]

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#132b1d_0%,#0f1712_42%,#0b120e_100%)] text-white">
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="space-y-4 p-4">
            <div className="h-24 rounded-3xl bg-white/5 animate-pulse" />
            <div className="flex justify-between">
              {[0, 1, 2].map((i) => (
                <div key={i} className="size-16 rounded-full bg-white/5 animate-pulse" />
              ))}
            </div>
            <div className="h-40 rounded-3xl bg-white/5 animate-pulse" />
            <div className="h-14 rounded-2xl bg-white/5 animate-pulse" />
            <div className="flex items-center justify-center gap-2 text-sm text-white/40">
              <Loader2 className="size-4 animate-spin" /> Загрузка банка…
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4">
            <div className="rounded-2xl bg-[#2a1416] p-6 text-center ring-1 ring-red-500/20">
              <p className="text-sm font-medium text-red-300">{error}</p>
              <Button className="mt-4 rounded-xl text-white" style={{ backgroundColor: GREEN }} onClick={load}>
                Повторить
              </Button>
            </div>
          </div>
        ) : data ? (
          <div key={screen} className="screen-enter space-y-4 p-4 pb-2">
            {/* ===== ГЛАВНЫЙ ===== */}
            {screen === 'main' && (
              <>
                {/* Шапка: аватар / поиск / колокольчик */}
                <div className="flex items-center gap-3">
                  <Avatar className="size-9 shrink-0 ring-1 ring-white/10">
                    {session?.photoUrl && <AvatarImage src={session.photoUrl} alt={holderName} />}
                    <AvatarFallback className="bg-[#1f3a29] text-xs font-semibold text-[#7FDB96]">
                      {firstName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                    <input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      onFocus={() => setSearchFocus(true)}
                      onBlur={() => setSearchFocus(false)}
                      placeholder="Поиск по приложению"
                      aria-label="Поиск по приложению"
                      className="h-10 w-full rounded-full border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[#21A038]/60"
                    />
                    {searchFocus && searchFound.length > 0 && (
                      <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#101a14] shadow-xl shadow-black/40">
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
                            className="block w-full px-3.5 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
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
                    className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/70 transition active:scale-95"
                  >
                    <Bell className="size-4.5" />
                    <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-[#2FBE51]" />
                  </button>
                </div>

                {/* Приветствие + курсы */}
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{firstName},</h1>
                  <div className="mt-1 flex items-center gap-4 text-[13px] text-white/50">
                    <span className="flex items-center gap-1">
                      Курс евро: € {rates.eur}
                      {rates.eurUp ? (
                        <ArrowUpRight className="size-3.5 text-[#4CCB63]" />
                      ) : (
                        <ArrowDownRight className="size-3.5 text-red-400" />
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      $ {rates.usd}
                      {rates.usdUp ? (
                        <ArrowUpRight className="size-3.5 text-[#4CCB63]" />
                      ) : (
                        <ArrowDownRight className="size-3.5 text-red-400" />
                      )}
                    </span>
                  </div>
                </div>

                {/* Круглые кнопки-действия */}
                <div className="grid grid-cols-3 gap-y-4 rounded-3xl bg-[#141e17]/60 py-4 ring-1 ring-white/5">
                  {actions.map((a) => (
                    <ActionCircle key={a.label} icon={a.icon} label={a.label} onClick={a.run} />
                  ))}
                </div>

                {/* Кошелёк */}
                <section className="rounded-3xl bg-[#16211a] p-4 ring-1 ring-white/5">
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold">Кошелёк</div>
                    <button
                      type="button"
                      aria-label="Пополнить"
                      onClick={() => gotoSection('deposit')}
                      className="flex size-8 items-center justify-center rounded-full bg-[#21A038]/15 text-[#4CCB63] transition active:scale-95"
                    >
                      <Plus className="size-4.5" />
                    </button>
                  </div>
                  <div className="relative mt-3 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#22382b_0%,#13221a_55%,#0e1811_100%)] p-4 ring-1 ring-white/10">
                    <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/5" />
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <div className="h-6 w-9 rounded-[5px] bg-gradient-to-br from-yellow-200 via-yellow-400 to-yellow-600 shadow-inner" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
                          Столичный Банк
                        </span>
                      </div>
                      <div className="mt-4 flex items-center gap-2 font-mono text-base tracking-[0.14em] text-white/85">
                        <CreditCard className="size-4 text-white/35" />
                        {maskedCard}
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-widest text-white/40">Держатель</div>
                          <div className="truncate text-xs font-semibold uppercase text-white/80">{holderName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-widest text-white/40">Баланс</div>
                          <div className="text-2xl font-bold tabular-nums text-white">{fmtMoney(animatedBalance)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-white/35">Вклад не застрахован — это игра</span>
                    <button
                      type="button"
                      onClick={() => pushToast('Кошелёк', 'Пока доступна одна карта')}
                      className="flex items-center gap-0.5 text-xs font-semibold text-[#4CCB63] transition active:opacity-70"
                    >
                      Все карты
                      <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                </section>

                {/* Совет дня (ротация) */}
                {!tipClosed && (
                  <section className="relative rounded-2xl bg-[linear-gradient(135deg,#2b2410_0%,#1c170a_100%)] p-4 ring-1 ring-amber-300/15">
                    <button
                      type="button"
                      aria-label="Закрыть совет"
                      onClick={() => setTipClosed(true)}
                      className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full text-white/35 transition hover:bg-white/5 hover:text-white/70"
                    >
                      <X className="size-3.5" />
                    </button>
                    <div className="flex gap-3 pr-6">
                      <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-300" />
                      <div>
                        <div className="text-sm font-semibold text-amber-200">{TIPS[tipIdx].title}</div>
                        <p className="mt-0.5 text-[13px] leading-snug text-white/65">{TIPS[tipIdx].body}</p>
                      </div>
                    </div>
                  </section>
                )}

                {formError && (
                  <div className="rounded-xl border border-red-500/20 bg-[#2a1416] px-3 py-2 text-xs text-red-300">
                    {formError}
                  </div>
                )}

                {/* Аккордеоны */}
                <div className="space-y-3">
                  <Section
                    title="Вклады и счета"
                    open={openSection === 'deposit'}
                    onToggle={() => setOpenSection((s) => (s === 'deposit' ? null : 'deposit'))}
                  >
                    <div className="rounded-xl bg-[#14251a] p-3.5 ring-1 ring-emerald-400/10">
                      <div className="text-xs text-white/45">На вкладе</div>
                      <div className="text-2xl font-bold text-[#5FD989]">{fmtMoney(data.deposit)}</div>
                      <div className="mt-0.5 text-[11px] text-white/35">
                        {String(DEPOSIT_RATE_PER_HOUR * 100).replace('.', ',')}% в час · начисление ежечасно
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-white/45">
                      Деньги на вкладе не тратятся на покупки — снимите их, когда соберётесь на закупку.
                    </p>
                    <div className="mt-3">
                      <div className="text-xs text-white/45">Сумма</div>
                      <Input
                        className="mt-1.5 h-11 rounded-xl border-white/10 bg-black/25 text-base font-semibold text-white placeholder:text-white/30"
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
                        className="h-11 rounded-xl border-white/10 bg-white/5 text-sm font-semibold text-[#5FD989] hover:bg-white/10 hover:text-[#5FD989]"
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
                        <ShieldCheck className="size-4.5 text-[#6FD98A]" />
                        <div>
                          <div className="text-sm font-medium text-white">Вход по пину</div>
                          <div className="text-[11px] text-white/35">Код при входе в банк</div>
                        </div>
                      </div>
                      <Switch checked={pinOn} onCheckedChange={setPinOn} className="data-[state=checked]:bg-[#21A038] data-[state=unchecked]:bg-white/10" />
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-white/5 py-3">
                      <div className="flex items-center gap-2.5">
                        <BellRing className="size-4.5 text-[#6FD98A]" />
                        <div>
                          <div className="text-sm font-medium text-white">Уведомления об операциях</div>
                          <div className="text-[11px] text-white/35">Пуш после каждой операции</div>
                        </div>
                      </div>
                      <Switch checked={opsNotifOn} onCheckedChange={setOpsNotifOn} className="data-[state=checked]:bg-[#21A038] data-[state=unchecked]:bg-white/10" />
                    </div>
                    <div className="flex items-center justify-between border-t border-white/5 pt-3">
                      <div className="flex items-center gap-2.5">
                        <Gauge className="size-4.5 text-[#6FD98A]" />
                        <div>
                          <div className="text-sm font-medium text-white">Рейтинг: {score}</div>
                          <div className="text-[11px] text-white/35">Влияет на лимит и ставку</div>
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
                    <div className="mb-3 flex items-center justify-between rounded-xl bg-white/5 px-3.5 py-2.5 text-xs">
                      <span className="text-white/45">Лимит</span>
                      <span className="font-semibold text-white">{fmtMoney(data.loanLimit)}</span>
                      <span className="text-white/45">Ставка</span>
                      <span className="font-semibold text-white">{data.creditRate ?? 15}%</span>
                    </div>

                    {data.activeLoan ? (
                      <>
                        <div className="rounded-xl bg-[#2a1416] p-3.5 ring-1 ring-red-500/15">
                          <div className="text-xs text-red-300/70">Остаток долга</div>
                          <div className="text-2xl font-bold text-red-400">{fmtMoney(data.activeLoan.owed)}</div>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-white/45">
                          <div className="flex justify-between">
                            <span>Выдано</span>
                            <span className="font-medium text-white/75">{fmtMoney(data.activeLoan.principal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Ставка</span>
                            <span className="font-medium text-white/75">{data.activeLoan.rate}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Срок до</span>
                            <span className="font-medium text-white/75">
                              {new Date(data.activeLoan.dueAt).toLocaleString('ru-RU', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs text-white/45">Сумма погашения</div>
                          <Input
                            className="mt-1.5 h-11 rounded-xl border-white/10 bg-black/25 text-base font-semibold text-white placeholder:text-white/30"
                            inputMode="numeric"
                            value={repayAmount ? String(repayAmount) : ''}
                            placeholder="0"
                            onChange={(e) => setRepayAmount(Math.min(toAmount(e.target.value), data.activeLoan?.owed ?? 0))}
                          />
                          <Slider
                            className="mt-4 [&_[data-slot=slider-range]]:bg-[#21A038] [&_[data-slot=slider-thumb]]:border-[#21A038] [&_[data-slot=slider-thumb]]:bg-[#16211a] [&_[data-slot=slider-track]]:bg-white/10"
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
                        <div className="rounded-xl bg-[#14251a] p-3.5 ring-1 ring-emerald-400/10">
                          <div className="text-xs text-white/45">Сумма кредита</div>
                          <div className="text-2xl font-bold text-[#5FD989]">{fmtMoney(loanAmount)}</div>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs text-white/45">От 1 000 до {fmtMoney(Math.max(1000, data.loanLimit))}</div>
                          <Input
                            className="mt-1.5 h-11 rounded-xl border-white/10 bg-black/25 text-base font-semibold text-white placeholder:text-white/30"
                            inputMode="numeric"
                            value={loanAmount ? String(loanAmount) : ''}
                            placeholder="0"
                            onChange={(e) => setLoanAmount(Math.min(toAmount(e.target.value), Math.max(1000, data.loanLimit)))}
                          />
                          <Slider
                            className="mt-4 [&_[data-slot=slider-range]]:bg-[#21A038] [&_[data-slot=slider-thumb]]:border-[#21A038] [&_[data-slot=slider-thumb]]:bg-[#16211a] [&_[data-slot=slider-track]]:bg-white/10"
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
                        <p className="mt-2 text-center text-[11px] leading-relaxed text-white/35">
                          Срок 7 дней. Погашение вовремя повышает рейтинг (+40), просрочка роняет его (−80).
                        </p>
                      </>
                    )}
                  </Section>
                </div>

                {/* Последние операции */}
                <section className="rounded-2xl bg-[#141e17] p-4 ring-1 ring-white/5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Последние операции</div>
                    <button className="text-xs font-medium text-[#4CCB63]" onClick={() => setScreen('history')}>
                      Вся история
                    </button>
                  </div>
                  {data.transactions.length === 0 ? (
                    <p className="mt-3 text-xs text-white/40">Операций пока нет — купите или продайте что-нибудь.</p>
                  ) : (
                    <div className="mt-1 divide-y divide-white/5">
                      {data.transactions.slice(0, 3).map((t) => (
                        <TxRow key={t.id} t={t} />
                      ))}
                    </div>
                  )}
                </section>

                <div className="pb-1 pt-1 text-center text-[10px] text-white/25">
                  Столичный Банк · вклады не застрахованы, это игра
                </div>
              </>
            )}

            {/* ===== ПЛАТЕЖИ ===== */}
            {screen === 'payments' && (
              <>
                <h1 className="text-xl font-bold tracking-tight">Платежи</h1>
                <p className="-mt-2 text-xs text-white/40">Услуги и переводы — выберите категорию</p>
                <div className="grid grid-cols-2 gap-3">
                  {services.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        if (s.run) s.run()
                        else pushToast('Платежи', 'Раздел скоро появится')
                      }}
                      className="rounded-2xl bg-[#141e17] p-4 text-left ring-1 ring-white/5 transition active:scale-[0.98]"
                    >
                      <span
                        className="flex size-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${s.color}22`, color: s.color }}
                      >
                        <s.icon className="size-5" />
                      </span>
                      <div className="mt-3 text-sm font-medium text-white">{s.label}</div>
                      <div className="text-[11px] text-white/35">{s.sub}</div>
                    </button>
                  ))}
                </div>
                <div className="rounded-2xl bg-[#141e17] p-4 text-[11px] leading-relaxed text-white/40 ring-1 ring-white/5">
                  Переводы людям — из чата сделки: напишите продавцу и оплатите счёт, операция появится в истории банка.
                </div>
              </>
            )}

            {/* ===== АНАЛИЗ ===== */}
            {screen === 'analytics' && (
              <>
                <h1 className="text-xl font-bold tracking-tight">Анализ финансов</h1>

                <div className="flex rounded-full bg-white/5 p-1">
                  {(['out', 'in'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAnalyticsMode(m)}
                      className={`flex-1 rounded-full py-1.5 text-xs font-medium transition ${
                        analyticsMode === m ? 'bg-[#21A038] text-white shadow' : 'text-white/50 hover:text-white/80'
                      }`}
                    >
                      {m === 'out' ? 'Расходы' : 'Зачисления'}
                    </button>
                  ))}
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums tracking-tight text-white">{fmtMoney(catsTotal)}</div>
                  <div className="mt-0.5 text-xs text-white/40">
                    {analyticsMode === 'out' ? 'Расход' : 'Зачисление'} в {monthPrep} · по последним операциям
                  </div>
                </div>

                {catsTotal <= 0 ? (
                  <div className="flex flex-col items-center rounded-2xl bg-[#141e17] p-8 text-center ring-1 ring-white/5">
                    <Info className="size-6 text-white/25" />
                    <p className="mt-2 text-sm text-white/50">Операций пока нет</p>
                    <p className="mt-1 text-xs text-white/30">Совершите покупки или продажи — аналитика появится здесь</p>
                  </div>
                ) : (
                  <>
                    {/* Донат */}
                    <div className="flex justify-center">
                      <div className="relative">
                        <svg viewBox="0 0 140 140" className="size-44" role="img" aria-label="Распределение по категориям">
                          <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={16} />
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
                          <span className="text-sm font-semibold text-white">{monthNom}</span>
                          <span className="text-[11px] text-white/40">
                            {catsOps} {plural(catsOps, 'операция', 'операции', 'операций')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Категории */}
                    <div className="divide-y divide-white/5 rounded-2xl bg-[#141e17] px-4 ring-1 ring-white/5">
                      {cats.map((c) => (
                        <div key={c.key} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                              style={{ backgroundColor: `${c.color}22`, color: c.color }}
                            >
                              {c.label.charAt(0)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">{c.label}</div>
                              <div className="text-[11px] text-white/40">
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
              </>
            )}

            {/* ===== ИСТОРИЯ ===== */}
            {screen === 'history' && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-xl font-bold tracking-tight">История операций</h1>
                  {data.transactions.length > 0 && (
                    <a
                      href={exportCsvUrl()}
                      download
                      aria-label="Скачать историю операций в CSV"
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[#21A038]/15 px-3 text-[11px] font-semibold text-[#4CCB63] outline-none transition-colors hover:bg-[#21A038]/25 focus-visible:ring-2 focus-visible:ring-[#21A038]/40"
                    >
                      <FileDown className="size-3.5" aria-hidden="true" />
                      CSV
                    </a>
                  )}
                </div>
                {data.transactions.length === 0 ? (
                  <div className="rounded-2xl bg-[#141e17] p-6 text-center ring-1 ring-white/5">
                    <p className="text-sm text-white/50">Здесь появятся все ваши покупки, продажи и операции с банком.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 rounded-2xl bg-[#141e17] px-4 py-1 ring-1 ring-white/5">
                    {data.transactions.map((t) => (
                      <TxRow key={t.id} t={t} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Нижняя навигация */}
      <nav className="shrink-0 border-t border-white/5 bg-[#0b120e]/95 backdrop-blur">
        <div className="grid grid-cols-4">
          {nav.map((n) => {
            const active = screen === n.key
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setScreen(n.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 transition ${
                  active ? 'text-[#2FBE51]' : 'text-white/40 hover:text-white/70'
                }`}
              >
                <n.icon className="size-5" />
                <span className="text-[10px] font-medium">{n.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
