// Реестр обоев для телефона и рабочего стола ПК.
// image: файл в /img/wall/ (или null для чистых CSS-градиентов).
// Обои применяются через CSS-классы wp-* (globals.css) — устойчиво при гидрации.

export interface WallpaperDef {
  id: string
  name: string
  image: string | null
  css: string // градиент-подложка (для превью-фона)
}

export const WALLPAPERS: WallpaperDef[] = [
  { id: 'wave', name: 'Волны', image: '/img/wall/wave.png', css: 'linear-gradient(180deg, #14102b, #090614)' },
  { id: 'peak', name: 'Вершина', image: '/img/wall/peak.png', css: 'linear-gradient(180deg, #2b1d4d 0%, #6d3a6e 55%, #c96f7c 100%)' },
  { id: 'city', name: 'Огни города', image: '/img/wall/city.png', css: 'linear-gradient(180deg, #101423 0%, #1c2237 60%, #3c2f45 100%)' },
  { id: 'marble', name: 'Мрамор', image: '/img/wall/marble.png', css: 'linear-gradient(160deg, #0d2b23 0%, #10332a 55%, #1c4a3c 100%)' },
  {
    id: 'aurora',
    name: 'Сияние',
    image: null,
    css:
      'radial-gradient(circle at 18% 10%, rgba(124,58,237,0.4), transparent 50%),' +
      'radial-gradient(circle at 85% 22%, rgba(37,99,235,0.35), transparent 48%),' +
      'radial-gradient(circle at 55% 92%, rgba(14,165,233,0.28), transparent 55%),' +
      'linear-gradient(180deg, #0b0b16 0%, #06060c 60%, #030307 100%)',
  },
  {
    id: 'ember',
    name: 'Закат',
    image: null,
    css:
      'radial-gradient(circle at 78% 12%, rgba(251,146,60,0.4), transparent 52%),' +
      'radial-gradient(circle at 12% 82%, rgba(190,18,60,0.35), transparent 55%),' +
      'linear-gradient(180deg, #1c0f18 0%, #2b1220 55%, #0d0509 100%)',
  },
]

export function wallpaperById(id: string): WallpaperDef {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]
}

// CSS-класс обоев (wp-* определён в globals.css)
export function wallpaperClass(id: string): string {
  return `wp-${wallpaperById(id).id}`
}

// Инлайн-стиль для превью-миниатюр (не для фонов страниц)
export function wallpaperPreviewStyle(id: string): React.CSSProperties {
  const w = wallpaperById(id)
  return w.image
    ? { backgroundImage: `url(${w.image}), ${w.css}`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundImage: w.css }
}
