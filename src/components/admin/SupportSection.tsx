'use client'

// Раздел «Поддержка» админ-панели: два режима.
//  «Диалоги» — общий чат игрока с саппортом (ИИ-оператор + живой админ).
//  «Обращения» — тикеты из приложения «Поддержка» (категория/тема/статус).
// Ответ админа (author=admin) ставит ИИ-автоответчик на паузу 20 минут.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Headset, Inbox, Send, Ticket as TicketIcon, User as UserIcon } from 'lucide-react'
import {
  adminApi,
  type AdminTicket,
  type AdminTicketData,
  type SupportThread,
  type SupportThreadData,
  type SupportThreadMsg,
} from '@/lib/admin-client'
import { Badge, Btn, Card, EmptyState, fmtRel, Input } from './ui'

interface Props {
  onToast: (text: string, ok: boolean) => void
  refreshKey: number
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

type Mode = 'chats' | 'tickets'

export default function SupportSection({ onToast, refreshKey }: Props) {
  const [mode, setMode] = useState<Mode>('chats')

  // ── диалоги (общий чат) ──
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [thread, setThread] = useState<SupportThreadData['user'] | null>(null)
  const [messages, setMessages] = useState<SupportThreadMsg[]>([])

  // ── тикеты ──
  const [tickets, setTickets] = useState<AdminTicket[]>([])
  const [activeTicket, setActiveTicket] = useState<string | null>(null)
  const [ticketData, setTicketData] = useState<AdminTicketData | null>(null)

  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [q, setQ] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadLists = useCallback(async () => {
    try {
      const [t, tk] = await Promise.all([adminApi.supportThreads(), adminApi.adminTickets()])
      setThreads(t.threads)
      setTickets(tk.tickets)
    } catch {
      /* 401 обрабатывает admin-client */
    } finally {
      setLoading(false)
    }
  }, [])

  const openThread = useCallback(async (userId: string) => {
    setActiveTicket(null)
    setTicketData(null)
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

  const openTicket = useCallback(async (ticketId: string) => {
    setActiveId(null)
    setThread(null)
    setActiveTicket(ticketId)
    try {
      const t = await adminApi.adminTicketThread(ticketId)
      setTicketData(t)
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
      setTickets((list) => list.map((x) => (x.ticketId === ticketId ? { ...x, unread: 0 } : x)))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void loadLists()
  }, [loadLists, refreshKey])

  const send = useCallback(async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      if (mode === 'tickets' && activeTicket) {
        const r = await adminApi.adminTicketReply(activeTicket, body)
        setTicketData((d) => (d ? { ...d, messages: [...d.messages, r.message] } : d))
        setTickets((list) =>
          list.map((x) =>
            x.ticketId === activeTicket
              ? { ...x, lastText: body, lastAuthor: 'admin', lastRole: 'support', lastAt: new Date().toISOString(), status: 'answered' }
              : x,
          ),
        )
        onToast('Ответ отправлен в обращение. ИИ на этом тикете подождёт', true)
      } else if (activeId) {
        const r = await adminApi.supportReply(activeId, body)
        setMessages((m) => [...m, r.message])
        setThreads((list) =>
          list.map((x) =>
            x.userId === activeId
              ? { ...x, lastText: body, lastAuthor: 'admin', lastRole: 'support', lastAt: new Date().toISOString() }
              : x,
          ),
        )
        onToast('Ответ отправлен от лица поддержки. ИИ на этом чате подождёт', true)
      }
      setText('')
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Не удалось отправить', false)
    } finally {
      setSending(false)
    }
  }, [text, activeId, activeTicket, mode, sending, onToast])

  const setTicketStatus = useCallback(
    async (ticketId: string, status: string) => {
      try {
        await adminApi.adminTicketStatus(ticketId, status)
        setTickets((list) => list.map((x) => (x.ticketId === ticketId ? { ...x, status } : x)))
        setTicketData((d) => (d && d.ticket.ticketId === ticketId ? { ...d, ticket: { ...d.ticket, status } } : d))
        onToast(status === 'closed' ? 'Обращение закрыто' : 'Обращение открыто заново', true)
      } catch (e) {
        onToast(e instanceof Error ? e.message : 'Не удалось изменить статус', false)
      }
    },
    [onToast],
  )

  const activeChatOpen = mode === 'chats' ? Boolean(activeId) : Boolean(activeTicket)

  const filteredThreads = threads.filter(
    (t) => !q.trim() || t.name.toLowerCase().includes(q.toLowerCase()) || t.username.toLowerCase().includes(q.toLowerCase()),
  )
  const filteredTickets = tickets.filter(
    (t) =>
      !q.trim() ||
      t.name.toLowerCase().includes(q.toLowerCase()) ||
      t.subject.toLowerCase().includes(q.toLowerCase()) ||
      t.username.toLowerCase().includes(q.toLowerCase()),
  )

  const statusBadge = (s: string) =>
    s === 'closed' ? (
      <Badge tone="green">Решено</Badge>
    ) : s === 'answered' ? (
      <Badge tone="amber">В работе</Badge>
    ) : (
      <Badge tone="violet">Ожидает ответа</Badge>
    )

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Список */}
      <Card className={`flex flex-col overflow-hidden ${activeChatOpen ? 'hidden lg:flex' : 'flex'}`}>
        <div className="border-b border-white/[0.06] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Headset className="size-4 text-teal-300" />
            <p className="text-[13px] font-bold text-zinc-200">Поддержка</p>
            <Badge tone="violet">
              {mode === 'chats'
                ? threads.reduce((s, t) => s + t.unread, 0)
                : tickets.reduce((s, t) => s + t.unread, 0)}
            </Badge>
            <div className="ml-auto flex rounded-lg bg-white/[0.06] p-0.5">
              {(
                [
                  { key: 'chats', label: 'Диалоги' },
                  { key: 'tickets', label: 'Обращения' },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setMode(m.key)
                    setActiveId(null)
                    setActiveTicket(null)
                    setThread(null)
                    setTicketData(null)
                  }}
                  className={`rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                    mode === m.key ? 'bg-[#21A038]/20 text-teal-200' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <Input value={q} onChange={setQ} placeholder="Поиск…" className="h-8 text-[12px]" />
        </div>
        <div className="max-h-[560px] flex-1 overflow-y-auto [scrollbar-width:thin]">
          {loading ? (
            <p className="p-4 text-[12px] text-zinc-500">Загрузка…</p>
          ) : mode === 'chats' ? (
            filteredThreads.length === 0 ? (
              <p className="p-4 text-[12px] text-zinc-500">Диалогов пока нет</p>
            ) : (
              filteredThreads.map((t) => (
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
            )
          ) : filteredTickets.length === 0 ? (
            <p className="p-4 text-[12px] text-zinc-500">Обращений пока нет</p>
          ) : (
            filteredTickets.map((t) => (
              <button
                key={t.ticketId}
                type="button"
                onClick={() => void openTicket(t.ticketId)}
                className={`flex w-full items-start gap-2.5 border-b border-white/[0.04] px-3 py-2.5 text-left transition-colors ${
                  activeTicket === t.ticketId ? 'bg-[#21A038]/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-zinc-400">
                  <TicketIcon className="size-4" />
                  {t.online && <span className="absolute -bottom-0 -right-0 size-2 rounded-full bg-emerald-400 ring-2 ring-[#0D120F]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-semibold text-zinc-200">{t.subject}</span>
                    <span className="shrink-0 text-[10px] text-zinc-500">{fmtRel(t.lastAt)}</span>
                  </span>
                  <span className="truncate text-[10.5px] text-zinc-500">
                    {t.name} · #{t.ticketId.slice(-5).toUpperCase()} · {statusBadge(t.status)}
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

      {/* Чат / тикет */}
      <Card className={`flex min-h-[480px] flex-col overflow-hidden ${activeChatOpen ? 'flex' : 'hidden lg:flex'}`}>
        {mode === 'chats' ? (
          !activeId || !thread ? (
            <EmptyState icon={<Headset className="size-8" />} title="Выберите диалог" sub="Слева список игроков в общем чате поддержки. ИИ отвечает сам, вы можете подключиться в любой момент." />
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
              <ThreadView messages={messages} scrollRef={scrollRef} />
            </>
          )
        ) : !activeTicket || !ticketData ? (
          <EmptyState icon={<Inbox className="size-8" />} title="Выберите обращение" sub="Тикеты из приложения «Поддержка»: категория, тема, статус. ИИ отвечает первым сообщением, вы можете перехватить тикет." />
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
              <button type="button" onClick={() => setActiveTicket(null)} className="rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-400 lg:hidden">
                ← Назад
              </button>
              <span className="relative flex size-8 items-center justify-center rounded-full bg-white/[0.07] text-zinc-400">
                <UserIcon className="size-4" />
                {ticketData.user.online && <span className="absolute -bottom-0 -right-0 size-2 rounded-full bg-emerald-400 ring-2 ring-[#0D120F]" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-zinc-100">
                  #{ticketData.ticket.ticketId.slice(-5).toUpperCase()} · {ticketData.ticket.subject}
                </p>
                <p className="truncate text-[11px] text-zinc-500">
                  {ticketData.user.name} · @{ticketData.user.username || 'нет username'}
                  {ticketData.ticket.orderNo ? ` · заказ ${ticketData.ticket.orderNo}` : ''}
                </p>
              </div>
              {statusBadge(ticketData.ticket.status)}
              <Btn
                onClick={() => void setTicketStatus(ticketData.ticket.ticketId, ticketData.ticket.status === 'closed' ? 'open' : 'closed')}
                variant="ghost"
                size="sm"
              >
                {ticketData.ticket.status === 'closed' ? 'Открыть' : 'Решено'}
              </Btn>
            </div>
            <ThreadView messages={ticketData.messages} scrollRef={scrollRef} />
          </>
        )}

        {activeChatOpen && (
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
              placeholder={mode === 'tickets' ? 'Ответить в обращение от лица поддержки…' : 'Ответить игроку от лица поддержки…'}
              className="flex-1 text-[13px]"
            />
            <Btn onClick={() => void send()} disabled={!text.trim() || sending} variant="primary">
              <Send className="size-3.5" /> Отправить
            </Btn>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Общая лента сообщений для диалога и тикета. */
function ThreadView({
  messages,
  scrollRef,
}: {
  messages: SupportThreadMsg[]
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
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
  )
}
