'use client'

// Погода ОС: полностью офлайн — детерминированный псевдорандом (mulberry32
// от хэша строки «город+дата») вместо сети. Одинаковый город и день всегда
// дают одинаковую погоду.

import { useMemo, useState } from 'react'
import {
  Cloud,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Gauge,
  Moon,
  Rainbow,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react'
import { sound } from '@/lib/sound'

const CITIES = [
  { name: 'Москва', base: 4 },
  { name: 'Санкт-Петербург', base: 3 },
  { name: 'Сочи', base: 13 },
  { name: 'Казань', base: 2 },
]

const BASE_CONDITIONS = ['Солнечно', 'Облачно', 'Пасмурно', 'Дождь', 'Снег', 'Гроза'] as const
// «После дождя» — редкий бонусный исход (≈3%), идёт отдельным взвешенным пулом
const CONDITIONS = [...BASE_CONDITIONS, 'После дождя'] as const
type Condition = (typeof CONDITIONS)[number]

// Фото-иллюстрации для карточки «Сейчас» (нарезаны из листа, 512px)
const COND_IMG: Record<Condition, string> = {
  'Солнечно': '/img/weather/sun.webp',
  'Облачно': '/img/weather/clouds.webp',
  'Пасмурно': '/img/weather/fog.webp',
  'Дождь': '/img/weather/rain.webp',
  'Снег': '/img/weather/snow.webp',
  'Гроза': '/img/weather/storm.webp',
  'После дождя': '/img/weather/rainbow.webp',
}
const NIGHT_IMG = '/img/weather/night.webp'

// Ночные часы для посуточной кривой (луна в почасовой ленте, звёздное небо в hero)
function isNightHour(h: number): boolean {
  return h >= 22 || h < 5
}

// Ночью «Солнечно» читается как «Ясно», а ясное/облачное небо показываем звёздным
function condLabel(cond: Condition, night: boolean): string {
  return night && cond === 'Солнечно' ? 'Ясно' : cond
}
function condImg(cond: Condition, night: boolean): string {
  if (night && (cond === 'Солнечно' || cond === 'Облачно')) return NIGHT_IMG
  return COND_IMG[cond]
}

interface DayWeather {
  cond: Condition
  temp: number
  tMin: number
  tMax: number
  wind: number
  hum: number
  press: number
  feels: number
}

interface HourWeather {
  hour: number
  cond: Condition
  temp: number
}

// Хэш строки (FNV-1a, 32 бита)
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Детерминированный ГПСЧ mulberry32
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pickCond(r: number): Condition {
  if (r < 0.03) return 'После дождя'
  const pool = BASE_CONDITIONS as readonly string[]
  const idx = Math.floor(((r - 0.03) / 0.97) * pool.length)
  return (pool[idx] as Condition) ?? 'Облачно'
}

function buildWeather(cityName: string, base: number, date: Date): DayWeather {
  const rnd = mulberry32(hashStr(cityName + '|' + dayKey(date)))
  const cond = pickCond(rnd())
  let temp = Math.round(base + rnd() * 7 - 2)
  if (cond === 'Снег' && temp > -1) temp = -1 - Math.round(rnd() * 5)
  if (cond === 'Дождь' && temp > 26) temp = 24
  if (cond === 'Гроза' && temp > 32) temp = 27
  if (cond === 'После дождя' && temp > 28) temp = 22
  if (cond === 'После дождя' && temp < 2) temp = 4
  const wind = Math.round((0.5 + rnd() * 8) * 10) / 10
  const hum = Math.round(45 + rnd() * 45)
  const press = Math.round(738 + rnd() * 24)
  const feels = temp - Math.round(rnd() * 2) - (wind > 5 ? 1 : 0)
  const tMax = temp + 1 + Math.round(rnd() * 3)
  const tMin = temp - 2 - Math.round(rnd() * 4)
  return { cond, temp, tMin, tMax, wind, hum, press, feels }
}

function buildHours(cityName: string, day: DayWeather, date: Date): HourWeather[] {
  const rnd = mulberry32(hashStr(cityName + '|' + dayKey(date) + '|h'))
  const out: HourWeather[] = []
  for (let h = 0; h < 24; h++) {
    // кривая суток: холоднее к 3 ночи, теплее к 15 дня
    const amp = -3 * Math.cos(((h - 3) / 24) * Math.PI * 2)
    const cond = rnd() < 0.6 ? day.cond : pickCond(rnd())
    out.push({ hour: h, cond, temp: Math.round(day.temp + amp) })
  }
  return out
}

function CondIcon({ cond, night, className }: { cond: Condition; night?: boolean; className: string }) {
  if (night && cond === 'Солнечно') return <Moon className={className + ' text-slate-200'} aria-hidden="true" />
  if (night && cond === 'Облачно') return <CloudMoon className={className + ' text-slate-200'} aria-hidden="true" />
  if (cond === 'Солнечно') return <Sun className={className + ' text-amber-300'} aria-hidden="true" />
  if (cond === 'Облачно') return <CloudSun className={className + ' text-amber-300'} aria-hidden="true" />
  if (cond === 'Пасмурно') return <Cloud className={className + ' text-white/80'} aria-hidden="true" />
  if (cond === 'Дождь') return <CloudRain className={className + ' text-white/80'} aria-hidden="true" />
  if (cond === 'Гроза') return <CloudLightning className={className + ' text-amber-200'} aria-hidden="true" />
  if (cond === 'После дождя') return <Rainbow className={className + ' text-emerald-300'} aria-hidden="true" />
  return <CloudSnow className={className + ' text-white/80'} aria-hidden="true" />
}

function fmtDeg(n: number): string {
  return (n > 0 ? '+' : '') + Math.round(n) + '°'
}

export default function WeatherApp() {
  const [cityIdx, setCityIdx] = useState(0)
  const city = CITIES[cityIdx] ?? CITIES[0]!
  const today = useMemo(() => new Date(), [])

  const model = useMemo(() => {
    const now = buildWeather(city.name, city.base, today)
    const hours = buildHours(city.name, now, today)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
      return { date: d, w: buildWeather(city.name, city.base, d) }
    })
    return { now, hours, days }
  }, [city, today])

  const nowHour = today.getHours()
  const nightNow = isNightHour(nowHour)

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#07130D,#050D09)] text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 px-5">
        <h1 className="text-[17px] font-semibold">Погода</h1>
      </header>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] px-4 pb-6">
        {/* Города */}
        <div className="flex flex-wrap gap-2">
          {CITIES.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onClick={() => {
                sound.tap()
                setCityIdx(i)
              }}
              aria-label={`Погода в городе ${c.name}`}
              aria-pressed={i === cityIdx}
              className={
                'h-9 rounded-full px-4 text-[13px] transition-transform active:scale-95 ' +
                (i === cityIdx ? 'bg-emerald-500 font-semibold text-[#052E16]' : 'bg-white/[0.06] text-white/70')
              }
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Сейчас */}
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-5">
          <div className="min-w-0">
            <div className="text-[12px] text-white/40">{city.name}</div>
            <div className="mt-1 text-[56px] font-light leading-none tabular-nums">{fmtDeg(model.now.temp)}</div>
            <div className="mt-2 text-[14px] text-white/70">{condLabel(model.now.cond, nightNow)}</div>
          </div>
          <img
            src={condImg(model.now.cond, nightNow)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="h-24 w-24 shrink-0 rounded-2xl object-cover ring-1 ring-white/10"
          />
        </div>

        {/* По часам */}
        <div className="mt-3 rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
          <div className="text-[12px] text-white/60">По часам</div>
          <div className="mt-3 flex gap-4 overflow-x-auto [scrollbar-width:thin]">
            {model.hours.map((h) => (
              <div
                key={h.hour}
                className={
                  'flex min-w-10 flex-col items-center gap-1.5 ' +
                  (h.hour === nowHour ? 'text-emerald-400' : h.hour < nowHour ? 'text-white/40' : '')
                }
              >
                <span className="text-[11px] tabular-nums">{String(h.hour).padStart(2, '0')}</span>
                <CondIcon cond={h.cond} night={isNightHour(h.hour)} className="size-4" />
                <span className="text-[11px] tabular-nums">{fmtDeg(h.temp)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* На 7 дней */}
        <div className="mt-3 rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
          <div className="text-[12px] text-white/60">На 7 дней</div>
          <div className="mt-1">
            {model.days.map(({ date, w }, i) => (
              <div
                key={dayKey(date)}
                className="flex items-center justify-between border-b border-white/5 py-2.5 last:border-0"
              >
                <span className={'text-[14px] ' + (i === 0 ? 'font-medium text-white' : 'text-white/70')}>
                  {i === 0 ? 'Сегодня' : date.toLocaleDateString('ru-RU', { weekday: 'short' })}
                </span>
                <CondIcon cond={w.cond} className="size-5" />
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-[13px] text-white/40">{fmtDeg(w.tMin)}</span>
                  <span className="text-[13px] font-medium">{fmtDeg(w.tMax)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Детали */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
            <div className="flex items-center gap-2 text-[12px] text-white/50">
              <Wind className="size-4" aria-hidden="true" /> Ветер
            </div>
            <div className="mt-2 text-[18px] font-semibold tabular-nums">{model.now.wind.toFixed(1)} м/с</div>
          </div>
          <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
            <div className="flex items-center gap-2 text-[12px] text-white/50">
              <Droplets className="size-4" aria-hidden="true" /> Влажность
            </div>
            <div className="mt-2 text-[18px] font-semibold tabular-nums">{model.now.hum}%</div>
          </div>
          <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
            <div className="flex items-center gap-2 text-[12px] text-white/50">
              <Gauge className="size-4" aria-hidden="true" /> Давление
            </div>
            <div className="mt-2 text-[18px] font-semibold tabular-nums">{model.now.press} мм рт.</div>
          </div>
          <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
            <div className="flex items-center gap-2 text-[12px] text-white/50">
              <Thermometer className="size-4" aria-hidden="true" /> Ощущается
            </div>
            <div className="mt-2 text-[18px] font-semibold tabular-nums">{fmtDeg(model.now.feels)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
