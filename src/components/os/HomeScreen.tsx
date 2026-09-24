'use client'

// Домашний экран «Сделка OS»: две страницы, как на настоящем смартфоне.
// Страница 1 — виджеты + основные приложения, страница 2 — «умные» карточки
// (задания, посылка, топ площадки) и остальные приложения.
// Перелистывание — свайпом: палец на телефоне, зажатая мышь на ПК (Pointer Events).

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useOS, type AppKey, type WidgetKey } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import { wallpaperClass } from '@/lib/wallpapers'
import { api } from '@/lib/api'
import { useDrag } from '@/lib/use-swipe'
import AppIcon from './AppIcon'
import { APP_TILE, DOCK_APPS, HOME_GRID } from './app-logos'
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

const glass = 'rounded-2xl bg-white/10 backdrop-blur-md'
const WIDGET_CLASS = 'min-h-11 rounded-2xl bg-white/10 px-3.5 py-2 text-left backdrop-blur-md outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white/70'

// Разбивка приложений по страницам: 8 основных + сервисные
const PAGE1_APPS = HOME_GRID.slice(0, 8)
const PAGE2_APPS = HOME_GRID.slice(8)

// Данные для «умных» карточек: квест, доставка и топ площадки
function useWidgetData() {
  const [quest, setQuest] = useState<{ title: string; progress: number; target: number; reward: number } | null>(null)
  const [delivery, setDelivery] = useState<{ title: string; status: string } | null>(null)
  const [top3, setTop3] = useState<{ name: string; value: number; isMe: boolean }[]>([])
  useEffect(() => {
    let alive = true
    api.career().then((c: CareerData) => {
      if (!alive) return
      const q = c.quests.find((x) => !x.claimed && x.progress > 0) ?? c.quests.find((x) => !x.claimed)
      if (q) setQuest({ title: q.title, progress: Math.min(q.progress, q.target), target: q.target, reward: q.reward })
    }).catch(() => {})
    api.deliveries().then((d: { items: DeliveryDTO[] }) => {
      if (!alive) return
      const act = d.items.find((x) => x.status === 'in_transit')
      if (act) setDelivery({ title: act.title, status: 'В пути' })
    }).catch(() => {})
    api.leaderboard().then((b) => {
      if (!alive) return
      setTop3(b.balance.slice(0, 3).map((r) => ({ name: r.isMe ? 'Вы' : r.name, value: r.value, isMe: r.isMe })))
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  return { quest, delivery, top3 }
}

function Widget({
  w,
  now,
  online,
  balance,
  data,
  onOpenApp,
}: {
  w: WidgetKey
  now: Date | null
  online: number
  balance: number
  data: { quest: { title: string; progress: number; target: number; reward: number } | null; delivery: { title: string; status: string } | null; top3: { name: string; value: number; isMe: boolean }[] }
  onOpenApp: (app: AppKey) => void
}) {
  if (w === 'clock') {
    return (
      <div aria-label="Время и дата" className={`flex flex-col justify-center px-3.5 py-2 ${glass}`}>
        <p className="text-2xl font-light leading-none tabular-nums text-white" suppressHydrationWarning>
          {now ? now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '\u00A0'}
        </p>
        <p className="mt-1.5 text-[11px] leading-none text-white/70" suppressHydrationWarning>
          {now ? now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }) : '\u00A0'}
        </p>
      </div>
    )
  }
  if (w === 'online') {
    return (
      <div aria-label={`Онлайн: ${online}`} className={`flex items-center gap-2 px-3 ${glass}`}>
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-base font-semibold tabular-nums text-white">{online}</span>
      </div>
    )
  }
  if (w === 'wallet') {
    return (
      <button type="button" aria-label="Открыть кошелёк в приложении Банк" onClick={() => onOpenApp('bank')} className={WIDGET_CLASS}>
        <span className="block text-[10px] uppercase tracking-wider text-white/60">Кошелёк</span>
        <span className="mt-0.5 block text-base font-semibold tabular-nums text-white">{fmtMoney(balance)}</span>
      </button>
    )
  }
  if (w === 'quest') {
    return (
      <button type="button" aria-label="Открыть задания" onClick={() => onOpenApp('career')} className={WIDGET_CLASS}>
        <span className="block text-[10px] uppercase tracking-wider text-white/60">Задания</span>
        {data.quest ? (
          <>
            <span className="mt-0.5 block max-w-40 truncate text-xs font-medium text-white">{data.quest.title}</span>
            <span className="mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/20">
                <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.round((data.quest.progress / Math.max(1, data.quest.target)) * 100))}%` }} />
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-white/80">{data.quest.progress}/{data.quest.target}</span>
            </span>
          </>
        ) : (
          <span className="mt-0.5 block text-xs text-white/60">На сегодня всё чисто</span>
        )}
      </button>
    )
  }
  // delivery
  return (
    <button type="button" aria-label="Открыть доставки" onClick={() => onOpenApp('delivery')} className={WIDGET_CLASS}>
      <span className="block text-[10px] uppercase tracking-wider text-white/60">Доставка</span>
      {data.delivery ? (
        <>
          <span className="mt-0.5 block max-w-40 truncate text-xs font-medium text-white">{data.delivery.title}</span>
          <span className={`mt-0.5 block text-[10px] font-semibold ${data.delivery.status === 'В пути' ? 'text-amber-300' : 'text-emerald-300'}`}>
            {data.delivery.status}
          </span>
        </>
      ) : (
        <span className="mt-0.5 block text-xs text-white/60">Посылок нет</span>
      )}
    </button>
  )
}

export default function HomeScreen({ onOpenApp }: { onOpenApp: (app: AppKey) => void }) {
  const balance = useOS((s) => s.session?.balance ?? 0)
  const unreadChats = useOS((s) => s.unreadChats)
  const online = useOS((s) => s.online)
  const wallpaper = useOS((s) => s.wallpaper)
  const widgets = useOS((s) => s.widgets)
  const now = useClock()
  const data = useWidgetData()

  // ─── Страницы + свайп (ПК и телефон) ───────────────────────────────────────
  const [page, setPage] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const horizRef = useRef(false)
  const movedRef = useRef(false)

  const pages = useDrag({
    onStart: () => {
      setDragging(true)
      horizRef.current = false
      movedRef.current = false
    },
    onMove: (dx, dy) => {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) movedRef.current = true
      // горизонтальная интенция: включаем только если тянем вбок заметнее, чем вверх
      if (!horizRef.current && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) horizRef.current = true
      if (!horizRef.current) return
      // сопротивление за краями страниц
      const rubber = (page === 0 && dx > 0) || (page === 1 && dx < 0) ? 0.28 : 1
      setDragX(dx * rubber)
    },
    onEnd: (dx) => {
      setDragging(false)
      if (horizRef.current && dx <= -56 && page === 0) setPage(1)
      else if (horizRef.current && dx >= 56 && page === 1) setPage(0)
      setDragX(0)
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

  const trackStyle: React.CSSProperties = {
    transform: `translateX(calc(${-page * 50}% + ${dragX}px))`,
    transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
  }

  return (
    <div
      className={`absolute inset-0 flex flex-col pt-14 ${wallpaperClass(wallpaper)}`}
      role="region"
      aria-label="Домашний экран"
    >
      {/* ─── Страницы (свайп влево/вправо) ─── */}
      <div className="relative flex-1 overflow-hidden" onPointerDown={pages.onPointerDown} onClickCapture={guardClick}>
        <div className="flex h-full w-[200%]" style={trackStyle}>
          {/* Страница 1: виджеты + основные приложения */}
          <section className="flex h-full w-1/2 flex-col" aria-label="Страница 1 — приложения" aria-hidden={page !== 0}>
            <div className="flex items-stretch justify-between gap-2.5 px-6">
              <div className="flex items-stretch gap-2.5">
                {widgets.filter((w) => w === 'clock').map((w) => (
                  <Widget key={w} w={w} now={now} online={online} balance={balance} data={data} onOpenApp={onOpenApp} />
                ))}
              </div>
              <div className="flex items-stretch gap-2.5">
                {widgets.filter((w) => w !== 'clock').map((w) => (
                  <Widget key={w} w={w} now={now} online={online} balance={balance} data={data} onOpenApp={onOpenApp} />
                ))}
              </div>
            </div>

            <div className="mt-7 grid grid-cols-4 gap-5 px-6">
              {PAGE1_APPS.map((app) => (
                <AppIcon
                  key={app}
                  icon={APP_TILE[app].icon}
                  label={APP_TILE[app].label}
                  background={APP_TILE[app].background}
                  badge={app === 'avito' ? unreadChats : undefined}
                  onClick={() => onOpenApp(app)}
                />
              ))}
            </div>

            <div className="flex-1" />
          </section>

          {/* Страница 2: «умные» карточки + сервисные приложения */}
          <section className="flex h-full w-1/2 flex-col overflow-y-auto px-5 pb-3 [scrollbar-width:none]" aria-label="Страница 2 — день на площадке" aria-hidden={page !== 1}>
            <p className="mb-2 mt-1 px-1 text-[11px] font-semibold uppercase tracking-widest text-white/50">
              День на площадке
            </p>

            {/* Квест-карточка */}
            <button
              type="button"
              onClick={() => onOpenApp('career')}
              className="press mb-2.5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-3.5 text-left backdrop-blur-md active:scale-[0.985]"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/40" aria-hidden>
                <svg viewBox="0 0 48 48" className="size-6">
                  <path d="M14.5 26.5 l5.5 5.5 L30 21.5" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wider text-white/55">Задание дня</span>
                {data.quest ? (
                  <>
                    <span className="mt-0.5 block truncate text-[13px] font-semibold text-white">{data.quest.title}</span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-[width] duration-500"
                          style={{ width: `${Math.min(100, Math.round((data.quest.progress / Math.max(1, data.quest.target)) * 100))}%` }}
                        />
                      </span>
                      <span className="text-[10px] font-bold tabular-nums text-white/75">{data.quest.progress}/{data.quest.target}</span>
                    </span>
                  </>
                ) : (
                  <span className="mt-0.5 block text-[13px] text-white/70">Все задания выполнены — красавчик</span>
                )}
              </span>
              {data.quest && (
                <span className="shrink-0 rounded-full bg-emerald-400/20 px-2 py-1 text-[10px] font-bold text-emerald-300">
                  +{fmtMoney(data.quest.reward)}
                </span>
              )}
            </button>

            {/* Посылка */}
            <button
              type="button"
              onClick={() => onOpenApp('delivery')}
              className="press mb-2.5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-3.5 text-left backdrop-blur-md active:scale-[0.985]"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/40" aria-hidden>
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="12" rx="2" />
                  <path d="M12 7v12" /><path d="M2 11h20" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wider text-white/55">Посылка</span>
                {data.delivery ? (
                  <>
                    <span className="mt-0.5 block truncate text-[13px] font-semibold text-white">{data.delivery.title}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-amber-300">{data.delivery.status} — курьер уже едет</span>
                  </>
                ) : (
                  <span className="mt-0.5 block text-[13px] text-white/70">Активных посылок нет</span>
                )}
              </span>
            </button>

            {/* Топ площадки */}
            <button
              type="button"
              onClick={() => onOpenApp('leaderboard')}
              className="press mb-3 rounded-2xl border border-white/10 bg-white/10 p-3.5 text-left backdrop-blur-md active:scale-[0.985]"
            >
              <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/55">Топ площадки</span>
              {data.top3.length > 0 ? (
                <span className="flex flex-col gap-1.5">
                  {data.top3.map((r, i) => (
                    <span key={r.name} className="flex items-center gap-2">
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                          i === 0 ? 'bg-amber-400 text-amber-950' : i === 1 ? 'bg-slate-300 text-slate-800' : 'bg-orange-300 text-orange-950'
                        }`}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-xs font-medium ${r.isMe ? 'font-bold text-fuchsia-300' : 'text-white/85'}`}>{r.name}</span>
                      <span className="shrink-0 text-[11px] font-bold tabular-nums text-white">{fmtMoney(r.value)}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="block text-[13px] text-white/70">Загружаем лидеров…</span>
              )}
            </button>

            {/* Сервисные приложения */}
            <div className="grid grid-cols-4 gap-5 px-1">
              {PAGE2_APPS.map((app) => (
                <AppIcon
                  key={app}
                  icon={APP_TILE[app].icon}
                  label={APP_TILE[app].label}
                  background={APP_TILE[app].background}
                  badge={app === 'avito' ? unreadChats : undefined}
                  onClick={() => onOpenApp(app)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Page-dots: активная страница — пилюля */}
      <div className="mb-3 flex items-center justify-center gap-1.5" aria-hidden="true">
        <span className={`h-1.5 rounded-full bg-white transition-all duration-300 ${page === 0 ? 'w-5' : 'w-1.5 bg-white/40'}`} />
        <span className={`h-1.5 rounded-full bg-white transition-all duration-300 ${page === 1 ? 'w-5' : 'w-1.5 bg-white/40'}`} />
      </div>

      {/* Док */}
      <div className="mx-4 mb-2 rounded-3xl bg-white/10 p-3 backdrop-blur-md">
        <div className="grid grid-cols-4 gap-5">
          {DOCK_APPS.map((app) => (
            <AppIcon
              key={app}
              icon={APP_TILE[app].icon}
              label={APP_TILE[app].label}
              background={APP_TILE[app].background}
              badge={app === 'avito' ? unreadChats : undefined}
              onClick={() => onOpenApp(app)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
