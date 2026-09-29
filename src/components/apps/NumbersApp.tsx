'use client'

// Приложение «Номера» — маркетплейс красивых номеров по макету + крутилка.
// Вкладки (нижний таб-бар): Главная (витрина) / Поиск (фильтры) / Розыгрыш
// (барабаны, центральная кнопка) / Избранное / Профиль (мои, брони, история).
//
// Машина: ГТА-плашка с десятью барабанами-окошками; при «Крутить» цифры
// ПАДАЮТ СВЕРХУ ВНИЗ с motion-блюром, колонки останавливаются влево→вправо,
// каждое окошко «клацает» (scaleY-поп). На финале плашка вздрагивает, по ней
// проходит цветная волна тира, за плашкой загорается свечение.
// Витрина: /api/phones/market — ежедневный каталог (usual/pretty/gold),
// покупка номера напрямую. Брони 48 ч и крутка сохранены как были.
// Светлый M3 ОС: фон #F5F6F8, белые карточки r20, зелёный CTA #12894B,
// золото #E8C46A. Тёмная тема — пары в globals.css (.plate-frame/.reel-*).

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { animate, AnimatePresence, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'framer-motion'
import {
  BadgeCheck, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Crown, Dices, Heart, Loader2,
  MapPin, Phone, Search, ShieldCheck, SlidersHorizontal, Star, Timer, UserRound, Wallet, X,
} from 'lucide-react'
import { REGIONS, RESERVE_HOURS, isGoldCode, reserveSecondsLeft } from '@/lib/phone'
import type { PhoneMarketItem } from '@/lib/phone-market'
import { api } from '@/lib/api'
import { fmtMoney } from '@/lib/format'
import { sound } from '@/lib/sound'
import { useOS } from '@/lib/store'
import {
  fmtCountdown,
  phoneReq,
  TierBadge,
  tierMeta,
  useTick,
  type PhoneDTO,
  type RollResponse,
} from './phone/shared'

const CARD = 'rounded-[20px] bg-white shadow-[0_2px_14px_rgba(23,24,26,0.05)]'
const GREEN = '#12894B'
const CAPS = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400'
const FAV_KEY = 'avito_sim_number_favs_v1'

const randDigit = () => String(Math.floor(Math.random() * 10))
const randDigits = (n: number) => Array.from({ length: n }, randDigit).join('')

/** name → short для штампа результата (regionName в DTO — полное имя). */
const SHORT_BY_NAME: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.name, r.short]))
const shortRegion = (name: string) => SHORT_BY_NAME[name] ?? name

function codesLabel(codes: string[]): string {
  return codes.slice(0, 3).join(', ') + (codes.length > 3 ? '…' : '')
}

function prestigeDots(prestige: number): number {
  return Math.max(1, Math.min(5, Math.round((prestige - 0.8) * 7)))
}

function patternOf(tail: string): string | null {
  const d = tail
  if (d.length < 4) return null
  const run = (s: string) => {
    let best = 1
    let cur = 1
    for (let i = 1; i < s.length; i++) {
      cur = s[i] === s[i - 1] ? cur + 1 : 1
      best = Math.max(best, cur)
    }
    return best
  }
  if (new Set(d.split('')).size === 1) return 'Легенда'
  if (run(d) >= 3) return 'Повтор цифр'
  if (d === [...d].reverse().join('')) return 'Палиндром'
  if (d.endsWith('000')) return 'Круглый'
  for (let i = 0; i + 4 <= d.length; i++) {
    if (d[i] === d[i + 3] && d[i + 1] === d[i + 2]) return 'Зеркальный'
  }
  for (let i = 0; i + 3 <= d.length; i++) {
    if (d[i] === d[i + 2] && d[i + 1] !== d[i]) return 'С повтором'
  }
  const step = (s: string) => {
    let best = 1
    let cur = 1
    for (let i = 1; i < s.length; i++) {
      const delta = s.charCodeAt(i) - s.charCodeAt(i - 1)
      cur = delta === 1 || delta === -1 ? cur + 1 : 1
      best = Math.max(best, cur)
    }
    return best
  }
  if (step(d) >= 4) return 'Последовательный'
  if (new Set(d.split('')).size <= 4) return 'Удачный'
  return null
}

const GLOW: Partial<Record<string, string>> = { gold: '#FFD53D', platinum: '#D8DAE0', diamond: '#9BDFF5' }

/* ───────────────────────────── Хук данных ───────────────────────────────── */

interface NumbersApi {
  numbers: PhoneDTO[]
  owned: PhoneDTO[]
  reserves: PhoneDTO[]
  mainNumber: PhoneDTO | null
  history: PhoneDTO[]
  balance: number
  loading: boolean
  refresh: () => Promise<void>
  roll: (regionCode: string) => Promise<RollResponse | { ok: false; error: string }>
  buy: (id: string) => Promise<{ ok: true; mainSet: boolean } | { ok: false; error: string }>
  setMain: (id: string) => Promise<boolean>
  release: (id: string) => Promise<boolean>
}

function useNumbers(): NumbersApi {
  const refreshSession = useOS((s) => s.refreshSession)
  const [numbers, setNumbers] = useState<PhoneDTO[]>([])
  const [balance, setBalance] = useState(useOS.getState().session?.balance ?? 0)
  const [loading, setLoading] = useState(true)

  const applyBalance = useCallback(
    (b: number | undefined) => {
      if (typeof b !== 'number') return
      setBalance(b)
      refreshSession({ balance: b })
    },
    [refreshSession],
  )

  const refresh = useCallback(async () => {
    try {
      const data = await phoneReq<{ numbers: PhoneDTO[]; balance: number }>('/api/phones')
      setNumbers(data.numbers)
      applyBalance(data.balance)
    } catch {
      /* нет сети — показываем то, что есть */
    } finally {
      setLoading(false)
    }
  }, [applyBalance])

  const roll = useCallback(
    async (regionCode: string) => {
      try {
        const data = await phoneReq<RollResponse>('/api/phones/roll', {
          method: 'POST',
          body: JSON.stringify({ regionCode }),
        })
        applyBalance(data.balance)
        return data
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : 'Прокрутка не удалась' }
      }
    },
    [applyBalance],
  )

  const buy = useCallback(
    async (id: string) => {
      try {
        const data = await phoneReq<{ ok: true; balance: number; mainSet?: boolean; phone: PhoneDTO }>(
          '/api/phones/buy',
          { method: 'POST', body: JSON.stringify({ id }) },
        )
        applyBalance(data.balance)
        return { ok: true as const, mainSet: data.mainSet ?? false }
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : 'Не удалось забрать номер' }
      }
    },
    [applyBalance],
  )

  const setMain = useCallback(async (id: string) => {
    try {
      await phoneReq('/api/phones/set-main', { method: 'POST', body: JSON.stringify({ id }) })
      return true
    } catch {
      return false
    }
  }, [])

  const release = useCallback(async (id: string) => {
    try {
      await phoneReq('/api/phones/release', { method: 'POST', body: JSON.stringify({ id }) })
      return true
    } catch {
      return false
    }
  }, [])

  // Первая загрузка + страховочный поллинг: таймеры брони и чужие списания.
  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(id)
  }, [refresh])

  const owned = numbers.filter((p) => p.status === 'active')
  const reserves = numbers.filter((p) => p.status === 'reserved' && p.holdUntil)
  const mainNumber = owned.find((p) => p.isMain) ?? null
  const history = [...numbers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30)

  return { numbers, owned, reserves, mainNumber, history, balance, loading, refresh, roll, buy, setMain, release }
}

/* ─────────────────────── Плашка: барабаны с падением ─────────────────────── */

const CELL = 46 // высота окошка-барабана
const CELL_W = 18 // ширина окошка — плашка должна влезать даже на 360 px
const SYM_H = { height: CELL, lineHeight: `${CELL}px` } as const
const NUM_CLS = 'block text-center text-[22px] font-extrabold leading-none tabular-nums'
const SEP_CLS = 'px-px text-[20px] font-bold tabular-nums text-[#17181A]/40'

/** Командный интерфейс барабана: родитель запускает прокрутку императивно. */
interface ReelHandle {
  /** Уронить ленту до target за duration сек (с задержкой delay). */
  spinTo: (target: string, opt: { delay: number; duration: number; onDone?: () => void }) => void
}

/**
 * Одна колонка-барабан в окошке с риской по центру. Цифры ПАДАЮТ СВЕРХУ ВНИЗ:
 * лента = [цель, …случайные…, текущая], позиция едет с низа ленты наверх
 * (окно скользит вверх по ленте — визуально контент падает вниз). В полёте
 * лента размывается тем сильнее, чем быстрее едет; при остановке окошко
 * «клацает» (scaleY-поп). Текущая цифра дописывается в конец новой ленты,
 * поэтому повторные прокрутки подхватываются без рывка даже в полёте.
 */
const DigitReel = forwardRef<ReelHandle>(function DigitReel(_props, ref) {
  const pos = useMotionValue(0) // 0 — цель (верх ленты), N — текущая цифра (низ)
  const y = useTransform(pos, (v) => `${-v * CELL}px`)
  const blur = useTransform(pos, (v) => {
    const b = (v - 2) * 0.09
    return `blur(${b > 0.4 ? Math.min(1.8, b) : 0}px)`
  })
  const pop = useMotionValue(1) // «клац» окошка при остановке
  const [strip, setStrip] = useState<string[]>(['·'])
  const stripRef = useRef(strip)
  const animRef = useRef<AnimationPlaybackControls | null>(null)
  const pendingRef = useRef<{ delay: number; duration: number; onDone?: () => void } | null>(null)

  useEffect(() => {
    stripRef.current = strip
  }, [strip])

  useImperativeHandle(ref, () => ({
    spinTo(target, opt) {
      animRef.current?.stop()
      const idx = Math.max(0, Math.min(stripRef.current.length - 1, Math.round(pos.get())))
      const cur = stripRef.current[idx] ?? '·'
      const loops = Math.max(9, Math.round(opt.duration * 8))
      pendingRef.current = { delay: opt.delay, duration: opt.duration, onDone: opt.onDone }
      pop.jump(1)
      setStrip([target, ...Array.from({ length: loops }, randDigit), cur])
    },
  }))

  // Лента закоммичена: встаём на её низ (там текущая цифра — бесшовно) и роняем.
  useLayoutEffect(() => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    pos.jump(strip.length - 1)
    animRef.current = animate(pos, 0, {
      delay: pending.delay,
      duration: pending.duration,
      ease: [0.22, 1, 0.36, 1], // резкий разгон, длинное торможение
      onComplete: () => {
        pop.jump(1.14)
        animate(pop, 1, { duration: 0.3, ease: [0.22, 1, 0.36, 1] })
        pending.onDone?.()
      },
    })
  })

  useEffect(() => () => animRef.current?.stop(), [])

  return (
    <motion.span
      className="reel-cell relative inline-block shrink-0 overflow-hidden rounded-[8px]"
      style={{ height: CELL, width: CELL_W, scaleY: pop }}
    >
      <motion.span className="block will-change-transform" style={{ y, filter: blur }}>
        {strip.map((d, i) => (
          <span key={i} className={NUM_CLS} style={SYM_H}>
            {d}
          </span>
        ))}
      </motion.span>
      {/* риска барабана по центру + растворение цифр у краёв окошка */}
      <span aria-hidden="true" className="reel-line pointer-events-none absolute inset-x-[3px] top-1/2 h-px -translate-y-1/2" />
      <span aria-hidden="true" className="reel-fade-t pointer-events-none absolute inset-x-0 top-0 h-[9px]" />
      <span aria-hidden="true" className="reel-fade-b pointer-events-none absolute inset-x-0 bottom-0 h-[9px]" />
    </motion.span>
  )
})

/** Команда прокрутки: seq — запуск, digits — 10 цифр (код + хвост), at — метка старта. */
interface SpinCmd {
  seq: number
  digits: string
  final: boolean
  at: number
}

/** Пустая команда (плашка до первой прокрутки, барабаны стоят на «·»). */
const IDLE_SPIN: SpinCmd = { seq: 0, digits: '', final: false, at: 0 }

const STAGGER = 0.08 // старт колонок влево→вправо
const REEL_SEC = 1.45 // базовая длительность падения колонки

/**
 * Ряд барабанов «+7 (XXX) XXX-XX-XX» + штамп региона справа (аналог «78 RUS»).
 * Первый spin (final=false) — разгон по случайным цифрам; когда приходит ответ
 * сервера (final=true), колонки бесшовно докручиваются до реальных, сохраняя
 * общий темп ~2.2 с: последняя колонка останавливается последней и зовёт onSettled.
 */
function PlateReels({
  spin,
  stamp,
  onSettled,
}: {
  spin: SpinCmd
  stamp: { code: string; name: string; label: string }
  onSettled: () => void
}) {
  const refs = useRef<(ReelHandle | null)[]>([])
  const goldStamp = isGoldCode(stamp.code)

  // Новый объект spin = новая команда прокрутки (разгон или докрутка до реальных).
  useEffect(() => {
    const chars = spin.digits.split('')
    const elapsed = spin.final ? (Date.now() - spin.at) / 1000 : 0
    chars.forEach((ch, i) => {
      const stagger = i * STAGGER
      const delay = spin.final ? Math.max(0, stagger - elapsed) : stagger
      const duration = spin.final ? Math.max(0.5, REEL_SEC - Math.max(0, elapsed - stagger)) : REEL_SEC
      refs.current[i]?.spinTo(ch, {
        delay,
        duration,
        onDone: i === chars.length - 1 ? onSettled : undefined,
      })
    })
  }, [spin, onSettled])

  return (
    <div
      role="img"
      aria-label={stamp.label}
      className="flex items-center justify-center gap-[1.5px]"
      style={{ height: CELL }}
    >
      <span className="text-[21px] font-extrabold tracking-tight" style={SYM_H}>
        +7
      </span>
      <span className={SEP_CLS} style={SYM_H}>
        (
      </span>
      <DigitReel ref={(el) => { refs.current[0] = el }} />
      <DigitReel ref={(el) => { refs.current[1] = el }} />
      <DigitReel ref={(el) => { refs.current[2] = el }} />
      <span className={SEP_CLS} style={SYM_H}>
        )
      </span>
      <DigitReel ref={(el) => { refs.current[3] = el }} />
      <DigitReel ref={(el) => { refs.current[4] = el }} />
      <DigitReel ref={(el) => { refs.current[5] = el }} />
      <span className={SEP_CLS} style={SYM_H}>
        -
      </span>
      <DigitReel ref={(el) => { refs.current[6] = el }} />
      <DigitReel ref={(el) => { refs.current[7] = el }} />
      <span className={SEP_CLS} style={SYM_H}>
        -
      </span>
      <DigitReel ref={(el) => { refs.current[8] = el }} />
      <DigitReel ref={(el) => { refs.current[9] = el }} />
      {/* штамп региона — как «78 RUS» на ГТА-плашке; у блатных кодов — золотой */}
      <span
        className={
          'ml-1.5 flex shrink-0 flex-col items-center justify-center gap-[3px] border-l-2 pl-2 pr-0.5 ' +
          (goldStamp ? 'border-[#C08A2D]/45' : 'border-[#17181A]/[0.08]')
        }
        style={{ height: CELL + 6 }}
      >
        <span className={'text-[13.5px] font-extrabold leading-none tabular-nums' + (goldStamp ? ' stamp-gold' : '')}>
          {stamp.code}
        </span>
        <span
          className={
            'max-w-[48px] truncate text-[6.5px] font-bold uppercase leading-none tracking-[0.1em] ' +
            (goldStamp ? 'stamp-gold opacity-70' : 'text-[#17181A]/40')
          }
        >
          {stamp.name}
        </span>
      </span>
    </div>
  )
}

/* ─────────────────────────────── Детали UI ──────────────────────────────── */

/** Шкала красоты: заливка цветом тира, ширина анимируется от нуля. */
function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex flex-1 items-center gap-2.5">
      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#17181A]/[0.07]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(3, score)}%` }}
          transition={{ duration: 0.9, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="shrink-0 text-[11px] font-medium tabular-nums text-[#17181A]/40">{score}/100</span>
    </div>
  )
}

function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="flex items-baseline justify-between px-1 pb-1.5 pt-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#17181A]/35">{children}</span>
      {typeof count === 'number' && <span className="text-[11px] tabular-nums text-[#17181A]/30">{count}</span>}
    </div>
  )
}

/** Иконка-крестик «Отпустить» (брони и не-основные номера). */
function ReleaseX({ label, onRelease }: { label: string; onRelease: () => void }) {
  return (
    <button
      type="button"
      onClick={onRelease}
      aria-label={label}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#17181A]/35 transition-colors active:bg-[#17181A]/[0.06] active:text-[#17181A]/60"
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  )
}

/* ──────────────────────────── Карточки списков ──────────────────────────── */

function ReserveCard({
  p,
  busy,
  balance,
  onClaim,
  onRelease,
}: {
  p: PhoneDTO
  busy: boolean
  balance: number
  onClaim: (p: PhoneDTO) => void
  onRelease: (p: PhoneDTO) => void
}) {
  useTick()
  const left = reserveSecondsLeft(p.holdUntil)
  if (left <= 0) return null // истекла — уйдёт после refresh

  const frac = Math.max(0.02, Math.min(1, left / (RESERVE_HOURS * 3600)))
  const urgent = left < 6 * 3600
  const free = p.buyPrice === 0
  const affordable = free || balance >= p.buyPrice
  return (
    <div className={CARD + ' p-4'}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[16.5px] font-semibold tabular-nums">{p.number}</span>
        <TierBadge tier={p.tier} variant="light" />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Timer className={'size-3.5 shrink-0 ' + (urgent ? 'text-red-500' : 'text-[#17181A]/35')} aria-hidden="true" />
        <span className={'shrink-0 text-[12px] font-semibold tabular-nums ' + (urgent ? 'text-red-500' : 'text-[#17181A]/55')}>
          {fmtCountdown(left)}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#17181A]/[0.07]">
          <motion.div
            initial={false}
            animate={{ width: `${frac * 100}%` }}
            transition={{ duration: 0.6 }}
            className="h-full rounded-full"
            style={{ backgroundColor: urgent ? '#EE3F58' : '#FFD53D' }}
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onClaim(p)}
          disabled={busy || !affordable}
          className={
            'h-10 flex-1 rounded-full text-[13.5px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 ' +
            (free ? 'bg-[#FFD53D] text-[#231a02]' : 'bg-[#17181A] text-white')
          }
        >
          {free ? 'Забрать бесплатно' : affordable ? `Забрать · ${fmtMoney(p.buyPrice)}` : `Не хватает ${fmtMoney(p.buyPrice - balance)}`}
        </button>
        <ReleaseX label={`Отпустить номер ${p.number}`} onRelease={() => onRelease(p)} />
      </div>
    </div>
  )
}

/* ──────────────────────────── Шторка регионов ───────────────────────────── */

function RegionSheet({
  region,
  onPick,
  onClose,
}: {
  region: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  // Монтируется заново при каждом открытии (AnimatePresence в родителе) —
  // поэтому поиск всегда начинается с пустого запроса без эффектов.
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return REGIONS
    return REGIONS.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.short.toLowerCase().includes(query) ||
        r.codes.some((c) => c.startsWith(query)),
    )
  }, [q])

  return (
    <>
      <motion.button
        key="backdrop"
        type="button"
        aria-label="Закрыть"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="absolute inset-0 z-30 cursor-default bg-[#17181A]/25"
      />
      <motion.div
        key="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Выбор региона"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        className="absolute inset-x-0 bottom-0 z-30 flex max-h-[82%] flex-col rounded-t-[24px] bg-white pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(23,24,26,0.16)]"
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-[16px] font-semibold">Регион номера</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-8 items-center justify-center rounded-full bg-[#17181A]/[0.05] text-[#17181A]/50 transition-transform active:scale-90"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* поиск по имени / короткому имени / коду */}
        <div className="shrink-0 px-5 pb-2 pt-1">
          <label className="flex h-11 items-center gap-2.5 rounded-2xl bg-[#F1F3F4] px-3.5">
            <Search className="size-4 shrink-0 text-[#17181A]/35" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Регион или код: 495, Казань…"
              className="w-full bg-transparent text-[14px] outline-none placeholder:text-[#17181A]/35"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="Очистить поиск"
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#17181A]/[0.08] text-[#17181A]/50"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            )}
          </label>
        </div>

        <div className="nice-scroll flex-1 overflow-y-auto px-5 pt-1">
          {list.length === 0 && (
            <p className="py-10 text-center text-[13px] text-[#17181A]/35">Ничего не нашлось</p>
          )}
          {list.map((r) => {
            const active = r.id === region
            const dots = prestigeDots(r.prestige)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick(r.id)}
                aria-pressed={active}
                className="flex w-full items-center gap-3 border-b border-[#17181A]/[0.06] py-2.5 text-left transition-colors last:border-b-0 active:bg-[#17181A]/[0.03]"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {r.id === 'gold' && <Crown className="size-3.5 shrink-0 text-[#C97B1D]" aria-label="Блатной регион" />}
                    <span className="truncate text-[14px] font-medium">{r.name}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="text-[11px] tabular-nums text-[#17181A]/40">{codesLabel(r.codes)}</span>
                    <span className="flex items-center gap-[3px]" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className="size-[4.5px] rounded-full"
                          style={{ backgroundColor: i < dots ? 'rgba(23,24,26,0.5)' : 'rgba(23,24,26,0.12)' }}
                        />
                      ))}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold tabular-nums">{fmtMoney(r.rollPrice)}</span>
                  <span className="text-[9.5px] uppercase tracking-wide text-[#17181A]/35">за крутку</span>
                </span>
                {active && <Check className="size-4 shrink-0" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </motion.div>
    </>
  )
}

/* ═══════════════════════════ ВИТРИНА (маркет) ═══════════════════════════ */

const CAT_META: Record<PhoneMarketItem['category'], { label: string; from: number; chip: string }> = {
  usual: { label: 'Обычные', from: 199, chip: 'bg-gray-100 text-gray-500' },
  pretty: { label: 'Красивые', from: 1990, chip: 'bg-gray-100 text-gray-500' },
  gold: { label: 'Золотой', from: 49990, chip: 'bg-[#FFF4E5] text-amber-700' },
}

/** Строка витрины (список «Рекомендуем»). */
function MarketRow({
  item,
  faved,
  onOpen,
  onFav,
  index,
}: {
  item: PhoneMarketItem
  faved: boolean
  onOpen: () => void
  onFav: () => void
  index: number
}) {
  const gold = item.category === 'gold'
  return (
    <div
      className={`${CARD} screen-enter flex items-center gap-3 p-3.5`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Номер ${item.number}, ${fmtMoney(item.price)}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px]"
          style={{ background: gold ? '#FFF4D6' : '#F3F4F6', color: gold ? '#C99B2F' : '#9CA3AF' }}
          aria-hidden
        >
          {gold ? <Crown className="size-5" /> : <Phone className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold tabular-nums text-[#17181A]">{item.number}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAT_META[item.category].chip}`}>
              {CAT_META[item.category].label}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">{item.trait}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[14.5px] font-extrabold tabular-nums text-[#17181A]">{fmtMoney(item.price)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onFav}
        aria-label={faved ? 'Убрать из избранного' : 'В избранное'}
        aria-pressed={faved}
        className="press flex size-8 shrink-0 items-center justify-center rounded-full"
      >
        <Heart
          className="size-4.5 transition-colors duration-200"
          style={{ color: faved ? '#E4573D' : '#C4C8CE', fill: faved ? '#E4573D' : 'transparent' }}
          aria-hidden
        />
      </button>
    </div>
  )
}

/** Витрина: категории + «Рекомендуем». */
function MarketHome({
  loading,
  items,
  category,
  favs,
  onCategory,
  onSearch,
  onOpen,
  onFav,
}: {
  loading: boolean
  items: PhoneMarketItem[]
  category: PhoneMarketItem['category'] | 'all'
  favs: string[]
  onCategory: (c: PhoneMarketItem['category'] | 'all') => void
  onSearch: () => void
  onOpen: (i: PhoneMarketItem) => void
  onFav: (digits: string) => void
}) {
  const cats: { key: PhoneMarketItem['category'] | 'all'; label: string; sub: string; cls: string }[] = [
    { key: 'all', label: 'Все номера', sub: '', cls: 'bg-[#17181A] text-white' },
    { key: 'usual', label: 'Обычные', sub: 'от 199 ₽', cls: 'bg-white text-[#17181A]' },
    { key: 'pretty', label: 'Красивые', sub: 'от 1 990 ₽', cls: 'bg-[#FFF4E5] text-[#17181A]' },
    { key: 'gold', label: 'Золотые', sub: 'от 49 990 ₽', cls: 'bg-white text-[#17181A]' },
  ]
  const shown = category === 'all' ? items : items.filter((i) => i.category === category)
  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 pb-6 pt-1 [scrollbar-width:thin]">
      <button type="button" onClick={onSearch} className="press block w-full text-left" aria-label="Поиск номера">
        <div className="flex h-11 items-center gap-2.5 rounded-full bg-white px-4 shadow-[0_2px_10px_rgba(23,24,26,0.05)]">
          <Search className="size-4.5 shrink-0 text-gray-400" aria-hidden />
          <span className="flex-1 truncate text-[13.5px] text-gray-400">Найти номер, например +7 999 777-77-77</span>
          <SlidersHorizontal className="size-4.5 shrink-0 text-gray-700" aria-hidden />
        </div>
      </button>

      {/* категории */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {cats.map((c) => {
          const active = category === c.key
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                sound.tap()
                onCategory(c.key)
              }}
              aria-pressed={active}
              className={`press flex flex-col items-center gap-1 rounded-[16px] p-2.5 text-center shadow-[0_2px_10px_rgba(23,24,26,0.05)] ${c.cls} ${
                active ? 'ring-2 ring-[#17181A] ring-offset-1 ring-offset-[#F5F6F8]' : ''
              }`}
            >
              {c.key === 'gold' ? (
                <Crown className="size-4.5 text-[#D9A514]" aria-hidden />
              ) : c.key === 'pretty' ? (
                <Star className="size-4.5 text-[#D9A514]" aria-hidden />
              ) : c.key === 'usual' ? (
                <Phone className="size-4.5 text-gray-500" aria-hidden />
              ) : (
                <span className="text-[15px] font-black" aria-hidden>∞</span>
              )}
              <span className="text-[10.5px] font-bold leading-tight">{c.label}</span>
              {c.sub && <span className="text-[8.5px] leading-none opacity-60">{c.sub}</span>}
            </button>
          )
        })}
      </div>

      {/* рекомендации */}
      <div className="mt-4 flex items-baseline justify-between">
        <p className={CAPS}>Рекомендуем</p>
        <button type="button" onClick={onSearch} className="press text-[12px] font-semibold text-gray-700">
          Смотреть все ›
        </button>
      </div>

      {loading ? (
        <div className="mt-2.5 space-y-2">
          <div className="h-[76px] animate-pulse rounded-[20px] bg-white" />
          <div className="h-[76px] animate-pulse rounded-[20px] bg-white" />
          <div className="h-[76px] animate-pulse rounded-[20px] bg-white" />
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-8 text-center text-[13px] text-gray-400">В этой категории пусто — загляните завтра.</p>
      ) : (
        <div className="mt-2.5 space-y-2">
          {shown.slice(0, 12).map((it, i) => (
            <MarketRow key={it.key} item={it} index={i} faved={favs.includes(it.digits)} onOpen={() => onOpen(it)} onFav={() => onFav(it.digits)} />
          ))}
        </div>
      )}

      {shown.length > 12 && (
        <button type="button" onClick={onSearch} className="press mt-3 w-full text-center text-[12.5px] font-semibold text-[#15803D]">
          Показать все {shown.length} ›
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────── Фильтры («Поиск») ─────────────────────────── */

type PatKey = 'any' | 'same' | 'mirror' | 'seq' | 'pairs' | 'triples' | 'round' | 'none'

const PATTERN_CARDS: { key: PatKey; label: string; hint: string }[] = [
  { key: 'any', label: 'Любые', hint: '' },
  { key: 'same', label: 'Повтор цифр', hint: '777, 888, 000' },
  { key: 'mirror', label: 'Зеркальные', hint: '123-21-321' },
  { key: 'seq', label: 'Порядок', hint: '123-45-67' },
  { key: 'pairs', label: 'Две пары', hint: 'XX-XX-YY' },
  { key: 'triples', label: 'Три пары', hint: 'XXX-XX-XX' },
  { key: 'round', label: 'Круглые', hint: '…000' },
  { key: 'none', label: 'Без рисунка', hint: '' },
]

function matchPat(tail: string, p: PatKey): boolean {
  const run = (s: string) => {
    let b = 1
    let c = 1
    for (let i = 1; i < s.length; i++) {
      c = s[i] === s[i - 1] ? c + 1 : 1
      b = Math.max(b, c)
    }
    return b
  }
  const counts = new Map<string, number>()
  for (const ch of tail) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  const triples = [...counts.values()].filter((n) => n >= 3).length
  const pairs = [...counts.values()].filter((n) => n === 2).length

  switch (p) {
    case 'any':
      return true
    case 'same':
      return run(tail) >= 3
    case 'mirror':
      return tail === [...tail].reverse().join('') || /\d(\d)\1\d/.test(tail)
    case 'seq': {
      let best = 1
      let cur = 1
      for (let i = 1; i < tail.length; i++) {
        const d = tail.charCodeAt(i) - tail.charCodeAt(i - 1)
        cur = d === 1 || d === -1 ? cur + 1 : 1
        best = Math.max(best, cur)
      }
      return best >= 4
    }
    case 'pairs':
      return pairs >= 2
    case 'triples':
      return triples >= 2
    case 'round':
      return tail.endsWith('000') || tail.endsWith('00')
    case 'none':
      return run(tail) < 3 && triples === 0 && !tail.endsWith('00')
  }
}

function MarketFilters({
  items,
  q,
  setQ,
  category,
  setCategory,
  pat,
  setPat,
  priceLo,
  priceHi,
  setPriceLo,
  setPriceHi,
  premiumOnly,
  setPremiumOnly,
  onApply,
  onReset,
}: {
  items: PhoneMarketItem[]
  q: string
  setQ: (v: string) => void
  category: PhoneMarketItem['category'] | 'all'
  setCategory: (c: PhoneMarketItem['category'] | 'all') => void
  pat: PatKey
  setPat: (p: PatKey) => void
  priceLo: number
  priceHi: number
  setPriceLo: (v: number) => void
  setPriceHi: (v: number) => void
  premiumOnly: boolean
  setPremiumOnly: (v: boolean) => void
  onApply: () => void
  onReset: () => void
}) {
  const catChips: { key: PhoneMarketItem['category'] | 'all'; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'usual', label: 'Обычные' },
    { key: 'pretty', label: 'Красивые' },
    { key: 'gold', label: 'Золотые' },
  ]
  const filtered = items.filter((i) => {
    if (category !== 'all' && i.category !== category) return false
    if (!matchPat(i.digits.slice(4), pat)) return false
    if (i.price < priceLo || i.price > priceHi) return false
    if (premiumOnly && i.category !== 'gold') return false
    const needle = q.replace(/[\s()+-]/g, '')
    if (needle && !i.digits.includes(needle)) return false
    return true
  })

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 pb-28 pt-1 [scrollbar-width:thin]">
      <div className="flex items-center gap-2 pb-3">
        <button
          type="button"
          onClick={onReset}
          aria-label="Назад"
          className="press flex size-10 items-center justify-center rounded-full text-[#17181A]"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <h2 className="flex-1 text-center text-[16px] font-bold text-[#17181A]">Поиск номеров</h2>
        <span className="size-10 shrink-0" aria-hidden />
      </div>

      {/* строка поиска */}
      <div className="flex h-11 items-center gap-2.5 rounded-full bg-white px-4 shadow-[0_2px_10px_rgba(23,24,26,0.05)]">
        <Search className="size-4.5 shrink-0 text-gray-400" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="+7 999 777-7-77"
          inputMode="tel"
          aria-label="Поиск по цифрам номера"
          className="w-full bg-transparent text-[14px] tabular-nums text-[#17181A] outline-none placeholder:text-gray-400"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Очистить" className="press flex size-5 items-center justify-center rounded-full bg-[#D9DCE1] text-white">
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>

      {/* быстрые чипы */}
      <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#17181A] px-3.5 text-[12.5px] font-semibold text-white">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Фильтры
        </span>
        {catChips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              sound.tap()
              setCategory(c.key)
            }}
            aria-pressed={category === c.key}
            className={`h-9 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold ${category === c.key ? 'bg-[#17181A] text-white' : 'bg-white text-gray-700 shadow-[0_1px_6px_rgba(23,24,26,0.06)]'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* категория */}
      <p className={`${CAPS} mt-5`}>Категория номера</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {catChips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              sound.tap()
              setCategory(c.key)
            }}
            aria-pressed={category === c.key}
            className={`h-9 rounded-full px-4 text-[13px] font-semibold ${category === c.key ? 'bg-[#17181A] text-white' : 'bg-white text-gray-700 shadow-[0_1px_6px_rgba(23,24,26,0.06)]'}`}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            sound.tap()
            setPat('same')
          }}
          className="h-9 rounded-full bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_6px_rgba(23,24,26,0.06)]"
        >
          С повторяющимися
        </button>
        <button
          type="button"
          onClick={() => {
            sound.tap()
            setPremiumOnly(!premiumOnly)
          }}
          className="h-9 rounded-full bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_6px_rgba(23,24,26,0.06)]"
        >
          Особые
        </button>
      </div>

      {/* рисунок */}
      <p className={`${CAPS} mt-5`}>Рисунок номера</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PATTERN_CARDS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              sound.tap()
              setPat(p.key)
            }}
            aria-pressed={pat === p.key}
            className={`press rounded-[14px] border p-2.5 text-left ${
              pat === p.key ? 'border-[#17181A] bg-[#17181A] text-white' : 'border-[#EBEDF0] bg-white text-[#17181A]'
            }`}
          >
            <span className="block text-[11.5px] font-bold leading-tight">{p.label}</span>
            {p.hint && <span className={`text-[9px] tabular-nums ${pat === p.key ? 'text-white/60' : 'text-gray-400'}`}>{p.hint}</span>}
          </button>
        ))}
      </div>

      {/* цена */}
      <p className={`${CAPS} mt-5`}>Цена</p>
      <div className="mt-1.5 flex items-baseline justify-between text-[12px] text-gray-500">
        <span>от {fmtMoney(priceLo)}</span>
        <span>до {fmtMoney(priceHi)}</span>
      </div>
      <div className="relative h-9" role="group" aria-label="Диапазон цены">
        <span className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#ECEEF1]" aria-hidden />
        <span
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#12894B]"
          style={{
            left: `${((priceLo - 0) / 1_000_000) * 100}%`,
            width: `${Math.max(0, ((priceHi - priceLo) / 1_000_000) * 100)}%`,
          }}
          aria-hidden
        />
        <input
          type="range"
          min={0}
          max={1_000_000}
          step={1000}
          value={priceLo}
          onChange={(e) => setPriceLo(Math.min(Number(e.target.value), priceHi - 1000))}
          aria-label="Цена от"
          className="absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#16A34A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
        />
        <input
          type="range"
          min={0}
          max={1_000_000}
          step={1000}
          value={priceHi}
          onChange={(e) => setPriceHi(Math.max(Number(e.target.value), priceLo + 1000))}
          aria-label="Цена до"
          className="absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#16A34A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
        />
      </div>

      {/* дополнительно */}
      <p className={`${CAPS} mt-5`}>Дополнительно</p>
      <div className="mt-2 divide-y divide-[#EBEDF0] overflow-hidden rounded-[16px] bg-white shadow-[0_2px_10px_rgba(23,24,26,0.05)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Crown className="size-4.5 text-gray-400" aria-hidden />
          <span className="flex-1 text-[13.5px] font-medium text-[#17181A]">Только в наличии</span>
          <span className="flex h-6 w-10 items-center rounded-full bg-[#12894B] px-0.5" aria-hidden title="Всё на витрине свободно">
            <span className="ml-auto size-5 rounded-full bg-white shadow" />
          </span>
        </div>
        <button type="button" onClick={() => { sound.tap(); setPremiumOnly(!premiumOnly) }} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
          <Star className="size-4.5 text-gray-400" aria-hidden />
          <span className="flex-1 text-[13.5px] font-medium text-[#17181A]">Только уникальные</span>
          <span className={`flex h-6 w-10 items-center rounded-full px-0.5 transition-colors ${premiumOnly ? 'bg-[#12894B]' : 'bg-[#D9DCE1]'}`} aria-hidden>
            <span className={`size-5 rounded-full bg-white shadow transition-transform ${premiumOnly ? 'translate-x-4' : ''}`} />
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={onApply}
        className="press mt-4 flex h-12 w-full items-center justify-center rounded-[16px] text-[15px] font-semibold text-white"
        style={{ background: GREEN, boxShadow: '0 8px 20px rgba(18,137,75,0.28)' }}
      >
        Показать {filtered.length} номер{filtered.length % 10 === 1 && filtered.length !== 11 ? '' : filtered.length % 10 >= 2 && filtered.length % 10 <= 4 && (filtered.length < 12 || filtered.length > 14) ? 'а' : 'ов'}
      </button>
    </div>
  )
}

/* ────────────────────────────── Деталь номера ───────────────────────────── */

function MarketDetail({
  item,
  faved,
  busy,
  onFav,
  onBuy,
  onBack,
  onShare,
}: {
  item: PhoneMarketItem
  faved: boolean
  busy: boolean
  onFav: () => void
  onBuy: () => void
  onBack: () => void
  onShare: () => void
}) {
  const gold = item.category === 'gold'
  const catLabel = CAT_META[item.category].label
  return (
    <div className="h-full min-h-0 overflow-y-auto pb-28 [scrollbar-width:thin]">
      <header className="flex items-center justify-between px-2 pt-1">
        <button type="button" onClick={onBack} aria-label="Назад" className="press flex size-10 items-center justify-center rounded-full text-[#17181A]">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onFav}
            aria-label={faved ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={faved}
            className="press flex size-10 items-center justify-center rounded-full text-[#17181A]"
          >
            <Heart className="size-5" style={{ color: faved ? '#E4573D' : undefined, fill: faved ? '#E4573D' : 'transparent' }} aria-hidden />
          </button>
          <button type="button" onClick={onShare} aria-label="Поделиться" className="press flex size-10 items-center justify-center rounded-full text-[#17181A]">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
              <path d="M12 3v12M12 3l-4 4M12 3l4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* тёмно-золотой баннер */}
      <div
        className="mx-4 mt-1 overflow-hidden rounded-[22px] px-5 py-7 text-center"
        style={{
          background:
            'radial-gradient(120% 130% at 50% -20%, #3A3222 0%, #1B1913 55%, #131313 100%)',
          boxShadow: '0 14px 34px rgba(23,24,26,0.28)',
        }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold"
          style={{ borderColor: 'rgba(232,196,106,0.55)', color: '#E8C46A' }}
        >
          <Crown className="size-3.5" aria-hidden />
          {catLabel} номер
        </span>
        <h1
          className="mt-3 text-[27px] font-extrabold tracking-tight text-white"
          style={{ textShadow: gold ? '0 0 24px rgba(232,196,106,0.45)' : '0 2px 12px rgba(0,0,0,0.5)' }}
        >
          {item.number}
        </h1>
        <p className="mt-1 text-[12px] text-white/55">{item.trait}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {[
            { icon: Crown, text: 'Очень редкий' },
            { icon: Star, text: 'Высокий спрос' },
            { icon: Heart, text: 'Легко запомнить' },
          ].map((c) => (
            <span
              key={c.text}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
              style={{ background: 'rgba(232,196,106,0.12)', color: '#E8C46A' }}
            >
              <c.icon className="size-3" aria-hidden />
              {c.text}
            </span>
          ))}
        </div>
      </div>

      {/* 3 стат-карточки */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        {[
          { icon: BarIcon, label: 'Категория', value: catLabel },
          { icon: Star, label: 'Уникальность', value: item.unique },
          { icon: UsersIcon, label: 'Популярность', value: item.popularity },
        ].map((s) => (
          <div key={s.label} className={`${CARD} flex flex-col items-center gap-1 p-3 text-center`}>
            <s.icon />
            <span className="text-[9.5px] text-gray-400">{s.label}</span>
            <span className="text-[11px] font-bold leading-tight text-[#17181A]">{s.value}</span>
          </div>
        ))}
      </div>

      {/* цена + рассрочка */}
      <div className="mx-4 mt-3 flex items-stretch gap-2">
        <div className={`${CARD} flex-1 p-4`}>
          <span className="text-[11px] text-gray-400">Цена</span>
          <p className="text-[20px] font-extrabold tabular-nums leading-tight text-[#17181A]">{fmtMoney(item.price)}</p>
        </div>
        <button type="button" onClick={() => sound.tap()} className="press flex w-[132px] flex-col justify-center rounded-[20px] bg-white p-3 text-left shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
          <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Wallet className="size-3.5" aria-hidden />
            Возможна рассрочка
          </span>
          <span className="mt-0.5 flex items-center gap-0.5 text-[12px] font-bold text-[#17181A]">
            от {fmtMoney(Math.round(item.price / 12 / 10) * 10)}/мес
            <ChevronRight className="size-3.5 text-gray-400" aria-hidden />
          </span>
        </button>
      </div>

      {/* безопасность */}
      <div className="mx-4 mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-gray-500">
        <ShieldCheck className="size-4 text-[#15803D]" aria-hidden />
        Безопасная сделка · Оформление договора · Официально
      </div>

      {/* что входит */}
      <div className={`${CARD} mx-4 mt-3 p-4`}>
        <p className="text-[13.5px] font-bold text-[#17181A]">Что входит в покупку</p>
        <ul className="mt-2 space-y-1.5">
          {[
            `Выделенный номер ${item.number}`,
            'Оформление на ваше имя',
            'Быстрая активация (от 5 минут)',
            'Поддержка 24/7',
          ].map((t) => (
            <li key={t} className="flex items-start gap-2 text-[12.5px] leading-snug text-gray-700">
              <Check className="mt-0.5 size-4 shrink-0 text-[#15803D]" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* покупка */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#F5F6F8] via-[#F5F6F8] to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-6">
        <button
          type="button"
          onClick={onBuy}
          disabled={busy}
          className="press flex h-12 w-full items-center justify-center rounded-[16px] text-[15px] font-semibold text-white disabled:opacity-60"
          style={{ background: GREEN, boxShadow: '0 8px 20px rgba(18,137,75,0.28)' }}
        >
          {busy ? 'Покупаем…' : 'Купить номер'}
        </button>
      </div>
    </div>
  )
}

function BarIcon() {
  return (
    <span className="flex size-6 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 24 24" className="size-4 text-[#D9A514]" fill="currentColor">
        <rect x="4" y="13" width="3.4" height="7" rx="1" />
        <rect x="10.3" y="8" width="3.4" height="12" rx="1" />
        <rect x="16.6" y="4" width="3.4" height="16" rx="1" />
      </svg>
    </span>
  )
}
function UsersIcon() {
  return (
    <span className="flex size-6 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" className="size-4 text-[#D9A514]">
        <circle cx="9" cy="8.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 19c.7-3 3-4.5 5.5-4.5S13.8 16 14.5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.5" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16.5 14.5c2 0 3.7 1.2 4.3 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/* ═════════════════════════════ КОРЕНЬ ═════════════════════════════ */

type NTab = 'home' | 'search' | 'roll' | 'favs' | 'profile'

export default function NumbersApp() {
  const pushToast = useOS((s) => s.pushToast)
  const n = useNumbers()

  const [tab, setTab] = useState<NTab>('home')
  const [detail, setDetail] = useState<PhoneMarketItem | null>(null)

  // витрина
  const [items, setItems] = useState<PhoneMarketItem[]>([])
  const [mLoading, setMLoading] = useState(true)
  const [favs, setFavs] = useState<string[]>([])
  const [buying, setBuying] = useState(false)
  const [toast, setToast] = useState('')

  // фильтры
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<PhoneMarketItem['category'] | 'all'>('all')
  const [pat, setPat] = useState<PatKey>('any')
  const [priceLo, setPriceLo] = useState(0)
  const [priceHi, setPriceHi] = useState(1_000_000)
  const [premiumOnly, setPremiumOnly] = useState(false)

  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[])
    } catch {
      /* ignore */
    }
  }, [])

  const showToast = useCallback((t: string) => {
    setToast(t)
    setTimeout(() => setToast(''), 2400)
  }, [])

  const loadMarket = useCallback(async () => {
    try {
      const r = await api.phonesMarket()
      setItems(r.items)
    } catch {
      /* сеть моргнула */
    } finally {
      setMLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void loadMarket(), 0)
    return () => clearTimeout(t)
  }, [loadMarket])

  const toggleFav = useCallback((digits: string) => {
    sound.tap()
    setFavs((prev) => {
      const next = prev.includes(digits) ? prev.filter((k) => k !== digits) : [...prev, digits]
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const favItems = useMemo(() => items.filter((i) => favs.includes(i.digits)), [items, favs])

  const refreshBalance = useCallback(
    (b: number) => {
      useOS.getState().refreshSession({ balance: b })
    },
    [],
  )

  const buyMarket = useCallback(
    async (item: PhoneMarketItem) => {
      if (buying) return
      sound.tap()
      setBuying(true)
      try {
        const r = await api.phonesMarketBuy(item.digits)
        refreshBalance(r.balance)
        await n.refresh()
        setDetail(null)
        setItems((list) => list.filter((i) => i.digits !== item.digits))
        pushToast('Номер ваш', item.number)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Не удалось купить номер')
      } finally {
        setBuying(false)
      }
    },
    [buying, pushToast, showToast, refreshBalance, n],
  )

  // ── состояние барабана (сцена «Розыгрыш») ──
  const [region, setRegion] = useState<string>(() => {
    if (typeof window === 'undefined') return 'msk'
    try {
      const saved = window.localStorage.getItem('numbers.region')
      return saved && REGIONS.some((r) => r.id === saved) ? saved : 'msk'
    } catch {
      return 'msk'
    }
  })
  const regionMeta = REGIONS.find((r) => r.id === region) ?? REGIONS[0]
  useEffect(() => {
    try {
      window.localStorage.setItem('numbers.region', region)
    } catch {}
  }, [region])
  const [sheetOpen, setSheetOpen] = useState(false)

  const [spin, setSpin] = useState<SpinCmd | null>(null)
  const [result, setResult] = useState<PhoneDTO | null>(null)
  const [claimed, setClaimed] = useState(false)
  const [everRolled, setEverRolled] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)

  const pendingRef = useRef<PhoneDTO | null>(null)
  const seqRef = useRef(0)
  const rollStartRef = useRef(0)
  const plateScale = useMotionValue(1)

  /** Последняя колонка доехала: показываем результат и «Забрать». */
  const handleSettled = useCallback(() => {
    const p = pendingRef.current
    if (!p) return // разгонная прокрутка ещё без ответа сервера — ждём
    setRolling(false)
    pendingRef.current = null
    setResult(p)
    setClaimed(false)
    sound.success()
    // плашка вздрагивает на финале
    plateScale.jump(1.025)
    animate(plateScale, 1, { duration: 0.45, ease: [0.22, 1, 0.36, 1] })
    if (p.tier === 'diamond' || p.tier === 'platinum') {
      pushToast('Джекпот!', `${p.number} — ${tierMeta(p.tier).label}`)
      if (p.tier === 'diamond') sound.levelup()
    }
  }, [pushToast, plateScale])

  const doRoll = async () => {
    if (rolling || busy) return
    if (n.balance < regionMeta.rollPrice) return
    sound.tap()
    setRolling(true)
    setEverRolled(true)
    setResult(null)
    setClaimed(false)
    pendingRef.current = null
    rollStartRef.current = Date.now()
    seqRef.current += 1
    setSpin({ seq: seqRef.current, digits: randDigits(10), final: false, at: rollStartRef.current })
    const res = await n.roll(regionMeta.id)
    if (res.ok) {
      await n.refresh() // бронь сразу появится в «Профиле»
      pendingRef.current = res.phone
      seqRef.current += 1
      setSpin({ seq: seqRef.current, digits: res.phone.digits.slice(1), final: true, at: rollStartRef.current })
    } else {
      pushToast('Номера', res.error)
      setRolling(false)
    }
  }

  useEffect(() => {
    if (!result || rolling || claimed || busy) return
    if (result.buyPrice > n.balance) {
      const t = setTimeout(() => setResult(null), 5200)
      return () => clearTimeout(t)
    }
  }, [result, rolling, claimed, busy, n.balance])

  const claim = async (p: PhoneDTO) => {
    if (busy) return
    sound.tap()
    setBusy(true)
    const res = await n.buy(p.id)
    if (res.ok) {
      sound.success()
      if (result?.id === p.id) setClaimed(true)
      else pushToast('Номер ваш', p.number)
      await n.refresh()
    } else {
      pushToast('Номера', res.error)
      if (result?.id === p.id) setResult(null)
    }
    setBusy(false)
  }

  const doRelease = async (p: PhoneDTO) => {
    if (busy) return
    sound.tap()
    setBusy(true)
    const ok = await n.release(p.id)
    if (ok) {
      if (result?.id === p.id) setResult(null)
      await n.refresh()
    }
    setBusy(false)
  }

  const doSetMain = async (p: PhoneDTO) => {
    if (busy || p.isMain) return
    sound.tap()
    setBusy(true)
    const ok = await n.setMain(p.id)
    if (ok) await n.refresh()
    setBusy(false)
  }

  const showActions = result !== null && !rolling && !claimed
  const canAfford = result ? result.buyPrice === 0 || n.balance >= result.buyPrice : false
  const rollTooPoor = n.balance < regionMeta.rollPrice

  const stampCode = result ? result.regionCode : regionMeta.codes[0]
  const stampName = result ? shortRegion(result.regionName) : regionMeta.short
  const stampLabel = result
    ? `На плашке номер ${result.number}, регион ${result.regionName}`
    : 'Плашка пустая — крутни барабаны, чтобы увидеть номер'

  const tierColor = result ? tierMeta(result.tier).color : '#A8B3AC'
  const pattern = result ? patternOf(result.digits.slice(4)) : null
  const goldPlate = isGoldCode(stampCode)
  const glowColor = result && !rolling ? (GLOW[result.tier] ?? (goldPlate ? '#E3B341' : undefined)) : undefined

  return (
    <div className="relative flex h-full flex-col bg-[#F5F6F8] text-[#17181A]">
      {detail === null && tab !== 'search' && (
        <header className="shrink-0 px-4 pb-1 pt-1.5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em]">Номера</h1>
              <p className="text-[12.5px] text-gray-400">Красивые номера для особенных людей</p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-[0_2px_10px_rgba(23,24,26,0.06)]">
                <Bell className="size-5" />
              </span>
              <button
                type="button"
                onClick={() => {
                  sound.tap()
                  setTab('profile')
                }}
                aria-label="Профиль"
                className="press flex size-10 items-center justify-center rounded-full bg-[#ECEEF1] text-gray-500"
              >
                <UserRound className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="min-h-0 flex-1 pb-[64px]">
        <div key={`${tab}-${detail ? 'd' : 'r'}`} className="h-full screen-enter">
          {detail ? (
            <MarketDetail
              item={detail}
              faved={favs.includes(detail.digits)}
              busy={buying}
              onFav={() => toggleFav(detail.digits)}
              onBuy={() => void buyMarket(detail)}
              onBack={() => setDetail(null)}
              onShare={() => showToast('Ссылка на номер скопирована')}
            />
          ) : tab === 'home' ? (
            <MarketHome
              loading={mLoading}
              items={items}
              category={category}
              favs={favs}
              onCategory={setCategory}
              onSearch={() => setTab('search')}
              onOpen={setDetail}
              onFav={toggleFav}
            />
          ) : tab === 'search' ? (
            <MarketFilters
              items={items}
              q={q}
              setQ={setQ}
              category={category}
              setCategory={setCategory}
              pat={pat}
              setPat={setPat}
              priceLo={priceLo}
              priceHi={priceHi}
              setPriceLo={setPriceLo}
              setPriceHi={setPriceHi}
              premiumOnly={premiumOnly}
              setPremiumOnly={setPremiumOnly}
              onApply={() => setTab('home')}
              onReset={() => {
                sound.tap()
                setQ('')
                setCategory('all')
                setPat('any')
                setPriceLo(0)
                setPriceHi(1_000_000)
                setPremiumOnly(false)
              }}
            />
          ) : tab === 'roll' ? (
            /* ───────── РОЗЫГРЫШ: сцена барабанов ───────── */
            <div className="h-full min-h-0 overflow-y-auto px-4 pb-4 pt-1 [scrollbar-width:thin]">
              <p className="mx-auto max-w-[300px] text-center text-[12.5px] leading-relaxed text-gray-400">
                Крутите барабан и получите уникальный номер из премиальной коллекции
              </p>
              <section className={CARD + ' mt-3 px-2.5 pb-4 pt-3'}>
                <button
                  type="button"
                  onClick={() => {
                    sound.tap()
                    setSheetOpen(true)
                  }}
                  disabled={rolling}
                  className="flex h-11 w-full items-center justify-between gap-2 rounded-2xl bg-[#F1F3F4] px-3.5 transition-transform active:scale-[0.99] disabled:opacity-50"
                  aria-label={`Регион ${regionMeta.name}, крутка ${regionMeta.rollPrice} рублей, изменить`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MapPin className="size-4 shrink-0 text-[#17181A]/45" aria-hidden="true" />
                    <span className="truncate text-[14px] font-semibold">{regionMeta.short}</span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-[#17181A]/40">{codesLabel(regionMeta.codes)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[11px] text-[#17181A]/40">крутка</span>
                    <span className="text-[13.5px] font-bold tabular-nums">{fmtMoney(regionMeta.rollPrice)}</span>
                    <ChevronDown className="size-4 text-[#17181A]/35" aria-hidden="true" />
                  </span>
                </button>

                <div className="relative mt-3">
                  <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-3 rounded-[28px]"
                    initial={false}
                    animate={{ opacity: glowColor ? 1 : 0 }}
                    transition={{ duration: 0.55 }}
                    style={{
                      background: `radial-gradient(62% 72% at 50% 42%, ${glowColor ?? 'transparent'}40, transparent 72%)`,
                    }}
                  />
                  <motion.div
                    style={{ scale: plateScale }}
                    className={'plate-frame relative overflow-hidden rounded-[18px] bg-white px-1 py-3' + (goldPlate ? ' plate-gold' : '')}
                  >
                    <PlateReels spin={spin ?? IDLE_SPIN} stamp={{ code: stampCode, name: stampName, label: stampLabel }} onSettled={handleSettled} />
                    <AnimatePresence>
                      {result && !rolling && (
                        <motion.div
                          key={result.id}
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[16px]"
                        >
                          <motion.div
                            className="absolute inset-y-0 w-1/2 -skew-x-12"
                            initial={{ x: '-170%' }}
                            animate={{ x: '380%' }}
                            transition={{ duration: 0.9, delay: 0.05, ease: [0.32, 0, 0.25, 1] }}
                            style={{ background: `linear-gradient(90deg, transparent, ${tierColor}30, transparent)` }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
                {result && <span className="sr-only">Выпал номер {result.number}</span>}

                {!everRolled && !rolling && result === null && (
                  <motion.p
                    animate={{ opacity: [0.45, 0.9, 0.45] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                    className="mt-3 text-center text-[12.5px] text-[#17181A]/45"
                  >
                    Крутни, чтобы увидеть номер
                  </motion.p>
                )}

                {showActions && result && (
                  <motion.div
                    key={result.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.06 }}
                  >
                    <div className="mt-3.5 flex items-center gap-2">
                      <motion.span
                        initial={{ scale: 0.55, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.1 }}
                        className="shrink-0"
                      >
                        <TierBadge tier={result.tier} size="lg" variant="light" />
                      </motion.span>
                      {pattern && (
                        <span className="shrink-0 rounded-full bg-[#F1F3F4] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#17181A]/55">
                          {pattern}
                        </span>
                      )}
                      <ScoreBar score={result.beautyScore} color={tierColor} />
                    </div>
                    <div className="mt-3.5 flex gap-2">
                      {canAfford ? (
                        <button
                          type="button"
                          onClick={() => claim(result)}
                          disabled={busy}
                          className={
                            'h-[52px] flex-[1.15] rounded-full text-[14px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ' +
                            (result.buyPrice === 0 ? 'bg-[#FFD53D] text-[#231a02]' : 'bg-[#17181A] text-white')
                          }
                        >
                          {result.buyPrice === 0 ? 'Забрать бесплатно' : `Забрать · ${fmtMoney(result.buyPrice)}`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="h-[52px] flex-[1.15] rounded-full bg-[#17181A]/[0.06] text-[13.5px] font-semibold text-[#17181A]/40"
                        >
                          Не хватает {fmtMoney(result.buyPrice - n.balance)}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={doRoll}
                        disabled={busy}
                        aria-label={`Крутить ещё за ${regionMeta.rollPrice} рублей`}
                        className="h-[52px] flex-1 whitespace-nowrap rounded-full border border-[#17181A]/12 bg-white px-3 text-[13.5px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
                      >
                        Ещё · {fmtMoney(regionMeta.rollPrice)}
                      </button>
                    </div>
                    {!canAfford && (
                      <p className="mt-2 text-center text-[11.5px] text-[#17181A]/40">Номер ждёт в «Бронях» 48 часов</p>
                    )}
                  </motion.div>
                )}

                {result && claimed && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-center justify-center gap-1.5 text-[15px] font-semibold"
                  >
                    <BadgeCheck className="size-5" aria-hidden="true" />
                    Номер ваш
                  </motion.div>
                )}

                {!showActions && (
                  <button
                    type="button"
                    onClick={doRoll}
                    disabled={rolling || busy || rollTooPoor}
                    aria-label={`Прокрутить номер за ${regionMeta.rollPrice} рублей`}
                    className={
                      'mt-4 flex h-[54px] w-full flex-col items-center justify-center gap-0.5 rounded-full text-white transition-transform active:scale-[0.98] disabled:active:scale-100 ' +
                      (rollTooPoor && !rolling ? 'bg-[#17181A]/[0.06] text-[#17181A]/40' : '')
                    }
                    style={
                      rollTooPoor && !rolling
                        ? undefined
                        : { background: 'linear-gradient(180deg,#E8C46A 0%,#C99B2F 55%,#B8860B 100%)', boxShadow: '0 12px 28px rgba(201,155,47,0.45)' }
                    }
                  >
                    {rolling ? (
                      <span className="flex items-center gap-2 text-[15.5px] font-semibold">
                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} className="inline-flex">
                          <Loader2 className="size-5" aria-hidden="true" />
                        </motion.span>
                        Крутим…
                      </span>
                    ) : rollTooPoor ? (
                      <span className="text-[14.5px] font-semibold">Не хватает {fmtMoney(regionMeta.rollPrice - n.balance)}</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-2 text-[15.5px] font-semibold">
                          <Dices className="size-[18px]" aria-hidden="true" />
                          Крутить номер
                        </span>
                        <span className="text-[10.5px] font-medium text-white/85">{fmtMoney(regionMeta.rollPrice)} за 1 попытку</span>
                      </>
                    )}
                  </button>
                )}
              </section>

              {/* Возможные категории */}
              <div className={CARD + ' mt-3 p-4'}>
                <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-[#17181A]">
                  Возможные категории
                  <span className="flex size-4 items-center justify-center rounded-full bg-[#F1F3F4] text-[10px] text-gray-400" aria-hidden>
                    ?
                  </span>
                </p>
                <div className="mt-2.5 grid grid-cols-4 gap-2 text-center">
                  {[
                    { icon: <Crown className="size-4.5 text-[#D9A514]" aria-hidden />, label: 'Красивые', sub: 'от 1 990 ₽' },
                    { icon: <Wallet className="size-4.5 text-[#D9A514]" aria-hidden />, label: 'Золотые', sub: 'от 49 990 ₽' },
                    { icon: <Dices className="size-4.5 text-[#D9A514]" aria-hidden />, label: 'С повторами', sub: '777, 888, 000' },
                    { icon: <Heart className="size-4.5 text-[#D9A514]" aria-hidden />, label: 'Удачные', sub: 'легко запомнить' },
                  ].map((c) => (
                    <div key={c.label} className="flex flex-col items-center gap-1">
                      {c.icon}
                      <span className="text-[9.5px] font-bold leading-tight text-[#17181A]">{c.label}</span>
                      <span className="text-[8.5px] leading-none text-gray-400">{c.sub}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : tab === 'favs' ? (
            /* ───────── ИЗБРАННОЕ ───────── */
            <div className="h-full min-h-0 overflow-y-auto px-4 pb-6 pt-2 [scrollbar-width:thin]">
              {favItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 px-8 pt-16 text-center">
                  <span className="flex size-16 items-center justify-center rounded-[22px] bg-white text-[#C4C8CF] shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
                    <Heart className="size-7" aria-hidden />
                  </span>
                  <h3 className="text-[15px] font-bold text-[#17181A]">В избранном пусто</h3>
                  <p className="text-[13px] leading-relaxed text-gray-500">
                    Жмите на сердце у номера — он появится здесь для быстрой покупки.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {favItems.map((it, i) => (
                    <MarketRow key={it.key} item={it} index={i} faved onOpen={() => setDetail(it)} onFav={() => toggleFav(it.digits)} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ───────── ПРОФИЛЬ: мои + брони + история ───────── */
            <div className="h-full min-h-0 overflow-y-auto px-4 pb-6 pt-2 [scrollbar-width:thin]">
              {/* Основной номер крупной плашкой */}
              {n.mainNumber ? (
                <div className={CARD + ' p-4'}>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#17181A]/35">Основной</span>
                  <h2 className="mt-1 truncate text-[24px] font-bold leading-tight tracking-tight tabular-nums">
                    {n.mainNumber.number}
                  </h2>
                  <div className="mt-1.5 flex items-center gap-2">
                    <TierBadge tier={n.mainNumber.tier} variant="light" />
                    <span className="text-[12px] text-[#17181A]/45">{n.mainNumber.regionName}</span>
                  </div>
                </div>
              ) : (
                <div className={CARD + ' flex flex-col items-center gap-2 p-6 text-center'}>
                  <Dices className="size-7 text-[#17181A]/15" aria-hidden="true" />
                  <p className="text-[14px] font-semibold text-[#17181A]/45">Номеров пока нет</p>
                  <button
                    type="button"
                    onClick={() => {
                      sound.tap()
                      setTab('roll')
                    }}
                    className="mt-1 h-10 rounded-full bg-[#17181A] px-5 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
                  >
                    Крутить первый
                  </button>
                </div>
              )}

              {/* Брони */}
              {n.reserves.length > 0 && (
                <>
                  <SectionTitle count={n.reserves.length}>Брони · 48 ч</SectionTitle>
                  <div className="flex flex-col gap-2">
                    {n.reserves.map((p) => (
                      <ReserveCard key={p.id} p={p} busy={busy} balance={n.balance} onClaim={claim} onRelease={doRelease} />
                    ))}
                  </div>
                </>
              )}

              {/* Остальные номера */}
              {n.owned.length > (n.mainNumber ? 1 : 0) && (
                <>
                  <SectionTitle count={n.owned.length - (n.mainNumber ? 1 : 0)}>Остальные</SectionTitle>
                  <div className={CARD + ' divide-y divide-[#17181A]/[0.05]'}>
                    {n.owned
                      .filter((p) => !p.isMain)
                      .map((p) => (
                        <div key={p.id} className="flex items-center gap-2 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => doSetMain(p)}
                            disabled={busy}
                            aria-label={`Сделать ${p.number} основным`}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold tabular-nums">{p.number}</span>
                            <TierBadge tier={p.tier} variant="light" />
                          </button>
                          <ReleaseX label={`Отпустить номер ${p.number}`} onRelease={() => doRelease(p)} />
                        </div>
                      ))}
                  </div>
                </>
              )}

              {/* История */}
              {n.history.length > 0 && (
                <>
                  <SectionTitle count={n.history.length}>Последние крутки</SectionTitle>
                  <div className={CARD + ' divide-y divide-[#17181A]/[0.05]'}>
                    {n.history.map((p) => (
                      <div key={p.id} className={'flex items-center gap-3 px-4 py-2.5 ' + (p.status === 'released' ? 'opacity-40' : '')}>
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tierMeta(p.tier).color }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium tabular-nums">{p.number}</span>
                        {p.status === 'reserved' && (
                          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-[#17181A]/40">бронь</span>
                        )}
                        {p.status === 'active' && <BadgeCheck className="size-4 shrink-0 text-[#17181A]/60" aria-label="Ваш" />}
                        <span className="shrink-0 text-[11px] tabular-nums text-[#17181A]/35">
                          {new Date(p.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {n.loading && n.numbers.length === 0 && (
                <div className="py-10 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-[#17181A]/25" aria-hidden="true" />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* нижний таб-бар */}
      {detail === null && (
        <nav
          aria-label="Разделы номеров"
          className="absolute inset-x-0 bottom-0 z-20 flex h-[64px] items-stretch border-t border-black/[0.04] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <NTabBtn label="Главная" active={tab === 'home'} icon={<HomeIcon />} onClick={() => { sound.tap(); setTab('home') }} />
          <NTabBtn label="Поиск" active={tab === 'search'} icon={<Search className="size-[22px]" aria-hidden />} onClick={() => { sound.tap(); setTab('search') }} />
          <div className="relative flex w-1/5 items-start justify-center">
            <button
              type="button"
              onClick={() => {
                sound.tap()
                setTab('roll')
              }}
              aria-label="Розыгрыш"
              className="press -mt-5 flex size-[52px] items-center justify-center rounded-full text-white"
              style={{ background: GREEN, boxShadow: '0 10px 22px rgba(18,137,75,0.4)' }}
            >
              <Dices className="size-6" aria-hidden />
            </button>
          </div>
          <NTabBtn label="Избранное" active={tab === 'favs'} icon={<Heart className="size-[22px]" aria-hidden />} onClick={() => { sound.tap(); setTab('favs') }} />
          <NTabBtn label="Профиль" active={tab === 'profile'} icon={<UserRound className="size-[22px]" aria-hidden />} onClick={() => { sound.tap(); setTab('profile') }} />
        </nav>
      )}

      {/* тосты */}
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-40 flex justify-center px-6" role="status">
          <span className="screen-enter rounded-full bg-[#17181A]/92 px-4 py-2.5 text-center text-[12.5px] font-medium text-white shadow-xl">
            {toast}
          </span>
        </div>
      )}

      {/* Шторка выбора региона: монтируется заново при каждом открытии */}
      <AnimatePresence>
        {sheetOpen && (
          <RegionSheet
            region={region}
            onPick={(id) => {
              sound.tap()
              setRegion(id)
              setSheetOpen(false)
            }}
            onClose={() => setSheetOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-[22px]">
      <path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function NTabBtn({ label, active, icon, onClick }: { label: string; active: boolean; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="press flex w-1/5 flex-col items-center justify-center gap-0.5 pb-1"
      style={{ color: active ? '#17181A' : '#9CA3AF' }}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
