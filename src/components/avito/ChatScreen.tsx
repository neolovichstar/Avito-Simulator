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
      pushToast('Сделка', 'Счёт оплачен. Товар ваш!')
      await load()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Не удалось оплатить')
    } finally {
      setSending(false)
    }
  }

  if (loading && !chat) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <Loader2 className="animate-spin text-neutral-300" size={28} />
      </div>
    )
  }
  if (error && !chat) {
    return (
      <div className="h-full bg-white flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={onBack} className="text-sm font-medium text-[#965EEB]">Назад</button>
      </div>
    )
  }
  if (!chat) return null

  const canPayInvoices = chat.role === 'buyer'
  const swipeProgress = Math.min(1, swipeX / 150)

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-[#f4f5f7]"
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
          className="pointer-events-none absolute left-3 top-1/2 z-40 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-900/75 text-white backdrop-blur-sm"
          style={{ opacity: 0.25 + swipeProgress * 0.75 }}
        >
          <ChevronLeft size={20} />
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
      <div className="shrink-0 bg-white border-b border-black/5">
        <div className="px-2 py-1.5 flex items-center gap-1">
          <button onClick={onBack} aria-label="Назад" className="w-10 h-10 flex items-center justify-center rounded-full active:bg-neutral-100">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-neutral-900 truncate">{chat.counterpart.displayName}</span>
              {chat.counterpart.online && <span className="w-2 h-2 rounded-full bg-[#04E061] shrink-0" />}
            </div>
            <div className="text-[10px] text-neutral-400 flex items-center gap-1">
              <Star size={9} className="text-amber-400 fill-amber-400" />
              {chat.counterpart.rating > 0 ? `${chat.counterpart.rating.toFixed(1)} (${chat.counterpart.ratingCount})` : 'Новый продавец'}
            </div>
          </div>
        </div>
        {/* карточка товара */}
        <div className="mx-3 mb-2 flex items-center gap-2 bg-neutral-50 rounded-xl p-2">
          { }
          <img src={chat.listing.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-800 truncate">{chat.listing.title}</p>
            <p className="text-xs font-bold text-neutral-900">
              {chat.listing.price === 0 ? 'Даром' : fmtMoney(chat.listing.price)}
              <span className="text-[10px] font-normal text-neutral-400 ml-1.5">{CONDITION_LABEL[chat.listing.condition]}</span>
            </p>
          </div>
          {chat.listing.status === 'sold' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-500 font-bold">ПРОДАНО</span>
          )}
        </div>
      </div>

      {/* сообщения */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] p-3 space-y-2">
        {chat.messages.map((m) => {
          if (m.senderType === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="text-[11px] text-neutral-500 bg-neutral-200/60 rounded-full px-3 py-1">
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
                mine ? 'bg-[#965EEB] text-white rounded-br-md' : 'bg-white text-neutral-900 rounded-bl-md shadow-sm'
              }`}>
                {m.kind === 'invoice' ? (
                  <div className="min-w-[180px]">
                    <div className={`flex items-center gap-1.5 text-xs font-semibold ${mine ? 'text-white/90' : 'text-neutral-500'}`}>
                      <Banknote size={14} /> Счёт за товар
                    </div>
                    <div className="text-xl font-extrabold mt-1">{fmtMoney(m.amount ?? 0)}</div>
                    {!mine && m.paid === null && canPayInvoices && chat.listing.status === 'active' && (
                      <button
                        onClick={() => pay(m.invoiceId!)}
                        disabled={sending}
                        className="mt-2 w-full h-9 rounded-lg bg-[#04a94e] text-white text-xs font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
                      >
                        Оплатить {fmtMoney(m.amount ?? 0)}
                      </button>
                    )}
                    {m.paid !== null && (
                      <div className={`mt-1.5 text-[11px] font-semibold flex items-center gap-1 ${mine ? 'text-white/80' : 'text-green-600'}`}>
                        <CheckCheck size={12} /> Оплачен
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-snug whitespace-pre-wrap break-words">{pretty(m.text)}</p>
                )}
                <div className={`text-[9px] mt-1 text-right ${mine ? 'text-white/60' : 'text-neutral-300'}`}>
                  {fmtTime(m.createdAt)}
                </div>
              </div>
            </div>
          )
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {msg && <div className="shrink-0 px-4 pb-1 text-xs text-red-500">{msg}</div>}

      {/* быстрые ответы: подсказки-чипсы, пока поле ввода пустое */}
      {!text.trim() && (
        <div className="shrink-0 flex gap-1.5 overflow-x-auto px-2.5 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK[chat.role === 'buyer' ? 'buy' : 'sell'](chat.listing.price).map((q) => (
            <button
              key={q.label}
              onClick={() => { setDraft(q.text); sound.tap() }}
              className="shrink-0 whitespace-nowrap rounded-full border border-[#965EEB]/25 bg-[#965EEB]/[0.07] px-3 py-1.5 text-xs font-medium text-[#7d47c6] active:scale-95 transition-transform"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {/* ввод */}
      <div className="shrink-0 bg-white border-t border-black/5 p-2.5 flex items-center gap-2">
        <button
          onClick={() => { setInvoiceOpen(true); setInvoiceAmount(String(chat.listing.price)) }}
          aria-label="Выставить счёт"
          className="w-11 h-11 rounded-full bg-[#f0f1f3] flex items-center justify-center text-neutral-500 shrink-0 active:scale-95 transition-transform"
        >
          <Receipt size={19} />
        </button>
        <input
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Сообщение..."
          aria-label="Сообщение"
          className="flex-1 h-11 bg-[#f0f1f3] rounded-full px-4 text-sm outline-none placeholder:text-neutral-400"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label="Отправить"
          className="w-11 h-11 rounded-full bg-[#965EEB] text-white flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-40"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} />}
        </button>
      </div>

      {/* диалог счёта */}
      {invoiceOpen && (
        <div className="absolute inset-0 z-40 bg-black/40 flex items-end" onClick={() => setInvoiceOpen(false)}>
          <div className="bg-white w-full rounded-t-3xl p-4 space-y-3 animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900">Выставить счёт</h3>
              <button onClick={() => setInvoiceOpen(false)} aria-label="Закрыть" className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-neutral-400">
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
              className="w-full h-12 bg-[#f0f1f3] rounded-xl px-4 text-lg font-bold outline-none"
            />
            <button
              onClick={sendInvoice}
              className="w-full h-12 rounded-xl bg-[#965EEB] text-white font-bold text-sm active:scale-[0.98] transition-transform"
            >
              Отправить счёт
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
