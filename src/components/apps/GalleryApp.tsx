'use client'

// Галерея ОС (Google Photos × M3 Expressive): сетка 3×N из реальных файлов
// проекта (public/img/p — товары, public/img/wall — обои, погода, портреты),
// секции с заголовками и полноэкранный просмотр с перелистыванием.

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { sound } from '@/lib/sound'

// Фото сгруппированы по секциям (как альбомы в Photos); файлы проекта:
// public/img/p — товары, public/img/wall — обои, погода и портреты жителей
const RAW_SECTIONS: { label: string; files: string[] }[] = [
  {
    label: 'Техника',
    files: [
      '/img/p/iphone-12.jpg',
      '/img/p/galaxy-s22.jpg',
      '/img/p/iphone-xr.jpg',
      '/img/p/macbook-air-2020.jpg',
      '/img/p/thinkpad-t480.jpg',
      '/img/p/asus-tuf-f15.jpg',
      '/img/p/airpods-pro-2.jpg',
      '/img/p/sony-wh-1000xm4.jpg',
      '/img/p/apple-watch-7.jpg',
      '/img/p/tv-samsung-43.jpg',
      '/img/p/dualshock-4.jpg',
      '/img/p/nintendo-switch.jpg',
      '/img/p/xbox-series-s.jpg',
    ],
  },
  {
    label: 'Одежда',
    files: [
      '/img/p/levis-501.jpg',
      '/img/p/zara-hoodie.jpg',
      '/img/p/nike-af1.jpg',
      '/img/p/adidas-samba.jpg',
      '/img/p/nb-574.jpg',
    ],
  },
  {
    label: 'Дом и хобби',
    files: [
      '/img/p/dyson-v8.jpg',
      '/img/p/robot-xiaomi.jpg',
      '/img/p/delonghi-kofemashina.jpg',
      '/img/p/billy.jpg',
      '/img/p/eames-kreslo.jpg',
      '/img/p/fender-strat-mex.jpg',
    ],
  },
  {
    label: 'Погода',
    files: [
      '/img/weather/sun.webp',
      '/img/weather/clouds.webp',
      '/img/weather/fog.webp',
      '/img/weather/rain.webp',
      '/img/weather/snow.webp',
      '/img/weather/storm.webp',
      '/img/weather/night.webp',
      '/img/weather/rainbow.webp',
    ],
  },
  {
    label: 'Портреты',
    files: Array.from({ length: 40 }, (_, i) => `/img/avatars/a${String(i + 1).padStart(2, '0')}.webp`),
  },
  {
    label: 'Обои',
    files: [
      '/img/wall/wave.png',
      '/img/wall/peak.png',
      '/img/wall/city.png',
      '/img/wall/marble.png',
      '/img/wall/terrazzo.webp',
      '/img/wall/fabric.webp',
      '/img/wall/depth.webp',
      '/img/wall/marble-dark.webp',
      '/img/wall/paper.webp',
      '/img/wall/emerald.webp',
      '/img/wall/metropolis.webp',
      '/img/wall/gold.webp',
      '/img/wall/jade.webp',
      '/img/wall/leather.webp',
    ],
  },
]

// Красивые имена для служебных папок (товары/обои названы транслитом, погода и
// портреты — на русском)
const NAMES: Record<string, string> = {
  sun: 'Солнце',
  clouds: 'Облака',
  fog: 'Туман',
  rain: 'Дождь',
  snow: 'Снег',
  storm: 'Гроза',
  night: 'Ночь',
  rainbow: 'Радуга',
}

function prettify(src: string): string {
  const file = src.split('/').pop() ?? src
  const base = file.replace(/\.[a-z0-9]+$/i, '')
  if (NAMES[base]) return NAMES[base]!
  const m = /^a(\d{2})$/.exec(base)
  if (m) return `Портрет ${Number(m[1])}`
  const words = base.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Плоский порядок PHOTOS сохранён прежним — индексы просмотрщика не изменились
const PHOTOS: { src: string; name: string }[] = []
const SECTIONS = RAW_SECTIONS.map((s) => ({
  label: s.label,
  items: s.files.map((src) => {
    const idx = PHOTOS.length
    const name = prettify(src)
    PHOTOS.push({ src, name })
    return { idx, name }
  }),
}))

export default function GalleryApp() {
  const [open, setOpen] = useState<number | null>(null)

  const prev = () => {
    if (open === null || open <= 0) return
    sound.tap()
    setOpen(open - 1)
  }

  const next = () => {
    if (open === null || open >= PHOTOS.length - 1) return
    sound.tap()
    setOpen(open + 1)
  }

  return (
    <div className="flex h-full flex-col bg-[#050D09] text-white">
      <header className="flex shrink-0 items-end justify-between px-5 pb-3 pt-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Галерея</h1>
        <span className="pb-1 text-[12px] tabular-nums text-white/45">{PHOTOS.length} фото</span>
      </header>

      <div className="flex-1 overflow-y-auto pb-2 [scrollbar-width:thin]">
        {SECTIONS.map((section) => (
          <section key={section.label}>
            <h2 className="px-4 pb-2 pt-4 text-[12px] font-semibold text-white/70">{section.label}</h2>
            <div className="grid grid-cols-3 gap-[2px] px-[2px]">
              {section.items.map((item) => (
                <button
                  key={PHOTOS[item.idx]!.src}
                  type="button"
                  onClick={() => {
                    sound.tap()
                    setOpen(item.idx)
                  }}
                  aria-label={`Открыть фото: ${item.name}`}
                  className="aspect-square overflow-hidden rounded-[6px] bg-white/[0.04] transition-opacity active:opacity-70"
                >
                  <img
                    src={PHOTOS[item.idx]!.src}
                    alt={item.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Полноэкранный просмотр */}
      {open !== null && (
        <div className="m3-rise fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label={`Фото: ${PHOTOS[open]!.name}`}>
          <button
            type="button"
            onClick={() => {
              sound.tap()
              setOpen(null)
            }}
            aria-label="Закрыть просмотр"
            className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90"
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
            <img loading="lazy" decoding="async" src={PHOTOS[open]!.src}
              alt={PHOTOS[open]!.name}
              className="max-h-full max-w-full object-contain"/>
          </div>

          {open > 0 && (
            <button
              type="button"
              onClick={prev}
              aria-label="Предыдущее фото"
              className="absolute left-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
          )}
          {open < PHOTOS.length - 1 && (
            <button
              type="button"
              onClick={next}
              aria-label="Следующее фото"
              className="absolute right-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90"
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </button>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 bg-gradient-to-t from-black/85 to-transparent pb-5 pt-10">
            <span className="max-w-[80%] truncate text-[12px] text-white/70">{PHOTOS[open]!.name}</span>
            <span className="text-[11px] tabular-nums text-white/50">
              {open + 1} / {PHOTOS.length}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
