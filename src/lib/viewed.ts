// История просмотров «Вы смотрели»: localStorage, максимум 20 позиций.
export interface ViewedItem {
  id: string
  title: string
  price: number
  image: string
  at: number
}

const KEY = 'avito_viewed_v1'
const MAX = 20

export function getViewed(): ViewedItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as ViewedItem[]
    return Array.isArray(arr) ? arr.filter((v) => v && v.id) : []
  } catch {
    return []
  }
}

export function addViewed(item: Omit<ViewedItem, 'at'>) {
  if (typeof window === 'undefined') return
  try {
    const rest = getViewed().filter((v) => v.id !== item.id)
    const next = [{ ...item, at: Date.now() }, ...rest].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}

export function clearViewed() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
