'use client'

// Календарь ОС (M3 Expressive): сетка месяца с Пн, события выбранного дня в
// localStorage ('avito_sim_events' → { 'YYYY-MM-DD': [строки] }), точки под
// днями с событиями, чипы событий с тональными фонами (emerald/amber/rose).

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { sound } from '@/lib/sound'

const LS_KEY = 'avito_sim_events'

type EventsMap = Record<string, string[]>

// Тональные фоны чипов событий (M3 containers), цикл emerald → amber → rose
const CHIP_TONES = [
  'bg-emerald-500/15 text-emerald-300',
  'bg-amber-500/15 text-amber-300',
  'bg-rose-500/15 text-rose-300',
] as const

function loadEvents(): EventsMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as EventsMap
  } catch {
    /* повреждённые данные — начинаем с пустого календаря */
  }
  return {}
}

function isoKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function monthTitle(y: number, m: number): string {
  const name = new Date(y, m, 1).toLocaleDateString('ru-RU', { month: 'long' })
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export default function CalendarApp() {
  const now = new Date()
  const [viewY, setViewY] = useState(now.getFullYear())
  const [viewM, setViewM] = useState(now.getMonth())
  const [sel, setSel] = useState(() => isoKey(now.getFullYear(), now.getMonth(), now.getDate()))
  const [events, setEvents] = useState<EventsMap>(loadEvents)
  const [text, setText] = useState('')

  const persist = (next: EventsMap) => {
    setEvents(next)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      /* приватный режим — события живут до перезагрузки */
    }
  }

  const prevMonth = () => {
    sound.tap()
    setViewY((y) => (viewM === 0 ? y - 1 : y))
    setViewM((m) => (m === 0 ? 11 : m - 1))
  }

  const nextMonth = () => {
    sound.tap()
    setViewY((y) => (viewM === 11 ? y + 1 : y))
    setViewM((m) => (m === 11 ? 0 : m + 1))
  }

  const todayKey = isoKey(now.getFullYear(), now.getMonth(), now.getDate())

  // Сетка: хвост предыдущего месяца + дни текущего + голова следующего (Пн-старт)
  const lead = (new Date(viewY, viewM, 1).getDay() + 6) % 7
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const daysInPrev = new Date(viewY, viewM, 0).getDate()
  const cells: { d: number; adj: boolean }[] = []
  for (let i = lead; i > 0; i--) cells.push({ d: daysInPrev - i + 1, adj: true })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, adj: false })
  let trail = 1
  while (cells.length % 7 !== 0) cells.push({ d: trail++, adj: true })

  const [selY, selM, selD] = sel.split('-').map(Number)
  const selDate = new Date(selY, selM - 1, selD)
  const selLabel = selDate.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const dayEvents = events[sel] ?? []

  const addEvent = () => {
    const t = text.trim()
    if (!t) return
    sound.tap()
    persist({ ...events, [sel]: [...(events[sel] ?? []), t] })
    setText('')
  }

  const removeEvent = (idx: number) => {
    sound.tap()
    const arr = [...(events[sel] ?? [])]
    arr.splice(idx, 1)
    const next = { ...events }
    if (arr.length > 0) next[sel] = arr
    else delete next[sel]
    persist(next)
  }

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#07130D,#050D09)] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <h1 className="text-[22px] font-bold tracking-[-0.01em]">
          {monthTitle(viewY, viewM)} <span className="tabular-nums">{viewY}</span>
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Предыдущий месяц"
            className="flex size-10 items-center justify-center rounded-full bg-white/[0.08] text-white/80 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Следующий месяц"
            className="flex size-10 items-center justify-center rounded-full bg-white/[0.08] text-white/80 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] px-3 pb-4">
        {/* Сетка месяца */}
        <div className="m3-rise grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div key={w} className="flex h-9 items-center justify-center text-[11px] font-medium text-white/40">
              {w}
            </div>
          ))}
          {cells.map((c, i) => {
            if (c.adj) {
              return (
                <span
                  key={`adj-${i}`}
                  aria-hidden="true"
                  className="mx-auto flex size-11 items-center justify-center rounded-full text-[15px] tabular-nums text-white/25"
                >
                  {c.d}
                </span>
              )
            }
            const d = c.d
            const key = isoKey(viewY, viewM, d)
            const isToday = key === todayKey
            const isSelected = key === sel
            const hasEvents = (events[key]?.length ?? 0) > 0
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  sound.tap()
                  setSel(key)
                }}
                aria-label={`${d} ${monthTitle(viewY, viewM).toLowerCase()}${hasEvents ? ', есть события' : ''}`}
                aria-pressed={isSelected}
                className="relative mx-auto flex size-11 items-center justify-center rounded-full transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90"
              >
                {isToday && <span className="absolute inset-0 rounded-full bg-[#21A038]" aria-hidden="true" />}
                <span
                  className={
                    'relative z-10 flex size-11 items-center justify-center rounded-full text-[15px] tabular-nums ' +
                    (isToday
                      ? 'font-bold text-white'
                      : isSelected
                        ? 'text-emerald-300 ring-2 ring-[#21A038]'
                        : 'text-white/85')
                  }
                >
                  {d}
                </span>
                {hasEvents && !isToday && (
                  <span className="absolute bottom-0.5 left-1/2 z-10 size-1 -translate-x-1/2 rounded-full bg-emerald-400" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>

        {/* События выбранного дня */}
        <div className="m3-rise-stagger mt-5 px-2" style={{ animationDelay: '40ms' }}>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-white/50">{selLabel}</div>

          {dayEvents.length === 0 ? (
            <div className="mt-2.5 rounded-[20px] bg-white/[0.04] p-5 text-center text-[13px] text-white/45">
              Нет событий на этот день
            </div>
          ) : (
            <div className="mt-2.5 rounded-[20px] bg-white/[0.06] p-3 ring-1 ring-white/[0.06]">
              <div className="flex flex-wrap gap-2">
                {dayEvents.map((ev, i) => (
                  <div
                    key={`${ev}-${i}`}
                    className={
                      'flex max-w-full items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 ' +
                      CHIP_TONES[i % CHIP_TONES.length]
                    }
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                    <span className="min-w-0 truncate text-[13.5px] font-medium">{ev}</span>
                    <button
                      type="button"
                      onClick={() => removeEvent(i)}
                      aria-label="Удалить событие"
                      className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              addEvent()
            }}
            className="mt-3 flex gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Новое событие"
              aria-label="Новое событие"
              maxLength={120}
              className="h-12 min-w-0 flex-1 rounded-full bg-white/[0.08] px-5 text-[15px] text-white outline-none ring-[#21A038]/60 transition placeholder:text-white/40 focus:ring-2"
            />
            <button
              type="submit"
              aria-label="Добавить событие"
              className="flex size-12 shrink-0 items-center justify-center rounded-[18px] bg-[#21A038] text-white shadow-lg shadow-emerald-500/25 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95"
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
