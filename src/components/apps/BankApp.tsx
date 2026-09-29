'use client'

// Приложение «Банк». Верх главного экрана (шапка с аватаром, поиском и QR,
// приветствие по времени суток, 5 круглых действий с градиентными кольцами,
// карусель карт с розово-малиновым волнистым артом и точки-страницы) вернул
// тёмно-зелёный дизайн старого макета по скриншоту пользователя; контент ниже
// (последние операции, промо вклада, безопасность) перекрашен в ту же палитру.
// Вкладки Платежи / История / Аналитика и внутренние экраны (Перевод,
// Кредитный центр) остаются в светлой системе макета 08-bank.png.
//
// Вся бизнес-логика сохранена 1:1: api.bank, api.takeLoan, api.repayLoan,
// api.loanHistory, api.depositOp; мастер кредита (оффер → анкета → договор →
// подписание кодом → успех), обслуживание активного кредита со слайдером,
// вклад «Копилка» (пополнение/снятие), CSV-экспорт истории, prefs-переключатели
// безопасности (пин, пуши операций) и кредитный рейтинг.
//
// Цвета заданы произвольными hex-классами, которые глобальный маппинг
// .theme-dark не переписывает: тёмный главный экран выглядит одинаково в любой теме ОС.
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowLeftRight, BadgeCheck, BarChart3, Building2,
  CalendarDays, Car, Check, ChevronLeft, ChevronRight, Clock, CreditCard, FileDown, FileText,
  Gavel, Home, Info, Landmark, Loader2, Mic, PenLine, PiggyBank, PieChart, QrCode, Receipt,
  Search, Send, ShieldCheck, ShoppingBag, Smartphone, Sprout, Truck, Wifi, X, type LucideIcon,
} from 'lucide-react'
import { api, ApiError, exportCsvUrl } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, fmtNum } from '@/lib/format'
import { TX_TYPE_LABEL } from '@/lib/types'
import type { BankData, LoanHistoryItem, SessionUser, TransactionDTO } from '@/lib/types'
import { DEBT_BLOCK_LIMIT, DEPOSIT_RATE_PER_HOUR, LOAN_TERM_OPTIONS, cardNumberFor, creditLabel } from '@/lib/economy'
import { useCountUp } from '@/lib/use-count-up'
import { usePrefs } from '@/lib/prefs'
import { Slider } from '@/components/ui/slider'
import { sound } from '@/lib/sound'
import {
  CAPS, CAPS_DARK, CARD_CLS, DARK_CARD, GREEN, CategoryRow, Chip, CreditHistorySection, DarkTxRow,
  Donut, InfoRow, LoanStatusChip, Numpad, PageDots, RoundAction, ScoreGauge, Segment, ServiceTile,
  Sheet, SheetTile, Toggle, TxRow, WaveCard, buildCats, fmtDayMonth, mergeTxs, plural,
  RING_AMBER, RING_GREEN, RING_ROSE, RING_TEAL, RING_VIOLET,
} from '@/components/apps/bank/parts'

type Screen = 'main' | 'payments' | 'history' | 'analytics' | 'transfer' | 'credit'
type SheetKey = 'qr' | null
type TransferDest = 'deposit' | 'loan'
type HistFilter = 'all' | 'in' | 'out'

// Шаги мастера оформления кредита (0 — калькулятор, 4 — успех после подписания)
type CreditStep = 0 | 1 | 2 | 3 | 4
const CREDIT_STEP_LABELS = ['Параметры', 'Анкета', 'Договор', 'Подписание', 'Готово']

// Цели кредита (для анкеты и договора)
const LOAN_PURPOSES = ['Покупка товара', 'Ремонт', 'Бизнес', 'Другое']

const MONTH_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

// Короткий хеш строки: маски паспорта/телефона и № договора заёмщика
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// К возврату: тело + проценты (простые, за весь срок, как в договоре)
function owedFor(amount: number, rate: number): number {
  return Math.round(amount * (1 + rate / 100))
}

export default function BankApp() {
  const session = useOS((s) => s.session)
  const openApp = useOS((s) => s.openApp)
  const pushToast = useOS((s) => s.pushToast)
  const setDarkChrome = useOS((s) => s.setDarkChrome)
  const [data, setData] = useState<BankData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('main')
  // Вкладка «Главная» тёмная: статус-бар ОС переключается на белые иконки
  useEffect(() => {
    if (screen === 'main') {
      setDarkChrome(true)
      return () => { useOS.getState().setDarkChrome(false) }
    }
    setDarkChrome(false)
    return undefined
  }, [screen, setDarkChrome])
  const [sheet, setSheet] = useState<SheetKey>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // ===== Кредитный центр =====
  const [cwStep, setCwStep] = useState<CreditStep>(0)
  const [loanAmount, setLoanAmount] = useState(5000)
  const [loanDays, setLoanDays] = useState(7)
  const [loanPurpose, setLoanPurpose] = useState(LOAN_PURPOSES[0])
  const [agree, setAgree] = useState(false)
  const [signCode, setSignCode] = useState('')
  const [sentCode, setSentCode] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  // Снимок выданного кредита для экрана успеха
  const [issued, setIssued] = useState<{ amount: number; days: number; rate: number; owed: number; dueAt: string; contractNo: string } | null>(null)
  // Кредитная история (/api/bank/loans), лениво при первом открытии кредитного центра
  const [loanHistory, setLoanHistory] = useState<LoanHistoryItem[] | null>(null)
  const [repayAmount, setRepayAmount] = useState(0)
  // ===== Перевод (вклад / погашение кредита) с клавиатурой =====
  const [transferDest, setTransferDest] = useState<TransferDest>('deposit')
  const [amountStr, setAmountStr] = useState('')
  // ===== История =====
  const [histFilter, setHistFilter] = useState<HistFilter>('all')
  const [histSearch, setHistSearch] = useState(false)
  const [histQ, setHistQ] = useState('')
  // ===== Аналитика =====
  const [analyticsMode, setAnalyticsMode] = useState<'out' | 'in'>('out')
  const [monthIdx, setMonthIdx] = useState(0)
  // ===== Главный экран =====
  const [cardSlide, setCardSlide] = useState(0)
  const [balanceHidden, setBalanceHidden] = useState(false)
  // Переключатели безопасности — глобальный prefs-стор (zustand + localStorage)
  const pinOn = usePrefs((s) => s.bankPin)
  const opsNotifOn = usePrefs((s) => s.bankOpsNotif)
  const setPref = usePrefs((s) => s.setPref)
  // Плавный «счётчик денег» в блоке баланса
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

  // При смене экрана скроллим контент в начало
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [screen])

  // ===== Кредитный центр: переходы =====
  // Откуда пришли (главная/платежи/QR-лист), чтобы «Назад» вернул на место
  const creditReturnRef = useRef<Screen>('main')
  const openCredit = () => {
    creditReturnRef.current = screen === 'credit' ? creditReturnRef.current : screen
    setCwStep(0)
    setAgree(false)
    setSignCode('')
    setSignError(null)
    setIssued(null)
    // сумма не выходит за актуальный лимит
    const limit = Math.max(1000, data?.loanLimit ?? 5000)
    setLoanAmount((a) => Math.min(Math.max(a, 1000), limit))
    setScreen('credit')
  }

  // Код подписания: «SMS» от банка прилетает системным пушем (тост)
  const sendSignCode = useCallback(() => {
    const code = String(Math.floor(1000 + Math.random() * 9000))
    setSentCode(code)
    useOS.getState().pushToast('Банк', `Код подписания: ${code}`)
    sound.pop()
  }, [])

  // Подпись договора: проверяем код, «оформляем» и выдаём деньги
  const confirmSign = async () => {
    if (!data || signing) return
    if (!sentCode || signCode.trim() !== sentCode) {
      setSignError('Неверный код, проверьте уведомления')
      return
    }
    setSigning(true)
    setSignError(null)
    await new Promise((r) => setTimeout(r, 1300)) // «оформляем кредит…»
    try {
      const res = await api.takeLoan(loanAmount, loanDays)
      const os = useOS.getState()
      os.refreshSession({ balance: res.balance })
      setLoanHistory(null)
      await load()
      const curRate = Math.round((data.creditRate ?? 15) * (LOAN_TERM_OPTIONS.find((t) => t.days === loanDays)?.factor ?? 1))
      setIssued({
        amount: loanAmount,
        days: loanDays,
        rate: curRate,
        owed: owedFor(loanAmount, curRate),
        dueAt: new Date(Date.now() + loanDays * 86_400_000).toISOString(),
        contractNo,
      })
      setCwStep(4)
      sound.pop()
    } catch (e) {
      setSignError(e instanceof ApiError ? e.message : 'Не удалось оформить кредит')
    } finally {
      setSigning(false)
    }
  }

  // Подстраиваем сумму платежа под актуальные данные банка
  useEffect(() => {
    if (!data) return
    if (data.activeLoan) {
      setRepayAmount(Math.max(0, Math.round(data.activeLoan.owed)))
    }
  }, [data])

  // Кредитная история: догружаем при первом открытии кредитного центра
  useEffect(() => {
    if (screen !== 'credit' || loanHistory !== null) return
    let alive = true
    api.loanHistory()
      .then((d) => { if (alive) setLoanHistory(d.loans) })
      .catch(() => { if (alive) setLoanHistory([]) })
    return () => { alive = false }
  }, [screen, loanHistory])

  // ===== Общая мутация: вызов api + обновление глобальной сессии + тост =====
  const applyMutation = async (
    fn: () => Promise<{ ok: boolean; balance: number; debt?: number; deposit?: number }>,
    after?: () => void,
  ) => {
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
      sound.success()
      if (typeof res.debt === 'number') setLoanHistory(null) // статус договора в истории обновился
      await load()
      after?.()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Не удалось выполнить операцию')
    } finally {
      setBusy(false)
    }
  }

  // ===== Перевод: получатель, сумма с клавиатуры =====
  const transferReturnRef = useRef<Screen>('main')
  const openTransfer = (dest: TransferDest = 'deposit') => {
    transferReturnRef.current = screen === 'transfer' ? transferReturnRef.current : screen
    setTransferDest(dest)
    setAmountStr('')
    setFormError(null)
    setScreen('transfer')
  }

  const onNumpadKey = useCallback((k: 'digit' | 'back', v?: string) => {
    setFormError(null)
    if (k === 'back') {
      setAmountStr((s) => s.slice(0, -1))
      return
    }
    if (!v) return
    setAmountStr((s) => {
      if (v === '0') return s === '' ? '0' : (s + '0').slice(0, 8)
      return s === '0' ? v : (s + v).slice(0, 8)
    })
  }, [])

  const holderName = session?.displayName ?? 'Игрок'
  const firstName = holderName.split(' ')[0] ?? 'Игрок'
  const rate = String(DEPOSIT_RATE_PER_HOUR * 100).replace('.', ',')
  const allTxs = data?.transactions ?? []

  // ===== Производные значения кредитного центра =====
  const score = data?.creditScore ?? 500
  const credit = creditLabel(score)
  const baseRate = data?.creditRate ?? 15
  const rateForDays = (days: number) =>
    Math.round(baseRate * (LOAN_TERM_OPTIONS.find((t) => t.days === days)?.factor ?? 1))
  const curRate = rateForDays(loanDays)
  const curOwed = owedFor(loanAmount, curRate)
  const curDue = useMemo(() => new Date(Date.now() + loanDays * 86_400_000), [loanDays, data])
  // Паспорт/телефон/№ договора детерминированно из id игрока
  const idHash = useMemo(() => hashStr(session?.id ?? 'player'), [session?.id])
  const passportMask = `45 08 •• ${String(idHash % 10000).padStart(4, '0')}`
  const phoneMask = `+7 (9${(idHash >>> 7) % 10}) •••-••-${String((idHash >>> 3) % 100).padStart(2, '0')}`
  const contractNo = `СБ-${String(new Date().getFullYear()).slice(2)}-${String(100000 + (idHash % 900000))}`
  // Доход за 30 дней для анкеты заёмщика (все поступления)
  const income30 = useMemo(() => {
    const cut = Date.now() - 30 * 86_400_000
    return allTxs
      .filter((t) => t.amount > 0 && new Date(t.createdAt).getTime() >= cut)
      .reduce((s, t) => s + t.amount, 0)
  }, [allTxs])
  // Активный кредит: прогресс погашения и просрочка
  const activeLoan = data?.activeLoan ?? null
  const loanOverdue = activeLoan ? new Date(activeLoan.dueAt).getTime() < Date.now() : false
  const loanInitialOwed = activeLoan ? owedFor(activeLoan.principal, activeLoan.rate) : 0
  const loanPaid = activeLoan ? Math.min(loanInitialOwed, Math.max(0, loanInitialOwed - (data?.debt ?? 0))) : 0
  const loanPaidPct = loanInitialOwed > 0 ? Math.round((loanPaid / loanInitialOwed) * 100) : 0
  const loanDaysLeft = activeLoan
    ? Math.ceil((new Date(activeLoan.dueAt).getTime() - Date.now()) / 86_400_000)
    : 0
  // История платежей по текущему кредиту (частичные погашения)
  const repayTxs = useMemo(() => allTxs.filter((t) => t.type === 'repay').slice(0, 6), [allTxs])
  // Кредит недоступен, если лимит меньше минимума
  const creditAvailable = (data?.loanLimit ?? 0) >= 1000

  // ===== Карты (карусель на главном) =====
  const balanceShown = (v: number) => (balanceHidden ? '•••••' : fmtMoney(v))
  const cardLast4 = (data?.cardNumber ?? '0000 0000 0000 0000').split(' ').pop() ?? '0000'
  const creditLast4 = cardNumberFor(`${session?.id ?? 'player'}-credit`).split(' ').pop() ?? '0000'
  const depositLast4 = cardNumberFor(`${session?.id ?? 'player'}-deposit`).split(' ').pop() ?? '0000'

  const cards: {
    key: 'debit' | 'credit' | 'savings'
    badge: string
    label: string
    amount: string
    masked: string
    holder: string
    aria: string
    run: () => void
  }[] = data
    ? [
        {
          key: 'debit',
          badge: 'Дебетовая',
          label: 'Доступно',
          amount: balanceShown(animatedBalance),
          masked: `··• ${cardLast4}`,
          holder: holderName.toUpperCase(),
          aria: `Дебетовая карта, доступно ${fmtMoney(data.balance)}`,
          run: () => setScreen('history'),
        },
        {
          key: 'credit',
          badge: 'Кредитная',
          label: data.debt > 0 ? 'Задолженность' : 'Лимит',
          amount: balanceShown(data.debt > 0 ? data.debt : data.loanLimit),
          masked: `··• ${creditLast4}`,
          holder: `Лимит ${fmtMoney(data.loanLimit)}`.toUpperCase(),
          aria: 'Кредитная карта, открыть кредитный центр',
          run: () => openCredit(),
        },
        {
          key: 'savings',
          badge: 'Копилка',
          label: 'На счёте',
          amount: balanceShown(data.deposit),
          masked: `··• ${depositLast4}`,
          holder: holderName.toUpperCase(),
          aria: 'Накопительный счёт, пополнить или снять',
          run: () => openTransfer('deposit'),
        },
      ]
    : []

  const onCardsScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const max = el.scrollWidth - el.clientWidth
    setCardSlide(max <= 0 ? 0 : Math.round((el.scrollLeft / max) * Math.max(1, cards.length - 1)))
  }

  // 5 круглых действий главного экрана (как на скриншоте старого дизайна):
  // кольца сняты пипеткой со скриншота (зелёный, золото, розовый, бирюза, фиолет)
  const roundActions: { label: string; icon: LucideIcon; ring: string; run: () => void; aria: string }[] = [
    { label: 'Копилка', icon: PiggyBank, ring: RING_GREEN, run: () => openTransfer('deposit'), aria: 'Копилка: пополнить вклад или снять' },
    { label: 'Кредит', icon: Landmark, ring: RING_AMBER, run: () => openCredit(), aria: 'Кредитный центр' },
    { label: 'Налоги', icon: Receipt, ring: RING_ROSE, run: () => openApp('taxes'), aria: 'Оплатить налоги' },
    { label: 'Оплатить', icon: QrCode, ring: RING_TEAL, run: () => setScreen('payments'), aria: 'Платежи и услуги' },
    { label: 'Анализ', icon: PieChart, ring: RING_VIOLET, run: () => setScreen('analytics'), aria: 'Аналитика операций' },
  ]

  // Оценка кредитного рейтинга в тёмной палитре (credit.cls заточен под светлый фон)
  const creditDarkCls =
    score >= 750 ? 'text-[#4ADE80]' : score >= 620 ? 'text-[#86EFAC]' : score >= 480 ? 'text-[#FBBF24]' : 'text-[#F87171]'

  // Раздел «Платежи»: услуги и быстрые переходы (весь функционал бывшего листа «Ещё»)
  const services: { icon: LucideIcon; label: string; sub: string; color: string; run: () => void; aria: string }[] = [
    { icon: Smartphone, label: 'Мобильная связь', sub: 'Сим-карты и связь', color: GREEN, run: () => pushToast('Платежи', 'Раздел скоро появится'), aria: 'Мобильная связь' },
    { icon: Wifi, label: 'Интернет', sub: 'Провайдеры', color: '#12A594', run: () => pushToast('Платежи', 'Раздел скоро появится'), aria: 'Интернет' },
    { icon: Building2, label: 'ЖКХ', sub: 'Квартплата', color: '#F8A13A', run: () => pushToast('Платежи', 'Раздел скоро появится'), aria: 'ЖКХ' },
    { icon: Receipt, label: 'Налоги', sub: 'ФНС · оплата', color: '#E5584B', run: () => openApp('taxes'), aria: 'Оплатить налоги' },
    { icon: Car, label: 'Штрафы', sub: 'Транспорт', color: '#6B7280', run: () => pushToast('Платежи', 'Раздел скоро появится'), aria: 'Штрафы' },
    { icon: Send, label: 'Перевести', sub: 'Вклад или кредит', color: '#7B61FF', run: () => openTransfer('deposit'), aria: 'Перевод между счетами' },
    { icon: PiggyBank, label: 'Вклад «Копилка»', sub: `${rate}% в час`, color: GREEN, run: () => openTransfer('deposit'), aria: 'Накопительный счёт' },
    { icon: Landmark, label: 'Кредит', sub: data?.activeLoan ? 'Погасить кредит' : 'Взять кредит', color: '#F8A13A', run: () => openCredit(), aria: 'Кредитный центр' },
    { icon: QrCode, label: 'Оплата по QR', sub: 'Сканировать код', color: '#12A594', run: () => setSheet('qr'), aria: 'Оплата по QR-коду' },
    { icon: ShoppingBag, label: 'Сделки', sub: 'Покупки и продажи', color: GREEN, run: () => openApp('avito'), aria: 'Открыть Сделки' },
    { icon: Gavel, label: 'Аукцион', sub: 'Ставки и лоты', color: '#F8A13A', run: () => openApp('auction'), aria: 'Открыть Аукцион' },
    { icon: Truck, label: 'Доставка', sub: 'Посылки и ремонты', color: '#7B61FF', run: () => openApp('delivery'), aria: 'Открыть Доставку' },
  ]

  // ===== История: фильтры + поиск + группировка по дням =====
  const filteredTxs = useMemo(() => {
    let arr = allTxs
    if (histFilter === 'in') arr = arr.filter((t) => t.amount > 0)
    if (histFilter === 'out') arr = arr.filter((t) => t.amount < 0)
    const q = histQ.trim().toLowerCase()
    if (q) {
      arr = arr.filter((t) =>
        `${TX_TYPE_LABEL[t.type] ?? t.type} ${t.counterpartyName ?? ''} ${t.note ?? ''}`.toLowerCase().includes(q),
      )
    }
    return arr
  }, [allTxs, histFilter, histQ])

  const historyGroups = useMemo(() => {
    const arr: { label: string; items: TransactionDTO[] }[] = []
    const n = new Date()
    const todayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
    for (const t of filteredTxs) {
      const d = new Date(t.createdAt)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      const diff = Math.round((todayStart - start) / 86_400_000)
      const label = diff === 0 ? 'Сегодня' : diff === 1 ? 'Вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
      const last = arr[arr.length - 1]
      if (last && last.label === label) last.items.push(t)
      else arr.push({ label, items: [t] })
    }
    return arr
  }, [filteredTxs])

  // ===== Аналитика: месяцы из реальной истории, донат и категории =====
  const monthKeys = useMemo(() => {
    const set = new Set<string>()
    for (const t of data?.transactions ?? []) {
      const d = new Date(t.createdAt)
      set.add(`${d.getFullYear()}-${d.getMonth()}`)
    }
    return [...set].sort((a, b) => (a < b ? 1 : -1)) // свежий месяц первым
  }, [data])
  const activeIdx = Math.min(monthIdx, Math.max(0, monthKeys.length - 1))
  const activeKey = monthKeys[activeIdx]
  const monthLabel = useMemo(() => {
    if (!activeKey) return ''
    const [y, m] = activeKey.split('-').map(Number)
    return `${MONTH_NOM[m] ?? ''} ${y}`
  }, [activeKey])
  const monthTxs = useMemo(() => {
    if (!activeKey) return []
    return (data?.transactions ?? []).filter((t) => {
      const d = new Date(t.createdAt)
      return `${d.getFullYear()}-${d.getMonth()}` === activeKey
    })
  }, [data, activeKey])
  const cats = useMemo(() => buildCats(monthTxs, analyticsMode), [monthTxs, analyticsMode])
  const catsTotal = cats.reduce((s, c) => s + c.total, 0)
  const catsOps = cats.reduce((s, c) => s + c.count, 0)
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

  // ===== Нижний таб-бар: Главная / Платежи / История / Аналитика =====
  const tabs: { key: Screen; icon: LucideIcon; label: string }[] = [
    { key: 'main', icon: Home, label: 'Главная' },
    { key: 'payments', icon: ArrowLeftRight, label: 'Платежи' },
    { key: 'history', icon: Clock, label: 'История' },
    { key: 'analytics', icon: BarChart3, label: 'Аналитика' },
  ]
  const tabActive = (key: Screen) =>
    key === 'main' ? screen === 'main' || screen === 'credit' : screen === key

  const transferAmount = Number(amountStr || 0)
  // Главный экран — тёмный (скриншот старого дизайна), остальные вкладки светлые
  const darkMain = screen === 'main'

  return (
    <div className={`relative flex h-full flex-col ${darkMain ? 'bg-[#0B1B12] text-[#F2F5F3]' : 'bg-[#F5F6F8] text-[#17181A]'}`}>
      {screen === 'transfer' && data ? (
        /* ===== ПЕРЕВОД: получатель + сумма с клавиатурой (по макету) ===== */
        <div key="transfer" className="screen-enter flex h-full min-h-0 flex-col">
          <div className="relative flex h-12 shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={() => setScreen(transferReturnRef.current)}
              aria-label="Назад"
              className="absolute left-4 flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition active:scale-95"
            >
              <ArrowLeft className="size-5 text-[#17181A]" aria-hidden="true" />
            </button>
            <h1 className="text-[17px] font-bold tracking-tight text-[#17181A]">Перевод</h1>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2 pt-1 [scrollbar-width:thin]">
            <Segment<TransferDest>
              value={transferDest}
              onChange={(v) => {
                setTransferDest(v)
                setAmountStr('')
                setFormError(null)
              }}
              options={[
                { key: 'deposit', label: 'На вклад' },
                { key: 'loan', label: 'Кредит' },
              ]}
              ariaLabel="Получатель перевода"
            />

            {/* карточка получателя */}
            <div className={`${CARD_CLS} flex items-center gap-3 p-3.5`}>
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: transferDest === 'deposit' ? GREEN : '#7B61FF' }}
                aria-hidden="true"
              >
                {transferDest === 'deposit' ? <PiggyBank className="size-5" /> : <Landmark className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold text-[#17181A]">
                  {transferDest === 'deposit' ? 'Накопительный счёт' : 'Погашение кредита'}
                </div>
                <div className="truncate text-[12px] text-gray-400">
                  {transferDest === 'deposit'
                    ? `Копилка · •••• ${depositLast4} · ${rate}% в час`
                    : data.debt > 0
                      ? `Остаток долга ${fmtMoney(data.debt)}`
                      : 'Активных кредитов нет'}
                </div>
              </div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-200/50 text-gray-400" aria-hidden="true">
                {transferDest === 'deposit' ? <Landmark className="size-4.5" /> : <FileText className="size-4.5" />}
              </span>
            </div>

            {/* сумма */}
            <div>
              <div className={CAPS}>Сумма перевода</div>
              <div className={`${CARD_CLS} mt-2 flex items-center justify-between p-4`}>
                <span className={`text-[28px] font-bold tabular-nums ${transferAmount > 0 ? 'text-[#17181A]' : 'text-[#C4C7CD]'}`}>
                  {fmtNum(transferAmount)} ₽
                </span>
                {amountStr !== '' && (
                  <button
                    type="button"
                    onClick={() => setAmountStr('')}
                    aria-label="Очистить сумму"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-200/50 text-gray-400 transition active:scale-95"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* быстрые доли долга для погашения */}
            {transferDest === 'loan' && (
              <div className="flex gap-2" role="group" aria-label="Быстрый выбор суммы платежа">
                {[
                  { label: '25%', v: 0.25 },
                  { label: '50%', v: 0.5 },
                  { label: 'Всё', v: 1 },
                ].map((c) => {
                  const val = Math.round(data.debt * c.v)
                  return (
                    <button
                      key={c.label}
                      type="button"
                      disabled={data.debt <= 0}
                      aria-pressed={transferAmount === val && data.debt > 0}
                      onClick={() => setAmountStr(String(val))}
                      className={`h-9 flex-1 rounded-full text-[12.5px] font-semibold transition active:scale-95 disabled:opacity-50 ${
                        transferAmount > 0 && transferAmount === val
                          ? 'bg-[#0E7A3D] text-white'
                          : 'bg-neutral-200/60 text-[#17181A]'
                      }`}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            )}

            <p className="px-1 text-[11.5px] leading-relaxed text-gray-400">
              {transferDest === 'deposit'
                ? `Доступно: ${fmtMoney(data.balance)} · На вкладе: ${fmtMoney(data.deposit)} · Минимум 100 ₽`
                : `Доступно: ${fmtMoney(data.balance)}${data.debt > 0 ? ` · Остаток долга: ${fmtMoney(data.debt)}` : ''}`}
            </p>
            {transferDest === 'loan' && data.debt <= 0 && (
              <p className="px-1 text-[11.5px] leading-relaxed text-gray-400">
                Погашать нечего: активных кредитов нет. Оформить кредит можно в кредитном центре.
              </p>
            )}
          </div>

          {/* кнопки + клавиатура */}
          <div className="shrink-0 space-y-2.5 px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
            {formError && <p className="px-1 text-[13px] text-[#E5584B]">{formError}</p>}
            {transferDest === 'deposit' ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="flex h-12 items-center justify-center rounded-xl bg-[#0E7A3D] text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:bg-neutral-200/60 disabled:text-gray-400"
                  disabled={busy || transferAmount < 100 || transferAmount > data.balance}
                  onClick={() =>
                    applyMutation(
                      () => api.depositOp(transferAmount, 'top'),
                      () => {
                        setAmountStr('')
                        setScreen(transferReturnRef.current)
                      },
                    )}
                >
                  {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : transferAmount > 0 ? `Пополнить ${fmtNum(transferAmount)} ₽` : 'Пополнить'}
                </button>
                <button
                  type="button"
                  className="flex h-12 items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-[#17181A] ring-1 ring-black/[0.08] transition active:scale-[0.98] disabled:text-[#C4C7CD]"
                  disabled={busy || transferAmount < 100 || transferAmount > data.deposit}
                  onClick={() =>
                    applyMutation(
                      () => api.depositOp(transferAmount, 'withdraw'),
                      () => {
                        setAmountStr('')
                        setScreen(transferReturnRef.current)
                      },
                    )}
                >
                  {transferAmount > 0 ? `Снять ${fmtNum(transferAmount)} ₽` : 'Снять'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center rounded-xl bg-[#0E7A3D] text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:bg-neutral-200/60 disabled:text-gray-400"
                disabled={busy || transferAmount <= 0 || data.debt <= 0 || data.balance <= 0}
                onClick={() =>
                  applyMutation(
                    () => api.repayLoan(Math.min(transferAmount, data.debt)),
                    () => {
                      setAmountStr('')
                      setScreen(transferReturnRef.current)
                    },
                  )}
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : transferAmount > 0 ? `Оплатить ${fmtNum(transferAmount)} ₽` : 'Оплатить'}
              </button>
            )}
            <Numpad onKey={onNumpadKey} />
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto [scrollbar-width:thin]"
            style={
              darkMain
                ? { background: 'linear-gradient(180deg, #03130B 0%, #0B2016 26%, #0F241B 52%, #111E19 78%, #131418 100%)' }
                : undefined
            }
          >
            {loading && !data ? (
              /* скелетон главного экрана (тёмный) */
              <div className="space-y-4 p-4 pt-4">
                <div className="flex items-center gap-2.5">
                  <div className="size-12 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
                  <div className="h-11 min-w-0 flex-1 animate-pulse rounded-full bg-white/[0.06]" />
                  <div className="size-11 shrink-0 animate-pulse rounded-[14px] bg-white/[0.06]" />
                </div>
                <div className="h-7 w-52 animate-pulse rounded-xl bg-white/[0.06]" />
                <div className="flex justify-between px-2 pt-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div className="size-[58px] animate-pulse rounded-full bg-white/[0.06]" />
                      <div className="h-2.5 w-12 animate-pulse rounded-full bg-white/[0.06]" />
                    </div>
                  ))}
                </div>
                <div className="h-[152px] w-[82%] animate-pulse rounded-[24px] bg-white/[0.06]" />
                <div className="flex items-center justify-center gap-2 pt-1 text-[13px] text-white/40">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Загрузка банка…
                </div>
              </div>
            ) : error && !data ? (
              <div className="p-4 pt-8">
                <div className="rounded-[20px] bg-white/[0.05] p-6 text-center ring-1 ring-white/10">
                  <p className="text-[13px] text-[#F87171]">{error}</p>
                  <button
                    type="button"
                    onClick={load}
                    className="mt-4 text-[13px] font-semibold text-[#4ADE80] transition active:opacity-70"
                  >
                    Повторить
                  </button>
                </div>
              </div>
            ) : data ? (
              <div key={screen} className="screen-enter pb-2">
                {/* ===== ГЛАВНАЯ (тёмная тема по скриншоту старого дизайна) ===== */}
                {screen === 'main' && (
                  <div className="pb-2">
                    {/* шапка: аватар, поиск, QR */}
                    <div className="flex items-center gap-2.5 px-4 pt-3">
                      {session?.photoUrl ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={session.photoUrl}
                          alt={holderName}
                          className="size-12 shrink-0 rounded-full object-cover ring-2 ring-[#21A038]/50"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-[15px] font-extrabold text-white shadow-[0_6px_18px_rgba(34,197,94,0.35)]"
                        >
                          {firstName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setScreen('history')}
                        aria-label="Поиск по операциям"
                        className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[#1B1F24] px-4 ring-1 ring-white/[0.07] transition active:scale-[0.98]"
                      >
                        <Search className="size-4.5 shrink-0 text-white/45" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-left text-[14px] text-white/45">Поиск</span>
                        <Mic className="size-4.5 shrink-0 text-white/45" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheet('qr')}
                        aria-label="Платежи и переводы по QR-коду"
                        className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#22C55E] text-white shadow-[0_6px_18px_rgba(34,197,94,0.35)] transition active:scale-95"
                      >
                        <QrCode className="size-5" strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    </div>

                    {/* приветствие по времени суток */}
                    <h1
                      className="px-4 pt-4 text-[24px] font-bold leading-tight tracking-tight text-white"
                      suppressHydrationWarning
                    >
                      {greeting()}, {firstName}
                    </h1>

                    {/* 5 круглых действий с градиентными кольцами */}
                    <div className="mt-3 grid grid-cols-5 gap-1 px-3" role="group" aria-label="Быстрые действия">
                      {roundActions.map((a) => (
                        <RoundAction key={a.label} icon={a.icon} label={a.label} ring={a.ring} onClick={a.run} aria={a.aria} />
                      ))}
                    </div>

                    {/* карусель карт с волнистым артом + точки-страницы */}
                    <div
                      role="region"
                      aria-label="Мои карты"
                      className="mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      style={{ touchAction: 'pan-x' }}
                      onScroll={onCardsScroll}
                    >
                      {cards.map((c) => (
                        <WaveCard
                          key={c.key}
                          art={c.key}
                          badge={c.badge}
                          label={c.label}
                          amount={c.amount}
                          masked={c.masked}
                          holder={c.holder}
                          aria={c.aria}
                          onClick={c.run}
                          onAmountClick={() => setBalanceHidden((v) => !v)}
                          amountPressed={balanceHidden}
                          action={
                            c.key === 'debit'
                              ? { icon: CreditCard, label: 'Оформление', onClick: () => openCredit(), aria: 'Оформить кредитную карту' }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    <div className="mt-3">
                      <PageDots count={cards.length} active={cardSlide} tone="dark" />
                    </div>

                    {/* последние операции */}
                    {allTxs.length > 0 && (
                      <div className="mt-5 px-4">
                        <div className="flex items-center justify-between px-1 pb-2">
                          <span className={CAPS_DARK}>Последние операции</span>
                          <button
                            type="button"
                            onClick={() => setScreen('history')}
                            aria-label="Открыть всю историю операций"
                            className="flex h-8 items-center gap-0.5 rounded-full px-2 text-[12px] font-semibold text-[#4ADE80] transition active:opacity-70"
                          >
                            Все
                            <ChevronRight className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                        <div className={`${DARK_CARD} px-4 py-1`}>
                          {mergeTxs(allTxs).slice(0, 3).map((m) => (
                            <DarkTxRow key={m.tx.id} m={m} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* промо «Копите легче» */}
                    <div className="mt-4 px-4">
                      <button
                        type="button"
                        onClick={() => openTransfer('deposit')}
                        className="flex w-full items-center gap-3 rounded-[20px] bg-white/[0.05] p-3.5 text-left ring-1 ring-white/10 transition active:scale-[0.98]"
                      >
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#22C55E]/15" aria-hidden="true">
                          <Sprout className="size-5 text-[#4ADE80]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold text-white">Копите легче</span>
                          <span className="block truncate text-[12px] text-white/55">
                            Накопительный счёт со ставкой {rate}% в час
                          </span>
                        </span>
                        <ChevronRight className="size-5 shrink-0 text-white/40" aria-hidden="true" />
                      </button>
                    </div>

                    {/* безопасность */}
                    <div className="mt-5 px-4">
                      <div className={`${CAPS_DARK} px-1 pb-2`}>Безопасность</div>
                      <div className="rounded-[20px] bg-white/[0.05] px-4 py-1.5 ring-1 ring-white/10">
                        <div className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-2.5">
                            <ShieldCheck className="size-4.5 text-[#4ADE80]" aria-hidden="true" />
                            <div>
                              <div className="text-sm font-medium text-white">Вход по пину</div>
                              <div className="text-[11px] text-white/45">Код при входе в банк</div>
                            </div>
                          </div>
                          <Toggle checked={pinOn} onCheckedChange={(v) => setPref('bankPin', v)} label="Вход по пину" tone="dark" />
                        </div>
                        <div className="flex items-center justify-between border-t border-white/[0.06] py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Receipt className="size-4.5 text-[#4ADE80]" aria-hidden="true" />
                            <div>
                              <div className="text-sm font-medium text-white">Уведомления об операциях</div>
                              <div className="text-[11px] text-white/45">Пуш после каждой операции</div>
                            </div>
                          </div>
                          <Toggle checked={opsNotifOn} onCheckedChange={(v) => setPref('bankOpsNotif', v)} label="Уведомления об операциях" tone="dark" />
                        </div>
                        <div className="flex items-center justify-between border-t border-white/[0.06] py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Info className="size-4.5 text-[#4ADE80]" aria-hidden="true" />
                            <div>
                              <div className="text-sm font-medium text-white">Рейтинг: {score}</div>
                              <div className="text-[11px] text-white/45">Влияет на лимит и ставку</div>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold ${creditDarkCls}`}>{credit.label}</span>
                        </div>
                      </div>
                    </div>

                    <p className="px-4 pb-1 pt-4 text-center text-[10px] text-white/30">
                      Столичный Банк · вклады не застрахованы, это игра
                    </p>
                  </div>
                )}

                {/* ===== ПЛАТЕЖИ ===== */}
                {screen === 'payments' && (
                  <div className="p-4 pt-5">
                    <h1 className="text-[26px] font-bold tracking-tight text-[#17181A]">Платежи</h1>
                    <p className="mt-0.5 text-[13px] text-gray-400">Услуги, переводы и быстрый доступ</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {services.map((s) => (
                        <ServiceTile
                          key={s.label}
                          icon={s.icon}
                          color={s.color}
                          label={s.label}
                          sub={s.sub}
                          aria={s.aria}
                          onClick={s.run}
                        />
                      ))}
                    </div>
                    <div className={`${CARD_CLS} mt-4 p-4 text-[11px] leading-relaxed text-gray-400`}>
                      Переводы людям проходят из чата сделки: напишите продавцу и оплатите счёт, операция появится в истории банка.
                    </div>
                  </div>
                )}

                {/* ===== ИСТОРИЯ ===== */}
                {screen === 'history' && (
                  <div className="p-4 pt-5">
                    <div className="flex items-center justify-between gap-2">
                      <h1 className="text-[26px] font-bold tracking-tight text-[#17181A]">История</h1>
                      <div className="flex items-center gap-2">
                        {data.transactions.length > 0 && (
                          <a
                            href={exportCsvUrl()}
                            download
                            aria-label="Скачать историю операций в CSV"
                            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#0E7A3D]/10 px-3 text-[11px] font-semibold text-[#0E7A2B] outline-none transition-colors hover:bg-[#0E7A3D]/20 focus-visible:ring-2 focus-visible:ring-[#21A038]/40"
                          >
                            <FileDown className="size-3.5" aria-hidden="true" />
                            CSV
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setHistSearch((v) => !v)
                            if (histSearch) setHistQ('')
                          }}
                          aria-label="Поиск по операциям"
                          aria-expanded={histSearch}
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-500 ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition active:scale-95"
                        >
                          {histSearch ? <X className="size-4.5" aria-hidden="true" /> : <Search className="size-4.5" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    {histSearch && (
                      <input
                        value={histQ}
                        onChange={(e) => setHistQ(e.target.value)}
                        placeholder="Найти операцию"
                        aria-label="Поиск по операциям"
                        className="mt-3 h-11 w-full rounded-full bg-white px-4 text-sm text-[#17181A] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition placeholder:text-gray-400 focus:ring-[#21A038]/40"
                      />
                    )}

                    <div className="mt-3 flex gap-2" role="group" aria-label="Фильтр операций">
                      <Chip active={histFilter === 'all'} onClick={() => setHistFilter('all')}>Все</Chip>
                      <Chip active={histFilter === 'in'} onClick={() => setHistFilter('in')}>Поступления</Chip>
                      <Chip active={histFilter === 'out'} onClick={() => setHistFilter('out')}>Списания</Chip>
                    </div>

                    {data.transactions.length === 0 ? (
                      <div className={`${CARD_CLS} mt-4 p-6 text-center`}>
                        <p className="text-sm text-gray-400">Здесь появятся все ваши покупки, продажи и операции с банком.</p>
                      </div>
                    ) : historyGroups.length === 0 ? (
                      <div className={`${CARD_CLS} mt-4 p-6 text-center`}>
                        <p className="text-sm text-gray-400">Ничего не найдено. Измените фильтр или запрос.</p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {historyGroups.map((g) => (
                          <div key={g.label}>
                            <div className={`${CAPS} px-1 pb-2`} suppressHydrationWarning>{g.label}</div>
                            <div className={`${CARD_CLS} divide-y divide-[#EBEDF0] px-4 py-1`}>
                              {mergeTxs(g.items).map((m) => (
                                <TxRow key={m.tx.id} m={m} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ===== АНАЛИТИКА ===== */}
                {screen === 'analytics' && (
                  <div className="p-4 pt-5">
                    <h1 className="text-[26px] font-bold tracking-tight text-[#17181A]">Аналитика</h1>

                    <div className="mt-3">
                      <Segment<'out' | 'in'>
                        value={analyticsMode}
                        onChange={setAnalyticsMode}
                        options={[
                          { key: 'out', label: 'Расходы' },
                          { key: 'in', label: 'Доходы' },
                        ]}
                        ariaLabel="Режим аналитики"
                      />
                    </div>

                    {monthKeys.length > 0 && (
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[15px] font-bold text-[#17181A]" suppressHydrationWarning>{monthLabel}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setMonthIdx(activeIdx + 1)}
                            disabled={activeIdx >= monthKeys.length - 1}
                            aria-label="Предыдущий месяц"
                            className="flex size-9 items-center justify-center rounded-full bg-white text-gray-500 ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition active:scale-95 disabled:opacity-40"
                          >
                            <ChevronLeft className="size-4.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMonthIdx(Math.max(0, activeIdx - 1))}
                            disabled={activeIdx <= 0}
                            aria-label="Следующий месяц"
                            className="flex size-9 items-center justify-center rounded-full bg-white text-gray-500 ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition active:scale-95 disabled:opacity-40"
                          >
                            <ChevronRight className="size-4.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}

                    {catsTotal <= 0 ? (
                      <div className={`${CARD_CLS} mt-4 flex flex-col items-center p-8 text-center`}>
                        <Info className="size-6 text-[#C4C7CD]" aria-hidden="true" />
                        <p className="mt-2 text-sm font-medium text-[#17181A]">
                          {monthKeys.length === 0 ? 'Операций пока нет' : 'В выбранном месяце таких операций нет'}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          {monthKeys.length === 0
                            ? 'Совершите покупки или продажи, и аналитика появится здесь'
                            : 'Выберите другой месяц или переключите режим'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className={`${CARD_CLS} mt-4 flex justify-center py-6`}>
                          <Donut
                            segs={donutSegs}
                            total={fmtMoney(catsTotal)}
                            centerLabel={analyticsMode === 'out' ? 'Расходы' : 'Доходы'}
                          />
                        </div>
                        <div className={`${CAPS} mt-5 px-1 pb-2`}>Категории</div>
                        <div className={`${CARD_CLS} divide-y divide-[#EBEDF0] px-4`}>
                          {cats.map((c) => (
                            <CategoryRow
                              key={c.key}
                              icon={c.icon}
                              color={c.color}
                              label={c.label}
                              count={c.count}
                              total={c.total}
                              pct={Math.round((c.total / catsTotal) * 100)}
                            />
                          ))}
                        </div>
                        <p className="mt-3 px-1 text-[11px] leading-relaxed text-gray-400">
                          Показаны операции выбранного месяца: {catsOps}{' '}
                          {plural(catsOps, 'операция', 'операции', 'операций')}.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* ===== КРЕДИТНЫЙ ЦЕНТР (оффер → анкета → договор → подпись) ===== */}
                {screen === 'credit' && (
                  <div className="pb-3">
                    <div className="flex items-center gap-3 px-4 pb-3 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          // в мастере «Назад» возвращает на шаг раньше, иначе на исходный экран
                          if (data.debt <= 0 && cwStep > 0 && cwStep < 4) setCwStep((cwStep - 1) as CreditStep)
                          else setScreen(creditReturnRef.current)
                        }}
                        aria-label="Назад"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#17181A] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition active:scale-95"
                      >
                        <ArrowLeft className="size-5" aria-hidden="true" />
                      </button>
                      <h1 className="text-[18px] font-bold tracking-tight text-[#17181A]">Кредит</h1>
                    </div>

                    <div className="px-4">
                      {/* ===== АКТИВНЫЙ КРЕДИТ: панель обслуживания ===== */}
                      {data.debt > 0 && cwStep !== 4 ? (
                        <>
                          <div className={`${loanOverdue ? 'bg-[#FDEEEE]' : CARD_CLS} rounded-[20px] p-5`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] text-gray-400">Остаток долга</span>
                              {activeLoan && (
                                <span className="rounded-full bg-neutral-200/60 px-2.5 py-1 text-[11px] font-semibold text-[#17181A]">
                                  {activeLoan.rate}%{activeLoan.principal > 0 ? ` · ${fmtMoney(activeLoan.principal)}` : ''}
                                </span>
                              )}
                            </div>
                            <div className={`mt-1 text-[30px] font-extrabold leading-tight tabular-nums ${loanOverdue ? 'text-[#E5584B]' : 'text-[#17181A]'}`}>
                              {fmtMoney(data.debt)}
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200/60" role="progressbar" aria-valuenow={loanPaidPct} aria-valuemin={0} aria-valuemax={100} aria-label="Прогресс погашения">
                              <div className="h-full rounded-full bg-[#0E7A3D] transition-[width] duration-500" style={{ width: `${loanPaidPct}%` }} />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
                              <span className="text-gray-400">Погашено {loanPaidPct}%</span>
                              {activeLoan && (
                                <span className={`font-semibold ${loanOverdue ? 'text-[#E5584B]' : 'text-[#0E7A2B]'}`} suppressHydrationWarning>
                                  {loanOverdue
                                    ? `Просрочен на ${Math.abs(loanDaysLeft)} ${plural(Math.abs(loanDaysLeft), 'день', 'дня', 'дней')}`
                                    : `Платёж до ${fmtDayMonth(new Date(activeLoan.dueAt))} · осталось ${loanDaysLeft} ${plural(loanDaysLeft, 'день', 'дня', 'дней')}`}
                                </span>
                              )}
                            </div>
                          </div>

                          {loanOverdue && (
                            <div className="mt-3 flex items-start gap-2.5 rounded-[20px] bg-[#FDEEEE] p-4">
                              <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-[#E5584B]" aria-hidden="true" />
                              <p className="text-[12px] leading-relaxed text-[#B26A63]">
                                Кредит просрочен: рейтинг понижен, лимит срезан. При долге свыше {fmtMoney(DEBT_BLOCK_LIMIT)} покупки блокируются. Внесите платёж, чтобы закрыть кредит.
                              </p>
                            </div>
                          )}

                          {/* платёж */}
                          <div className={`${CARD_CLS} mt-4 p-4`}>
                            <div className="text-[15px] font-semibold text-[#17181A]">Внести платёж</div>
                            <div className="mt-2 flex items-baseline justify-between">
                              <div className="text-[24px] font-extrabold tabular-nums text-[#17181A]">{fmtMoney(Math.min(repayAmount, data.debt))}</div>
                              <div className="text-[11px] text-gray-400">Доступно: {fmtMoney(data.balance)}</div>
                            </div>
                            <div className="mt-1 flex gap-2" role="group" aria-label="Быстрый выбор суммы платежа">
                              {[
                                { label: '25%', v: Math.round(data.debt * 0.25) },
                                { label: '50%', v: Math.round(data.debt * 0.5) },
                                { label: 'Всё', v: data.debt },
                              ].map((c) => (
                                <button
                                  key={c.label}
                                  type="button"
                                  aria-pressed={Math.min(repayAmount, data.debt) === Math.min(c.v, data.debt)}
                                  onClick={() => setRepayAmount(Math.min(c.v, data.debt))}
                                  className={`h-9 flex-1 rounded-full text-[12.5px] font-semibold transition active:scale-95 ${
                                    Math.min(repayAmount, data.debt) === Math.min(c.v, data.debt)
                                      ? 'bg-[#0E7A3D] text-white'
                                      : 'bg-neutral-200/60 text-[#17181A]'
                                  }`}
                                >
                                  {c.label}
                                </button>
                              ))}
                            </div>
                            <Slider
                              className="mt-4 [&_[data-slot=slider-range]]:bg-[#0E7A3D] [&_[data-slot=slider-thumb]]:border-[#16A34A] [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-[#ECEFEE]"
                              value={[Math.min(Math.max(repayAmount, 0), data.debt)]}
                              min={0}
                              max={Math.max(100, Math.round(data.debt))}
                              step={100}
                              onValueChange={(v) => setRepayAmount(v[0] ?? 0)}
                              aria-label="Сумма платежа"
                            />
                            <div className="mt-1.5 flex justify-between text-[11px] text-gray-400">
                              <span>После платежа: {fmtMoney(Math.max(0, data.debt - Math.min(repayAmount, data.debt)))}</span>
                              <span>Досрочно, без комиссий</span>
                            </div>
                            {formError && <p className="mt-2 text-[13px] text-[#E5584B]">{formError}</p>}
                            <button
                              type="button"
                              className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-[#0E7A3D] text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:bg-neutral-200/60 disabled:text-gray-400"
                              disabled={busy || repayAmount <= 0 || data.balance <= 0}
                              onClick={() => applyMutation(() => api.repayLoan(Math.min(repayAmount, data.debt)))}
                            >
                              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : 'Внести платёж'}
                            </button>
                          </div>

                          {/* график платежей */}
                          <div className={`${CARD_CLS} mt-4 px-4 py-1`}>
                            <div className="pt-3 text-[15px] font-semibold text-[#17181A]">График платежей</div>
                            <div className="flex items-center gap-3 border-b border-[#F0F1F5] py-3">
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0E7A3D]/10 text-[#0E7A2B]" aria-hidden="true">
                                <CalendarDays className="size-5" strokeWidth={2.1} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[14px] font-medium text-[#17181A]">Платёж по кредиту</div>
                                {activeLoan && (
                                  <div className="text-[11.5px] text-gray-400" suppressHydrationWarning>
                                    до {fmtDayMonth(new Date(activeLoan.dueAt))}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-[14px] font-bold tabular-nums text-[#17181A]">{fmtMoney(data.debt)}</div>
                                <LoanStatusChip status={loanOverdue ? 'overdue' : 'active'} />
                              </div>
                            </div>
                            <div className="py-2.5 text-[11px] leading-relaxed text-gray-400">
                              Кредит возвращается одним платежом в конце срока. Частичные досрочные платежи уменьшают остаток.
                            </div>
                          </div>

                          {/* выплачено */}
                          <div className={`${CARD_CLS} mt-4 px-4 py-1`}>
                            <div className="pt-3 text-[15px] font-semibold text-[#17181A]">Выплачено</div>
                            {repayTxs.length === 0 ? (
                              <div className="py-3 text-[12.5px] text-gray-400">Досрочных платежей ещё не было.</div>
                            ) : (
                              <div className="divide-y divide-[#EBEDF0]">
                                {repayTxs.map((t) => (
                                  <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                                    <div className="min-w-0">
                                      <div className="truncate text-[13.5px] font-medium text-[#17181A]">Платёж по кредиту</div>
                                      <div className="text-[11px] text-gray-400">{t.createdAt ? fmtDayMonth(new Date(t.createdAt)) : ''}</div>
                                    </div>
                                    <div className="shrink-0 text-[13.5px] font-bold tabular-nums text-[#0E7A2B]">{fmtMoney(-t.amount)}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* условия кредита */}
                          {activeLoan && (
                            <div className={`${CARD_CLS} mt-4 px-4 py-1`}>
                              <div className="pt-3 text-[15px] font-semibold text-[#17181A]">Условия кредита</div>
                              <div className="divide-y divide-[#EBEDF0] pb-1">
                                <InfoRow k="Выдано" v={fmtMoney(activeLoan.principal)} />
                                <InfoRow k="Ставка" v={`${activeLoan.rate}%`} />
                                <InfoRow k="Всего к возврату" v={fmtMoney(loanInitialOwed)} />
                                <InfoRow k="Дата платежа" v={fmtDayMonth(new Date(activeLoan.dueAt))} />
                              </div>
                            </div>
                          )}

                          <CreditHistorySection items={loanHistory} />
                        </>
                      ) : cwStep === 4 && issued ? (
                        /* ===== УСПЕХ: кредит выдан ===== */
                        <div>
                          <div className="mt-6 flex flex-col items-center text-center">
                            <span className="flex size-16 items-center justify-center rounded-full bg-[#0E7A3D] shadow-[0_10px_28px_rgba(14,122,61,0.35)]" aria-hidden="true">
                              <BadgeCheck className="size-8 text-white" strokeWidth={2.2} />
                            </span>
                            <h2 className="mt-4 text-[22px] font-extrabold tracking-tight text-[#17181A]">Кредит выдан</h2>
                            <p className="mt-1 text-[13px] text-gray-400">
                              {fmtMoney(issued.amount)} зачислены на дебетовую карту
                            </p>
                          </div>
                          <div className={`${CARD_CLS} mt-5 px-4 py-1`}>
                            <div className="divide-y divide-[#EBEDF0]">
                              <InfoRow k="Договор" v={issued.contractNo} />
                              <InfoRow k="Сумма" v={fmtMoney(issued.amount)} />
                              <InfoRow k="Ставка" v={`${issued.rate}% · ${issued.days} ${plural(issued.days, 'день', 'дня', 'дней')}`} />
                              <InfoRow k="К возврату" v={fmtMoney(issued.owed)} vCls="text-[#E5584B]" />
                              <InfoRow k="Дата платежа" v={fmtDayMonth(new Date(issued.dueAt))} />
                            </div>
                          </div>
                          <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-400">
                            Вернёте вовремя: рейтинг +40, лимит и ставка станут лучше.
                          </p>
                          <button
                            type="button"
                            onClick={() => setCwStep(0)}
                            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-[#0E7A3D] text-[15px] font-semibold text-white transition active:scale-[0.98]"
                          >
                            Готово
                          </button>
                        </div>
                      ) : (
                        /* ===== МАСТЕР ОФОРМЛЕНИЯ (cwStep 0..3) ===== */
                        <>
                          <div className="px-1 pt-1" aria-hidden="true">
                            <div className="flex items-center gap-1.5">
                              {[0, 1, 2, 3].map((i) => (
                                <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= cwStep ? 'bg-[#0E7A3D]' : 'bg-neutral-200/70'}`} />
                              ))}
                            </div>
                            <div className="mt-1.5 text-[11px] text-gray-400">
                              Шаг {cwStep + 1} из 4 · {CREDIT_STEP_LABELS[cwStep]}
                            </div>
                          </div>

                          {/* --- ШАГ 0: предложение + калькулятор --- */}
                          {cwStep === 0 && (
                            <>
                              <div
                                className="relative mt-3 overflow-hidden rounded-[24px] p-5 text-white shadow-[0_12px_32px_rgba(14,122,61,0.28)]"
                                style={{ background: 'linear-gradient(135deg, #17A24A 0%, #0E7A3D 48%, #0A5C2E 100%)' }}
                              >
                                <span className="absolute -right-8 -top-14 size-44 rounded-full bg-white/10" aria-hidden="true" />
                                <span className="absolute -bottom-16 -left-10 size-48 rounded-full bg-white/[0.07]" aria-hidden="true" />
                                <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold">
                                  <BadgeCheck className="size-3.5" aria-hidden="true" />
                                  Предодобренное предложение
                                </span>
                                <div className="relative mt-2.5 text-[27px] font-extrabold leading-tight tabular-nums">
                                  до {fmtMoney(Math.max(1000, data.loanLimit))}
                                </div>
                                <div className="relative mt-1 text-[12.5px] text-white/85">
                                  Ставка от {baseRate}% · срок 7–30 дней · решение за секунду
                                </div>
                              </div>

                              {creditAvailable ? (
                                <>
                                  {/* калькулятор */}
                                  <div className={`${CARD_CLS} mt-4 p-4`}>
                                    <div className="text-[15px] font-semibold text-[#17181A]">Сколько нужно?</div>
                                    <div className="mt-1 text-[28px] font-extrabold leading-tight tabular-nums text-[#17181A]">{fmtMoney(loanAmount)}</div>
                                    <Slider
                                      className="mt-3 [&_[data-slot=slider-range]]:bg-[#0E7A3D] [&_[data-slot=slider-thumb]]:border-[#16A34A] [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-[#ECEFEE]"
                                      value={[Math.min(Math.max(loanAmount, 1000), Math.max(1000, data.loanLimit))]}
                                      min={1000}
                                      max={Math.max(1000, data.loanLimit)}
                                      step={500}
                                      onValueChange={(v) => setLoanAmount(v[0] ?? 1000)}
                                      aria-label="Сумма кредита"
                                    />
                                    <div className="mt-2 flex gap-2" role="group" aria-label="Быстрый выбор суммы">
                                      {[5000, 10000, 25000].filter((v) => v < data.loanLimit).map((v) => (
                                        <button
                                          key={v}
                                          type="button"
                                          aria-pressed={loanAmount === v}
                                          onClick={() => setLoanAmount(Math.min(v, data.loanLimit))}
                                          className={`h-9 flex-1 rounded-full text-[12px] font-semibold tabular-nums transition active:scale-95 ${
                                            loanAmount === v ? 'bg-[#0E7A3D] text-white' : 'bg-neutral-200/60 text-[#17181A]'
                                          }`}
                                        >
                                          {fmtMoney(v)}
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        aria-pressed={loanAmount >= data.loanLimit}
                                        onClick={() => setLoanAmount(Math.max(1000, data.loanLimit))}
                                        className={`h-9 flex-1 rounded-full text-[12px] font-semibold transition active:scale-95 ${
                                          loanAmount >= data.loanLimit ? 'bg-[#0E7A3D] text-white' : 'bg-neutral-200/60 text-[#17181A]'
                                        }`}
                                      >
                                        Максимум
                                      </button>
                                    </div>

                                    <div className="mt-5 text-[15px] font-semibold text-[#17181A]">На какой срок?</div>
                                    <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Срок кредита">
                                      {LOAN_TERM_OPTIONS.map((t) => {
                                        const active = loanDays === t.days
                                        return (
                                          <button
                                            key={t.days}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => setLoanDays(t.days)}
                                            className={`rounded-2xl border p-2.5 text-center transition active:scale-[0.97] ${
                                              active ? 'border-[#16A34A] bg-[#E7F5EA]' : 'border-black/[0.08] bg-white'
                                            }`}
                                          >
                                            <span className={`block text-[13.5px] font-bold ${active ? 'text-[#0E7A2B]' : 'text-[#17181A]'}`}>{t.label}</span>
                                            <span className={`block text-[11px] tabular-nums ${active ? 'text-[#0E7A2B]' : 'text-gray-400'}`}>
                                              {rateForDays(t.days)}%
                                            </span>
                                          </button>
                                        )
                                      })}
                                    </div>

                                    {/* расчёт */}
                                    <div className="mt-4 divide-y divide-[#EBEDF0] border-t border-[#F0F1F5] pt-1">
                                      <InfoRow k="Ставка на срок" v={`${curRate}%`} />
                                      <InfoRow k="Проценты" v={fmtMoney(curOwed - loanAmount)} />
                                      <InfoRow k="К возврату" v={fmtMoney(curOwed)} vCls="text-[#E5584B]" />
                                      <InfoRow k="Платёж один" v={`до ${fmtDayMonth(curDue)}`} />
                                    </div>
                                  </div>

                                  {/* кредитный рейтинг */}
                                  <div className={`${CARD_CLS} mt-4 p-4`}>
                                    <div className="flex items-center justify-between">
                                      <div className="text-[15px] font-semibold text-[#17181A]">Кредитный рейтинг</div>
                                      <span className={`text-xs font-semibold ${credit.cls}`}>{credit.label}</span>
                                    </div>
                                    <div className="mt-2">
                                      <ScoreGauge score={score} />
                                    </div>
                                    <div className="mt-3 rounded-xl bg-[#F5F6F8] p-3 text-[11.5px] leading-relaxed text-gray-400">
                                      Возвращаете вовремя: <span className="font-semibold text-[#0E7A2B]">+40</span> к рейтингу, ставка ниже.
                                      Просрочка: <span className="font-semibold text-[#E5584B]">−80</span>, лимит срезается.
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-[#0E7A3D] text-[15px] font-semibold text-white transition active:scale-[0.98]"
                                    onClick={() => setCwStep(1)}
                                  >
                                    Продолжить
                                  </button>
                                  <p className="mt-2.5 text-center text-[10.5px] leading-relaxed text-gray-400">
                                    Расчёт предварительный и не является офертой
                                  </p>
                                </>
                              ) : (
                                /* кредит недоступен */
                                <div className={`${CARD_CLS} mt-4 p-6 text-center`}>
                                  <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-200/60" aria-hidden="true">
                                    <Landmark className="size-6 text-gray-400" />
                                  </span>
                                  <div className="mt-3 text-[15px] font-semibold text-[#17181A]">Кредит пока недоступен</div>
                                  <p className="mt-1 text-[12.5px] leading-relaxed text-gray-400">
                                    Ваш лимит: {fmtMoney(data.loanLimit)}. Повышайте уровень и возвращайте кредиты вовремя: лимит растёт с уровнем и рейтингом.
                                  </p>
                                </div>
                              )}
                            </>
                          )}

                          {/* --- ШАГ 1: анкета заёмщика --- */}
                          {cwStep === 1 && (
                            <>
                              <div className={`${CARD_CLS} mt-3 px-4 py-1`}>
                                <div className="pt-3 text-[15px] font-semibold text-[#17181A]">Данные заёмщика</div>
                                <div className="divide-y divide-[#EBEDF0] pb-1">
                                  <InfoRow k="ФИО" v={holderName} />
                                  <InfoRow k="Паспорт РФ" v={passportMask} />
                                  <InfoRow k="Телефон" v={phoneMask} />
                                  <InfoRow k="Доход в месяц" v={income30 > 0 ? fmtMoney(income30) : 'Нет данных'} />
                                  <InfoRow k="Уровень на Resale" v={`${data.level}`} />
                                </div>
                              </div>
                              <div className={`${CARD_CLS} mt-4 p-4`}>
                                <div className="text-[15px] font-semibold text-[#17181A]">Цель кредита</div>
                                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Цель кредита">
                                  {LOAN_PURPOSES.map((p) => {
                                    const active = loanPurpose === p
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => setLoanPurpose(p)}
                                        className={`h-11 rounded-full text-[13px] font-semibold transition active:scale-[0.97] ${
                                          active ? 'bg-[#0E7A3D] text-white' : 'bg-neutral-200/60 text-[#17181A]'
                                        }`}
                                      >
                                        {p}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                              <p className="mt-3 px-1 text-[11px] leading-relaxed text-gray-400">
                                Данные подтверждаются автоматически. Банк может запросить уточнения перед выдачей.
                              </p>
                              <button
                                type="button"
                                className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-[#0E7A3D] text-[15px] font-semibold text-white transition active:scale-[0.98]"
                                onClick={() => setCwStep(2)}
                              >
                                Продолжить
                              </button>
                            </>
                          )}

                          {/* --- ШАГ 2: договор --- */}
                          {cwStep === 2 && (
                            <>
                              <div className={`${CARD_CLS} mt-3 p-4`}>
                                <div className="flex items-center gap-3">
                                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0E7A3D]/10 text-[#0E7A2B]" aria-hidden="true">
                                    <FileText className="size-5" strokeWidth={2.1} />
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate text-[14.5px] font-bold text-[#17181A]">Договор кредитования</div>
                                    <div className="text-[11.5px] tabular-nums text-gray-400" suppressHydrationWarning>
                                      № {contractNo} · от {fmtDayMonth(new Date())}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2 divide-y divide-[#EBEDF0]">
                                  <InfoRow k="Кредитор" v="Столичный Банк" />
                                  <InfoRow k="Заёмщик" v={holderName} />
                                  <InfoRow k="Сумма кредита" v={fmtMoney(loanAmount)} />
                                  <InfoRow k="Срок" v={`${loanDays} ${plural(loanDays, 'день', 'дня', 'дней')}`} />
                                  <InfoRow k="Ставка" v={`${curRate}%`} />
                                  <InfoRow k="К возврату" v={fmtMoney(curOwed)} vCls="text-[#E5584B]" />
                                  <InfoRow k="Дата платежа" v={fmtDayMonth(curDue)} />
                                  <InfoRow k="Цель кредита" v={loanPurpose} />
                                </div>
                              </div>

                              <div className={`${CARD_CLS} mt-4 p-4`}>
                                <div className="text-[13px] font-semibold text-[#17181A]">Условия договора</div>
                                <div className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-gray-500">
                                  <p>1. Банк выдаёт кредит {fmtMoney(loanAmount)} на дебетовую карту заёмщика единовременно.</p>
                                  <p>2. Проценты: {curRate}% за весь срок, начисляются единовременно при выдаче. К возврату {fmtMoney(curOwed)}.</p>
                                  <p>3. Допускается частичное досрочное погашение без комиссий и штрафов.</p>
                                  <p>4. Своевременное погашение повышает кредитный рейтинг на 40 пунктов.</p>
                                  <p>5. При просрочке рейтинг снижается на 80 пунктов; при долге свыше {fmtMoney(DEBT_BLOCK_LIMIT)} покупки ограничиваются.</p>
                                </div>
                                <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl bg-[#F5F6F8] p-3">
                                  <input
                                    type="checkbox"
                                    checked={agree}
                                    onChange={(e) => setAgree(e.target.checked)}
                                    className="peer sr-only"
                                    aria-label="Согласен с условиями договора"
                                  />
                                  <span
                                    aria-hidden="true"
                                    className={`flex size-5.5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                                      agree ? 'border-[#16A34A] bg-[#0E7A3D]' : 'border-black/[0.14] bg-white'
                                    }`}
                                  >
                                    {agree && <Check className="size-3.5 text-white" strokeWidth={3.5} />}
                                  </span>
                                  <span className="text-[12.5px] font-medium leading-snug text-[#17181A]">
                                    Ознакомлен(а) и согласен(на) с условиями договора
                                  </span>
                                </label>
                              </div>

                              <button
                                type="button"
                                disabled={!agree}
                                className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-[#0E7A3D] text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:bg-neutral-200/60 disabled:text-gray-400"
                                onClick={() => {
                                  setSignCode('')
                                  setSignError(null)
                                  sendSignCode()
                                  setCwStep(3)
                                }}
                              >
                                Перейти к подписанию
                              </button>
                            </>
                          )}

                          {/* --- ШАГ 3: подписание кодом --- */}
                          {cwStep === 3 && (
                            <>
                              <div className={`${CARD_CLS} mt-3 p-4`}>
                                <div className="flex items-center gap-3">
                                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0E7A3D]/10 text-[#0E7A2B]" aria-hidden="true">
                                    <PenLine className="size-5" strokeWidth={2.1} />
                                  </span>
                                  <div>
                                    <div className="text-[14.5px] font-bold text-[#17181A]">Подписание договора</div>
                                    <div className="text-[11.5px] text-gray-400">№ {contractNo}</div>
                                  </div>
                                </div>
                                <p className="mt-3 text-[12.5px] leading-relaxed text-gray-400">
                                  Мы отправили код подтверждения в уведомления. Введите его, чтобы подписать договор.
                                </p>
                                {/* макет пуш-уведомления (код дублируется системным тостом) */}
                                <div className="mt-3 rounded-2xl border border-black/[0.06] bg-white p-3 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
                                  <div className="flex items-center gap-2.5">
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#0E7A3D]" aria-hidden="true">
                                      <Landmark className="size-4.5 text-white" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Банк · сейчас</span>
                                      </div>
                                      <div className="truncate text-[13px] font-semibold text-[#17181A]">
                                        Код подписания: {sentCode ?? '····'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {/* ввод кода */}
                                <input
                                  value={signCode}
                                  onChange={(e) => setSignCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                  inputMode="numeric"
                                  autoComplete="one-time-code"
                                  maxLength={4}
                                  placeholder="····"
                                  aria-label="Код подписания из уведомления"
                                  className="mt-4 h-14 w-full rounded-xl border border-black/[0.08] bg-[#F5F6F8] text-center text-[22px] font-bold tracking-[0.45em] text-[#17181A] outline-none transition placeholder:tracking-[0.45em] placeholder:text-[#C4C7CD] focus:border-[#16A34A]/60"
                                />
                                <button
                                  type="button"
                                  onClick={sendSignCode}
                                  className="mx-auto mt-2.5 block text-[12.5px] font-semibold text-[#0E7A2B] transition active:opacity-70"
                                >
                                  Отправить код повторно
                                </button>
                                {signError && <p className="mt-2 text-center text-[13px] text-[#E5584B]">{signError}</p>}
                              </div>
                              <button
                                type="button"
                                disabled={signing || signCode.length < 4}
                                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0E7A3D] text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:bg-neutral-200/60 disabled:text-gray-400"
                                onClick={confirmSign}
                              >
                                {signing ? (
                                  <>
                                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                                    Оформляем кредит…
                                  </>
                                ) : (
                                  'Подписать и получить деньги'
                                )}
                              </button>
                            </>
                          )}

                          {/* кредитная история (в мастере на шаге 0) */}
                          {cwStep === 0 && <CreditHistorySection items={loanHistory} />}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* ===== НИЖНИЙ ТАБ-БАР (на тёмном главном — тёмный) ===== */}
          <nav
            className={`relative z-10 shrink-0 border-t ${
              darkMain ? 'border-white/[0.06] bg-[#0C1911]/95 backdrop-blur-xl' : 'border-black/[0.05] bg-white'
            }`}
            aria-label="Навигация банка"
          >
            <div className="grid grid-cols-4 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
              {tabs.map((t) => {
                const active = tabActive(t.key)
                const activeCls = darkMain ? 'text-[#4ADE80]' : 'text-[#0E7A2B]'
                const idleCls = darkMain ? 'text-white/40' : 'text-gray-400'
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { sound.tap(); setScreen(t.key) }}
                    aria-current={active ? 'page' : undefined}
                    className="flex min-h-[52px] flex-col items-center justify-center gap-1 transition"
                  >
                    <t.icon className={`size-[22px] ${active ? activeCls : idleCls}`} strokeWidth={active ? 2.3 : 2} aria-hidden="true" />
                    <span className={`text-[10px] ${active ? `font-semibold ${darkMain ? 'text-white' : 'text-[#0E7A2B]'}` : idleCls}`}>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </nav>
        </>
      )}

      {/* ===== НИЖНИЙ ЛИСТ: QR ===== */}
      {sheet === 'qr' && data && (
        <Sheet title="Платежи и переводы" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-3">
            <SheetTile
              icon={Receipt}
              label="Оплатить налоги"
              color="#E5584B"
              onClick={() => { setSheet(null); openApp('taxes') }}
            />
            <SheetTile
              icon={PiggyBank}
              label="Пополнить вклад"
              color={GREEN}
              onClick={() => { setSheet(null); openTransfer('deposit') }}
            />
            <SheetTile
              icon={Landmark}
              label={data.activeLoan ? 'Погасить кредит' : 'Взять кредит'}
              color="#7B61FF"
              onClick={() => { setSheet(null); openCredit() }}
            />
            <SheetTile
              icon={Send}
              label="Перевести"
              color="#F8A13A"
              onClick={() => { setSheet(null); openTransfer('deposit') }}
            />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
            Наведите камеру на QR-код продавца, или выберите операцию выше. Переводы людям доступны из чата сделки.
          </p>
        </Sheet>
      )}
    </div>
  )
}
