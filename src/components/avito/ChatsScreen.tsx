'use client'

// Список чатов «Resale» — светлый минимализм: заголовок 26px, белая пилюля
// поиска, аватары 48, имя bold, сниппет, зелёный бейдж непрочитанных.
// Живой: «печатает…» из realtime и черновики из localStorage.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, MessageCircle } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { getSocket } from '@/lib/use-realtime'
import { timeAgo } from '@/lib/format'
import { UserAvatar } from '@/components/shared/UserAvatar'
import type { ChatListItem } from '@/lib/types'
import { Card, EmptyState, Overline, ScreenTitle, Skeleton, cn } from './ui'

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

  return (
    <div className="h-full overflow-y-auto bg-[#F6F7F9] [scrollbar-width:thin]">
      {/* шапка: заголовок + поиск */}
      <div className="sticky top-0 z-10 bg-[#F6F7F9] px-4 pb-2.5 pt-3">
        <Overline>Resale</Overline>
        <ScreenTitle className="mb-3">Чаты</ScreenTitle>
        <div className="flex h-11 items-center gap-2 rounded-full bg-white px-4 ring-1 ring-black/[0.08]">
          <Search size={17} className="shrink-0 text-black/35" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по чатам"
            aria-label="Поиск по чатам"
            className="w-full bg-transparent text-[15px] text-[#141414] outline-none placeholder:text-black/35"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Очистить поиск"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-black/35 transition-colors active:bg-black/[0.06]"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {error && <div className="m-4 rounded-[16px] bg-red-500/[0.08] p-3 text-sm text-red-600">{error}</div>}
      {loading ? (
        <div className="space-y-2 px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32 rounded-md" />
                <Skeleton className="h-3 w-3/4 rounded-md" />
              </div>
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={28} />}
          title="Сообщений пока нет"
          note="Напишите продавцу с карточки товара. Или боты сами напишут вам, когда увидят ваши объявления"
        />
      ) : filtered.length === 0 ? (
        <p className="px-8 pt-10 text-center text-[13px] text-black/45">Никого не нашлось по запросу «{q.trim()}»</p>
      ) : (
        <Card className="mx-4 divide-y divide-black/[0.05] overflow-hidden">
          {filtered.map((c) => {
            const isTyping = Boolean(typing[c.id])
            const draft = drafts[c.id]
            return (
              <button
                key={c.id}
                onClick={() => onOpenChat(c.id)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-[#F6F7F9]"
              >
                {/* круглый аватар 48 + зелёная точка онлайн */}
                <span className="relative shrink-0">
                  <UserAvatar name={c.counterpart.displayName} className="h-12 w-12 rounded-full" />
                  {c.counterpart.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[#16A34A] ring-2 ring-white" aria-label="Онлайн" />
                  )}
                  {isTyping && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 items-center gap-[3px] rounded-full bg-white px-1 shadow-sm ring-1 ring-black/[0.06]">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-1 animate-bounce rounded-full bg-[#16A34A]" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold text-[#141414]">{c.counterpart.displayName}</span>
                    {c.role === 'seller' && (
                      <span className="shrink-0 rounded bg-amber-500/[0.12] px-1 py-0.5 text-[9px] font-bold text-amber-700">ПРОДАЖА</span>
                    )}
                    <span className="ml-auto shrink-0 text-[11px] text-black/40">
                      {c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ''}
                    </span>
                  </div>
                  {isTyping ? (
                    <p className="mt-0.5 truncate text-[14px] font-medium text-[#16A34A]">печатает…</p>
                  ) : draft ? (
                    <p className="mt-0.5 truncate text-[14px] text-black/55">
                      <span className="font-semibold">Черновик:</span> {draft.slice(0, 60)}
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate text-[14px] text-black/45">
                      {c.lastMessage
                        ? `${c.lastMessage.mine ? 'Вы: ' : ''}${c.lastMessage.kind === 'invoice' ? `Счёт на ${c.lastMessage.text.replace(/[^\d\s₽]/g, '')}` : c.lastMessage.text}`
                        : `Товар: ${c.listingTitle}`}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-[12px] text-black/35">{c.listingTitle}</p>
                </div>
                {c.unread > 0 && (
                  <span className={cn(
                    'flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white',
                    'bg-[#16A34A]',
                  )}>
                    {c.unread}
                  </span>
                )}
              </button>
            )
          })}
        </Card>
      )}
    </div>
  )
}
