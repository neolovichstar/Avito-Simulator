'use client'

// Фискальный мониторинг: неоплаченные налоги и живые кредиты игроков.
// Действия: списать налог (forgive) или закрыть кредит (writeoff).

import { useEffect, useState } from 'react'
import { BadgePercent, Banknote, CalendarClock, Landmark, Scale } from 'lucide-react'
import { adminApi, type FinanceData, type LoanRow, type TaxBillRow } from '@/lib/admin-client'
import { Badge, Btn, Card, EmptyState, fmtDT, fmtMoney, fmtRel, Page, StatCard, Td, Th } from './ui'

export default function FinanceSection({
  onToast,
  refreshKey = 0,
}: {
  onToast: (t: string, ok: boolean) => void
  refreshKey?: number
}) {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tax' | 'loans'>('tax')
  const [busyId, setBusyId] = useState('')

  const load = () => {
    setLoading(true)
    adminApi
      .finance()
      .then(setData)
      .catch(() => onToast('Не удалось загрузить финансы', false))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
     
  }, [refreshKey])

  const forgiveTax = async (b: TaxBillRow) => {
    setBusyId(b.id)
    try {
      await adminApi.financeAction({ kind: 'tax', id: b.id })
      onToast(`Налог ${fmtMoney(b.amount)} (${b.user.name}) списан`, true)
      load()
    } catch {
      onToast('Не удалось списать налог', false)
    } finally {
      setBusyId('')
    }
  }

  const writeoffLoan = async (l: LoanRow) => {
    setBusyId(l.id)
    try {
      await adminApi.financeAction({ kind: 'loan', id: l.id })
      onToast(`Кредит ${l.user.name} закрыт (списано ${fmtMoney(l.owed)})`, true)
      load()
    } catch {
      onToast('Не удалось списать кредит', false)
    } finally {
      setBusyId('')
    }
  }

  const s = data?.summary

  return (
    <Page title="Финансы" sub="Налоговые счета и кредиты игроков · списание доступно в один клик">
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Неоплачено налогов" value={s ? fmtMoney(s.unpaidTaxSum) : '—'} icon={<Landmark className="size-4" />} accent loading={loading} />
        <StatCard label="Просроченных счетов" value={s ? String(s.overdueTaxCount) : '—'} icon={<CalendarClock className="size-4" />} loading={loading} />
        <StatCard label="Живых кредитов" value={s ? String(s.loansCount) : '—'} icon={<BadgePercent className="size-4" />} loading={loading} />
        <StatCard label="Остаток по кредитам" value={s ? fmtMoney(s.loansOwedSum) : '—'} icon={<Banknote className="size-4" />} loading={loading} />
      </div>

      <div className="mb-3 flex rounded-xl bg-black/30 p-1 ring-1 ring-white/10 w-fit">
        {[
          { key: 'tax' as const, label: `Налоги${s ? ` · ${s.unpaidTaxCount}` : ''}` },
          { key: 'loans' as const, label: `Кредиты${s ? ` · ${s.loansCount}` : ''}` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`h-8 rounded-lg px-4 text-[12.5px] font-semibold transition-all ${
              tab === t.key ? 'bg-[#21A038] text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {tab === 'tax' ? (
          !data || data.taxBills.length === 0 ? (
            <EmptyState icon={<Scale className="size-6" />} title="Неоплаченных налогов нет" sub="Все игроки чисты перед ФНС" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-white/[0.06]">
                  <tr>
                    <Th>Игрок</Th>
                    <Th>Сумма</Th>
                    <Th>Основание</Th>
                    <Th>Срок</Th>
                    <Th className="w-[130px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {data.taxBills.map((b) => (
                    <tr key={b.id} className="transition-colors hover:bg-white/[0.02]">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          {b.user.photoUrl ? (
                            <img src={b.user.photoUrl} alt="" className="size-7 rounded-full object-cover" />
                          ) : (
                            <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.07] text-[11px] font-bold text-zinc-400">
                              {b.user.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <div>
                            <div className="font-semibold text-zinc-200">
                              {b.user.name}
                              {b.user.isBot && ' 🤖'}
                            </div>
                            <div className="text-[11px] text-zinc-500">@{b.user.username}</div>
                          </div>
                        </div>
                      </Td>
                      <Td className="font-bold tabular-nums text-zinc-100">{fmtMoney(b.amount)}</Td>
                      <Td className="text-zinc-400">{b.reason}</Td>
                      <Td>
                        {b.overdue ? <Badge tone="red">Просрочен</Badge> : <Badge tone="amber">Ожидается</Badge>}
                        <span className="ml-2 text-[11.5px] text-zinc-500">{fmtDT(b.dueAt)}</span>
                      </Td>
                      <Td>
                        <Btn size="sm" variant="danger" loading={busyId === b.id} onClick={() => forgiveTax(b)} title="Списать налог игроку">
                          Списать
                        </Btn>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !data || data.loans.length === 0 ? (
          <EmptyState icon={<Banknote className="size-6" />} title="Живых кредитов нет" sub="Все займы погашены" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <Th>Заёмщик</Th>
                  <Th>Тело</Th>
                  <Th>Остаток</Th>
                  <Th>Ставка</Th>
                  <Th>Погашение</Th>
                  <Th className="w-[130px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.loans.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-white/[0.02]">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        {l.user.photoUrl ? (
                          <img src={l.user.photoUrl} alt="" className="size-7 rounded-full object-cover" />
                        ) : (
                          <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.07] text-[11px] font-bold text-zinc-400">
                            {l.user.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <div className="font-semibold text-zinc-200">
                            {l.user.name}
                            {l.user.isBot && ' 🤖'}
                          </div>
                          <div className="text-[11px] text-zinc-500">баланс {fmtMoney(l.user.balance)}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="tabular-nums text-zinc-400">{fmtMoney(l.principal)}</Td>
                    <Td className="font-bold tabular-nums text-zinc-100">{fmtMoney(l.owed)}</Td>
                    <Td className="tabular-nums text-zinc-400">{l.rate}%</Td>
                    <Td>
                      {l.overdue ? <Badge tone="red">Просрочен</Badge> : <Badge tone="amber">По графику</Badge>}
                      <span className="ml-2 text-[11.5px] text-zinc-500">{fmtRel(l.dueAt)}</span>
                    </Td>
                    <Td>
                      <Btn size="sm" variant="danger" loading={busyId === l.id} onClick={() => writeoffLoan(l)} title="Закрыть кредит списанием">
                        Списать
                      </Btn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  )
}
