'use client'

// Приложение «Налоги» — редизайн по макету юзера, дизайн-система «Resale Dark»:
// всегда тёмный фон #050D09, карточка «К уплате» с зелёным градиентом и крупной суммой,
// статус со щитом «Задолженности нет» (bg-emerald-500/10), 4 быстрых действия,
// платежи строками со статус-бейджами и история с группировкой по месяцам.
// Вся бизнес-логика (api.taxes/payTaxes, фильтры, промо-карусель, ИНН) сохранена 1:1.
import { useCallback, useEffect, useMemo, useState, type ReactNode, type UIEvent } from 'react'
import {
  AlertTriangle, BadgeCheck, Banknote, CheckCircle2, ChevronRight, CircleHelp, Clock3, Coins, FileText, Home,
  Loader2, Mail, MoreHorizontal, Plus, ReceiptText, ShieldCheck, Sprout, type LucideIcon,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, fmtDateTime, initials } from '@/lib/format'
import type { TaxBillDTO, TaxData } from '@/lib/types'

type Tab = 'home' | 'bills' | 'taxes' | 'more'

const TAB_TITLES: Record<Exclude<Tab, 'home'>, { title: string; sub: string }> = {
  bills: { title: 'Чеки и счета', sub: 'Начисления по каждой продаже' },
  taxes: { title: 'Налоги', sub: 'Ставка, пеня и правила блокировки' },
  more: { title: 'Прочее', sub: 'Профиль самозанятого игрока' },
}

const BILL_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'paid', label: 'Оплаченные' },
  { key: 'unpaid', label: 'Неоплаченные' },
] as const
type BillFilter = (typeof BILL_FILTERS)[number]['key']

const MONTH_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

// Тёмные тона инфо-карточек
const INFO_TONES = {
  blue: 'bg-emerald-500/15 text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-400',
  red: 'bg-red-500/15 text-red-400',
  green: 'bg-emerald-500/15 text-emerald-400',
} as const

const CARD_SOFT = 'rounded-2xl border border-white/[0.08] bg-white/[0.04]'

// Игровой ИНН (12 цифр, как у самозанятого) — детерминированно из id игрока
function gameInn(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return ('77' + h.toString().padStart(10, '0')).slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ')
}

function Avatar({ name, photoUrl, className = 'size-10' }: { name: string; photoUrl?: string | null; className?: string }) {
  const base = 'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-2 ring-white/15 ' + className
  if (photoUrl) return <img src={photoUrl} alt={name} className={base + ' object-cover'} />
  return (
    <div className={base}>
      <span className="text-xs font-bold text-white">{initials(name)}</span>
    </div>
  )
}

function NavItem({
  icon: Icon, label, active, onClick,
}: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-w-0 flex-col items-center gap-1 py-1">
      <Icon className={'size-[22px] ' + (active ? 'text-emerald-400' : 'text-white/40')} strokeWidth={active ? 2.3 : 2} aria-hidden="true" />
      <span
        className={
          'max-w-full truncate text-[10px] leading-none ' +
          (active ? 'font-bold text-emerald-400' : 'font-medium text-white/40')
        }
      >
        {label}
      </span>
    </button>
  )
}

function BillRow({ bill }: { bill: TaxBillDTO }) {
  const paid = bill.status === 'paid'
  return (
    <div className="flex items-center gap-3 py-3">
      <div className={'flex size-10 shrink-0 items-center justify-center rounded-xl ' + (paid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400')}>
        {paid
          ? <CheckCircle2 className="size-[18px]" aria-hidden="true" />
          : <Clock3 className="size-[18px]" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-white">{bill.reason}</div>
        <div className="mt-0.5 text-[12px] text-white/50">
          {fmtDateTime(bill.createdAt)}
          {paid && bill.paidAt ? ` · оплачен ${fmtDateTime(bill.paidAt)}` : ` · срок до ${fmtDateTime(bill.dueAt)}`}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={'text-[14px] font-semibold tabular-nums ' + (paid ? 'text-emerald-400' : 'text-white')}>{fmtMoney(bill.amount)}</span>
        <span
          className={
            'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
            (paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')
          }
        >
          {paid ? 'Оплачен' : 'Не оплачен'}
        </span>
      </div>
    </div>
  )
}

function EmptyOperations({ hint }: { hint: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-white/[0.06]">
        <FileText className="size-6 text-white/30" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-semibold text-white/70">Список операций пуст</p>
      <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-white/40">{hint}</p>
    </div>
  )
}

function InfoCard({
  icon: Icon, tone, title, body, extra,
}: { icon: LucideIcon; tone: keyof typeof INFO_TONES; title: string; body: string; extra?: ReactNode }) {
  return (
    <div className={CARD_SOFT + ' flex items-start gap-3 p-4'}>
      <div className={'flex size-9 shrink-0 items-center justify-center rounded-xl ' + INFO_TONES[tone]}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-white">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-white/50">{body}</p>
        {extra && <div className="mt-2">{extra}</div>}
      </div>
    </div>
  )
}

export default function TaxesApp() {
  const [data, setData] = useState<TaxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [billFilter, setBillFilter] = useState<BillFilter>('all')
  const [slide, setSlide] = useState(0)
  const session = useOS((s) => s.session)

  const load = useCallback(async () => {
    try {
      setError(null)
      const d = await api.taxes()
      setData(d)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить данные налоговой')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const payAll = async () => {
    if (!data || data.taxDebt <= 0) return
    setBusy(true)
    setPayError(null)
    try {
      const res = await api.payTaxes()
      const os = useOS.getState()
      os.refreshSession({ balance: res.balance, taxDebt: res.taxDebt })
      os.pushToast('Налоги', 'Задолженность погашена')
      await load()
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : 'Не удалось оплатить задолженность')
    } finally {
      setBusy(false)
    }
  }

  const monthLabel = useMemo(() => new Date().toLocaleString('ru-RU', { month: 'long' }), [])

  // Выручка за текущий месяц восстанавливается из налоговых счетов:
  // каждый счёт = {rate}% от суммы продажи
  const revenueThisMonth = useMemo(() => {
    if (!data) return 0
    const now = new Date()
    const taxSum = data.bills.reduce((acc, b) => {
      const d = new Date(b.createdAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() ? acc + b.amount : acc
    }, 0)
    return data.rate > 0 ? Math.round(taxSum / (data.rate / 100)) : taxSum
  }, [data])

  const inn = useMemo(() => gameInn(session?.id ?? session?.username ?? 'player'), [session])

  const displayName = session?.displayName ?? 'Игрок'
  const bills = data?.bills ?? []
  const filteredBills = bills.filter((b) =>
    billFilter === 'all' ? true : b.status === billFilter,
  )

  // История с группировкой по месяцам: заголовки «Ноябрь 2025»
  const groupedBills = (() => {
    const groups: { title: string; bills: TaxBillDTO[] }[] = []
    const idx = new Map<string, number>()
    for (const b of filteredBills) {
      const d = new Date(b.createdAt)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const i = idx.get(key)
      if (i == null) {
        idx.set(key, groups.length)
        groups.push({ title: `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`, bills: [b] })
      } else {
        groups[i].bills.push(b)
      }
    }
    return groups
  })()

  // Ближайший срок оплаты по неоплаченным счетам
  const earliestDue = useMemo(() => {
    if (!data) return null
    const unpaid = data.bills.filter((b) => b.status !== 'paid')
    if (unpaid.length === 0) return null
    return unpaid.reduce((min, b) => (b.dueAt < min ? b.dueAt : min), unpaid[0].dueAt)
  }, [data])

  // Счётчики для чипов-фильтров
  const filterCounts = useMemo(() => ({
    all: bills.length,
    paid: bills.filter((b) => b.status === 'paid').length,
    unpaid: bills.filter((b) => b.status !== 'paid').length,
  }), [bills])

  const onPromoScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const max = el.scrollWidth - el.clientWidth
    setSlide(max <= 0 ? 0 : Math.round((el.scrollLeft / max) * 1))
  }

  // Промо-карусель мышью на ПК: зажми и тяни (на телефоне работает нативный тач-скролл)
  const onPromoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = e.currentTarget
    const start = { x: e.clientX, left: el.scrollLeft }
    const move = (ev: PointerEvent) => {
      el.scrollLeft = start.left - (ev.clientX - start.x)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Быстрые действия: якорят секции и оплаты
  const quickActions: { label: string; icon: LucideIcon; primary?: boolean; run: () => void }[] = [
    { label: 'Оплатить', icon: Banknote, primary: true, run: () => void payAll() },
    { label: 'Мои налоги', icon: Coins, run: () => setTab('taxes') },
    { label: 'Документы', icon: FileText, run: () => setTab('more') },
    { label: 'Чеки', icon: ReceiptText, run: () => setTab('bills') },
  ]

  const payButton = data && (
    <>
      {payError && (
        <p className="mt-3 text-[13px] text-red-400">{payError}</p>
      )}
      {data.blocked && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-red-500/25 bg-red-500/10 p-3.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-red-300">
            <span className="font-bold">Продажи заблокированы.</span> Погасите задолженность кнопкой «Оплатить налоги»,
            чтобы снова выставлять товары на продажу.
          </div>
        </div>
      )}
      <button
        onClick={payAll}
        disabled={busy || data.taxDebt <= 0}
        className={
          'mt-4 flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-bold transition active:scale-[0.98] ' +
          (data.taxDebt > 0 ? 'bg-[#22C55E] text-[#052E16]' : 'bg-white/[0.06] text-white/40')
        }
      >
        {busy
          ? <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          : data.taxDebt > 0
            ? `Оплатить налоги · ${fmtMoney(data.taxDebt)}`
            : 'Задолженности нет'}
      </button>
    </>
  )

  return (
    <div
      className="flex h-full flex-col text-white"
      style={{ background: 'linear-gradient(180deg,#07130D 0%,#050D09 100%)' }}
    >
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="space-y-3 p-4 pt-6">
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-40 animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="flex items-center justify-center gap-2 text-[13px] text-white/40">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Загрузка данных…
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4 pt-8">
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center">
              <AlertTriangle className="mx-auto size-6 text-red-400" aria-hidden="true" />
              <p className="mt-2 text-[13px] text-red-400">{error}</p>
              <button
                onClick={load}
                className="mt-4 text-[13px] font-semibold text-emerald-400 transition active:opacity-70"
              >
                Повторить
              </button>
            </div>
          </div>
        ) : data ? (
          <>
            {/* Тёмно-зелёная шапка сервиса */}
            <div className="px-4 pb-10 pt-5">
              <div className="flex items-center gap-3">
                <Avatar name={displayName} photoUrl={session?.photoUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold uppercase tracking-wide">{displayName}</div>
                  <div className="text-[11px] text-white/50">Самозанятый игрок</div>
                </div>
                <button aria-label="Уведомления" className="relative flex size-9 items-center justify-center rounded-full text-white/70 active:bg-white/10">
                  <Mail className="size-5" aria-hidden="true" />
                  <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-[#22C55E] text-[9px] font-bold leading-none text-[#052E16] ring-2 ring-[#07130D]">
                    1
                  </span>
                </button>
                <button aria-label="Справка" className="flex size-9 items-center justify-center rounded-full text-white/70 active:bg-white/10">
                  <CircleHelp className="size-5" aria-hidden="true" />
                </button>
              </div>

              {tab === 'home' ? (
                <>
                  {/* Карточка «К уплате» */}
                  {data.taxDebt > 0 ? (
                    <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-600/40 to-emerald-500/10 p-5">
                      <div className="text-[12px] text-white/60">К уплате</div>
                      <div className="mt-1.5 text-[34px] font-bold leading-none tabular-nums text-white">{fmtMoney(data.taxDebt)}</div>
                      <div className="mt-2 text-[12px] text-emerald-300" suppressHydrationWarning>
                        {earliestDue ? `Ближайший срок оплаты: ${fmtDateTime(earliestDue)}` : 'Пеня — 10% в сутки за просрочку'}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-[12px] text-white/60" suppressHydrationWarning>
                          Выручка за {monthLabel}:{' '}
                          <span className="font-semibold tabular-nums text-white">{fmtMoney(revenueThisMonth)}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                          НПД {data.rate}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15" aria-hidden="true">
                        <ShieldCheck className="size-6 text-emerald-400" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold text-emerald-300">Задолженности нет</div>
                        <div className="text-[12px] text-white/50" suppressHydrationWarning>
                          Выручка за {monthLabel}: <span className="font-semibold tabular-nums text-white">{fmtMoney(revenueThisMonth)}</span>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                        НПД {data.rate}%
                      </span>
                    </div>
                  )}

                  {/* 4 быстрых действия */}
                  <div className="mt-5 grid grid-cols-4 gap-2.5" role="group" aria-label="Быстрые действия">
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
                        <span className={`px-1 text-center text-[11px] leading-tight ${a.primary ? 'font-semibold text-[#052E16]' : 'text-white/70'}`}>{a.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-7">
                  <h1 className="text-[26px] font-bold leading-tight">{TAB_TITLES[tab].title}</h1>
                  <p className="mt-1 text-xs text-white/50">{TAB_TITLES[tab].sub}</p>
                </div>
              )}
            </div>

            {/* Тёмный нижний лист с контентом */}
            <div className="relative -mt-4 rounded-t-[28px] border-t border-white/[0.06] bg-[#0E1F16] px-4 pb-8 pt-4 shadow-[0_-10px_30px_rgba(0,0,0,0.45)]">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />

              {/* ГЛАВНАЯ */}
              {tab === 'home' && (
                <div>
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-[15px] font-semibold text-white">Последние платежи</h2>
                    {data.bills.length > 0 && (
                      <button onClick={() => setTab('bills')} className="flex items-center text-[13px] font-semibold text-emerald-400 active:opacity-70">
                        Все
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {data.bills.length === 0 ? (
                    <EmptyOperations hint="Продавайте товары — налоговые начисления появятся здесь" />
                  ) : (
                    <div className="mt-2 divide-y divide-white/[0.06] rounded-2xl border border-emerald-500/15 bg-[#0B1811] px-4">
                      {data.bills.slice(0, 4).map((b) => (
                        <BillRow key={b.id} bill={b} />
                      ))}
                    </div>
                  )}
                  {payButton}
                </div>
              )}

              {/* ЧЕКИ / СЧЕТА — фильтры + группировка по месяцам */}
              {tab === 'bills' && (
                <div>
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {BILL_FILTERS.map((f) => {
                      const active = billFilter === f.key
                      return (
                        <button
                          key={f.key}
                          onClick={() => setBillFilter(f.key)}
                          aria-pressed={active}
                          className={
                            'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] transition ' +
                            (active ? 'bg-emerald-500 font-semibold text-[#052E16]' : 'bg-white/[0.06] text-white/70')
                          }
                        >
                          {f.label}
                          <span
                            className={
                              'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ' +
                              (active ? 'bg-[#052E16]/20 text-[#052E16]' : 'bg-white/15 text-white/70')
                            }
                          >
                            {filterCounts[f.key]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {filteredBills.length === 0 ? (
                    <EmptyOperations hint="Здесь появятся счета: оплаченные и ожидающие оплаты" />
                  ) : (
                    groupedBills.map((g) => (
                      <div key={g.title}>
                        <div className="mb-1 mt-4 px-1 text-[13px] font-semibold text-white/50 first:mt-2" suppressHydrationWarning>
                          {g.title}
                        </div>
                        <div className="divide-y divide-white/[0.06] rounded-2xl border border-emerald-500/15 bg-[#0B1811] px-4">
                          {g.bills.map((b) => (
                            <BillRow key={b.id} bill={b} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* НАЛОГИ */}
              {tab === 'taxes' && (
                <div className="space-y-3">
                  {/* Промо-карусель */}
                  <div>
                    <div
                      onScroll={onPromoScroll}
                      onPointerDown={onPromoPointerDown}
                      className="-mx-4 flex snap-x snap-mandatory cursor-grab gap-3 overflow-x-auto px-4 select-none [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
                    >
                      <div className="relative h-[120px] w-[86%] shrink-0 snap-center overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-600/40 to-emerald-500/10 p-4 text-white">
                        <Coins className="absolute -right-3 -top-3 size-24 text-emerald-400/10" strokeWidth={1.4} aria-hidden="true" />
                        <div className="relative text-[26px] font-bold leading-none tabular-nums">10 000 ₽</div>
                        <div className="relative mt-1.5 max-w-[80%] text-xs font-bold leading-snug">Лимит задолженности, после которого блокируются продажи</div>
                        <div className="relative mt-1 text-[10px] text-white/50">Следите за сроками оплаты</div>
                      </div>
                      <div className="relative h-[120px] w-[86%] shrink-0 snap-center overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-4 text-white">
                        <Sprout className="absolute -right-3 -top-3 size-24 text-emerald-400/10" strokeWidth={1.4} aria-hidden="true" />
                        <div className="relative text-[26px] font-bold leading-none">{data.rate}%</div>
                        <div className="relative mt-1.5 max-w-[80%] text-xs font-bold leading-snug">с продаж другим игрокам — налог считается автоматически</div>
                        <div className="relative mt-1 text-[10px] text-white/50">Без отчётов и деклараций</div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center gap-1.5">
                      {[0, 1].map((i) => (
                        <span
                          key={i}
                          className={'h-1.5 rounded-full transition-all ' + (slide === i ? 'w-5 bg-emerald-400' : 'w-1.5 bg-white/20')}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                    <div>
                      <div className="text-[11px] text-white/40">Текущая задолженность</div>
                      {data.taxDebt > 0 ? (
                        <div className="mt-0.5 text-xl font-bold tabular-nums text-red-400">{fmtMoney(data.taxDebt)}</div>
                      ) : (
                        <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-emerald-400">
                          <ShieldCheck className="size-4" aria-hidden="true" /> Задолженности нет
                        </div>
                      )}
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                      НПД {data.rate}%
                    </span>
                  </div>

                  <InfoCard
                    icon={Coins}
                    tone="blue"
                    title={`${data.rate}% с каждой продажи`}
                    body={`Налог ${data.rate}% (НПД) начисляется автоматически с каждой успешной продажи другому игроку — отдельный счёт появляется в «Последних операциях».`}
                  />
                  <InfoCard
                    icon={Clock3}
                    tone="amber"
                    title="Пеня — 10% в сутки"
                    body="Если счёт не оплачен более суток, начисляется пеня — 10% от суммы задолженности в сутки. Пеня добавляется к общему долгу."
                  />
                  <InfoCard
                    icon={AlertTriangle}
                    tone="red"
                    title="Блокировка от 10 000 ₽"
                    body="При задолженности 10 000 ₽ и выше продажи блокируются до полной оплаты."
                    extra={
                      data.blocked ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300">
                          <AlertTriangle className="size-3" aria-hidden="true" /> Продажи сейчас заблокированы
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                          <CheckCircle2 className="size-3" aria-hidden="true" /> Продажи сейчас доступны
                        </span>
                      )
                    }
                  />
                  <InfoCard
                    icon={CheckCircle2}
                    tone="green"
                    title="Оплата в один счёт"
                    body="Кнопка «Оплатить налоги» на вкладке «Главная» сразу погашает всю задолженность с баланса вашего кошелька."
                  />
                </div>
              )}

              {/* ПРОЧЕЕ */}
              {tab === 'more' && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-emerald-500/15 bg-[#0B1811] p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-500/5 p-0.5">
                        <Avatar name={displayName} photoUrl={session?.photoUrl} className="size-11" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold text-white">{displayName}</div>
                        <div className="mt-0.5 truncate text-xs text-white/50">{session?.username ? `@${session.username}` : 'Игрок'}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
                        <ShieldCheck className="size-3.5" aria-hidden="true" /> Самозанятый игрок
                      </span>
                    </div>
                    <div className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      {[
                        { label: 'ИНН', value: <span className="font-semibold tabular-nums">{inn}</span> },
                        { label: 'Город', value: session?.city || '—' },
                        { label: 'Баланс', value: <span className="font-semibold tabular-nums">{fmtMoney(session?.balance ?? 0)}</span> },
                        { label: 'Ставка НПД', value: <span className="font-semibold">{data.rate}%</span> },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                          <span className="text-white/40">{row.label}</span>
                          <span className="text-right text-white">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Свидетельство с декоративной печатью */}
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-600/30 to-emerald-500/5 p-4">
                    <BadgeCheck className="absolute -bottom-4 -right-4 size-28 text-emerald-400/10" strokeWidth={1.2} aria-hidden="true" />
                    <div className="relative flex items-center gap-2">
                      <BadgeCheck className="size-5 text-emerald-300" aria-hidden="true" />
                      <div className="text-sm font-bold text-emerald-300">Свидетельство</div>
                    </div>
                    <p className="relative mt-1.5 max-w-[75%] text-[11px] leading-relaxed text-white/50">
                      Постановка на учёт самозанятого игрока налогового сервиса «Налоги»
                    </p>
                    <div className="relative mt-3 space-y-1 text-[11px] text-white">
                      <div>
                        ИНН: <span className="font-bold tabular-nums">{inn}</span>
                      </div>
                      <div>
                        Статус: <span className="font-bold text-emerald-300">Действует</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className={CARD_SOFT + ' p-3.5'}>
                      <div className="text-[11px] text-white/40">Уплачено всего</div>
                      <div className="mt-1 text-base font-bold tabular-nums text-emerald-400">{fmtMoney(data.totalPaid)}</div>
                    </div>
                    <div className={CARD_SOFT + ' p-3.5'}>
                      <div className="text-[11px] text-white/40">Всего заработано</div>
                      <div className="mt-1 text-base font-bold tabular-nums text-white">{fmtMoney(data.totalEarned)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Нижняя навигация внутри приложения */}
      <nav className="relative z-10 shrink-0 border-t border-white/[0.06] bg-[#07130D]/95 px-1 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="grid grid-cols-5 items-end">
          <NavItem icon={Home} label="Главная" active={tab === 'home'} onClick={() => setTab('home')} />
          <NavItem icon={ReceiptText} label="Чеки/Счета" active={tab === 'bills'} onClick={() => setTab('bills')} />
          <div className="flex flex-col items-center">
            <button
              aria-label="Продажа"
              onClick={() => useOS.getState().pushToast('Налоги', 'Создание чека доступно после сделки')}
              className="-mt-7 flex size-14 items-center justify-center rounded-full bg-[#22C55E] text-[#052E16] shadow-[0_8px_20px_rgba(34,197,94,0.3)] ring-4 ring-[#050D09] transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} aria-hidden="true" />
            </button>
            <span className="mt-1 text-[10px] font-medium leading-none text-white/40">Продажа</span>
          </div>
          <NavItem icon={Coins} label="Налоги" active={tab === 'taxes'} onClick={() => setTab('taxes')} />
          <NavItem icon={MoreHorizontal} label="Прочее" active={tab === 'more'} onClick={() => setTab('more')} />
        </div>
      </nav>
    </div>
  )
}
