'use client'

// Приложение «Номера» (Task 30) — крутилка в духе игровых автоматов.
// Вкладки: Крутить / Брони / Мои / История — каждая помещается на экран,
// вниз бесконечно не листаем. Сцена: ГТА-плашка с десятью барабанами-окошками;
// при «Крутить» цифры ПАДАЮТ СВЕРХУ ВНИЗ с motion-блюром, колонки
// останавливаются влево→вправо, каждое окошко «клацает» (scaleY-поп).
// На финале плашка вздрагивает, по ней проходит цветная волна тира,
// за плашкой загорается свечение (Золото/Платина/Бриллиант).
// Регионы — все субъекты РФ (85 шт.), выбор через шторку с поиском.
// Результат НИКОГДА не сохраняется сам: «Забрать» (бесплатно / за N ₽)
// или «Крутить ещё»; невыкупленное ждёт в «Бронях» 48 ч.
// Светлый M3 ОС: фон #F5F6F8, белые карточки r20, чёрные pill-CTA,
// жёлтый #FFD53D. Тёмная тема — пары в globals.css (.plate-frame/.reel-*).

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { animate, AnimatePresence, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'framer-motion'
import { BadgeCheck, Check, ChevronDown, Dices, Loader2, MapPin, Search, Timer, Wallet, X } from 'lucide-react'
import { REGIONS, RESERVE_HOURS, reserveSecondsLeft } from '@/lib/phone'
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

const randDigit = () => String(Math.floor(Math.random() * 10))
const randDigits = (n: number) => Array.from({ length: n }, randDigit).join('')

/** name → short для штампа результата (regionName в DTO — полное имя). */
const SHORT_BY_NAME: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.name, r.short]))
const shortRegion = (name: string) => SHORT_BY_NAME[name] ?? name

/** Коды региона для списка: «495 · 499», «900–999», «812». */
function codesLabel(codes: string[]): string {
  return codes.length > 3 ? `${codes[0]}–${codes[codes.length - 1]}` : codes.join(' · ')
}

/** Престиж → 1..5 точек в шторке регионов. */
function prestigeDots(prestige: number): number {
  if (prestige >= 1.15) return 5
  if (prestige >= 1.05) return 4
  if (prestige >= 0.95) return 3
  if (prestige >= 0.8) return 2
  return 1
}

/** Метка паттерна для чипа результата (первый совпавший). */
function patternOf(tail: string): string | null {
  const d = tail.replace(/\D/g, '')
  if (d.length < 4) return null
  if (d === [...d].reverse().join('')) return 'Палиндром'
  if (/(.)\1{2}/.test(d)) return 'Триплет'
  // стрит: 4+ цифр шагом ±1 в одном направлении
  let run = 1
  for (let i = 1; i < d.length; i++) {
    const step = d.charCodeAt(i) - d.charCodeAt(i - 1)
    const prev = i >= 2 ? d.charCodeAt(i - 1) - d.charCodeAt(i - 2) : 0
    if ((step === 1 || step === -1) && (i === 1 || prev === step)) {
      run++
      if (run >= 4) return 'Стрит'
    } else if (step === 1 || step === -1) run = 2
    else run = 1
  }
  for (let i = 0; i + 4 <= d.length; i++) {
    if (d[i] === d[i + 3] && d[i + 1] === d[i + 2]) return 'Зеркало'
  }
  if (d.length >= 5 && [...d].every((c, i) => i < 2 || c === d[i - 2])) return 'Чередование'
  if (/00$/.test(d)) return 'Круглый'
  return null
}

/** Свечение за плашкой: только редкие тиры. */
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
      {/* штамп региона — как «78 RUS» на ГТА-плашке, только с именем мелко */}
      <span
        className="ml-1.5 flex shrink-0 flex-col items-center justify-center gap-[3px] border-l-2 border-[#17181A]/[0.08] pl-2 pr-0.5"
        style={{ height: CELL + 6 }}
      >
        <span className="text-[13.5px] font-extrabold leading-none tabular-nums">{stamp.code}</span>
        <span className="max-w-[48px] truncate text-[6.5px] font-bold uppercase leading-none tracking-[0.1em] text-[#17181A]/40">
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
        <Timer className={'size-3.5 shrink-0 ' + (urgent ? 'text-[#EE3F58]' : 'text-[#17181A]/35')} aria-hidden="true" />
        <span className={'shrink-0 text-[12px] font-semibold tabular-nums ' + (urgent ? 'text-[#EE3F58]' : 'text-[#17181A]/55')}>
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
        className="absolute inset-x-0 bottom-0 z-30 flex max-h-[82%] flex-col rounded-t-[24px] bg-white pb-5 shadow-[0_-12px_40px_rgba(23,24,26,0.16)]"
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
                  <span className="block truncate text-[14px] font-medium">{r.name}</span>
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

/* ──────────────────────────────── Экран ─────────────────────────────────── */

type Tab = 'roll' | 'reserves' | 'mine' | 'history'

const TABS: { id: Tab; label: string }[] = [
  { id: 'roll', label: 'Крутить' },
  { id: 'reserves', label: 'Брони' },
  { id: 'mine', label: 'Мои' },
  { id: 'history', label: 'История' },
]

export default function NumbersApp() {
  const pushToast = useOS((s) => s.pushToast)
  const n = useNumbers()

  const [tab, setTab] = useState<Tab>('roll')

  const [region, setRegion] = useState('msk')
  const regionMeta = REGIONS.find((r) => r.id === region) ?? REGIONS[0]
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
    // Барабаны стартуют сразу по случайной цели; когда придёт ответ —
    // бесшовно докрутим до реальных цифр (та же лента, без рывков).
    rollStartRef.current = Date.now()
    seqRef.current += 1
    setSpin({ seq: seqRef.current, digits: randDigits(10), final: false, at: rollStartRef.current })
    const res = await n.roll(regionMeta.id)
    if (res.ok) {
      await n.refresh() // бронь сразу появится во вкладке «Брони»
      pendingRef.current = res.phone
      seqRef.current += 1
      setSpin({ seq: seqRef.current, digits: res.phone.digits.slice(1), final: true, at: rollStartRef.current })
    } else {
      pushToast('Номера', res.error)
      setRolling(false)
    }
  }

  /** Премиум без денег: карточка сама уходит, номер ждёт в «Бронях» 48 ч. */
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

  // Штамп региона: у выпавшего номера — его код, до первой прокрутки — выбор.
  const stampCode = result ? result.regionCode : regionMeta.codes[0]
  const stampName = result ? shortRegion(result.regionName) : regionMeta.short
  const stampLabel = result
    ? `На плашке номер ${result.number}, регион ${result.regionName}`
    : 'Плашка пустая — крутни барабаны, чтобы увидеть номер'

  const tierColor = result ? tierMeta(result.tier).color : '#A8B3AC'
  const pattern = result ? patternOf(result.digits.slice(4)) : null
  const glowColor = result && !rolling ? GLOW[result.tier] : undefined

  const counts: Partial<Record<Tab, number>> = {
    reserves: n.reserves.length,
    mine: n.owned.length,
    history: n.history.length,
  }

  return (
    <div className="relative flex h-full flex-col bg-[#F5F6F8] text-[#17181A]">
      {/* Шапка: название + баланс */}
      <header className="shrink-0 px-5 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[19px] font-bold tracking-tight">Номера</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold tabular-nums shadow-[0_2px_10px_rgba(23,24,26,0.05)]">
            <Wallet className="size-3.5 text-[#17181A]/40" aria-hidden="true" />
            {fmtMoney(n.balance)}
          </span>
        </div>

        {/* Вкладки: компактный сегмент-контрол */}
        <div className="mt-2.5 flex rounded-full bg-[#F1F3F4] p-1" role="tablist" aria-label="Разделы номеров">
          {TABS.map((t) => {
            const active = tab === t.id
            const count = counts[t.id]
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  sound.tap()
                  setTab(t.id)
                }}
                className={
                  'relative flex h-9 flex-1 items-center justify-center gap-1 rounded-full text-[12.5px] font-semibold transition-colors ' +
                  (active ? 'bg-white text-[#17181A] shadow-[0_1px_6px_rgba(23,24,26,0.08)]' : 'text-[#17181A]/45')
                }
              >
                {t.label}
                {typeof count === 'number' && count > 0 && (
                  <span
                    className={
                      'min-w-[17px] rounded-full px-1 text-center text-[10px] font-bold leading-[17px] tabular-nums ' +
                      (active ? 'bg-[#17181A] text-white' : 'bg-[#17181A]/[0.1] text-[#17181A]/50')
                    }
                  >
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      <main className="nice-scroll flex-1 overflow-y-auto px-4 pb-8 pt-1">
        {/* ─────────── КРУТИТЬ: сцена, влезает на экран без скролла ─────────── */}
        {tab === 'roll' && (
          <section className={CARD + ' px-2.5 pb-4 pt-3'}>
            {/* Регион — тап открывает шторку с поиском */}
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
                <span className="truncate text-[14px] font-semibold">{regionMeta.name}</span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-[#17181A]/40">{codesLabel(regionMeta.codes)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-[11px] text-[#17181A]/40">крутка</span>
                <span className="text-[13.5px] font-bold tabular-nums">{fmtMoney(regionMeta.rollPrice)}</span>
                <ChevronDown className="size-4 text-[#17181A]/35" aria-hidden="true" />
              </span>
            </button>

            {/* Плашка со свечением редкого тира */}
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
                className="plate-frame relative overflow-hidden rounded-[18px] bg-white px-1 py-3"
              >
                <PlateReels spin={spin ?? IDLE_SPIN} stamp={{ code: stampCode, name: stampName, label: stampLabel }} onSettled={handleSettled} />
                {/* цветная волна тира по плашке на финале */}
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

            {/* Подсказка до первой прокрутки */}
            {!everRolled && !rolling && result === null && (
              <motion.p
                animate={{ opacity: [0.45, 0.9, 0.45] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                className="mt-3 text-center text-[12.5px] text-[#17181A]/45"
              >
                Крутни, чтобы увидеть номер
              </motion.p>
            )}

            {/* Результат: тир + паттерн + красота + Забрать / Крутить ещё */}
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
                    className="h-[52px] flex-1 rounded-full border border-[#17181A]/12 bg-white text-[14px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
                  >
                    Крутить ещё · {fmtMoney(regionMeta.rollPrice)}
                  </button>
                </div>
                {!canAfford && (
                  <p className="mt-2 text-center text-[11.5px] text-[#17181A]/40">
                    Номер ждёт в «Бронях» 48 часов
                  </p>
                )}
              </motion.div>
            )}

            {/* Забрано */}
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

            {/* CTA прокрутки (пока результат не разыгран) */}
            {!showActions && (
              <button
                type="button"
                onClick={doRoll}
                disabled={rolling || busy || rollTooPoor}
                aria-label={`Прокрутить номер за ${regionMeta.rollPrice} рублей`}
                className={
                  'mt-4 flex h-[54px] w-full items-center justify-center gap-2 rounded-full text-[15.5px] font-semibold transition-transform active:scale-[0.98] disabled:active:scale-100 ' +
                  (rollTooPoor && !rolling
                    ? 'bg-[#17181A]/[0.06] text-[#17181A]/40'
                    : result && !rolling
                      ? 'border border-[#17181A]/12 bg-white text-[#17181A]'
                      : 'bg-[#17181A] text-white disabled:opacity-80')
                }
              >
                {rolling ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                      className="inline-flex"
                    >
                      <Loader2 className="size-5" aria-hidden="true" />
                    </motion.span>
                    Крутим…
                  </>
                ) : rollTooPoor ? (
                  `Не хватает ${fmtMoney(regionMeta.rollPrice - n.balance)}`
                ) : (
                  <>
                    <Dices className="size-[18px]" aria-hidden="true" />
                    {result ? `Крутить ещё · ${fmtMoney(regionMeta.rollPrice)}` : `Крутить · ${fmtMoney(regionMeta.rollPrice)}`}
                  </>
                )}
              </button>
            )}
          </section>
        )}

        {/* ─────────────────────────── БРОНИ ─────────────────────────── */}
        {tab === 'reserves' && (
          <section>
            {n.reserves.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Timer className="size-7 text-[#17181A]/15" aria-hidden="true" />
                <p className="text-[14px] font-semibold text-[#17181A]/45">Броней нет</p>
                <p className="text-[12.5px] text-[#17181A]/35">Не выкупленный номер ждёт тут 48 часов</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                {n.reserves.map((p) => (
                  <ReserveCard key={p.id} p={p} busy={busy} balance={n.balance} onClaim={claim} onRelease={doRelease} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ──────────────────────────── МОИ ──────────────────────────── */}
        {tab === 'mine' && (
          <section>
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
              <div className="flex flex-col items-center gap-2 py-14 text-center">
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

            {/* Остальные номера: тап — сделать основным */}
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
          </section>
        )}

        {/* ────────────────────────── ИСТОРИЯ ────────────────────────── */}
        {tab === 'history' && (
          <section>
            {n.history.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Dices className="size-7 text-[#17181A]/15" aria-hidden="true" />
                <p className="text-[14px] font-semibold text-[#17181A]/45">Круток ещё не было</p>
              </div>
            ) : (
              <>
                <SectionTitle count={n.history.length}>Последние крутки</SectionTitle>
                <div className={CARD + ' divide-y divide-[#17181A]/[0.05]'}>
                  {n.history.map((p) => (
                    <div
                      key={p.id}
                      className={'flex items-center gap-3 px-4 py-2.5 ' + (p.status === 'released' ? 'opacity-40' : '')}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tierMeta(p.tier).color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium tabular-nums">{p.number}</span>
                      {p.status === 'reserved' && (
                        <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-[#17181A]/40">бронь</span>
                      )}
                      {p.status === 'active' && (
                        <BadgeCheck className="size-4 shrink-0 text-[#17181A]/60" aria-label="Ваш" />
                      )}
                      <span className="shrink-0 text-[11px] tabular-nums text-[#17181A]/35">
                        {new Date(p.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {n.loading && n.numbers.length === 0 && (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-[#17181A]/25" aria-hidden="true" />
          </div>
        )}
      </main>

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
