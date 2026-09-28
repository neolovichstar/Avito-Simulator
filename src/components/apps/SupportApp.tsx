'use client'

// Поддержка Resale — редизайн по макету upload-серии «Поддержка» (4 экрана).
// Тикетная система: список обращений со статус-бейджами, чат обращения
// (оператор «Алина»: ИИ-автоответ + живой админ), форма нового обращения,
// справочный центр (популярные темы + FAQ). Нижний таб-бар как в макете:
// Главная / Поиск / (+) / Поддержка (общий чат) / Профиль.
//
// Светлая система как в «Доставках»: фон #F6F7F9, белые карточки
// rounded-[20px], акцент зелёный #12894B, капс-лейблы, плавные анимации
// screen-enter + press. Бэкенд: /api/support/tickets (+ общий чат /api/support).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell, CheckCheck, ChevronLeft, ChevronRight, CreditCard, Ellipsis, Headset, Home, Image as ImageIcon,
  MessageSquare, Package, Paperclip, Plus, Search, Send, ShieldCheck, Sparkles, UserRound, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { SupportTicketDTO, SupportTicketMsgDTO, SupportMsgDTO } from '@/lib/api'
import { fmtMoney } from '@/lib/format'
import { sound } from '@/lib/sound'
import { useOS } from '@/lib/store'

// ── палитра макета ──
const GREEN = '#12894B'
const CAPS = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400'
const CARD = 'rounded-[20px] bg-white shadow-[0_2px_14px_rgba(23,24,26,0.05)]'

type Screen = 'list' | 'chat' | 'new' | 'help' | 'profile' | 'general'

type TicketStatus = 'open' | 'answered' | 'closed'

function statusMeta(s: string): { label: string; cls: string } {
  if (s === 'closed') return { label: 'Решено', cls: 'bg-[#e4f6ec] text-[#15803D]' }
  if (s === 'answered') return { label: 'В работе', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Ожидает ответа', cls: 'bg-gray-100 text-gray-500' }
}

const CATEGORIES = [
  { key: 'order', label: 'Проблема с заказом', icon: Package },
  { key: 'account', label: 'Вопрос по аккаунту', icon: UserRound },
  { key: 'refund', label: 'Refund / Возврат', icon: CreditCard },
  { key: 'safety', label: 'Безопасность', icon: ShieldCheck },
  { key: 'other', label: 'Другое', icon: MessageSquare },
]

function categoryOf(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[4]
}

function shortNo(id: string): string {
  return `#${id.slice(-5).toUpperCase()}`
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/** Аватар оператора поддержки (мягкий бирюзовый градиент + гарнитура). */
function OperatorAvatar({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, background: 'linear-gradient(145deg,#159C86,#0E6E5C)' }}
    >
      <Headset style={{ width: size * 0.52, height: size * 0.52 }} />
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status)
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${m.cls}`}>{m.label}</span>
  )
}

// ───────────────────────── Экран: список обращений ─────────────────────────

function TicketCard({ t, onOpen, index }: { t: SupportTicketDTO; onOpen: () => void; index: number }) {
  const cat = categoryOf(t.category)
  const Icon = cat.icon
  return (
    <button
      type="button"
      onClick={() => {
        sound.tap()
        onOpen()
      }}
      className="press screen-enter block w-full text-left"
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className={`${CARD} p-4`}>
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-gray-100 text-gray-700">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#17181A]">{cat.label}</h3>
              <StatusBadge status={t.status} />
            </div>
            <p className="mt-0.5 text-[12.5px] text-gray-400">
              {shortNo(t.id)} · {fmtWhen(t.createdAt)}
            </p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-gray-500">{t.preview}</p>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-[#C4C8CF]" aria-hidden />
        </div>
      </div>
    </button>
  )
}

function ListScreen({
  tickets,
  loading,
  onOpen,
  onNew,
}: {
  tickets: SupportTicketDTO[]
  loading: boolean
  onOpen: (id: string) => void
  onNew: () => void
}) {
  const [seg, setSeg] = useState<'active' | 'archive'>('active')
  const active = tickets.filter((t) => t.status !== 'closed')
  const archive = tickets.filter((t) => t.status === 'closed')
  const list = seg === 'active' ? active : archive

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-1">
        <button
          type="button"
          onClick={() => {
            sound.tap()
            onNew()
          }}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-[16px] text-[15px] font-semibold text-white"
          style={{ background: GREEN, boxShadow: '0 8px 20px rgba(18,137,75,0.28)' }}
        >
          <Plus className="size-5" aria-hidden />
          Создать обращение
        </button>

        <div className="mt-3.5 flex rounded-full bg-[#ECEEF1] p-1" role="tablist" aria-label="Обращения">
          {(
            [
              { key: 'active', label: `Мои обращения${active.length ? ` ${active.length}` : ''}` },
              { key: 'archive', label: 'Архив' },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={seg === s.key}
              onClick={() => {
                sound.tap()
                setSeg(s.key)
              }}
              className={`press h-9 flex-1 rounded-full text-[13px] font-semibold transition-colors ${
                seg === s.key ? 'bg-white text-[#17181A] shadow-[0_1px_6px_rgba(23,24,26,0.10)]' : 'text-gray-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4 [scrollbar-width:thin]">
        {loading ? (
          <>
            <div className="h-[104px] animate-pulse rounded-[20px] bg-white" />
            <div className="h-[104px] animate-pulse rounded-[20px] bg-white" />
            <div className="h-[104px] animate-pulse rounded-[20px] bg-white" />
          </>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-8 pt-14 text-center">
            <span className="flex size-16 items-center justify-center rounded-[22px] bg-white text-gray-400 shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
              <Package className="size-7" aria-hidden />
            </span>
            <h3 className="text-[15px] font-bold text-[#17181A]">
              {seg === 'active' ? 'Обращений пока нет' : 'Архив пуст'}
            </h3>
            <p className="text-[13px] leading-relaxed text-gray-500">
              {seg === 'active'
                ? 'Создайте обращение — оператор поддержки ответит в течение пары минут.'
                : 'Решённые обращения будут появляться здесь.'}
            </p>
          </div>
        ) : (
          list.map((t, i) => <TicketCard key={t.id} t={t} index={i} onOpen={() => onOpen(t.id)} />)
        )}
      </div>
    </div>
  )
}

// ───────────────────────── Экран: чат обращения ─────────────────────────

const QUICK_REPLIES = ['Спасибо', 'Понятно', 'Буду ждать', 'Решено']

function ChatScreen({
  ticketId,
  onBack,
  onClosed,
}: {
  ticketId: string
  onBack: () => void
  onClosed: () => void
}) {
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('other')
  const [status, setStatus] = useState<TicketStatus>('open')
  const [no, setNo] = useState('')
  const [messages, setMessages] = useState<SupportTicketMsgDTO[]>([])
  const [loaded, setLoaded] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const cat = categoryOf(category)

  const scrollDown = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    })
  }, [])

  const load = useCallback(async () => {
    try {
      const t = await api.supportTicketThread(ticketId)
      setSubject(t.ticket.subject)
      setCategory(t.ticket.category)
      setStatus(t.ticket.status as TicketStatus)
      setNo(shortNo(t.ticket.id))
      setMessages(t.messages)
      setLoaded(true)
      scrollDown(false)
    } catch {
      /* сеть моргнула */
    }
  }, [ticketId, scrollDown])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 20_000)
    return () => clearInterval(t)
  }, [load])

  const send = useCallback(
    async (raw?: string) => {
      const body = (raw ?? text).trim()
      if (!body || sending) return
      sound.tap()
      setSending(true)
      setText('')
      const optimistic: SupportTicketMsgDTO = {
        id: `tmp_${Date.now()}`,
        role: 'user',
        author: 'user',
        text: body,
        createdAt: new Date().toISOString(),
      }
      setMessages((m) => [...m, optimistic])
      scrollDown()
      try {
        const res = await api.supportTicketSend(ticketId, body)
        setMessages((m) => {
          const clean = m.filter((x) => x.id !== optimistic.id)
          const known = new Set(clean.map((x) => x.id))
          return [...clean, ...res.messages.filter((x) => !known.has(x.id))]
        })
        setStatus((s) => (s === 'closed' ? s : 'answered'))
        scrollDown()
      } catch {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id))
        setText(body)
      } finally {
        setSending(false)
      }
    },
    [text, sending, scrollDown, ticketId],
  )

  const closeTicket = useCallback(async () => {
    sound.tap()
    setMenu(false)
    try {
      const r = await api.supportTicketClose(ticketId, status === 'closed' ? 'reopen' : 'close')
      setStatus(r.status as TicketStatus)
      if (r.status === 'closed') onClosed()
    } catch {
      /* ignore */
    }
  }, [ticketId, status, onClosed])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* шапка */}
      <header className="relative flex h-14 shrink-0 items-center gap-2 px-2">
        <button
          type="button"
          onClick={() => {
            sound.tap()
            onBack()
          }}
          aria-label="Назад"
          className="press flex size-10 items-center justify-center rounded-full text-[#17181A]"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[16px] font-bold text-[#17181A]">Обращение {no}</h1>
          <p className="truncate text-[11.5px] text-gray-400">{cat.label}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            sound.tap()
            setMenu((v) => !v)
          }}
          aria-label="Меню обращения"
          aria-expanded={menu}
          className="press flex size-10 items-center justify-center rounded-full text-[#17181A]"
        >
          <Ellipsis className="size-5" aria-hidden />
        </button>
        {menu && (
          <div className="absolute right-2 top-12 z-20 w-52 overflow-hidden rounded-[16px] bg-white py-1 shadow-[0_12px_40px_rgba(23,24,26,0.16)] screen-enter">
            <button
              type="button"
              onClick={() => void closeTicket()}
              className="press w-full px-4 py-2.5 text-left text-[14px] text-[#17181A] hover:bg-[#F5F6F8]"
            >
              {status === 'closed' ? 'Открыть заново' : 'Пометить решённым'}
            </button>
          </div>
        )}
      </header>

      {/* тема */}
      <div className="shrink-0 px-4 pb-2">
        <div className={`${CARD} flex items-center gap-2 px-3.5 py-2.5`}>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#17181A]">{subject}</span>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* лента */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2 [scrollbar-width:thin]">
        {!loaded ? (
          <div className="flex h-full items-center justify-center">
            <div className="size-7 animate-spin rounded-full border-2 border-gray-200 border-t-[#12894B]" />
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.role === 'user'
            return (
              <div key={m.id} className={`screen-enter flex w-full ${mine ? 'justify-end' : 'justify-start'}`}>
                {mine ? (
                  <div className="max-w-[84%] rounded-[18px] rounded-br-md bg-gray-100 px-3.5 py-2.5">
                    <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[#17181A]">{m.text}</p>
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-gray-400">
                      {timeOf(m.createdAt)}
                      <CheckCheck className="size-3.5" aria-hidden />
                    </span>
                  </div>
                ) : (
                  <div className="max-w-[88%]">
                    <div className="mb-1 flex items-center gap-2">
                      <OperatorAvatar size={26} />
                      <div className="leading-tight">
                        <p className="text-[12.5px] font-bold text-[#17181A]">Алина</p>
                        <p className="text-[10px] text-gray-400">Оператор поддержки{m.author === 'admin' ? ' · старший смены' : ''}</p>
                      </div>
                      <time className="ml-auto pl-2 text-[10px] text-gray-400">{timeOf(m.createdAt)}</time>
                    </div>
                    <div className="rounded-[18px] rounded-tl-md bg-white px-3.5 py-2.5 shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
                      <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[#17181A]">{m.text}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-[18px] rounded-tl-md bg-white px-4 py-3 shadow-[0_2px_14px_rgba(23,24,26,0.05)]" aria-label="Оператор печатает">
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* быстрые ответы */}
      <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            type="button"
            disabled={status === 'closed'}
            onClick={() => {
              if (q === 'Решено') void closeTicket()
              else void send(q)
            }}
            className="press shrink-0 rounded-full bg-[#ECEEF1] px-3.5 py-2 text-[12.5px] font-medium text-gray-700 transition-transform active:scale-95 disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      {/* ввод */}
      <div className="shrink-0 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-1">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => sound.tap()}
            aria-label="Прикрепить файл (скоро)"
            className="press flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[#ECEEF1] text-gray-500"
          >
            <Paperclip className="size-5" aria-hidden />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            aria-label="Сообщение оператору"
            placeholder="Написать сообщение…"
            disabled={status === 'closed'}
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-[21px] bg-[#ECEEF1] px-4 py-2.5 text-[14px] leading-snug text-[#17181A] outline-none placeholder:text-gray-400 focus:bg-[#E6E8ED] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!text.trim() || sending || status === 'closed'}
            aria-label="Отправить"
            className="press flex size-[42px] shrink-0 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(18,137,75,0.35)] transition-transform active:scale-90 disabled:opacity-35 disabled:shadow-none"
            style={{ background: GREEN }}
          >
            <Send className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── Экран: новое обращение ─────────────────────────

function NewScreen({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const [category, setCategory] = useState('order')
  const [catOpen, setCatOpen] = useState(false)
  const [orderNo, setOrderNo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const cat = categoryOf(category)

  const submit = useCallback(async () => {
    if (busy) return
    sound.tap()
    setErr('')
    if (!subject.trim() || !body.trim()) {
      setErr('Заполните тему и описание обращения')
      return
    }
    setBusy(true)
    try {
      const r = await api.supportTicketCreate({
        category,
        subject: subject.trim(),
        orderNo: orderNo.trim() || undefined,
        body: body.trim(),
      })
      onCreated(r.ticket.id)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Не удалось отправить обращение')
      setBusy(false)
    }
  }, [busy, category, subject, body, orderNo, onCreated])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => {
            sound.tap()
            onBack()
          }}
          aria-label="Назад"
          className="press flex size-10 items-center justify-center rounded-full text-[#17181A]"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <h1 className="flex-1 text-center text-[16px] font-bold text-[#17181A]">Новое обращение</h1>
        <span className="size-10 shrink-0" aria-hidden />
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-2 [scrollbar-width:thin]">
        {/* категория */}
        <button type="button" onClick={() => { sound.tap(); setCatOpen(true) }} className="press block w-full text-left">
          <div className={`${CARD} flex items-center gap-3 p-4`}>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-gray-100 text-gray-700">
              <cat.icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-gray-400">Категория обращения</span>
              <span className="block truncate text-[14.5px] font-semibold text-[#17181A]">{cat.label}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#C4C8CF]" aria-hidden />
          </div>
        </button>

        {/* номер заказа */}
        <div className={`${CARD} flex items-center gap-3 p-4`}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-gray-100 text-gray-700">
            <Package className="size-5" aria-hidden />
          </span>
          <label className="min-w-0 flex-1">
            <span className="block text-[12px] text-gray-400">Номер заказа (если есть)</span>
            <input
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              placeholder="Например, №45821"
              className="w-full bg-transparent text-[14.5px] font-semibold text-[#17181A] outline-none placeholder:font-normal placeholder:text-[#C4C8CF]"
            />
          </label>
        </div>

        {/* тема */}
        <div className={`${CARD} flex items-center gap-3 p-4`}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-gray-100 text-gray-700">
            <MessageSquare className="size-5" aria-hidden />
          </span>
          <label className="min-w-0 flex-1">
            <span className="block text-[12px] text-gray-400">Тема обращения</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Кратко опишите суть проблемы"
              maxLength={120}
              className="w-full bg-transparent text-[14.5px] font-semibold text-[#17181A] outline-none placeholder:font-normal placeholder:text-[#C4C8CF]"
            />
          </label>
        </div>

        {/* описание */}
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-gray-100 text-gray-700">
              <MessageSquare className="size-5" aria-hidden />
            </span>
            <span className="flex-1 text-[12px] text-gray-400">Подробное описание</span>
            <span className="text-[11px] tabular-nums text-[#C4C8CF]">{body.length}/1000</span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 1000))}
            rows={4}
            placeholder="Расскажите, что произошло. Чем больше деталей — тем быстрее мы сможем помочь."
            className="mt-2 w-full resize-none rounded-[12px] bg-[#F5F6F8] p-3 text-[13.5px] leading-relaxed text-[#17181A] outline-none placeholder:text-[#C4C8CF]"
          />
        </div>

        {/* скриншоты */}
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-gray-100 text-gray-700">
              <ImageIcon className="size-5" aria-hidden />
            </span>
            <span className="flex-1 text-[12px] text-gray-400">Скриншоты (по желанию)</span>
          </div>
          <button
            type="button"
            onClick={() => sound.tap()}
            className="press mt-3 flex h-20 w-full flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed border-[#EBEDF0] text-gray-400"
          >
            <Plus className="size-5" aria-hidden />
            <span className="text-[12px]">Добавить фото</span>
          </button>
        </div>

        {err && <p className="px-1 text-[12.5px] font-medium text-red-500">{err}</p>}
      </div>

      <div className="shrink-0 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="press flex h-12 w-full items-center justify-center rounded-[16px] text-[15px] font-semibold text-white disabled:opacity-60"
          style={{ background: GREEN, boxShadow: '0 8px 20px rgba(18,137,75,0.28)' }}
        >
          {busy ? 'Отправляем…' : 'Отправить обращение'}
        </button>
      </div>

      {/* шторка категории */}
      {catOpen && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Выбор категории">
          <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/25 os-fade" onClick={() => setCatOpen(false)} />
          <div className="relative rounded-t-[24px] bg-white pb-[calc(14px+env(safe-area-inset-bottom))] os-sheet-rise">
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-[#E1E4E9]" aria-hidden />
            <h2 className="px-5 pb-1 pt-3.5 text-[16px] font-bold text-[#17181A]">Категория обращения</h2>
            <div className="max-h-[380px] overflow-y-auto px-3 pb-2 [scrollbar-width:thin]">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    sound.tap()
                    setCategory(c.key)
                    setCatOpen(false)
                  }}
                  className={`press flex w-full items-center gap-3 rounded-[14px] p-3 text-left ${
                    category === c.key ? 'bg-[#E6F6EC]' : ''
                  }`}
                >
                  <span className="flex size-10 items-center justify-center rounded-[12px] bg-gray-100 text-gray-700">
                    <c.icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex-1 text-[14.5px] font-semibold text-[#17181A]">{c.label}</span>
                  {category === c.key && <CheckCheck className="size-4 text-[#15803D]" aria-hidden />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Экран: справочный центр ─────────────────────────

const TOPICS = [
  { key: 'orders', title: 'Заказы и доставка', desc: 'Статусы, задержки, получение', icon: Package },
  { key: 'pay', title: 'Оплата и возврат', desc: 'Платежи, отмены, возвраты средств', icon: CreditCard },
  { key: 'account', title: 'Аккаунт и профиль', desc: 'Регистрация, данные, безопасность', icon: UserRound },
  { key: 'trade', title: 'Покупка и продажа', desc: 'Размещение, сделки, правила', icon: ShieldCheck },
]

const FAQ: { q: string; a: string; topic: string }[] = [
  { topic: 'orders', q: 'Где мой заказ?', a: 'Откройте «Доставки»: статус и таймлайн обновляются там в реальном времени. Когда курьер будет в вашем городе, придёт уведомление.' },
  { topic: 'orders', q: 'Что делать, если товар не пришел?', a: 'Создайте обращение с категорией «Проблема с заказом» и номером заказа — мы проверим отправление и вернём деньги, если посылка потеряна.' },
  { topic: 'pay', q: 'Как оформить возврат?', a: 'В разделе «Refund / Возврат» создайте обращение: укажите заказ и причину. Средства возвращаются в Банк в течение суток после решения.' },
  { topic: 'pay', q: 'Комиссии и способы оплаты', a: 'Внутри игры оплата идёт с баланса Банка. Пополнить баланс можно заданием, продажами или бонусом каждый день.' },
  { topic: 'account', q: 'Как изменить данные в профиле?', a: 'Имя и аватар берутся из профиля Telegram. Био и город меняются в Настройках ОС Resale.' },
  { topic: 'trade', q: 'Как продавать быстрее?', a: 'Ставьте честную цену (смотрите раздел «Сервис»), поднимайте объявление в «Аукционе» и отвечайте в чатах быстро — рейтинг продавца растёт.' },
]

function HelpScreen({ onNew }: { onNew: () => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const faq = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return FAQ
    return FAQ.filter((f) => f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle))
  }, [q])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-4 pt-1">
        <h1 className="text-[24px] font-bold leading-tight text-[#17181A]">Справочный центр</h1>
        <div className="mt-3 flex h-11 items-center gap-2.5 rounded-full bg-[#ECEEF1] px-4">
          <Search className="size-4.5 shrink-0 text-gray-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти ответ на вопрос…"
            aria-label="Поиск по справке"
            className="w-full bg-transparent text-[14px] text-[#17181A] outline-none placeholder:text-gray-400"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Очистить" className="press flex size-5 items-center justify-center rounded-full bg-[#D9DCE1] text-white">
              <X className="size-3" aria-hidden />
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 [scrollbar-width:thin]">
        {!q && (
          <>
            <p className={CAPS}>Популярные темы</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {TOPICS.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    sound.tap()
                    setQ(t.title.split(' ')[0].toLowerCase())
                  }}
                  className="press screen-enter block text-left"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className={`${CARD} h-full p-4`}>
                    <span className="flex size-10 items-center justify-center rounded-[12px] bg-gray-100 text-gray-700">
                      <t.icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-2.5 text-[13.5px] font-bold leading-tight text-[#17181A]">{t.title}</h3>
                    <p className="mt-1 text-[11.5px] leading-snug text-gray-400">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-5 flex items-baseline justify-between">
          <p className={CAPS}>{q ? 'Результаты' : 'Часто задаваемые вопросы'}</p>
        </div>
        <div className="mt-2.5 overflow-hidden rounded-[20px] bg-white shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
          {faq.length === 0 ? (
            <p className="px-4 py-5 text-[13.5px] text-gray-500">Ничего не нашлось. Напишите в поддержку ниже.</p>
          ) : (
            faq.map((f, i) => {
              const isOpen = open === f.q
              return (
                <div key={f.q} className={i > 0 ? 'border-t border-[#F0F2F5]' : ''}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      sound.tap()
                      setOpen(isOpen ? null : f.q)
                    }}
                    className="press flex w-full items-center gap-2 px-4 py-3.5 text-left"
                  >
                    <span className="flex-1 text-[14px] font-semibold text-[#17181A]">{f.q}</span>
                    <ChevronRight className={`size-4 shrink-0 text-[#C4C8CF] transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} aria-hidden />
                  </button>
                  <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                      <p className="px-4 pb-4 text-[13px] leading-relaxed text-gray-500">{f.a}</p>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <button type="button" onClick={() => { sound.tap(); onNew() }} className="press screen-enter mt-4 block w-full text-left">
          <div className="flex items-center gap-3 rounded-[20px] bg-[#E6F6EC] p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-[#15803D] shadow-[0_2px_10px_rgba(18,137,75,0.18)]">
              <Headset className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-[#17181A]">Не нашли ответ?</span>
              <span className="block text-[12.5px] text-gray-500">Напишите в поддержку — мы поможем</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#15803D]" aria-hidden />
          </div>
        </button>
      </div>
    </div>
  )
}

// ───────────────────────── Экран: профиль ─────────────────────────

function ProfileScreen({ tickets }: { tickets: SupportTicketDTO[] }) {
  const session = useOS((s) => s.session)
  const solved = tickets.filter((t) => t.status === 'closed').length
  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 pb-4 pt-2 [scrollbar-width:thin]">
      <div className={`${CARD} flex items-center gap-3.5 p-5`}>
        <span className="flex size-14 items-center justify-center rounded-full text-[18px] font-bold text-white" style={{ background: 'linear-gradient(145deg,#159C86,#0E6E5C)' }}>
          {(session?.displayName ?? 'И').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-bold text-[#17181A]">{session?.displayName ?? 'Игрок'}</h2>
          <p className="text-[12.5px] text-gray-400">
            {session?.username ? `${session.username} · ` : ''}уровень {session?.level ?? 1}
          </p>
        </div>
        <span className="rounded-full bg-[#E6F6EC] px-3 py-1.5 text-[13px] font-bold text-[#15803D]">{fmtMoney(session?.balance ?? 0)}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {[
          { label: 'Обращений', value: tickets.length },
          { label: 'Решено', value: solved },
          { label: 'В работе', value: tickets.filter((t) => t.status !== 'closed').length },
        ].map((s) => (
          <div key={s.label} className={`${CARD} p-3.5 text-center`}>
            <p className="text-[20px] font-bold tabular-nums text-[#17181A]">{s.value}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} mt-3 p-4`}>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#D9A514]" aria-hidden />
          <p className="text-[13.5px] font-bold text-[#17181A]">Как получить помощь быстрее</p>
        </div>
        <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-gray-500">
          <li>• Опишите вопрос деталями: номер заказа, что произошло, когда.</li>
          <li>• Один вопрос — одно обращение: так ответ придёт точнее.</li>
          <li>• Общий чат «Поддержка» внизу — для коротких вопросов.</li>
        </ul>
      </div>
    </div>
  )
}

// ───────────────────────── Экран: общий чат (вкладка «Поддержка») ─────────────────────────

function GeneralChatScreen() {
  const [messages, setMessages] = useState<SupportMsgDTO[]>([])
  const [loaded, setLoaded] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [adminActive, setAdminActive] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const scrollDown = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    })
  }, [])

  const load = useCallback(async () => {
    try {
      const t = await api.supportThread()
      setMessages(t.messages)
      setLoaded(true)
      scrollDown(false)
    } catch {
      /* сеть моргнула */
    }
  }, [scrollDown])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 20_000)
    return () => clearInterval(t)
  }, [load])

  const send = useCallback(async () => {
    const body = text.trim()
    if (!body || sending) return
    sound.tap()
    setSending(true)
    setText('')
    const optimistic: SupportMsgDTO = {
      id: `tmp_${Date.now()}`,
      role: 'user',
      author: 'user',
      text: body,
      createdAt: new Date().toISOString(),
    }
    setMessages((m) => [...m, optimistic])
    scrollDown()
    try {
      const res = await api.supportSend(body)
      setMessages((m) => {
        const clean = m.filter((x) => x.id !== optimistic.id)
        const known = new Set(clean.map((x) => x.id))
        return [...clean, ...res.messages.filter((x) => !known.has(x.id))]
      })
      setAdminActive(res.adminActive)
      scrollDown()
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id))
      setText(body)
    } finally {
      setSending(false)
    }
  }, [text, sending, scrollDown])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-1">
        <OperatorAvatar size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight text-[#17181A]">Поддержка Resale</h1>
          <p className="truncate text-[11.5px] text-gray-400">
            {sending ? 'оператор печатает…' : adminActive ? 'вас обслуживает старший смены' : 'мы онлайн, отвечаем быстро'}
          </p>
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-2 [scrollbar-width:thin]">
        {!loaded ? (
          <div className="flex h-full items-center justify-center">
            <div className="size-7 animate-spin rounded-full border-2 border-gray-200 border-t-[#12894B]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <OperatorAvatar size={64} />
            <h2 className="text-[16px] font-bold text-[#17181A]">Чем поможем?</h2>
            <p className="text-[12.5px] leading-relaxed text-gray-500">
              Короткий вопрос — сюда. Для проблем с заказами лучше создать обращение.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.role === 'user'
            return (
              <div key={m.id} className={`flex w-full ${mine ? 'justify-end' : 'justify-start'}`}>
                {mine ? (
                  <div className="max-w-[84%] rounded-[18px] rounded-br-md bg-gray-100 px-3.5 py-2.5">
                    <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[#17181A]">{m.text}</p>
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-gray-400">
                      {timeOf(m.createdAt)}
                      <CheckCheck className="size-3.5" aria-hidden />
                    </span>
                  </div>
                ) : (
                  <div className="max-w-[88%]">
                    <div className="mb-1 flex items-center gap-2">
                      <OperatorAvatar size={26} />
                      <p className="text-[12.5px] font-bold text-[#17181A]">Алина</p>
                      {m.author === 'admin' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-semibold text-amber-700">старший смены</span>
                      )}
                      <time className="ml-auto pl-2 text-[10px] text-gray-400">{timeOf(m.createdAt)}</time>
                    </div>
                    <div className="rounded-[18px] rounded-tl-md bg-white px-3.5 py-2.5 shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
                      <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[#17181A]">{m.text}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-[18px] rounded-tl-md bg-white px-4 py-3 shadow-[0_2px_14px_rgba(23,24,26,0.05)]" aria-label="Оператор печатает">
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-1">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            aria-label="Сообщение в поддержку"
            placeholder="Опишите вопрос…"
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-[21px] bg-[#ECEEF1] px-4 py-2.5 text-[14px] leading-snug text-[#17181A] outline-none placeholder:text-gray-400 focus:bg-[#E6E8ED]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!text.trim() || sending}
            aria-label="Отправить"
            className="press flex size-[42px] shrink-0 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(18,137,75,0.35)] transition-transform active:scale-90 disabled:opacity-35 disabled:shadow-none"
            style={{ background: GREEN }}
          >
            <Send className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── Корень ─────────────────────────

type Tab = 'home' | 'help' | 'support' | 'profile'

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: 'home', label: 'Главная', icon: Home },
  { key: 'help', label: 'Поиск', icon: Search },
  { key: 'support', label: 'Поддержка', icon: Headset },
  { key: 'profile', label: 'Профиль', icon: UserRound },
]

export default function SupportApp() {
  const [screen, setScreen] = useState<Screen>('list')
  const [tab, setTab] = useState<Tab>('home')
  const [tickets, setTickets] = useState<SupportTicketDTO[]>([])
  const [loaded, setLoaded] = useState(false)
  const [openTicket, setOpenTicket] = useState<string | null>(null)
  const [bell, setBell] = useState(false)

  const loadTickets = useCallback(async () => {
    try {
      const r = await api.supportTickets()
      setTickets(r.tickets)
      setLoaded(true)
    } catch {
      /* сеть моргнула */
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(() => void loadTickets(), 0)
    const t = setInterval(() => void loadTickets(), 20_000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [loadTickets])

  const unreadTotal = useMemo(() => tickets.reduce((s, t) => s + t.unread, 0), [tickets])

  const openList = useCallback(() => {
    setOpenTicket(null)
    setScreen('list')
    setTab('home')
  }, [])

  return (
    <div className="relative flex h-full flex-col bg-[#F5F6F8] text-[#17181A]">
      {(screen === 'list' || screen === 'profile') && (
        <header className="shrink-0 px-4 pb-1 pt-1.5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] text-[#17181A]">Поддержка</h1>
              <p className="mt-0.5 text-[12.5px] leading-snug text-gray-400">
                Мы всегда рядом. Помогаем быстро
                <br />и по делу.
              </p>
            </div>
            <div className="relative mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sound.tap()
                  setBell((v) => !v)
                }}
                aria-label="Обновления обращений"
                aria-expanded={bell}
                className="press relative flex size-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-[0_2px_10px_rgba(23,24,26,0.06)]"
              >
                <Bell className="size-5" aria-hidden />
                {unreadTotal > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4.5 min-w-[18px] items-center justify-center rounded-full bg-[#E4573D] px-1 text-[9.5px] font-bold text-white">
                    {unreadTotal}
                  </span>
                )}
              </button>
              <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-[#ECEEF1] text-gray-500">
                <UserRound className="size-5" />
              </span>
              {bell && (
                <div className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-[18px] bg-white py-1.5 shadow-[0_14px_44px_rgba(23,24,26,0.18)] screen-enter">
                  <p className="px-4 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">Новые ответы</p>
                  {tickets.filter((t) => t.unread > 0).length === 0 ? (
                    <p className="px-4 py-3 text-[13px] text-gray-500">Все ответы прочитаны</p>
                  ) : (
                    tickets
                      .filter((t) => t.unread > 0)
                      .slice(0, 4)
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            sound.tap()
                            setBell(false)
                            setOpenTicket(t.id)
                            setScreen('chat')
                          }}
                          className="press w-full px-4 py-2.5 text-left hover:bg-[#F5F6F8]"
                        >
                          <p className="truncate text-[13px] font-semibold text-[#17181A]">{categoryOf(t.category).label}</p>
                          <p className="truncate text-[11.5px] text-gray-400">{t.preview}</p>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      <main className="min-h-0 flex-1 pb-[64px]">
        <div key={screen} className="h-full screen-enter">
          {screen === 'list' && (
            <ListScreen
              tickets={tickets}
              loading={!loaded}
              onOpen={(id) => {
                setOpenTicket(id)
                setScreen('chat')
              }}
              onNew={() => setScreen('new')}
            />
          )}
          {screen === 'chat' && openTicket && (
            <ChatScreen ticketId={openTicket} onBack={openList} onClosed={loadTickets} />
          )}
          {screen === 'new' && <NewScreen onBack={openList} onCreated={(id) => { void loadTickets(); setOpenTicket(id); setScreen('chat') }} />}
          {screen === 'help' && <HelpScreen onNew={() => setScreen('new')} />}
          {screen === 'profile' && <ProfileScreen tickets={tickets} />}
          {screen === 'general' && <GeneralChatScreen />}
        </div>
      </main>

      {/* нижний таб-бар как в макете */}
      <nav
        aria-label="Разделы поддержки"
        className="absolute inset-x-0 bottom-0 z-20 flex h-[64px] items-stretch border-t border-black/[0.04] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {TABS.slice(0, 2).map((t) => (
          <TabBtn key={t.key} t={t} active={tab === t.key && screen !== 'general'} onGo={() => { setScreen(t.key === 'home' ? 'list' : 'help'); setTab(t.key) }} />
        ))}
        <div className="relative flex w-1/5 items-start justify-center">
          <button
            type="button"
            onClick={() => {
              sound.tap()
              setScreen('new')
            }}
            aria-label="Создать обращение"
            className="press -mt-5 flex size-[52px] items-center justify-center rounded-full text-white"
            style={{ background: GREEN, boxShadow: '0 10px 22px rgba(18,137,75,0.4)' }}
          >
            <Plus className="size-6" aria-hidden />
          </button>
        </div>
        <TabBtn t={TABS[2]} active={screen === 'general'} onGo={() => { setScreen('general'); setTab('support') }} />
        <TabBtn t={TABS[3]} active={tab === 'profile' && screen === 'profile'} onGo={() => { setScreen('profile'); setTab('profile') }} />
      </nav>
    </div>
  )
}

function TabBtn({
  t,
  active,
  onGo,
}: {
  t: { key: Tab; label: string; icon: typeof Home }
  active: boolean
  onGo: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        sound.tap()
        onGo()
      }}
      aria-current={active ? 'page' : undefined}
      className="press flex w-1/5 flex-col items-center justify-center gap-0.5 pb-1"
    >
      <t.icon className="size-[22px]" style={{ color: active ? GREEN : '#9CA3AF' }} aria-hidden />
      <span className="text-[10px] font-medium" style={{ color: active ? GREEN : '#9CA3AF' }}>
        {t.label}
      </span>
    </button>
  )
}
