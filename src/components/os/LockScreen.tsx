'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Delete, Loader2, ShoppingBag } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import { fmtMoney } from '@/lib/format'
import { playSound } from '@/lib/sounds'
import { wallpaperClass } from '@/lib/wallpapers'

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
  const battery = useOS((s) => s.battery)
  const online = useOS((s) => s.online)
  const dnd = useOS((s) => s.dnd)
  const pushToast = useOS((s) => s.pushToast)
  const notifications = useOS((s) => s.notifications)
  const wallpaper = useOS((s) => s.wallpaper)
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

  // Уход с экрана: текущая анимация подъёма вверх сохранена
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

  const previews = notifications.filter((n) => !n.readAt).slice(0, 3)
  const dealsLabel =
    day && (day.deals === 1 ? 'сделка' : day.deals < 5 ? 'сделки' : 'сделок')

  return (
    <div
      className={`absolute inset-0 z-50 overflow-hidden transition-transform duration-[400ms] ease-out ${
        leaving ? '-translate-y-full' : 'translate-y-0'
      } ${wallpaperClass(wallpaper)}`}
      role="dialog"
      aria-label="Экран блокировки"
    >
      {/* Затемняющий blur-оверлей: тёмные размытые обои, как на макете */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/45 backdrop-blur-2xl" />

      <div className="relative z-10 flex h-full flex-col px-6 pb-5 pt-9">
        {/* Верхняя панель: логотип Сделки + «Обновить приложение» */}
        <div className="flex shrink-0 items-center justify-between">
          <div
            className="flex size-11 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-md"
            title="Сделка OS"
          >
            <ShoppingBag className="size-5 text-white" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 rounded-full border border-white/40 bg-white/10 px-3.5 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-md outline-none transition active:scale-95 active:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Loader2
              aria-hidden="true"
              className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            Обновить приложение
          </button>
        </div>

        {/* Часы и дата */}
        <div className="mt-5 shrink-0 text-center">
          <p className="text-xs text-white/70" suppressHydrationWarning>
            {now
              ? now.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              : '\u00A0'}
          </p>
          <p
            className="mt-0.5 text-6xl font-extralight tabular-nums text-white"
            suppressHydrationWarning
          >
            {now
              ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : '\u00A0'}
          </p>
        </div>

        {/* Приветствие по времени суток */}
        <div className="mt-5 shrink-0" suppressHydrationWarning>
          <p className="text-[26px] font-semibold leading-8 text-white">
            {greeting},
            <span className="block">{displayName}</span>
          </p>
        </div>

        {/* Ввод ПИН-кода */}
        <div className="mt-4 shrink-0 text-center">
          <p className="text-[13px] text-white">Введите пароль</p>
          <div
            className="mt-2.5 flex items-center justify-center gap-2.5"
            role="group"
            aria-label="ПИН-код из 4 цифр"
          >
            {Array.from({ length: PIN_LENGTH }, (_, i) => {
              const digit = code[i]
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`flex size-11 items-center justify-center rounded-lg text-lg font-semibold tabular-nums transition-colors duration-150 ${
                    digit ? 'bg-white/85 text-neutral-900' : 'bg-white/40 text-white'
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

        {/* Превью уведомлений + итоги дня (между паролем и клавиатурой) */}
        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:none]">
          {previews.length > 0 && (
            <div className="space-y-1.5">
              {previews.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl bg-white/12 px-3 py-1.5 backdrop-blur-md"
                >
                  <p className="text-[11px] font-semibold text-white">{n.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-white/70">{n.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Итоги дня (если сегодня были сделки) */}
          {day && dealsLabel && (
            <div className="flex items-center gap-2.5 rounded-2xl bg-white/12 px-3.5 py-2.5 backdrop-blur-md">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/80">
                <ShoppingBag className="size-4 text-white" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white">Сегодня на Сделке</p>
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

        {/* Батарея, «Не беспокоить» и онлайн — мелко над клавиатурой */}
        <div className="mb-3 flex shrink-0 items-center justify-center gap-3 text-[11px] text-white/70">
          <span className="flex items-center gap-1.5 tabular-nums">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                battery <= 15 ? 'bg-red-400' : 'bg-emerald-400'
              }`}
            />
            {battery}%
          </span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/40" />
          {dnd && <span title="Не беспокоить">Не беспокоить</span>}
          {dnd && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/40" />}
          <span className="tabular-nums">Онлайн: {online}</span>
        </div>

        {/* Номерная клавиатура 3x4 */}
        <div className="mx-auto grid w-fit shrink-0 grid-cols-3 gap-3" role="group" aria-label="Клавиатура для ввода пароля">
          {KEYPAD.map((key) => (
            <button
              key={key.digit}
              type="button"
              aria-label={`Цифра ${key.digit}`}
              onClick={() => pressDigit(key.digit)}
              className="flex size-[68px] flex-col items-center justify-center rounded-[14px] bg-white/25 backdrop-blur-md outline-none transition active:scale-95 active:bg-white/40 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <span className="text-[22px] font-medium leading-none text-white">
                {key.digit}
              </span>
              {key.letters ? (
                <span className="mt-1 text-[9px] leading-none tracking-wide text-white/70">
                  {key.letters}
                </span>
              ) : null}
            </button>
          ))}

          {/* Нижний ряд: «Не могу войти» · 0 · стереть */}
          <button
            type="button"
            onClick={handleSupport}
            className="flex size-[68px] items-center justify-center rounded-[14px] px-1 text-center text-[10px] leading-tight text-white/85 outline-none transition active:scale-95 active:text-white focus-visible:ring-2 focus-visible:ring-white/70"
          >
            Не могу войти
          </button>
          <button
            type="button"
            aria-label="Цифра 0"
            onClick={() => pressDigit('0')}
            className="flex size-[68px] flex-col items-center justify-center rounded-[14px] bg-white/25 backdrop-blur-md outline-none transition active:scale-95 active:bg-white/40 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <span className="text-[22px] font-medium leading-none text-white">0</span>
          </button>
          <button
            type="button"
            aria-label="Стереть последнюю цифру"
            onClick={backspace}
            className="flex size-[68px] items-center justify-center rounded-[14px] text-white/90 outline-none transition active:scale-95 active:text-white focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Delete className="size-6" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
