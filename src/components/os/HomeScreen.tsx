'use client'

// Домашний экран «Resale OS» по фирменному макету (светлый чб минимализм):
//   • Панель 1: виджеты «Погода» и «Сегодня» + сетка 4×4 приложений;
//   • Панель 2: продолжение сетки;
//   • Панель 3: Библиотека приложений (поиск, чипы-категории, разделы).
//   • Зажатие иконки: «подъём» иконки → если повести палец, начинается
//     перетаскивание (живой drag&drop сетка ↔ док, автопролистывание страниц
//     у края, иконка-призрак на 120 fps: позиция пишется в DOM напрямую);
//     если отпустить без движения, открывается меню («О приложении»,
//     «Изменить экран», «Убрать с экрана»);
//   • Папки: навести перетаскиваемую иконку на другую и подождать ~0,4 с —
//     цель подсветится (os-merge), отпустить — создастся папка. Папку можно
//     открыть, переименовать, дотянуть в неё ещё приложения и вытащить их
//     обратно на экран (drag из открытой папки за её пределы).
//   • Долгий тап в Библиотеке: «О приложении» и «На главный экран».
// Раскладка сохраняется в localStorage (v2, с миграцией v1); новые приложения
// из обновлений автоматически добавляются в конец сетки.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowDown, ArrowUp, Check, ChevronRight, Cloud, CloudLightning, CloudRain, CloudSun,
  Navigation2, Pencil, Plus, Search, Snowflake, Sun, X,
} from 'lucide-react'
import { useOS, type AppKey, type WidgetKey } from '@/lib/store'
import { wallpaperById, wallpaperClass } from '@/lib/wallpapers'
import { api } from '@/lib/api'
import { useDrag } from '@/lib/use-swipe'
import { fmtDeg, weatherNow, type Condition } from '@/lib/weather'
import AppIcon from './AppIcon'
import AppInfoSheet from './AppInfoSheet'
import MiniPlayer from './MiniPlayer'
import { APP_TILE, DEFAULT_DOCK, DEFAULT_GRID, LIB_CHIPS, LIB_SECTIONS, type LibChip } from './app-logos'
import type { CareerData, DeliveryDTO } from '@/lib/types'

// ─── Раскладка домашнего экрана ──────────────────────────────────────────────
const LAYOUT_KEY = 'avito_sim_home_layout_v2'
const LAYOUT_KEY_V1 = 'avito_sim_home_layout_v1'
type Zone = 'grid' | 'dock' | 'folder'
export type HomeItem = { t: 'app'; app: AppKey } | { t: 'folder'; id: string; name: string; apps: AppKey[] }
type FolderItem = Extract<HomeItem, { t: 'folder' }>
interface HomeLayout { grid: HomeItem[]; dock: AppKey[] }
interface DragInfo { item: HomeItem; zone: Zone; index: number; folderId: string | null }
type MenuTargetBase =
  | { kind: 'app'; app: AppKey; ctx: 'home' | 'lib' | 'folder'; folderId?: string }
  | { kind: 'folder'; folderId: string }
type MenuTarget = MenuTargetBase & { x: number; y: number }

const DOCK_MAX = 4
const PAGE0_SLOTS = 16 // виджеты + сетка 4×4
const PAGES = 3 // две страницы сетки + библиотека
const FOLDER_MAX = 9
const HOLD_MS = 300
const MERGE_MS = 380 // сколько держать иконку над другой, чтобы «слиплись»

const genFolderId = () => `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
const itemApps = (it: HomeItem): AppKey[] => (it.t === 'app' ? [it.app] : it.apps)
const itemKey = (it: HomeItem): string => (it.t === 'app' ? it.app : it.id)

// Вход лончера (stagger виджетов/иконок) проигрывается один раз за сессию —
// после разблокировки; возвраты из приложений анимацию не повторяют.
let homeEntrancePlayed = false

// Токены 55-b: карточка-стекло и тексты.
const GLASS_CARD = 'shadow-[0_10px_30px_-12px_rgba(10,10,15,0.14)]'
const TXT_PRIMARY = 'text-[#111114]'
const TXT_SECOND = 'text-[rgba(60,60,67,0.62)]'
const TXT_TERTIARY = 'text-[rgba(60,60,67,0.35)]'
const buzz = (ms: number | number[]) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(ms) } catch { /* ignore */ }
  }
}

const validApps = (arr: unknown): AppKey[] =>
  Array.isArray(arr) ? arr.filter((a): a is AppKey => typeof a === 'string' && a in APP_TILE) : []

function loadLayout(): HomeLayout {
  const mkItems = (arr: AppKey[]): HomeItem[] => arr.map((app) => ({ t: 'app', app }))
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const obj = JSON.parse(raw) as { grid?: unknown; dock?: unknown }
      const dock = validApps(obj.dock).slice(0, DOCK_MAX)
      const seen = new Set<AppKey>(dock)
      const grid: HomeItem[] = []
      const rawGrid = Array.isArray(obj.grid) ? (obj.grid as unknown[]) : []
      for (const it of rawGrid) {
        const rec = it as { t?: unknown; app?: unknown; id?: unknown; name?: unknown; apps?: unknown } | null
        if (!rec) continue
        if (rec.t === 'app' && typeof rec.app === 'string' && rec.app in APP_TILE && !seen.has(rec.app as AppKey)) {
          const appKey = rec.app as AppKey
          grid.push({ t: 'app', app: appKey })
          seen.add(appKey)
        } else if (rec.t === 'folder') {
          const apps = validApps(rec.apps).filter((a) => !seen.has(a)).slice(0, FOLDER_MAX)
          if (apps.length >= 2) {
            apps.forEach((a) => seen.add(a))
            grid.push({
              t: 'folder',
              id: typeof rec.id === 'string' && rec.id ? rec.id : genFolderId(),
              name: typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim().slice(0, 24) : 'Папка',
              apps,
            })
          } else {
            apps.forEach((a) => { if (!seen.has(a)) { grid.push({ t: 'app', app: a }); seen.add(a) } })
          }
        }
      }
      // Приложения, появившиеся в обновлениях, автоматически встают в конец сетки
      for (const a of [...DEFAULT_DOCK, ...DEFAULT_GRID]) {
        if (!seen.has(a)) { grid.push({ t: 'app', app: a }); seen.add(a) }
      }
      return { grid, dock: dock.length ? dock : [...DEFAULT_DOCK] }
    }
    // миграция v1 (плоские массивы) → v2
    const rawV1 = localStorage.getItem(LAYOUT_KEY_V1)
    if (rawV1) {
      const obj = JSON.parse(rawV1) as { grid?: unknown; dock?: unknown }
      const dock = validApps(obj.dock).slice(0, DOCK_MAX)
      const gridApps = validApps(obj.grid).filter((a) => !dock.includes(a))
      const known = new Set([...dock, ...gridApps])
      const missing = [...DEFAULT_DOCK, ...DEFAULT_GRID].filter((a) => !known.has(a))
      return { grid: mkItems([...gridApps, ...missing]), dock: dock.length ? dock : [...DEFAULT_DOCK] }
    }
  } catch { /* приватный режим — дефолтная раскладка */ }
  return { grid: mkItems(DEFAULT_GRID), dock: [...DEFAULT_DOCK] }
}

// Живые тики часов (виджет «Сегодня») без ре-рендера лончера.
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

const SETTLE_EASE = 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)'

// ─── Виджет «Погода» (карточка как в макете) ────────────────────────────────
// ─── Крупная цветная иконка погоды (lucide, жёлтое солнце — без эмодзи) ────
function WeatherGlyph({ cond, className }: { cond: Condition; className: string }) {
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

function WeatherWidget({ dark, onOpenApp, enterDelay }: { dark: boolean; onOpenApp: (a: AppKey) => void; enterDelay?: number }) {
  const w = useMemo(() => weatherNow(0), [])
  return (
    <button
      type="button"
      aria-label={`Погода: ${w.city}, ${fmtDeg(w.temp)}, ${w.cond}`}
      onClick={() => onOpenApp('weather')}
      style={enterDelay !== undefined ? ({ ['--d' as string]: `${enterDelay}ms` } as React.CSSProperties) : undefined}
      className={`flex flex-1 flex-col justify-between rounded-[26px] p-4 text-left outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-black/20 ${
        dark
          ? 'bg-white/[0.10] ring-1 ring-white/[0.08] backdrop-blur-md'
          : `bg-white/85 ring-1 ring-black/[0.04] backdrop-blur-xl ${GLASS_CARD}`
      } ${enterDelay !== undefined ? 'os-enter' : ''}`}
    >
      <span className="flex items-center gap-2">
        <WeatherGlyph cond={w.cond} className="size-8" />
        <span className={`truncate text-[15px] font-semibold ${dark ? 'text-white' : TXT_PRIMARY}`}>{w.city}</span>
        <Navigation2 className="size-2.5 shrink-0 text-[#0A84FF]" fill="currentColor" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <p className={`mt-2 text-[36px] font-semibold leading-none tracking-tight ${dark ? 'text-white' : TXT_PRIMARY}`}>
        {fmtDeg(w.temp)}
      </p>
      <p className={`mt-1.5 text-[13px] leading-tight ${dark ? 'text-white/60' : TXT_SECOND}`}>{w.cond}</p>
      <p className={`mt-0.5 flex items-center gap-2 text-[13px] font-medium tabular-nums ${dark ? 'text-white/60' : TXT_SECOND}`}>
        <span className="flex items-center gap-0.5">
          <ArrowUp className="size-3" aria-hidden="true" />
          {fmtDeg(w.tMax)}
        </span>
        <span className="flex items-center gap-0.5">
          <ArrowDown className="size-3" aria-hidden="true" />
          {fmtDeg(w.tMin)}
        </span>
      </p>
    </button>
  )
}

// ─── Виджет «Сегодня»: дата + живые строки дня ───────────────────────────────
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

function TodayWidget({
  dark, widgets, online, day, onOpenApp, enterDelay,
}: {
  dark: boolean
  widgets: WidgetKey[]
  online: number
  day: { quest: { progress: number; target: number } | null; delivery: { status: string } | null; myPlace: number | null }
  onOpenApp: (a: AppKey) => void
  enterDelay?: number
}) {
  const now = useClock()
  const dateStr = now
    ? (() => {
        const s = now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
        return s.charAt(0).toUpperCase() + s.slice(1)
      })()
    : '\u00A0'

  const rows: { key: string; dot: string; label: string; value: string; run: () => void }[] = []
  if (widgets.includes('clock') && now) {
    rows.push({
      key: 'clock',
      dot: 'bg-[#0A84FF]',
      label: 'Часы',
      value: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      run: () => onOpenApp('clock'),
    })
  }
  if (widgets.includes('online')) {
    rows.push({
      key: 'online',
      dot: 'bg-[#34C759]',
      label: 'Сейчас в игре',
      value: String(online),
      run: () => onOpenApp('leaderboard'),
    })
  }
  if (widgets.includes('quest')) {
    rows.push({
      key: 'quest',
      dot: 'bg-[#FF9F0A]',
      label: 'Задание',
      value: day.quest ? `${day.quest.progress} из ${day.quest.target}` : 'всё чисто',
      run: () => onOpenApp('career'),
    })
  }
  if (widgets.includes('delivery')) {
    rows.push({
      key: 'delivery',
      dot: 'bg-[#FF453A]',
      label: 'Посылка',
      value: day.delivery ? day.delivery.status : 'нет',
      run: () => onOpenApp('delivery'),
    })
  }

  return (
    <div
      style={enterDelay !== undefined ? ({ ['--d' as string]: `${enterDelay}ms` } as React.CSSProperties) : undefined}
      className={`flex w-[46%] shrink-0 flex-col rounded-[26px] p-4 ${
        dark
          ? 'bg-white/[0.10] ring-1 ring-white/[0.08] backdrop-blur-md'
          : `bg-white/85 ring-1 ring-black/[0.04] backdrop-blur-xl ${GLASS_CARD}`
      } ${enterDelay !== undefined ? 'os-enter' : ''}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className={`truncate text-[15px] font-semibold ${dark ? 'text-white' : TXT_PRIMARY}`} suppressHydrationWarning>
          {dateStr}
        </p>
        <button
          type="button"
          aria-label="Открыть задания"
          onClick={() => onOpenApp('career')}
          className={`flex size-[26px] shrink-0 items-center justify-center rounded-full outline-none transition-transform duration-150 active:scale-90 ${
            dark ? 'bg-white/10 text-white/80' : 'bg-black/[0.06] text-[rgba(60,60,67,0.62)]'
          }`}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col justify-between gap-y-2">
        {rows.length === 0 && (
          <p className={`text-[12px] leading-tight ${dark ? 'text-white/45' : TXT_TERTIARY}`}>
            Добавьте строки в Настройках
          </p>
        )}
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={r.run}
            className="flex min-h-[18px] items-center gap-1.5 text-left outline-none"
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${r.dot}`} />
            <span className={`min-w-0 flex-1 truncate text-[13px] font-medium leading-tight ${dark ? 'text-white/85' : TXT_PRIMARY}`}>
              {r.label}
            </span>
            <span className={`shrink-0 text-[13px] leading-tight tabular-nums ${dark ? 'text-white/55' : TXT_SECOND}`}>
              {r.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Стеклянная плитка папки (мини-иконки внутри, та же глубина, что у иконок) ───
function FolderGlass({ apps, dark, className, style }: { apps: AppKey[]; dark: boolean; className?: string; style?: React.CSSProperties }) {
  const minis = apps.slice(0, 9)
  const cols = minis.length > 4 ? 3 : 2
  return (
    <span
      style={style}
      className={`relative block aspect-square w-full overflow-hidden rounded-[22.5%] ring-1 backdrop-blur-xl ${
        dark
          ? 'bg-white/[0.13] ring-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]'
          : 'bg-white/55 ring-black/[0.05] shadow-[0_8px_16px_-6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.45)]'
      } ${className ?? ''}`}
    >
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center px-[9%]">
        <span className="grid w-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '8%' }}>
          {minis.map((a) => (
            <img
              key={a}
              src={APP_TILE[a].image}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
              className="aspect-square w-full select-none rounded-[26%] object-cover shadow-[0_2px_5px_rgba(0,0,0,0.24)]"
            />
          ))}
        </span>
      </span>
      {/* глянец поверх миниатюр — как у иконок */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[inherit] bg-gradient-to-b from-white/25 to-transparent"
      />
    </span>
  )
}

function FolderTile({
  item, dark, tone, tileClass, badge, tileW, enter, enterDelay, onPointerDown, onClick,
}: {
  item: FolderItem
  dark: boolean
  tone: 'dark' | 'light'
  tileClass?: string
  badge?: number
  tileW?: number
  enter?: boolean
  enterDelay?: number
  onPointerDown?: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      aria-label={`Папка «${item.name}»`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        ...(tileW ? { width: tileW } : undefined),
        ...(enter ? ({ ['--d' as string]: `${enterDelay ?? 0}ms` } as React.CSSProperties) : undefined),
      }}
      className={`flex ${tileW ? '' : 'w-full'} flex-col items-center gap-[6px] outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${enter ? 'os-enter' : ''}`}
    >
      <span className={`relative block w-full transition-[transform,box-shadow] duration-200 ease-out ${tileClass ?? ''}`}>
        <FolderGlass apps={item.apps} dark={dark} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF453A] px-1 text-[10px] font-semibold leading-none text-white shadow-md">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span
        style={{ width: 74 }}
        className={`truncate text-center text-[11px] font-medium ${
          tone === 'light'
            ? 'text-[#1a1a1a] [text-shadow:0_1px_2px_rgba(255,255,255,0.65)]'
            : 'text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]'
        }`}
      >
        {item.name}
      </span>
    </button>
  )
}

// ─── Открытая папка: стеклянная панель поверх домашнего экрана ──────────────
function FolderView({
  item, dark, tone, unreadChats, jiggle, armedIndex, dragApp, closing, extracting, panelRef,
  onPointerDownIcon, onIconClick, onClose, onRename,
}: {
  item: FolderItem
  dark: boolean
  tone: 'dark' | 'light'
  unreadChats: number
  jiggle: boolean
  armedIndex: number | null
  dragApp: AppKey | null
  closing: boolean
  extracting: boolean
  panelRef: React.RefObject<HTMLDivElement | null>
  onPointerDownIcon: (app: AppKey, index: number) => (e: React.PointerEvent) => void
  onIconClick: (app: AppKey) => (e: React.MouseEvent) => void
  onClose: () => void
  onRename: (name: string) => void
}) {
  const [name, setName] = useState(item.name)
  return (
    <div className="absolute inset-0 z-[68]" role="dialog" aria-label={`Папка «${item.name}»`}>
      <button
        type="button"
        aria-label="Закрыть папку"
        tabIndex={closing ? -1 : 0}
        onClick={onClose}
        className="sheet-fade absolute inset-0 cursor-default transition-colors duration-300"
        style={{
          background: extracting ? 'rgba(0,0,0,0.05)' : dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)',
          backdropFilter: extracting ? 'blur(2px)' : 'blur(22px)',
          WebkitBackdropFilter: extracting ? 'blur(2px)' : 'blur(22px)',
        }}
      />
      <div
        ref={panelRef}
        className={`absolute left-1/2 top-[13%] w-[88%] max-w-[330px] rounded-[36px] p-4 ring-1 backdrop-blur-3xl ${
          closing ? 'os-folder-panel-imploding' : 'os-folder-panel'
        } ${
          dark
            ? 'bg-[#1C1C1E]/75 ring-white/[0.14] shadow-2xl'
            : 'bg-white/75 ring-black/[0.05] shadow-2xl'
        }`}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(name)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          maxLength={24}
          aria-label="Название папки"
          className={`w-full rounded-lg bg-transparent px-1 py-0.5 text-center text-[20px] font-semibold outline-none transition-colors focus:bg-black/5 ${dark ? 'text-white' : TXT_PRIMARY}`}
        />
        <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-4">
          {item.apps.map((app, i) => (
            <div
              key={app}
              data-slot={`folder:${i}`}
              className="relative flex flex-col items-center"
              style={dragApp === app ? { opacity: 0.3 } : undefined}
            >
              <AppIcon
                icon={APP_TILE[app].icon}
                label={APP_TILE[app].label}
                image={APP_TILE[app].image || undefined}
                imageBg={APP_TILE[app].background}
                badge={app === 'avito' ? unreadChats : undefined}
                tone={tone}
                staticTile={jiggle}
                tileClass={armedIndex === i ? 'os-lift' : jiggle ? `os-jiggle ${i % 2 ? 'os-jiggle-late' : ''}` : ''}
                onPointerDown={onPointerDownIcon(app, i)}
                onClick={onIconClick(app)}
              />
            </div>
          ))}
        </div>
        <p className={`mt-3 text-center text-[12px] ${dark ? 'text-white/45' : TXT_SECOND}`}>
          {item.apps.length} из {FOLDER_MAX} · зажмите иконку и тяните, чтобы вынести
        </p>
      </div>
    </div>
  )
}

// ─── Контекстное меню иконки / папки ────────────────────────────────────────
function IconMenu({
  menu, dark, onAbout, onEditScreen, onRemove, onAddHome, onRename, onUnfolder, onClose,
}: {
  menu: MenuTarget
  dark: boolean
  onAbout: () => void
  onEditScreen: () => void
  onRemove: () => void
  onAddHome: () => void
  onRename: () => void
  onUnfolder: () => void
  onClose: () => void
}) {
  const item = 'flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-medium outline-none transition-colors duration-150'
  const tone = dark
    ? 'bg-[#1C1C1E]/95 text-white ring-1 ring-white/[0.12] shadow-2xl'
    : 'bg-white/95 text-neutral-800 ring-1 ring-black/[0.06] shadow-[0_22px_50px_-16px_rgba(15,23,42,0.45)]'
  const hover = dark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'

  return (
    <div className="absolute inset-0 z-[86]" role="menu" aria-label="Меню приложения">
      <button type="button" aria-label="Закрыть меню" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default" />
      <div
        className={`os-pop absolute w-[196px] overflow-hidden rounded-[18px] p-1.5 backdrop-blur-xl ${tone}`}
        style={{ left: menu.x, top: menu.y, transform: 'translate(-50%, -108%)' }}
      >
        {menu.kind === 'app' && (
          <button type="button" role="menuitem" onClick={onAbout} className={`${item} ${hover}`}>
            <Search className="size-4 opacity-60" aria-hidden="true" />
            О приложении
          </button>
        )}
        {menu.kind === 'app' && menu.ctx === 'lib' && (
          <button type="button" role="menuitem" onClick={onAddHome} className={`${item} ${hover}`}>
            <Plus className="size-4 opacity-60" aria-hidden="true" />
            На главный экран
          </button>
        )}
        {menu.kind === 'app' && menu.ctx === 'folder' && (
          <button type="button" role="menuitem" onClick={onUnfolder} className={`${item} ${hover}`}>
            <MinusGlyph />
            Убрать из папки
          </button>
        )}
        {menu.kind === 'folder' && (
          <button type="button" role="menuitem" onClick={onRename} className={`${item} ${hover}`}>
            <Pencil className="size-4 opacity-60" aria-hidden="true" />
            Переименовать
          </button>
        )}
        {menu.kind === 'folder' ? (
          <>
            <button type="button" role="menuitem" onClick={onEditScreen} className={`${item} ${hover}`}>
              <LayoutGridGlyph />
              Изменить экран
            </button>
            <button type="button" role="menuitem" onClick={onRemove} className={`${item} ${hover}`}>
              <MinusGlyph />
              Убрать с экрана
            </button>
          </>
        ) : (
          menu.ctx !== 'lib' && menu.ctx !== 'folder' && (
            <>
              <button type="button" role="menuitem" onClick={onEditScreen} className={`${item} ${hover}`}>
                <LayoutGridGlyph />
                Изменить экран
              </button>
              <button type="button" role="menuitem" onClick={onRemove} className={`${item} ${hover}`}>
                <MinusGlyph />
                Убрать с экрана
              </button>
            </>
          )
        )}
      </div>
    </div>
  )
}

function LayoutGridGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  )
}

function MinusGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12h7" />
    </svg>
  )
}

// ─── Главный экран ───────────────────────────────────────────────────────────
function HomeScreen({ onOpenApp }: { onOpenApp: (app: AppKey) => void }) {
  const unreadChats = useOS((s) => s.unreadChats)
  const online = useOS((s) => s.online)
  const wallpaper = useOS((s) => s.wallpaper)
  const widgets = useOS((s) => s.widgets)
  const pushToast = useOS((s) => s.pushToast)
  const theme = useOS((s) => s.theme)
  const locked = useOS((s) => s.locked)
  const dark = theme === 'dark'
  const wall = wallpaperById(wallpaper)
  // Тон текстов: светлые обои + светлая тема → графитовые подписи; иначе белые
  const lightTone = !!wall.light && !dark
  const tone: 'dark' | 'light' = lightTone ? 'light' : 'dark'

  const [layout, setLayout] = useState<HomeLayout>(loadLayout)
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])
  const [page, setPage] = useState(0)
  const [edit, setEdit] = useState(false)
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  const [info, setInfo] = useState<AppKey | null>(null)
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [armed, setArmed] = useState<DragInfo | null>(null)
  const [mergeAt, setMergeAt] = useState<number | null>(null) // слот сетки под «слипание»
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [folderClosing, setFolderClosing] = useState(false)
  const [extracting, setExtracting] = useState(false) // тянем иконку из открытой папки наружу
  const [libChip, setLibChip] = useState<LibChip>('all')
  const [libQuery, setLibQuery] = useState('')

  const day = useDayData()
  const rootRef = useRef<HTMLDivElement>(null)

  // Stagger-вход лончера после разблокировки: scale 0.96 → 1 + fade.
  // Только transform/opacity; после ~1.2 с классы снимаются и не мешают драгу.
  const [entrance, setEntrance] = useState(false)
  const entranceClearTimer = useRef(0)
  useEffect(() => {
    if (locked || homeEntrancePlayed) return
    homeEntrancePlayed = true
    // setState из колбэка таймера (не синхронно в теле эффекта)
    const t = window.setTimeout(() => {
      setEntrance(true)
      entranceClearTimer.current = window.setTimeout(() => setEntrance(false), 1200)
    }, 0)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(entranceClearTimer.current)
    }
  }, [locked])

  // persist раскладки
  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
  }, [layout])

  const openAppFromHome = useCallback(
    (a: AppKey) => {
      setOpenFolderId(null)
      setFolderClosing(false)
      onOpenApp(a)
    },
    [onOpenApp],
  )

  const openMenuAt = useCallback((target: MenuTargetBase, clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect()
    setMenu({ ...target, x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) })
  }, [])

  // ─── Свайп страниц (transform в DOM напрямую, 120 fps) ─────────────────────
  const trackRef = useRef<HTMLDivElement>(null)
  const horizRef = useRef(false)
  const movedRef = useRef(false)
  const halfRef = useRef(1)
  const dragActiveRef = useRef(false)
  const suppressClickRef = useRef(false)
  const editRef = useRef(false)
  useEffect(() => {
    editRef.current = edit || !!drag || !!armed
  }, [edit, drag, armed])

  const pages = useDrag({
    onStart: () => {
      horizRef.current = false
      movedRef.current = false
      const el = trackRef.current
      halfRef.current = (el?.offsetWidth ?? 3) / 3
      if (el) el.style.transition = 'none'
    },
    onMove: (dx, dy) => {
      if (dragActiveRef.current || editRef.current) return
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) movedRef.current = true
      if (!horizRef.current && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) horizRef.current = true
      if (!horizRef.current) return
      const el = trackRef.current
      if (!el) return
      const rubber = (page === 0 && dx > 0) || (page === PAGES - 1 && dx < 0) ? 0.28 : 1
      const shift = dx * rubber
      el.style.transform = `translateX(calc(${-page * (100 / PAGES)}% + ${(shift / halfRef.current) * (100 / PAGES)}%))`
    },
    onEnd: (dx, dy, fling) => {
      const el = trackRef.current
      const width = halfRef.current
      const distPct = width > 0 ? dx / width : 0
      // вертикальный жест: вниз — библиотека, вверх из библиотеки — домой
      if (!horizRef.current && !dragActiveRef.current && !editRef.current) {
        if (dy > 64 && page !== PAGES - 1) {
          if (el) { el.style.transition = SETTLE_EASE; el.style.transform = `translateX(${-(PAGES - 1) * (100 / PAGES)}%)` }
          setPage(PAGES - 1)
          return
        }
        if (dy < -64 && page === PAGES - 1) {
          if (el) { el.style.transition = SETTLE_EASE; el.style.transform = 'translateX(0%)' }
          setPage(0)
          return
        }
      }
      const goNext = page < PAGES - 1 && horizRef.current && (dx <= -56 || distPct <= -0.3 || (dx < -20 && fling.vx < -0.55))
      const goPrev = page > 0 && horizRef.current && (dx >= 56 || distPct >= 0.3 || (dx > 20 && fling.vx > 0.55))
      const next = goNext ? page + 1 : goPrev ? page - 1 : page
      if (el) {
        el.style.transition = SETTLE_EASE
        el.style.transform = `translateX(${-next * (100 / PAGES)}%)`
      }
      if (next !== page) setPage(next)
    },
  })

  // guard: клик после жеста не должен открыть приложение
  const guardClick = (e: React.MouseEvent) => {
    if (movedRef.current || dragActiveRef.current) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = false
    }
  }

  // ─── Drag & Drop ярлыков ───────────────────────────────────────────────────
  const ghostRef = useRef<HTMLDivElement>(null)
  const ghostWRef = useRef(72)
  const [ghostW, setGhostW] = useState(72)
  const slotsRef = useRef<{ zone: Zone; index: number; cx: number; cy: number; w: number; h: number }[]>([])
  const flipTimer = useRef(0)
  const flipDir = useRef<-1 | 0 | 1>(0)
  const pageRef = useRef(0)
  useEffect(() => {
    pageRef.current = page
  }, [page])

  const measureSlots = useCallback(() => {
    // ищем по всему корню: слоты живут в треке страниц, доке и открытой папке
    const root = rootRef.current
    if (!root) return
    const out: typeof slotsRef.current = []
    root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      const [zone, idx] = (el.dataset.slot ?? '').split(':')
      if (zone !== 'grid' && zone !== 'dock' && zone !== 'folder') return // библиотека не участвует в драге
      if (!el.offsetParent) return // слот на скрытой странице
      const r = el.getBoundingClientRect()
      out.push({ zone: zone as Zone, index: Number(idx), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height })
    })
    slotsRef.current = out
  }, [])

  const positionGhost = (clientX: number, clientY: number) => {
    const g = ghostRef.current
    if (!g) return
    const w = ghostWRef.current
    g.style.transform = `translate3d(${clientX - w / 2}px, ${clientY - w * 0.66}px, 0)`
  }

  const dragRef = useRef<DragInfo | null>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const hoverKeyRef = useRef<string | null>(null)
  const hoverTimerRef = useRef(0)
  const mergeRef = useRef<number | null>(null)
  const extractingRef = useRef(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const closeFolderSoon = () => {
    setFolderClosing(true)
    window.setTimeout(() => {
      setOpenFolderId(null)
      setFolderClosing(false)
      setExtracting(false)
      extractingRef.current = false
    }, 210)
  }

  // «Слипание»: из перетаскиваемого и целевого элемента собираем папку
  const doMerge = (from: DragInfo, targetIndex: number) => {
    const prev = layoutRef.current
    const g = [...prev.grid]
    const dk = [...prev.dock]
    let dragged: HomeItem | null = null
    let ti = targetIndex
    if (from.zone === 'grid') {
      if (from.index >= g.length) return
      dragged = g.splice(from.index, 1)[0] ?? null
      if (from.index < ti) ti -= 1
    } else if (from.zone === 'dock') {
      if (from.index >= dk.length) return
      dragged = { t: 'app', app: dk.splice(from.index, 1)[0] }
    } else return
    const target = g[ti]
    if (!target || !dragged) return
    const full = () => pushToast('Папка', `В папке максимум ${FOLDER_MAX} приложений`)
    if (target.t === 'app' && dragged.t === 'app') {
      g[ti] = { t: 'folder', id: genFolderId(), name: 'Папка', apps: [target.app, dragged.app] }
    } else if (target.t === 'folder' && dragged.t === 'app') {
      if (target.apps.length >= FOLDER_MAX) { full(); return }
      g[ti] = { ...target, apps: [...target.apps, dragged.app] }
    } else if (target.t === 'app' && dragged.t === 'folder') {
      if (dragged.apps.length >= FOLDER_MAX) { full(); return }
      g[ti] = { ...dragged, apps: [target.app, ...dragged.apps] }
    } else {
      const a = target as FolderItem
      const b = dragged as FolderItem
      if (a.apps.length + b.apps.length > FOLDER_MAX) { full(); return }
      g[ti] = { t: 'folder', id: a.id, name: a.name, apps: [...a.apps, ...b.apps] }
    }
    layoutRef.current = { grid: g, dock: dk }
    setLayout(layoutRef.current)
    buzz([12, 40, 18])
  }

  // Вынос приложения из папки на домашний экран (дроп за пределами панели)
  const extractToHome = (app: AppKey, folderId: string) => {
    const prev = layoutRef.current
    const idx = prev.grid.findIndex((it) => it.t === 'folder' && it.id === folderId)
    if (idx < 0) return
    const f = prev.grid[idx] as FolderItem
    if (!f.apps.includes(app)) return
    const appsLeft = f.apps.filter((a) => a !== app)
    const replacement: HomeItem | null =
      appsLeft.length >= 2
        ? { t: 'folder', id: folderId, name: f.name, apps: appsLeft }
        : appsLeft.length === 1
          ? { t: 'app', app: appsLeft[0] }
          : null
    const g: HomeItem[] = [...prev.grid]
    if (replacement) g[idx] = replacement
    else g.splice(idx, 1)
    // ближайший к пальцу слот сетки; координаты старой раскладки — после idx сдвиг
    const p = lastPointerRef.current
    let insertAt = idx
    let bestD = Infinity
    for (const s of slotsRef.current) {
      if (s.zone !== 'grid') continue
      const d = Math.hypot(p.x - s.cx, p.y - s.cy)
      if (d < Math.max(s.w, s.h) * 0.9 && d < bestD) {
        bestD = d
        insertAt = !replacement && s.index > idx ? s.index - 1 : s.index
      }
    }
    g.splice(Math.max(0, Math.min(g.length, insertAt)), 0, { t: 'app', app })
    layoutRef.current = { ...prev, grid: g }
    setLayout(layoutRef.current)
    pushToast('Домашний экран', `«${APP_TILE[app].label}» вынесен из папки`)
    closeFolderSoon()
  }

  const startDrag = (item: HomeItem, zone: Zone, index: number, folderId: string | null, clientX: number, clientY: number, tileW: number) => {
    dragActiveRef.current = true
    ghostWRef.current = tileW || 72
    setGhostW(tileW || 72)
    dragRef.current = { item, zone, index, folderId }
    lastPointerRef.current = { x: clientX, y: clientY }
    setArmed(null)
    setDrag({ item, zone, index, folderId })
    requestAnimationFrame(() => {
      measureSlots()
      positionGhost(clientX, clientY)
      const g = ghostRef.current
      if (g) g.style.opacity = '1'
    })

    const move = (ev: PointerEvent) => {
      if (ev.cancelable) ev.preventDefault()
      lastPointerRef.current = { x: ev.clientX, y: ev.clientY }
      positionGhost(ev.clientX, ev.clientY)
      const from = dragRef.current
      if (!from) return

      // ── Драг внутри открытой папки: реордер в панели, наружу — вынос ──
      if (from.zone === 'folder') {
        const pr = panelRef.current?.getBoundingClientRect()
        const outside = !pr || ev.clientX < pr.left - 6 || ev.clientX > pr.right + 6 || ev.clientY < pr.top - 6 || ev.clientY > pr.bottom + 6
        if (outside !== extractingRef.current) {
          extractingRef.current = outside
          setExtracting(outside)
          if (outside) buzz(6)
        }
        if (outside) return
        let bestF: { index: number; d: number } | null = null
        for (const s of slotsRef.current) {
          if (s.zone !== 'folder') continue
          const d = Math.hypot(ev.clientX - s.cx, ev.clientY - s.cy)
          const lim = Math.max(s.w, s.h) * 0.8
          if (d < lim && (!bestF || d < bestF.d)) bestF = { index: s.index, d }
        }
        if (!bestF || bestF.index === from.index || !from.folderId) return
        const f = layoutRef.current.grid.find((it): it is FolderItem => it.t === 'folder' && it.id === from.folderId)
        if (!f) return
        const apps = [...f.apps]
        const [moved] = apps.splice(from.index, 1)
        apps.splice(Math.max(0, Math.min(apps.length, bestF.index)), 0, moved)
        layoutRef.current = {
          ...layoutRef.current,
          grid: layoutRef.current.grid.map((it) => (it.t === 'folder' && it.id === from.folderId ? { ...it, apps } : it)),
        }
        setLayout(layoutRef.current)
        dragRef.current = { ...from, index: Math.max(0, Math.min(apps.length - 1, bestF.index)) }
        requestAnimationFrame(measureSlots)
        return
      }

      // ── Автопролистывание страниц у краёв ──
      const vw = window.innerWidth
      const dir: -1 | 0 | 1 = ev.clientX < 34 ? -1 : ev.clientX > vw - 34 ? 1 : 0
      const canFlip = dir !== 0 && pageRef.current + dir >= 0 && pageRef.current + dir <= PAGES - 2
      if (canFlip && flipDir.current !== dir) {
        flipDir.current = dir
        const d = dir // фиксируем направление: апдейтер React выполнится позже
        window.clearTimeout(flipTimer.current)
        flipTimer.current = window.setTimeout(() => {
          setPage((p) => Math.max(0, Math.min(PAGES - 1, p + d)))
          flipDir.current = 0
        }, 420)
      } else if (!canFlip && flipDir.current !== 0) {
        window.clearTimeout(flipTimer.current)
        flipDir.current = 0
      }

      // ── Ближайший слот сетки/дока ──
      let best: { zone: Zone; index: number; d: number; w: number; h: number } | null = null
      for (const s of slotsRef.current) {
        if (s.zone === 'folder') continue
        const d = Math.hypot(ev.clientX - s.cx, ev.clientY - s.cy)
        const lim = Math.max(s.w, s.h) * 0.8
        if (d < lim && (!best || d < best.d)) best = { zone: s.zone, index: s.index, d, w: s.w, h: s.h }
      }

      // ── «Слипание» в папку: наведение на иконку/папку сетки с задержкой ──
      const slotKey = best ? `${best.zone}:${best.index}` : null
      const tItem = best && best.zone === 'grid' ? layoutRef.current.grid[best.index] : null
      const canMerge =
        !!best && !!tItem && best.zone === 'grid' &&
        !(from.zone === 'grid' && from.index === best.index) &&
        best.d < Math.max(best.w, best.h) * 0.62
      if (slotKey !== hoverKeyRef.current) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = 0
        hoverKeyRef.current = slotKey
        if (mergeRef.current !== null) {
          mergeRef.current = null
          setMergeAt(null)
        }
      }
      if (canMerge && best && !hoverTimerRef.current && mergeRef.current === null) {
        const idx = best.index
        hoverTimerRef.current = window.setTimeout(() => {
          hoverTimerRef.current = 0
          mergeRef.current = idx
          setMergeAt(idx)
          buzz(8)
        }, MERGE_MS)
      } else if (!canMerge && hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = 0
      }
      const dwellPending = canMerge && hoverTimerRef.current !== 0
      const merging = mergeRef.current !== null && !!best && best.zone === 'grid' && best.index === mergeRef.current
      if (dwellPending || merging) return // ждём решения — раскладку не двигаем

      if (!best) return
      const prev = layoutRef.current
      let g = [...prev.grid]
      let dk = [...prev.dock]
      const fromItem: HomeItem | null =
        from.zone === 'grid'
          ? g.splice(from.index, 1)[0] ?? null
          : from.zone === 'dock'
            ? { t: 'app', app: dk.splice(from.index, 1)[0] }
            : null
      if (!fromItem) return
      let nextFrom: { zone: Zone; index: number }
      if (best.zone === 'grid') {
        // best.index — индекс целевого слота в текущей раскладке: после удаления
        // вставляем ровно в него, тогда иконка занимает место цели
        const at = Math.max(0, Math.min(g.length, best.index))
        g.splice(at, 0, fromItem)
        nextFrom = { zone: 'grid', index: at }
      } else if (fromItem.t === 'folder') {
        return // папки в доке не живут
      } else if (dk.length >= DOCK_MAX && from.zone === 'dock') {
        // док полон: обмен внутри дока
        const t = Math.max(0, Math.min(dk.length - 1, best.index))
        dk[from.index] = dk[t]
        dk[t] = fromItem.app
        nextFrom = { zone: 'dock', index: t }
      } else if (dk.length >= DOCK_MAX) {
        // док полон, тащим из сетки: меняемся с иконкой дока
        const t = Math.max(0, Math.min(dk.length - 1, best.index))
        const displaced = dk[t]
        dk[t] = fromItem.app
        g.splice(Math.max(0, Math.min(g.length, from.zone === 'grid' ? Math.min(from.index, g.length) : g.length)), 0, { t: 'app', app: displaced })
        nextFrom = { zone: 'dock', index: t }
      } else {
        const t = Math.max(0, Math.min(dk.length, best.index))
        dk.splice(t, 0, fromItem.app)
        nextFrom = { zone: 'dock', index: t }
      }
      layoutRef.current = { grid: g, dock: dk }
      setLayout(layoutRef.current)
      dragRef.current = { ...from, ...nextFrom }
      requestAnimationFrame(measureSlots)
    }

    const end = () => {
      cleanup()
      window.clearTimeout(flipTimer.current)
      flipDir.current = 0
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = 0
      hoverKeyRef.current = null
      const from = dragRef.current
      const m = mergeRef.current
      const wasFolder = from?.zone === 'folder'
      const folderId = from?.folderId ?? null
      const draggedItem = from?.item ?? null
      dragActiveRef.current = false
      movedRef.current = false
      dragRef.current = null
      mergeRef.current = null
      extractingRef.current = false
      setDrag(null)
      setMergeAt(null)
      setExtracting(false)
      if (wasFolder && draggedItem && draggedItem.t === 'app' && folderId) {
        // отпустили за пределами панели → выносим приложение на домашний экран
        const pr = panelRef.current?.getBoundingClientRect()
        const p = lastPointerRef.current
        const outside = !pr || p.x < pr.left - 6 || p.x > pr.right + 6 || p.y < pr.top - 6 || p.y > pr.bottom + 6
        if (outside) {
          extractToHome(draggedItem.app, folderId)
          buzz(12)
        }
        return
      }
      if (from && m !== null) doMerge(from, m)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end as EventListener)
      window.removeEventListener('pointercancel', end as EventListener)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  // призрак позиционируется до первой отрисовки (rAF может сработать раньше маунта)
  useLayoutEffect(() => {
    if (!drag) return
    const g = ghostRef.current
    if (g) {
      g.style.opacity = '1'
      const p = lastPointerRef.current
      positionGhost(p.x, p.y)
    }
  }, [drag])

  // после смены страницы во время драга — переизмерить слоты
  useEffect(() => {
    if (drag) requestAnimationFrame(measureSlots)
  }, [page, drag, measureSlots])

  // ─── Зажатие иконки: подъём → перетаскивание / меню ────────────────────────
  const iconPointerDown = (item: HomeItem, zone: 'grid' | 'dock', index: number) => (e: React.PointerEvent) => {
    if (e.button > 0) return
    const startX = e.clientX
    const startY = e.clientY
    const el = e.currentTarget as HTMLElement
    let lifted = false
    let done = false
    const liftTimer = window.setTimeout(() => {
      lifted = true
      setArmed({ item, zone, index, folderId: null })
      buzz(10)
    }, HOLD_MS)
    const clear = () => {
      window.clearTimeout(liftTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    const onMove = (ev: PointerEvent) => {
      if (done) return
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      if (!lifted && dist > 8) {
        // движение до подъёма: в редактировании начинаем драг, иначе это свайп страниц
        done = true
        clear()
        if (editRef.current) startDrag(item, zone, index, null, ev.clientX, ev.clientY, el.getBoundingClientRect().width)
        return
      }
      if (lifted && dist > 6) {
        // подъём был, палец поехал: перетаскивание
        done = true
        clear()
        startDrag(item, zone, index, null, ev.clientX, ev.clientY, el.getBoundingClientRect().width)
      }
    }
    const onUp = () => {
      clear()
      if (lifted && !done) {
        // зажал и отпустил без движения: меню («О приложении» / папка)
        suppressClickRef.current = true
        window.setTimeout(() => { suppressClickRef.current = false }, 400)
        setArmed(null)
        if (item.t === 'folder') openMenuAt({ kind: 'folder', folderId: item.id }, startX, startY)
        else openMenuAt({ kind: 'app', app: item.app, ctx: 'home' }, startX, startY)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // зажатие иконки внутри открытой папки
  const folderIconPointerDown = (folderId: string) => (app: AppKey, index: number) => (e: React.PointerEvent) => {
    if (e.button > 0) return
    const startX = e.clientX
    const startY = e.clientY
    const el = e.currentTarget as HTMLElement
    let lifted = false
    let done = false
    const liftTimer = window.setTimeout(() => {
      lifted = true
      setArmed({ item: { t: 'app', app }, zone: 'folder', index, folderId })
      buzz(10)
    }, HOLD_MS)
    const clear = () => {
      window.clearTimeout(liftTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    const onMove = (ev: PointerEvent) => {
      if (done) return
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      if (!lifted && dist > 8) { done = true; clear(); return }
      if (lifted && dist > 6) {
        done = true
        clear()
        startDrag({ t: 'app', app }, 'folder', index, folderId, ev.clientX, ev.clientY, el.getBoundingClientRect().width)
      }
    }
    const onUp = () => {
      clear()
      if (lifted && !done) {
        suppressClickRef.current = true
        window.setTimeout(() => { suppressClickRef.current = false }, 400)
        setArmed(null)
        openMenuAt({ kind: 'app', app, ctx: 'folder', folderId }, startX, startY)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // в режиме редактирования тап по иконке открывает меню (быстро и понятно)
  const slotClick = (item: HomeItem) => (e: React.MouseEvent) => {
    if (movedRef.current || dragActiveRef.current || suppressClickRef.current) return
    if (edit) {
      if (item.t === 'folder') openMenuAt({ kind: 'folder', folderId: item.id }, e.clientX, e.clientY)
      else openMenuAt({ kind: 'app', app: item.app, ctx: 'home' }, e.clientX, e.clientY)
      return
    }
    if (item.t === 'folder') setOpenFolderId(item.id)
    else openAppFromHome(item.app)
  }

  const folderIconClick = (folderId: string) => (app: AppKey) => (e: React.MouseEvent) => {
    if (movedRef.current || dragActiveRef.current || suppressClickRef.current) return
    if (edit) { openMenuAt({ kind: 'app', app, ctx: 'folder', folderId }, e.clientX, e.clientY); return }
    openAppFromHome(app)
  }

  // ─── Действия меню ─────────────────────────────────────────────────────────
  const removeAppFromLayout = (app: AppKey) => {
    const prev = layoutRef.current
    const dock = prev.dock.filter((a) => a !== app)
    const grid: HomeItem[] = []
    for (const it of prev.grid) {
      if (it.t === 'app') {
        if (it.app !== app) grid.push(it)
      } else {
        const apps = it.apps.filter((a) => a !== app)
        if (apps.length === 1) grid.push({ t: 'app', app: apps[0] })
        else if (apps.length > 1) grid.push({ ...it, apps })
      }
    }
    layoutRef.current = { grid, dock }
    setLayout(layoutRef.current)
  }
  const removeFromHome = (app: AppKey) => {
    removeAppFromLayout(app)
    pushToast('Домашний экран', `«${APP_TILE[app].label}» убран с экрана. Иконка осталась в Библиотеке`)
  }
  const addToHome = (app: AppKey) => {
    const prev = layoutRef.current
    if (prev.grid.some((it) => it.t === 'folder' && it.apps.includes(app))) {
      // приложение в папке — выносим на главный экран
      unfolderApp(app, (prev.grid.find((it): it is FolderItem => it.t === 'folder' && it.apps.includes(app)) as FolderItem).id)
      return
    }
    if (prev.dock.includes(app) || prev.grid.some((it) => it.t === 'app' && it.app === app)) return
    layoutRef.current = { ...prev, grid: [...prev.grid, { t: 'app', app }] }
    setLayout(layoutRef.current)
    pushToast('Домашний экран', `«${APP_TILE[app].label}» добавлен на главный экран`)
  }
  const unfolderApp = (app: AppKey, folderId: string) => {
    const prev = layoutRef.current
    const idx = prev.grid.findIndex((it) => it.t === 'folder' && it.id === folderId)
    if (idx < 0) return
    const f = prev.grid[idx] as FolderItem
    const appsLeft = f.apps.filter((a) => a !== app)
    const g = [...prev.grid]
    if (appsLeft.length >= 2) g[idx] = { t: 'folder', id: folderId, name: f.name, apps: appsLeft }
    else if (appsLeft.length === 1) g[idx] = { t: 'app', app: appsLeft[0] }
    else g.splice(idx, 1)
    g.push({ t: 'app', app })
    layoutRef.current = { ...prev, grid: g }
    setLayout(layoutRef.current)
    pushToast('Домашний экран', `«${APP_TILE[app].label}» вынесен из папки`)
  }
  const dissolveFolder = (folderId: string) => {
    const prev = layoutRef.current
    const f = prev.grid.find((it): it is FolderItem => it.t === 'folder' && it.id === folderId)
    if (!f) return
    const g = prev.grid.flatMap((it): HomeItem[] =>
      it.t === 'folder' && it.id === folderId ? it.apps.map((app) => ({ t: 'app', app })) : [it],
    )
    layoutRef.current = { ...prev, grid: g }
    setLayout(layoutRef.current)
    pushToast('Домашний экран', `Папка «${f.name}» разобрана`)
  }
  const renameFolder = (folderId: string, name: string) => {
    const clean = name.trim().slice(0, 24) || 'Папка'
    layoutRef.current = {
      ...layoutRef.current,
      grid: layoutRef.current.grid.map((it) => (it.t === 'folder' && it.id === folderId ? { ...it, name: clean } : it)),
    }
    setLayout(layoutRef.current)
  }
  const openInfo = (app: AppKey) => {
    setMenu(null)
    setInfo(app)
  }

  // Escape закрывает меню/шит/папку/редактирование
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (menu) setMenu(null)
      else if (info) setInfo(null)
      else if (openFolderId && !folderClosing) closeFolderSoon()
      else if (edit) setEdit(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, info, openFolderId, folderClosing, edit])

  // ─── Слоты сетки/дока ──────────────────────────────────────────────────────
  const page0Items = layout.grid.slice(0, PAGE0_SLOTS)
  const page1Items = layout.grid.slice(PAGE0_SLOTS)
  const jiggleMode = edit || !!drag || !!armed

  const renderSlot = (item: HomeItem, zone: 'grid' | 'dock', index: number, small: boolean, enterDelay?: number) => {
    const isDragging = !!drag && drag.zone === zone && drag.index === index && itemKey(drag.item) === itemKey(item)
    const isArmed = !!armed && armed.zone === zone && armed.index === index && itemKey(armed.item) === itemKey(item)
    const isMerge = zone === 'grid' && mergeAt === index && drag?.zone !== 'folder' && !isDragging
    const jiggleCls = isArmed ? 'os-lift' : jiggleMode ? `os-jiggle ${index % 2 ? 'os-jiggle-late' : ''}` : isMerge ? `os-merge ${dark ? 'os-merge-dark' : ''}` : ''
    const enterProps = {
      tileW: small ? undefined : 62,
      enter: enterDelay !== undefined,
      enterDelay: enterDelay ?? 0,
    }
    return (
      <div
        key={`${zone}:${index}:${itemKey(item)}`}
        data-slot={`${zone}:${index}`}
        className="relative flex flex-col items-center"
        style={isDragging ? { opacity: 0.3 } : undefined}
      >
        {item.t === 'folder' ? (
          <FolderTile
            item={item}
            dark={dark}
            tone={tone}
            tileClass={jiggleCls}
            badge={item.apps.reduce((n, a) => n + (a === 'avito' ? unreadChats : 0), 0)}
            onPointerDown={iconPointerDown(item, zone, index)}
            onClick={slotClick(item)}
            {...enterProps}
          />
        ) : (
          <AppIcon
            icon={APP_TILE[item.app].icon}
            label={APP_TILE[item.app].label}
            image={APP_TILE[item.app].image || undefined}
            imageBg={APP_TILE[item.app].background}
            badge={item.app === 'avito' ? unreadChats : undefined}
            small={small}
            hideLabel={small}
            tone={tone}
            staticTile={jiggleMode}
            tileClass={jiggleCls}
            onPointerDown={iconPointerDown(item, zone, index)}
            onClick={slotClick(item)}
            {...enterProps}
          />
        )}
      </div>
    )
  }

  // ─── Библиотека ────────────────────────────────────────────────────────────
  const q = libQuery.trim().toLowerCase()
  const allApps = useMemo(
    () => [...layout.dock, ...layout.grid.flatMap((it) => itemApps(it))],
    [layout],
  )
  const foundApps = useMemo(() => {
    if (!q) return null
    return allApps
      .concat((Object.keys(APP_TILE) as AppKey[]).filter((a) => !allApps.includes(a)))
      .filter((a, i, arr) => arr.indexOf(a) === i)
      .filter((a) => APP_TILE[a].label.toLowerCase().includes(q))
  }, [q, allApps])
  const visibleSections = useMemo(() => {
    if (q) return []
    return LIB_SECTIONS.filter((s) => libChip === 'all' || s.chip === libChip)
  }, [q, libChip])

  const libIcon = (app: AppKey) => (
    <div key={app} className="relative flex flex-col items-center">
      <div className="flex w-[54px] flex-col items-center">
        <AppIcon
          icon={APP_TILE[app].icon}
          label={APP_TILE[app].label}
          image={APP_TILE[app].image || undefined}
          imageBg={APP_TILE[app].background}
          tone={tone}
          staticTile
          tileRadius="rounded-[15px]"
          labelW={68}
          onLongPress={() => openMenuAt({ kind: 'app', app, ctx: 'lib' }, window.innerWidth / 2, window.innerHeight / 2 - 40)}
          onClick={() => onOpenApp(app)}
        />
      </div>
    </div>
  )

  const trackStyle = { transform: `translateX(${-page * (100 / PAGES)}%)`, transition: SETTLE_EASE, willChange: 'transform' as const }

  const openFolderItem: FolderItem | null = openFolderId
    ? (layout.grid.find((it) => it.t === 'folder' && it.id === openFolderId) as FolderItem | undefined) ?? null
    : null

  return (
    <div
      ref={rootRef}
      className={`absolute inset-0 flex flex-col pt-12 select-none ${wallpaperClass(wallpaper)}`}
      role="region"
      aria-label="Домашний экран"
    >
      {/* тёмная тема: глубокий скрим поверх светлых обоев */}
      {dark && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-[#0B0C0E]/[0.88]" />
      )}
      {/* скрим читаемости статус-бара */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-0 h-24 ${
          lightTone ? 'bg-gradient-to-b from-white/60 via-white/20 to-transparent' : 'bg-gradient-to-b from-black/45 via-black/15 to-transparent'
        }`}
      />

      {/* режим редактирования: плашка «Готово» */}
      {edit && (
        <button
          type="button"
          onClick={() => setEdit(false)}
          className="os-pop absolute right-3 top-12 z-[67] flex h-9 items-center rounded-full bg-neutral-900/85 px-4 text-[12.5px] font-bold text-white shadow-lg backdrop-blur-sm outline-none transition-transform duration-150 active:scale-95"
        >
          <Check className="mr-1 size-3.5" aria-hidden="true" />
          Готово
        </button>
      )}

      {/* ─── Панели (свайп влево/вправо, вниз — библиотека) ─── */}
      <div className="relative z-10 flex-1 touch-none overflow-hidden" onPointerDown={pages.onPointerDown} onClickCapture={guardClick}>
        <div ref={trackRef} className="flex h-full w-[300%]" style={trackStyle}>
          {/* Панель 1: виджеты + сетка */}
          <section className="flex h-full w-1/3 flex-col" aria-label="Главный экран" aria-hidden={page !== 0}>
            <div className="flex items-stretch gap-2.5 px-4">
              <WeatherWidget dark={dark} onOpenApp={openAppFromHome} enterDelay={entrance ? 0 : undefined} />
              <TodayWidget dark={dark} widgets={widgets} online={online} day={day} onOpenApp={openAppFromHome} enterDelay={entrance ? 32 : undefined} />
            </div>
            <div className="mt-5 grid grid-cols-4 gap-x-2 gap-y-[18px] px-4">
              {page0Items.map((item, i) => renderSlot(item, 'grid', i, false, entrance ? 80 + i * 30 : undefined))}
            </div>
            <div className="flex-1" />
          </section>

          {/* Панель 2: продолжение сетки */}
          <section className="flex h-full w-1/3 flex-col" aria-label="Вторая страница" aria-hidden={page !== 1}>
            <div className="mt-2 grid grid-cols-4 content-start gap-x-2 gap-y-[18px] px-4">
              {page1Items.map((item, i) => renderSlot(item, 'grid', PAGE0_SLOTS + i, false))}
            </div>
            <div className="flex-1" />
          </section>

          {/* Панель 3: Библиотека приложений */}
          <section className="flex h-full w-1/3 flex-col" aria-label="Библиотека приложений" aria-hidden={page !== 2}>
            <div className="px-4">
              <div
                className={`flex h-11 items-center gap-2.5 rounded-full px-4 outline-none ring-1 transition-colors ${
                  dark ? 'bg-white/[0.10] ring-white/[0.08]' : 'bg-white/75 ring-black/[0.04] backdrop-blur-xl'
                }`}
              >
                <Search className={`size-4 shrink-0 ${dark ? 'text-white/60' : TXT_TERTIARY}`} aria-hidden="true" />
                <input
                  value={libQuery}
                  onChange={(e) => setLibQuery(e.target.value)}
                  placeholder="Поиск приложений"
                  aria-label="Поиск приложений"
                  className={`min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-[rgba(60,60,67,0.35)] ${dark ? 'text-white' : 'text-neutral-800'}`}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                {libQuery ? (
                  <button type="button" aria-label="Очистить" onClick={() => setLibQuery('')} className="shrink-0 outline-none">
                    <X className={`size-4 ${dark ? 'text-white/50' : TXT_TERTIARY}`} aria-hidden="true" />
                  </button>
                ) : (
                  <MicGlyph dark={dark} />
                )}
              </div>
              {/* чипы категорий */}
              <div className="mt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {LIB_CHIPS.map((c) => {
                  const on = libChip === c.key
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setLibChip(c.key)}
                      className="flex h-11 shrink-0 items-center outline-none transition-transform duration-150 active:scale-95"
                    >
                      <span
                        className={`flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-colors duration-150 ${
                          on
                            ? 'bg-black text-white'
                            : dark
                              ? 'bg-white/[0.10] text-white/70'
                              : 'bg-white/75 text-[rgba(60,60,67,0.62)] ring-1 ring-black/[0.04] backdrop-blur-xl'
                        }`}
                      >
                        {c.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2 [scrollbar-width:none]">
              {foundApps ? (
                <div className={`rounded-[24px] p-3 ring-1 backdrop-blur-xl ${dark ? 'bg-white/[0.08] ring-white/[0.06]' : `bg-white/80 ring-black/[0.04] ${GLASS_CARD}`}`}>
                  {foundApps.length === 0 ? (
                    <p className={`py-6 text-center text-[13px] font-medium ${dark ? 'text-white/40' : TXT_TERTIARY}`}>Ничего не найдено</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                      {foundApps.map((a, i) => libIcon(a))}
                    </div>
                  )}
                </div>
              ) : (
                visibleSections.map((s) => (
                  <div key={s.key} className={`rounded-[24px] p-3 ring-1 backdrop-blur-xl ${dark ? 'bg-white/[0.08] ring-white/[0.06]' : `bg-white/80 ring-black/[0.04] ${GLASS_CARD}`}`}>
                    <div className="flex items-center justify-between px-1 pb-1.5">
                      <p className={`text-[16px] font-semibold ${dark ? 'text-white' : TXT_PRIMARY}`}>{s.title}</p>
                      <ChevronRight className={`size-4 ${dark ? 'text-white/40' : TXT_TERTIARY}`} aria-hidden="true" />
                    </div>
                    <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                      {s.apps.map((a) => libIcon(a))}
                    </div>
                  </div>
                ))
              )}
              {foundApps && foundApps.length === 0 && (
                <p className={`pb-2 text-center text-[11px] ${dark ? 'text-white/40' : TXT_TERTIARY}`}>
                  Свайп вверх вернёт на главный экран
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Мини-плеер над точками страниц */}
      <MiniPlayer onOpenApp={openAppFromHome} />

      {/* Точки страниц: активная — пилюля 18px через scaleX (анимация только transform) */}
      <div
        style={entrance ? ({ ['--d' as string]: '560ms' } as React.CSSProperties) : undefined}
        className={`z-10 mb-2 flex items-center justify-center gap-1.5 ${entrance ? 'os-enter' : ''}`}
        aria-hidden="true"
      >
        {Array.from({ length: PAGES }).map((_, i) => (
          <span
            key={i}
            className={`size-[7px] rounded-full transition-transform duration-300 ${i === page ? 'scale-x-[2.55]' : ''} ${
              lightTone ? (i === page ? 'bg-neutral-700' : 'bg-neutral-400/60') : i === page ? 'bg-white' : 'bg-white/40'
            }`}
          />
        ))}
      </div>

      {/* ─── Док: матовая стеклянная панель ─── */}
      <div className="z-10 mx-3 mb-2">
        <div
          className={`grid grid-cols-4 gap-1 rounded-[28px] p-[10px] ${
            dark
              ? 'bg-white/[0.10] ring-1 ring-white/[0.08] backdrop-blur-2xl'
              : 'bg-white/55 ring-1 ring-black/[0.05] shadow-[0_12px_32px_rgba(10,10,15,0.10)] backdrop-blur-2xl'
          }`}
        >
          {layout.dock.map((app, i) => renderSlot({ t: 'app', app }, 'dock', i, true, entrance ? 610 + i * 30 : undefined))}
        </div>
      </div>

      {/* ─── Открытая папка ─── */}
      {openFolderItem && (
        <FolderView
          key={openFolderItem.id}
          item={openFolderItem}
          dark={dark}
          tone={tone}
          unreadChats={unreadChats}
          jiggle={jiggleMode}
          armedIndex={armed?.zone === 'folder' && armed.folderId === openFolderItem.id ? armed.index : null}
          dragApp={drag?.zone === 'folder' && drag.item.t === 'app' ? drag.item.app : null}
          closing={folderClosing}
          extracting={extracting}
          panelRef={panelRef}
          onPointerDownIcon={folderIconPointerDown(openFolderItem.id)}
          onIconClick={folderIconClick(openFolderItem.id)}
          onClose={closeFolderSoon}
          onRename={(name) => renameFolder(openFolderItem.id, name)}
        />
      )}

      {/* ─── Призрак перетаскиваемой иконки ─── */}
      {drag && (
        <div
          ref={ghostRef}
          className="pointer-events-none fixed left-0 top-0 z-[90] will-change-transform"
          style={{ width: ghostW, transform: 'translate3d(-500px,-500px,0)' }}
          aria-hidden="true"
        >
          {drag.item.t === 'folder' ? (
            <span className={`os-ghost-tile block w-full ${dark ? 'os-merge-dark' : ''}`}>
              <FolderGlass apps={drag.item.apps} dark={dark} />
            </span>
          ) : (
            <AppIcon
              icon={APP_TILE[drag.item.app].icon}
              label={APP_TILE[drag.item.app].label}
              image={APP_TILE[drag.item.app].image || undefined}
              imageBg={APP_TILE[drag.item.app].background}
              tone={tone}
              staticTile
              tileClass="os-ghost-tile"
              onClick={() => {}}
            />
          )}
        </div>
      )}

      {/* ─── Контекстное меню иконки / папки ─── */}
      {menu && (
        <IconMenu
          menu={menu}
          dark={dark}
          onAbout={() => { if (menu.kind === 'app') openInfo(menu.app) }}
          onEditScreen={() => { setMenu(null); setEdit(true) }}
          onRemove={() => {
            setMenu(null)
            if (menu.kind === 'folder') dissolveFolder(menu.folderId)
            else removeFromHome(menu.app)
          }}
          onAddHome={() => { setMenu(null); if (menu.kind === 'app') addToHome(menu.app) }}
          onRename={() => { setMenu(null); if (menu.kind === 'folder') setOpenFolderId(menu.folderId) }}
          onUnfolder={() => {
            setMenu(null)
            if (menu.kind === 'app' && menu.ctx === 'folder' && menu.folderId) {
              unfolderApp(menu.app, menu.folderId)
              closeFolderSoon()
            }
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {/* ─── Шит «О приложении» ─── */}
      {info && (
        <AppInfoSheet
          app={info}
          onClose={() => setInfo(null)}
          onOpenApp={openAppFromHome}
          canRemove
          onRemove={() => removeFromHome(info)}
        />
      )}
    </div>
  )
}

// Микрофон для строки поиска библиотеки (декор, как в макете)
function MicGlyph({ dark }: { dark: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-4 shrink-0 ${dark ? 'text-white/50' : 'text-neutral-400'}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  )
}

// memo: page.tsx ре-рендерится на тиках батареи/онлайна — лончер не должен
// перевоссоздавать дерево иконок из-за этого.
export default memo(HomeScreen)
