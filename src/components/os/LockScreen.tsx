'use client'

// Экран блокировки «Сделка OS» — по макету банковского приложения:
// тёмная премиальная сцена (свой фон, не зависит от обоев), лого + «Обновить
// приложение», дата и время, приветствие, ПИН 4 ячейки, нумпад 3×4 с буквами.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Delete, Loader2, MoonStar } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import { fmtMoney } from '@/lib/format'
import { playSound } from '@/lib/sounds'
import { DealLogo } from '@/components/os/app-logos'

// Живые тики каждые 1000 мс без setState в эффекте (useSyncExternalStore).
function useClock(): Date | null {
  const ts = useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, 1000)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  )
  return ts ? new Date(ts) : null
}

// Приветствие по времени суток
function greetingFor(hour: number): string {
  if (hour < 5) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

// Номерная клавиатура: цифра + русские буквы (1 и 0 — без букв)
const KEYPAD: { digit: string; letters?: string }[] = [
  { digit: '1' },
  { digit: '2', letters: 'абвг' },
  { digit: '3', letters: 'дежз' },
  { digit: '4', letters: 'ийкл' },
  { digit: '5', letters: 'мноп' },
  { digit: '6', letters: 'рсту' },
  { digit: '7', letters: 'фхцч' },
  { digit: '8', letters: 'шщъы' },
  { digit: '9', letters: 'ьэюя' },
]

const PIN_LENGTH = 4
const UNLOCK_DELAY_MS = 250
const LEAVE_ANIMATION_MS = 400
const REFRESH_SPIN_MS = 1500

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const dnd = useOS((s) => s.dnd)
  const pushToast = useOS((s) => s.pushToast)
  const notifications = useOS((s) => s.notifications)
  const session = useOS((s) => s.session)

  const now = useClock()
  const [code, setCode] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const leavingRef = useRef(false)
  const timersRef = useRef<number[]>([])
  const [day, setDay] = useState<{ deals: number; net: number } | null>(null)

  // итоги дня — только для авторизованной сессии, один раз при монтировании
  useEffect(() => {
    if (!session) return
    let alive = true
    api.daySummary()
      .then((d) => {
        if (alive && d.deals > 0) setDay({ deals: d.deals, net: d.net })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [session])

  // чистим все таймеры при размонтировании
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const displayName = session?.displayName?.trim() || 'Игрок'
  const hour = now ? now.getHours() : 19
  const greeting = greetingFor(hour)

  // Уход с экрана: анимация подъёма вверх
  const finishUnlock = () => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    playSound('unlock')
    timersRef.current.push(window.setTimeout(onUnlock, LEAVE_ANIMATION_MS))
  }

  const pressDigit = (digit: string) => {
    if (leavingRef.current || code.length >= PIN_LENGTH) return
    const next = code + digit
    setCode(next)
    playSound('tap')
    if (next.length === PIN_LENGTH) {
      // короткая пауза, затем разблокировка (любой 4-значный код верен — это игра)
      timersRef.current.push(window.setTimeout(finishUnlock, UNLOCK_DELAY_MS))
    }
  }

  const backspace = () => {
    if (leavingRef.current || code.length === 0) return
    if (code.length === PIN_LENGTH) {
      // разблокировка ещё не началась (пауза 250 мс) — отменяем и даём стереть
      timersRef.current.forEach((t) => window.clearTimeout(t))
      timersRef.current = []
    }
    setCode(code.slice(0, -1))
    playSound('tap')
  }

  const handleSupport = () => {
    if (leavingRef.current) return
    playSound('tap')
    pushToast('Не могу войти', 'Обратитесь в поддержку Сделки')
  }

  // Декоративная кнопка «Обновить приложение»
  const handleRefresh = () => {
    if (leavingRef.current || refreshing) return
    playSound('tap')
    setRefreshing(true)
    timersRef.current.push(window.setTimeout(() => setRefreshing(false), REFRESH_SPIN_MS))
  }

  const previews = notifications.filter((n) => !n.readAt).slice(0, 2)
  const dealsLabel =
    day && (day.deals === 1 ? 'сделка' : day.deals < 5 ? 'сделки' : 'сделок')

  return (
    <div
      className={`absolute inset-0 z-50 overflow-hidden transition-transform duration-[400ms] ease-out ${
        leaving ? '-translate-y-full' : 'translate-y-0'
      }`}
      role="dialog"
      aria-label="Экран блокировки"
    >
      {/* ─── Собственная премиальная сцена: глубокий тёмный фон с мягкими бликами ─── */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#0b0812]" />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 55% at 50% -8%, rgba(124,58,237,0.42) 0%, rgba(124,58,237,0.12) 42%, transparent 68%), radial-gradient(90% 40% at 88% 108%, rgba(236,72,153,0.16) 0%, transparent 60%), radial-gradient(80% 36% at 6% 96%, rgba(59,130,246,0.12) 0%, transparent 62%)',
        }}
      />

      <div className="relative z-10 flex h-full flex-col px-6 pb-6 pt-8">
        {/* Верхняя панель: логотип Сделки + «Обновить приложение» */}
        <div className="flex shrink-0 items-center justify-between">
          <div
            className="flex size-12 items-center justify-center rounded-full bg-white shadow-lg shadow-black/30"
            title="Сделка OS"
          >
            <DealLogo />
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-2 text-[12px] font-medium text-white/95 backdrop-blur-md outline-none transition active:scale-95 active:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Loader2
              aria-hidden="true"
              className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            Обновить приложение
          </button>
        </div>

        {/* Дата и время — компактно, по центру */}
        <div className="mt-5 shrink-0 text-center" suppressHydrationWarning>
          <p className="text-[13px] font-medium tracking-wide text-white/70">
            {now
              ? now.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              : '\u00A0'}
          </p>
          <p
            className="mt-1 text-[44px] font-light leading-none tabular-nums tracking-tight text-white"
            style={{ textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}
          >
            {now
              ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : '\u00A0'}
          </p>
        </div>

        {/* Приветствие — крупно, слева (как в макете) */}
        <div className="mt-6 shrink-0" suppressHydrationWarning>
          <p className="text-[28px] font-bold leading-9 text-white">
            {greeting},
            <span className="block">{displayName}</span>
          </p>
        </div>

        {/* Ввод ПИН-кода */}
        <div className="mt-5 shrink-0 text-center">
          <p className="text-[13px] font-medium text-white/90">Введите пароль</p>
          <div
            className="mt-3 flex items-center justify-center gap-3"
            role="group"
            aria-label="ПИН-код из 4 цифр"
          >
            {Array.from({ length: PIN_LENGTH }, (_, i) => {
              const digit = code[i]
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`flex size-12 items-center justify-center rounded-xl text-lg font-semibold tabular-nums transition-all duration-150 ${
                    digit
                      ? 'scale-105 bg-white text-neutral-900 shadow-lg shadow-black/25'
                      : 'bg-white/20 text-white ring-1 ring-inset ring-white/25'
                  }`}
                >
                  {digit ?? ''}
                </span>
              )
            })}
          </div>
          <p className="sr-only" aria-live="polite">
            Введено {code.length} из {PIN_LENGTH} цифр
          </p>
        </div>

        {/* Превью уведомлений + итоги дня */}
        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:none]">
          {dnd && (
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/70">
              <MoonStar className="size-3.5" aria-hidden="true" />
              Не беспокоить включён — уведомления копятся в центре
            </div>
          )}
          {previews.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl border border-white/10 bg-white/10 px-3.5 py-2 backdrop-blur-md"
            >
              <p className="text-[11px] font-semibold text-white">{n.title}</p>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-white/70">{n.body}</p>
            </div>
          ))}

          {/* Итоги дня (если сегодня были сделки) */}
          {day && dealsLabel && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/10 px-3.5 py-2.5 backdrop-blur-md">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500 shadow-md shadow-violet-900/40">
                <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
                  <path
                    d="M14.5 26.5 l5.5 5.5 L30 21.5"
                    stroke="#ffffff"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-white">Сегодня на Сделке</p>
                <p className="text-[11px] text-white/70">
                  {day.deals} {dealsLabel} ·{' '}
                  <span
                    className={
                      day.net >= 0
                        ? 'font-semibold text-emerald-300'
                        : 'font-semibold text-red-300'
                    }
                  >
                    {day.net >= 0 ? '+' : ''}
                    {fmtMoney(day.net)}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Номерная клавиатура 3x4 */}
        <div
          className="mx-auto grid w-fit shrink-0 grid-cols-3 gap-2.5"
          role="group"
          aria-label="Клавиатура для ввода пароля"
        >
          {KEYPAD.map((key) => (
            <button
              key={key.digit}
              type="button"
              aria-label={`Цифра ${key.digit}`}
              onClick={() => pressDigit(key.digit)}
              className="flex h-[58px] w-[68px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.13] backdrop-blur-md outline-none transition active:scale-95 active:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <span className="text-[21px] font-medium leading-none text-white">
                {key.digit}
              </span>
              {key.letters ? (
                <span className="mt-1 text-[9px] leading-none tracking-[0.08em] text-white/60">
                  {key.letters}
                </span>
              ) : null}
            </button>
          ))}

          {/* Нижний ряд: «Не могу войти» · 0 · стереть */}
          <button
            type="button"
            onClick={handleSupport}
            className="flex h-[58px] w-[68px] items-center justify-center rounded-2xl px-1.5 text-center text-[10.5px] font-medium leading-tight text-white/85 outline-none transition active:scale-95 active:text-white focus-visible:ring-2 focus-visible:ring-white/70"
          >
            Не могу
            <br />
            войти
          </button>
          <button
            type="button"
            aria-label="Цифра 0"
            onClick={() => pressDigit('0')}
            className="flex h-[58px] w-[68px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.13] backdrop-blur-md outline-none transition active:scale-95 active:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <span className="text-[21px] font-medium leading-none text-white">0</span>
          </button>
          <button
            type="button"
            aria-label="Стереть последнюю цифру"
            onClick={backspace}
            className="flex h-[58px] w-[68px] items-center justify-center rounded-2xl text-white/90 outline-none transition active:scale-95 active:bg-white/20 active:text-white focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Delete className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
