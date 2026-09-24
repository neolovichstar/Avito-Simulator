'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useOS, type AppKey, type WidgetKey } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import { wallpaperClass } from '@/lib/wallpapers'
import { api } from '@/lib/api'
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

// Данные для «умных» виджетов: первый активный квест и активная доставка
function useWidgetData() {
  const [quest, setQuest] = useState<{ title: string; progress: string } | null>(null)
  const [delivery, setDelivery] = useState<{ title: string; status: string } | null>(null)
  useEffect(() => {
    let alive = true
    api.career().then((c: CareerData) => {
      if (!alive) return
      const q = c.quests.find((x) => !x.claimed && x.progress > 0) ?? c.quests.find((x) => !x.claimed)
      if (q) setQuest({ title: q.title, progress: `${Math.min(q.progress, q.target)}/${q.target}` })
    }).catch(() => {})
    api.deliveries().then((d: { items: DeliveryDTO[] }) => {
      if (!alive) return
      const act = d.items.find((x) => x.status === 'in_transit')
      if (act) setDelivery({ title: act.title, status: 'В пути' })
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  return { quest, delivery }
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
  data: { quest: { title: string; progress: string } | null; delivery: { title: string; status: string } | null }
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
                <span className="block h-full rounded-full bg-emerald-400" />
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-white/80">{data.quest.progress}</span>
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

  return (
    <div
      className={`absolute inset-0 flex flex-col pt-14 ${wallpaperClass(wallpaper)}`}
      role="region"
      aria-label="Домашний экран"
    >
      {/* Виджеты — выбранные пользователем */}
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

      {/* Сетка приложений */}
      <div className="mt-7 grid grid-cols-4 gap-5 px-6">
        {HOME_GRID.map((app) => (
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

      {/* Page-dots */}
      <div className="mb-3 flex items-center justify-center gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
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
