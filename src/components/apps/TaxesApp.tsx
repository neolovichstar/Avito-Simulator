'use client'

// Приложение «Налоги» — редизайн по мотивам госсервиса для самозанятых:
// тёмно-синяя шапка с показателями месяца и промо-каруселью, белый нижний лист
// с операциями, внутренняя нижняя навигация с крупной оранжевой кнопкой «Продажа».
// Палитра зафиксирована произвольными классами (bg-[#...]) — не зависит от тёмной темы ОС.
import { useCallback, useEffect, useMemo, useState, type ReactNode, type UIEvent } from 'react'
import {
  AlertTriangle, BadgeCheck, CheckCircle2, CircleHelp, Clock3, Coins, FileText, Home,
  Loader2, Mail, MoreHorizontal, Plus, ReceiptText, Sprout, type LucideIcon,
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

const INFO_TONES = {
  blue: { icon: 'bg-[#e7edfb] text-[#1b3b8c]' },
  amber: { icon: 'bg-[#fff3e2] text-[#c96a12]' },
  red: { icon: 'bg-[#fdecec] text-[#c0392b]' },
  green: { icon: 'bg-[#e4f6ec] text-[#188a52]' },
} as const

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
  const base = 'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/25 ' + className
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
      <Icon className={'size-[22px] ' + (active ? 'text-[#1b3b8c]' : 'text-[#98a1b0]')} strokeWidth={active ? 2.3 : 2} />
      <span
        className={
          'max-w-full truncate text-[10px] leading-none ' +
          (active ? 'font-bold text-[#1b3b8c]' : 'font-medium text-[#98a1b0]')
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
      <div className={'flex size-9 shrink-0 items-center justify-center rounded-full ' + (paid ? 'bg-[#e4f6ec]' : 'bg-[#fff3e2]')}>
        {paid
          ? <CheckCircle2 className="size-[18px] text-[#188a52]" />
          : <Clock3 className="size-[18px] text-[#c96a12]" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-[#1c2433]">{bill.reason}</div>
        <div className="mt-0.5 text-[11px] text-[#9aa3b2]">
          {fmtDateTime(bill.createdAt)}
          {paid && bill.paidAt ? ` · оплачен ${fmtDateTime(bill.paidAt)}` : ` · срок до ${fmtDateTime(bill.dueAt)}`}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[13px] font-bold tabular-nums text-[#1c2433]">{fmtMoney(bill.amount)}</span>
        <span
          className={
            'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
            (paid ? 'bg-[#e4f6ec] text-[#188a52]' : 'bg-[#fff3e2] text-[#c96a12]')
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
      <div className="flex size-14 items-center justify-center rounded-full bg-[#f1f3f8]">
        <FileText className="size-6 text-[#a8b0bf]" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#5c6474]">Список операций пуст</p>
      <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-[#9aa3b2]">{hint}</p>
    </div>
  )
}

function InfoCard({
  icon: Icon, tone, title, body, extra,
}: { icon: LucideIcon; tone: keyof typeof INFO_TONES; title: string; body: string; extra?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#eef1f6] bg-white p-4">
      <div className={'flex size-9 shrink-0 items-center justify-center rounded-full ' + INFO_TONES[tone].icon}>
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-[#1c2433]">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-[#6b7382]">{body}</p>
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
  const filteredBills = (data?.bills ?? []).filter((b) =>
    billFilter === 'all' ? true : b.status === billFilter,
  )

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

  const payButton = data && (
    <>
      {payError && (
        <div className="mt-3 rounded-xl border border-[#f5d3d3] bg-[#fdecec] px-3 py-2 text-xs text-[#b3261e]">{payError}</div>
      )}
      {data.blocked && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-[#f5d3d3] bg-[#fdecec] p-3.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#c0392b]" />
          <div className="text-xs leading-relaxed text-[#8f2b25]">
            <span className="font-bold">Продажи заблокированы.</span> Погасите задолженность кнопкой «Оплатить налоги»,
            чтобы снова выставлять товары на продажу.
          </div>
        </div>
      )}
      <button
        onClick={payAll}
        disabled={busy || data.taxDebt <= 0}
        className={
          'mt-4 flex h-12 w-full items-center justify-center rounded-2xl text-sm font-bold text-white transition-colors ' +
          (data.taxDebt > 0 ? 'bg-[#1b3b8c] active:bg-[#16327a]' : 'bg-[#b9c3dc]')
        }
      >
        {busy
          ? <Loader2 className="size-5 animate-spin" />
          : data.taxDebt > 0
            ? `Оплатить налоги · ${fmtMoney(data.taxDebt)}`
            : 'Задолженности нет'}
      </button>
    </>
  )

  return (
    <div className="flex h-full flex-col bg-white text-[#1c2433]">
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div>
            <div className="h-64 bg-[linear-gradient(180deg,#1b3b8c_0%,#14295f_100%)]" />
            <div className="-mt-8 px-4">
              <div className="h-64 animate-pulse rounded-t-[28px] bg-[#f5f7fb]" />
            </div>
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#9aa3b2]">
              <Loader2 className="size-4 animate-spin" /> Загрузка данных…
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4 pt-8">
            <div className="rounded-2xl border border-[#f5d3d3] bg-[#fdecec] p-6 text-center">
              <AlertTriangle className="mx-auto size-6 text-[#c0392b]" />
              <p className="mt-2 text-sm font-medium text-[#8f2b25]">{error}</p>
              <button
                onClick={load}
                className="mt-4 h-10 rounded-xl bg-[#1b3b8c] px-5 text-sm font-semibold text-white"
              >
                Повторить
              </button>
            </div>
          </div>
        ) : data ? (
          <>
            {/* Тёмно-синяя шапка госсервиса */}
            <div className="bg-[linear-gradient(180deg,#1b3b8c_0%,#14295f_100%)] px-4 pb-16 pt-5 text-white">
              <div className="flex items-center gap-3">
                <Avatar name={displayName} photoUrl={session?.photoUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold uppercase tracking-wide">{displayName}</div>
                  <div className="text-[11px] text-white/60">Самозанятый игрок</div>
                </div>
                <button aria-label="Уведомления" className="relative flex size-9 items-center justify-center rounded-full active:bg-white/10">
                  <Mail className="size-5" />
                  <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-[#f4771f] text-[9px] font-bold leading-none text-white ring-2 ring-[#1b3b8c]">
                    1
                  </span>
                </button>
                <button aria-label="Справка" className="flex size-9 items-center justify-center rounded-full active:bg-white/10">
                  <CircleHelp className="size-5" />
                </button>
              </div>

              {tab === 'home' ? (
                <>
                  {/* Показатели месяца */}
                  <div className="mt-7">
                    <div className="text-xs text-white/65">Выручка за {monthLabel}</div>
                    <div className="mt-1.5 text-[34px] font-extrabold leading-none tabular-nums">{fmtMoney(revenueThisMonth)}</div>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-white/65">Предварительный налог за {monthLabel}</div>
                      <div className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(data.taxDebt)}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                      НПД {data.rate}%
                    </span>
                  </div>

                  {/* Промо-карусель */}
                  <div className="mt-6">
                    <div
                      onScroll={onPromoScroll}
                      onPointerDown={onPromoPointerDown}
                      className="-mx-4 flex snap-x snap-mandatory cursor-grab gap-3 overflow-x-auto px-4 select-none [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
                    >
                      <div className="relative h-[120px] w-[86%] shrink-0 snap-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#e9efff_0%,#d3dfff_100%)] p-4 text-[#1b3b8c]">
                        <Coins className="absolute -right-3 -top-3 size-24 text-[#1b3b8c]/10" strokeWidth={1.4} />
                        <div className="relative text-[26px] font-extrabold leading-none tabular-nums">10 000 ₽</div>
                        <div className="relative mt-1.5 max-w-[80%] text-xs font-bold leading-snug">Ваш бонус на уплату налога</div>
                        <div className="relative mt-1 text-[10px] text-[#1b3b8c]/60">Лимит, после которого блокируются продажи</div>
                      </div>
                      <div className="relative h-[120px] w-[86%] shrink-0 snap-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#25a568_0%,#128a52_100%)] p-4 text-white">
                        <Sprout className="absolute -right-3 -top-3 size-24 text-white/15" strokeWidth={1.4} />
                        <div className="relative text-[26px] font-extrabold leading-none">{data.rate}%</div>
                        <div className="relative mt-1.5 max-w-[80%] text-xs font-bold leading-snug">с продаж другим игрокам — налог считается автоматически</div>
                        <div className="relative mt-1 text-[10px] text-white/70">Без отчётов и деклараций</div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center gap-1.5">
                      {[0, 1].map((i) => (
                        <span
                          key={i}
                          className={'h-1.5 rounded-full transition-all ' + (slide === i ? 'w-5 bg-white' : 'w-1.5 bg-white/40')}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-7">
                  <h1 className="text-[26px] font-extrabold leading-tight">{TAB_TITLES[tab].title}</h1>
                  <p className="mt-1 text-xs text-white/60">{TAB_TITLES[tab].sub}</p>
                </div>
              )}
            </div>

            {/* Белый нижний лист с контентом */}
            <div className="relative -mt-8 rounded-t-[28px] bg-white px-4 pb-8 pt-4 shadow-[0_-10px_30px_rgba(13,30,80,0.16)]">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#e3e7ef]" />

              {/* ГЛАВНАЯ */}
              {tab === 'home' && (
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-bold">Последние операции</h2>
                    {data.bills.length > 0 && (
                      <button onClick={() => setTab('bills')} className="text-xs font-semibold text-[#1b3b8c] active:opacity-70">
                        Показать все
                      </button>
                    )}
                  </div>
                  {data.bills.length === 0 ? (
                    <EmptyOperations hint="Продавайте товары — налоговые начисления появятся здесь" />
                  ) : (
                    <div className="divide-y divide-[#eef1f6]">
                      {data.bills.slice(0, 4).map((b) => (
                        <BillRow key={b.id} bill={b} />
                      ))}
                    </div>
                  )}
                  {payButton}
                </div>
              )}

              {/* ЧЕКИ / СЧЕТА */}
              {tab === 'bills' && (
                <div>
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {BILL_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setBillFilter(f.key)}
                        className={
                          'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ' +
                          (billFilter === f.key ? 'bg-[#1b3b8c] text-white' : 'bg-[#f1f3f8] text-[#5c6474]')
                        }
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {filteredBills.length === 0 ? (
                    <EmptyOperations hint="Здесь появятся счета: оплаченные и ожидающие оплаты" />
                  ) : (
                    <div className="mt-2 divide-y divide-[#eef1f6]">
                      {filteredBills.map((b) => (
                        <BillRow key={b.id} bill={b} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* НАЛОГИ */}
              {tab === 'taxes' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-2xl bg-[#f6f8fc] p-4">
                    <div>
                      <div className="text-[11px] text-[#7a8394]">Текущая задолженность</div>
                      {data.taxDebt > 0 ? (
                        <div className="mt-0.5 text-xl font-extrabold tabular-nums text-[#c0392b]">{fmtMoney(data.taxDebt)}</div>
                      ) : (
                        <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-[#188a52]">
                          <CheckCircle2 className="size-4" /> Задолженности нет
                        </div>
                      )}
                    </div>
                    <span className="rounded-full bg-[#e7edfb] px-2.5 py-1 text-[11px] font-semibold text-[#1b3b8c]">
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
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdecec] px-2.5 py-1 text-[11px] font-semibold text-[#c0392b]">
                          <AlertTriangle className="size-3" /> Продажи сейчас заблокированы
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e4f6ec] px-2.5 py-1 text-[11px] font-semibold text-[#188a52]">
                          <CheckCircle2 className="size-3" /> Продажи сейчас доступны
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
                  <div className="rounded-2xl border border-[#eef1f6] p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-[linear-gradient(180deg,#1b3b8c_0%,#14295f_100%)] p-0.5">
                        <Avatar name={displayName} photoUrl={session?.photoUrl} className="size-11" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold">{displayName}</div>
                        <div className="mt-0.5 truncate text-xs text-[#7a8394]">{session?.username ? `@${session.username}` : 'Игрок'}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7edfb] px-3 py-1.5 text-[11px] font-bold text-[#1b3b8c]">
                        <BadgeCheck className="size-3.5" /> Самозанятый игрок
                      </span>
                    </div>
                    <div className="mt-3 divide-y divide-[#eef1f6] border-t border-[#eef1f6]">
                      {[
                        { label: 'ИНН', value: <span className="font-semibold tabular-nums">{inn}</span> },
                        { label: 'Город', value: session?.city || '—' },
                        { label: 'Баланс', value: <span className="font-semibold tabular-nums">{fmtMoney(session?.balance ?? 0)}</span> },
                        { label: 'Ставка НПД', value: <span className="font-semibold">{data.rate}%</span> },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                          <span className="text-[#7a8394]">{row.label}</span>
                          <span className="text-right text-[#1c2433]">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Свидетельство с декоративной печатью */}
                  <div className="relative overflow-hidden rounded-2xl border border-[#dfe6f5] bg-[linear-gradient(135deg,#f7f9ff_0%,#edf2fd_100%)] p-4">
                    <BadgeCheck className="absolute -bottom-4 -right-4 size-28 text-[#1b3b8c]/10" strokeWidth={1.2} />
                    <div className="relative flex items-center gap-2">
                      <BadgeCheck className="size-5 text-[#1b3b8c]" />
                      <div className="text-sm font-extrabold text-[#1b3b8c]">Свидетельство</div>
                    </div>
                    <p className="relative mt-1.5 max-w-[75%] text-[11px] leading-relaxed text-[#5c6474]">
                      Постановка на учёт самозанятого игрока налогового сервиса «Налоги»
                    </p>
                    <div className="relative mt-3 space-y-1 text-[11px] text-[#1c2433]">
                      <div>
                        ИНН: <span className="font-bold tabular-nums">{inn}</span>
                      </div>
                      <div>
                        Статус: <span className="font-bold text-[#188a52]">Действует</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#f6f8fc] p-3.5">
                      <div className="text-[11px] text-[#7a8394]">Уплачено всего</div>
                      <div className="mt-1 text-base font-bold tabular-nums text-[#188a52]">{fmtMoney(data.totalPaid)}</div>
                    </div>
                    <div className="rounded-2xl bg-[#f6f8fc] p-3.5">
                      <div className="text-[11px] text-[#7a8394]">Всего заработано</div>
                      <div className="mt-1 text-base font-bold tabular-nums">{fmtMoney(data.totalEarned)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Нижняя навигация внутри приложения */}
      <nav className="relative z-10 shrink-0 border-t border-[#e8ebf1] bg-white px-1 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-5 items-end">
          <NavItem icon={Home} label="Главная" active={tab === 'home'} onClick={() => setTab('home')} />
          <NavItem icon={ReceiptText} label="Чеки/Счета" active={tab === 'bills'} onClick={() => setTab('bills')} />
          <div className="flex flex-col items-center">
            <button
              aria-label="Продажа"
              onClick={() => useOS.getState().pushToast('Налоги', 'Создание чека доступно после сделки')}
              className="-mt-7 flex size-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ff8a3d_0%,#f26a1b_100%)] text-white shadow-[0_8px_20px_rgba(242,106,27,0.45)] ring-4 ring-white transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </button>
            <span className="mt-1 text-[10px] font-medium leading-none text-[#98a1b0]">Продажа</span>
          </div>
          <NavItem icon={Coins} label="Налоги" active={tab === 'taxes'} onClick={() => setTab('taxes')} />
          <NavItem icon={MoreHorizontal} label="Прочее" active={tab === 'more'} onClick={() => setTab('more')} />
        </div>
      </nav>
    </div>
  )
}
