import { NextResponse } from 'next/server'
import { searchTracks } from '@/lib/audius'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Поиск полных треков по Audius (все жанры и языки). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim().slice(0, 120)
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 30, 1), 50)
  if (q.length < 2) return NextResponse.json({ tracks: [] })
  try {
    const tracks = await searchTracks(q, limit)
    return NextResponse.json({ tracks })
  } catch (e) {
    console.error('[music/search] failed', e)
    return NextResponse.json({ tracks: [] })
  }
}
