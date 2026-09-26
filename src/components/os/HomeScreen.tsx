'use client'

// Домашний экран «Resale OS»: две страницы, как на настоящем смартфоне.
// Страница 1 — компактные виджеты + основные приложения, страница 2 —
// мини-стрип дня + единая сетка приложений.
// Перелистывание — свайпом: палец на телефоне, зажатая мышь на ПК (Pointer Events).
//
// Перф: свайп НЕ через setState — transform пишется напрямую в DOM (ref),
// ре-рендер происходит один раз при смене страницы. Часы живут в отдельном
// компоненте, поэтому тик раз в секунду не перерисовывает весь лончер.

import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Crown, Mic, Package, Search, Trophy } from 'lucide-react'
import { useOS, type AppKey, type WidgetKey } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import { wallpaperClass } from '@/lib/wallpapers'
import { api } from '@/lib/api'
import { useDrag } from '@/lib/use-swipe'
import AppIcon from './AppIcon'
import MiniPlayer from './MiniPlayer'
import { APP_TILE, DOCK_APPS, PAGE1_APPS, PAGE2_APPS } from './app-logos'
import type { CareerData, DeliveryDTO } from '@/lib/types'

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

const glass = 'rounded-2xl bg-white/[0.14] backdrop-blur-sm'
const WIDGET_CLASS = 'flex min-h-10 items-center gap-2 rounded-2xl bg-white/[0.14] px-3 py-1.5 text-left backdrop-blur-sm outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/70'

// ─── Часы-виджет: тик внутри себя, корень лончера не трогаем ────────────────
const ClockWidget = memo(function ClockWidget() {
  const now = useClock()
  return (
    <div aria-label="Время и дата" className={`${glass} flex min-h-10 flex-col justify-center px-3 py-1`}>
      <p className="text-lg font-semibold leading-none tabular-nums text-white" suppressHydrationWarning>
        {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
      </p>
      <p className="mt-1 text-[9px] leading-none text-white/60" suppressHydrationWarning>
        {now ? now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }) : '\u00A0'}
      </p>
    </div>
  )
})

// ─── Компактные виджеты (одна строка, h-12) ──────────────────────────────────
function Widget({
  w,
  online,
  balance,
  data,
  onOpenApp,
}: {
  w: WidgetKey
  online: number
  balance: number
  data: { quest: { progress: number; target: number } | null; delivery: { status: string } | null }
  onOpenApp: (app: AppKey) => void
}) {
  if (w === 'clock') return <ClockWidget />
  if (w === 'online') {
    return (
      <div aria-label={`Онлайн: ${online}`} className={`${glass} flex min-h-10 items-center gap-2 px-3`}>
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[15px] font-semibold tabular-nums text-white">{online}</span>
      </div>
    )
  }
  if (w === 'wallet') {
    return (
      <button type="button" aria-label="Открыть кошелёк в приложении Банк" onClick={() => onOpenApp('bank')} className={WIDGET_CLASS}>
        <span className="flex flex-col justify-center">
          <span className="block text-[8px] uppercase tracking-wider text-white/55">Кошелёк</span>
          <span className="block text-[13px] font-semibold leading-tight tabular-nums text-white">{fmtMoney(balance)}</span>
        </span>
      </button>
    )
  }
  if (w === 'quest') {
    return (
      <button type="button" aria-label="Открыть задания" onClick={() => onOpenApp('career')} className={WIDGET_CLASS}>
        <Trophy className="size-3.5 shrink-0 text-amber-300" aria-hidden="true" />
        {data.quest ? (
          <span className="text-[12px] font-semibold tabular-nums text-white">{data.quest.progress}/{data.quest.target}</span>
        ) : (
          <span className="text-[10px] text-white/60">Заданий нет</span>
        )}
      </button>
    )
  }
  // delivery
  return (
    <button type="button" aria-label="Открыть доставки" onClick={() => onOpenApp('delivery')} className={WIDGET_CLASS}>
      <Package className="size-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
      {data.delivery ? (
        <span className="text-[10px] font-semibold text-amber-300">{data.delivery.status}</span>
      ) : (
        <span className="text-[10px] text-white/60">Посылок нет</span>
      )}
    </button>
  )
}

// ─── Данные для мини-стрипа страницы 2 ───────────────────────────────────────
function useDayData() {
  const [quest, setQuest] = useState<{ progress: number; target: number; reward: number } | null>(null)
  const [delivery, setDelivery] = useState<{ status: string } | null>(null)
  const [myPlace, setMyPlace] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    api.career().then((c: CareerData) => {
      if (!alive) return
      const q = c.quests.find((x) => !x.claimed && x.progress > 0) ?? c.quests.find((x) => !x.claimed)
      if (q) setQuest({ progress: Math.min(q.progress, q.target), target: q.target, reward: q.reward })
    }).catch(() => {})
    api.deliveries().then((d: { items: DeliveryDTO[] }) => {
      if (!alive) return
      // 28-b: любая «живая» посылка (собираем/в пути/прибыл) — виджет показывает фазу
      const act = d.items.find((x) => x.status === 'collecting' || x.status === 'in_transit' || x.status === 'arrived')
      if (act) {
        const label = act.status === 'collecting' ? 'Собираем' : act.status === 'in_transit' ? 'В пути' : 'Прибыл!'
        setDelivery({ status: label })
      }
    }).catch(() => {})
    api.leaderboard().then((b) => {
      if (!alive) return
      const me = b.balance.findIndex((r) => r.isMe)
      setMyPlace(me >= 0 ? me + 1 : null)
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  return { quest, delivery, myPlace }
}

const SETTLE_EASE = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)'

function HomeScreen({ onOpenApp }: { onOpenApp: (app: AppKey) => void }) {
  const balance = useOS((s) => s.session?.balance ?? 0)
  const unreadChats = useOS((s) => s.unreadChats)
  const online = useOS((s) => s.online)
  const wallpaper = useOS((s) => s.wallpaper)
  const widgets = useOS((s) => s.widgets)
  // «Кошелёк» убран из ОС: дублировал приложение «Банк» (решение юзера).
  // Фильтр нужен, чтобы у старых игроков виджет не приезжал из localStorage.
  const shownWidgets = widgets.filter((w) => w !== 'wallet')
  const day = useDayData()

  // ─── Страницы + свайп (ПК и телефон) ───────────────────────────────────────
  // transform трека пишется НАПРЯМУЮ в DOM во время жеста: React-ре-рендеров
  // на каждый pointermove больше нет — свайп идёт на частоте дисплея.
  const [page, setPage] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const horizRef = useRef(false)
  const movedRef = useRef(false)
  const halfWidthRef = useRef(1)

  const pages = useDrag({
    onStart: () => {
      horizRef.current = false
      movedRef.current = false
      const el = trackRef.current
      halfWidthRef.current = (el?.offsetWidth ?? 2) / 2
      if (el) el.style.transition = 'none'
    },
    onMove: (dx, dy) => {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) movedRef.current = true
      // горизонтальная интенция: включаем только если тянем вбок заметнее, чем вверх
      if (!horizRef.current && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) horizRef.current = true
      if (!horizRef.current) return
      const el = trackRef.current
      if (!el) return
      // сопротивление за краями страниц
      const rubber = (page === 0 && dx > 0) || (page === 1 && dx < 0) ? 0.28 : 1
      const shift = dx * rubber
      // база −page*50% + сдвиг пальцем (в %, чтобы не зависеть от px при ресайзе)
      el.style.transform = `translateX(calc(${-page * 50}% + ${(shift / halfWidthRef.current) * 100}%))`
    },
    onEnd: (dx, _dy, fling) => {
      const el = trackRef.current
      const width = halfWidthRef.current
      const distPct = width > 0 ? dx / width : 0
      // флик по скорости тоже листает: быстрый короткий жест = смена страницы
      const goNext = page === 0 && horizRef.current && (dx <= -56 || distPct <= -0.35 || (dx < -20 && fling.vx < -0.55))
      const goPrev = page === 1 && horizRef.current && (dx >= 56 || distPct >= 0.35 || (dx > 20 && fling.vx > 0.55))
      const next = goNext ? 1 : goPrev ? 0 : page
      if (el) {
        el.style.transition = SETTLE_EASE
        el.style.transform = `translateX(${-next * 50}%)`
      }
      if (next !== page) setPage(next)
    },
  })

  // свайп, начавшийся на иконке, не должен открыть приложение при отпускании
  const guardClick = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = false
    }
  }

  return (
    <div
      className={`absolute inset-0 flex flex-col pt-12 select-none ${wallpaperClass(wallpaper)}`}
      role="region"
      aria-label="Домашний экран"
    >
      {/* скрим сверху — читаемость статус-бара на светлых/фото-обоях */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-28 bg-gradient-to-b from-black/45 via-black/15 to-transparent"
      />

      {/* ─── Страницы (свайп влево/вправо) ─── */}
      {/* touch-none: на телефоне браузер иначе перехватывает свайп под скролл и шлёт pointercancel */}
      <div className="relative z-10 flex-1 touch-none overflow-hidden" onPointerDown={pages.onPointerDown} onClickCapture={guardClick}>
        <div
          ref={trackRef}
          className="flex h-full w-[200%]"
          style={{ transform: `translateX(${-page * 50}%)`, transition: SETTLE_EASE, willChange: 'transform' }}
        >
          {/* ─── Страница 1: компактные виджеты + основные приложения ─── */}
          <section className="flex h-full w-1/2 flex-col" aria-label="Страница 1 — приложения" aria-hidden={page !== 0}>
            <div className="flex items-stretch gap-1.5 px-4">
              {shownWidgets.filter((w) => w === 'clock').map((w) => (
                <Widget key={w} w={w} online={online} balance={balance} data={day} onOpenApp={onOpenApp} />
              ))}
              {shownWidgets.filter((w) => w !== 'clock').slice(0, 3).map((w) => (
                <Widget key={w} w={w} online={online} balance={balance} data={day} onOpenApp={onOpenApp} />
              ))}
            </div>

            <div className="mt-5 grid grid-cols-5 gap-x-2 gap-y-4 px-4">
              {PAGE1_APPS.map((app) => (
                <AppIcon
                  key={app}
                  icon={APP_TILE[app].icon}
                  label={APP_TILE[app].label}
                  image={APP_TILE[app].image || undefined}
                  imageBg={APP_TILE[app].background}
                  badge={app === 'avito' ? unreadChats : undefined}
                  onClick={() => onOpenApp(app)}
                />
              ))}
            </div>

            <div className="flex-1" />
          </section>

          {/* ─── Страница 2: мини-стрип дня + единая сетка приложений ─── */}
          <section className="flex h-full w-1/2 flex-col" aria-label="Страница 2 — приложения" aria-hidden={page !== 1}>
            {/* мини-стрип дня: задание / посылка / место в топе */}
            <div className="mx-4 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                aria-label="Задание дня"
                onClick={() => onOpenApp('career')}
                className={`${glass} flex min-h-10 flex-col justify-center px-2.5 py-1 text-left outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/70`}
              >
                <span className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-white/55">
                  <Trophy className="size-2.5 text-amber-300" aria-hidden="true" /> Задание
                </span>
                {day.quest ? (
                  <>
                    <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-white">
                      {day.quest.progress}/{day.quest.target}
                    </span>
                    <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/15">
                      <span
                        className="block h-full rounded-full bg-emerald-400"
                        style={{ width: `${Math.min(100, Math.round((day.quest.progress / Math.max(1, day.quest.target)) * 100))}%` }}
                      />
                    </span>
                  </>
                ) : (
                  <span className="mt-0.5 text-[10px] text-white/60">Всё чисто</span>
                )}
              </button>
              <button
                type="button"
                aria-label="Посылка"
                onClick={() => onOpenApp('delivery')}
                className={`${glass} flex min-h-10 flex-col justify-center px-2.5 py-1 text-left outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/70`}
              >
                <span className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-white/55">
                  <Package className="size-2.5 text-emerald-300" aria-hidden="true" /> Посылка
                </span>
                {day.delivery ? (
                  <span className="mt-0.5 text-[11px] font-semibold text-amber-300">В пути</span>
                ) : (
                  <span className="mt-0.5 text-[10px] text-white/60">Посылок нет</span>
                )}
              </button>
              <button
                type="button"
                aria-label="Топ площадки"
                onClick={() => onOpenApp('leaderboard')}
                className={`${glass} flex min-h-10 flex-col justify-center px-2.5 py-1 text-left outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/70`}
              >
                <span className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-white/55">
                  <Crown className="size-2.5 text-amber-300" aria-hidden="true" /> Топ
                </span>
                {day.myPlace ? (
                  <span className="mt-0.5 text-[11px] font-semibold text-white">{day.myPlace} место</span>
                ) : (
                  <span className="mt-0.5 text-[10px] text-white/60">Не в топе</span>
                )}
              </button>
            </div>

            {/* ЕДИНАЯ сетка 5 колонок — как на странице 1 */}
            <div className="mt-5 grid grid-cols-5 gap-x-2 gap-y-4 px-4">
              {PAGE2_APPS.map((app) => (
                <AppIcon
                  key={app}
                  icon={APP_TILE[app].icon}
                  label={APP_TILE[app].label}
                  image={APP_TILE[app].image || undefined}
                  imageBg={APP_TILE[app].background}
                  badge={app === 'avito' ? unreadChats : undefined}
                  loading="lazy"
                  onClick={() => onOpenApp(app)}
                />
              ))}
            </div>

            <div className="flex-1" />
          </section>
        </div>
      </div>

      {/* Мини-плеер: в потоке лэйаута, над точками страниц — док не перекрывает */}
      <MiniPlayer onOpenApp={onOpenApp} />

      {/* Page-dots: активная страница — пилюля */}
      <div className="z-10 mb-2 flex items-center justify-center gap-1" aria-hidden="true">
        <span className={`h-1 rounded-full bg-white transition-all duration-300 ${page === 0 ? 'w-4' : 'w-1 bg-white/40'}`} />
        <span className={`h-1 rounded-full bg-white transition-all duration-300 ${page === 1 ? 'w-4' : 'w-1 bg-white/40'}`} />
      </div>

      {/* ─── Поисковая пилюля над доком (в духе Google на Android 17) ─── */}
      <div className="z-10 mx-4 mb-1.5">
        <button
          type="button"
          aria-label="Поиск — открыть браузер"
          onClick={() => onOpenApp('browser')}
          className="flex h-11 w-full items-center gap-2.5 rounded-full bg-white/[0.15] px-4 text-left backdrop-blur-sm outline-none ring-1 ring-white/[0.09] transition-all duration-200 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Search className="size-4 shrink-0 text-white/85" aria-hidden="true" />
          <span className="flex-1 truncate text-[12.5px] font-medium text-white/80">Поиск</span>
          <Mic className="size-4 shrink-0 text-white/55" aria-hidden="true" />
        </button>
      </div>

      {/* ─── Док Android 17: иконки без панели и без подписей ─── */}
      <div className="z-10 mx-2 mb-1">
        <div className="grid grid-cols-4 gap-1">
          {DOCK_APPS.map((app) => (
            <AppIcon
              key={app}
              icon={APP_TILE[app].icon}
              label={APP_TILE[app].label}
              image={APP_TILE[app].image || undefined}
              imageBg={APP_TILE[app].background}
              badge={app === 'avito' ? unreadChats : undefined}
              small
              hideLabel
              onClick={() => onOpenApp(app)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// memo: page.tsx ре-рендерится на каждый тик батареи/онлайна — лончер не должен
// перевоссоздавать ~50 иконок из-за этого.
export default memo(HomeScreen)
