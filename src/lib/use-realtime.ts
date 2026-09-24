'use client'

// Realtime-подключение к socket.io через шлюз (XTransformPort=3003)
import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useOS } from '@/lib/store'
import type { ChatMessageDTO, NotificationDTO } from '@/lib/types'

let socket: Socket | null = null

export function getSocket(): Socket | null {
  return socket
}

interface RealtimeEvents {
  onChatMessage?: (payload: { chatId: string; message: ChatMessageDTO }) => void
  onTyping?: (payload: { chatId: string; name: string }) => void
  onDeal?: (payload: { title: string; price: number; role: string }) => void
}

export function useRealtime(userId: string | null | undefined, handlers: RealtimeEvents) {
  const hRef = useRef(handlers)
  useEffect(() => {
    hRef.current = handlers
  })

  useEffect(() => {
    if (!userId || socket) return
    const s = io('/?XTransformPort=3003', {
      transports: ['polling', 'websocket'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 8000,
      query: { uid: userId },
    })
    socket = s
    // отладочный доступ (QA): window.__avitoSocket
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__avitoSocket = s
    }

    const os = useOS.getState

    s.on('connect', () => {
      s.emit('subscribe', { channels: ['global', `user:${userId}`] })
    })

    s.on('online', (d: { online: number }) => os().setOnline(d.online))
    s.on('chat:message', (d: { chatId: string; message: ChatMessageDTO }) => {
      hRef.current.onChatMessage?.(d)
    })
    s.on('typing', (d: { chatId: string; name: string }) => hRef.current.onTyping?.(d))
    s.on('notify', (d: NotificationDTO) => {
      os().addNotification(d)
      os().pushToast(d.title, d.body)
    })
    s.on('deal', (d: { title: string; price: number; role: string }) => {
      hRef.current.onDeal?.(d)
    })

    return () => {
      s.disconnect()
      socket = null
    }
  }, [userId])
}
