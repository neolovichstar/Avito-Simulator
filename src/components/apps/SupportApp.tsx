'use client'

// Поддержка Resale: чат игрока с саппортом (ИИ-оператор + живой админ).
// Пузыри сообщений, индикатор набора, быстрые вопросы, автообновление 20 с.
import { useCallback, useEffect, useRef, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { api } from '@/lib/api'
import type { SupportMsgDTO } from '@/lib/api'
import { sound } from '@/lib/sound'
import { useOS } from '@/lib/store'

const QUICK = ['Куда пропали деньги?', 'Как заработать быстрее?', 'Звёзды списались, покупка не пришла', 'Не могу продать товар']

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function SupportApp() {
  const [messages, setMessages] = useState<SupportMsgDTO[]>([])
  const [loaded, setLoaded] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [adminActive, setAdminActive] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const session = useOS((s) => s.session)

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
      /* сеть моргнула — попробуем на следующем тике */
    }
  }, [scrollDown])

  useEffect(() => {
    void load()
    // мягкий поллинг: пока открыто приложение, подтягиваем ответы админа
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
        const fresh = res.messages.filter((x) => !known.has(x.id))
        return [...clean, ...fresh]
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
    <div className="flex h-full flex-col bg-[#050D09] text-white">
      {/* Шапка */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#071510] px-4">
        <div className="relative">
          <div
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-[14px] shadow-lg shadow-teal-900/40"
            style={{ background: 'linear-gradient(145deg,#12777C,#0A4B4E)' }}
          >
            <img src="/img/apps/support.png?v=3" alt="" aria-hidden className="size-9 rounded-[12px] object-cover" draggable={false} />
          </div>
          <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#071510] bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-tight">Поддержка Resale</h1>
          <p className="truncate text-[11px] text-white/45">
            {sending ? 'оператор печатает…' : adminActive ? 'вас обслуживает админ' : 'мы онлайн, отвечаем быстро'}
          </p>
        </div>
        {session?.displayName && (
          <span className="shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] text-white/60">
            {session.displayName.slice(0, 14)}
          </span>
        )}
      </header>

      {/* Лента */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
        {!loaded ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/35">
            <div className="size-7 animate-spin rounded-full border-2 border-white/10 border-t-emerald-300/70" />
            <p className="text-xs">Открываем чат…</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-[22px] shadow-xl shadow-teal-900/40"
              style={{ background: 'linear-gradient(145deg,#12777C,#0A4B4E)' }}
            >
                <img src="/img/apps/support.png?v=3" alt="" aria-hidden className="size-14 rounded-[18px] object-cover" draggable={false} />
            </div>
            <h2 className="text-[16px] font-semibold">Чем поможем?</h2>
            <p className="text-[12.5px] leading-relaxed text-white/45">
              Опишите вопрос или выберите тему ниже. Отвечаем сами, без роботов и очередей 🙂
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((m, i) => {
              const mine = m.role === 'user'
              const prev = messages[i - 1]
              const showTime = !prev || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > 5 * 60_000
              return (
                <div key={m.id} className="flex flex-col items-center gap-2.5">
                  {showTime && (
                    <time className="text-[10px] uppercase tracking-wide text-white/25">{timeOf(m.createdAt)}</time>
                  )}
                  <div className={`flex w-full ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm ${
                        mine
                          ? 'rounded-br-md bg-emerald-600/90 text-white'
                          : 'rounded-bl-md bg-white/[0.09] text-white/90'
                      }`}
                    >
                      {!mine && m.author === 'admin' && (
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">Админ</span>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <span className={`mt-1 block text-right text-[9.5px] ${mine ? 'text-emerald-100/60' : 'text-white/30'}`}>
                        {timeOf(m.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white/[0.09] px-4 py-3" aria-label="Оператор печатает">
                  <span className="size-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Быстрые вопросы (пока чат пуст или маленький) */}
      {loaded && messages.length <= 1 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setText(q)
                void send()
              }}
              className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-3.5 py-2 text-[11.5px] text-emerald-100/85 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Ввод */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#071510] px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2.5">
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
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-[18px] bg-white/[0.07] px-4 py-2.5 text-[14px] leading-snug text-white outline-none placeholder:text-white/30 focus:bg-white/[0.1]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!text.trim() || sending}
            aria-label="Отправить"
            className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-900/50 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90 disabled:opacity-35 disabled:shadow-none"
          >
            <SendHorizontal className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
