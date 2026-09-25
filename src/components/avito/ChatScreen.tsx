'use client'

// Чат с продавцом/покупателем. Всё решение — в переписке: счёты, торг, ИИ-собеседник
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft, SendHorizontal, Receipt, Loader2, Star, CheckCheck, Banknote, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { sound } from '@/lib/sound'
import { getSocket } from '@/lib/use-realtime'
import { fmtMoney, fmtTime } from '@/lib/format'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import { useDrag } from '@/lib/use-swipe'
import type { ChatDetailData, ChatMessageDTO } from '@/lib/types'

// контекстные быстрые ответы: свои для покупки, свои для продажи
const QUICK = {
  buy: (price: number) => [
    { label: 'Ещё актуально?', text: 'Здравствуйте! Ещё актуально?' },
    { label: 'Последняя цена?', text: 'Какая ваша последняя цена?' },
    { label: `Отдам за ${fmtMoney(Math.round(price * 0.9))}`, text: `Готов забрать за ${fmtMoney(Math.round(price * 0.9))} — самовывоз, сегодня` },
    { label: 'Торг уместен?', text: 'Торг уместен? Реально заинтересован, приеду и посмотрю' },
  ],
  sell: (price: number) => [
    { label: 'Да, продаётся', text: 'Да, ещё продаётся' },
    { label: 'Цена окончательна', text: 'Цена окончательная, торг минимальный' },
    { label: `Скидка до ${fmtMoney(Math.round(price * 0.95))}`, text: `За быстрый выход готов отдать за ${fmtMoney(Math.round(price * 0.95))}` },
    { label: 'Самовывоз сегодня', text: 'Самовывоз сегодня — забирайте' },
  ],
}

export default function ChatScreen({ id, onBack }: { id: string; onBack: () => void }) {
  // страховка отображения: старые сообщения могли содержать палки-перечисления
  const pretty = (t: string) => t.replace(/\s*\|\s*/g, '. ').replace(/\.{2,}/g, '.')

  const [chat, setChat] = useState<ChatDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [typing, setTyping] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [msg, setMsg] = useState('')
  // черновик сообщения: пишем в localStorage на каждое нажатие — ничего не теряется
  const draftKey = `avito_draft_${id}`
  const setDraft = useCallback((v: string) => {
    setText(v)
    try {
      if (v.trim()) localStorage.setItem(draftKey, v)
      else localStorage.removeItem(draftKey)
    } catch { /* приватный режим — просто без черновика */ }
  }, [draftKey])
  const bottomRef = useRef<HTMLDivElement>(null)
  const refreshSession = useOS((s) => s.refreshSession)
  const pushToast = useOS((s) => s.pushToast)

  // ─── Edge-swipe назад: тянем от левого края вправо — чат «съезжает» и закрывается.
  // Работает и мышью на ПК, и пальцем на телефоне (Pointer Events).
  // Хуки — строго до early-return'ов загрузки/ошибки.
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const edge = useDrag({
    onStart: () => setSwiping(true),
    onMove: (dx) => {
      if (dx > 0) setSwipeX(Math.min(dx * 0.92, 150))
    },
    onEnd: (dx) => {
      setSwiping(false)
      setSwipeX(0)
      if (dx > 90) onBack()
    },
  })

  const load = useCallback(async () => {
    try {
      const c = await api.chat(id)
      setChat(c)
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [id])

  // восстановить черновик этого чата (после загрузки — сбрасываем при смене чата)
  useEffect(() => {
    try { setText(localStorage.getItem(draftKey) ?? '') } catch { setText('') }
  }, [draftKey])

  useEffect(() => { load() }, [load])

  // realtime: подписка на канал чата + индикатор печати
  useEffect(() => {
    const s = getSocket()
    if (!s) return
    s.emit('subscribe', { channels: [`chat:${id}`] })
    const onMsg = (d: { chatId: string; message: ChatMessageDTO }) => {
      if (d.chatId !== id) return
      setTyping(false)
      const mine = d.message.senderType === 'user'
      setChat((prev) => {
        if (!prev) return prev
        if (prev.messages.some((m) => m.id === d.message.id)) return prev
        return { ...prev, messages: [...prev.messages, { ...d.message, mine: d.message.senderId === prev.messages[0]?.senderId && false }] }
      })
      setTimeout(() => load(), 400)
    }
    const onTyping = (d: { chatId: string; name: string }) => {
      if (d.chatId !== id) return
      setTyping(true)
      setTimeout(() => setTyping(false), 8000)
    }
    s.on('chat:message', onMsg)
    s.on('typing', onTyping)
    const t = setInterval(load, 8_000)
    return () => {
      s.off('chat:message', onMsg)
      s.off('typing', onTyping)
      s.emit('unsubscribe', { channels: [`chat:${id}`] })
      clearInterval(t)
    }
  }, [id, load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat?.messages.length, typing])

  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    setText('')
    try {
      await api.sendMessage(id, t)
      setDraft('') // улетело — черновик больше не нужен
      await load()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Не отправилось')
      setDraft(t)
    } finally {
      setSending(false)
    }
  }

  const sendInvoice = async () => {
    const a = Math.round(Number(invoiceAmount.replace(/\s/g, '')))
    if (!Number.isFinite(a) || a < 0) { setMsg('Укажите сумму'); return }
    setInvoiceOpen(false)
    setSending(true)
    setMsg('')
    try {
      await api.sendInvoice(id, a)
      await load()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Не отправилось')
    } finally {
      setSending(false)
    }
  }

  const pay = async (invoiceId: string) => {
    setSending(true)
    setMsg('')
    try {
      const res = await api.payInvoice(id, invoiceId)
      refreshSession({ balance: res.balance, xp: res.xp, level: res.level })
      sound.success()
      pushToast('Resale', 'Счёт оплачен. Товар ваш!')
      await load()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Не удалось оплатить')
    } finally {
      setSending(false)
    }
  }

  if (loading && !chat) {
    return (
      <div className="h-full bg-[#050D09] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/30" size={28} />
      </div>
    )
  }
  if (error && !chat) {
    return (
      <div className="h-full bg-[#050D09] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={onBack} className="text-sm font-medium text-emerald-400">Назад</button>
      </div>
    )
  }
  if (!chat) return null

  const canPayInvoices = chat.role === 'buyer'
  const swipeProgress = Math.min(1, swipeX / 150)

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-[#050D09]"
      style={{
        transform: `translateX(${swipeX}px)`,
        transition: swiping ? 'none' : 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        boxShadow: swipeX > 0 ? '-24px 0 48px -24px rgba(0,0,0,0.35)' : undefined,
      }}
    >
      {/* индикатор «назад» — проявляется по мере свайпа */}
      {swipeX > 4 && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 z-40 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
          style={{ opacity: 0.25 + swipeProgress * 0.75 }}
        >
          <ChevronLeft size={20} aria-hidden />
        </span>
      )}
      {/* левый край-полоса: старт свайпа-назад */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 top-0 z-30 w-5"
        style={{ touchAction: 'none' }}
        onPointerDown={edge.onPointerDown}
      />

      {/* шапка */}
      <div className="shrink-0 bg-[#050D09] border-b border-white/[0.06]">
        <div className="px-2 py-1.5 flex items-center gap-1">
          <button onClick={onBack} aria-label="Назад" className="w-10 h-10 flex items-center justify-center rounded-full text-white active:bg-white/10">
            <ChevronLeft size={22} aria-hidden />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white truncate">{chat.counterpart.displayName}</span>
              {chat.counterpart.online && <span className="w-2 h-2 rounded-full bg-[#22C55E] shrink-0" aria-label="Онлайн" />}
            </div>
            <div className="text-[10px] text-white/40 flex items-center gap-1">
              <Star size={9} className="text-amber-400 fill-amber-400" aria-hidden />
              {chat.counterpart.rating > 0 ? `${chat.counterpart.rating.toFixed(1)} (${chat.counterpart.ratingCount})` : 'Новый продавец'}
            </div>
          </div>
        </div>
        {/* карточка товара */}
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] p-2">

          <img src={chat.listing.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-white/[0.06]" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white/90 truncate">{chat.listing.title}</p>
            <p className="text-xs font-bold text-white">
              {chat.listing.price === 0 ? 'Даром' : fmtMoney(chat.listing.price)}
              <span className="text-[10px] font-normal text-white/40 ml-1.5">{CONDITION_LABEL[chat.listing.condition]}</span>
            </p>
          </div>
          {chat.listing.status === 'sold' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 font-bold">ПРОДАНО</span>
          )}
        </div>
      </div>

      {/* сообщения */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] p-3 space-y-2">
        {chat.messages.map((m) => {
          if (m.senderType === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="text-[11px] text-white/50 bg-white/[0.06] rounded-full px-3 py-1">
                  {pretty(m.text)}
                </span>
              </div>
            )
          }
          const isMine = m.senderId === chat.messages.find((x) => x.mine)?.senderId || m.mine
          const mine = m.mine
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                mine ? 'bg-[#22C55E] text-[#052E16] rounded-br-md' : 'bg-[#0E1F16] border border-white/[0.08] text-white rounded-bl-md'
              }`}>
                {m.kind === 'invoice' ? (
                  <div className="min-w-[180px]">
                    <div className={`flex items-center gap-1.5 text-xs font-semibold ${mine ? 'text-[#052E16]/70' : 'text-white/50'}`}>
                      <Banknote size={14} aria-hidden /> Счёт за товар
                    </div>
                    <div className="text-xl font-extrabold mt-1">{fmtMoney(m.amount ?? 0)}</div>
                    {!mine && m.paid === null && canPayInvoices && chat.listing.status === 'active' && (
                      <button
                        onClick={() => pay(m.invoiceId!)}
                        disabled={sending}
                        className="mt-2 w-full h-9 rounded-lg bg-[#22C55E] text-[#052E16] text-xs font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
                      >
                        Оплатить {fmtMoney(m.amount ?? 0)}
                      </button>
                    )}
                    {m.paid !== null && (
                      <div className={`mt-1.5 text-[11px] font-semibold flex items-center gap-1 ${mine ? 'text-[#052E16]/80' : 'text-emerald-300'}`}>
                        <CheckCheck size={12} aria-hidden /> Оплачен
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-snug whitespace-pre-wrap break-words">{pretty(m.text)}</p>
                )}
                <div className={`text-[9px] mt-1 text-right ${mine ? 'text-[#052E16]/60' : 'text-white/30'}`}>
                  {fmtTime(m.createdAt)}
                </div>
              </div>
            </div>
          )
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-[#0E1F16] border border-white/[0.08] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {msg && <div className="shrink-0 px-4 pb-1 text-xs text-red-400">{msg}</div>}

      {/* быстрые ответы: подсказки-чипсы, пока поле ввода пустое */}
      {!text.trim() && (
        <div className="shrink-0 flex gap-1.5 overflow-x-auto px-2.5 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK[chat.role === 'buyer' ? 'buy' : 'sell'](chat.listing.price).map((q) => (
            <button
              key={q.label}
              onClick={() => { setDraft(q.text); sound.tap() }}
              className="shrink-0 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 active:scale-95 transition-transform"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {/* ввод */}
      <div className="shrink-0 bg-[#050D09] border-t border-white/[0.06] p-2.5 flex items-center gap-2">
        <button
          onClick={() => { setInvoiceOpen(true); setInvoiceAmount(String(chat.listing.price)) }}
          aria-label="Выставить счёт"
          className="w-11 h-11 rounded-full bg-white/[0.06] flex items-center justify-center text-white/70 shrink-0 active:scale-95 transition-transform"
        >
          <Receipt size={19} aria-hidden />
        </button>
        <input
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Сообщение..."
          aria-label="Сообщение"
          className="flex-1 h-11 bg-white/[0.06] border border-white/10 rounded-full px-4 text-sm outline-none text-white placeholder:text-white/40 focus:border-emerald-500/50"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label="Отправить"
          className="w-11 h-11 rounded-full bg-[#22C55E] text-[#052E16] flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-40"
        >
          {sending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <SendHorizontal size={18} aria-hidden />}
        </button>
      </div>

      {/* диалог счёта */}
      {invoiceOpen && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-end" onClick={() => setInvoiceOpen(false)}>
          <div className="bg-[#0B1710] w-full rounded-t-3xl p-4 space-y-3 animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Выставить счёт</h3>
              <button onClick={() => setInvoiceOpen(false)} aria-label="Закрыть" className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/70">
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="text-xs text-white/40">
              {chat.role === 'buyer'
                ? 'Предложите свою цену — продавец решит, соглашаться ли. Если счёт принят, сделка закроется автоматически.'
                : 'Покупатель увидит счёт и сможет оплатить прямо в чате.'}
            </p>
            <input
              inputMode="numeric"
              value={invoiceAmount}
              onChange={(e) => setInvoiceAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="Сумма, ₽"
              aria-label="Сумма счёта"
              className="w-full h-12 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-lg font-bold outline-none text-white placeholder:text-white/40 focus:border-emerald-500/50"
            />
            <button
              onClick={sendInvoice}
              className="w-full h-12 rounded-2xl bg-[#22C55E] text-[#052E16] text-[15px] font-bold active:scale-[0.98] transition-transform"
            >
              Отправить счёт
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
