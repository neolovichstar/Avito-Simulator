'use client'

// Аукционы: живые лоты с таймером + завершение через движок (endsAt = now).

import { useEffect, useState } from 'react'
import { Gavel, Timer, Zap } from 'lucide-react'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { adminApi, type AdminAuction } from '@/lib/admin-client'
import { Badge, Btn, Card, EmptyState, fmtDT, fmtMoney, Page } from './ui'

function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'завершается…'
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return m >= 1 ? `${m} мин ${String(s).padStart(2, '0')} с` : `${s} с`
}

export default function AuctionsSection({ onToast }: { onToast: (t: string, ok: boolean) => void }) {
  const [data, setData] = useState<{ active: AdminAuction[]; recent: AdminAuction[] } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, force] = useState(0)

  const load = () => {
    adminApi
      .auctions()
      .then(setData)
      .catch(() => onToast('Не удалось загрузить аукционы', false))
  }
   
  useEffect(() => {
    load()
    const t = setInterval(() => force((v) => v + 1), 1000) // живой таймер
    return () => clearInterval(t)
  }, [])

  const finish = async (lot: AdminAuction) => {
    setBusyId(lot.id)
    try {
      await adminApi.finishAuction(lot.id)
      onToast(`Лот «${lot.title}» завершается — движок раздаст победу и уведомления`, true)
      setTimeout(load, 1500)
    } catch {
      onToast('Не удалось завершить лот', false)
    } finally {
      setBusyId(null)
    }
  }

  const LotCard = ({ lot, live }: { lot: AdminAuction; live: boolean }) => (
    <div className="flex gap-3 border-b border-white/[0.04] p-4 last:border-0">
      { }
      <img src={lot.image} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[13.5px] font-bold text-zinc-100">{lot.title}</p>
          {live ? (
            <Badge tone="amber">
              <Timer className="size-3" /> {timeLeft(lot.endsAt)}
            </Badge>
          ) : (
            <Badge tone={lot.status === 'finished' ? 'green' : 'zinc'}>
              {lot.status === 'finished' ? 'Завершён' : 'Отменён'}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          {CATEGORY_LABEL[lot.category] ?? lot.category} · {lot.condition} · старт {fmtMoney(lot.startPrice)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="font-bold tabular-nums text-zinc-100">
            {lot.currentBid ? fmtMoney(lot.currentBid) : 'без ставок'}
          </span>
          {lot.currentBidderName && (
            <span className="truncate text-zinc-500">
              лидер: {lot.currentBidderName}
              {lot.currentBidderIsBot && ' (бот)'}
            </span>
          )}
          <span className="text-zinc-600">· {lot.bidCount} ставок</span>
        </div>
      </div>
      {live && (
        <div className="flex shrink-0 items-center">
          <Btn variant="danger" size="sm" onClick={() => finish(lot)} loading={busyId === lot.id}>
            <Zap className="size-3.5" /> Завершить
          </Btn>
        </div>
      )}
    </div>
  )

  return (
    <Page title="Аукционы" sub="Молоток игрока движка: завершение переносит endsAt на сейчас — лот разыграют по всем правилам">
      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <Gavel className="size-4 text-[#4ADE80]" />
            <h3 className="text-[13px] font-bold text-zinc-200">Живые торги</h3>
            <span className="ml-auto text-[11.5px] text-zinc-500">{data?.active.length ?? 0} шт.</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto [scrollbar-width:thin]">
            {data && data.active.length > 0 ? (
              data.active.map((lot) => <LotCard key={lot.id} lot={lot} live />)
            ) : (
              <EmptyState icon={<Gavel className="size-5" />} title="Активных лотов нет" sub="Движок создаст новые в течение пары минут" />
            )}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <Gavel className="size-4 text-zinc-500" />
            <h3 className="text-[13px] font-bold text-zinc-200">Недавние итоги</h3>
          </div>
          <div className="max-h-[520px] overflow-y-auto [scrollbar-width:thin]">
            {data && data.recent.length > 0 ? (
              data.recent.map((lot) => (
                <div key={lot.id}>
                  <LotCard lot={lot} live={false} />
                </div>
              ))
            ) : (
              <EmptyState icon={<Gavel className="size-5" />} title="Пока ничего" />
            )}
          </div>
        </Card>
      </div>
      {data && data.recent[0] && (
        <p className="mt-3 text-[11.5px] text-zinc-600">Последний итог: {fmtDT(data.recent[0].finishedAt ?? data.recent[0].endsAt)}</p>
      )}
    </Page>
  )
}
