'use client'

// Приложение «Номера» (Task 27-a) — отдельная забегаловка выбивания телефонных
// номеров в духе GTA5 RP. Главная сцена — большая белая «плашка» (как ГТА-номер):
// каждая цифра в своей ячейке-барабане, статичные «+7 ( ) -» между ними, справа
// штамп региона с именем (аналог «78 RUS»). До первой прокрутки плашка пустая
// («·»). При «Крутить» цифры ПАДАЮТ СВЕРХУ ВНИЗ (лента 0-9, ease-out, колонки
// останавливаются влево→вправо, ~2 с), звук/вибро на старте и на финале.
// Результат НИКОГДА не сохраняется сам: «Забрать» (бесплатно / за N ₽) или
// «Крутить ещё»; невыкупленное ждёт в «Бронях» 48 ч. Светлый Material 3 ОС:
// фон #F5F6F8, белые карточки rounded-[20px], чёрные pill-CTA, жёлтый #FFD53D.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate, AnimatePresence, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'framer-motion'
import { BadgeCheck, Check, ChevronDown, Loader2, Timer, Wallet, X } from 'lucide-react'
import { REGIONS, reserveSecondsLeft } from '@/lib/phone'
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

/** Короткие подписи регионов для плашки и строк (полные имена — в lib/phone). */
const SHORT_REGION: Record<string, string> = {
  'Москва': 'Москва',
  'Санкт-Петербург': 'СПб',
  'Мобильные федеральные': 'Мобильные',
  'Казань': 'Казань',
  'Московская область': 'МО',
  'Краснодар': 'Краснодар',
  'Екатеринбург': 'Екатеринбург',
  'Ростов-на-Дону': 'Ростов',
  'Новосибирск': 'Новосибирск',
}
const shortRegion = (name: string) => SHORT_REGION[name] ?? name

/** Коды региона для списка: «495 · 499», «900–999», «812». */
function codesLabel(codes: string[]): string {
  return codes.length > 3 ? `${codes[0]}–${codes[codes.length - 1]}` : codes.join(' · ')
}

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

const CELL = 32 // высота ячейки-цифры, px
const CELL_W = 17 // ширина ячейки — плашка должна влезать даже на 360 px
const SYM_H = { height: CELL, lineHeight: `${CELL}px` } as const
const NUM_CLS = 'block text-center text-[20px] font-semibold leading-none tabular-nums'
const SEP_CLS = 'px-px text-[19px] font-semibold tabular-nums text-[#17181A]/30'

/** Командный интерфейс барабана: родитель запускает прокрутку императивно. */
interface ReelHandle {
  /** Уронить ленту до target за duration сек (с задержкой delay). */
  spinTo: (target: string, opt: { delay: number; duration: number; onDone?: () => void }) => void
}

/**
 * Одна колонка-барабан, цифры ПАДАЮТ СВЕРХУ ВНИЗ: лента = [цель, …случайные…,
 * текущая], позиция едет с низа ленты наверх (окно скользит вверх по ленте —
 * визуально контент падает вниз). Текущая видимая цифра дописывается в конец
 * новой ленты, поэтому повторные прокрутки подхватываются без рывка даже
 * в полёте. После остановки лента стоит на целевой цифре.
 */
const DigitReel = forwardRef<ReelHandle>(function DigitReel(_props, ref) {
  const pos = useMotionValue(0) // 0 — цель (верх ленты), N — текущая цифра (низ)
  const y = useTransform(pos, (v) => `${-v * CELL}px`)
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
      onComplete: pending.onDone,
    })
  })

  useEffect(() => () => animRef.current?.stop(), [])

  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden"
      style={{ height: CELL, width: CELL_W }}
    >
      <motion.span className="block will-change-transform" style={{ y }}>
        {strip.map((d, i) => (
          <span key={i} className={NUM_CLS} style={SYM_H}>
            {d}
          </span>
        ))}
      </motion.span>
      {/* шторка-маска: цифры растворяются у краёв ячейки */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-white to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-t from-white to-transparent" />
    </span>
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

const STAGGER = 0.07 // старт колонок влево→вправо
const REEL_SEC = 1.3 // базовая длительность падения колонки

/**
 * Ряд барабанов «+7 (XXX) XXX-XX-XX» + штамп региона справа (аналог «78 RUS»).
 * Первый spin (final=false) — разгон по случайным цифрам; когда приходит ответ
 * сервера (final=true), колонки бесшовно докручиваются до реальных, сохраняя
 * общий темп ~2 с: последняя колонка останавливается последней и зовёт onSettled.
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
      <span className="text-[19px] font-extrabold tracking-tight" style={SYM_H}>
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
        style={{ height: CELL + 4 }}
      >
        <span className="text-[14px] font-extrabold leading-none tabular-nums">{stamp.code}</span>
        <span className="max-w-[52px] truncate text-[7px] font-bold uppercase leading-none tracking-[0.12em] text-[#17181A]/40">
          {stamp.name}
        </span>
      </span>
    </div>
  )
}

/* ─────────────────────────────── Детали UI ──────────────────────────────── */

/** Шкала красоты: ширина анимируется от нуля при появлении. */
function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex flex-1 items-center gap-2.5">
      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#17181A]/[0.07]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(3, score)}%` }}
          transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full bg-[#17181A]"
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

  const free = p.buyPrice === 0
  const affordable = free || balance >= p.buyPrice
  return (
    <div className={CARD + ' p-4'}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[17px] font-semibold tabular-nums">{p.number}</span>
        <TierBadge tier={p.tier} variant="light" />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#17181A]/45">
        <Timer className="size-3.5" aria-hidden="true" />
        <span className="font-semibold tabular-nums text-[#17181A]/65">{fmtCountdown(left)}</span>
        <span>· бронь</span>
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
  open,
  region,
  onPick,
  onClose,
}: {
  open: boolean
  region: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
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
            className="absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] flex-col rounded-t-[24px] bg-white pb-5 shadow-[0_-12px_40px_rgba(23,24,26,0.16)]"
          >
            <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[16px] font-semibold">Выберите регион</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="flex size-8 items-center justify-center rounded-full bg-[#17181A]/[0.05] text-[#17181A]/50 transition-transform active:scale-90"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="nice-scroll flex-1 overflow-y-auto px-5 pt-1">
              {REGIONS.map((r) => {
                const active = r.id === region
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onPick(r.id)}
                    aria-pressed={active}
                    className="flex w-full items-center gap-3 border-b border-[#17181A]/[0.06] py-3 text-left transition-colors last:border-b-0 active:bg-[#17181A]/[0.03]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{r.name}</span>
                      <span className="text-[11.5px] tabular-nums text-[#17181A]/40">{codesLabel(r.codes)}</span>
                    </span>
                    <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">{fmtMoney(r.rollPrice)}</span>
                    {active && <Check className="size-4 shrink-0" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ──────────────────────────────── Экран ─────────────────────────────────── */

export default function NumbersApp() {
  const pushToast = useOS((s) => s.pushToast)
  const n = useNumbers()

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

  /** Последняя колонка доехала: показываем результат и «Забрать». */
  const handleSettled = useCallback(() => {
    const p = pendingRef.current
    if (!p) return // разгонная прокрутка ещё без ответа сервера — ждём
    setRolling(false)
    pendingRef.current = null
    setResult(p)
    setClaimed(false)
    sound.success()
    if (p.tier === 'diamond' || p.tier === 'platinum') {
      pushToast('Джекпот!', `${p.number} — ${tierMeta(p.tier).label}`)
    }
  }, [pushToast])

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
      await n.refresh() // бронь сразу появится в списке «Брони»
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
  const stampName = shortRegion(result ? result.regionName : regionMeta.name)
  const stampLabel = result
    ? `На плашке номер ${result.number}, регион ${result.regionName}`
    : 'Плашка пустая — крутни барабаны, чтобы увидеть номер'

  return (
    <div className="relative flex h-full flex-col bg-[#F5F6F8] text-[#17181A]">
      {/* Шапка: основной номер + баланс */}
      <header className="shrink-0 px-5 pb-1 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#17181A]/35">Мой номер</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold tabular-nums shadow-[0_2px_10px_rgba(23,24,26,0.05)]">
            <Wallet className="size-3.5 text-[#17181A]/40" aria-hidden="true" />
            {fmtMoney(n.balance)}
          </span>
        </div>
        {n.mainNumber ? (
          <>
            <h1 className="mt-1 truncate text-[27px] font-semibold leading-tight tracking-tight tabular-nums">
              {n.mainNumber.number}
            </h1>
            <div className="mt-1.5 flex items-center gap-2">
              <TierBadge tier={n.mainNumber.tier} variant="light" />
              <span className="text-[12px] text-[#17181A]/45">{n.mainNumber.regionName}</span>
            </div>
          </>
        ) : (
          <h1 className="mt-1 text-[27px] font-semibold leading-tight tracking-tight text-[#17181A]/25">Нет номера</h1>
        )}
      </header>

      <main className="nice-scroll flex-1 overflow-y-auto px-4 pb-8 pt-2">
        {/* Сцена: ГТА-плашка + регион + прокрутка */}
        <section className={CARD + ' px-3.5 pb-4 pt-5'}>
          {/* Плашка номера */}
          <div className="rounded-2xl border-[2.5px] border-[#17181A]/[0.08] bg-white px-1 py-4 shadow-[0_10px_28px_rgba(23,24,26,0.08)]">
            <PlateReels
              spin={spin ?? IDLE_SPIN}
              stamp={{ code: stampCode, name: stampName, label: stampLabel }}
              onSettled={handleSettled}
            />
          </div>
          {result && <span className="sr-only">Выпал номер {result.number}</span>}


          {/* Подсказка до первой прокрутки */}
          {!everRolled && !rolling && result === null && (
            <p className="mt-3.5 text-center text-[12.5px] text-[#17181A]/40">Крутни, чтобы увидеть номер</p>
          )}

          {/* Результат: тир + красота + Забрать / Крутить ещё */}
          {showActions && result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
              <div className="mt-4 flex items-center gap-3">
                <TierBadge tier={result.tier} size="lg" variant="light" />
                <ScoreBar score={result.beautyScore} />
              </div>
              <div className="mt-3.5 flex gap-2">
                {canAfford ? (
                  <button
                    type="button"
                    onClick={() => claim(result)}
                    disabled={busy}
                    className={
                      'h-12 flex-1 rounded-full text-[14px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ' +
                      (result.buyPrice === 0 ? 'bg-[#FFD53D] text-[#231a02]' : 'bg-[#17181A] text-white')
                    }
                  >
                    {result.buyPrice === 0 ? 'Забрать бесплатно' : `Забрать · ${fmtMoney(result.buyPrice)}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="h-12 flex-1 rounded-full bg-[#17181A]/[0.06] text-[14px] font-semibold text-[#17181A]/40"
                  >
                    Не хватает {fmtMoney(result.buyPrice - n.balance)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={doRoll}
                  disabled={busy}
                  className="h-12 flex-1 rounded-full border border-[#17181A]/12 bg-white text-[14px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
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

          <div className="mt-4 border-t border-[#17181A]/[0.06] pt-3">
            {/* Регион */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[13px] text-[#17181A]/50">
                Регион:{' '}
                <span className="font-semibold text-[#17181A]">
                  {shortRegion(regionMeta.name)} {regionMeta.codes[0]}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  sound.tap()
                  setSheetOpen(true)
                }}
                disabled={rolling}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-[#17181A] transition-colors active:bg-[#17181A]/[0.05] disabled:opacity-40"
              >
                Изменить
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* CTA прокрутки (пока результат не разыгран) */}
            {!showActions && (
              <button
                type="button"
                onClick={doRoll}
                disabled={rolling || busy || rollTooPoor}
                aria-label={`Прокрутить номер за ${regionMeta.rollPrice} рублей`}
                className={
                  'mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-full text-[15.5px] font-semibold transition-transform active:scale-[0.98] disabled:active:scale-100 ' +
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
                ) : result ? (
                  `Крутить ещё · ${fmtMoney(regionMeta.rollPrice)}`
                ) : (
                  `Крутить · ${fmtMoney(regionMeta.rollPrice)}`
                )}
              </button>
            )}
          </div>
        </section>

        {/* Брони */}
        {n.reserves.length > 0 && (
          <section>
            <SectionTitle count={n.reserves.length}>Брони</SectionTitle>
            <div className="flex flex-col gap-2">
              {n.reserves.map((p) => (
                <ReserveCard key={p.id} p={p} busy={busy} balance={n.balance} onClaim={claim} onRelease={doRelease} />
              ))}
            </div>
          </section>
        )}

        {/* Мои номера: компактные строки, тап — сделать основным */}
        {n.owned.length > 0 && (
          <section>
            <SectionTitle count={n.owned.length}>Мои номера</SectionTitle>
            <div className={CARD + ' divide-y divide-[#17181A]/[0.05]'}>
              {n.owned.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => doSetMain(p)}
                    disabled={busy || p.isMain}
                    aria-label={p.isMain ? `Основной номер ${p.number}` : `Сделать ${p.number} основным`}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold tabular-nums">{p.number}</span>
                    {p.isMain ? (
                      <BadgeCheck className="size-[18px] shrink-0" aria-label="Основной" />
                    ) : (
                      <TierBadge tier={p.tier} variant="light" />
                    )}
                  </button>
                  {!p.isMain && <ReleaseX label={`Отпустить номер ${p.number}`} onRelease={() => doRelease(p)} />}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* История прокруток */}
        {n.history.length > 0 && (
          <section>
            <SectionTitle count={n.history.length}>История</SectionTitle>
            <div className={CARD + ' nice-scroll max-h-96 overflow-y-auto'}>
              {n.history.map((p) => (
                <div
                  key={p.id}
                  className={
                    'flex items-center gap-3 border-b border-[#17181A]/[0.05] px-4 py-3 last:border-b-0 ' +
                    (p.status === 'released' ? 'opacity-40' : '')
                  }
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tierMeta(p.tier).color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium tabular-nums">{p.number}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[#17181A]/35">
                    {new Date(p.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {n.loading && n.numbers.length === 0 && (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-[#17181A]/25" aria-hidden="true" />
          </div>
        )}
      </main>

      {/* Шторка выбора региона */}
      <RegionSheet
        open={sheetOpen}
        region={region}
        onPick={(id) => {
          sound.tap()
          setRegion(id)
          setSheetOpen(false)
        }}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  )
}
