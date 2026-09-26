'use client'

// Чат с продавцом/покупателем — светлый дизайн 1:1 как настоящий Авито:
// белая шапка, пузыри (входящие белые, исходящие #CDEFD3), зелёная кнопка Send.
// Всё решение — в переписке: счёты, торг, ИИ-собеседник. Логика не тронута.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ChevronLeft, Send, Receipt, Loader2, Star, CheckCheck, Banknote, X, Phone, Truck, PackageCheck, CheckCircle2,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { sound } from '@/lib/sound'
import { useCall, startOsLiveCall } from '@/lib/call'
import { ensureConnected } from '@/lib/live-call'
import { botDigits, formatNumber } from '@/lib/phone'
import { getSocket } from '@/lib/use-realtime'
import { fmtMoney, fmtTime } from '@/lib/format'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import { useDrag } from '@/lib/use-swipe'
import type { ChatDetailData, ChatDeliveryDTO, ChatMessageDTO } from '@/lib/types'

// Тик 1с — прогресс посылки в чате живой
function useTick(intervalMs = 1000): number {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, intervalMs)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / intervalMs),
    () => 0,
  )
}

// ─── Статус-строка посылки в чате сделки (28-b) ───
// После оплаты: «Продавец собирает товар…» → «В пути» с прогрессом → «Прибыл — заберите».
// Для продавца: «Курьер забирает ваш товар…» → деньги после доставки.
function DeliveryLine({ d }: { d: ChatDeliveryDTO }) {
  useTick(1000)
  const openApp = useOS((s) => s.openApp)
  const now = Date.now()
  const start = new Date(d.createdAt).getTime()
  const end = new Date(d.eta).getTime()
  const pct = Math.min(100, Math.max(3, Math.round(((now - start) / Math.max(1, end - start)) * 100)))
  const etaLeft = end - now

  const phase = (() => {
    if (d.status === 'collecting') {
      return d.kind === 'sale'
        ? { icon: PackageCheck, label: 'Курьер забирает ваш товар…', tone: '#B25E09', bg: '#FFF4E5' }
        : { icon: PackageCheck, label: 'Продавец собирает товар…', tone: '#B25E09', bg: '#FFF4E5' }
    }
    if (d.status === 'in_transit') {
      return d.kind === 'sale'
        ? { icon: Truck, label: `Товар в пути к покупателю${etaLeft > 0 ? ` · ${Math.max(1, Math.ceil(etaLeft / 60000))} мин` : ''}`, tone: '#B25E09', bg: '#FFF4E5' }
        : { icon: Truck, label: `В пути${etaLeft > 0 ? ` · прибудет через ${Math.max(1, Math.ceil(etaLeft / 60000))} мин` : ''}`, tone: '#B25E09', bg: '#FFF4E5' }
    }
    if (d.status === 'arrived') {
      return { icon: PackageCheck, label: 'Прибыл — заберите в Доставках', tone: '#067A47', bg: '#E6F9EF' }
    }
    if (d.status === 'returned') {
      return { icon: Truck, label: 'Посылка возвращена · деньги на счёте', tone: '#D14343', bg: '#FDEBEB' }
    }
    return d.kind === 'sale'
      ? { icon: CheckCircle2, label: 'Доставлено · деньги зачислены', tone: '#067A47', bg: '#E6F9EF' }
      : { icon: CheckCircle2, label: 'Получено · вещь в инвентаре', tone: '#067A47', bg: '#E6F9EF' }
  })()
  const Icon = phase.icon
  const running = d.status === 'collecting' || d.status === 'in_transit' || d.status === 'arrived'

  return (
    <button
      type="button"
      onClick={() => openApp('delivery')}
      aria-label={`Открыть Доставки: ${phase.label}`}
      className="mx-3 mb-2 flex w-[calc(100%-24px)] items-center gap-2 rounded-xl border border-[#EBEDF0] bg-white p-2.5 text-left active:bg-[#F7F8FA]"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: phase.bg, color: phase.tone }}
        aria-hidden
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold" style={{ color: phase.tone }}>
          {phase.label}
        </span>
        {running && (
          <span className="mt-1 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-[#F0F1F5]">
              <span
                className="block h-full rounded-full transition-[width] duration-700 ease-linear"
                style={{ width: `${pct}%`, backgroundColor: d.status === 'arrived' ? '#067A47' : '#E8A020' }}
              />
            </span>
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-[#8B8F99]">
              {d.status === 'arrived' ? 'ПВЗ' : `${pct}%`}
            </span>
          </span>
        )}
      </span>
      <span className="shrink-0 text-[10px] font-semibold text-[#8B8F99]">{fmtMoney(d.price)}</span>
    </button>
  )
}

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

// Быстрые реплики-чипы для торга с ботом (28-a): 2-3 живые подсказки, честные —
// показывают, ЧТО можно сделать прямо сейчас (согласиться на цену бота, сбить, уточнить).
function botChips(chat: ChatDetailData): { label: string; text: string }[] {
  const price = chat.listing.price
  if (chat.role === 'buyer') {
    const offer = chat.lastBotOffer
    if (offer && offer > 0) {
      return [
        { label: 'А конечная цена?', text: 'А какая конечная цена? Без торга' },
        { label: `Заберу сегодня за ${fmtMoney(offer)}`, text: `Заберу сегодня за ${fmtMoney(offer)} — по рукам` },
        { label: 'А если наличкой?', text: 'А если наличкой — скинешь?' },
      ]
    }
    return [
      { label: 'Ещё актуально?', text: 'Здравствуйте! Ещё актуально?' },
      { label: 'Последняя цена?', text: 'Какая ваша последняя цена?' },
      { label: 'А если наличкой?', text: 'А если наличкой — скинешь?' },
    ]
  }
  return [
    { label: 'Да, продаётся', text: 'Да, ещё продаётся' },
    { label: 'Сколько даёшь?', text: 'Сколько даёте? Самовывоз сегодня' },
    { label: `Отдам за ${fmtMoney(Math.round(price * 0.95))}`, text: `Готов отдать за ${fmtMoney(Math.round(price * 0.95))}, если заберёте сегодня` },
  ]
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

  // пока открыт чат с живым игроком — держим сигналинг онлайна (входящие звонки,
  // 27-e). Хук — до early-return'ов загрузки (правила хуков).
  useEffect(() => {
    if (chat && !chat.counterpart.isBot) void ensureConnected()
  }, [chat])

  // realtime: подписка на канал чата + индикатор печати
  useEffect(() => {
    const s = getSocket()
    if (!s) return
    s.emit('subscribe', { channels: [`chat:${id}`] })
    const onMsg = (d: { chatId: string; message: ChatMessageDTO }) => {
      if (d.chatId !== id) return
      setTyping(false)
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
      pushToast('Resale', 'Счёт оплачен — посылка собирается, следите в Доставках')
      await load()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Не удалось оплатить')
    } finally {
      setSending(false)
    }
  }

  if (loading && !chat) {
    return (
      <div className="h-full bg-[#F7F8FA] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#8B8F99]" size={28} />
      </div>
    )
  }
  if (error && !chat) {
    return (
      <div className="h-full bg-[#F7F8FA] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-[#D14343]">{error}</p>
        <button onClick={onBack} className="h-11 px-5 rounded-[12px] bg-[#F0F1F5] text-sm font-semibold text-black">Назад</button>
      </div>
    )
  }
  if (!chat) return null

  // Живой голосовой звонок продавцу по этому товару: звонок уровня ОС (useCall),
  // экран рисует системный CallOverlay — из приложения можно выйти, звонок продолжится.
  const callSeller = () => {
    sound.tap()
    useCall.getState().startCall({
      name: chat.counterpart.displayName,
      number: formatNumber(botDigits(chat.counterpart.id)),
      peerUserId: chat.counterpart.id,
      personaId: null, // сервер вычислит личность по боту
      listingTitle: chat.listing.title,
      listingPrice: chat.listing.price,
    })
  }

  // LIVE P2P (27-e): собеседник — РЕАЛЬНЫЙ игрок. Звонок через сигналинг :3303
  // + WebRTC: входящий экран появится у него поверх всей ОС. Логика ботов не тронута.
  const callLiveUser = () => {
    sound.tap()
    void startOsLiveCall({
      name: chat.counterpart.displayName,
      number: '', // у живых игроков нет телефонного номера — только имя
      peerUserId: chat.counterpart.id,
      live: true,
      listingTitle: chat.listing.title,
      listingPrice: chat.listing.price,
    })
  }

  const canPayInvoices = chat.role === 'buyer'
  const swipeProgress = Math.min(1, swipeX / 150)

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-[#F7F8FA]"
      style={{
        transform: `translateX(${swipeX}px)`,
        transition: swiping ? 'none' : 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        boxShadow: swipeX > 0 ? '-24px 0 48px -24px rgba(0,0,0,0.25)' : undefined,
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

      {/* шапка: назад, аватар 36, имя bold, рейтинг */}
      <div className="shrink-0 bg-white border-b border-[#EBEDF0]">
        <div className="px-2 py-1.5 flex items-center gap-1">
          <button onClick={onBack} aria-label="Назад" className="w-10 h-10 flex items-center justify-center rounded-full text-black active:bg-[#F0F1F5]">
            <ChevronLeft size={22} aria-hidden />
          </button>
          <UserAvatar name={chat.counterpart.displayName} className="w-9 h-9 rounded-full" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-bold text-black truncate">{chat.counterpart.displayName}</span>
              {/* честный индикатор настроения бота (28-a) — считает сервер */}
              {chat.counterpart.isBot && chat.mood && (
                <span aria-label={`Настроение: ${chat.mood.label}`} title={chat.mood.label}>{chat.mood.emoji}</span>
              )}
              {chat.counterpart.online && <span className="w-2 h-2 rounded-full bg-[#0AC760] shrink-0" aria-label="Онлайн" />}
            </div>
            <div className="text-[11px] text-[#8B8F99] flex items-center gap-1">
              <Star size={9} className="text-[#0AC760] fill-[#0AC760]" aria-hidden />
              {chat.counterpart.rating > 0 ? `${chat.counterpart.rating.toFixed(1)} (${chat.counterpart.ratingCount})` : 'Новый продавец'}
            </div>
          </div>
        </div>
        {/* карточка товара */}
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-[#F0F1F5] p-2">
          <img loading="lazy" decoding="async" src={chat.listing.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-white"/>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-black truncate">{chat.listing.title}</p>
            <p className="text-xs font-bold text-black">
              {chat.listing.price === 0 ? 'Даром' : fmtMoney(chat.listing.price)}
              <span className="text-[10px] font-normal text-[#8B8F99] ml-1.5">{CONDITION_LABEL[chat.listing.condition]}</span>
            </p>
          </div>
          {chat.listing.status === 'sold' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-[#8B8F99] font-bold">ПРОДАНО</span>
          )}
        </div>
        {/* тонкая строка настроения — только когда состояние заметное (28-a) */}
        {chat.counterpart.isBot && chat.mood && chat.mood.state !== 'neutral' && (
          <p className="px-4 -mt-0.5 pb-1.5 text-[10px] text-[#8B8F99]" role="status">
            {chat.mood.emoji} {chat.mood.label}
          </p>
        )}
      </div>

      {/* сообщения: входящие белые, исходящие #CDEFD3 */}
      {chat.delivery && <DeliveryLine d={chat.delivery} />}
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] p-3 space-y-1.5">
        {chat.messages.map((m) => {
          if (m.senderType === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="text-[11px] text-[#8B8F99] bg-[#F0F1F5] rounded-full px-3 py-1">
                  {pretty(m.text)}
                </span>
              </div>
            )
          }
          const isMine = m.senderId === chat.messages.find((x) => x.mine)?.senderId || m.mine
          const mine = m.mine
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-[18px] px-3 py-2 ${
                mine ? 'bg-[#CDEFD3] text-[#1A1A1A] rounded-br-[6px]' : 'bg-white text-black rounded-bl-[6px]'
              }`}>
                {m.kind === 'invoice' ? (
                  <div className="min-w-[180px]">
                    <div className={`flex items-center gap-1.5 text-xs font-semibold ${mine ? 'text-[#1A1A1A]/70' : 'text-[#8B8F99]'}`}>
                      <Banknote size={14} aria-hidden /> Счёт за товар
                    </div>
                    <div className="text-xl font-extrabold mt-1 tabular-nums">{fmtMoney(m.amount ?? 0)}</div>
                    {!mine && m.paid === null && canPayInvoices && chat.listing.status === 'active' && (
                      <button
                        onClick={() => pay(m.invoiceId!)}
                        disabled={sending}
                        className="mt-2 w-full h-9 rounded-[10px] bg-black text-white text-xs font-bold active:bg-[#1A1A1A] disabled:opacity-50"
                      >
                        Оплатить {fmtMoney(m.amount ?? 0)}
                      </button>
                    )}
                    {m.paid !== null && (
                      <div className={`mt-1.5 text-[11px] font-semibold flex items-center gap-1 ${mine ? 'text-[#1A1A1A]/80' : 'text-[#067A47]'}`}>
                        <CheckCheck size={12} aria-hidden /> Оплачен
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-snug whitespace-pre-wrap break-words">{pretty(m.text)}</p>
                )}
                <div className={`text-[9px] mt-1 text-right ${mine ? 'text-[#1A1A1A]/50' : 'text-[#8B8F99]'}`}>
                  {fmtTime(m.createdAt)}
                </div>
              </div>
            </div>
          )
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-white rounded-[18px] rounded-bl-[6px] px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#C4C8CF] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {msg && <div className="shrink-0 px-4 pb-1 text-xs text-[#D14343]">{msg}</div>}

      {/* быстрые ответы: у ботов — живые реплики торга (28-a), с живыми людьми — базовые */}
      {!text.trim() && (
        <div className="shrink-0 flex gap-1.5 overflow-x-auto px-2.5 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: 'pan-x' }}>
          {(chat.counterpart.isBot ? botChips(chat) : QUICK[chat.role === 'buyer' ? 'buy' : 'sell'](chat.listing.price)).map((q) => (
            <button
              key={q.label}
              onClick={() => { setDraft(q.text); sound.tap() }}
              className="shrink-0 whitespace-nowrap rounded-[10px] border border-[#EBEDF0] bg-white px-3 py-2 text-[13px] font-medium text-black active:bg-[#F0F1F5]"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {/* ввод: звонок + счёт + белая пилюля + зелёная круглая кнопка отправки.
          Звонок: бот-продавцу (26-d, ИИ-разговор) или живому игроку (27-e, P2P). */}
      <div className="shrink-0 bg-[#F7F8FA] border-t border-[#EBEDF0] p-2.5 flex items-center gap-2">
        {(chat.counterpart.isBot
          ? chat.role === 'buyer' && chat.listing.status !== 'sold'
          : true) && (
          <button
            onClick={chat.counterpart.isBot ? callSeller : callLiveUser}
            aria-label={
              chat.counterpart.isBot
                ? `Позвонить продавцу ${chat.counterpart.displayName} по товару`
                : `Позвонить ${chat.counterpart.displayName}`
            }
            title={chat.counterpart.isBot ? 'Позвонить продавцу' : 'Позвонить'}
            className="w-11 h-11 rounded-full bg-[#F0F1F5] flex items-center justify-center text-[#0AC760] shrink-0 active:scale-95 transition-transform"
          >
            <Phone size={19} aria-hidden />
          </button>
        )}
        <button
          onClick={() => { setInvoiceOpen(true); setInvoiceAmount(String(chat.listing.price)) }}
          aria-label="Выставить счёт"
          className="w-11 h-11 rounded-full bg-[#F0F1F5] flex items-center justify-center text-[#5C616B] shrink-0 active:scale-95 transition-transform"
        >
          <Receipt size={19} aria-hidden />
        </button>
        <input
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Сообщение..."
          aria-label="Сообщение"
          className="flex-1 h-11 bg-white border border-[#EBEDF0] rounded-full px-4 text-sm outline-none text-black placeholder:text-[#8B8F99] focus:border-[#C4C8CF]"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label="Отправить"
          className="w-11 h-11 rounded-full bg-[#0AC760] text-white flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-40"
        >
          {sending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Send size={18} aria-hidden />}
        </button>
      </div>

      {/* диалог счёта */}
      {invoiceOpen && (
        <div className="absolute inset-0 z-40 bg-black/50 flex items-end" onClick={() => setInvoiceOpen(false)}>
          <div className="bg-white w-full rounded-t-3xl p-4 space-y-3 animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-black">Выставить счёт</h3>
              <button onClick={() => setInvoiceOpen(false)} aria-label="Закрыть" className="w-9 h-9 rounded-full bg-[#F0F1F5] flex items-center justify-center text-[#5C616B]">
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="text-xs text-[#8B8F99]">
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
              className="w-full h-12 rounded-[12px] bg-[#F0F1F5] px-4 text-lg font-bold outline-none text-black placeholder:text-[#8B8F99] focus:ring-1 focus:ring-[#C4C8CF]"
            />
            <button
              onClick={sendInvoice}
              className="w-full h-12 rounded-[12px] bg-black text-white text-[15px] font-bold active:bg-[#1A1A1A]"
            >
              Отправить счёт
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
