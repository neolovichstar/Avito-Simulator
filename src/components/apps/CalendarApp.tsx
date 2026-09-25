'use client'

// Календарь ОС: сетка месяца с Пн, события выбранного дня в localStorage
// ('avito_sim_events' → { 'YYYY-MM-DD': [строки] }), точки под днями с событиями.

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { sound } from '@/lib/sound'

const LS_KEY = 'avito_sim_events'

type EventsMap = Record<string, string[]>

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

  // Сетка: пустые ячейки до 1-го числа (неделя с Пн) + дни месяца
  const lead = (new Date(viewY, viewM, 1).getDay() + 6) % 7
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

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
        <h1 className="text-[17px] font-semibold">
          {monthTitle(viewY, viewM)} {viewY}
        </h1>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Предыдущий месяц"
            className="flex size-11 items-center justify-center rounded-full text-white/70 transition-transform active:scale-90"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Следующий месяц"
            className="flex size-11 items-center justify-center rounded-full text-white/70 transition-transform active:scale-90"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] px-3 pb-4">
        {/* Сетка месяца */}
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div key={w} className="flex h-8 items-center justify-center text-[11px] text-white/40">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`empty-${i}`} aria-hidden="true" />
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
                className="relative mx-auto flex size-11 items-center justify-center rounded-full transition-transform active:scale-90"
              >
                {isToday && <span className="absolute inset-0 rounded-full bg-emerald-500" aria-hidden="true" />}
                <span
                  className={
                    'relative z-10 flex size-11 items-center justify-center rounded-full text-[15px] tabular-nums ' +
                    (isToday
                      ? 'font-bold text-[#052E16]'
                      : isSelected
                        ? 'text-white ring-1 ring-emerald-400'
                        : 'text-white/80')
                  }
                >
                  {d}
                </span>
                {hasEvents && !isToday && (
                  <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-emerald-400" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>

        {/* События выбранного дня */}
        <div className="mt-4 px-2">
          <div className="text-[12px] capitalize text-white/60">{selLabel}</div>
          <div className="mt-2 flex flex-col gap-2">
            {dayEvents.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4 text-center text-[13px] text-white/40">
                Нет событий на этот день
              </div>
            ) : (
              dayEvents.map((ev, i) => (
                <div
                  key={`${ev}-${i}`}
                  className="flex items-center gap-2 rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words text-[14px]">{ev}</span>
                  <button
                    type="button"
                    onClick={() => removeEvent(i)}
                    aria-label="Удалить событие"
                    className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-white/40 transition-transform active:scale-90"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>

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
              className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-[15px] text-white outline-none placeholder:text-white/40 focus:border-emerald-500/50"
            />
            <button
              type="submit"
              aria-label="Добавить событие"
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#22C55E] text-[#052E16] transition-transform active:scale-[0.98]"
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
