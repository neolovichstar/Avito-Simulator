'use client'

// Рынок: множители цен по категориям (инлайн-правка) + ручные рыночные события.

import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCcw, Save, Sparkles, Trash2 } from 'lucide-react'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { adminApi, type MarketData } from '@/lib/admin-client'
import { Badge, Btn, Card, EmptyState, fmtRel, Input, Modal, Page, Td, Th } from './ui'

const EVENT_KINDS = [
  { key: 'demand_up', label: 'Ажиотаж (цены ↑)' },
  { key: 'demand_down', label: 'Обвал спроса (цены ↓)' },
  { key: 'fashion', label: 'Мода (цены ↑)' },
  { key: 'crisis', label: 'Кризис (цены ↓)' },
  { key: 'opu', label: 'ОПУ — внеплановая проверка' },
  { key: 'tax_raid', label: 'Налоговый рейд' },
  { key: 'supply', label: 'Приток товара' },
]

const KIND_LABEL: Record<string, string> = Object.fromEntries(EVENT_KINDS.map((k) => [k.key, k.label]))

export default function MarketSection({ onToast }: { onToast: (t: string, ok: boolean) => void }) {
  const [data, setData] = useState<MarketData | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)

  const load = () => {
    adminApi
      .market()
      .then((d) => {
        setData(d)
        setDraft(
          Object.fromEntries(d.indexes.map((i) => [i.category, String(Math.round(i.multiplier * 1000) / 1000)])),
        )
      })
      .catch(() => onToast('Не удалось загрузить рынок', false))
  }
   
  useEffect(load, [])

  const dirty = useMemo(() => {
    if (!data) return false
    return data.indexes.some((i) => {
      const v = parseFloat((draft[i.category] ?? '').replace(',', '.'))
      return !Number.isNaN(v) && Math.abs(v - i.multiplier) > 0.0005
    })
  }, [data, draft])

  const save = async () => {
    if (!data) return
    const multipliers: Record<string, number> = {}
    for (const i of data.indexes) {
      const v = parseFloat((draft[i.category] ?? '').replace(',', '.'))
      if (!Number.isNaN(v) && v > 0) multipliers[i.category] = Math.min(3, Math.max(0.2, v))
    }
    setSaving(true)
    try {
      await adminApi.setMultipliers(multipliers)
      onToast('Множители рынка сохранены', true)
      load()
    } catch {
      onToast('Не удалось сохранить множители', false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page
      title="Рынок"
      sub="Множители цен применяются к оценке и новым объявлениям. События создают живые новости в ленте."
      actions={
        <Btn variant="primary" onClick={() => setEventOpen(true)}>
          <Plus className="size-4" /> Событие
        </Btn>
      }
    >
      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="overflow-hidden xl:col-span-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <h3 className="text-[13px] font-bold text-zinc-200">Множители категорий</h3>
            <Btn size="sm" variant={dirty ? 'primary' : 'default'} onClick={save} loading={saving} disabled={!dirty}>
              <Save className="size-3.5" /> Сохранить
            </Btn>
          </div>
          <div className="max-h-[520px] overflow-y-auto [scrollbar-width:thin]">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#0D120F]">
                <tr className="border-b border-white/[0.06]">
                  <Th>Категория</Th>
                  <Th className="text-right">Множитель</Th>
                  <Th>Обновлён</Th>
                </tr>
              </thead>
              <tbody>
                {data?.indexes.map((i) => {
                  const v = parseFloat((draft[i.category] ?? '').replace(',', '.'))
                  const changed = !Number.isNaN(v) && v !== i.multiplier
                  return (
                    <tr key={i.category} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                      <Td className="font-semibold text-zinc-200">{CATEGORY_LABEL[i.category] ?? i.category}</Td>
                      <Td className="text-right">
                        <Input
                          value={draft[i.category] ?? ''}
                          onChange={(v) => setDraft((d) => ({ ...d, [i.category]: v }))}
                          className={`h-9 w-24 text-right tabular-nums ${
                            changed ? 'ring-2 ring-[#21A038]/70' : ''
                          }`}
                        />
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-zinc-500">{fmtRel(i.updatedAt)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-zinc-200">
              <Sparkles className="size-4 text-zinc-500" /> Активные события
            </h3>
            <Btn size="sm" variant="ghost" onClick={load} title="Обновить">
              <RefreshCcw className="size-3.5" />
            </Btn>
          </div>
          <div className="max-h-[520px] overflow-y-auto [scrollbar-width:thin]">
            {data && data.events.length > 0 ? (
              <ul>
                {data.events.map((e) => (
                  <li key={e.id} className="border-b border-white/[0.04] px-4 py-3 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-zinc-100">{e.headline}</p>
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-zinc-500">{e.body}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone={e.magnitude >= 0 ? 'green' : 'red'}>
                            {KIND_LABEL[e.kind] ?? e.kind} {e.magnitude > 0 ? '+' : ''}
                            {Math.round(e.magnitude * 100)}%
                          </Badge>
                          <Badge>{CATEGORY_LABEL[e.category] ?? 'Все'}</Badge>
                          <span className="text-[11px] text-zinc-600">до {fmtRel(e.expiresAt)}</span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await adminApi.deleteEvent(e.id)
                            onToast('Событие удалено', true)
                            load()
                          } catch {
                            onToast('Не удалось удалить', false)
                          }
                        }}
                        className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-300"
                        title="Удалить событие"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Sparkles className="size-5" />} title="Событий нет" sub="Движок создаёт их автоматически — или создайте вручную" />
            )}
          </div>
        </Card>
      </div>

      <EventModal open={eventOpen} onClose={() => setEventOpen(false)} onDone={() => { onToast('Событие создано — оно появится в ленте', true); load() }} />
    </Page>
  )
}

function EventModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [category, setCategory] = useState('all')
  const [kind, setKind] = useState('demand_up')
  const [magnitude, setMagnitude] = useState('15')
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [hours, setHours] = useState('6')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!headline.trim()) return
    setBusy(true)
    try {
      await adminApi.createEvent({
        category,
        kind,
        magnitude: (parseFloat(magnitude.replace(',', '.')) || 10) / 100,
        headline: headline.trim(),
        body: body.trim() || headline.trim(),
        hours: parseInt(hours, 10) || 6,
      })
      setHeadline('')
      setBody('')
      onClose()
      onDone()
    } catch {
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Создать рыночное событие">
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Категория</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-full rounded-xl bg-black/30 px-3 text-[13px] text-zinc-100 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-[#21A038]/60"
            >
              <option value="all">Все категории</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Тип события</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-10 w-full rounded-xl bg-black/30 px-3 text-[13px] text-zinc-100 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-[#21A038]/60"
            >
              {EVENT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Сдвиг цен, %</label>
            <Input value={magnitude} onChange={setMagnitude} placeholder="15 или -20" />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Длительность, ч</label>
            <Input value={hours} onChange={setHours} type="number" min={1} max={48} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Заголовок новости</label>
          <Input value={headline} onChange={setHeadline} placeholder="Все скупают AirPods!" />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Текст новости</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Что случилось и как это влияет на цены…"
            className="w-full rounded-xl bg-black/30 px-3.5 py-2.5 text-[13px] text-zinc-100 ring-1 ring-white/10 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-[#21A038]/60"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Btn variant="primary" onClick={submit} loading={busy} disabled={!headline.trim()}>
            Создать событие
          </Btn>
          <Btn variant="ghost" onClick={onClose}>
            Отмена
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
