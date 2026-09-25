'use client'

// Экран блокировки «Resale OS» в духе Android 16:
// огромные тонкие часы (76px, weight 300), дата под ними, компактные превью
// уведомлений на стеклянных карточках и два круглых shortcut'а внизу
// (фонарик — реальный toggle, камера — открывает галерею).
// Никаких паролей — это игра, телефон открывается свайпом вверх или касанием.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Camera, Flashlight, MoonStar, Pause, Play, SkipForward } from 'lucide-react'
import { useOS } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { sound } from '@/lib/sound'
import { api } from '@/lib/api'
import { fmtMoney, timeAgo } from '@/lib/format'
import { setTorch } from '@/lib/torch'
import { useDrag } from '@/lib/use-swipe'
import { KIND_APP } from './NotificationCenter'

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
const MAX_PREVIEWS = 3 // до трёх превью на локскрине

// Пустой subscribe: mounted-гейт против hydration mismatch (player читает
// localStorage на клиенте — на сервере current всегда null).
const emptySubscribe = () => () => {}

// ─── Медиа-карточка локскрина: что играет — видно даже с заблокированного ──
function LockMedia() {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  if (!mounted || !current) return null
  return (
    <div
      className="flex items-center gap-3 rounded-[22px] bg-white/[0.08] p-2.5 ring-1 ring-white/[0.08] backdrop-blur-md"
      role="group"
      aria-label={`Сейчас играет: ${current.title} — ${current.artist}`}
    >
      <span className="relative size-11 shrink-0 overflow-hidden rounded-[13px] bg-white/10">
        {current.artworkSmall ? (
          <img loading="lazy" decoding="async" src={current.artworkSmall} alt="" className="h-full w-full object-cover"/>
        ) : null}
        {isPlaying && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-[#3ED598]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold leading-tight text-white">{current.title}</p>
        <p className="mt-0.5 truncate text-[12px] leading-tight text-white/60">{current.artist}</p>
      </div>
      <button
        type="button"
        aria-label={isPlaying ? 'Пауза' : 'Продолжить воспроизведение'}
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900 outline-none transition-transform duration-150 active:scale-90"
      >
        {isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5 translate-x-[1px]" aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label="Следующий трек"
        onClick={(e) => {
          e.stopPropagation()
          next()
        }}
        className="mr-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-white/80 outline-none transition-colors active:bg-white/10"
      >
        <SkipForward className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const dnd = useOS((s) => s.dnd)
  const notifications = useOS((s) => s.notifications)
  const session = useOS((s) => s.session)
  const flashlight = useOS((s) => s.flashlight)
  const setFlashlight = useOS((s) => s.setFlashlight)
  const pushToast = useOS((s) => s.pushToast)

  const now = useClock()
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const timerRef = useRef(0)
  const [day, setDay] = useState<{ deals: number; net: number } | null>(null)

  // свайп вверх с «следованиями за пальцем/мышью»: работает и на телефоне, и на ПК
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const movedRef = useRef(false)

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

  // Разблокировка: свайп / тап / клавиша — никаких паролей, это смартфон в игре
  const unlock = useCallback(() => {
    if (leavingRef.current) return
    sound.unlock()
    leavingRef.current = true
    setLeaving(true)
    timerRef.current = window.setTimeout(onUnlock, LEAVE_ANIMATION_MS)
  }, [onUnlock])

  // Фонарик shortcut: реальная вспышка через Torch API (как в центре управления)
  const toggleFlash = useCallback(async () => {
    const next = !useOS.getState().flashlight
    const res = await setTorch(next)
    setFlashlight(next)
    if (next) {
      pushToast('Фонарик', res.real ? 'Вспышка включена на устройстве' : 'Устройство без вспышки — светим виртуально')
    }
  }, [setFlashlight, pushToast])

  // Камера shortcut: разблокируем и открываем галерею (ближайшее к камере в игре)
  const openCamera = useCallback(() => {
    unlock()
    useOS.getState().openApp('gallery')
  }, [unlock])

  const { onPointerDown } = useDrag({
    onStart: () => {
      if (leavingRef.current) return
      setDragging(true)
      movedRef.current = false
    },
    onMove: (dx, dy) => {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) movedRef.current = true
      if (leavingRef.current) return
      // вверх — следует за пальцем, вниз — заметно ослаблен (упругость)
      setDragY(dy < 0 ? dy * 0.95 : dy * 0.16)
    },
    onEnd: (_dx, dy) => {
      setDragging(false)
      if (leavingRef.current) return
      if (dy < -70) unlock()
      else setDragY(0) // пружинка назад
    },
  })

  // тап без драга — тоже разблокирует (после реального драга клик гасим)
  const onClick = () => {
    if (!movedRef.current) unlock()
  }

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

  const previews = notifications.filter((n) => !n.readAt).slice(0, MAX_PREVIEWS)
  const unreadCount = notifications.filter((n) => !n.readAt).length
  const moreCount = unreadCount - previews.length
  // «1 уведомление / 2 уведомления / 5 уведомлений» — русские склонения
  const notifWord = (n: number) =>
    n % 10 === 1 && n % 100 !== 11
      ? 'уведомление'
      : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
        ? 'уведомления'
        : 'уведомлений'
  const DayIcon = KIND_APP.deal.icon
  const dealsLabel =
    day && (day.deals === 1 ? 'сделка' : day.deals < 5 ? 'сделки' : 'сделок')

  return (
    <div
      className={`absolute inset-0 z-50 cursor-pointer touch-none overflow-hidden select-none ease-out ${
        dragging ? '' : 'transition-transform duration-[400ms]'
      }`}
      role="dialog"
      aria-label="Экран блокировки — проведите вверх или коснитесь, чтобы открыть"
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{
        transform: leaving ? 'translateY(-100%)' : `translateY(${dragY}px)`,
        opacity: leaving ? 0.3 : dragging ? Math.max(0.55, 1 + dragY / 460) : 1,
      }}
    >
      {/* ─── Тёмная сцена с мягкими бликами, как на системном экране блокировки ─── */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#050d09]" />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 55% at 50% -8%, rgba(34,197,94,0.38) 0%, rgba(34,197,94,0.12) 42%, transparent 68%), radial-gradient(90% 40% at 88% 108%, rgba(16,185,129,0.16) 0%, transparent 60%), radial-gradient(80% 36% at 6% 96%, rgba(132,204,22,0.10) 0%, transparent 62%)',
        }}
      />

      <div className="relative z-10 flex h-full flex-col px-5 pb-4 pt-14">
        {/* ─── Огромные часы Android 16: тонкие, плотный трекинг ─── */}
        <div className="shrink-0 text-center" suppressHydrationWarning>
          <p
            className="lock-clock-in text-white"
            style={{
              fontSize: '76px',
              fontWeight: 300,
              lineHeight: 1,
              letterSpacing: '-0.045em',
              fontVariantNumeric: 'tabular-nums',
              textShadow: '0 4px 44px rgba(0,0,0,0.55)',
            }}
          >
            {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
          </p>
          <p className="mt-2 text-[15px] font-medium tracking-wide text-white/80">
            {now
              ? now.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              : '\u00A0'}
          </p>
        </div>

        {/* Режим «Не беспокоить» — одна короткая строка */}
        {dnd && (
          <p className="mt-2.5 flex shrink-0 items-center justify-center gap-1.5 text-[11px] text-white/55">
            <MoonStar className="size-3.5" aria-hidden="true" />
            Не беспокоить включён
          </p>
        )}

        {/* ─── Превью уведомлений: стеклянные карточки white/8, radius 22 ─── */}
        <div className="mt-6 min-h-0 flex-1 space-y-2.5 overflow-y-auto [scrollbar-width:none]">
          {unreadCount > 0 && (
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              {unreadCount} {notifWord(unreadCount)}
            </p>
          )}
          {previews.map((n) => {
            const meta = KIND_APP[n.kind] ?? KIND_APP.system
            const NotifIcon = meta.icon
            return (
              <div
                key={n.id}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.08] px-3 py-2 ring-1 ring-white/[0.06] backdrop-blur-md"
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-[12px] text-white shadow-sm"
                  style={{ background: meta.bg }}
                >
                  <NotifIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold leading-tight text-white">{n.title}</p>
                  <p className="mt-0.5 truncate text-[12px] leading-tight text-white/65">{n.body}</p>
                </div>
                <span className="shrink-0 text-[11px] text-white/40">{timeAgo(n.createdAt)}</span>
              </div>
            )
          })}

          {/* «ещё N» — если уведомлений больше трёх */}
          {moreCount > 0 && (
            <p className="pt-0.5 text-center text-[11px] font-medium text-white/45">
              Ещё {moreCount} {notifWord(moreCount)}
            </p>
          )}

          {/* Итоги дня (если сегодня были сделки) — в том же стеклянном стиле */}
          {day && dealsLabel && (
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.08] px-3 py-2 ring-1 ring-white/[0.06] backdrop-blur-md">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-[12px] text-white shadow-sm"
                style={{ background: KIND_APP.deal.bg }}
              >
                <DayIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight text-white">Сегодня в Resale</p>
                <p className="mt-0.5 truncate text-[12px] leading-tight text-white/65">
                  {day.deals} {dealsLabel} ·{' '}
                  <span className={day.net >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-red-300'}>
                    {day.net >= 0 ? '+' : ''}
                    {fmtMoney(day.net)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Медиа: управление плеером без разблокировки телефона */}
          <LockMedia />
        </div>

        {/* ─── Низ: подсказка, круглые shortcut'ы и Android-handle ─── */}
        <div className="shrink-0 pt-4">
          <p className="text-center text-[12px] font-medium text-white/70">Проведите вверх, чтобы открыть</p>
          <div className="mt-4 flex items-center justify-between px-2">
            <button
              type="button"
              aria-label={flashlight ? 'Выключить фонарик' : 'Включить фонарик'}
              aria-pressed={flashlight}
              onClick={(e) => {
                e.stopPropagation()
                void toggleFlash()
              }}
              className={`flex size-14 items-center justify-center rounded-full backdrop-blur-xl outline-none transition-all duration-200 active:scale-90 focus-visible:ring-2 focus-visible:ring-white/70 ${
                flashlight
                  ? 'bg-white text-black shadow-[0_0_28px_rgba(255,251,214,0.45)]'
                  : 'bg-white/[0.12] text-white'
              }`}
            >
              <Flashlight className="size-6" aria-hidden="true" />
            </button>

            <button
              type="button"
              aria-label="Открыть камеру (галерею)"
              onClick={(e) => {
                e.stopPropagation()
                openCamera()
              }}
              className="flex size-14 items-center justify-center rounded-full bg-white/[0.12] text-white backdrop-blur-xl outline-none transition-all duration-200 active:scale-90 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Camera className="size-6" aria-hidden="true" />
            </button>
          </div>
          {/* Android-handle: тонкая пилюля внизу */}
          <span
            aria-hidden="true"
            className="handle-breathe mx-auto mt-5 block h-1 w-28 rounded-full bg-white/50"
          />
        </div>
      </div>
    </div>
  )
}
