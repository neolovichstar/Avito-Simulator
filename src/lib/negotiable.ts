// «Торг уместен» — детерминированный признак объявления бота.
// Стабилен от перезапусков (хеш id+seller), доля настраивается константой.
// У игрока торг всегда возможен через чат — флаг только для ботов.

export function negotiableFor(listingId: string, sellerId: string): boolean {
  if (!listingId || !sellerId) return false
  const s = listingId + ':' + sellerId
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % 100 < 60 // ~60% объявлений ботов открыты к торгу
}
