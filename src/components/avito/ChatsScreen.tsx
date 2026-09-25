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
      <div className="h-full bg-[#050D09] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/30" size={28} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto [scrollbar-width:thin] bg-[#050D09]">
      {error && <div className="border border-red-500/20 bg-red-500/10 text-red-400 text-sm rounded-xl p-3 m-3">{error}</div>}
      {items.length === 0 ? (
        <div className="text-center pt-20 px-8">
          <MessageSquare size={36} className="mx-auto text-white/30" aria-hidden />
          <p className="text-sm text-white/70 font-medium mt-3">Сообщений пока нет</p>
          <p className="text-xs text-white/40 mt-1">
            Напишите продавцу с карточки товара — или боты сами напишут вам, когда увидят ваши объявления
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {items.map((c) => {
            const isTyping = Boolean(typing[c.id])
            const draft = drafts[c.id]
            return (
              <button
                key={c.id}
                onClick={() => onOpenChat(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/[0.04] transition-colors"
              >
                {/* фото + зелёная точка онлайн поверх */}
                <span className="relative shrink-0">
                  <img src={c.listingImage} alt="" className="w-12 h-12 rounded-xl object-cover bg-white/[0.06]" />
                  {isTyping && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 items-center gap-[3px] rounded-full bg-[#0B1710] px-1 ring-1 ring-white/10">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-1 rounded-full bg-[#22C55E] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white truncate">{c.counterpart.displayName}</span>
                    {c.counterpart.online && <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] shrink-0" aria-label="Онлайн" />}
                    {c.role === 'seller' && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-400/15 text-amber-300 font-bold shrink-0">ПРОДАЖА</span>
                    )}
                    <span className="text-[10px] text-white/40 ml-auto shrink-0">
                      {c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ''}
                    </span>
                  </div>
                  {isTyping ? (
                    <p className="text-xs font-medium text-emerald-400 truncate mt-0.5">печатает…</p>
                  ) : draft ? (
                    <p className="text-xs truncate mt-0.5 text-emerald-300">
                      <span className="font-semibold">Черновик:</span> {draft.slice(0, 60)}
                    </p>
                  ) : (
                    <p className="text-xs text-white/50 truncate mt-0.5">
                      {c.lastMessage
                        ? `${c.lastMessage.mine ? 'Вы: ' : ''}${c.lastMessage.kind === 'invoice' ? `Счёт на ${c.lastMessage.text.replace(/[^\d\s₽]/g, '')}` : c.lastMessage.text}`
                        : `Товар: ${c.listingTitle}`}
                    </p>
                  )}
                  <p className="text-[10px] text-white/40 truncate mt-0.5">{c.listingTitle}</p>
                </div>
                {c.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#22C55E] text-[#052E16] text-[11px] font-bold flex items-center justify-center shrink-0">
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
