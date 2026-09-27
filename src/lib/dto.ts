// Серверные мапперы Prisma -> DTO
import type { Listing, User } from '@prisma/client'
import type { FeedListing } from '@/lib/types'
import { itemImage } from '@/lib/item-images'
import { negotiableFor } from '@/lib/negotiable'

export function isOnline(user: Pick<User, 'isBot' | 'lastSeenAt'>): boolean {
  if (user.isBot) return Date.now() - user.lastSeenAt.getTime() < 15 * 60_000
  return Date.now() - user.lastSeenAt.getTime() < 3 * 60_000
}

export function ratingOf(u: Pick<User, 'ratingSum' | 'ratingCount'>): number {
  if (!u.ratingCount) return 0
  // защита от кривых данных: рейтинг не может быть выше 5
  const raw = u.ratingSum / u.ratingCount
  return Math.round(Math.min(5, Math.max(0, raw)) * 10) / 10
}

export function listingDTO(l: Listing & { seller: User }, viewerId: string | null): FeedListing {
  return {
    id: l.id,
    title: l.title,
    price: l.price,
    baseValue: l.baseValue,
    category: l.category,
    condition: l.condition,
    image: itemImage(l.itemKey, l.category),
    status: l.status,
    city: l.city,
    createdAt: l.createdAt.toISOString(),
    views: l.views,
    boosted: !!(l.boostedUntil && l.boostedUntil.getTime() > Date.now()),
    seller: {
      id: l.seller.id,
      displayName: l.seller.displayName,
      rating: ratingOf(l.seller),
      ratingCount: l.seller.ratingCount,
      isBot: l.seller.isBot,
      online: isOnline(l.seller),
    },
    mine: viewerId === l.sellerId,
    negotiable: l.seller.isBot && l.price > 0 && negotiableFor(l.id, l.sellerId),
  }
}
