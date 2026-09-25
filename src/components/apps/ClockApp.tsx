'use client'

// Часы ОС: мировое время, секундомер и таймер.
// Живые тики — через useSyncExternalStore (без setState в эффектах);
// интервалы/тайм-ауты запускаются только из обработчиков нажатий.

import { useSyncExternalStore, useState } from 'react'
import {
  Flag,
  Globe2,
  Hourglass,
  Pause,
  Play,
  RotateCcw,
  Timer,
} from 'lucide-react'
import { sound } from '@/lib/sound'

// Тик каждые intervalMs мс: снимок квантуется, чтобы getSnapshot был стабильным
function useTick(intervalMs: number): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, intervalMs)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0,
  )
}

function quantize(ms: number, step: number): number {
  return Math.floor(ms / step) * step
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/* ---------------------------------- Мировые ---------------------------------- */

const CITIES = [
  { name: 'Лондон', tz: 'Europe/London', flag: 'uk' as const },
  { name: 'Нью-Йорк', tz: 'America/New_York', flag: 'us' as const },
  { name: 'Токио', tz: 'Asia/Tokyo', flag: 'jp' as const },
]

function FlagDot({ kind }: { kind: 'uk' | 'us' | 'jp' }) {
  if (kind === 'jp') {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-white/25">
        <span className="size-1.5 rounded-full bg-[#BC002D]" aria-hidden="true" />
      </span>
    )
  }
  if (kind === 'us') {
    return (
      <span
        className="size-4 shrink-0 rounded-full ring-1 ring-white/25"
        style={{ background: 'linear-gradient(180deg,#B22234 0 33%,#F5F5F5 33% 66%,#0A3161 66%)' }}
        aria-hidden="true"
      />
    )
  }
  return (
    <span
      className="size-4 shrink-0 rounded-full ring-1 ring-white/25"
      style={{ background: 'linear-gradient(135deg,#012169 0 52%,#C8102E 52%)' }}
      aria-hidden="true"
    />
  )
}

function WorldTab() {
  const tick = useTick(1000)
  const now = tick ? new Date(tick) : null

  return (
    <div className="flex flex-1 flex-col overflow-y-auto [scrollbar-width:thin] px-4 pb-4">
      <div className="flex flex-col items-center pt-6 pb-8">
        <div className="text-[13px] capitalize text-white/60" suppressHydrationWarning>
          {now ? now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        </div>
        <div className="mt-2 text-[52px] font-light leading-none tabular-nums" suppressHydrationWarning>
          {now
            ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '--:--:--'}
        </div>
        <div className="mt-2 text-[12px] text-white/40">Местное время</div>
      </div>

      <div className="text-[12px] text-white/60">Другие города</div>
      <div className="mt-2 flex flex-col gap-2">
        {CITIES.map((c) => (
          <div
            key={c.tz}
            className="flex items-center justify-between rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FlagDot kind={c.flag} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium">{c.name}</div>
                <div className="text-[11px] text-white/40">{c.tz.split('/')[1].replace('_', ' ')}</div>
              </div>
            </div>
            <div className="text-[22px] tabular-nums" suppressHydrationWarning>
              {now ? now.toLocaleTimeString('ru-RU', { timeZone: c.tz, hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------- Секундомер -------------------------------- */

function fmtSw(ms: number): string {
  const total = Math.max(0, ms)
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  return `${pad2(m)}:${pad2(s)},${pad2(cs)}`
}

function StopwatchTab() {
  const tick = useTick(50)
  const [running, setRunning] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const [acc, setAcc] = useState(0)
  const [laps, setLaps] = useState<number[]>([])

  const elapsed = acc + (running && startedAt > 0 ? tick - startedAt : 0)

  const start = () => {
    sound.tap()
    setStartedAt(quantize(Date.now(), 50))
    setRunning(true)
  }

  const stop = () => {
    sound.tap()
    setAcc((a) => a + (startedAt > 0 ? Date.now() - startedAt : 0))
    setRunning(false)
  }

  const lap = () => {
    sound.tap()
    const total = acc + (startedAt > 0 ? Date.now() - startedAt : 0)
    setLaps((prev) => [total, ...prev])
  }

  const reset = () => {
    sound.tap()
    setAcc(0)
    setStartedAt(0)
    setRunning(false)
    setLaps([])
  }

  const canReset = !running && (acc > 0 || laps.length > 0)

  return (
    <div className="flex flex-1 flex-col overflow-y-auto [scrollbar-width:thin] px-4 pb-4">
      <div className="flex flex-col items-center pt-10 pb-8">
        <div className="text-[56px] font-light leading-none tabular-nums">{fmtSw(elapsed)}</div>
      </div>

      <div className="flex gap-3">
        {running ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Остановить секундомер"
            className="h-12 flex-1 rounded-2xl border border-red-500/30 bg-red-500/15 text-[15px] font-semibold text-red-400 transition-transform active:scale-[0.98]"
          >
            <span className="inline-flex items-center gap-2">
              <Pause className="size-4" aria-hidden="true" /> Стоп
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            aria-label="Запустить секундомер"
            className="h-12 flex-1 rounded-2xl bg-[#22C55E] text-[15px] font-bold text-[#052E16] transition-transform active:scale-[0.98]"
          >
            <span className="inline-flex items-center gap-2">
              <Play className="size-4" aria-hidden="true" /> Старт
            </span>
          </button>
        )}
        {running ? (
          <button
            type="button"
            onClick={lap}
            aria-label="Зафиксировать круг"
            className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            <span className="inline-flex items-center gap-2">
              <Flag className="size-4" aria-hidden="true" /> Круг
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={reset}
            disabled={!canReset}
            aria-label="Сбросить секундомер"
            className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <RotateCcw className="size-4" aria-hidden="true" /> Сброс
            </span>
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {laps.length === 0 ? (
          <div className="pt-4 text-center text-[13px] text-white/40">Круги появятся здесь</div>
        ) : (
          laps.map((total, i) => {
            const prevTotal = laps[i + 1] ?? 0
            const split = total - prevTotal
            const delta = i + 1 < laps.length ? split - (laps[i + 1] - (laps[i + 2] ?? 0)) : null
            return (
              <div
                key={`${total}-${i}`}
                className="flex items-center justify-between rounded-xl border border-emerald-500/15 bg-[#0E1F16] px-4 py-2.5"
              >
                <span className="text-[13px] text-white/60">Круг {laps.length - i}</span>
                <span className="flex items-baseline gap-3">
                  {delta !== null && (
                    <span className="text-[11px] tabular-nums text-white/40">
                      {delta >= 0 ? '+' : '−'}
                      {(Math.abs(delta) / 1000).toFixed(2)} с
                    </span>
                  )}
                  <span className="text-[14px] font-medium tabular-nums text-emerald-400">{fmtSw(split)}</span>
                  <span className="text-[12px] tabular-nums text-white/40">{fmtSw(total)}</span>
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ------------------------------------ Таймер ---------------------------------- */

const PRESETS = [1, 3, 5, 10, 25]

function TimerTab() {
  const tick = useTick(250)
  const [minutes, setMinutes] = useState(5)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      setTimeoutId(null)
    }
  }

  const start = () => {
    sound.tap()
    clearTimer()
    const ms = minutes * 60000
    setDone(false)
    setEndsAt(Date.now() + ms)
    setTimeoutId(
      setTimeout(() => {
        setTimeoutId(null)
        setEndsAt(null)
        setDone(true)
        sound.pop()
      }, ms),
    )
  }

  const cancel = () => {
    sound.tap()
    clearTimer()
    setEndsAt(null)
    setDone(false)
  }

  const remainingMs = endsAt !== null ? Math.max(0, endsAt - tick) : minutes * 60000
  const totalSec = Math.ceil(remainingMs / 1000)
  const showMm = Math.floor(totalSec / 60)
  const showSs = totalSec % 60

  return (
    <div className="flex flex-1 flex-col overflow-y-auto [scrollbar-width:thin] px-4 pb-4">
      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Hourglass className="size-10 text-emerald-400" aria-hidden="true" />
          <div className="text-[24px] font-semibold text-emerald-400">Время вышло</div>
          <button
            type="button"
            onClick={cancel}
            aria-label="Сбросить таймер"
            className="mt-4 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            Готово
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center pt-10 pb-8">
            <div
              className={
                'text-[64px] font-light leading-none tabular-nums ' +
                (endsAt !== null ? 'text-white' : 'text-white/60')
              }
            >
              {pad2(showMm)}:{pad2(showSs)}
            </div>
            <div className="mt-2 text-[12px] text-white/40">
              {endsAt !== null ? 'Обратный отсчёт идёт' : `Таймер на ${minutes} мин`}
            </div>
          </div>

          {endsAt === null ? (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                {PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      sound.tap()
                      setMinutes(m)
                    }}
                    aria-label={`Таймер на ${m} минут`}
                    aria-pressed={minutes === m}
                    className={
                      'h-9 rounded-full px-4 text-[13px] transition-transform active:scale-95 ' +
                      (minutes === m
                        ? 'bg-emerald-500 font-semibold text-[#052E16]'
                        : 'bg-white/[0.06] text-white/70')
                    }
                  >
                    {m} мин
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={start}
                aria-label="Запустить таймер"
                className="mt-6 h-12 w-full rounded-2xl bg-[#22C55E] text-[15px] font-bold text-[#052E16] transition-transform active:scale-[0.98]"
              >
                Старт
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={cancel}
              aria-label="Остановить таймер"
              className="h-12 w-full rounded-2xl border border-red-500/30 bg-red-500/15 text-[15px] font-semibold text-red-400 transition-transform active:scale-[0.98]"
            >
              Стоп
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------ Оболочка -------------------------------- */

type ClockTab = 'world' | 'stopwatch' | 'timer'

const TABS: { key: ClockTab; label: string; icon: typeof Globe2 }[] = [
  { key: 'world', label: 'Мировые', icon: Globe2 },
  { key: 'stopwatch', label: 'Секундомер', icon: Timer },
  { key: 'timer', label: 'Таймер', icon: Hourglass },
]

export default function ClockApp() {
  const [tab, setTab] = useState<ClockTab>('world')

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#07130D,#050D09)] text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 px-5">
        <h1 className="text-[17px] font-semibold">Часы</h1>
      </header>

      {/* Вкладки остаются смонтированными (hidden): секундомер и таймер не сбрасываются при переключении */}
      <div className={'flex min-h-0 flex-1 flex-col ' + (tab === 'world' ? '' : 'hidden')}>
        <WorldTab />
      </div>
      <div className={'flex min-h-0 flex-1 flex-col ' + (tab === 'stopwatch' ? '' : 'hidden')}>
        <StopwatchTab />
      </div>
      <div className={'flex min-h-0 flex-1 flex-col ' + (tab === 'timer' ? '' : 'hidden')}>
        <TimerTab />
      </div>

      <nav className="mt-auto flex shrink-0 border-t border-white/10" aria-label="Разделы часов">
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
