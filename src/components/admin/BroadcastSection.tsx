'use client'

// Рассылка: push-уведомление всем реальным игрокам (появится в шторке ОС и у бота в TG).

import { useState } from 'react'
import { Megaphone, Send } from 'lucide-react'
import { adminApi } from '@/lib/admin-client'
import { Btn, Card, Input, Page } from './ui'

const KINDS = [
  { key: 'system', label: 'Система', hint: 'Нейтральное уведомление от телефона' },
  { key: 'market', label: 'Рынок', hint: 'Новость про рынок и цены' },
  { key: 'deal', label: 'Сделка', hint: 'Что-то про покупки/продажи' },
]

export default function BroadcastSection({ onToast }: { onToast: (t: string, ok: boolean) => void }) {
  const [kind, setKind] = useState('system')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<number | null>(null)

  const send = async () => {
    if (!title.trim() || !body.trim()) return
    setBusy(true)
    try {
      const res = await adminApi.broadcast({ title: title.trim(), body: body.trim(), kind })
      setSent(res.sent)
      onToast(`Доставлено ${res.sent} игрокам`, true)
      setTitle('')
      setBody('')
    } catch {
      onToast('Не удалось отправить рассылку', false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Рассылка" sub="Уведомление получат все реальные игроки: в шторке ОС и, если привязан бот, в Telegram">
      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="p-5 xl:col-span-3">
          <div className="mb-4 flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                title={k.hint}
                className={`h-9 rounded-xl px-4 text-[12.5px] font-semibold ring-1 transition-all ${
                  kind === k.key
                    ? 'bg-[#21A038] text-white ring-[#21A038]'
                    : 'bg-white/[0.05] text-zinc-400 ring-white/10 hover:text-zinc-200'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Заголовок</label>
              <Input value={title} onChange={setTitle} placeholder="Чёрная пятница в Resale!" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-zinc-400">Текст</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="До конца дня все сделки без комиссии — успей продать!"
                className="w-full rounded-xl bg-black/30 px-3.5 py-2.5 text-[13px] text-zinc-100 ring-1 ring-white/10 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-[#21A038]/60"
              />
            </div>
            <div className="flex items-center gap-3">
              <Btn variant="primary" onClick={send} loading={busy} disabled={!title.trim() || !body.trim()}>
                <Send className="size-4" /> Отправить всем
              </Btn>
              {sent != null && <span className="text-[12.5px] text-[#4ADE80]">Последняя рассылка: {sent} игрокам</span>}
            </div>
          </div>
        </Card>

        <Card className="p-5 xl:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-zinc-200">
            <Megaphone className="size-4 text-zinc-500" /> Как это увидит игрок
          </h3>
          {/* превью карточки уведомления в шторке ОС */}
          <div className="rounded-2xl bg-[#111814] p-3.5 ring-1 ring-white/[0.08]">
            <div className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#21A038]/20 text-[#4ADE80]">
                <Megaphone className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-bold text-zinc-100">{title.trim() || 'Заголовок'}</p>
                  <span className="shrink-0 text-[10.5px] text-zinc-600">сейчас</span>
                </div>
                <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-zinc-400">
                  {body.trim() || 'Текст уведомления, как он появится в шторке телефона игрока'}
                </p>
              </div>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-[12px] text-zinc-500">
            <li>• Уведомление появится в шторке и в колокольчике Resale</li>
            <li>• Боты рассылку не получают — только живые игроки</li>
            <li>• Если игрок привязал @resalesimbot, текст уйдёт и в Telegram</li>
          </ul>
        </Card>
      </div>
    </Page>
  )
}
