'use client'

// Список чатов «Resale» — светлый дизайн 1:1 как настоящий Авито:
// поиск сверху, круглые аватары 48, имя bold 15, сниппет 14, время 11,
// зелёный бейдж непрочитанных. Живой: «печатает…» из realtime и черновики из localStorage.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageSquare, Search, X } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { getSocket } from '@/lib/use-realtime'
import { timeAgo, initials, hueColor } from '@/lib/format'
import type { ChatListItem } from '@/lib/types'

export default function ChatsScreen({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const [items, setItems] = useState<ChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  // chatId → имя того, кто печатает (гаснет через 8с)
  const [typing, setTyping] = useState<Record<string, string>>({})
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // chatId → текст черновика (из localStorage, пересчитываем при загрузке списка)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // триггер перечитывания черновиков после прихода сообщений (чтобы бейдж не зависал)
  const [draftsTick, setDraftsTick] = useState(0)

  const load = useCallback(async () => {
    try {
      const { items } = await api.chats()
      setItems(items)
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [load])

  // черновики: читаем localStorage после каждой загрузки списка (и по фокусу окна)
  const idsKey = useMemo(() => items.map((c) => c.id).join(','), [items])
  useEffect(() => {
    const readDrafts = () => {
      if (!items.length) return
      const d: Record<string, string> = {}
      for (const c of items) {
        try {
          const v = localStorage.getItem(`avito_draft_${c.id}`)
          if (v && v.trim()) d[c.id] = v.trim()
        } catch { /* приватный режим */ }
      }
      setDrafts(d)
    }
    readDrafts()
    window.addEventListener('focus', readDrafts)
    return () => window.removeEventListener('focus', readDrafts)
  }, [items, draftsTick])

  // realtime: слушаем typing и приход сообщений по каналам всех видимых чатов
  useEffect(() => {
    const s = getSocket()
    if (!s || !idsKey) return
    const channels = idsKey.split(',').map((id) => `chat:${id}`)
    s.emit('subscribe', { channels })
    const stopTyping = (chatId: string) => {
      clearTimeout(typingTimers.current[chatId])
      setTyping((prev) => {
        if (!(chatId in prev)) return prev
        const { [chatId]: _gone, ...rest } = prev
        return rest
      })
    }
    const onTyping = (d: { chatId: string; name: string }) => {
      setTyping((prev) => ({ ...prev, [d.chatId]: d.name }))
      clearTimeout(typingTimers.current[d.chatId])
      typingTimers.current[d.chatId] = setTimeout(() => stopTyping(d.chatId), 8_000)
    }
    // сообщение пришло — «печатает…» этого чата гасим сразу,
    // а чуть позже перечитываем черновики (отправка могла его стереть)
    const onMsg = (d: { chatId: string }) => {
      stopTyping(d.chatId)
      setTimeout(() => setDraftsTick((t) => t + 1), 700)
    }
    s.on('typing', onTyping)
    s.on('chat:message', onMsg)
    return () => {
      s.off('typing', onTyping)
      s.off('chat:message', onMsg)
      s.emit('unsubscribe', { channels })
      Object.values(typingTimers.current).forEach(clearTimeout)
      typingTimers.current = {}
    }
  }, [idsKey])

  // клиентский поиск по имени/товару/сниппету
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((c) =>
      c.counterpart.displayName.toLowerCase().includes(needle) ||
      c.listingTitle.toLowerCase().includes(needle) ||
      (c.lastMessage?.text ?? '').toLowerCase().includes(needle),
    )
  }, [items, q])

  if (loading) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <Loader2 className="animate-spin text-[#8B8F99]" size={28} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto [scrollbar-width:thin] bg-white">
      {/* шапка: заголовок + поиск */}
      <div className="sticky top-0 z-10 bg-white px-4 pt-3 pb-2.5 border-b border-[#EBEDF0]">
        <h1 className="text-[20px] font-bold text-black leading-tight mb-2.5">Сообщения</h1>
        <div className="flex items-center gap-2 bg-[#F0F1F5] rounded-[12px] px-3.5 h-10">
          <Search size={17} className="text-[#8B8F99] shrink-0" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по чатам"
            aria-label="Поиск по чатам"
            className="bg-transparent outline-none text-[15px] w-full text-black placeholder:text-[#8B8F99]"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Очистить поиск"
              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[#8B8F99] active:bg-black/[0.06]"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-[#FDEBEB] text-[#D14343] text-sm rounded-xl p-3 m-3">{error}</div>}
      {items.length === 0 ? (
        <div className="text-center pt-16 px-8">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-[#F0F1F5] flex items-center justify-center" aria-hidden>
            <MessageSquare size={28} className="text-[#8B8F99]" />
          </div>
          <p className="text-[15px] text-black font-semibold mt-3">Сообщений пока нет</p>
          <p className="text-[13px] text-[#8B8F99] mt-1 leading-relaxed">
            Напишите продавцу с карточки товара — или боты сами напишут вам, когда увидят ваши объявления
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-[13px] text-[#8B8F99] pt-10 px-8">Никого не нашлось по запросу «{q.trim()}»</p>
      ) : (
        <div className="divide-y divide-[#EBEDF0]">
          {filtered.map((c) => {
            const isTyping = Boolean(typing[c.id])
            const draft = drafts[c.id]
            return (
              <button
                key={c.id}
                onClick={() => onOpenChat(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#F7F8FA] transition-colors"
              >
                {/* круглый аватар 48 + зелёная точка онлайн */}
                <span className="relative shrink-0">
                  <span
                    className="w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-bold text-white"
                    style={{ background: hueColor(c.counterpart.id.length * 47 % 360) }}
                    aria-hidden
                  >
                    {initials(c.counterpart.displayName)}
                  </span>
                  {c.counterpart.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#0AC760] ring-2 ring-white" aria-label="Онлайн" />
                  )}
                  {isTyping && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 items-center gap-[3px] rounded-full bg-white px-1 shadow-sm ring-1 ring-[#EBEDF0]">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-1 rounded-full bg-[#0AC760] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-bold text-black truncate">{c.counterpart.displayName}</span>
                    {c.role === 'seller' && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[#FFF4E5] text-[#B25E09] font-bold shrink-0">ПРОДАЖА</span>
                    )}
                    <span className="text-[11px] text-[#8B8F99] ml-auto shrink-0">
                      {c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ''}
                    </span>
                  </div>
                  {isTyping ? (
                    <p className="text-[14px] font-medium text-[#067A47] truncate mt-0.5">печатает…</p>
                  ) : draft ? (
                    <p className="text-[14px] truncate mt-0.5 text-[#5C616B]">
                      <span className="font-semibold">Черновик:</span> {draft.slice(0, 60)}
                    </p>
                  ) : (
                    <p className="text-[14px] text-[#8B8F99] truncate mt-0.5">
                      {c.lastMessage
                        ? `${c.lastMessage.mine ? 'Вы: ' : ''}${c.lastMessage.kind === 'invoice' ? `Счёт на ${c.lastMessage.text.replace(/[^\d\s₽]/g, '')}` : c.lastMessage.text}`
                        : `Товар: ${c.listingTitle}`}
                    </p>
                  )}
                  <p className="text-[12px] text-[#8B8F99] truncate mt-0.5">{c.listingTitle}</p>
                </div>
                {c.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#0AC760] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {c.unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
