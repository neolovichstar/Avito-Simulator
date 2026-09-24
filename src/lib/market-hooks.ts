// Рыночные хуки, общие для ботов и игрока:
// 1) каждая цена попадает в историю (PricePoint) для спарклайна на карточке;
// 2) новое объявление проверяется против сохранённых поисков пользователей.
import { db } from '@/lib/db'
import { notifyUser } from '@/lib/deals'
import { CATEGORY_LABEL } from '@/lib/catalog-types'

export async function recordPricePoint(itemKey: string, price: number): Promise<void> {
  if (!itemKey || price <= 0) return
  try {
    await db.pricePoint.create({ data: { itemKey, price } })
  } catch {
    // история цен не критична
  }
}

export async function notifySavedSearches(listing: {
  sellerId: string
  title: string
  category: string
  price: number
  createdAt: Date
}): Promise<void> {
  try {
    const searches = await db.savedSearch.findMany({
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    if (!searches.length) return
    const title = listing.title.toLowerCase()
    const notified = new Set<string>()
    for (const s of searches) {
      if (s.userId === listing.sellerId) continue
      if (notified.has(s.userId)) continue
      // поиск должен существовать до объявления (не уведомляем задним числом)
      if (s.createdAt.getTime() > listing.createdAt.getTime() - 5_000) continue
      const q = s.query.trim().toLowerCase()
      const catMatch = s.category ? s.category === listing.category : true
      const qMatch = !q || title.includes(q)
      if (!catMatch || !qMatch) continue
      notified.add(s.userId)
      const catName = CATEGORY_LABEL[listing.category] ?? listing.category
      const priceLabel = listing.price > 0 ? `${listing.price.toLocaleString('ru-RU')} ₽` : 'даром'
      await notifyUser(
        s.userId,
        'market',
        'Новый товар по вашему поиску',
        `«${listing.title}» за ${priceLabel} в категории «${catName}». Успейте посмотреть.`,
      )
    }
  } catch {
    // уведомления не критичны
  }
}

export async function onListingCreated(listing: {
  sellerId: string
  title: string
  itemKey: string
  category: string
  price: number
  city: string
  createdAt: Date
}): Promise<void> {
  await recordPricePoint(listing.itemKey, listing.price)
  await notifySavedSearches(listing)
}
