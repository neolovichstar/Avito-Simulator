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
  {
    id: 'resale',
    name: 'Resale',
    image: null,
    css:
      'radial-gradient(circle at 22% 12%, rgba(34,197,94,0.38), transparent 52%),' +
      'radial-gradient(circle at 82% 88%, rgba(16,185,129,0.25), transparent 50%),' +
      'linear-gradient(180deg, #07130d 0%, #050d09 55%, #030705 100%)',
  },
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
  // Android 16-подобные системные градиенты (тёмные, expressive, без холодных оттенков)
  {
    id: 'moss',
    name: 'Мох',
    image: null,
    css:
      'radial-gradient(circle at 24% 12%, rgba(74,222,128,0.30), transparent 52%),' +
      'radial-gradient(circle at 80% 88%, rgba(6,78,59,0.60), transparent 56%),' +
      'radial-gradient(circle at 62% 40%, rgba(16,185,129,0.14), transparent 46%),' +
      'linear-gradient(175deg, #0c2318 0%, #081710 55%, #040a07 100%)',
  },
  {
    id: 'graphite',
    name: 'Графит',
    image: null,
    css:
      'radial-gradient(circle at 78% 10%, rgba(214,163,82,0.20), transparent 50%),' +
      'radial-gradient(circle at 14% 90%, rgba(168,162,158,0.16), transparent 52%),' +
      'linear-gradient(178deg, #201e1b 0%, #141210 55%, #0a0908 100%)',
  },
  // ── Премиум-фотообои (2026-09, срезаны из листов) ──
  { id: 'terrazzo', name: 'Терраццо', image: '/img/wall/terrazzo.webp', css: 'linear-gradient(180deg, #1a1b1e 0%, #0c0d10 100%)' },
  { id: 'fabric', name: 'Ткань', image: '/img/wall/fabric.webp', css: 'linear-gradient(170deg, #161a20 0%, #0a0c10 100%)' },
  { id: 'depth', name: 'Глубина', image: '/img/wall/depth.webp', css: 'linear-gradient(180deg, #101216 0%, #0b0a09 100%)' },
  { id: 'onyx', name: 'Оникс', image: '/img/wall/marble-dark.webp', css: 'linear-gradient(160deg, #191714 0%, #2b241b 100%)' },
  { id: 'paper', name: 'Бумага', image: '/img/wall/paper.webp', css: 'linear-gradient(180deg, #efe9e2 0%, #d9c8b4 100%)' },
  { id: 'emerald', name: 'Изумруд', image: '/img/wall/emerald.webp', css: 'linear-gradient(180deg, #06231a 0%, #0b3d2c 100%)' },
  { id: 'metropolis', name: 'Мегаполис', image: '/img/wall/metropolis.webp', css: 'linear-gradient(180deg, #0a0e14 0%, #1a2230 100%)' },
  { id: 'gold', name: 'Золото', image: '/img/wall/gold.webp', css: 'linear-gradient(180deg, #0d0a07 0%, #2a1f12 100%)' },
  { id: 'jade', name: 'Нефрит', image: '/img/wall/jade.webp', css: 'linear-gradient(180deg, #0f241f 0%, #123028 100%)' },
  { id: 'leather', name: 'Кожа', image: '/img/wall/leather.webp', css: 'linear-gradient(170deg, #17110d 0%, #241a12 100%)' },
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
