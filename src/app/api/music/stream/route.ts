// Прокси стрима Audius: /api/music/stream?id=<trackId>
// Решает три проблемы прямого стрима из webview:
//  1) 302-редирект на контент-ноду, которая может быть недоступна из клиента;
//  2) CORS/ограничения медиа-стека Telegram webview на чужие домены;
//  3) отсутствие ретраев — клиент получает стабильный same-origin поток.
// Поддерживает Range-запросы (перемотка работает как на прямом стриме).
import type { NextRequest } from 'next/server'

const HOST = 'https://discoveryprovider.audius.co'
const APP_NAME = 'resale'
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'] as const

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  // id Audius — короткая латинско-цифровая строка (обычно 7–9 симв.); режем всё остальное.
  if (!/^[A-Za-z0-9]{5,64}$/.test(id)) {
    return new Response('bad track id', { status: 400 })
  }

  const range = req.headers.get('range')
  let upstream: Response
  try {
    upstream = await fetch(`${HOST}/v1/tracks/${id}/stream?app_name=${APP_NAME}`, {
      redirect: 'follow',
      ...(range ? { headers: { Range: range } } : {}),
      cache: 'no-store',
    })
  } catch {
    return new Response('stream upstream unreachable', { status: 502 })
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response('stream not found', { status: upstream.status === 404 ? 404 : 502 })
  }

  const headers = new Headers()
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes')
  if (!headers.has('content-type')) headers.set('content-type', 'audio/mpeg')
  // Треки неизменяемы — кэш на сутки снимает повторные прокси-запросы.
  headers.set('cache-control', 'public, max-age=86400')

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  })
}
