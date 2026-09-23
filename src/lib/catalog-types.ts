// Типы каталога товаров. Данные — в catalog-data.ts (генерируется отдельно)

export type CategoryKey =
  | 'phones' | 'laptops' | 'electronics' | 'clothes' | 'sneakers'
  | 'furniture' | 'appliances' | 'hobby' | 'sport' | 'music'
  | 'auto' | 'kids' | 'books'

export interface CategoryInfo {
  key: CategoryKey
  label: string
  image: string
}

export interface CatalogItem {
  key: string
  title: string
  category: CategoryKey
  basePrice: number // средняя рыночная цена для состояния good, в рублях
  jitter: number // разброс цены 0..0.5
  desc: string[] // шаблоны описаний
  weight?: number // частота появления на рынке (по умолчанию 1)
}

export const CATEGORIES: CategoryInfo[] = [
  { key: 'phones', label: 'Телефоны', image: '/img/cat-phones.jpg' },
  { key: 'laptops', label: 'Ноутбуки', image: '/img/cat-laptops.jpg' },
  { key: 'electronics', label: 'Электроника', image: '/img/cat-electronics.jpg' },
  { key: 'clothes', label: 'Одежда', image: '/img/cat-clothes.jpg' },
  { key: 'sneakers', label: 'Кроссовки', image: '/img/cat-sneakers.jpg' },
  { key: 'furniture', label: 'Мебель', image: '/img/cat-furniture.jpg' },
  { key: 'appliances', label: 'Бытовая техника', image: '/img/cat-appliances.jpg' },
  { key: 'hobby', label: 'Хобби и отдых', image: '/img/cat-hobby.jpg' },
  { key: 'sport', label: 'Спорт', image: '/img/cat-sport.jpg' },
  { key: 'music', label: 'Музыка', image: '/img/cat-music.jpg' },
  { key: 'auto', label: 'Авто и мото', image: '/img/cat-auto.jpg' },
  { key: 'kids', label: 'Детское', image: '/img/cat-kids.jpg' },
  { key: 'books', label: 'Книги', image: '/img/cat-books.jpg' },
]

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
)
export const CATEGORY_IMAGE: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.image]),
)

export const CONDITIONS = ['new', 'excellent', 'good', 'used', 'parts'] as const
export type ConditionKey = (typeof CONDITIONS)[number]

export const CONDITION_LABEL: Record<string, string> = {
  new: 'Новое',
  excellent: 'Отличное',
  good: 'Хорошее',
  used: 'Б/у',
  parts: 'На запчасти',
}

export const CONDITION_MULT: Record<string, number> = {
  new: 1.18,
  excellent: 1.0,
  good: 0.82,
  used: 0.6,
  parts: 0.28,
}
