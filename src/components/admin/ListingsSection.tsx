'use client'

// Объявления: модерация — снять с публикации / вернуть / удалить навсегда.

import { useEffect, useState } from 'react'
import { Eye, RotateCcw, Search, Store, Trash2 } from 'lucide-react'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { adminApi, type ListingsPage } from '@/lib/admin-client'
import { fmtMoney, fmtRel, Badge, Btn, Card, EmptyState, Input, Modal, Page, Pagination, Td, Th } from './ui'

const STATUS_TABS = [
  { key: 'active', label: 'Активные' },
  { key: 'sold', label: 'Проданные' },
  { key: 'removed', label: 'Снятые' },
  { key: 'all', label: 'Все' },
]

const STATUS_BADGE: Record<string, { tone: 'green' | 'amber' | 'red' | 'zinc'; label: string }> = {
  active: { tone: 'green', label: 'Активно' },
  sold: { tone: 'zinc', label: 'Продано' },
  removed: { tone: 'red', label: 'Снято' },
}

export default function ListingsSection({ onToast }: { onToast: (t: string, ok: boolean) => void }) {
  const [status, setStatus] = useState('active')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListingsPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = (p = 1) => {
    setLoading(true)
    adminApi
      .listings({ status, q: q.trim() || undefined, page: p })
      .then(setData)
      .catch(() => onToast('Не удалось загрузить объявления', false))
      .finally(() => setLoading(false))
  }
   
  useEffect(() => {
    load(1)
    setPage(1)
  }, [status])

  const toggle = async (id: string, cur: string) => {
    const next = cur === 'active' ? 'removed' : 'active'
    try {
      await adminApi.patchListing(id, next)
      onToast(next === 'removed' ? 'Объявление снято с публикации' : 'Объявление возвращено на площадку', true)
      load(page)
    } catch {
      onToast('Не удалось изменить статус', false)
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await adminApi.deleteListing(deleting.id)
      onToast('Объявление удалено навсегда', true)
      setDeleting(null)
      load(page)
    } catch {
      onToast('Не удалось удалить', false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Объявления" sub={data ? `${data.total} в выборке · страница ${data.page}/${data.pages}` : undefined}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`h-8 rounded-lg px-3.5 text-[12.5px] font-semibold transition-all ${
                status === t.key ? 'bg-[#21A038] text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
          <Input
            value={q}
            onChange={setQ}
            placeholder="Заголовок или продавец…"
            className="w-64 pl-9"
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
          />
        </div>
        <Btn onClick={() => load(1)} loading={loading}>
          Найти
        </Btn>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/[0.06]">
                <Th>Товар</Th>
                <Th>Продавец</Th>
                <Th className="text-right">Цена</Th>
                <Th>Категория</Th>
                <Th className="text-right">Просмотры</Th>
                <Th>Статус</Th>
                <Th>Создано</Th>
                <Th className="text-right">Модерация</Th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((l) => (
                <tr key={l.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      { }
                      <img src={l.image} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 max-w-56">
                        <p className="truncate font-semibold text-zinc-100">{l.title}</p>
                        <p className="text-[11.5px] text-zinc-500">
                          {l.city} · {l.condition}
                          {l.complaintCount > 0 && <span className="text-red-400"> · жалоб: {l.complaintCount}</span>}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-zinc-300">{l.sellerName}</span>
                    {l.sellerIsBot && <span className="ml-1.5 text-[10px] text-zinc-500">бот</span>}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums text-zinc-100">{fmtMoney(l.price)}</Td>
                  <Td className="whitespace-nowrap text-[12px] text-zinc-400">
                    {CATEGORY_LABEL[l.category] ?? l.category}
                  </Td>
                  <Td className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-1 text-zinc-400">
                      <Eye className="size-3.5" /> {l.views}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_BADGE[l.status]?.tone ?? 'zinc'}>
                      {STATUS_BADGE[l.status]?.label ?? l.status}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-zinc-500">{fmtRel(l.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {l.status !== 'sold' && (
                        <Btn
                          size="sm"
                          title={l.status === 'active' ? 'Снять с публикации' : 'Вернуть'}
                          onClick={() => toggle(l.id, l.status)}
                        >
                          {l.status === 'active' ? <Store className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                          {l.status === 'active' ? 'Снять' : 'Вернуть'}
                        </Btn>
                      )}
                      <Btn size="sm" variant="danger" title="Удалить навсегда" onClick={() => setDeleting({ id: l.id, title: l.title })}>
                        <Trash2 className="size-3.5" />
                      </Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && data && data.rows.length === 0 && (
          <EmptyState icon={<Store className="size-5" />} title="Ничего не найдено" />
        )}
        {data && <Pagination page={data.page} pages={data.pages} onPage={(p) => { setPage(p); load(p) }} />}
      </Card>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Удалить объявление?">
        <p className="text-[13px] text-zinc-400">
          «{deleting?.title}» будет удалено навсегда вместе со связями (избранное, жалобы). Действие необратимо.
        </p>
        <div className="mt-5 flex gap-2">
          <Btn variant="danger" onClick={doDelete} loading={busy}>
            Удалить навсегда
          </Btn>
          <Btn variant="ghost" onClick={() => setDeleting(null)}>
            Отмена
          </Btn>
        </div>
      </Modal>
    </Page>
  )
}
