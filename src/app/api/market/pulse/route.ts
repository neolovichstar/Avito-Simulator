import { cache } from '@/lib/cache'
import { marketPulseData, marketWavesTick } from '@/lib/market-index'
import type { MarketPulseDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ПУЛЬС РЫНКА (28-a): динамический индекс цен + волны рынка.
// При запросе выполняется ленивый тик волн (раз в несколько часов — дрейф
// индекса категории ±5..12% с новостной строчкой), затем отдаём топ-5 движений:
// за час по истории цен (PricePoint) + за день по EMA-индексу сделок.
export async function GET() {
  await marketWavesTick().catch(() => {})
  const data = await cache.getOrSet('market:pulse:28a', 45_000, async (): Promise<MarketPulseDTO> => {
    const { moves, headline } = await marketPulseData()
    return { moves, headline }
  })
  return Response.json(data)
}
