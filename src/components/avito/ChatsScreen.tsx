'use client'

// Список чатов Avito. Живой: показывает «печатает…» из realtime и черновики из localStorage
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { getSocket } from '@/lib/use-realtime'
import { timeAgo } from '@/lib/format'
import type { ChatListItem } from '@/lib/types'

export default function ChatsScreen({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const [items, setItems] = useState<ChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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

  if (loading) {
    return (
      <div className="h-full bg-[#f4f5f7] flex items-center justify-center">
        <Loader2 className="animate-spin text-neutral-300" size={28} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto [scrollbar-width:thin] bg-[#f4f5f7]">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 m-3">{error}</div>}
      {items.length === 0 ? (
        <div className="text-center pt-20 px-8">
          <MessageSquare size={36} className="mx-auto text-neutral-300" />
          <p className="text-sm text-neutral-500 font-medium mt-3">Сообщений пока нет</p>
          <p className="text-xs text-neutral-400 mt-1">
            Напишите продавцу с карточки товара — или боты сами напишут вам, когда увидят ваши объявления
          </p>
        </div>
      ) : (
        <div className="divide-y divide-black/5 bg-white">
          {items.map((c) => {
            const isTyping = Boolean(typing[c.id])
            const draft = drafts[c.id]
            return (
              <button
                key={c.id}
                onClick={() => onOpenChat(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-neutral-50"
              >
                {/* фото + зелёная точка онлайн поверх */}
                <span className="relative shrink-0">
                  <img src={c.listingImage} alt="" className="w-12 h-12 rounded-xl object-cover bg-neutral-100" />
                  {isTyping && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 items-center gap-[3px] rounded-full bg-white px-1 shadow-sm">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-1 rounded-full bg-[#16A34A] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-neutral-900 truncate">{c.counterpart.displayName}</span>
                    {c.counterpart.online && <span className="w-1.5 h-1.5 rounded-full bg-[#04E061] shrink-0" />}
                    {c.role === 'seller' && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-bold shrink-0">ПРОДАЖА</span>
                    )}
                    <span className="text-[10px] text-neutral-400 ml-auto shrink-0">
                      {c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ''}
                    </span>
                  </div>
                  {isTyping ? (
                    <p className="text-xs font-medium text-[#16A34A] truncate mt-0.5">печатает…</p>
                  ) : draft ? (
                    <p className="text-xs truncate mt-0.5 text-[#15803D]">
                      <span className="font-semibold">Черновик:</span> {draft.slice(0, 60)}
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {c.lastMessage
                        ? `${c.lastMessage.mine ? 'Вы: ' : ''}${c.lastMessage.kind === 'invoice' ? `Счёт на ${c.lastMessage.text.replace(/[^\d\s₽]/g, '')}` : c.lastMessage.text}`
                        : `Товар: ${c.listingTitle}`}
                    </p>
                  )}
                  <p className="text-[10px] text-neutral-400 truncate mt-0.5">{c.listingTitle}</p>
                </div>
                {c.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#16A34A] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
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
