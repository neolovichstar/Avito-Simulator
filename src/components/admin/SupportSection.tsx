'use client'

// Раздел «Поддержка» админ-панели: обращения игроков, ответы от лица поддержки.
// Ответ админа (author=admin) ставит ИИ-автоответчик на паузу 20 минут.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Headset, Send, User as UserIcon } from 'lucide-react'
import { adminApi, type SupportThread, type SupportThreadMsg } from '@/lib/admin-client'
import { Badge, Btn, Card, EmptyState, fmtRel, Input } from './ui'

interface Props {
  onToast: (text: string, ok: boolean) => void
  refreshKey: number
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function SupportSection({ onToast, refreshKey }: Props) {
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [thread, setThread] = useState<{ name: string; username: string; isBot: boolean; online: boolean } | null>(null)
  const [messages, setMessages] = useState<SupportThreadMsg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [q, setQ] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadThreads = useCallback(async () => {
    try {
      const t = await adminApi.supportThreads()
      setThreads(t.threads)
    } catch {
      /* 401 обрабатывает admin-client */
    } finally {
      setLoading(false)
    }
  }, [])

  const openThread = useCallback(async (userId: string) => {
    setActiveId(userId)
    try {
      const t = await adminApi.supportThread(userId)
      setThread(t.user)
      setMessages(t.messages)
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
      setThreads((list) => list.map((x) => (x.userId === userId ? { ...x, unread: 0 } : x)))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads, refreshKey])

  useEffect(() => {
    if (activeId) void openThread(activeId)
  }, [refreshKey])

  const send = useCallback(async () => {
    const body = text.trim()
    if (!body || !activeId || sending) return
    setSending(true)
    try {
      const r = await adminApi.supportReply(activeId, body)
      setMessages((m) => [...m, r.message])
      setText('')
      setThreads((list) =>
        list.map((x) => (x.userId === activeId ? { ...x, lastText: body, lastAuthor: 'admin', lastRole: 'support', lastAt: new Date().toISOString() } : x)),
      )
      onToast('Ответ отправлен от лица поддержки. ИИ на этом чате подождёт', true)
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Не удалось отправить', false)
    } finally {
      setSending(false)
    }
  }, [text, activeId, sending, onToast])

  const filtered = threads.filter(
    (t) => !q.trim() || t.name.toLowerCase().includes(q.toLowerCase()) || t.username.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Список обращений */}
      <Card className={`flex flex-col overflow-hidden ${activeId ? 'hidden lg:flex' : 'flex'}`}>
        <div className="border-b border-white/[0.06] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Headset className="size-4 text-teal-300" />
            <p className="text-[13px] font-bold text-zinc-200">Обращения</p>
            <Badge tone="violet">{threads.reduce((s, t) => s + t.unread, 0)}</Badge>
          </div>
          <Input value={q} onChange={setQ} placeholder="Поиск по имени…" className="h-8 text-[12px]" />
        </div>
        <div className="max-h-[560px] flex-1 overflow-y-auto [scrollbar-width:thin]">
          {loading ? (
            <p className="p-4 text-[12px] text-zinc-500">Загрузка…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-[12px] text-zinc-500">Обращений пока нет</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.userId}
                type="button"
                onClick={() => void openThread(t.userId)}
                className={`flex w-full items-start gap-2.5 border-b border-white/[0.04] px-3 py-2.5 text-left transition-colors ${
                  activeId === t.userId ? 'bg-[#21A038]/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-zinc-400">
                  <UserIcon className="size-4" />
                  {t.online && <span className="absolute -bottom-0 -right-0 size-2 rounded-full bg-emerald-400 ring-2 ring-[#0D120F]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-semibold text-zinc-200">{t.name}</span>
                    <span className="shrink-0 text-[10px] text-zinc-500">{fmtRel(t.lastAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className={`min-w-0 flex-1 truncate text-[11.5px] ${t.lastRole === 'user' ? 'text-zinc-400' : 'text-teal-300/70'}`}>
                      {t.lastRole === 'support' ? 'Вы: ' : ''}
                      {t.lastText}
                    </span>
                    {t.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-[16px] text-white">{t.unread}</span>
                    )}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* Чат */}
      <Card className={`flex min-h-[480px] flex-col overflow-hidden ${activeId ? 'flex' : 'hidden lg:flex'}`}>
        {!activeId || !thread ? (
          <EmptyState icon={<Headset className="size-8" />} title="Выберите обращение" sub="Слева список обращений игроков. ИИ-оператор отвечает сам, вы можете подключиться в любой момент." />
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
              <button type="button" onClick={() => setActiveId(null)} className="rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-400 lg:hidden">
                ← Назад
              </button>
              <span className="relative flex size-8 items-center justify-center rounded-full bg-white/[0.07] text-zinc-400">
                <UserIcon className="size-4" />
                {thread.online && <span className="absolute -bottom-0 -right-0 size-2 rounded-full bg-emerald-400 ring-2 ring-[#0D120F]" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-zinc-100">
                  {thread.name}
                  {thread.isBot && <span className="ml-1.5 text-[10px] font-semibold text-zinc-500">бот</span>}
                </p>
                <p className="truncate text-[11px] text-zinc-500">@{thread.username || 'нет username'}</p>
              </div>
              <Badge tone="violet">ИИ на паузе после вашего ответа</Badge>
            </div>

            <div ref={scrollRef} className="max-h-[420px] min-h-[300px] flex-1 space-y-2.5 overflow-y-auto p-4 [scrollbar-width:thin]">
              {messages.map((m) => {
                const mine = m.role === 'support'
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed ${
                      mine ? 'rounded-br-md bg-teal-600/25 text-teal-50 ring-1 ring-teal-500/25' : 'rounded-bl-md bg-white/[0.06] text-zinc-200'
                    }`}>
                      {!mine && (
                        <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">Игрок</span>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <span className="mt-0.5 block text-right text-[9.5px] text-zinc-500">
                        {m.author === 'ai' ? 'ИИ · ' : m.author === 'admin' ? 'Вы · ' : ''}
                        {timeOf(m.createdAt)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2 border-t border-white/[0.06] p-3">
              <Input
                value={text}
                onChange={setText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder="Ответить игроку от лица поддержки…"
                className="flex-1 text-[13px]"
              />
              <Btn onClick={() => void send()} disabled={!text.trim() || sending} variant="primary">
                <Send className="size-3.5" /> Отправить
              </Btn>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
