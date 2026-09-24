'use client'

// Список чатов Avito
import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { ChatListItem } from '@/lib/types'

export default function ChatsScreen({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const [items, setItems] = useState<ChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenChat(c.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-neutral-50"
            >
              { }
              <img src={c.listingImage} alt="" className="w-12 h-12 rounded-xl object-cover bg-neutral-100 shrink-0" />
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
                <p className="text-xs text-neutral-500 truncate mt-0.5">
                  {c.lastMessage
                    ? `${c.lastMessage.mine ? 'Вы: ' : ''}${c.lastMessage.kind === 'invoice' ? `Счёт на ${c.lastMessage.text.replace(/[^\d\s₽]/g, '')}` : c.lastMessage.text}`
                    : `Товар: ${c.listingTitle}`}
                </p>
                <p className="text-[10px] text-neutral-400 truncate mt-0.5">{c.listingTitle}</p>
              </div>
              {c.unread > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#965EEB] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {c.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
