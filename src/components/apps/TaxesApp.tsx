'use client'

// Приложение «Налоги» — стиль госсервиса «ФНС Личный кабинет»: светло-серый фон, тёмная slate-шапка.
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Landmark, Loader2, ReceiptText, ShieldCheck,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, fmtDateTime } from '@/lib/format'
import type { TaxData } from '@/lib/types'
import { Button } from '@/components/ui/button'

export default function TaxesApp() {
  const [data, setData] = useState<TaxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

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

  return (
    <div className="h-full flex flex-col bg-[#f2f3f5] text-neutral-900">
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading && !data ? (
          <div>
            <div className="h-28 bg-[#1e293b]" />
            <div className="px-4">
              <div className="-mt-10 h-40 rounded-2xl bg-white shadow-sm animate-pulse" />
              <div className="mt-4 h-32 rounded-2xl bg-white shadow-sm animate-pulse" />
              <div className="flex items-center justify-center gap-2 pt-6 text-sm text-neutral-400">
                <Loader2 className="size-4 animate-spin" /> Загрузка данных…
              </div>
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4 pt-8">
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-700">{error}</p>
              <Button className="mt-4 rounded-xl" onClick={load}>
                Повторить
              </Button>
            </div>
          </div>
        ) : data ? (
          <>
            {/* Шапка госсервиса */}
            <div className="bg-[#1e293b] px-4 pb-12 pt-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10">
                  <Landmark className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Налоговая · Личный кабинет</div>
                  <div className="text-[11px] text-white/60">Налог на профессиональный доход</div>
                </div>
              </div>
            </div>

            <div className="-mt-8 space-y-4 px-4 pb-6">
              {/* Статус налогоплательщика */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Статус: Самозанятый</div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {Math.round(data.rate * 100)}% НПД
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">Налог 4% с каждой продажи</p>

                <div className="mt-4 border-t border-neutral-100 pt-4">
                  <div className="text-xs text-neutral-500">Задолженность</div>
                  {data.taxDebt > 0 ? (
                    <div className="mt-0.5 text-3xl font-bold text-red-600">{fmtMoney(data.taxDebt)}</div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-emerald-600">
                      <CheckCircle2 className="size-5" />
                      Задолженности нет
                    </div>
                  )}
                </div>

                {payError && (
                  <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{payError}</div>
                )}

                <Button
                  className="mt-4 h-11 w-full rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: data.taxDebt > 0 ? '#1e293b' : '#cbd5e1' }}
                  disabled={busy || data.taxDebt <= 0}
                  onClick={payAll}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : 'Оплатить всё'}
                </Button>
              </div>

              {/* Баннер блокировки */}
              {data.blocked && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                  <div className="text-xs leading-relaxed text-red-700">
                    <span className="font-semibold">Продажи заблокированы.</span> Погасите задолженность в разделе
                    «Оплатить», чтобы снова выставлять товары на продажу.
                  </div>
                </div>
              )}

              {/* Счёта */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-slate-500" />
                  <div className="text-sm font-semibold">Начисления</div>
                </div>
                {data.bills.length === 0 ? (
                  <p className="mt-3 text-xs text-neutral-400">Начислений пока нет. Продавайте — и не забывайте платить налоги.</p>
                ) : (
                  <div className="mt-1 max-h-96 divide-y divide-neutral-100 overflow-y-auto [scrollbar-width:thin]">
                    {data.bills.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{b.reason}</div>
                          <div className="text-[11px] text-neutral-400">
                            {fmtDateTime(b.createdAt)}
                            {b.status === 'paid' && b.paidAt ? ` · оплачен ${fmtDateTime(b.paidAt)}` : ` · срок ${fmtDateTime(b.dueAt)}`}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-semibold">{fmtMoney(b.amount)}</span>
                          <span
                            className={
                              'rounded-full px-2 py-0.5 text-[10px] font-medium ' +
                              (b.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')
                            }
                          >
                            {b.status === 'paid' ? 'Оплачен' : 'Не оплачен'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Статистика */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-3.5 shadow-sm">
                  <div className="text-[11px] text-neutral-500">Уплачено всего</div>
                  <div className="mt-1 text-base font-semibold text-emerald-600">{fmtMoney(data.totalPaid)}</div>
                </div>
                <div className="rounded-2xl bg-white p-3.5 shadow-sm">
                  <div className="text-[11px] text-neutral-500">Всего заработано</div>
                  <div className="mt-1 text-base font-semibold">{fmtMoney(data.totalEarned)}</div>
                </div>
              </div>

              {/* Справка */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-slate-500" />
                  <div className="text-sm font-semibold">Справка</div>
                </div>
                <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-neutral-600">
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" />
                    Налог 4% начисляется автоматически с каждой успешной продажи.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" />
                    Если счёт не оплачен более суток, начисляется пеня — 10% от суммы задолженности в сутки.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" />
                    При задолженности 10 000 ₽ и выше продажи блокируются до полной оплаты.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" />
                    Кнопка «Оплатить всё» сразу погашает всю задолженность с вашего баланса.
                  </li>
                </ul>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
