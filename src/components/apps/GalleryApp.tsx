'use client'

// Галерея ОС: сетка 3×N из реальных файлов проекта (public/img/p — товары,
// public/img/wall — обои) и полноэкранный просмотр с перелистыванием.

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { sound } from '@/lib/sound'

const FILES = [
  // телефоны и техника
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
  // одежда и кроссовки
  '/img/p/levis-501.jpg',
  '/img/p/zara-hoodie.jpg',
  '/img/p/nike-af1.jpg',
  '/img/p/adidas-samba.jpg',
  '/img/p/nb-574.jpg',
  // дом и техника
  '/img/p/dyson-v8.jpg',
  '/img/p/robot-xiaomi.jpg',
  '/img/p/delonghi-kofemashina.jpg',
  '/img/p/billy.jpg',
  '/img/p/eames-kreslo.jpg',
  // хобби
  '/img/p/fender-strat-mex.jpg',
  // погода
  '/img/weather/sun.webp',
  '/img/weather/clouds.webp',
  '/img/weather/fog.webp',
  '/img/weather/rain.webp',
  '/img/weather/snow.webp',
  '/img/weather/storm.webp',
  '/img/weather/night.webp',
  '/img/weather/rainbow.webp',
  // портреты (детерминированные аватары жителей)
  ...Array.from({ length: 40 }, (_, i) => `/img/avatars/a${String(i + 1).padStart(2, '0')}.webp`),
  // обои
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

const PHOTOS = FILES.map((src) => ({ src, name: prettify(src) }))

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
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <h1 className="text-[17px] font-semibold">Галерея</h1>
        <span className="text-[13px] text-white/50">{PHOTOS.length} фото</span>
      </header>

      <div className="grid flex-1 grid-cols-3 gap-0.5 overflow-y-auto [scrollbar-width:thin]">
        {PHOTOS.map((p, i) => (
          <button
            key={p.src}
            type="button"
            onClick={() => {
              sound.tap()
              setOpen(i)
            }}
            aria-label={`Открыть фото: ${p.name}`}
            className="aspect-square overflow-hidden bg-white/[0.04] transition-opacity active:opacity-70"
          >
            <img src={p.src} alt={p.name} loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>

      {/* Полноэкранный просмотр */}
      {open !== null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label={`Фото: ${PHOTOS[open]!.name}`}>
          <button
            type="button"
            onClick={() => {
              sound.tap()
              setOpen(null)
            }}
            aria-label="Закрыть просмотр"
            className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-transform active:scale-90"
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
              className="absolute left-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-transform active:scale-90"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
          )}
          {open < PHOTOS.length - 1 && (
            <button
              type="button"
              onClick={next}
              aria-label="Следующее фото"
              className="absolute right-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-transform active:scale-90"
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </button>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 bg-gradient-to-t from-black/85 to-transparent pb-5 pt-10">
            <span className="max-w-[80%] truncate text-[12px] text-white/60">{PHOTOS[open]!.name}</span>
            <span className="text-[11px] tabular-nums text-white/40">
              {open + 1} / {PHOTOS.length}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
