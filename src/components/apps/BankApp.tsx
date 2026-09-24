'use client'

// Приложение «Банк» — стиль Сбербанк-онлайн: белый фон, зелёный акцент #21A038.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, Banknote, CreditCard, FileDown, Gauge, HandCoins, Landmark,
  Loader2, PiggyBank, TrendingUp,
} from 'lucide-react'
import { api, ApiError, exportCsvUrl } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, timeAgo } from '@/lib/format'
import { TX_TYPE_LABEL } from '@/lib/types'
import type { BankData, SessionUser } from '@/lib/types'
import { creditLabel } from '@/lib/economy'
import { useCountUp } from '@/lib/use-count-up'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'

type Tab = 'Главная' | 'История' | 'Кредит' | 'Вклад'

const GREEN = '#21A038'

function toAmount(v: string): number {
  return Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, '')) || 0))
}

export default function BankApp() {
  const session = useOS((s) => s.session)
  const [data, setData] = useState<BankData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('Главная')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [loanAmount, setLoanAmount] = useState(5000)
  const [repayAmount, setRepayAmount] = useState(0)
  const [depositInput, setDepositInput] = useState('1000')
  const tabsRef = useRef<HTMLDivElement | null>(null)
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

  const jumpTo = (t: Tab) => {
    setTab(t)
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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

  const tabs: Tab[] = ['Главная', 'История', 'Кредит', 'Вклад']

  return (
    <div className="h-full flex flex-col bg-white text-neutral-900">
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="p-4 space-y-4">
            <div className="h-48 rounded-2xl bg-neutral-200 animate-pulse" />
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-9 flex-1 rounded-full bg-neutral-200 animate-pulse" />
              ))}
            </div>
            <div className="h-24 rounded-2xl bg-neutral-200 animate-pulse" />
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
              <Loader2 className="size-4 animate-spin" /> Загрузка банка…
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4">
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-700">{error}</p>
              <Button className="mt-4 rounded-xl" onClick={load}>
                Повторить
              </Button>
            </div>
          </div>
        ) : data ? (
          <div className="p-4 space-y-4">
            {/* Банковская карта */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0E5A2F] via-[#1E8A46] to-[#0A3D1F] p-5 text-white shadow-lg shadow-emerald-900/20">
              <div className="pointer-events-none absolute -right-10 -top-14 size-44 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-16 -left-8 size-40 rounded-full bg-white/5" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="size-5" />
                    <span className="text-sm font-semibold tracking-wide">Столичный Банк</span>
                  </div>
                  {/* Чип */}
                  <div className="h-8 w-11 rounded-md bg-gradient-to-br from-yellow-200 via-yellow-400 to-yellow-500 p-[3px] shadow-inner">
                    <div className="grid h-full w-full grid-cols-3 gap-[2px]">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded-[2px] border border-yellow-700/50" />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 font-mono text-lg tracking-[0.16em] text-white/95">
                  {data.cardNumber}
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-white/60">Держатель</div>
                    <div className="truncate text-sm font-semibold uppercase">{holderName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-white/60">Баланс</div>
                    <div className="text-2xl font-bold tabular-nums">{fmtMoney(animatedBalance)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Кнопки-чипы */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              <button
                onClick={() => jumpTo('Вклад')}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-[#177A2B] transition active:scale-95"
              >
                <ArrowDownToLine className="size-3.5" /> Пополнить вклад
              </button>
              <button
                onClick={() => jumpTo('Вклад')}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-[#177A2B] transition active:scale-95"
              >
                <ArrowUpFromLine className="size-3.5" /> Снять
              </button>
              <button
                onClick={() => jumpTo('Кредит')}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-[#177A2B] transition active:scale-95"
              >
                <Banknote className="size-3.5" /> Взять кредит
              </button>
              <button
                onClick={() => jumpTo('Кредит')}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-[#177A2B] transition active:scale-95"
              >
                <HandCoins className="size-3.5" /> Погасить
              </button>
            </div>

            {/* Табы */}
            <div ref={tabsRef} className="scroll-mt-2">
              <div className="grid grid-cols-4 rounded-2xl bg-neutral-100 p-1">
                {tabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={
                      'rounded-xl px-2 py-2 text-xs font-medium transition ' +
                      (tab === t ? 'bg-white shadow-sm text-[#177A2B]' : 'text-neutral-500 hover:text-neutral-700')
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {formError && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</div>
            )}

            {/* ГЛАВНАЯ */}
            {tab === 'Главная' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <PiggyBank className="size-3.5 text-emerald-600" /> Вклад
                    </div>
                    <div className="mt-1 text-lg font-semibold">{fmtMoney(data.deposit)}</div>
                    <div className="text-[11px] text-neutral-400">0.1% в час</div>
                  </div>
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <CreditCard className="size-3.5 text-emerald-600" /> Долг по кредиту
                    </div>
                    {data.debt > 0 ? (
                      <>
                        <div className="mt-1 text-lg font-semibold text-red-600">{fmtMoney(data.debt)}</div>
                        <div className="text-[11px] text-neutral-400">гасите в разделе «Кредит»</div>
                      </>
                    ) : (
                      <>
                        <div className="mt-1 text-lg font-semibold text-[#21A038]">Нет долгов</div>
                        <div className="text-[11px] text-neutral-400">всё погашено</div>
                      </>
                    )}
                  </div>
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Banknote className="size-3.5 text-emerald-600" /> Лимит кредита
                    </div>
                    <div className="mt-1 text-lg font-semibold">{fmtMoney(data.loanLimit)}</div>
                    <div className="text-[11px] text-neutral-400">уровень {data.level} + рейтинг</div>
                  </div>
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Gauge className="size-3.5 text-emerald-600" /> Кредитный рейтинг
                    </div>
                    <div className={`mt-1 text-lg font-semibold ${creditLabel(data.creditScore ?? 500).cls}`}>
                      {data.creditScore ?? 500}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {creditLabel(data.creditScore ?? 500).label} · ставка {data.creditRate ?? 15}%
                    </div>
                  </div>
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <TrendingUp className="size-3.5 text-emerald-600" /> Уровень
                    </div>
                    <div className="mt-1 text-lg font-semibold">{data.level}</div>
                    <div className="text-[11px] text-neutral-400">лимит растёт с уровнем</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-100 p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Последние операции</div>
                    <button className="text-xs font-medium text-[#177A2B]" onClick={() => jumpTo('История')}>
                      Вся история
                    </button>
                  </div>
                  {data.transactions.length === 0 ? (
                    <p className="mt-3 text-xs text-neutral-400">Операций пока нет — купите или продайте что-нибудь.</p>
                  ) : (
                    <div className="mt-1 divide-y divide-neutral-100">
                      {data.transactions.slice(0, 3).map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{TX_TYPE_LABEL[t.type] ?? t.type}</div>
                            <div className="truncate text-[11px] text-neutral-400">
                              {t.counterpartyName ?? t.note ?? '—'} · {timeAgo(t.createdAt)}
                            </div>
                          </div>
                          <div className={'shrink-0 text-sm font-semibold ' + (t.amount >= 0 ? 'text-[#21A038]' : 'text-red-600')}>
                            {t.amount >= 0 ? '+' : ''}
                            {fmtMoney(t.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ИСТОРИЯ */}
            {tab === 'История' && (
              <div className="rounded-2xl border border-neutral-100 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">История операций</div>
                  {data.transactions.length > 0 && (
                    <a
                      href={exportCsvUrl()}
                      download
                      aria-label="Скачать историю операций в CSV"
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[#21A038]/10 px-3 text-[11px] font-semibold text-[#177A2B] outline-none transition-colors hover:bg-[#21A038]/20 focus-visible:ring-2 focus-visible:ring-[#21A038]/40"
                    >
                      <FileDown className="size-3.5" aria-hidden="true" />
                      CSV
                    </a>
                  )}
                </div>
                {data.transactions.length === 0 ? (
                  <p className="mt-3 text-xs text-neutral-400">Здесь появятся все ваши покупки, продажи и операции с банком.</p>
                ) : (
                  <div className="mt-1 max-h-96 overflow-y-auto divide-y divide-neutral-100 [scrollbar-width:thin]">
                    {data.transactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{TX_TYPE_LABEL[t.type] ?? t.type}</div>
                          <div className="truncate text-[11px] text-neutral-400">
                            {t.counterpartyName ?? t.note ?? '—'} · {timeAgo(t.createdAt)}
                          </div>
                        </div>
                        <div className={'shrink-0 text-sm font-semibold ' + (t.amount >= 0 ? 'text-[#21A038]' : 'text-red-600')}>
                          {t.amount >= 0 ? '+' : ''}
                          {fmtMoney(t.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* КРЕДИТ */}
            {tab === 'Кредит' && (
              <div className="rounded-2xl border border-neutral-100 p-4">
                {data.activeLoan ? (
                  <>
                    <div className="text-sm font-semibold">Активный кредит</div>
                    <div className="mt-2 rounded-xl bg-red-50 p-3.5">
                      <div className="text-xs text-red-500">Остаток долга</div>
                      <div className="text-2xl font-bold text-red-600">{fmtMoney(data.activeLoan.owed)}</div>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-neutral-500">
                      <div className="flex justify-between">
                        <span>Выдано</span>
                        <span className="font-medium text-neutral-700">{fmtMoney(data.activeLoan.principal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ставка</span>
                        <span className="font-medium text-neutral-700">{data.activeLoan.rate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Срок до</span>
                        <span className="font-medium text-neutral-700">
                          {new Date(data.activeLoan.dueAt).toLocaleString('ru-RU', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-neutral-500">Сумма погашения</div>
                      <Input
                        className="mt-1.5 h-11 rounded-xl text-base font-semibold"
                        inputMode="numeric"
                        value={repayAmount ? String(repayAmount) : ''}
                        placeholder="0"
                        onChange={(e) => setRepayAmount(Math.min(toAmount(e.target.value), data.activeLoan?.owed ?? 0))}
                      />
                      <Slider
                        className="mt-4"
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
                    <div className="text-sm font-semibold">Взять кредит</div>
                    <div className="mt-2 rounded-xl bg-emerald-50 p-3.5">
                      <div className="text-xs text-emerald-700/70">Сумма кредита</div>
                      <div className="text-2xl font-bold text-[#177A2B]">{fmtMoney(loanAmount)}</div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-neutral-500">От 1 000 до {fmtMoney(Math.max(1000, data.loanLimit))}</div>
                      <Input
                        className="mt-1.5 h-11 rounded-xl text-base font-semibold"
                        inputMode="numeric"
                        value={loanAmount ? String(loanAmount) : ''}
                        placeholder="0"
                        onChange={(e) => setLoanAmount(Math.min(toAmount(e.target.value), Math.max(1000, data.loanLimit)))}
                      />
                      <Slider
                        className="mt-4"
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
                      Ставка {data.creditRate ?? 15}%, срок 7 дней. Погашение вовремя повышает рейтинг (+40), просрочка роняет его (−80).
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ВКЛАД */}
            {tab === 'Вклад' && (
              <div className="rounded-2xl border border-neutral-100 p-4">
                <div className="text-sm font-semibold">Накопительный вклад</div>
                <div className="mt-2 rounded-xl bg-emerald-50 p-3.5">
                  <div className="text-xs text-emerald-700/70">На вкладе</div>
                  <div className="text-2xl font-bold text-[#177A2B]">{fmtMoney(data.deposit)}</div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                  Проценты начисляются каждый час: 0.1% от суммы вклада. Деньги на вкладе не тратятся на покупки —
                  снимите их, когда соберётесь на закупку.
                </p>

                <div className="mt-4">
                  <div className="text-xs text-neutral-500">Сумма</div>
                  <Input
                    className="mt-1.5 h-11 rounded-xl text-base font-semibold"
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
                    className="h-11 rounded-xl border-emerald-200 text-sm font-semibold text-[#177A2B]"
                    disabled={busy || toAmount(depositInput) <= 0}
                    onClick={() => applyMutation(() => api.depositOp(toAmount(depositInput), 'withdraw'))}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : 'Снять'}
                  </Button>
                </div>
              </div>
            )}

            <div className="pb-2 text-center text-[10px] text-neutral-300">
              Столичный Банк · вклады не застрахованы, это игра
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
