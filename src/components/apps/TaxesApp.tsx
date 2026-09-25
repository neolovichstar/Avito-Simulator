'use client'

// Приложение «Налоги» — редизайн 1:1 в стиле СберБанк Онлайн (светлая тема):
// фон #F5F6FA, мягкий зелёный градиентный хедер (#D3ECD3→#F5F6FA) с аватаром-инициалами
// и суммой задолженности, белые карточки radius 20 (тень 0 2px 8px), фирменный зелёный
// #21A03A для CTA-пилюль h-12 radius 12 и активных табов, вторичный текст #9AA0A8;
// промо-карусель в светло-зелёном/светло-голубом, нижний белый таб-бар с border-t #E8EAED.
// Вся бизнес-логика (api.taxes/payTaxes, фильтры, группировка по месяцам, drag-карусель,
// быстрые действия, blocked-баннер) сохранена 1:1.
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

// Токены Сбера (светлая тема)
const GREEN = '#21A03A'
const CARD = 'rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]'

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
  const base = 'flex shrink-0 items-center justify-center overflow-hidden rounded-full ' + className
  if (photoUrl) return <img src={photoUrl} alt={name} className={base + ' object-cover ring-2 ring-white'} />
  return (
    <div className={base + ' bg-[#21A03A] ring-2 ring-white'}>
      <span className="text-xs font-bold text-white">{initials(name)}</span>
    </div>
  )
}

function NavItem({
  icon: Icon, label, active, onClick,
}: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-1 py-1"
    >
      <Icon
        className={'size-[22px] ' + (active ? 'text-[#21A03A]' : 'text-[#9AA0A8]')}
        strokeWidth={active ? 2.3 : 2}
        aria-hidden="true"
      />
      <span
        className={
          'max-w-full truncate text-[10px] leading-none ' +
          (active ? 'font-semibold text-[#21A03A]' : 'font-medium text-[#9AA0A8]')
        }
      >
        {label}
      </span>
    </button>
  )
}

// Ряд начисления: цветной круг 44px (статус), название 15, дата/срок 12 gray, сумма справа
function BillRow({ bill }: { bill: TaxBillDTO }) {
  const paid = bill.status === 'paid'
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className={
          'flex size-11 shrink-0 items-center justify-center rounded-full ' +
          (paid ? 'bg-[#21A03A]/10 text-[#21A03A]' : 'bg-[#F8A13A]/10 text-[#F8A13A]')
        }
        aria-hidden="true"
      >
        {paid ? <CheckCircle2 className="size-[18px]" strokeWidth={2.1} /> : <Clock3 className="size-[18px]" strokeWidth={2.1} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-[#1A1A1A]">{bill.reason}</div>
        <div className="mt-0.5 truncate text-[12px] text-[#9AA0A8]">
          {fmtDateTime(bill.createdAt)}
          {paid && bill.paidAt ? ` · оплачен ${fmtDateTime(bill.paidAt)}` : ` · срок до ${fmtDateTime(bill.dueAt)}`}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={'text-[15px] font-bold tabular-nums ' + (paid ? 'text-[#21A03A]' : 'text-[#1A1A1A]')}>{fmtMoney(bill.amount)}</span>
        <span
          className={
            'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
            (paid ? 'bg-[#21A03A]/10 text-[#21A03A]' : 'bg-[#F8A13A]/10 text-[#C97B1D]')
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
      <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
        <FileText className="size-6 text-[#9AA0A8]" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#1A1A1A]">Список операций пуст</p>
      <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-[#9AA0A8]">{hint}</p>
    </div>
  )
}

function InfoCard({
  icon: Icon, color, title, body, extra,
}: { icon: LucideIcon; color: string; title: string; body: string; extra?: ReactNode }) {
  return (
    <div className={CARD + ' flex items-start gap-3 p-4'}>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1A`, color }}
        aria-hidden="true"
      >
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-[#1A1A1A]">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-[#9AA0A8]">{body}</p>
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
  const firstName = displayName.split(' ')[0] ?? displayName
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

  // Быстрые действия: якорят секции и оплаты (логика не тронута)
  const quickActions: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: 'Оплатить', icon: Banknote, run: () => void payAll() },
    { label: 'Мои налоги', icon: Coins, run: () => setTab('taxes') },
    { label: 'Документы', icon: FileText, run: () => setTab('more') },
    { label: 'Чеки', icon: ReceiptText, run: () => setTab('bills') },
  ]

  const payButton = data && (
    <>
      {payError && (
        <p className="mt-3 text-[13px] text-[#E5584B]">{payError}</p>
      )}
      {data.blocked && (
        <div className="mt-3 flex items-start gap-2.5 rounded-[20px] bg-[#FDEEEE] p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#E5584B]" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-[#B3382E]">
            <span className="font-bold">Продажи заблокированы.</span> Погасите задолженность кнопкой «Оплатить налоги»,
            чтобы снова выставлять товары на продажу.
          </div>
        </div>
      )}
      <button
        onClick={payAll}
        disabled={busy || data.taxDebt <= 0}
        className={
          'mt-4 flex h-12 w-full items-center justify-center rounded-[12px] text-[15px] font-semibold transition active:scale-[0.98] ' +
          (data.taxDebt > 0 ? 'bg-[#21A03A] text-white active:bg-[#1B8A30]' : 'bg-[#F0F1F5] text-[#9AA0A8]')
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
      className="relative flex h-full flex-col text-[#1A1A1A]"
      style={{ background: '#F5F6FA' }}
    >
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="space-y-3 p-4 pt-6">
            <div className="h-10 animate-pulse rounded-full bg-[#ECEFEE]" />
            <div className="h-36 animate-pulse rounded-[20px] bg-[#ECEFEE]" />
            <div className="h-12 animate-pulse rounded-[20px] bg-[#ECEFEE]" />
            <div className="h-16 animate-pulse rounded-[20px] bg-[#ECEFEE]" />
            <div className="flex items-center justify-center gap-2 text-[13px] text-[#9AA0A8]">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Загрузка данных…
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4 pt-8">
            <div className={`${CARD} p-6 text-center`}>
              <AlertTriangle className="mx-auto size-6 text-[#E5584B]" aria-hidden="true" />
              <p className="mt-2 text-[13px] text-[#E5584B]">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[#21A03A]/10 px-5 text-[13px] font-semibold text-[#21A03A] transition active:opacity-80"
              >
                Повторить
              </button>
            </div>
          </div>
        ) : data ? (
          <div key={tab} className="screen-enter pb-2">
            {/* ===== ХЕДЕР: мягкий зелёный градиент Сбера ===== */}
            <div className="px-4 pb-6 pt-4" style={{ background: 'linear-gradient(180deg,#D3ECD3 0%,#F5F6FA 90%)' }}>
              {/* профиль + действия */}
              <div className="flex items-center gap-2.5">
                <Avatar name={displayName} photoUrl={session?.photoUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-[#1A1A1A]">{firstName}</div>
                  <div className="text-[12px] text-[#9AA0A8]">Самозанятый игрок</div>
                </div>
                <button
                  type="button"
                  aria-label="Уведомления"
                  className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-[#21A03A] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition active:scale-95"
                >
                  <Mail className="size-[18px]" aria-hidden="true" />
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-[#21A03A] text-[9px] font-bold leading-none text-white ring-2 ring-white">
                    1
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Справка"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-[#21A03A] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition active:scale-95"
                >
                  <CircleHelp className="size-[18px]" aria-hidden="true" />
                </button>
              </div>

              {tab === 'home' ? (
                <>
                  {/* Карточка «К уплате» на градиенте */}
                  {data.taxDebt > 0 ? (
                    <div className={`${CARD} mt-4 p-5`}>
                      <div className="text-[12px] text-[#9AA0A8]">К уплате</div>
                      <div className="mt-1.5 text-[34px] font-bold leading-none tabular-nums text-[#1A1A1A]">{fmtMoney(data.taxDebt)}</div>
                      <div className="mt-2 text-[12px] text-[#9AA0A8]" suppressHydrationWarning>
                        {earliestDue ? `Ближайший срок оплаты: ${fmtDateTime(earliestDue)}` : 'Пеня — 10% в сутки за просрочку'}
                      </div>
                      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[#F0F1F5] pt-3.5">
                        <span className="text-[12px] text-[#9AA0A8]" suppressHydrationWarning>
                          Выручка за {monthLabel}:{' '}
                          <span className="font-semibold tabular-nums text-[#1A1A1A]">{fmtMoney(revenueThisMonth)}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[#E7F5EA] px-2.5 py-1 text-[11px] font-semibold text-[#21A03A]">
                          НПД {data.rate}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={`${CARD} mt-4 flex items-center gap-3 p-4`}>
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#21A03A]/10" aria-hidden="true">
                        <ShieldCheck className="size-6 text-[#21A03A]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold text-[#21A03A]">Задолженности нет</div>
                        <div className="text-[12px] text-[#9AA0A8]" suppressHydrationWarning>
                          Выручка за {monthLabel}: <span className="font-semibold tabular-nums text-[#1A1A1A]">{fmtMoney(revenueThisMonth)}</span>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#E7F5EA] px-2.5 py-1 text-[11px] font-semibold text-[#21A03A]">
                        НПД {data.rate}%
                      </span>
                    </div>
                  )}

                  {/* 4 быстрых действия: белые круги 48px + подписи 12px gray */}
                  <div className="mt-5 grid grid-cols-4 gap-2" role="group" aria-label="Быстрые действия">
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
                </>
              ) : (
                <div className="mt-6">
                  <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[#1A1A1A]">{TAB_TITLES[tab].title}</h1>
                  <p className="mt-1 text-xs text-[#9AA0A8]">{TAB_TITLES[tab].sub}</p>
                </div>
              )}
            </div>

            {/* ===== КОНТЕНТ (светлый, без тёмных панелей) ===== */}
            <div className="space-y-5 px-4 pt-1">
              {/* ГЛАВНАЯ */}
              {tab === 'home' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[15px] font-semibold text-[#1A1A1A]">Последние платежи</span>
                      {data.bills.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setTab('bills')}
                          className="-my-3 flex min-h-[44px] items-center px-2 text-[13px] font-semibold text-[#21A03A] transition active:opacity-70"
                        >
                          Все
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <div className={`${CARD} px-4 py-1`}>
                      {data.bills.length === 0 ? (
                        <EmptyOperations hint="Продавайте товары — налоговые начисления появятся здесь" />
                      ) : (
                        <div className="divide-y divide-[#F0F1F5]">
                          {data.bills.slice(0, 4).map((b) => (
                            <BillRow key={b.id} bill={b} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {payButton}
                </div>
              )}

              {/* ЧЕКИ / СЧЕТА — фильтры + группировка по месяцам */}
              {tab === 'bills' && (
                <div className="space-y-2">
                  <div role="group" aria-label="Фильтры чеков" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {BILL_FILTERS.map((f) => {
                      const active = billFilter === f.key
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setBillFilter(f.key)}
                          aria-pressed={active}
                          className={
                            'flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] transition ' +
                            (active
                              ? 'bg-[#21A03A] font-semibold text-white'
                              : 'bg-white font-medium text-[#1A1A1A] shadow-[0_1px_3px_rgba(0,0,0,0.05)]')
                          }
                        >
                          {f.label}
                          <span
                            className={
                              'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ' +
                              (active ? 'bg-white/25 text-white' : 'bg-[#F0F1F5] text-[#9AA0A8]')
                            }
                          >
                            {filterCounts[f.key]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {filteredBills.length === 0 ? (
                    <div className={`${CARD} py-2`}>
                      <EmptyOperations hint="Здесь появятся счета: оплаченные и ожидающие оплаты" />
                    </div>
                  ) : (
                    groupedBills.map((g) => (
                      <div key={g.title} className="pt-2">
                        <div className="mb-1.5 px-1 text-[13px] font-semibold text-[#9AA0A8]" suppressHydrationWarning>
                          {g.title}
                        </div>
                        <div className={`${CARD} px-4 py-1`}>
                          <div className="divide-y divide-[#F0F1F5]">
                            {g.bills.map((b) => (
                              <BillRow key={b.id} bill={b} />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* НАЛОГИ */}
              {tab === 'taxes' && (
                <div className="space-y-3">
                  {/* Промо-карусель (светлые плашки; drag-логика не тронута) */}
                  <div>
                    <div
                      role="region"
                      aria-label="Промо и правила"
                      onScroll={onPromoScroll}
                      onPointerDown={onPromoPointerDown}
                      className="-mx-4 flex snap-x snap-mandatory cursor-grab gap-3 overflow-x-auto px-4 select-none [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
                      style={{ touchAction: 'pan-x' }}
                    >
                      <div className="relative h-[120px] w-[86%] shrink-0 snap-center overflow-hidden rounded-[20px] bg-[#E7F5EA] p-4 text-[#1A1A1A]">
                        <Coins className="absolute -right-3 -top-3 size-24 text-[#21A03A]/10" strokeWidth={1.4} aria-hidden="true" />
                        <div className="relative text-[26px] font-bold leading-none tabular-nums text-[#21A03A]">10 000 ₽</div>
                        <div className="relative mt-1.5 max-w-[80%] text-xs font-bold leading-snug">Лимит задолженности, после которого блокируются продажи</div>
                        <div className="relative mt-1 text-[10px] text-[#9AA0A8]">Следите за сроками оплаты</div>
                      </div>
                      <div className="relative h-[120px] w-[86%] shrink-0 snap-center overflow-hidden rounded-[20px] bg-[#D8E9FA] p-4 text-[#1A1A1A]">
                        <Sprout className="absolute -right-3 -top-3 size-24 text-[#174F7C]/10" strokeWidth={1.4} aria-hidden="true" />
                        <div className="relative text-[26px] font-bold leading-none text-[#174F7C]">{data.rate}%</div>
                        <div className="relative mt-1.5 max-w-[80%] text-xs font-bold leading-snug">с продаж другим игрокам — налог считается автоматически</div>
                        <div className="relative mt-1 text-[10px] text-[#9AA0A8]">Без отчётов и деклараций</div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center gap-1.5">
                      {[0, 1].map((i) => (
                        <span
                          key={i}
                          className={'h-1.5 rounded-full transition-all ' + (slide === i ? 'w-5 bg-[#21A03A]' : 'w-1.5 bg-[#D9DCE1]')}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Текущая задолженность */}
                  <div className={`${CARD} flex items-center justify-between p-4`}>
                    <div>
                      <div className="text-[11px] text-[#9AA0A8]">Текущая задолженность</div>
                      {data.taxDebt > 0 ? (
                        <div className="mt-0.5 text-xl font-bold tabular-nums text-[#1A1A1A]">{fmtMoney(data.taxDebt)}</div>
                      ) : (
                        <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-[#21A03A]">
                          <ShieldCheck className="size-4" aria-hidden="true" /> Задолженности нет
                        </div>
                      )}
                    </div>
                    <span className="rounded-full bg-[#E7F5EA] px-2.5 py-1 text-[11px] font-semibold text-[#21A03A]">
                      НПД {data.rate}%
                    </span>
                  </div>

                  <InfoCard
                    icon={Coins}
                    color={GREEN}
                    title={`${data.rate}% с каждой продажи`}
                    body={`Налог ${data.rate}% (НПД) начисляется автоматически с каждой успешной продажи другому игроку — отдельный счёт появляется в «Последних операциях».`}
                  />
                  <InfoCard
                    icon={Clock3}
                    color="#F8A13A"
                    title="Пеня — 10% в сутки"
                    body="Если счёт не оплачен более суток, начисляется пеня — 10% от суммы задолженности в сутки. Пеня добавляется к общему долгу."
                  />
                  <InfoCard
                    icon={AlertTriangle}
                    color="#E5584B"
                    title="Блокировка от 10 000 ₽"
                    body="При задолженности 10 000 ₽ и выше продажи блокируются до полной оплаты."
                    extra={
                      data.blocked ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#E5584B]">
                          <AlertTriangle className="size-3" aria-hidden="true" /> Продажи сейчас заблокированы
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F5EA] px-2.5 py-1 text-[11px] font-semibold text-[#21A03A]">
                          <CheckCircle2 className="size-3" aria-hidden="true" /> Продажи сейчас доступны
                        </span>
                      )
                    }
                  />
                  <InfoCard
                    icon={CheckCircle2}
                    color={GREEN}
                    title="Оплата в один счёт"
                    body="Кнопка «Оплатить налоги» на вкладке «Главная» сразу погашает всю задолженность с баланса вашего кошелька."
                  />
                </div>
              )}

              {/* ПРОЧЕЕ */}
              {tab === 'more' && (
                <div className="space-y-3">
                  {/* Профиль */}
                  <div className={CARD + ' p-4'}>
                    <div className="flex items-center gap-3">
                      <Avatar name={displayName} photoUrl={session?.photoUrl} className="size-11" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold text-[#1A1A1A]">{displayName}</div>
                        <div className="mt-0.5 truncate text-xs text-[#9AA0A8]">{session?.username ? `@${session.username}` : 'Игрок'}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F5EA] px-3 py-1.5 text-[11px] font-bold text-[#21A03A]">
                        <ShieldCheck className="size-3.5" aria-hidden="true" /> Самозанятый игрок
                      </span>
                    </div>
                    <div className="mt-3 divide-y divide-[#F0F1F5] border-t border-[#F0F1F5]">
                      {[
                        { label: 'ИНН', value: <span className="font-semibold tabular-nums">{inn}</span> },
                        { label: 'Город', value: session?.city || '—' },
                        { label: 'Баланс', value: <span className="font-semibold tabular-nums">{fmtMoney(session?.balance ?? 0)}</span> },
                        { label: 'Ставка НПД', value: <span className="font-semibold">{data.rate}%</span> },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                          <span className="text-[#9AA0A8]">{row.label}</span>
                          <span className="text-right text-[#1A1A1A]">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Свидетельство на мягком зелёном градиенте */}
                  <div
                    className="relative overflow-hidden rounded-[20px] p-4"
                    style={{ background: 'linear-gradient(135deg,#D3ECD3 0%,#E7F5EA 60%,#F5F6FA 100%)' }}
                  >
                    <BadgeCheck className="absolute -bottom-4 -right-4 size-28 text-[#21A03A]/10" strokeWidth={1.2} aria-hidden="true" />
                    <div className="relative flex items-center gap-2">
                      <BadgeCheck className="size-5 text-[#21A03A]" aria-hidden="true" />
                      <div className="text-sm font-bold text-[#1A1A1A]">Свидетельство</div>
                    </div>
                    <p className="relative mt-1.5 max-w-[75%] text-[11px] leading-relaxed text-[#9AA0A8]">
                      Постановка на учёт самозанятого игрока налогового сервиса «Налоги»
                    </p>
                    <div className="relative mt-3 space-y-1 text-[11px] text-[#1A1A1A]">
                      <div>
                        ИНН: <span className="font-bold tabular-nums">{inn}</span>
                      </div>
                      <div>
                        Статус: <span className="font-bold text-[#21A03A]">Действует</span>
                      </div>
                    </div>
                  </div>

                  {/* Итоги */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className={CARD + ' p-3.5'}>
                      <div className="text-[11px] text-[#9AA0A8]">Уплачено всего</div>
                      <div className="mt-1 text-base font-bold tabular-nums text-[#21A03A]">{fmtMoney(data.totalPaid)}</div>
                    </div>
                    <div className={CARD + ' p-3.5'}>
                      <div className="text-[11px] text-[#9AA0A8]">Всего заработано</div>
                      <div className="mt-1 text-base font-bold tabular-nums text-[#1A1A1A]">{fmtMoney(data.totalEarned)}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pb-1 pt-2 text-center text-[10px] text-[#9AA0A8]">
                Налоговый сервис игры · это симулятор, не реальная ФНС
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ===== НИЖНИЙ ТАБ-БАР (Сбер): белый, border-t #E8EAED, активный #21A03A ===== */}
      <nav className="relative z-10 shrink-0 border-t border-[#E8EAED] bg-white" aria-label="Навигация налогов">
        <div className="grid grid-cols-5 items-end px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
          <NavItem icon={Home} label="Главная" active={tab === 'home'} onClick={() => setTab('home')} />
          <NavItem icon={ReceiptText} label="Чеки" active={tab === 'bills'} onClick={() => setTab('bills')} />
          <div className="flex flex-col items-center">
            <button
              type="button"
              aria-label="Продажа"
              onClick={() => useOS.getState().pushToast('Налоги', 'Создание чека доступно после сделки')}
              className="-mt-7 flex size-14 items-center justify-center rounded-full bg-[#21A03A] text-white shadow-[0_8px_20px_rgba(33,160,58,0.35)] ring-4 ring-white transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} aria-hidden="true" />
            </button>
            <span className="mt-1 text-[10px] font-medium leading-none text-[#9AA0A8]">Продажа</span>
          </div>
          <NavItem icon={Coins} label="Налоги" active={tab === 'taxes'} onClick={() => setTab('taxes')} />
          <NavItem icon={MoreHorizontal} label="Прочее" active={tab === 'more'} onClick={() => setTab('more')} />
        </div>
      </nav>
    </div>
  )
}
