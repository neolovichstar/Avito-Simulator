// Модель погоды Resale OS: полностью офлайн, детерминированный псевдорандом
// (mulberry32 от хэша «город+дата»). Одинаковый город и день всегда дают
// одинаковую погоду. Модель одна на всё: виджет на локскрине/доме и
// приложение «Погода» показывают одно и то же.

export const CONDITIONS = ['Солнечно', 'Облачно', 'Пасмурно', 'Дождь', 'Снег', 'Гроза', 'После дождя'] as const
export type Condition = (typeof CONDITIONS)[number]

export const CITIES = [
  { name: 'Москва', base: 4 },
  { name: 'Санкт-Петербург', base: 3 },
  { name: 'Сочи', base: 13 },
  { name: 'Казань', base: 2 },
]

export interface DayWeather {
  cond: Condition
  temp: number
  tMin: number
  tMax: number
  wind: number
  hum: number
  press: number
  feels: number
}

export interface HourWeather {
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
    t = Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export { dayKey }

function pickCond(r: number): Condition {
  if (r < 0.03) return 'После дождя'
  const pool = CONDITIONS.slice(0, 6)
  const idx = Math.floor(((r - 0.03) / 0.97) * pool.length)
  return pool[idx] ?? 'Облачно'
}

export function buildWeather(cityName: string, base: number, date: Date): DayWeather {
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

export function buildHours(cityName: string, day: DayWeather, date: Date): HourWeather[] {
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

/** Погода «сейчас» для города по индексу (дефолт Москва) — для виджетов ОС. */
export function weatherNow(cityIdx = 0, date = new Date()): DayWeather & { city: string } {
  const city = CITIES[Math.max(0, Math.min(CITIES.length - 1, cityIdx))] ?? CITIES[0]
  return { ...buildWeather(city.name, city.base, date), city: city.name }
}

export function fmtDeg(n: number): string {
  return (n > 0 ? '+' : '') + Math.round(n) + '°'
}
