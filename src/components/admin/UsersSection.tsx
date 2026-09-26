'use client'

// Игроки: поиск, фильтр боты/реальные, правка баланса/налогов/рейтинга.

import { useEffect, useRef, useState } from 'react'
import { Bot, Search, Users, Wallet } from 'lucide-react'
import { adminApi, type AdminUser, type UsersPage } from '@/lib/admin-client'
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  fmtDT,
  fmtMoney,
  fmtRel,
  Input,
  Modal,
  Page,
  Pagination,
  Td,
  Th,
} from './ui'

export default function UsersSection({ onToast, refreshKey = 0 }: { onToast: (t: string, ok: boolean) => void; refreshKey?: number }) {
  const [q, setQ] = useState('')
  const [bot, setBot] = useState<'all' | 'bots' | 'real'>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<UsersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [delta, setDelta] = useState('')
  const [credit, setCredit] = useState('')
  const [busy, setBusy] = useState(false)

  const load = (p = page) => {
    setLoading(true)
    adminApi
      .users({ q: q.trim() || undefined, bot, page: p })
      .then(setData)
      .catch(() => onToast('Не удалось загрузить игроков', false))
      .finally(() => setLoading(false))
  }
   
  useEffect(() => {
    load(1)
    setPage(1)
  }, [bot])

  // live-обновление: перезагружаем текущую страницу без сброса фильтров/пагинации
  const liveRef = useRef(false)
  useEffect(() => {
    if (liveRef.current) load(page)
    liveRef.current = true
     
  }, [refreshKey])

  const openEdit = (u: AdminUser) => {
    setEditing(u)
    setDelta('')
    setCredit(String(u.creditScore))
  }

  const save = async (taxReset: boolean) => {
    if (!editing) return
    const num = parseInt(delta.replace(/\s/g, ''), 10)
    const cs = parseInt(credit, 10)
    if (delta && (Number.isNaN(num) || num === 0)) {
      onToast('Введите число, например 5000 или -3000', false)
      return
    }
    setBusy(true)
    try {
      await adminApi.patchUser(editing.id, {
        balanceDelta: delta ? num : undefined,
        creditScore: !Number.isNaN(cs) ? cs : undefined,
        taxDebtReset: taxReset || undefined,
      })
      onToast(
        taxReset
          ? `Налоговый долг ${editing.displayName} списан`
          : `Баланс ${editing.displayName} обновлён`,
        true,
      )
      setEditing(null)
      load()
    } catch {
      onToast('Не удалось сохранить', false)
    } finally {
      setBusy(false)
    }
  }

  const tabs: { key: 'all' | 'bots' | 'real'; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'real', label: 'Игроки' },
    { key: 'bots', label: 'Боты' },
  ]

  return (
    <Page title="Игроки" sub={data ? `${data.total} всего · страница ${data.page}/${data.pages}` : undefined}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
          <Input
            value={q}
            onChange={setQ}
            placeholder="Имя или @username…"
            className="w-64 pl-9"
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
          />
        </div>
        <div className="flex rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setBot(t.key)}
              className={`h-8 rounded-lg px-3.5 text-[12.5px] font-semibold transition-all ${
                bot === t.key ? 'bg-[#21A038] text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Btn onClick={() => load(1)} loading={loading}>
          Найти
        </Btn>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/[0.06]">
                <Th>Игрок</Th>
                <Th className="text-right">Баланс</Th>
                <Th className="text-right">Долг / Налог</Th>
                <Th className="text-right">LVL</Th>
                <Th>Рейтинг</Th>
                <Th>Был(а)</Th>
                <Th className="text-right">Действия</Th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((u) => (
                <tr key={u.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      {u.photoUrl ? (
                         
                        <img src={u.photoUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#21A038]/15 text-[12px] font-bold text-[#4ADE80]">
                          {u.displayName.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-semibold text-zinc-100">
                          {u.displayName}
                          {u.isBot && <Bot className="size-3.5 shrink-0 text-violet-300" aria-label="бот" />}
                        </p>
                        <p className="truncate text-[11.5px] text-zinc-500">
                          @{u.username} · {u.city}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums text-zinc-100">{fmtMoney(u.balance)}</Td>
                  <Td className="text-right tabular-nums text-zinc-400">
                    {fmtMoney(u.debt)}
                    {u.taxDebt > 0 && <span className="text-amber-300"> / {fmtMoney(u.taxDebt)}</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{u.level}</Td>
                  <Td>
                    {u.ratingCount > 0 ? (
                      <Badge tone="green">★ {(u.ratingSum / u.ratingCount).toFixed(1)}</Badge>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-zinc-500">{fmtRel(u.lastSeenAt)}</Td>
                  <Td className="text-right">
                    <Btn size="sm" onClick={() => openEdit(u)}>
                      <Wallet className="size-3.5" /> Правка
                    </Btn>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && data && data.rows.length === 0 && (
          <EmptyState icon={<Users className="size-5" />} title="Никого не найдено" sub="Попробуйте другой запрос или фильтр" />
        )}
        {data && <Pagination page={data.page} pages={data.pages} onPage={(p) => { setPage(p); load(p) }} />}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Правка: ${editing.displayName}` : ''}>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-black/30 p-3 text-center ring-1 ring-white/[0.06]">
              <div>
                <p className="text-[10.5px] uppercase tracking-wide text-zinc-500">Баланс</p>
                <p className="text-[14px] font-bold tabular-nums text-zinc-100">{fmtMoney(editing.balance)}</p>
              </div>
              <div>
                <p className="text-[10.5px] uppercase tracking-wide text-zinc-500">Налог</p>
                <p className="text-[14px] font-bold tabular-nums text-amber-300">{fmtMoney(editing.taxDebt)}</p>
              </div>
              <div>
                <p className="text-[10.5px] uppercase tracking-wide text-zinc-500">Скоринг</p>
                <p className="text-[14px] font-bold tabular-nums text-zinc-100">{editing.creditScore}</p>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">
                Изменение баланса (можно с минусом)
              </label>
              <Input value={delta} onChange={setDelta} placeholder="Например 10000 или -5000" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Кредитный рейтинг (300–900)</label>
              <Input value={credit} onChange={setCredit} type="number" min={300} max={900} />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Btn variant="primary" onClick={() => save(false)} loading={busy}>
                Сохранить
              </Btn>
              {editing.taxDebt > 0 && (
                <Btn onClick={() => save(true)} loading={busy}>
                  Списать налоговый долг
                </Btn>
              )}
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                Отмена
              </Btn>
            </div>
            <p className="text-[11px] text-zinc-600">
              Создан {fmtDT(editing.createdAt)} · изменений баланса фиксируются в транзакциях с типом «admin»
            </p>
          </div>
        )}
      </Modal>
    </Page>
  )
}
