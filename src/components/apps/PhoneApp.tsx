'use client'

// Телефон ОС: клавиатура набора, экран вызова (Вызов… → таймер длительности),
// недавние (стартовые 4 фейковых + сделанные из приложения) и контакты
// с аватар-инициалами и sticky-разделителями по алфавиту.

import { useRef, useState, useSyncExternalStore } from 'react'
import {
  Clock,
  Delete,
  Grid3x3,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Users,
} from 'lucide-react'
import { sound } from '@/lib/sound'

// Тик раз в секунду — длительность активного вызова (useSyncExternalStore, без setState в эффектах)
function useTick(): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, 1000)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  )
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

interface Contact {
  name: string
  num: string
}

const CONTACTS: Contact[] = [
  { name: 'Анна Соколова', num: '+7 912 445-19-02' },
  { name: 'Борис Крылов', num: '+7 921 330-77-41' },
  { name: 'Валерия Морозова', num: '+7 903 218-56-14' },
  { name: 'Глеб Орлов', num: '+7 916 502-83-26' },
  { name: 'Дарья Кузнецова', num: '+7 926 174-90-58' },
  { name: 'Егор Лебедев', num: '+7 905 663-12-37' },
  { name: 'Жанна Ершова', num: '+7 962 809-45-73' },
  { name: 'Захар Панов', num: '+7 981 254-61-08' },
  { name: 'Игорь Самойлов', num: '+7 911 387-29-95' },
  { name: 'Марина Белова', num: '+7 917 521-94-60' },
]

// Группы по алфавиту считаются один раз на модуле
const CONTACT_GROUPS = (() => {
  const map = new Map<string, Contact[]>()
  const sorted = [...CONTACTS].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  for (const c of sorted) {
    const letter = c.name.charAt(0).toUpperCase()
    const arr = map.get(letter) ?? []
    arr.push(c)
    map.set(letter, arr)
  }
  return [...map.entries()].map(([letter, items]) => ({ letter, items }))
})()

function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}

interface CallRec {
  id: string
  name: string | null
  number: string
  kind: 'in' | 'out' | 'miss'
  ts: number
}

function seedRecents(): CallRec[] {
  const now = Date.now()
  return [
    { id: 'seed-1', name: 'Игорь Самойлов', number: '+7 911 387-29-95', kind: 'in', ts: now - 1000 * 60 * 24 },
    { id: 'seed-2', name: 'Дарья Кузнецова', number: '+7 926 174-90-58', kind: 'miss', ts: now - 1000 * 60 * 95 },
    { id: 'seed-3', name: null, number: '+7 800 555-35-35', kind: 'out', ts: now - 1000 * 60 * 60 * 5 },
    { id: 'seed-4', name: 'Артём (перекуп)', number: '+7 963 014-77-52', kind: 'in', ts: now - 1000 * 60 * 60 * 26 },
  ]
}

function fmtRecTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const KEYS: { d: string; sub?: string; label: string }[] = [
  { d: '1', label: 'Цифра 1' },
  { d: '2', sub: 'ABC', label: 'Цифра 2' },
  { d: '3', sub: 'DEF', label: 'Цифра 3' },
  { d: '4', sub: 'GHI', label: 'Цифра 4' },
  { d: '5', sub: 'JKL', label: 'Цифра 5' },
  { d: '6', sub: 'MNO', label: 'Цифра 6' },
  { d: '7', sub: 'PQRS', label: 'Цифра 7' },
  { d: '8', sub: 'TUV', label: 'Цифра 8' },
  { d: '9', sub: 'WXYZ', label: 'Цифра 9' },
  { d: '*', label: 'Звёздочка' },
  { d: '0', sub: '+', label: 'Цифра 0' },
  { d: '#', label: 'Решётка' },
]

/* -------------------------------- Экран вызова -------------------------------- */

function CallScreen({
  name,
  number,
  activeAt,
  onEnd,
}: {
  name: string | null
  number: string
  activeAt: number | null
  onEnd: () => void
}) {
  const tick = useTick()
  const secs = activeAt !== null ? Math.max(0, Math.floor((tick - activeAt) / 1000)) : 0

  return (
    <div className="flex h-full flex-col items-center bg-[linear-gradient(180deg,#07130D,#050D09)] text-white">
      <div className="flex flex-col items-center gap-2 pt-16">
        <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/20 text-[24px] font-semibold text-emerald-300">
          {name ? initials(name) : <Phone className="size-8" aria-hidden="true" />}
        </div>
        <div className="mt-2 text-[26px] font-semibold">{name ?? number}</div>
        {name && <div className="text-[14px] tabular-nums text-white/60">{number}</div>}
        <div className="mt-1 text-[13px] tabular-nums text-white/50" suppressHydrationWarning>
          {activeAt === null
            ? 'Вызов…'
            : `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`}
        </div>
      </div>
      <button
        type="button"
        onClick={onEnd}
        aria-label="Завершить вызов"
        className="mb-16 mt-auto flex size-16 items-center justify-center rounded-full bg-red-500 text-white transition-transform active:scale-95"
      >
        <PhoneOff className="size-7" aria-hidden="true" />
      </button>
    </div>
  )
}

/* ------------------------------------ Телефон --------------------------------- */

type Tab = 'keypad' | 'recents' | 'contacts'

const TABS: { key: Tab; label: string; icon: typeof Phone }[] = [
  { key: 'keypad', label: 'Клавиатура', icon: Grid3x3 },
  { key: 'recents', label: 'Недавние', icon: Clock },
  { key: 'contacts', label: 'Контакты', icon: Users },
]

export default function PhoneApp() {
  const [tab, setTab] = useState<Tab>('keypad')
  const [num, setNum] = useState('')
  const [recents, setRecents] = useState<CallRec[]>(seedRecents)
  const [call, setCall] = useState<{ name: string | null; number: string } | null>(null)
  const [activeAt, setActiveAt] = useState<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startCall = (name: string | null, number: string) => {
    sound.tap()
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setCall({ name, number })
    setActiveAt(null)
    // «Вызов…» 3 секунды, затем идёт таймер длительности
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      setActiveAt(Date.now())
    }, 3000)
  }

  const endCall = () => {
    sound.tap()
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (call) {
      setRecents((r) => [
        { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: call.name, number: call.number, kind: 'out', ts: Date.now() },
        ...r,
      ])
    }
    setCall(null)
    setActiveAt(null)
  }

  if (call) {
    return <CallScreen name={call.name} number={call.number} activeAt={activeAt} onEnd={endCall} />
  }

  const press = (d: string) => {
    sound.tap()
    setNum((cur) => (cur.length >= 16 ? cur : cur + d))
  }

  const backspace = () => {
    sound.tap()
    setNum((cur) => cur.slice(0, -1))
  }

  const callOut = () => {
    if (!num.trim()) return
    startCall(null, num)
  }

  return (
    <div className="flex h-full flex-col bg-[#050D09] text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 px-5">
        <h1 className="text-[17px] font-semibold">Телефон</h1>
      </header>

      {tab === 'keypad' && (
        <div className="flex flex-1 flex-col overflow-y-auto [scrollbar-width:thin] px-8 pb-3">
          <div className="relative flex min-h-16 items-center justify-center py-3">
            {num ? (
              <span className="max-w-[75%] truncate text-[24px] font-light tabular-nums tracking-wide">{num}</span>
            ) : (
              <span className="text-[17px] text-white/25">Введите номер</span>
            )}
            {num && (
              <button
                type="button"
                onClick={backspace}
                aria-label="Удалить цифру"
                className="absolute right-0 flex size-11 items-center justify-center rounded-full text-white/50 transition-transform active:scale-90"
              >
                <Delete className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <button
                key={k.d}
                type="button"
                onClick={() => press(k.d)}
                aria-label={k.label}
                className="flex h-16 flex-col items-center justify-center rounded-full bg-white/[0.06] transition-transform active:scale-95"
              >
                <span className="text-[22px] font-medium leading-none">{k.d}</span>
                {k.sub && <span className="mt-0.5 text-[10px] tracking-[0.25em] text-white/40">{k.sub}</span>}
              </button>
            ))}
          </div>

          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={callOut}
              disabled={!num.trim()}
              aria-label="Позвонить"
              className="flex size-16 items-center justify-center rounded-full bg-[#22C55E] text-[#052E16] transition-transform active:scale-95 disabled:opacity-40"
            >
              <Phone className="size-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {tab === 'recents' && (
        <div className="flex-1 overflow-y-auto [scrollbar-width:thin] px-4 pb-4">
          <div className="flex flex-col gap-1">
            {recents.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => startCall(r.name, r.number)}
                aria-label={`Позвонить: ${r.name ?? r.number}`}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:bg-white/[0.04]"
              >
                {r.kind === 'in' && <PhoneIncoming className="size-5 shrink-0 text-emerald-400" aria-hidden="true" />}
                {r.kind === 'out' && <PhoneOutgoing className="size-5 shrink-0 text-white/40" aria-hidden="true" />}
                {r.kind === 'miss' && <PhoneMissed className="size-5 shrink-0 text-red-400" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span
                    className={
                      'block truncate text-[15px] ' +
                      (r.kind === 'miss' ? 'text-red-400' : 'text-white')
                    }
                  >
                    {r.name ?? 'Неизвестный'}
                  </span>
                  <span className="block truncate text-[11px] tabular-nums text-white/40">{r.number}</span>
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-white/40">{fmtRecTime(r.ts)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="flex-1 overflow-y-auto [scrollbar-width:thin] px-4 pb-4">
          {CONTACT_GROUPS.map((g) => (
            <div key={g.letter}>
              <div className="sticky top-0 z-10 bg-[#050D09] px-1 py-1.5 text-[11px] font-medium text-white/40">
                {g.letter}
              </div>
              {g.items.map((c) => (
                <button
                  key={c.num}
                  type="button"
                  onClick={() => startCall(c.name, c.num)}
                  aria-label={`Позвонить: ${c.name}`}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-1 py-2 text-left transition-colors active:bg-white/[0.04]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[13px] font-semibold text-emerald-300">
                    {initials(c.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] text-white">{c.name}</span>
                    <span className="block truncate text-[11px] tabular-nums text-white/40">{c.num}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <nav className="mt-auto flex shrink-0 border-t border-white/10" aria-label="Разделы телефона">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                sound.tap()
                setTab(t.key)
              }}
              aria-label={t.label}
              aria-current={active}
              className={
                'flex flex-1 flex-col items-center gap-1 py-3 text-[11px] transition-transform active:scale-95 ' +
                (active ? 'text-emerald-400' : 'text-white/50')
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {t.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
