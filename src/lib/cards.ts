// Реестр фонов банковских карт «Resale OS».
// 30 файлов public/img/cards/card-{color}-{n}.png (291×145, ~2:1) — 6 цветов × 5 стилей.
// Фон карточки в Банке задаётся парой «цвет-номер» (например 'green-2');
// выбор оформления каждой карты игрока хранится в localStorage по ключу
// `${cardKey}_bg_v1`. Все обращения к localStorage — с try/catch (приватный режим).

export const CARD_COLORS = ['green', 'blue', 'violet', 'pink', 'orange', 'silver'] as const
export type CardColor = (typeof CARD_COLORS)[number]

export const CARD_COLOR_LABEL: Record<CardColor, string> = {
  green: 'Зелёный',
  blue: 'Океан',
  violet: 'Аметист',
  pink: 'Закат',
  orange: 'Апельсин',
  silver: 'Графит',
}

export const CARD_BG_TOTAL_STYLES = 5

/** Фон в формате `${color}-${n}`, например 'green-2'. */
export type CardBg = `${CardColor}-${number}`

/** Дефолтные оформления карт игрока: основная, кредитная, накопительный счёт. */
export const DEFAULT_CARD_BGS: Record<'debit' | 'credit' | 'savings', CardBg> = {
  debit: 'green-2',
  credit: 'silver-3',
  savings: 'pink-2',
}

/** Базовый ключ реестра фонов (глобальный; у каждой карты — свой `${cardKey}_bg_v1`). */
export const CARD_BG_STORAGE_KEY = 'resale_card_bg_v1'

/** Ключ localStorage для конкретной карты: 'debit' → 'debit_bg_v1'. */
export const cardBgStorageKey = (cardKey: string) => `${cardKey}_bg_v1`

export function isCardColor(value: string): value is CardColor {
  return (CARD_COLORS as readonly string[]).includes(value)
}

/** Путь к файлу фона: cardBg('green', 2) или cardBg('green-2') → /img/cards/card-green-2.png */
export function cardBg(bg: CardBg): string
export function cardBg(color: string, style: number): string
export function cardBg(colorOrBg: string, style?: number): string {
  const n = style != null ? `-${style}` : ''
  return `/img/cards/card-${colorOrBg}${n}.png`
}

/** Разбор строки 'green-2' → CardBg; null, если цвет/номер вне реестра. */
export function parseCardBg(value: string | null | undefined): CardBg | null {
  if (!value) return null
  const i = value.lastIndexOf('-')
  if (i < 1) return null
  const color = value.slice(0, i)
  const style = Number(value.slice(i + 1))
  if (!isCardColor(color) || !Number.isInteger(style) || style < 1 || style > CARD_BG_TOTAL_STYLES) {
    return null
  }
  return `${color}-${style}`
}

/** Все 30 фонов по порядку (6 цветов × 5 стилей) — для сетки пикера. */
export const ALL_CARD_BGS: { bg: CardBg; color: CardColor; style: number }[] = CARD_COLORS.flatMap(
  (color) =>
    Array.from({ length: CARD_BG_TOTAL_STYLES }, (_, i) => {
      const style = i + 1
      return { bg: `${color}-${style}` as CardBg, color, style }
    }),
)

/** Прочитать фон карты из localStorage с валидацией по реестру (SSR/приватный режим → fallback). */
export function getCardBg(cardKey: string, fallback: CardBg): CardBg {
  if (typeof window === 'undefined') return fallback
  try {
    return parseCardBg(localStorage.getItem(cardBgStorageKey(cardKey))) ?? fallback
  } catch {
    return fallback
  }
}

/** Сохранить фон карты (try/catch — приватный режим не должен ронять приложение). */
export function setCardBg(cardKey: string, bg: CardBg): void {
  try {
    localStorage.setItem(cardBgStorageKey(cardKey), bg)
  } catch {
    /* не сохранилось — выбор просто не переживёт перезагрузку */
  }
}
