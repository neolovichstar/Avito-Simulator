'use client'

// Журнал действий администратора: кто что менял в панели и когда.
// Каждая мутация в /api/admin/* пишет запись в AdminAction.

import { useEffect, useState } from 'react'
import { History, Search } from 'lucide-react'
import { adminApi, type AuditPage } from '@/lib/admin-client'
import { Badge, Btn, Card, EmptyState, fmtDT, fmtRel, Input, Page, Pagination, plural, Td, Th } from './ui'

const ENTITIES: { key: string; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'user', label: 'Игроки' },
  { key: 'listing', label: 'Объявления' },
  { key: 'market', label: 'Рынок' },
  { key: 'auction', label: 'Аукционы' },
  { key: 'finance', label: 'Финансы' },
  { key: 'complaint', label: 'Жалобы' },
  { key: 'message', label: 'Чаты' },
  { key: 'broadcast', label: 'Рассылка' },
  { key: 'system', label: 'Система' },
]

function actionTone(action: string): 'green' | 'red' | 'amber' | 'violet' | 'zinc' {
  if (action === 'auth.fail') return 'red'
  if (action.endsWith('.delete') || action.endsWith('.dismiss')) return 'red'
  if (action === 'auth.login') return 'green'
  if (action === 'broadcast') return 'violet'
  if (action.startsWith('market')) return 'amber'
  return 'zinc'
}

const ACTION_LABELS: Record<string, string> = {
  'user.update': 'Игрок · правка',
  'listing.status': 'Объявление · статус',
  'listing.delete': 'Объявление · удаление',
  'market.multipliers': 'Рынок · множители',
  'market.event': 'Рынок · событие',
  'market.event.delete': 'Рынок · событие удалено',
  'auction.finish': 'Аукцион · завершение',
  'message.delete': 'Чат · удаление',
  broadcast: 'Рассылка',
  'tax.forgive': 'Налог списан',
  'loan.writeoff': 'Кредит списан',
  'complaint.dismiss': 'Жалоба отклонена',
  'auth.login': 'Вход',
  'auth.fail': 'Отказ во входе',
}

export default function AuditSection({
  onToast,
  refreshKey = 0,
}: {
  onToast: (t: string, ok: boolean) => void
  refreshKey?: number
}) {
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AuditPage | null>(null)
  const [loading, setLoading] = useState(true)

  const load = (p = page) => {
    setLoading(true)
    adminApi
      .audit({ q: q.trim() || undefined, entity, page: p })
      .then(setData)
      .catch(() => onToast('Не удалось загрузить журнал', false))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    adminApi
      .audit({ q: q.trim() || undefined, entity, page })
      .then((d) => alive && setData(d))
      .catch(() => alive && onToast('Не удалось загрузить журнал', false))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
     
  }, [entity, refreshKey, page])

  return (
    <Page
      title="Журнал действий"
      sub={data ? `${data.total} ${plural(data.total, 'запись', 'записи', 'записей')} · страница ${data.page}/${data.pages}` : 'Полная история операций администратора'}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
          <Input
            value={q}
            onChange={setQ}
            placeholder="Поиск по журналу…"
            className="w-60 pl-9"
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
          {ENTITIES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setEntity(t.key)
                setPage(1)
              }}
              className={`h-8 rounded-lg px-3 text-[12px] font-semibold transition-all ${
                entity === t.key ? 'bg-[#21A038] text-white' : 'text-zinc-400 hover:text-zinc-200'
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

      <Card>
        {data && data.rows.length === 0 ? (
          <EmptyState icon={<History className="size-6" />} title="Записей пока нет" sub="Действия в панели появятся здесь автоматически" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <Th className="w-[150px]">Время</Th>
                  <Th className="w-[190px]">Действие</Th>
                  <Th>Описание</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {(data?.rows ?? []).map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-white/[0.02]">
                    <Td>
                      <div className="font-semibold text-zinc-200 tabular-nums">{fmtDT(r.createdAt)}</div>
                      <div className="text-[11px] text-zinc-500">{fmtRel(r.createdAt)}</div>
                    </Td>
                    <Td>
                      <Badge tone={actionTone(r.action)}>{ACTION_LABELS[r.action] ?? r.action}</Badge>
                    </Td>
                    <Td>
                      <span className="text-[13px] leading-snug text-zinc-300">{r.detail}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onPage={(p) => { setPage(p); load(p) }} />}
      </Card>
    </Page>
  )
}
