// Серверный мост к realtime-сервису (socket.io, порт 3003)
const RT_URL = process.env.REALTIME_URL ?? 'http://127.0.0.1:3003'

export async function emitTo(channel: string, event: string, payload: unknown): Promise<void> {
  try {
    await fetch(`${RT_URL}/emit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.REALTIME_SECRET,
        channel,
        event,
        payload,
      }),
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // realtime не критичен: игра работает и без него
  }
}

export async function realOnlineCount(): Promise<number> {
  try {
    const res = await fetch(`${RT_URL}/presence`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return 0
    const data = (await res.json()) as { online: number }
    return data.online ?? 0
  } catch {
    return 0
  }
}
