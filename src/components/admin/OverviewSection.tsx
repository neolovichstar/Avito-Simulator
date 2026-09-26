'use client'

// Обзор: KPI, GMV за 14 дней, регистрации, индексы рынка, последние сделки.

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  BadgePercent,
  Box,
  Gavel,
  MessagesSquare,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react'
import { adminApi, type OverviewData } from '@/lib/admin-client'
import { Card, EmptyState, fmtDT, fmtMoney, fmtRel, fmtShort, Page, StatCard, Td, Th } from './ui'

export default function OverviewSection({ onToast }: { onToast: (t: string, ok: boolean) => void }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [err, setErr] = useState(false)

  const load = () => {
    adminApi
      .overview()
      .then(setData)
      .catch(() => setErr(true))
  }
   
  useEffect(load, [])

  const gmvDelta =
    data && data.kpis.gmv24Prev > 0 ? (data.kpis.gmv24 - data.kpis.gmv24Prev) / data.kpis.gmv24Prev : null

  return (
    <Page
      title="Обзор"
      sub={data ? `Данные на ${fmtDT(data.serverTime)} · обновление вручную` : 'Загрузка…'}
      actions={
        <button
          onClick={load}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/[0.07] px-4 text-[13px] font-semibold text-zinc-200 ring-1 ring-white/10 transition-all hover:bg-white/[0.11] active:scale-[0.98]"
        >
          <Activity className="size-4" /> Обновить
        </button>
      }
    >
      {err && !data && (
        <Card className="p-6 text-center text-[13px] text-red-300">
          Не удалось загрузить данные. Попробуйте ещё раз.
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Игроков"
          value={data ? fmtShort(data.kpis.users - data.kpis.bots) : '—'}
          icon={<Users className="size-4" />}
          loading={!data}
          accent
        />
        <StatCard
          label="Ботов"
          value={data ? fmtShort(data.kpis.bots) : '—'}
          icon={<Users className="size-4" />}
          loading={!data}
        />
        <StatCard
          label="Онлайн"
          value={data ? String(data.kpis.online) : '—'}
          icon={<Activity className="size-4" />}
          loading={!data}
        />
        <StatCard
          label="Активных объявлений"
          value={data ? fmtShort(data.kpis.activeListings) : '—'}
          icon={<Box className="size-4" />}
          loading={!data}
        />
        <StatCard
          label="GMV за 24ч"
          value={data ? fmtShort(data.kpis.gmv24) : '—'}
          delta={gmvDelta}
          icon={<TrendingUp className="size-4" />}
          loading={!data}
          accent
        />
        <StatCard
          label="Сделок за 24ч"
          value={data ? String(data.kpis.deals24) : '—'}
          icon={<ShoppingBag className="size-4" />}
          loading={!data}
        />
        <StatCard
          label="Живых аукционов"
          value={data ? String(data.kpis.liveAuctions) : '—'}
          icon={<Gavel className="size-4" />}
          loading={!data}
        />
        <StatCard
          label="Долги по налогам"
          value={data ? fmtShort(data.kpis.taxDebtSum) : '—'}
          icon={<BadgePercent className="size-4" />}
          loading={!data}
        />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-5">
        <Card className="p-4 xl:col-span-3">
          <h3 className="mb-1 text-[13px] font-bold text-zinc-200">Оборот (GMV), 14 дней</h3>
          <p className="mb-3 text-[11.5px] text-zinc-500">Сумма покупок и продаж по всем игрокам, ₽</p>
          <div className="h-56">
            {data && data.gmvSeries.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.gmvSeries} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#21A038" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#21A038" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmtShort(Number(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#101713',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      fontSize: 12,
                      color: '#f4f4f5',
                    }}
                    formatter={(v: number, name: string) =>
                      name === 'gmv' ? [fmtMoney(v), 'Оборот'] : [v, 'Сделок']
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="gmv"
                    stroke="#21A038"
                    strokeWidth={2}
                    fill="url(#gmvFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-4 xl:col-span-2">
          <h3 className="mb-1 text-[13px] font-bold text-zinc-200">Индексы рынка</h3>
          <p className="mb-3 text-[11.5px] text-zinc-500">Множитель цен по категориям (1.0 — база)</p>
          <div className="h-56">
            {data && data.marketIndex.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.marketIndex} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#71717a', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{
                      background: '#101713',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      fontSize: 12,
                      color: '#f4f4f5',
                    }}
                    formatter={(v: number) => [v.toFixed(2), 'Множитель']}
                  />
                  <Bar dataKey="multiplier" radius={[5, 5, 0, 0]}>
                    {data.marketIndex.map((m) => (
                      <Cell key={m.category} fill={m.multiplier >= 1 ? '#21A038' : '#E5484D'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-5">
        <Card className="overflow-hidden xl:col-span-3">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-zinc-200">
              <MessagesSquare className="size-4 text-zinc-500" /> Последние транзакции
            </h3>
          </div>
          <div className="max-h-80 overflow-y-auto [scrollbar-width:thin]">
            {data && data.recentTx.length > 0 ? (
              <table className="w-full">
                <thead className="sticky top-0 bg-[#0D120F]">
                  <tr className="border-b border-white/[0.06]">
                    <Th>Кто</Th>
                    <Th>Тип</Th>
                    <Th className="text-right">Сумма</Th>
                    <Th>Когда</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTx.map((t) => (
                    <tr key={t.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                      <Td>
                        <span className="font-semibold text-zinc-200">{t.userName}</span>
                        {t.isBot && <span className="ml-1.5 text-[10px] text-zinc-500">бот</span>}
                        {t.note && <span className="block truncate text-[11.5px] text-zinc-500">{t.note}</span>}
                      </Td>
                      <Td>
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-400">
                          {t.type}
                        </span>
                      </Td>
                      <Td className={`text-right font-semibold tabular-nums ${t.amount >= 0 ? 'text-[#4ADE80]' : 'text-red-300'}`}>
                        {t.amount >= 0 ? '+' : '−'}
                        {fmtMoney(t.amount)}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-zinc-500">{fmtRel(t.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={<ShoppingBag className="size-5" />} title="Пока пусто" sub="Транзакции появятся, когда игроки начнут торговаться" />
            )}
          </div>
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-zinc-200">
              <TrendingUp className="size-4 text-zinc-500" /> Топ по просмотрам
            </h3>
          </div>
          <div className="max-h-80 overflow-y-auto [scrollbar-width:thin]">
            {data && data.hotListings.length > 0 ? (
              <ul>
                {data.hotListings.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-0">
                    { }
                    <img src={l.image} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-zinc-200">{l.title}</p>
                      <p className="text-[11.5px] text-zinc-500">
                        {l.city} · {fmtShort(l.views)} просмотров
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-zinc-100">
                      {fmtMoney(l.price)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Box className="size-5" />} title="Нет объявлений" />
            )}
          </div>
        </Card>
      </div>
    </Page>
  )
}
