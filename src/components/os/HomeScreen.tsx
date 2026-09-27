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
//   • Долгий тап в Библиотеке: «О приложении» и «На главный экран».
// Раскладка сохраняется в localStorage; новые приложения из обновлений
// автоматически добавляются в конец сетки.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowDown, ArrowUp, Check, ChevronRight, Navigation, Plus, Search, X,
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
const LAYOUT_KEY = 'avito_sim_home_layout_v1'
type Zone = 'grid' | 'dock'
interface HomeLayout { grid: AppKey[]; dock: AppKey[] }
const DOCK_MAX = 4
const PAGE0_SLOTS = 16 // виджеты + сетка 4×4
const PAGES = 3 // две страницы сетки + библиотека

function loadLayout(): HomeLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const obj = JSON.parse(raw) as { grid?: unknown; dock?: unknown }
      const valid = (arr: unknown): AppKey[] =>
        Array.isArray(arr) ? arr.filter((a): a is AppKey => typeof a === 'string' && a in APP_TILE) : []
      const dock = valid(obj.dock).slice(0, DOCK_MAX)
      const grid = valid(obj.grid).filter((a) => !dock.includes(a))
      // Приложения, появившиеся в обновлениях, автоматически встают в конец сетки
      const known = new Set([...grid, ...dock])
      const missing = [...DEFAULT_DOCK, ...DEFAULT_GRID].filter((a) => !known.has(a))
      return { grid: [...grid, ...missing], dock: dock.length ? dock : [...DEFAULT_DOCK] }
    }
  } catch { /* приватный режим — дефолтная раскладка */ }
  return { grid: [...DEFAULT_GRID], dock: [...DEFAULT_DOCK] }
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
function CondGlyph({ cond, className }: { cond: Condition; className: string }) {
  if (cond === 'Солнечно') return <span className={className}>☀️</span>
  if (cond === 'Облачно') return <span className={className}>🌤️</span>
  if (cond === 'Пасмурно') return <span className={className}>☁️</span>
  if (cond === 'Дождь') return <span className={className}>🌧️</span>
  if (cond === 'Снег') return <span className={className}>❄️</span>
  if (cond === 'Гроза') return <span className={className}>⛈️</span>
  return <span className={className}>🌈</span>
}

function WeatherWidget({ dark, onOpenApp }: { dark: boolean; onOpenApp: (a: AppKey) => void }) {
  const w = useMemo(() => weatherNow(0), [])
  return (
    <button
      type="button"
      aria-label={`Погода: ${w.city}, ${fmtDeg(w.temp)}, ${w.cond}`}
      onClick={() => onOpenApp('weather')}
      className={`flex flex-1 flex-col justify-between rounded-[24px] p-3.5 text-left outline-none transition-transform duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-black/20 ${
        dark ? 'bg-white/[0.10] ring-1 ring-white/[0.08]' : 'bg-white/85 ring-1 ring-black/[0.04] shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)]'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <CondGlyph cond={w.cond} className="text-[20px] leading-none" />
        <span className={`text-[13px] font-semibold ${dark ? 'text-white' : 'text-neutral-800'}`}>{w.city}</span>
        <Navigation className={`size-3 ${dark ? 'text-white/50' : 'text-neutral-400'}`} aria-hidden="true" />
      </span>
      <p className={`mt-1 text-[30px] font-semibold leading-none tracking-tight ${dark ? 'text-white' : 'text-neutral-900'}`}>
        {fmtDeg(w.temp)}
      </p>
      <p className={`mt-1.5 text-[11px] leading-tight ${dark ? 'text-white/60' : 'text-neutral-500'}`}>{w.cond}</p>
      <p className={`mt-0.5 flex items-center gap-2 text-[11px] font-medium tabular-nums ${dark ? 'text-white/60' : 'text-neutral-500'}`}>
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
  dark, widgets, online, day, onOpenApp,
}: {
  dark: boolean
  widgets: WidgetKey[]
  online: number
  day: { quest: { progress: number; target: number } | null; delivery: { status: string } | null; myPlace: number | null }
  onOpenApp: (a: AppKey) => void
}) {
  const now = useClock()
  const dateStr = now
    ? now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
    : '\u00A0'

  const rows: { key: string; dot: string; text: string; run: () => void }[] = []
  if (widgets.includes('clock') && now) {
    rows.push({
      key: 'clock',
      dot: 'bg-neutral-400',
      text: `Часы · ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
      run: () => onOpenApp('clock'),
    })
  }
  if (widgets.includes('online')) {
    rows.push({
      key: 'online',
      dot: 'bg-emerald-500',
      text: `Сейчас в игре: ${online}`,
      run: () => onOpenApp('leaderboard'),
    })
  }
  if (widgets.includes('quest')) {
    rows.push({
      key: 'quest',
      dot: 'bg-sky-500',
      text: day.quest ? `Задание · ${day.quest.progress} из ${day.quest.target}` : 'Задания · всё чисто',
      run: () => onOpenApp('career'),
    })
  }
  if (widgets.includes('delivery')) {
    rows.push({
      key: 'delivery',
      dot: 'bg-rose-500',
      text: day.delivery ? `Посылка · ${day.delivery.status}` : 'Посылок нет',
      run: () => onOpenApp('delivery'),
    })
  }

  return (
    <div
      className={`flex w-[46%] shrink-0 flex-col rounded-[24px] p-3.5 ${
        dark ? 'bg-white/[0.10] ring-1 ring-white/[0.08]' : 'bg-white/85 ring-1 ring-black/[0.04] shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)]'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className={`truncate text-[13px] font-bold capitalize ${dark ? 'text-white' : 'text-neutral-900'}`} suppressHydrationWarning>
          {dateStr}
        </p>
        <button
          type="button"
          aria-label="Открыть задания"
          onClick={() => onOpenApp('career')}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full outline-none transition-transform duration-150 active:scale-90 ${
            dark ? 'bg-white/10 text-white/80' : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col justify-between gap-1.5">
        {rows.length === 0 && (
          <p className={`text-[11px] leading-tight ${dark ? 'text-white/45' : 'text-neutral-400'}`}>
            Добавьте строки в Настройках
          </p>
        )}
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={r.run}
            className="flex min-h-[18px] items-start gap-1.5 text-left outline-none"
          >
            <span aria-hidden="true" className={`mt-[4px] size-[7px] shrink-0 rounded-full ${r.dot}`} />
            <span className={`text-[11px] font-medium leading-tight ${dark ? 'text-white/80' : 'text-neutral-600'}`}>
              {r.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Контекстное меню иконки ────────────────────────────────────────────────
function IconMenu({
  menu, dark, onAbout, onEditScreen, onRemove, onAddHome, onClose,
}: {
  menu: { app: AppKey; x: number; y: number; lib: boolean }
  dark: boolean
  onAbout: () => void
  onEditScreen: () => void
  onRemove: () => void
  onAddHome: () => void
  onClose: () => void
}) {
  const item = 'flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-medium outline-none transition-colors duration-150'
  const tone = dark
    ? 'bg-[#1C1C1E]/95 text-white ring-1 ring-white/[0.12] shadow-2xl'
    : 'bg-white/95 text-neutral-800 ring-1 ring-black/[0.06] shadow-[0_22px_50px_-16px_rgba(15,23,42,0.45)]'
  const hover = dark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'

  return (
    <div className="absolute inset-0 z-[66]" role="menu" aria-label="Меню приложения">
      <button type="button" aria-label="Закрыть меню" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default" />
      <div
        className={`os-pop absolute w-[196px] overflow-hidden rounded-[18px] p-1.5 backdrop-blur-xl ${tone}`}
        style={{ left: menu.x, top: menu.y, transform: 'translate(-50%, -108%)' }}
      >
        <button type="button" role="menuitem" onClick={onAbout} className={`${item} ${hover}`}>
          <Search className="size-4 opacity-60" aria-hidden="true" />
          О приложении
        </button>
        {menu.lib ? (
          <button type="button" role="menuitem" onClick={onAddHome} className={`${item} ${hover}`}>
            <Plus className="size-4 opacity-60" aria-hidden="true" />
            На главный экран
          </button>
        ) : (
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
  const dark = theme === 'dark'
  const wall = wallpaperById(wallpaper)
  // Тон текстов: светлые обои + светлая тема → графитовые подписи; иначе белые
  const lightTone = !!wall.light && !dark

  const [layout, setLayout] = useState<HomeLayout>(loadLayout)
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])
  const [page, setPage] = useState(0)
  const [edit, setEdit] = useState(false)
  const [menu, setMenu] = useState<{ app: AppKey; x: number; y: number; lib: boolean } | null>(null)
  const [info, setInfo] = useState<AppKey | null>(null)
  const [drag, setDrag] = useState<{ app: AppKey; zone: Zone; index: number } | null>(null)
  const [armed, setArmed] = useState<{ app: AppKey; zone: Zone; index: number } | null>(null)
  const [libChip, setLibChip] = useState<LibChip>('all')
  const [libQuery, setLibQuery] = useState('')

  const day = useDayData()
  const rootRef = useRef<HTMLDivElement>(null)

  // persist раскладки
  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
  }, [layout])

  const openMenuAt = useCallback((app: AppKey, clientX: number, clientY: number, lib: boolean) => {
    const r = rootRef.current?.getBoundingClientRect()
    setMenu({ app, x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0), lib })
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
    // ищем по всему корню: слоты живут и в треке страниц, и в доке
    const root = rootRef.current
    if (!root) return
    const out: typeof slotsRef.current = []
    root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      const [zone, idx] = (el.dataset.slot ?? '').split(':')
      if (zone !== 'grid' && zone !== 'dock') return // библиотека не участвует в драге
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

  const dragRef = useRef<{ app: AppKey; zone: Zone; index: number } | null>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })

  const startDrag = useCallback((app: AppKey, zone: Zone, index: number, clientX: number, clientY: number, tileW: number) => {
    dragActiveRef.current = true
    ghostWRef.current = tileW || 72
    setGhostW(tileW || 72)
    dragRef.current = { app, zone, index }
    lastPointerRef.current = { x: clientX, y: clientY }
    setArmed(null)
    setDrag({ app, zone, index })
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

      // автопролистывание страниц у краёв
      const vw = window.innerWidth
      const dir: -1 | 0 | 1 = ev.clientX < 34 ? -1 : ev.clientX > vw - 34 ? 1 : 0
      const canFlip = dir !== 0 && pageRef.current + dir >= 0 && pageRef.current + dir <= PAGES - 2
      if (canFlip && flipDir.current !== dir) {
        flipDir.current = dir
        window.clearTimeout(flipTimer.current)
        flipTimer.current = window.setTimeout(() => {
          setPage((p) => Math.max(0, Math.min(PAGES - 1, p + flipDir.current)))
          window.clearTimeout(flipTimer.current)
          flipDir.current = 0
        }, 420)
      } else if (!canFlip && flipDir.current !== 0) {
        window.clearTimeout(flipTimer.current)
        flipDir.current = 0
      }

      // ближайший слот: живо переупорядочиваем раскладку
      let best: { zone: Zone; index: number; d: number } | null = null
      for (const s of slotsRef.current) {
        const d = Math.hypot(ev.clientX - s.cx, ev.clientY - s.cy)
        const lim = Math.max(s.w, s.h) * 0.8
        if (d < lim && (!best || d < best.d)) best = { zone: s.zone, index: s.index, d }
      }
      if (!best) return
      const from = dragRef.current
      if (!from) return
      if (from.zone === best.zone && from.index === best.index) return

      const prev = layoutRef.current
      let g = [...prev.grid]
      let dk = [...prev.dock]
      const item = from.zone === 'grid' ? g.splice(from.index, 1)[0] : dk.splice(from.index, 1)[0]
      let nextFrom: { app: AppKey; zone: Zone; index: number }
      if (best.zone === 'grid') {
        // best.index — индекс целевого слота в текущей раскладке: после удаления
        // вставляем ровно в него, тогда иконка занимает место цели
        const at = Math.max(0, Math.min(g.length, best.index))
        g.splice(at, 0, item)
        nextFrom = { app: item, zone: 'grid', index: at }
      } else if (dk.length >= DOCK_MAX && from.zone === 'dock') {
        // док полон: обмен внутри дока
        const t = Math.max(0, Math.min(dk.length - 1, best.index))
        dk[from.index] = dk[t]
        dk[t] = item
        nextFrom = { app: item, zone: 'dock', index: t }
      } else if (dk.length >= DOCK_MAX) {
        // док полон, тащим из сетки: меняемся с иконкой дока
        const t = Math.max(0, Math.min(dk.length - 1, best.index))
        const displaced = dk[t]
        dk[t] = item
        g.splice(Math.max(0, Math.min(g.length, from.zone === 'grid' ? Math.min(from.index, g.length) : g.length)), 0, displaced)
        nextFrom = { app: item, zone: 'dock', index: t }
      } else {
        const t = Math.max(0, Math.min(dk.length, best.index))
        dk.splice(t, 0, item)
        nextFrom = { app: item, zone: 'dock', index: t }
      }
      layoutRef.current = { grid: g, dock: dk }
      setLayout(layoutRef.current)
      dragRef.current = nextFrom
      requestAnimationFrame(measureSlots)
    }
    const end = () => {
      cleanup()
      dragActiveRef.current = false
      movedRef.current = false
      dragRef.current = null
      setDrag(null)
      window.clearTimeout(flipTimer.current)
      flipDir.current = 0
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end as EventListener)
      window.removeEventListener('pointercancel', end as EventListener)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }, [measureSlots])

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
  const HOLD_MS = 300
  const iconPointerDown = (app: AppKey, zone: Zone, index: number) => (e: React.PointerEvent) => {
    if (e.button > 0) return
    const startX = e.clientX
    const startY = e.clientY
    const el = e.currentTarget as HTMLElement
    let lifted = false
    let done = false
    const liftTimer = window.setTimeout(() => {
      lifted = true
      setArmed({ app, zone, index })
      if (navigator.vibrate) { try { navigator.vibrate(10) } catch { /* ignore */ } }
    }, HOLD_MS)

    const onMove = (ev: PointerEvent) => {
      if (done) return
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      if (!lifted && dist > 8) {
        // движение до подъёма: в редактировании начинаем драг, иначе это свайп страниц
        done = true
        window.clearTimeout(liftTimer)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        if (editRef.current) startDrag(app, zone, index, ev.clientX, ev.clientY, el.getBoundingClientRect().width)
        return
      }
      if (lifted && dist > 6) {
        // подъём был, палец поехал: перетаскивание
        done = true
        window.clearTimeout(liftTimer)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        startDrag(app, zone, index, ev.clientX, ev.clientY, el.getBoundingClientRect().width)
      }
    }
    const onUp = () => {
      window.clearTimeout(liftTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (lifted && !done) {
        // зажал и отпустил без движения: меню «О приложении»
        suppressClickRef.current = true
        window.setTimeout(() => { suppressClickRef.current = false }, 400)
        setArmed(null)
        openMenuAt(app, startX, startY, false)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // в режиме редактирования тап по иконке открывает меню (быстро и понятно)
  const iconClick = (app: AppKey) => (e: React.MouseEvent) => {
    if (movedRef.current || dragActiveRef.current || suppressClickRef.current) return
    if (edit) { openMenuAt(app, e.clientX, e.clientY, false); return }
    onOpenApp(app)
  }

  // ─── Действия меню ─────────────────────────────────────────────────────────
  const removeFromHome = (app: AppKey) => {
    setLayout((prev) => ({ grid: prev.grid.filter((a) => a !== app), dock: prev.dock.filter((a) => a !== app) }))
    pushToast('Домашний экран', `«${APP_TILE[app].label}» убран с экрана. Иконка осталась в Библиотеке`)
  }
  const addToHome = (app: AppKey) => {
    setLayout((prev) => (prev.grid.includes(app) || prev.dock.includes(app) ? prev : { ...prev, grid: [...prev.grid, app] }))
    pushToast('Домашний экран', `«${APP_TILE[app].label}» добавлен на главный экран`)
  }
  const openInfo = (app: AppKey) => {
    setMenu(null)
    setInfo(app)
  }

  // Escape закрывает меню/шит/редактирование
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (menu) setMenu(null)
      else if (info) setInfo(null)
      else if (edit) setEdit(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, info, edit])

  // ─── Слоты сетки/дока ──────────────────────────────────────────────────────
  const page0Apps = layout.grid.slice(0, PAGE0_SLOTS)
  const page1Apps = layout.grid.slice(PAGE0_SLOTS)
  const jiggleMode = edit || !!drag || !!armed

  const renderIcon = (app: AppKey, zone: Zone, index: number, small: boolean) => {
    const isDragging = drag?.zone === zone && drag.index === index && drag.app === app
    const isArmed = armed?.zone === zone && armed.index === index && armed.app === app
    return (
      <div
        key={`${zone}-${app}-${index}`}
        data-slot={`${zone}:${index}`}
        className="relative flex flex-col items-center"
        style={isDragging ? { opacity: 0.3 } : undefined}
      >
        <AppIcon
          icon={APP_TILE[app].icon}
          label={APP_TILE[app].label}
          image={APP_TILE[app].image || undefined}
          imageBg={APP_TILE[app].background}
          badge={app === 'avito' ? unreadChats : undefined}
          small={small}
          hideLabel={small}
          tone={lightTone ? 'light' : 'dark'}
          staticTile={jiggleMode}
          tileClass={isArmed ? 'os-lift' : jiggleMode ? `os-jiggle ${index % 2 ? 'os-jiggle-late' : ''}` : ''}
          onPointerDown={iconPointerDown(app, zone, index)}
          onClick={iconClick(app)}
        />
      </div>
    )
  }

  // ─── Библиотека ────────────────────────────────────────────────────────────
  const q = libQuery.trim().toLowerCase()
  const allApps = useMemo(() => [...layout.dock, ...layout.grid], [layout])
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

  const libIcon = (app: AppKey, i: number) => (
    <div key={app} className="relative flex flex-col items-center">
      <AppIcon
        icon={APP_TILE[app].icon}
        label={APP_TILE[app].label}
        image={APP_TILE[app].image || undefined}
        imageBg={APP_TILE[app].background}
        tone={lightTone ? 'light' : 'dark'}
        staticTile
        onLongPress={() => openMenuAt(app, window.innerWidth / 2, window.innerHeight / 2 - 40, true)}
        onClick={() => onOpenApp(app)}
      />
    </div>
  )

  const trackStyle = { transform: `translateX(${-page * (100 / PAGES)}%)`, transition: SETTLE_EASE, willChange: 'transform' as const }

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
            <div className="flex items-stretch gap-2 px-3">
              <WeatherWidget dark={dark} onOpenApp={onOpenApp} />
              <TodayWidget dark={dark} widgets={widgets} online={online} day={day} onOpenApp={onOpenApp} />
            </div>
            <div className="mt-5 grid grid-cols-4 gap-x-2 gap-y-4 px-4">
              {page0Apps.map((app, i) => renderIcon(app, 'grid', i, false))}
            </div>
            <div className="flex-1" />
          </section>

          {/* Панель 2: продолжение сетки */}
          <section className="flex h-full w-1/3 flex-col" aria-label="Вторая страница" aria-hidden={page !== 1}>
            <div className="mt-2 grid grid-cols-4 content-start gap-x-2 gap-y-4 px-4">
              {page1Apps.map((app, i) => renderIcon(app, 'grid', PAGE0_SLOTS + i, false))}
            </div>
            <div className="flex-1" />
          </section>

          {/* Панель 3: Библиотека приложений */}
          <section className="flex h-full w-1/3 flex-col" aria-label="Библиотека приложений" aria-hidden={page !== 2}>
            <div className="px-4">
              <div
                className={`flex h-11 items-center gap-2.5 rounded-[18px] px-3.5 outline-none ring-1 transition-colors ${
                  dark ? 'bg-white/[0.10] ring-white/[0.08]' : 'bg-white/85 ring-black/[0.04] shadow-[0_8px_24px_-16px_rgba(15,23,42,0.4)]'
                }`}
              >
                <Search className={`size-4 shrink-0 ${dark ? 'text-white/60' : 'text-neutral-400'}`} aria-hidden="true" />
                <input
                  value={libQuery}
                  onChange={(e) => setLibQuery(e.target.value)}
                  placeholder="Поиск приложений"
                  aria-label="Поиск приложений"
                  className={`min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-neutral-400 ${dark ? 'text-white' : 'text-neutral-800'}`}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                {libQuery ? (
                  <button type="button" aria-label="Очистить" onClick={() => setLibQuery('')} className="shrink-0 outline-none">
                    <X className={`size-4 ${dark ? 'text-white/50' : 'text-neutral-400'}`} aria-hidden="true" />
                  </button>
                ) : (
                  <MicGlyph dark={dark} />
                )}
              </div>
              {/* чипы категорий */}
              <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {LIB_CHIPS.map((c) => {
                  const on = libChip === c.key
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setLibChip(c.key)}
                      className={`h-8 shrink-0 rounded-full px-3.5 text-[12px] font-semibold outline-none transition-all duration-150 active:scale-95 ${
                        on
                          ? 'bg-neutral-900 text-white shadow-sm'
                          : dark
                            ? 'bg-white/[0.10] text-white/70'
                            : 'bg-white/80 text-neutral-600 ring-1 ring-black/[0.04]'
                      }`}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2 [scrollbar-width:none]">
              {foundApps ? (
                <div className={`rounded-[24px] p-3 ring-1 backdrop-blur-sm ${dark ? 'bg-white/[0.08] ring-white/[0.06]' : 'bg-white/70 ring-black/[0.04]'}`}>
                  {foundApps.length === 0 ? (
                    <p className="py-6 text-center text-[13px] font-medium text-neutral-400">Ничего не найдено</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                      {foundApps.map((a, i) => libIcon(a, i))}
                    </div>
                  )}
                </div>
              ) : (
                visibleSections.map((s) => (
                  <div key={s.key} className={`rounded-[24px] p-3 ring-1 backdrop-blur-sm ${dark ? 'bg-white/[0.08] ring-white/[0.06]' : 'bg-white/70 ring-black/[0.04]'}`}>
                    <div className="flex items-center justify-between px-1 pb-1.5">
                      <p className={`text-[14px] font-bold ${dark ? 'text-white' : 'text-neutral-900'}`}>{s.title}</p>
                      <ChevronRight className={`size-4 ${dark ? 'text-white/40' : 'text-neutral-300'}`} aria-hidden="true" />
                    </div>
                    <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                      {s.apps.map((a, i) => libIcon(a, i))}
                    </div>
                  </div>
                ))
              )}
              {foundApps && foundApps.length === 0 && (
                <p className={`pb-2 text-center text-[11px] ${dark ? 'text-white/40' : 'text-neutral-400'}`}>
                  Свайп вверх вернёт на главный экран
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Мини-плеер над точками страниц */}
      <MiniPlayer onOpenApp={onOpenApp} />

      {/* Точки страниц */}
      <div className="z-10 mb-2 flex items-center justify-center gap-1.5" aria-hidden="true">
        {Array.from({ length: PAGES }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === page ? 'w-5' : 'size-1.5'} ${
              lightTone ? (i === page ? 'bg-neutral-700' : 'bg-neutral-400/60') : i === page ? 'bg-white' : 'bg-white/40'
            }`}
          />
        ))}
      </div>

      {/* ─── Док: матовая стеклянная панель ─── */}
      <div className="z-10 mx-3 mb-2">
        <div
          className={`grid grid-cols-4 gap-1 rounded-[26px] px-1.5 py-2 ${
            dark ? 'bg-white/[0.10] ring-1 ring-white/[0.08]' : 'bg-white/55 ring-1 ring-white/70 shadow-[0_14px_34px_-18px_rgba(15,23,42,0.45)] backdrop-blur-xl'
          }`}
        >
          {layout.dock.map((app, i) => renderIcon(app, 'dock', i, true))}
        </div>
      </div>

      {/* ─── Призрак перетаскиваемой иконки ─── */}
      {drag && (
        <div
          ref={ghostRef}
          className="pointer-events-none fixed left-0 top-0 z-[90] will-change-transform"
          style={{ width: ghostW, transform: 'translate3d(-500px,-500px,0)' }}
          aria-hidden="true"
        >
          <AppIcon
            icon={APP_TILE[drag.app].icon}
            label={APP_TILE[drag.app].label}
            image={APP_TILE[drag.app].image || undefined}
            imageBg={APP_TILE[drag.app].background}
            tone={lightTone ? 'light' : 'dark'}
            staticTile
            tileClass="os-ghost-tile"
            onClick={() => {}}
          />
        </div>
      )}

      {/* ─── Контекстное меню иконки ─── */}
      {menu && (
        <IconMenu
          menu={menu}
          dark={dark}
          onAbout={() => openInfo(menu.app)}
          onEditScreen={() => { setMenu(null); setEdit(true) }}
          onRemove={() => { setMenu(null); removeFromHome(menu.app) }}
          onAddHome={() => { setMenu(null); addToHome(menu.app) }}
          onClose={() => setMenu(null)}
        />
      )}

      {/* ─── Шит «О приложении» ─── */}
      {info && (
        <AppInfoSheet
          app={info}
          onClose={() => setInfo(null)}
          onOpenApp={onOpenApp}
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
