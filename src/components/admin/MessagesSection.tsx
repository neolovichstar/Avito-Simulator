'use client'

// Модерация чатов: лента последних сообщений с удалением.

import { useEffect, useState } from 'react'
import { Bot, MessageSquare, Search, Trash2 } from 'lucide-react'
import { adminApi, type AdminMessage } from '@/lib/admin-client'
import { Badge, Btn, Card, EmptyState, fmtDT, Input, Page } from './ui'

export default function MessagesSection({ onToast }: { onToast: (t: string, ok: boolean) => void }) {
  const [rows, setRows] = useState<AdminMessage[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    adminApi
      .messages(80)
      .then((d) => setRows(d.rows))
      .catch(() => onToast('Не удалось загрузить сообщения', false))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    adminApi
      .messages(80)
      .then((d) => alive && setRows(d.rows))
      .catch(() => alive && onToast('Не удалось загрузить сообщения', false))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
     
  }, [])

  const del = async (m: AdminMessage) => {
    try {
      await adminApi.deleteMessage(m.id)
      setRows((r) => r.filter((x) => x.id !== m.id))
      onToast('Сообщение удалено', true)
    } catch {
      onToast('Не удалось удалить сообщение', false)
    }
  }

  const filtered = q.trim()
    ? rows.filter(
        (m) =>
          m.text.toLowerCase().includes(q.toLowerCase()) ||
          m.senderName.toLowerCase().includes(q.toLowerCase()) ||
          m.listingTitle.toLowerCase().includes(q.toLowerCase()),
      )
    : rows

  return (
    <Page title="Чаты и модерация" sub="Последние 80 сообщений игры. Удаление — для спама и нарушений.">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
          <Input value={q} onChange={setQ} placeholder="Поиск по тексту, автору, товару…" className="w-72 pl-9" />
        </div>
        <Btn onClick={load} loading={loading}>
          Обновить
        </Btn>
      </div>

      <Card className="overflow-hidden">
        {filtered.length > 0 ? (
          <ul className="max-h-[640px] divide-y divide-white/[0.04] overflow-y-auto [scrollbar-width:thin]">
            {filtered.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                    m.senderType === 'user'
                      ? 'bg-[#21A038]/15 text-[#4ADE80]'
                      : m.senderType === 'bot'
                        ? 'bg-violet-500/15 text-violet-300'
                        : 'bg-white/[0.07] text-zinc-400'
                  }`}
                >
                  {m.senderType === 'bot' ? <Bot className="size-4" /> : <MessageSquare className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[13px] font-bold text-zinc-100">{m.senderName}</span>
                    <Badge tone={m.senderType === 'bot' ? 'violet' : m.senderType === 'user' ? 'green' : 'zinc'}>
                      {m.senderType === 'bot' ? 'бот' : m.senderType === 'user' ? 'игрок' : m.senderType}
                    </Badge>
                    {m.kind !== 'text' && <Badge tone="amber">{m.kind}</Badge>}
                    <span className="text-[11px] text-zinc-600">{fmtDT(m.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-zinc-300">{m.text}</p>
                  <p className="mt-1 truncate text-[11px] text-zinc-600">
                    Товар: «{m.listingTitle}» · покупатель {m.buyerName} ↔ продавец {m.sellerName}
                  </p>
                </div>
                <button
                  onClick={() => del(m)}
                  className="shrink-0 rounded-lg p-2 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  title="Удалить сообщение"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<MessageSquare className="size-5" />} title="Сообщений нет" sub={loading ? 'Загрузка…' : 'Как только игроки начнут общаться — лента наполнится'} />
        )}
      </Card>
    </Page>
  )
}
