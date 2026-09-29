'use client'

// Центр управления и уведомления «Resale OS» по фирменному макету:
//   • qs=true — Пункт управления: кружки связи, медиа-карточка, вертикальные
//     слайдеры яркости и громкости, погода, задачи, «Не беспокоить» и заряд,
//     нижний ряд кнопок (фонарик, таймер, тёмный режим, поворот экрана);
//   • qs=false — Уведомления: живой список с разворачиванием и свайпом.
// Светлый матовый минимализм (чб), тёмный вариант в тёмной теме ОС.

import {
  BatteryFull, BatteryCharging, ChevronRight, Cloud, CloudLightning, CloudRain, CloudSun,
  Moon, MoonStar, Pause, Play, SkipBack, SkipForward, Snowflake, Sun, Timer, Wifi, WifiOff,
  Flashlight, RotateCw, Bluetooth, Volume2,
} from 'lucide-react'
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, memo,
} from 'react'
import { useOS, type AppKey } from '@/lib/store'
import { usePrefs } from '@/lib/prefs'
import { useVolume } from '@/lib/volume'
import { setTorch } from '@/lib/torch'
import { sound } from '@/lib/sound'
import { useDrag } from '@/lib/use-swipe'
import { usePlayer } from '@/lib/player'
import { api } from '@/lib/api'
import { fmtDeg, weatherNow, type Condition } from '@/lib/weather'
import { NotificationList } from './NotificationCenter'
import type { CareerData, DeliveryDTO } from '@/lib/types'

// Токены 55-b (карточка-стекло / тексты) — как в HomeScreen.
const GLASS_CARD = 'shadow-[0_10px_30px_-12px_rgba(10,10,15,0.14)]'
const TXT_PRIMARY = 'text-[#111114]'
const TXT_SECOND = 'text-[rgba(60,60,67,0.62)]'
const TXT_TERTIARY = 'text-[rgba(60,60,67,0.35)]'

// Живые тики каждые 1000 мс только пока шторка ОТКРЫТА. Шторка смонтирована
// всегда — раньше часы тикали и в закрытом состоянии, ре-рендеря всё дерево
// ЦУ/уведомлений каждую секунду даже когда оно невидимо (лишняя работа
// каждый тик батареи/онлайна страницы).
function useClock(active: boolean): Date | null {
  const ts = useSyncExternalStore(
    useCallback(
      (onStoreChange) => {
        if (!active) return () => {}
        const id = setInterval(onStoreChange, 1000)
        return () => clearInterval(id)
      },
      [active],
    ),
    () => (active ? Math.floor(Date.now() / 1000) * 1000 : 0),
    () => 0,
  )
  return ts ? new Date(ts) : null
}

// ─── Кружок-переключатель (связь/режимы) ─────────────────────────────────────
function Circle({
  active, label, onClick, children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`flex size-[52px] items-center justify-center rounded-full outline-none transition-all duration-200 active:scale-90 focus-visible:ring-2 ${
        active
          ? 'bg-[#0A84FF] text-white shadow-[0_6px_14px_rgba(10,132,255,0.35)]'
          : 'bg-white/85 text-[#111114] ring-1 ring-black/[0.04] shadow-[0_8px_20px_-14px_rgba(15,23,42,0.35)]'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Вертикальный слайдер (яркость / громкость) ──────────────────────────────
function VSlider({
  value, onChange, label, icon, dark,
}: {
  value: number // 0..1
  onChange: (v: number) => void
  label: string
  icon: React.ReactNode
  dark: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const drag = useRef({ start: 0, h: 1, v: 0 })

  const apply = (clientY: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    onChange(Math.max(0, Math.min(1, (r.bottom - clientY) / r.height)))
  }

  const { onPointerDown } = useDrag({
    onStart: (e) => {
      drag.current = { start: e.clientY, h: ref.current?.getBoundingClientRect().height ?? 1, v: value }
      apply(e.clientY)
    },
    onMove: (_dx, dy) => {
      onChange(Math.max(0, Math.min(1, drag.current.v - dy / drag.current.h)))
    },
    onEnd: () => {},
  })

  const pct = Math.round(Math.max(0.06, value) * 100)
  return (
    <button
      ref={ref}
      type="button"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      {...onPointerDown}
      className={`relative flex h-[120px] w-[52px] touch-none flex-col justify-end overflow-hidden rounded-full outline-none transition-transform duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-black/30 ${
        dark ? 'bg-white/[0.12]' : 'bg-black/[0.08]'
      }`}
    >
      {/* заливка сверху тёмным, как в макете */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 bg-[#1C1C1E] transition-[height] duration-75 ease-linear"
        style={{ height: `${pct}%`, background: dark ? 'rgba(245,245,247,0.92)' : '#1C1C1E' }}
      />
      <span
        aria-hidden="true"
        className="relative z-10 flex items-center justify-center pb-3"
        style={{ color: value > 0.7 ? (dark ? '#111114' : '#ffffff') : dark ? 'rgba(255,255,255,0.85)' : '#111114' }}
      >
        {icon}
      </span>
    </button>
  )
}

// ─── Погода «сейчас» (данные с виджетом дома) ────────────────────────────────
function CondGlyph({ cond, className }: { cond: Condition; className: string }) {
  if (cond === 'Солнечно') {
    return <Sun className={`${className} shrink-0 text-[#FFC300]`} fill="rgba(255,229,102,0.85)" strokeWidth={1.8} aria-hidden="true" />
  }
  if (cond === 'Облачно' || cond === 'После дождя') {
    return (
      <span className={`relative block shrink-0 ${className}`} aria-hidden="true">
        <Sun className="absolute left-0 top-0 size-[62%] text-[#FFC300]" fill="rgba(255,229,102,0.85)" strokeWidth={1.8} aria-hidden="true" />
        <Cloud className="absolute bottom-0 right-0 size-[74%] text-white" fill="rgba(255,255,255,0.92)" strokeWidth={1.6} aria-hidden="true" />
      </span>
    )
  }
  if (cond === 'Пасмурно') return <Cloud className={`${className} shrink-0 text-white`} fill="rgba(255,255,255,0.92)" strokeWidth={1.6} aria-hidden="true" />
  if (cond === 'Дождь') return <CloudRain className={`${className} shrink-0 text-[#6FA8DC]`} strokeWidth={1.8} aria-hidden="true" />
  if (cond === 'Снег') return <Snowflake className={`${className} shrink-0 text-[#8FC5EE]`} strokeWidth={1.8} aria-hidden="true" />
  if (cond === 'Гроза') return <CloudLightning className={`${className} shrink-0 text-[#5E5CE6]`} strokeWidth={1.8} aria-hidden="true" />
  return <CloudSun className={`${className} shrink-0 text-[#FFC300]`} strokeWidth={1.8} aria-hidden="true" />
}

// ─── Задачи дня (реальные: квест, посылка, топ) ──────────────────────────────
function useTasks() {
  const [quest, setQuest] = useState<{ title: string; progress: number; target: number } | null>(null)
  const [delivery, setDelivery] = useState<string | null>(null)
  const [place, setPlace] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    api.career().then((c: CareerData) => {
      if (!alive) return
      const q = c.quests.find((x) => !x.claimed && x.progress > 0) ?? c.quests.find((x) => !x.claimed)
      if (q) setQuest({ title: q.title, progress: Math.min(q.progress, q.target), target: q.target })
    }).catch(() => {})
    api.deliveries().then((d: { items: DeliveryDTO[] }) => {
      if (!alive) return
      const act = d.items.find((x) => x.status === 'collecting' || x.status === 'in_transit' || x.status === 'arrived')
      if (act) setDelivery(act.status === 'collecting' ? 'Собираем посылку' : act.status === 'in_transit' ? 'Посылка в пути' : 'Посылка прибыла')
    }).catch(() => {})
    api.leaderboard().then((b) => {
      if (!alive) return
      const me = b.balance.findIndex((r) => r.isMe)
      setPlace(me >= 0 ? me + 1 : null)
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  return { quest, delivery, place }
}

function TasksCard({ dark, onOpenApp }: { dark: boolean; onOpenApp: (a: AppKey) => void }) {
  const t = useTasks()
  const rows: { key: string; text: string; done: boolean }[] = []
  if (t.quest) rows.push({ key: 'q', text: `${t.quest.title} · ${t.quest.progress}/${t.quest.target}`, done: t.quest.progress >= t.quest.target })
  if (t.delivery) rows.push({ key: 'd', text: t.delivery, done: t.delivery.includes('прибыл') })
  if (t.place) rows.push({ key: 'p', text: `Топ площадки: ${t.place} место`, done: false })

  return (
    <div className={`flex min-w-0 flex-1 flex-col rounded-[24px] p-3.5 ${dark ? 'bg-white/[0.10] ring-1 ring-white/[0.08]' : `bg-white/85 ring-1 ring-black/[0.04] ${GLASS_CARD}`}`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className={`shrink-0 text-[14px] font-semibold ${dark ? 'text-white' : TXT_PRIMARY}`}>Задачи</p>
        <button
          type="button"
          onClick={() => onOpenApp('career')}
          className="flex min-h-[44px] min-w-0 shrink-0 items-center gap-0.5 whitespace-nowrap py-1 text-[13px] font-medium text-[#0A84FF] outline-none"
        >
          Смотреть все
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 flex flex-1 flex-col justify-between gap-1.5">
        {rows.length === 0 && (
          <p className={`text-[12px] leading-tight ${dark ? 'text-white/45' : TXT_TERTIARY}`}>На сегодня всё свободно</p>
        )}
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex size-[17px] shrink-0 items-center justify-center rounded-full ${
                r.done ? 'bg-[#0A84FF] text-white shadow-[0_4px_10px_rgba(10,132,255,0.35)]' : dark ? 'bg-white/15' : 'bg-black/[0.08]'
              }`}
            >
              {r.done && (
                <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12.5 L9.5 18 L20 6.5" />
                </svg>
              )}
            </span>
            <span className={`truncate text-[12.5px] font-medium leading-tight ${dark ? 'text-white/85' : TXT_PRIMARY}`}>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Медиа-карточка пункта управления ────────────────────────────────────────
function MediaCard({ dark, onOpenApp }: { dark: boolean; onOpenApp: (a: AppKey) => void }) {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)

  return (
    <div className={`flex min-w-0 flex-1 flex-col rounded-[24px] p-3.5 ${dark ? 'bg-white/[0.10] ring-1 ring-white/[0.08]' : `bg-white/85 ring-1 ring-black/[0.04] ${GLASS_CARD}`}`}>
      {current ? (
        <>
          <button
            type="button"
            onClick={() => onOpenApp('music')}
            className="flex min-h-[44px] min-w-0 items-center gap-2.5 text-left outline-none"
            aria-label={`Открыть музыку: ${current.title} — ${current.artist}`}
          >
            <span className="relative size-11 shrink-0 overflow-hidden rounded-[12px] bg-neutral-100 ring-1 ring-black/[0.04]">
              {current.artworkSmall ? <img loading="lazy" decoding="async" src={current.artworkSmall} alt="" className="h-full w-full object-cover" /> : null}
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-[14px] font-semibold leading-tight ${dark ? 'text-white' : TXT_PRIMARY}`}>{current.title}</span>
              <span className={`block truncate text-[13px] leading-tight ${dark ? 'text-white/55' : TXT_SECOND}`}>{current.artist}</span>
            </span>
          </button>
          <div className={`mt-2 flex items-center justify-around border-t pt-1.5 ${dark ? 'border-white/[0.06]' : 'border-black/[0.05]'}`}>
            <button type="button" aria-label="Предыдущий трек" onClick={prev} className={`flex size-10 items-center justify-center rounded-full outline-none transition-transform active:scale-90 ${dark ? 'text-white/90' : 'text-[#111114]'}`}>
              <SkipBack className="size-5" fill="currentColor" aria-hidden="true" />
            </button>
            <button type="button" aria-label={isPlaying ? 'Пауза' : 'Продолжить'} onClick={toggle} className={`flex size-10 items-center justify-center rounded-full outline-none transition-transform active:scale-90 ${dark ? 'text-white' : 'text-[#111114]'}`}>
              {isPlaying ? <Pause className="size-5" fill="currentColor" aria-hidden="true" /> : <Play className="size-5 translate-x-[1px]" fill="currentColor" aria-hidden="true" />}
            </button>
            <button type="button" aria-label="Следующий трек" onClick={next} className={`flex size-10 items-center justify-center rounded-full outline-none transition-transform active:scale-90 ${dark ? 'text-white/90' : 'text-[#111114]'}`}>
              <SkipForward className="size-5" fill="currentColor" aria-hidden="true" />
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => onOpenApp('music')} className="flex min-h-[44px] flex-1 items-center gap-2.5 text-left outline-none">
          <span className={`flex size-11 shrink-0 items-center justify-center rounded-[12px] ${dark ? 'bg-white/10' : 'bg-black/[0.06]'}`}>
            <MusicNoteGlyph dark={dark} />
          </span>
          <span className="min-w-0">
            <span className={`block text-[14px] font-semibold leading-tight ${dark ? 'text-white' : TXT_PRIMARY}`}>Музыка</span>
            <span className={`block text-[13px] leading-tight ${dark ? 'text-white/55' : TXT_SECOND}`}>Ничего не играет</span>
          </span>
        </button>
      )}
    </div>
  )
}

function MusicNoteGlyph({ dark }: { dark: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-5 ${dark ? 'text-white/70' : 'text-neutral-500'}`} fill="currentColor" aria-hidden="true">
      <path d="M9 18.5V6.8l9-2v10.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="18.5" r="2.2" />
      <circle cx="16" cy="15.2" r="2.2" />
    </svg>
  )
}

// ─── Шторка ──────────────────────────────────────────────────────────────────

/** Императивный API живого вытягивания шторки за палец (зоны статус-бара). */
export interface ShadeHandle {
  /** Начать жест вытягивания; false — шторка уже открыта, жест не наш. */
  beginPull: (mode: 'notif' | 'qs') => boolean
  /** Палец движется вниз: dy от старта жеста, px — шторка следует за ним. */
  pullTo: (dy: number) => void
  /** Палец отпущен: дорешиваем «открыть / отпустить» по дистанции и скорости. */
  endPull: (dy: number, vy: number) => void
}

const PULL_DIST = 260 // px пальца — полное вытягивание шторки

interface ShadeProps {
  open: boolean
  /** true — открыть сразу в центре управления (правая зона статус-бара) */
  qs?: boolean
  onClose: () => void
  onOpenApp: (app: AppKey) => void
  /** Жест вытягивания дошёл до «открыть» — страница ставит open+qs. */
  onCommitOpen?: (mode: 'notif' | 'qs') => void
}

const ShadeImpl = forwardRef<ShadeHandle, ShadeProps>(function Shade(
  { open, qs, onClose, onOpenApp, onCommitOpen },
  ref,
) {
  const flashlight = useOS((s) => s.flashlight)
  const setFlashlight = useOS((s) => s.setFlashlight)
  const dnd = useOS((s) => s.dnd)
  const setDnd = useOS((s) => s.setDnd)
  const charging = useOS((s) => s.charging)
  const setCharging = useOS((s) => s.setCharging)
  const batteryReal = useOS((s) => s.batteryReal)
  const battery = useOS((s) => s.battery)
  const brightness = useOS((s) => s.brightness)
  const setBrightness = useOS((s) => s.setBrightness)
  const pushToast = useOS((s) => s.pushToast)
  const theme = useOS((s) => s.theme)
  const toggleTheme = useOS((s) => s.toggleTheme)
  const volume = useVolume((s) => s.volume)
  const setVolume = useVolume((s) => s.setVolume)
  const now = useClock(open)
  const dark = theme === 'dark'
  const w = useMemo(() => weatherNow(0), [])

  const wifiOn = usePrefs((s) => s.wifi)
  const btOn = usePrefs((s) => s.bt)
  const rotateOn = usePrefs((s) => s.rotate)
  const setPref = usePrefs((s) => s.setPref)

  // Режим QS: открыть в центре управления, если шторку вызвали из правой зоны.
  const [expanded, setExpanded] = useState(!!qs)
  const [pulling, setPulling] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setExpanded(!!qs)
    else setPulling(false) // закрыли обычным путём — сброс жеста (render-phase, без эффекта)
  }

  // ─── Живое вытягивание за палец (зоны статус-бара, см. page.tsx) ───────────
  // Шторка следует за пальцем от статус-бара: transform пишется прямо в DOM
  // (без ре-рендеров), на отпускание решаем «открыть / отпустить» по дистанции
  // и скорости флика.
  const sectionRef = useRef<HTMLElement | null>(null)
  const scrimRef = useRef<HTMLButtonElement | null>(null)
  const settleTimer = useRef(0)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])
  useEffect(() => () => window.clearTimeout(settleTimer.current), [])
  const pullModeRef = useRef<'notif' | 'qs'>('notif')
  const onCommitOpenRef = useRef(onCommitOpen)
  useEffect(() => {
    onCommitOpenRef.current = onCommitOpen
  })

  // Сброс inline-стилей жеста: возвращаем управление CSS-классам
  const clearPullStyles = useCallback(() => {
    const el = sectionRef.current
    const sc = scrimRef.current
    if (el) {
      el.style.transition = ''
      el.style.transform = ''
      el.style.willChange = ''
    }
    if (sc) {
      sc.style.transition = ''
      sc.style.opacity = ''
    }
  }, [])

  const beginPull = useCallback(
    (mode: 'notif' | 'qs'): boolean => {
      if (openRef.current) return false // уже открыта — зона не при делах
      window.clearTimeout(settleTimer.current)
      pullModeRef.current = mode
      setExpanded(mode === 'qs')
      setPulling(true)
      const el = sectionRef.current
      const sc = scrimRef.current
      if (el) {
        el.style.transition = 'none'
        el.style.transform = 'translateY(-102%)'
        el.style.willChange = 'transform'
      }
      if (sc) {
        sc.style.transition = 'none'
        sc.style.opacity = '0'
      }
      return true
    },
    [],
  )

  const pullTo = useCallback((dy: number) => {
    const el = sectionRef.current
    if (!el) return
    const p = Math.max(0, Math.min(1, dy / PULL_DIST))
    // лёгкая «резинка» в начале: пальцу проще схватить шторку
    const eased = p * (0.72 + 0.28 * p)
    el.style.transform = `translateY(${(-102 + 102 * eased).toFixed(2)}%)`
    const sc = scrimRef.current
    if (sc) sc.style.opacity = (0.35 * eased).toFixed(3)
  }, [])

  const endPull = useCallback(
    (dy: number, vy: number) => {
      const el = sectionRef.current
      const sc = scrimRef.current
      // Это был просто тап — мгновенно отдаём управление CSS-классам,
      // чтобы onClick открыл шторку штатным переходом без задержек.
      if (Math.abs(dy) < 6 && Math.abs(vy) < 0.25) {
        clearPullStyles()
        setPulling(false)
        return
      }
      const p = Math.max(0, Math.min(1, dy / PULL_DIST))
      const commit = dy > 64 || (p > 0.18 && vy > 0.42)
      if (el) {
        el.style.transition = 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)'
        el.style.transform = commit ? 'translateY(0%)' : 'translateY(-102%)'
      }
      if (sc) {
        sc.style.transition = 'opacity 300ms ease'
        sc.style.opacity = commit ? '1' : '0'
      }
      if (commit) {
        sound.swipe()
        onCommitOpenRef.current?.(pullModeRef.current)
      }
      settleTimer.current = window.setTimeout(() => {
        clearPullStyles()
        if (!commit) setPulling(false)
      }, 420)
    },
    [clearPullStyles],
  )

  useImperativeHandle(
    ref,
    () => ({ beginPull, pullTo, endPull }),
    [beginPull, pullTo, endPull],
  )

  const toggleFlash = async () => {
    const next = !flashlight
    const res = await setTorch(next)
    setFlashlight(next)
    if (next) {
      pushToast('Фонарик', res.real ? 'Вспышка включена на устройстве' : 'Устройство без вспышки — светим виртуально')
    }
  }

  const toggleDnd = () => {
    setDnd(!dnd)
    pushToast('Не беспокоить', !useOS.getState().dnd ? 'Тосты снова всплывают' : 'Уведомления копятся в центре')
  }

  // Свайп вверх закрывает шторку; вниз в режиме уведомлений — центр управления.
  const gripDrag = useDrag({
    ignoreWithin: 'button, input',
    onEnd: (_dx, dy) => {
      if (!expanded && dy > 36) {
        setExpanded(true)
      } else if (expanded && dy < -36) {
        setExpanded(false)
      }
    },
  })
  const closeDrag = useDrag({
    onEnd: (_dx, dy, fling) => {
      if (dy < -36 || fling.vy < -0.55) {
        sound.swipe()
        onClose()
      }
    },
  })
  // iOS-поведение: свайп вверх из ЛЮБОГО свободного места закрывает шторку.
  // УМНЫЙ ДЕТЕКТ: контролы защищены всегда; внутри data-shade-scroll жест
  // остаётся нативному скроллу ТОЛЬКО когда списку есть куда скроллить —
  // иначе (контент помещается) свайп вверх из карточки тоже закрывает.
  const sectionCloseDrag = useDrag({
    onStart: (e) => {
      const t = e.target as Element | null
      if (t?.closest?.('button, input, [role="slider"]')) return false
      const sc = t?.closest?.('[data-shade-scroll]') as HTMLElement | null
      if (sc && sc.scrollHeight > sc.clientHeight + 4) return false
    },
    onEnd: (_dx, dy, fling) => {
      if (dy < -36 || fling.vy < -0.55) {
        sound.swipe()
        onClose()
      }
    },
  })
  // Список уведомлений: если контент помещается без скролла — свайп вверх тоже
  // закрывает шторку; если скроллится — жест остаётся скроллом.
  const listRef = useRef<HTMLDivElement | null>(null)
  const listCanScroll = useRef(false)
  const listCloseDrag = useDrag({
    onStart: () => {
      const el = listRef.current
      listCanScroll.current = !!el && el.scrollHeight > el.clientHeight + 4
    },
    onEnd: (_dx, dy, fling) => {
      if (!listCanScroll.current && (dy < -36 || fling.vy < -0.55)) {
        sound.swipe()
        onClose()
      }
    },
  })

  const BRIGHT_MIN = 0.4
  const BRIGHT_SPAN = 0.6
  const brightNorm = (brightness - BRIGHT_MIN) / BRIGHT_SPAN

  // key для переигрывания вступительных анимаций (стабилен во время жеста
  // вытягивания, чтобы контент не перемонтировался в момент commit)
  const animKey = open || pulling ? (expanded ? 'cc' : 'notif') : 'closed'

  return (
    <div className={`pointer-events-none absolute inset-0 z-55 ${open || pulling ? '' : 'invisible'}`}>
      {/* скрим */}
      <button
        ref={scrimRef}
        type="button"
        aria-label="Закрыть шторку"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/35 transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'opacity-0'
        }`}
      />

      {/* панель на весь экран; ЦУ живёт плавающей карточкой со скруглением 34px */}
      <section
        ref={sectionRef}
        aria-label={expanded ? 'Центр управления' : 'Уведомления'}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        {...sectionCloseDrag}
        className={`pointer-events-auto absolute inset-0 flex flex-col backdrop-blur-2xl transition-[transform,background-color] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          expanded
            ? dark
              ? 'bg-black/30'
              : 'bg-black/[0.12]'
            : dark
              ? 'bg-[#0B0D10]/[0.94] text-white'
              : 'bg-[#EFF0F3]/[0.88] text-neutral-900'
        } ${open ? 'translate-y-0' : '-translate-y-[102%]'}`}
      >
        {expanded ? (
          /* ─────────── ЦЕНТР УПРАВЛЕНИЯ ─────────── */
          <div
            key={animKey}
            className={`sheet-rise mx-3 mb-3 mt-12 flex max-h-[calc(100%-60px)] min-h-0 flex-initial flex-col overflow-hidden rounded-[34px] shadow-2xl ring-1 ${
              // вложенный backdrop-blur-3xl убран: секция уже блюрит фон, двойной
              // блюр пересэмплируется каждый кадр жеста и просаживает fps на телефонах
              dark ? 'bg-[#1B1D22]/[0.9] text-white ring-white/[0.10]' : `bg-white/[0.88] ${TXT_PRIMARY} ring-black/[0.06]`
            }`}
          >
            <div data-shade-scroll className="flex min-h-0 flex-initial flex-col overflow-y-auto px-3 pb-1 pt-2 [scrollbar-width:none]">
            {/* статус-строка */}
            <div className="flex items-center justify-between px-2 pb-3">
              <span className={`text-[12.5px] font-semibold ${dark ? 'text-white/70' : TXT_SECOND}`} suppressHydrationWarning>
                {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
              </span>
              <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${dark ? 'text-white/70' : TXT_SECOND}`}>
                {wifiOn ? <Wifi className="size-3.5" aria-hidden="true" /> : <WifiOff className="size-3.5" aria-hidden="true" />}
                Resale OS
              </span>
            </div>

            {/* кружки связи/режимов */}
            <div {...gripDrag} className="grid touch-none grid-cols-4 gap-2 px-1">
              <Circle active={wifiOn} label="Wi-Fi" onClick={() => setPref('wifi', !wifiOn)}>
                <Wifi className="size-5" aria-hidden="true" />
              </Circle>
              <Circle active={btOn} label="Bluetooth" onClick={() => setPref('bt', !btOn)}>
                <Bluetooth className="size-5" aria-hidden="true" />
              </Circle>
              <Circle active={dnd} label="Не беспокоить" onClick={toggleDnd}>
                <MoonStar className="size-5" aria-hidden="true" />
              </Circle>
              <Circle active={rotateOn} label="Автоповорот" onClick={() => setPref('rotate', !rotateOn)}>
                <RotateCw className="size-5" aria-hidden="true" />
              </Circle>
            </div>

            {/* медиа + слайдеры */}
            <div className="mt-2.5 flex items-stretch gap-2 px-1">
              <MediaCard dark={dark} onOpenApp={(a) => { onClose(); onOpenApp(a) }} />
              <div className="flex gap-2">
                <VSlider
                  value={brightNorm}
                  onChange={(v) => setBrightness(BRIGHT_MIN + v * BRIGHT_SPAN)}
                  label="Яркость"
                  icon={<Sun className="size-5" aria-hidden="true" />}
                  dark={dark}
                />
                <VSlider
                  value={volume}
                  onChange={setVolume}
                  label="Громкость"
                  icon={<Volume2 className="size-5" aria-hidden="true" />}
                  dark={dark}
                />
              </div>
            </div>

            {/* погода + задачи */}
            <div className="mt-2.5 flex items-stretch gap-2 px-1">
              <button
                type="button"
                aria-label="Открыть погоду"
                onClick={() => { onClose(); onOpenApp('weather') }}
                className={`flex w-[46%] shrink-0 flex-col rounded-[24px] p-3.5 text-left outline-none transition-transform duration-150 active:scale-[0.98] ${dark ? 'bg-white/[0.10] ring-1 ring-white/[0.08]' : `bg-white/85 ring-1 ring-black/[0.04] ${GLASS_CARD}`}`}
              >
                <span className="flex items-center gap-2">
                  <CondGlyph cond={w.cond} className="size-6" />
                  <span className={`text-[13px] font-semibold ${dark ? 'text-white' : TXT_PRIMARY}`}>{w.city}</span>
                </span>
                <span className={`mt-1.5 text-[26px] font-semibold leading-none tracking-tight ${dark ? 'text-white' : TXT_PRIMARY}`}>{fmtDeg(w.temp)}</span>
                <span className={`mt-1.5 text-[12px] leading-tight ${dark ? 'text-white/55' : TXT_SECOND}`}>{w.cond}</span>
                <span className={`mt-0.5 text-[12px] font-medium tabular-nums ${dark ? 'text-white/55' : TXT_SECOND}`}>
                  ↑ {fmtDeg(w.tMax)} ↓ {fmtDeg(w.tMin)}
                </span>
              </button>
              <TasksCard dark={dark} onOpenApp={(a) => { onClose(); onOpenApp(a) }} />
            </div>

            {/* не беспокоить + заряд */}
            <div className="mt-2.5 grid grid-cols-2 gap-2 px-1">
              <button
                type="button"
                aria-pressed={dnd}
                onClick={toggleDnd}
                className={`flex items-center gap-3 rounded-full py-2.5 pl-3 pr-2.5 text-left outline-none transition-all duration-200 active:scale-[0.98] ${dark ? 'bg-white/[0.10] ring-1 ring-white/[0.08]' : `bg-white/85 ring-1 ring-black/[0.04] ${GLASS_CARD}`}`}
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white ${dnd ? 'shadow-[0_6px_14px_rgba(94,92,230,0.45)]' : ''} ${dnd ? 'bg-[#4543B8]' : 'bg-[#5E5CE6]'}`}>
                  <Moon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] font-semibold leading-tight ${dark ? 'text-white' : TXT_PRIMARY}`}>Не беспокоить</span>
                  <span className={`block truncate text-[12px] leading-tight ${dark ? 'text-white/55' : TXT_SECOND}`}>{dnd ? 'Включено' : 'Выключено'}</span>
                </span>
                <ChevronRight className={`size-4 shrink-0 ${dark ? 'text-white/40' : TXT_TERTIARY}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => { if (!batteryReal) setCharging(!charging) }}
                aria-label={charging ? 'Отключить зарядку' : 'Подключить зарядку'}
                className={`flex items-center gap-3 rounded-full py-2.5 pl-3 pr-2.5 text-left outline-none transition-all duration-200 active:scale-[0.98] ${dark ? 'bg-white/[0.10] ring-1 ring-white/[0.08]' : `bg-white/85 ring-1 ring-black/[0.04] ${GLASS_CARD}`}`}
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-[#34C759]/20 text-[#5BE08A]' : 'bg-[#34C759]/15 text-[#1F9D48]'}`}>
                  {charging ? <BatteryCharging className="size-4" aria-hidden="true" /> : <BatteryFull className="size-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[14px] font-semibold leading-tight ${dark ? 'text-white' : TXT_PRIMARY}`}>Заряд</span>
                  <span className={`block text-[12px] leading-tight tabular-nums ${dark ? 'text-white/55' : TXT_SECOND}`}>{Math.round(battery)}%</span>
                </span>
              </button>
            </div>

            {/* нижний ряд кнопок */}
            <div className="mt-2.5 grid grid-cols-4 gap-2 px-1 pb-1">
              {[
                {
                  key: 'flash',
                  label: 'Фонарик',
                  active: flashlight,
                  icon: <Flashlight className="size-5" aria-hidden="true" />,
                  run: () => void toggleFlash(),
                },
                {
                  key: 'timer',
                  label: 'Таймер',
                  active: false,
                  icon: <Timer className="size-5" aria-hidden="true" />,
                  run: () => { onClose(); onOpenApp('clock') },
                },
                {
                  key: 'theme',
                  label: 'Тёмный режим',
                  active: dark,
                  icon: dark ? <Moon className="size-5" aria-hidden="true" /> : <Sun className="size-5" aria-hidden="true" />,
                  run: () => {
                    toggleTheme()
                    pushToast('Тема ОС', useOS.getState().theme === 'dark' ? 'Тёмная тема включена' : 'Светлая тема включена')
                  },
                },
                {
                  key: 'rotate',
                  label: 'Поворот экрана',
                  active: rotateOn,
                  icon: <RotateCw className="size-5" aria-hidden="true" />,
                  run: () => setPref('rotate', !rotateOn),
                },
              ].map((b) => (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={b.active}
                  onClick={b.run}
                  className="flex flex-col items-center gap-1.5 rounded-[20px] py-1 outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                >
                  <span
                    className={`flex size-[52px] items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
                      b.active
                        ? 'bg-[#0A84FF] text-white shadow-[0_6px_14px_rgba(10,132,255,0.35)]'
                        : dark
                          ? 'bg-white/[0.12] text-white'
                          : 'bg-white/85 text-[#111114] ring-1 ring-black/[0.04] shadow-[0_8px_20px_-14px_rgba(15,23,42,0.35)]'
                    }`}
                  >
                    {b.icon}
                  </span>
                  <span className={`text-center text-[11px] font-medium leading-tight ${dark ? 'text-white/75' : 'text-[rgba(60,60,67,0.62)]'}`}>{b.label}</span>
                </button>
              ))}
            </div>

            </div>
            {/* зона закрытия */}
            <button
              type="button"
              aria-label="Закрыть центр управления"
              onClick={onClose}
              {...closeDrag}
              className={`mx-auto mb-2 mt-2 flex h-9 w-40 shrink-0 items-center justify-center rounded-full outline-none ${dark ? 'bg-white/15' : 'bg-black/[0.08]'}`}
            >
              <span aria-hidden="true" className={`block h-1 w-12 rounded-full ${dark ? 'bg-white/50' : 'bg-neutral-500/60'}`} />
            </button>
          </div>
        ) : (
          /* ─────────── УВЕДОМЛЕНИЯ ─────────── */
          <>
            <div key={animKey} className="shrink-0 px-5 pb-1 pt-4">
              <p className={`text-[34px] font-medium leading-none tracking-[-0.02em] tabular-nums ${dark ? 'text-white' : 'text-neutral-900'}`} suppressHydrationWarning>
                {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
              </p>
              <p className={`mt-1.5 text-[12.5px] font-medium ${dark ? 'text-white/55' : 'text-neutral-500'}`} suppressHydrationWarning>
                {now ? now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) : '\u00A0'}
              </p>
            </div>
            <div data-shade-scroll ref={listRef} {...listCloseDrag} className="min-h-0 flex-1 overflow-y-auto pb-3 pt-2 [scrollbar-width:none]">
              <NotificationList tone={dark ? 'dark' : 'light'} onOpenApp={(a) => { onClose(); onOpenApp(a) }} />
            </div>
            <button
              type="button"
              aria-label="Свернуть уведомления"
              onClick={onClose}
              {...closeDrag}
              className={`mx-auto mb-2 flex h-9 w-40 shrink-0 items-center justify-center rounded-full outline-none ${dark ? 'bg-white/15' : 'bg-neutral-900/10'}`}
            >
              <span aria-hidden="true" className={`block h-1 w-12 rounded-full ${dark ? 'bg-white/50' : 'bg-neutral-500/60'}`} />
            </button>
          </>
        )}
      </section>
    </div>
  )
})

// memo: page.tsx ре-рендерится на тиках батареи/онлайна — шторка не должна
// перевычислять своё дерево вместе с ними
const Shade = memo(ShadeImpl)
export default Shade
