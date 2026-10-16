'use client'

// Realtime-подключение к socket.io через шлюз (XTransformPort=3003).
// 64-b/C2 + 64-c/C2: сокет аутентифицируется bearer-токеном сессии
// (socket.io option auth: { token }) — uid больше НЕ передаётся клиентом:
// сервер проверяет токен через /api/mini-auth и сам джойнит 'global' и
// `user:${uid}` из ответа API. Подписки на чужие каналы сервер отклоняет.
import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getToken } from '@/lib/api'
import { useOS } from '@/lib/store'
import type { ChatMessageDTO, NotificationDTO } from '@/lib/types'

let socket: Socket | null = null

// 64-c/M2: реестр желаемых доп-каналов (переживает reconnect). subscribeChannels
// регистрирует канал и эмитит 'subscribe' немедленно; на каждом 'connect' хук
// пере-эмитит subscribe по ВСЕМ зарегистрированным каналам — подписки больше
// не теряются после обрыва связи.
const gRt = globalThis as typeof globalThis & { __avitoRtChannels?: Set<string> }
function wantedChannels(): Set<string> {
  if (!gRt.__avitoRtChannels) gRt.__avitoRtChannels = new Set()
  return gRt.__avitoRtChannels
}

export function subscribeChannels(sock: Socket, channels: string[]): void {
  const list = channels.filter((c) => typeof c === 'string' && c.length > 0)
  for (const c of list) wantedChannels().add(c)
  if (list.length) sock.emit('subscribe', { channels: list })
}

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
      reconnectionAttempts: Infinity, // 64-c/L5: не умирать после 10 попыток
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
      timeout: 8000,
      // 64-c/C2: bearer-токен сессии вместо query.uid — uid определяет сервер
      auth: { token: getToken() },
    })
    socket = s
    // отладочный доступ (QA): window.__avitoSocket
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__avitoSocket = s
    }

    const os = useOS.getState

    s.on('connect', () => {
      // сервер сам джойнит 'global' и user:<uid>; явный subscribe нужен для
      // пере-подписки ВСЕХ зарегистрированных каналов после reconnect (M2)
      subscribeChannels(s, ['global', `user:${userId}`])
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
      // личные каналы прежнего юзера не должны пере-подписаться после релогина
      for (const c of [...wantedChannels()]) {
        if (c.startsWith('user:')) wantedChannels().delete(c)
      }
    }
  }, [userId])
}
