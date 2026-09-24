'use client'

// Экран блокировки «Сделка OS» — как на обычном смартфоне:
// дата, крупные часы, превью уведомлений и подсказка «свайп вверх».
// Никаких паролей и пин-кодов — это игра, телефон открывается одним касанием.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Lock, MoonStar } from 'lucide-react'
import { useOS } from '@/lib/store'
import { api } from '@/lib/api'
import { fmtMoney } from '@/lib/format'
import { playSound } from '@/lib/sounds'

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

const LEAVE_ANIMATION_MS = 400

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const dnd = useOS((s) => s.dnd)
  const notifications = useOS((s) => s.notifications)
  const session = useOS((s) => s.session)

  const now = useClock()
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const timerRef = useRef(0)
  const touchStartY = useRef<number | null>(null)
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

  // чистим таймер при размонтировании
  useEffect(() => {
    const t = timerRef.current
    return () => window.clearTimeout(t)
  }, [])

  // Разблокировка: одно касание / клавиша — никаких паролей, это смартфон в игре
  const unlock = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    playSound('unlock')
    timerRef.current = window.setTimeout(onUnlock, LEAVE_ANIMATION_MS)
  }, [onUnlock])

  // Enter или пробел тоже разблокируют (доступность с клавиатуры)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        unlock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [unlock])

  // Свайп вверх — как на настоящем смартфоне; тап и клавиши тоже работают
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartY.current
    touchStartY.current = null
    if (start === null) return
    const end = e.changedTouches[0]?.clientY ?? start
    if (start - end > 36) unlock()
  }

  const previews = notifications.filter((n) => !n.readAt).slice(0, 3)
  const dealsLabel =
    day && (day.deals === 1 ? 'сделка' : day.deals < 5 ? 'сделки' : 'сделок')

  return (
    <div
      className={`absolute inset-0 z-50 cursor-pointer overflow-hidden select-none transition-transform duration-[400ms] ease-out ${
        leaving ? '-translate-y-full' : 'translate-y-0'
      }`}
      role="dialog"
      aria-label="Экран блокировки — коснитесь или проведите вверх, чтобы открыть"
      onClick={unlock}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ─── Тёмная сцена с мягкими бликами, как на системном экране блокировки ─── */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#0b0812]" />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 55% at 50% -8%, rgba(124,58,237,0.42) 0%, rgba(124,58,237,0.12) 42%, transparent 68%), radial-gradient(90% 40% at 88% 108%, rgba(236,72,153,0.16) 0%, transparent 60%), radial-gradient(80% 36% at 6% 96%, rgba(59,130,246,0.12) 0%, transparent 62%)',
        }}
      />

      <div className="relative z-10 flex h-full flex-col px-5 pb-7 pt-7">
        {/* Замок сверху — как на системном лок-скрине */}
        <div className="flex shrink-0 justify-center">
          <span
            className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md"
            aria-hidden="true"
          >
            <Lock className="size-4 text-white/85" strokeWidth={2.2} />
          </span>
        </div>

        {/* Дата и время — крупно по центру */}
        <div className="mt-4 shrink-0 text-center" suppressHydrationWarning>
          <p className="text-[15px] font-medium tracking-wide text-white/75">
            {now
              ? now.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              : '\u00A0'}
          </p>
          <p
            className="mt-1.5 text-[76px] font-light leading-none tabular-nums tracking-tight text-white"
            style={{ textShadow: '0 2px 28px rgba(0,0,0,0.5)' }}
          >
            {now
              ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : '\u00A0'}
          </p>
        </div>

        {/* Превью уведомлений + итоги дня */}
        <div className="mt-6 min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:none]">
          {dnd && (
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/70">
              <MoonStar className="size-3.5" aria-hidden="true" />
              Не беспокоить включён — уведомления копятся в центре
            </div>
          )}
          {previews.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl border border-white/10 bg-white/10 px-3.5 py-2.5 backdrop-blur-md"
            >
              <p className="text-[12px] font-semibold text-white">{n.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[12px] text-white/70">{n.body}</p>
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

        {/* Подсказка снизу: свайп/тап — и телефон открыт */}
        <div className="shrink-0 pt-3 text-center">
          <span
            aria-hidden="true"
            className="mx-auto block h-1.5 w-32 rounded-full bg-white/80"
          />
          <p className="mt-3 animate-pulse text-[13px] font-medium text-white/80">
            Проведите вверх, чтобы открыть
          </p>
        </div>
      </div>
    </div>
  )
}
