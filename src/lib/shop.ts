// Магазин Telegram Stars: ТОЛЬКО косметика и «спасибо», никакого p2w.
// Ни один товар не влияет на баланс, выгоду или силу игрока.

export type ShopKind = 'wallpaper' | 'badge' | 'tip'

export interface ShopItem {
  sku: string
  kind: ShopKind
  title: string
  desc: string
  stars: number
  /** для kind=wallpaper — id обоев из lib/wallpapers.ts */
  wallpaperId?: string
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    sku: 'wall.gold',
    kind: 'wallpaper',
    wallpaperId: 'gold',
    title: 'Обои «Золото»',
    desc: 'Премиум-фотообои для рабочего стола',
    stars: 49,
  },
  {
    sku: 'wall.onyx',
    kind: 'wallpaper',
    wallpaperId: 'onyx',
    title: 'Обои «Оникс»',
    desc: 'Тёмные фотообои с медными прожилками',
    stars: 49,
  },
  {
    sku: 'wall.metropolis',
    kind: 'wallpaper',
    wallpaperId: 'metropolis',
    title: 'Обои «Мегаполис»',
    desc: 'Ночной город на весь экран',
    stars: 49,
  },
  {
    sku: 'wall.jade',
    kind: 'wallpaper',
    wallpaperId: 'jade',
    title: 'Обои «Нефрит»',
    desc: 'Глубокие зелёные тона для стола',
    stars: 49,
  },
  {
    sku: 'badge.pro',
    kind: 'badge',
    title: 'Бейдж Resale+',
    desc: 'Звезда ★ у имени в профиле и на форуме',
    stars: 99,
  },
  {
    sku: 'tip.developer',
    kind: 'tip',
    title: 'Поддержать проект',
    desc: 'Просто спасибо, ничего не даёт. Вы лучший',
    stars: 25,
  },
]

export function shopItemBySku(sku: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.sku === sku)
}

// ── Косметика игрока: JSON в User.cosmetics ─────────────────────────────────

export interface Cosmetics {
  wallpapers: string[]
  badge: boolean
  tips: number
}

export function parseCosmetics(raw: string | null | undefined): Cosmetics {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<Cosmetics>) : {}
    return {
      wallpapers: Array.isArray(p.wallpapers) ? p.wallpapers.filter((w): w is string => typeof w === 'string') : [],
      badge: p.badge === true,
      tips: Number.isFinite(p.tips) ? Number(p.tips) : 0,
    }
  } catch {
    return { wallpapers: [], badge: false, tips: 0 }
  }
}

/** Выдать покупку (мутирует копию cosmetics) и вернуть сериализованный JSON. */
export function grantCosmetics(raw: string | null | undefined, sku: string): string {
  const c = parseCosmetics(raw)
  const item = shopItemBySku(sku)
  if (item) {
    if (item.kind === 'wallpaper' && item.wallpaperId && !c.wallpapers.includes(item.wallpaperId)) {
      c.wallpapers.push(item.wallpaperId)
    }
    if (item.kind === 'badge') c.badge = true
    if (item.kind === 'tip') c.tips += 1
  }
  return JSON.stringify(c)
}

/** Разблокирована ли обоина (бесплатные всегда открыты). */
export function wallpaperUnlocked(cos: Cosmetics, wallpaperId: string, premium: boolean): boolean {
  return !premium || cos.wallpapers.includes(wallpaperId)
}
