'use client'

// Экран блокировки «Resale OS» по фирменному макету (зона 55-a): светлые
// «шёлковые» обои, дата над тонкими огромными часами, матовые стеклянные
// карточки уведомлений с настоящими иконками приложений и два круглых
// shortcut'а внизу (фонарик — реальный toggle, камера — открывает галерею).
// Тон интерфейса подстраивается под обои: светлые обои — графитовые тексты
// и белое стекло, тёмные — как раньше. Разблокировка: свайп вверх, тап,
// Enter или пробел. Никаких паролей — это смартфон в игре.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Camera, Flashlight, MoonStar, Pause, Play, SkipForward } from 'lucide-react'
import { useOS } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { sound } from '@/lib/sound'
import { api } from '@/lib/api'
import { fmtMoney, timeAgo } from '@/lib/format'
import { setTorch } from '@/lib/torch'
import { wallpaperById, wallpaperClass } from '@/lib/wallpapers'
import { useDrag } from '@/lib/use-swipe'
import { KIND_APP } from './notif-meta'
import { APP_TILE, AppTileImage } from './app-logos'

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

const LEAVE_ANIMATION_MS = 420
const MAX_PREVIEWS = 3 // до трёх превью на локскрине

// Пустой subscribe: mounted-гейт против hydration mismatch (player читает
// localStorage на клиенте — на сервере current всегда null).
const emptySubscribe = () => () => {}

// Суммы внутри текста уведомления — фирменный зелёный по макету.
// fmtMoney даёт «12 500 ₽» (пробелы/NBSP между разрядами), плюс «-12 500 ₽».
const MONEY_SPLIT = /(-?\d[\d \u00A0\u202F]*\u00A0?₽)/g
function MoneyText({ text, moneyClass }: { text: string; moneyClass: string }) {
  const parts = text.split(MONEY_SPLIT)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className={moneyClass}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  )
}

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const dnd = useOS((s) => s.dnd)
  const notifications = useOS((s) => s.notifications)
  const session = useOS((s) => s.session)
  const flashlight = useOS((s) => s.flashlight)
  const setFlashlight = useOS((s) => s.setFlashlight)
  const pushToast = useOS((s) => s.pushToast)
  const wallpaper = useOS((s) => s.wallpaper)
  const theme = useOS((s) => s.theme)
  const dark = theme === 'dark'
  const wall = wallpaperById(wallpaper)
  const lightTone = !!wall.light && !dark

  const now = useClock()
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const timerRef = useRef(0)
  const [day, setDay] = useState<{ deals: number; net: number } | null>(null)

  // свайп вверх с «следованиями за пальцем/мышью»: работает и на телефоне, и на ПК.
  // Перф: transform/opacity пишутся напрямую в DOM (ref) — ре-рендера на каждый
  // pointermove нет. Внутри списка уведомлений жест не стартует — там живёт
  // нативный скролл (data-lock-scroll + touch-action: pan-y на корне).
  const rootRef = useRef<HTMLDivElement>(null)
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

  // уход экрана вверх при разблокировке (императивно — transform уже в DOM)
  useEffect(() => {
    if (!leaving) return
    const el = rootRef.current
    if (el) {
      el.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 380ms ease'
      el.style.transform = 'translateY(-100%)'
      el.style.opacity = '0.35'
      el.style.willChange = 'auto'
    }
  }, [leaving])

  // Камера shortcut: разблокируем и открываем галерею (ближайшее к камере в игре)
  const openCamera = useCallback(() => {
    unlock()
    useOS.getState().openApp('gallery')
  }, [unlock])

  const { onPointerDown } = useDrag({
    ignoreWithin: '[data-lock-scroll]',
    onStart: () => {
      if (leavingRef.current) return
      movedRef.current = false
      const el = rootRef.current
      if (el) {
        el.style.transition = 'none'
        el.style.willChange = 'transform, opacity'
      }
    },
    onMove: (dx, dy) => {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) movedRef.current = true
      if (leavingRef.current) return
      const el = rootRef.current
      if (!el) return
      // вверх — следует за пальцем, вниз — заметно ослаблен (упругость)
      const y = dy < 0 ? dy * 0.95 : dy * 0.16
      el.style.transform = `translateY(${y}px)`
      el.style.opacity = String(Math.max(0.55, 1 + y / 460))
    },
    onEnd: (_dx, dy, fling) => {
      const el = rootRef.current
      // флик вверх тоже разблокирует: короткий, но быстрый жест
      if (!leavingRef.current && (dy < -70 || (dy < -30 && fling.vy < -0.4))) {
        unlock()
        return
      }
      if (el) {
        el.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease'
        el.style.transform = 'translateY(0px)'
        el.style.opacity = '1'
        el.style.willChange = 'auto'
      }
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
  const dealsLabel =
    day && (day.deals === 1 ? 'сделка' : day.deals < 5 ? 'сделки' : 'сделок')

  // Токены тона (55-a: матовое стекло + графит по макету)
  const T = lightTone
    ? {
        date: 'text-[rgba(20,20,22,0.72)]',
        clock: 'text-[#0F0F12]',
        notifLabel: 'text-[rgba(60,60,67,0.6)]',
        card: 'bg-white/70 ring-1 ring-black/[0.05] shadow-[0_8px_24px_rgba(15,15,20,0.08)] backdrop-blur-2xl',
        cardTitle: 'text-[#111111]',
        cardBody: 'text-[rgba(60,60,67,0.78)]',
        cardTime: 'text-[rgba(60,60,67,0.6)]',
        more: 'text-[rgba(60,60,67,0.45)]',
        money: 'font-semibold text-[#34C759]',
        moneyNeg: 'font-semibold text-[#FF3B30]',
        hint: 'text-[rgba(60,60,67,0.5)]',
        shortcut: 'bg-white/60 text-[#111111] ring-1 ring-black/[0.06] shadow-sm backdrop-blur-xl',
        shortcutOn: 'bg-neutral-900 text-white shadow-md',
        handle: 'bg-[#111111]/40',
        dnd: 'text-[rgba(60,60,67,0.55)]',
      }
    : {
        date: 'text-white/85',
        clock: 'text-white',
        notifLabel: 'text-white/55',
        card: 'bg-white/[0.10] ring-1 ring-white/[0.12] shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-2xl',
        cardTitle: 'text-white',
        cardBody: 'text-white/70',
        cardTime: 'text-white/50',
        more: 'text-white/45',
        money: 'font-semibold text-[#30D158]',
        moneyNeg: 'font-semibold text-[#FF453A]',
        hint: 'text-white/55',
        shortcut: 'bg-white/[0.12] text-white ring-1 ring-white/[0.14] shadow-sm backdrop-blur-xl',
        shortcutOn: 'bg-white text-neutral-900 shadow-[0_0_28px_rgba(255,251,214,0.45)]',
        handle: 'bg-white/50',
        dnd: 'text-white/55',
      }

  return (
    <div
      ref={rootRef}
      className={`absolute inset-0 z-50 cursor-pointer overflow-hidden select-none ${wallpaperClass(wallpaper)}`}
      role="dialog"
      aria-label="Экран блокировки — проведите вверх или коснитесь, чтобы открыть"
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{ touchAction: 'pan-y' }}
    >
      {/* мягкая вуаль поверх обоев для читаемости */}
      {!lightTone && (
        <div aria-hidden="true" className={`absolute inset-0 ${dark && wall.light ? 'bg-[#0B0C0E]/[0.86]' : 'bg-[#050d09]/55'}`} />
      )}
      {lightTone && <div aria-hidden="true" className="absolute inset-0 bg-white/5" />}

      <div className="relative z-10 flex h-full flex-col px-5 pb-4 pt-14">
        {/* ─── Дата + тонкие часы по макету ─── */}
        <div className="shrink-0 text-center" suppressHydrationWarning>
          <p className={`text-[16px] font-medium ${T.date}`}>
            {now ? now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) : '\u00A0'}
          </p>
          <p className={`os-thin-clock mt-2 text-[96px] ${T.clock}`}>
            {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
          </p>
        </div>

        {/* Режим «Не беспокоить» — одна короткая строка */}
        {dnd && (
          <p className={`mt-1 flex shrink-0 items-center justify-center gap-1.5 text-[11px] ${T.dnd}`}>
            <MoonStar className="size-3.5" aria-hidden="true" />
            Не беспокоить включён
          </p>
        )}

        {/* ─── Уведомления, итоги дня и медиа ─── */}
        <div data-lock-scroll className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto [scrollbar-width:none]">
          {unreadCount > 0 && (
            <p className={`text-center text-[13px] font-medium ${T.notifLabel}`}>Уведомления</p>
          )}
          {previews.map((n) => {
            const meta = KIND_APP[n.kind] ?? KIND_APP.system
            const NotifIcon = meta.icon
            const tile = APP_TILE[meta.openApp]
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-[22px] p-3 ${T.card}`}
              >
                {/* настоящая иконка приложения (PNG из фирменного пака) на плитке */}
                <span
                  aria-hidden="true"
                  className="relative size-[38px] shrink-0 overflow-hidden rounded-[11px] shadow-[0_3px_8px_rgba(15,15,20,0.22)]"
                  style={{ background: tile.background }}
                >
                  <NotifIcon className="absolute inset-0 m-auto size-[18px] text-white" />
                  <AppTileImage app={meta.openApp} className="absolute inset-0 h-full w-full" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate text-[14px] font-semibold leading-tight ${T.cardTitle}`}>{n.title}</p>
                    <span className={`shrink-0 text-[12px] tabular-nums ${T.cardTime}`}>{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className={`mt-0.5 line-clamp-2 text-[13px] leading-snug ${T.cardBody}`}>
                    <MoneyText text={n.body} moneyClass={T.money} />
                  </p>
                </div>
              </div>
            )
          })}

          {/* «ещё N» — если уведомлений больше трёх */}
          {moreCount > 0 && (
            <p className={`pt-0.5 text-center text-[12px] font-medium ${T.more}`}>
              Ещё {moreCount} {notifWord(moreCount)}
            </p>
          )}

          {/* Итоги дня (если сегодня были сделки) */}
          {day && dealsLabel && (
            <div className={`flex items-start gap-3 rounded-[22px] p-3 ${T.card}`}>
              <span
                aria-hidden="true"
                className="relative size-[38px] shrink-0 overflow-hidden rounded-[11px] shadow-[0_3px_8px_rgba(15,15,20,0.22)]"
                style={{ background: APP_TILE.avito.background }}
              >
                <AppTileImage app="avito" className="absolute inset-0 h-full w-full" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[14px] font-semibold leading-tight ${T.cardTitle}`}>Сегодня в Resale</p>
                <p className={`mt-0.5 truncate text-[13px] leading-snug ${T.cardBody}`}>
                  {day.deals} {dealsLabel} ·{' '}
                  <span className={day.net >= 0 ? T.money : T.moneyNeg}>
                    {day.net >= 0 ? '+' : ''}
                    {fmtMoney(day.net)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Медиа: управление плеером без разблокировки телефона */}
          <LockMedia light={lightTone} />
        </div>

        {/* ─── Низ: подсказка, круглые shortcut'ы и home-индикатор ─── */}
        <div className="shrink-0 pt-4">
          <p className={`text-center text-[13px] font-medium ${T.hint}`}>Проведите вверх, чтобы открыть</p>
          <div className="mt-4 flex items-center justify-between px-2">
            <button
              type="button"
              aria-label={flashlight ? 'Выключить фонарик' : 'Включить фонарик'}
              aria-pressed={flashlight}
              onClick={(e) => {
                e.stopPropagation()
                void toggleFlash()
              }}
              className={`flex size-[52px] items-center justify-center rounded-full outline-none transition-transform duration-200 active:scale-90 focus-visible:ring-2 focus-visible:ring-black/30 ${
                flashlight ? T.shortcutOn : T.shortcut
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
              className={`flex size-[52px] items-center justify-center rounded-full outline-none transition-transform duration-200 active:scale-90 focus-visible:ring-2 focus-visible:ring-black/30 ${T.shortcut}`}
            >
              <Camera className="size-6" aria-hidden="true" />
            </button>
          </div>
          {/* home-индикатор */}
          <span
            aria-hidden="true"
            className={`handle-breathe mx-auto mt-5 block h-1 w-28 rounded-full ${T.handle}`}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Медиа-карточка локскрина: что играет — видно даже с заблокированного ──
function LockMedia({ light }: { light: boolean }) {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  if (!mounted || !current) return null
  const card = light
    ? 'bg-white/70 ring-1 ring-black/[0.05] shadow-[0_8px_24px_rgba(15,15,20,0.08)] backdrop-blur-2xl'
    : 'bg-white/[0.10] ring-1 ring-white/[0.12] shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-2xl'
  const title = light ? 'text-[#111111]' : 'text-white'
  const sub = light ? 'text-[rgba(60,60,67,0.78)]' : 'text-white/65'
  return (
    <div
      className={`flex items-center gap-3 rounded-[22px] p-3 ${card}`}
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
        <p className={`truncate text-[14px] font-semibold leading-tight ${title}`}>{current.title}</p>
        <p className={`mt-0.5 truncate text-[12px] leading-tight ${sub}`}>{current.artist}</p>
      </div>
      <button
        type="button"
        aria-label={isPlaying ? 'Пауза' : 'Продолжить воспроизведение'}
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
        className={`flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-transform duration-150 active:scale-90 ${
          light ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
        }`}
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
        className={`mr-0.5 flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors ${
          light ? 'text-neutral-600 active:bg-black/5' : 'text-white/80 active:bg-white/10'
        }`}
      >
        <SkipForward className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}
