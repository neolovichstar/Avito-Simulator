'use client'

// Очередь жалоб игроков: карточка на каждую жалобу с контекстом объявления.
// Действия модератора: снять объявление с публикации или отклонить жалобу.

import { useEffect, useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, ShieldAlert } from 'lucide-react'
import { adminApi, type ComplaintsData, type ComplaintRow } from '@/lib/admin-client'
import { Badge, Btn, Card, EmptyState, fmtMoney, fmtRel, Page, StatCard } from './ui'

function StatusDot({ status }: { status: string }) {
  if (status === 'active') return <Badge tone="green">В продаже</Badge>
  if (status === 'sold') return <Badge tone="zinc">Продано</Badge>
  return <Badge tone="red">Снято</Badge>
}

export default function ComplaintsSection({
  onToast,
  refreshKey = 0,
}: {
  onToast: (t: string, ok: boolean) => void
  refreshKey?: number
}) {
  const [data, setData] = useState<ComplaintsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')

  const load = () => {
    setLoading(true)
    adminApi
      .complaints()
      .then(setData)
      .catch(() => onToast('Не удалось загрузить жалобы', false))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
     
  }, [refreshKey])

  const removeRow = (id: string) => setData((d) => (d ? { ...d, rows: d.rows.filter((r) => r.id !== id), summary: { ...d.summary, total: d.summary.total - 1 } } : d))

  const dismiss = async (row: ComplaintRow) => {
    setBusyId(row.id)
    try {
      await adminApi.dismissComplaint(row.id)
      onToast('Жалоба отклонена', true)
      removeRow(row.id)
    } catch {
      onToast('Не удалось отклонить жалобу', false)
    } finally {
      setBusyId('')
    }
  }

  const unpublish = async (row: ComplaintRow) => {
    setBusyId(row.id)
    try {
      await adminApi.patchListing(row.listing.id, 'removed')
      onToast(`«${row.listing.title}» снято с публикации`, true)
      setData((d) =>
        d
          ? {
              ...d,
              rows: d.rows.map((r) => (r.listing.id === row.listing.id ? { ...r, listing: { ...r.listing, status: 'removed' } } : r)),
              summary: { ...d.summary, onActive: Math.max(0, d.summary.onActive - 1) },
            }
          : d,
      )
    } catch {
      onToast('Не удалось снять объявление', false)
    } finally {
      setBusyId('')
    }
  }

  const s = data?.summary

  return (
    <Page title="Жалобы" sub="Модерация: проверьте объявление и решите — снять с площадки или отклонить жалобу">
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Жалоб в очереди" value={s ? String(s.total) : '—'} icon={<ShieldAlert className="size-4" />} loading={loading} />
        <StatCard label="На активных объявлениях" value={s ? String(s.onActive) : '—'} icon={<AlertTriangle className="size-4" />} loading={loading} />
        <StatCard label="Уникальных объявлений" value={s ? String(s.uniqueListings) : '—'} icon={<Ban className="size-4" />} loading={loading} />
      </div>

      {!data || data.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="size-6 text-[#4ADE80]" />}
            title="Жалоб нет — площадка чистая"
            sub="Новые жалобы игроков появятся здесь и подсветятся бейджем в сайдбаре"
          />
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {data.rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex gap-3.5">
                <img
                  src={r.listing.image}
                  alt=""
                  className="size-20 shrink-0 rounded-xl bg-white/[0.04] object-cover ring-1 ring-white/[0.08]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusDot status={r.listing.status} />
                    <Badge tone="red">
                      <AlertTriangle className="size-3" /> Жалоба
                    </Badge>
                    <span className="text-[11px] text-zinc-500">{fmtRel(r.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 truncate text-[14px] font-bold text-zinc-100">{r.listing.title}</p>
                  <p className="text-[12.5px] text-zinc-400">
                    {fmtMoney(r.listing.price)} · {r.listing.city} · продавец {r.listing.sellerName}
                    {r.listing.sellerIsBot && ' 🤖'}
                  </p>
                  <p className="mt-1 truncate text-[12.5px] text-zinc-500">
                    Причина: <span className="font-semibold text-zinc-300">{r.reason}</span> · от {r.fromName}
                    {r.fromIsBot && ' 🤖'}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {r.listing.status === 'active' && (
                      <Btn size="sm" variant="danger" loading={busyId === r.id} onClick={() => unpublish(r)}>
                        Снять с публикации
                      </Btn>
                    )}
                    <Btn size="sm" variant="ghost" loading={busyId === r.id} onClick={() => dismiss(r)}>
                      Отклонить жалобу
                    </Btn>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  )
}
