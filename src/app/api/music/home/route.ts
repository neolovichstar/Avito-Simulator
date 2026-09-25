import { NextResponse } from 'next/server'
import { trending, cached, seededShuffle, type Track } from '@/lib/audius'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Главная «Музыки»: курированные секции полных треков всех жанров и языков.
 * Основа — живые чарты Audius (по жанрам), поэтому подборка всегда «как в
 * реальном сервисе», а не случайный набор. Всё кэшируется на 20 минут.
 */
export async function GET() {
  try {
    const sections = await cached('home:v2', 20 * 60_000, async () => {
      // Чарт недели — все жанры (это и «мировые хиты», и «русские», всё вместе).
      const chartP = trending(undefined, 'week', 30)

      const genreDefs: { key: string; title: string; subtitle: string; genre: string }[] = [
        { key: 'pop', title: 'Поп', subtitle: 'Хиты недели', genre: 'Pop' },
        { key: 'hiphop', title: 'Хип-хоп', subtitle: 'Чарт жанра', genre: 'Hip-Hop/Rap' },
        { key: 'rock', title: 'Рок', subtitle: 'Лучшее сейчас', genre: 'Rock' },
        { key: 'electronic', title: 'Электроника', subtitle: 'Танцпол недели', genre: 'Electronic' },
        { key: 'rnb', title: 'R&B', subtitle: 'Волна настроения', genre: 'R&B/Soul' },
        { key: 'lofi', title: 'Lo-Fi', subtitle: 'Фон для дел', genre: 'Lo-Fi' },
      ]
      const genrePs = genreDefs.map((g) => trending(g.genre, 'week', 20).then((t) => ({ g, tracks: t })))

      const [chart, ...genreRes] = await Promise.allSettled([chartP, ...genrePs])

      const out: { key: string; title: string; subtitle?: string; tracks: Track[] }[] = []
      const chartTracks = chart.status === 'fulfilled' ? chart.value : []

      if (chartTracks.length) {
        out.push({ key: 'chart', title: 'Чарт', subtitle: 'Топ прослушиваний на этой неделе', tracks: chartTracks.slice(0, 20) })
      }

      const pool: Track[] = [...chartTracks]
      for (const r of genreRes) {
        if (r.status !== 'fulfilled' || r.value.tracks.length < 4) continue
        out.push({ key: r.value.g.key, title: r.value.g.title, subtitle: r.value.g.subtitle, tracks: r.value.tracks })
        pool.push(...r.value.tracks)
      }

      // «Новинки»: самые свежие релизы из всего пула (2025-2026 поднимаются наверх).
      const dated = pool.filter((t) => t.releaseDate)
      dated.sort((a, b) => (a.releaseDate! < b.releaseDate! ? 1 : -1))
      const seen = new Set<string>()
      const fresh: Track[] = []
      for (const t of dated) {
        if (seen.has(t.id)) continue
        seen.add(t.id)
        fresh.push(t)
        if (fresh.length >= 15) break
      }
      if (fresh.length >= 6) {
        out.push({ key: 'fresh', title: 'Новинки', subtitle: 'Свежие релизы', tracks: fresh })
      }

      // «Микс дня»: детерминированный на день шаффл чарта — как персональная волна.
      if (chartTracks.length >= 8) {
        const day = new Date().toISOString().slice(0, 10)
        out.push({
          key: 'mix',
          title: 'Микс дня',
          subtitle: 'Обновляется каждый день',
          tracks: seededShuffle(chartTracks, `mix:${day}`).slice(0, 15),
        })
      }

      return out
    })

    return NextResponse.json({ sections })
  } catch (e) {
    console.error('[music/home] failed', e)
    return NextResponse.json({ sections: [], offline: true }, { status: 200 })
  }
}
