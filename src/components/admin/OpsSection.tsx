'use client'

// Операционный мониторинг: доставки и ремонты в работе.
// Зависшие (просроченные) заказы подсвечиваются красным.

import { useEffect, useState } from 'react'
import { Clock, PackageCheck, Truck, Wrench } from 'lucide-react'
import { adminApi, type OpsData, type RepairRow, type DeliveryRow } from '@/lib/admin-client'
import { Badge, Card, EmptyState, fmtMoney, Page, StatCard, Td, Th } from './ui'

const DELIVERY_STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'zinc' }> = {
  collecting: { label: 'Сборка', tone: 'amber' },
  in_transit: { label: 'В пути', tone: 'amber' },
  arrived: { label: 'В ПВЗ', tone: 'green' },
  delivered: { label: 'Вручено', tone: 'zinc' },
  returned: { label: 'Возврат', tone: 'zinc' },
}

function fmtEta(iso: string): { text: string; late: boolean } {
  const diff = new Date(iso).getTime() - Date.now()
  const late = diff < 0
  const m = Math.floor(Math.abs(diff) / 60_000)
  if (m < 60) return { text: late ? `опоздание ${m} мин` : `осталось ${m} мин`, late }
  const h = Math.floor(m / 60)
  if (h < 24) return { text: late ? `опоздание ${h} ч` : `осталось ${h} ч`, late }
  return { text: late ? `опоздание ${Math.floor(h / 24)} дн` : `осталось ${Math.floor(h / 24)} дн`, late }
}

export default function OpsSection({
  onToast,
  refreshKey = 0,
}: {
  onToast: (t: string, ok: boolean) => void
  refreshKey?: number
}) {
  const [data, setData] = useState<OpsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        const d = await adminApi.ops()
        if (alive) setData(d)
      } catch {
        if (alive) onToast('Не удалось загрузить операции', false)
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    const t = setInterval(run, 15_000) // живой мониторинг: полл каждые 15 сек
    return () => {
      alive = false
      clearInterval(t)
    }
     
  }, [refreshKey])

  const s = data?.summary

  return (
    <Page title="Операции" sub="Доставки и ремонты в работе · автообновление каждые 15 секунд">
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Доставки в работе" value={s ? String(s.deliveriesInWork) : '—'} icon={<Truck className="size-4" />} loading={loading} />
        <StatCard label="Доставок просрочено" value={s ? String(s.deliveriesStuck) : '—'} icon={<Clock className="size-4" />} loading={loading} />
        <StatCard label="Ремонтов в работе" value={s ? String(s.repairsInWork) : '—'} icon={<Wrench className="size-4" />} loading={loading} />
        <StatCard label="Ремонтов просрочено" value={s ? String(s.repairsStuck) : '—'} icon={<Clock className="size-4" />} loading={loading} />
      </div>

      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-zinc-400">
        <Truck className="size-4 text-[#4ADE80]" /> Доставки
      </h2>
      <Card className="mb-5">
        {!data || data.deliveries.length === 0 ? (
          <EmptyState icon={<PackageCheck className="size-6" />} title="Активных доставок нет" sub="Новые заказы появятся автоматически" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <Th>Товар</Th>
                  <Th>Тип</Th>
                  <Th>Получатель</Th>
                  <Th>Курьер</Th>
                  <Th>Статус</Th>
                  <Th>ETA</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.deliveries.map((d) => (
                  <DeliveryTr key={d.id} d={d} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-zinc-400">
        <Wrench className="size-4 text-[#4ADE80]" /> Ремонты
      </h2>
      <Card>
        {!data || data.repairs.length === 0 ? (
          <EmptyState icon={<Wrench className="size-6" />} title="Активных ремонтов нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <Th>Вещь</Th>
                  <Th>Мастер</Th>
                  <Th>Работа</Th>
                  <Th>Стоимость</Th>
                  <Th>Готово</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.repairs.map((r) => (
                  <RepairTr key={r.id} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  )
}

function DeliveryTr({ d }: { d: DeliveryRow }) {
  const eta = fmtEta(d.eta)
  const st = DELIVERY_STATUS[d.status] ?? { label: d.status, tone: 'zinc' as const }
  return (
    <tr className={`transition-colors hover:bg-white/[0.02] ${d.stuck ? 'bg-red-500/[0.045]' : ''}`}>
      <Td>
        <div className="flex items-center gap-2.5">
          <img src={d.image} alt="" className="size-9 rounded-lg bg-white/[0.04] object-cover ring-1 ring-white/[0.08]" />
          <div>
            <div className="max-w-[220px] truncate font-semibold text-zinc-200">{d.title}</div>
            <div className="text-[11px] tabular-nums text-zinc-500">{fmtMoney(d.price)}</div>
          </div>
        </div>
      </Td>
      <Td>
        <Badge tone={d.kind === 'sale' ? 'violet' : 'zinc'}>{d.kind === 'sale' ? 'Продажа' : 'Покупка'}</Badge>
      </Td>
      <Td>
        {d.userName}
        {d.userIsBot && ' 🤖'}
      </Td>
      <Td className="text-zinc-400">{d.courier}</Td>
      <Td>
        <Badge tone={st.tone}>{st.label}</Badge>
      </Td>
      <Td>
        {d.stuck ? (
          <Badge tone="red">⚠ {eta.text}</Badge>
        ) : (
          <span className="text-[12.5px] tabular-nums text-zinc-400">{eta.text}</span>
        )}
      </Td>
    </tr>
  )
}

function RepairTr({ r }: { r: RepairRow }) {
  const eta = fmtEta(r.readyAt)
  return (
    <tr className={`transition-colors hover:bg-white/[0.02] ${r.stuck ? 'bg-red-500/[0.045]' : ''}`}>
      <Td className="font-mono text-[12px] text-zinc-400">{r.itemId.slice(-8)}</Td>
      <Td>
        {r.userName}
        {r.userIsBot && ' 🤖'}
      </Td>
      <Td className="text-zinc-400">
        {r.fromCondition} → <span className="font-semibold text-zinc-200">{r.toCondition}</span>
      </Td>
      <Td className="tabular-nums text-zinc-300">{fmtMoney(r.cost)}</Td>
      <Td>
        {r.stuck ? (
          <Badge tone="red">⚠ {eta.text}</Badge>
        ) : (
          <span className="text-[12.5px] tabular-nums text-zinc-400">{eta.text}</span>
        )}
      </Td>
    </tr>
  )
}
