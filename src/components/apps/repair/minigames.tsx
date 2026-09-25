'use client'

// Мини-игры мастерской (Task 28-c). Каждая — самодостаточный компонент
// на pointer-событиях (палец/мышь), без карточных обёрток, 20-40 секунд.
//  seam   — «отклей шов»: веди по линии шва, не сходя с трека
//  solder — «перепайка»: жми только подсвеченный контакт
//  bolt   — «гайка»: круговые движения пальцем до нужного числа оборотов
//  simon  — «диагностика»: повтори последовательность кодов
//  gauge  — «точная работа»: удерживай стрелку в зоне
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameKey } from '@/lib/parts'

export interface MiniGameProps {
  difficulty: 'easy' | 'normal' | 'hard'
  onFinish: (score: number) => void
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function buzz(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch { /* игнор */ }
}

function TimerBar({ endAt, total }: { endAt: number; total: number }) {
  const [frac, setFrac] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setFrac(clamp((endAt - Date.now()) / total, 0, 1)), 200)
    return () => clearInterval(id)
  }, [endAt, total])
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-[#17181A] transition-[width] duration-200" style={{ width: `${frac * 100}%` }} />
      </div>
      <span className="w-8 text-[11px] font-semibold tabular-nums text-[#9AA0A8]">{Math.ceil(frac * total)}с</span>
    </div>
  )
}

// ═══════════════════════════ SEAM: отклей шов ═══════════════════════════

const SEAM_PATH = 'M 78 392 C 236 382, 252 306, 162 274 C 72 242, 58 172, 150 142 C 242 112, 262 62, 184 40'

export function SeamGame({ difficulty, onFinish }: MiniGameProps) {
  const duration = 30
  const tolerance = difficulty === 'easy' ? 34 : difficulty === 'normal' ? 26 : 19
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pathRef = useRef<SVGPathElement | null>(null)
  const dotRef = useRef<SVGCircleElement | null>(null)
  const readyRef = useRef(false)
  const ptsRef = useRef<{ x: number; y: number }[]>([])
  const idxRef = useRef(0)
  const leaksRef = useRef(0)
  const lastLeakRef = useRef(0)
  const downRef = useRef(false)
  const [leaks, setLeaks] = useState(0)
  const [progress, setProgress] = useState(0)
  const [endAt, setEndAt] = useState<number | null>(null)
  const doneRef = useRef(false)
  const endAtRef = useRef(0)

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const total = path.getTotalLength()
    const N = 150
    ptsRef.current = Array.from({ length: N }, (_, i) => {
      const p = path.getPointAtLength((total * i) / (N - 1))
      return { x: p.x, y: p.y }
    })
    readyRef.current = true
  }, [])

  const finish = useCallback((score: number) => {
    if (doneRef.current) return
    doneRef.current = true
    buzz(score >= 60 ? 20 : [10, 40, 10])
    onFinish(Math.round(clamp(score, 0, 100)))
  }, [onFinish])

  useEffect(() => {
    const end = Date.now() + duration * 1000
    endAtRef.current = end
    setEndAt(end)
    const id = setTimeout(() => {
      // время вышло — оцениваем пройденную часть шва
      const p = idxRef.current / (ptsRef.current.length - 1 || 1)
      finish(p * 55)
    }, duration * 1000 + 120)
    return () => clearTimeout(id)
  }, [finish])

  const toSvg = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const r = svg.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 320, y: ((e.clientY - r.top) / r.height) * 420 }
  }

  const onDown = (e: React.PointerEvent) => {
    if (!readyRef.current || doneRef.current) return
    const pts = ptsRef.current
    const cur = pts[Math.min(idxRef.current, pts.length - 1)]
    const p = toSvg(e)
    const d = Math.hypot(p.x - cur.x, p.y - cur.y)
    if (d <= tolerance + 26) {
      downRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      if (dotRef.current) {
        dotRef.current.setAttribute('cx', String(p.x))
        dotRef.current.setAttribute('cy', String(p.y))
        dotRef.current.setAttribute('opacity', '1')
      }
    }
  }

  const onMove = (e: React.PointerEvent) => {
    if (!downRef.current || !readyRef.current || doneRef.current) return
    const pts = ptsRef.current
    const p = toSvg(e)
    if (dotRef.current) {
      dotRef.current.setAttribute('cx', String(p.x))
      dotRef.current.setAttribute('cy', String(p.y))
    }
    // ищем самую дальнюю точку шва в окне вперёд, до которой дотянулись
    let best = -1
    let bestD = Infinity
    const from = idxRef.current
    for (let i = from; i <= Math.min(from + 12, pts.length - 1); i++) {
      const d = Math.hypot(p.x - pts[i].x, p.y - pts[i].y)
      if (d <= tolerance && i >= from && (best === -1 || i > best)) { best = i; bestD = d }
      if (d < bestD) bestD = d
    }
    if (best >= 0) {
      idxRef.current = best
      setProgress(best / (pts.length - 1))
      if (best >= pts.length - 1) {
        const remainSec = Math.max(0, (endAtRef.current - Date.now()) / 1000)
        finish(100 - leaksRef.current * 12 + Math.min(14, remainSec * 0.8))
      }
    } else if (bestD > tolerance + 9) {
      const now = Date.now()
      if (now - lastLeakRef.current > 420) {
        lastLeakRef.current = now
        leaksRef.current += 1
        setLeaks(leaksRef.current)
        buzz(12)
      }
    }
  }

  const onUp = () => { downRef.current = false; if (dotRef.current) dotRef.current.setAttribute('opacity', '0') }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-2">
        <div className="text-[13px] font-medium text-[#5F6368]">Пройдено: <b className="text-[#17181A]">{Math.round(progress * 100)}%</b></div>
        <div className="text-[13px] font-medium text-[#5F6368]">Сходы: <b className={leaks ? 'text-[#D14343]' : 'text-[#17181A]'}>{leaks}</b></div>
        <TimerBar endAt={endAt ?? Date.now()} total={duration} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        <div className="relative aspect-[320/420] h-full max-h-[520px]">
          <svg
            ref={svgRef} viewBox="0 0 320 420" className="h-full w-full rounded-[28px] bg-[#17181A]"
            style={{ touchAction: 'none' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          >
            {/* корпус телефона */}
            <rect x="46" y="26" width="228" height="368" rx="34" fill="#22252B" stroke="#3A3E46" strokeWidth="2" />
            <rect x="58" y="38" width="204" height="344" rx="26" fill="#0B0D10" />
            <text x="160" y="120" textAnchor="middle" fill="#3A3E46" fontSize="15" fontWeight="600">дисплей</text>
            {/* трек шва */}
            <path ref={pathRef} d={SEAM_PATH} fill="none" stroke="#4A4F58" strokeWidth={tolerance * 2} strokeLinecap="round" opacity="0.55" />
            <path d={SEAM_PATH} fill="none" stroke="#FFD53D" strokeWidth="3" strokeDasharray="7 9" strokeLinecap="round" />
            {/* пройдено */}
            <path
              d={SEAM_PATH} pathLength={1} fill="none" stroke="#21A03A" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${progress} 1`}
            />
            {/* старт и финиш */}
            <circle cx="78" cy="392" r="9" fill="#21A03A" />
            <circle cx="184" cy="40" r="9" fill="#FFD53D" />
            <circle ref={dotRef} r="17" fill="none" stroke="#fff" strokeWidth="3.5" opacity="0" />
          </svg>
        </div>
      </div>
      <div className="px-5 pb-3 text-center text-[12px] text-[#9AA0A8]">Веди палец от зелёной точки к жёлтой, не сходя с линии</div>
    </div>
  )
}

// ═══════════════════════════ SOLDER: перепайка ═══════════════════════════

export function SolderGame({ difficulty, onFinish }: MiniGameProps) {
  const roundsTotal = 8
  const baseWindow = difficulty === 'easy' ? 2100 : difficulty === 'normal' ? 1600 : 1200
  const [active, setActive] = useState<number | null>(null)
  const [round, setRound] = useState(0)
  const [misses, setMisses] = useState(0)
  const [flash, setFlash] = useState<{ i: number; ok: boolean } | null>(null)
  const missRef = useRef(0)
  const roundRef = useRef(0)
  const doneRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const activeRef = useRef<number | null>(null)
  const scheduleRef = useRef<() => void>(() => {})

  const clearTimers = useCallback(() => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }, [])

  const finish = useCallback((missesCount: number) => {
    if (doneRef.current) return
    doneRef.current = true
    clearTimers()
    const score = clamp(100 - missesCount * 13, 8, 100)
    buzz(score >= 60 ? 20 : [10, 40, 10])
    onFinish(Math.round(score))
  }, [clearTimers, onFinish])

  const scheduleRound = useCallback(() => {
    if (doneRef.current) return
    const r = roundRef.current
    if (r >= roundsTotal) { finish(missRef.current); return }
    setRound(r)
    const pad = Math.floor(Math.random() * 9)
    activeRef.current = pad
    setActive(pad)
    const win = Math.max(750, baseWindow * Math.pow(0.94, r))
    timersRef.current.push(setTimeout(() => {
      // контакт остыл без пайки — промах
      if (doneRef.current) return
      activeRef.current = null
      setActive(null)
      missRef.current += 1
      setMisses(missRef.current)
      setFlash({ i: pad, ok: false })
      buzz(12)
      timersRef.current.push(setTimeout(() => { setFlash(null); roundRef.current += 1; scheduleRef.current() }, 330))
    }, win))
  }, [baseWindow, finish])

  useEffect(() => {
    scheduleRef.current = scheduleRound
  }, [scheduleRound])

  useEffect(() => {
    const t = setTimeout(scheduleRound, 500)
    timersRef.current.push(t)
    return clearTimers
  }, [scheduleRound, clearTimers])

  const tap = (i: number) => {
    if (doneRef.current || flash) return
    if (activeRef.current === i) {
      activeRef.current = null
      setActive(null)
      setFlash({ i, ok: true })
      buzz(8)
      clearTimers()
      timersRef.current.push(setTimeout(() => { setFlash(null); roundRef.current += 1; scheduleRound() }, 280))
    } else if (activeRef.current !== null) {
      missRef.current += 1
      setMisses(missRef.current)
      setFlash({ i, ok: false })
      buzz(14)
      timersRef.current.push(setTimeout(() => setFlash(null), 220))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-2">
        <div className="text-[13px] font-medium text-[#5F6368]">Контакт <b className="text-[#17181A]">{Math.min(round + 1, roundsTotal)}/{roundsTotal}</b></div>
        <div className="text-[13px] font-medium text-[#5F6368]">Промахи: <b className={misses ? 'text-[#D14343]' : 'text-[#17181A]'}>{misses}</b></div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
        <div
          className="grid w-full max-w-[340px] grid-cols-3 gap-3 rounded-[28px] bg-[#1E4D2B] p-5"
          style={{ touchAction: 'none' }}
        >
          {Array.from({ length: 9 }, (_, i) => {
            const lit = active === i
            const fl = flash?.i === i
            return (
              <button
                key={i} type="button" onPointerDown={() => tap(i)} aria-label={`Контакт ${i + 1}`}
                className="relative flex aspect-square items-center justify-center rounded-2xl transition-colors duration-100"
                style={{
                  background: fl ? (flash?.ok ? '#21A03A' : '#D14343') : lit ? '#FFD53D' : '#153820',
                  boxShadow: lit ? '0 0 0 5px rgba(255,213,61,0.35), inset 0 -3px 0 rgba(0,0,0,0.25)' : 'inset 0 -3px 0 rgba(0,0,0,0.35)',
                }}
              >
                <span className="block h-3.5 w-3.5 rounded-full" style={{ background: lit || fl ? 'rgba(255,255,255,0.85)' : '#0E2A17' }} />
              </button>
            )
          })}
        </div>
      </div>
      <div className="px-5 pb-3 text-center text-[12px] text-[#9AA0A8]">Жёлтый контакт — паяй. Остальные не трогай</div>
    </div>
  )
}

// ═══════════════════════════ BOLT: гайка ═══════════════════════════

export function BoltGame({ difficulty, onFinish }: MiniGameProps) {
  const turns = difficulty === 'easy' ? 4 : difficulty === 'normal' ? 5.5 : 7
  const required = turns * 360
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const boltRef = useRef<SVGSVGElement | null>(null)
  const downRef = useRef(false)
  const prevRef = useRef(0)
  const accRef = useRef(0)
  const doneRef = useRef(false)
  const [pct, setPct] = useState(0)
  const [endAt, setEndAt] = useState<number | null>(null)

  const finish = useCallback((score: number) => {
    if (doneRef.current) return
    doneRef.current = true
    buzz(score >= 60 ? 20 : [10, 40, 10])
    onFinish(Math.round(clamp(score, 0, 100)))
  }, [onFinish])

  useEffect(() => {
    setEndAt(Date.now() + 28_000)
    const id = setTimeout(() => finish((accRef.current / required) * 100), 28_000 + 120)
    return () => clearTimeout(id)
  }, [finish, required])

  const angleOf = (e: React.PointerEvent): number => {
    const el = wrapRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * (180 / Math.PI)
  }

  const onDown = (e: React.PointerEvent) => {
    if (doneRef.current) return
    downRef.current = true
    prevRef.current = angleOf(e)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onMove = (e: React.PointerEvent) => {
    if (!downRef.current || doneRef.current) return
    const a = angleOf(e)
    let d = a - prevRef.current
    if (d > 180) d -= 360
    if (d < -180) d += 360
    prevRef.current = a
    accRef.current += d
    const p = clamp(Math.abs(accRef.current) / required, 0, 1)
    setPct(p)
    if (boltRef.current) boltRef.current.style.transform = `rotate(${accRef.current}deg)`
    if (p >= 1) finish(100)
  }

  const onUp = () => { downRef.current = false }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-2">
        <div className="text-[13px] font-medium text-[#5F6368]">Затянуто: <b className="text-[#17181A]">{Math.round(pct * 100)}%</b></div>
        <TimerBar endAt={endAt ?? Date.now()} total={28} />
      </div>
      <div
        ref={wrapRef}
        className="flex min-h-0 flex-1 items-center justify-center"
        style={{ touchAction: 'none' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      >
        <div className="relative flex aspect-square h-full max-h-[400px] items-center justify-center">
          <svg ref={boltRef} viewBox="0 0 200 200" className="h-full w-full" style={{ transition: 'transform 40ms linear' }}>
            <circle cx="100" cy="100" r="92" fill="none" stroke="#E8EAED" strokeWidth="10" />
            <circle cx="100" cy="100" r="92" fill="none" stroke="#17181A" strokeWidth="10"
              strokeDasharray={`${pct * 578} 578`} strokeLinecap="round" transform="rotate(-90 100 100)" />
            {/* гайка */}
            <polygon points="100,34 158,67 158,133 100,166 42,133 42,67" fill="#FFD53D" stroke="#C9A400" strokeWidth="4" />
            <polygon points="100,58 138,79 138,121 100,142 62,121 62,79" fill="#F0BF18" />
            <circle cx="100" cy="100" r="24" fill="#17181A" />
            <text x="100" y="106" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">{Math.round(pct * turns * 10) / 10} об</text>
          </svg>
        </div>
      </div>
      <div className="px-5 pb-3 text-center text-[12px] text-[#9AA0A8]">Крути палец по кругу вокруг гайки, пока не затянется</div>
    </div>
  )
}

// ═══════════════════════════ SIMON: диагностика ═══════════════════════════

const SIMON_COLORS = ['#FFD53D', '#21A03A', '#E8702A', '#17181A']

export function SimonGame({ difficulty, onFinish }: MiniGameProps) {
  // useMemo обязателен: lengths — зависимость эффекта раунда, новый массив
  // при каждом рендере перезапускал бы последовательность бесконечно
  const lengths = useMemo(
    () => (difficulty === 'easy' ? [3, 4, 5] : difficulty === 'normal' ? [3, 4, 5, 6] : [4, 5, 6, 7]),
    [difficulty],
  )
  const speed = difficulty === 'hard' ? 300 : 420
  const totalPads = lengths.reduce((s, l) => s + l, 0)
  const [roundIdx, setRoundIdx] = useState(0)
  const [lit, setLit] = useState<number | null>(null)
  const [phase, setPhase] = useState<'show' | 'input' | 'wait'>('show')
  const seqRef = useRef<number[]>([])
  const posRef = useRef(0)
  const correctRef = useRef(0)
  const doneRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const finish = useCallback((score: number) => {
    if (doneRef.current) return
    doneRef.current = true
    timersRef.current.forEach(clearTimeout)
    buzz(score >= 60 ? 20 : [10, 40, 10])
    onFinish(Math.round(clamp(score, 0, 100)))
  }, [onFinish])

  useEffect(() => {
    let cancelled = false
    const runShow = (seq: number[], i: number) => {
      if (cancelled || doneRef.current) return
      if (i >= seq.length) {
        timersRef.current.push(setTimeout(() => { if (!cancelled) { posRef.current = 0; setPhase('input') } }, 220))
        return
      }
      setLit(seq[i])
      timersRef.current.push(setTimeout(() => {
        if (cancelled) return
        setLit(null)
        timersRef.current.push(setTimeout(() => runShow(seq, i + 1), 140))
      }, speed))
    }
    // новый раунд: фаза и подсветки — внутри таймера (без setState в теле эффекта)
    const seq = Array.from({ length: lengths[roundIdx] }, () => Math.floor(Math.random() * 4))
    seqRef.current = seq
    const t = setTimeout(() => {
      if (cancelled || doneRef.current) return
      setPhase('show')
      runShow(seq, 0)
    }, 420)
    timersRef.current.push(t)
    return () => { cancelled = true; timersRef.current.forEach(clearTimeout); timersRef.current = [] }
  }, [roundIdx, lengths, speed])

  const tap = (i: number) => {
    if (doneRef.current || phase !== 'input') return
    const seq = seqRef.current
    if (seq[posRef.current] === i) {
      correctRef.current += 1
      posRef.current += 1
      setLit(i)
      setTimeout(() => setLit(null), 130)
      buzz(8)
      if (posRef.current >= seq.length) {
        // раунд пройден
        if (roundIdx >= lengths.length - 1) { finish(100); return }
        setPhase('wait')
        timersRef.current.push(setTimeout(() => setRoundIdx((r) => r + 1), 550))
        return
      }
    } else {
      // ошибка — конец диагностики
      finish((correctRef.current / totalPads) * 90)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-2">
        <div className="text-[13px] font-medium text-[#5F6368]">Тест <b className="text-[#17181A]">{Math.min(roundIdx + 1, lengths.length)}/{lengths.length}</b></div>
        <div className={'text-[13px] font-semibold ' + (phase === 'show' ? 'text-[#E8702A]' : phase === 'input' ? 'text-[#21A03A]' : 'text-[#9AA0A8]')}>
          {phase === 'show' ? 'Смотри' : phase === 'input' ? 'Повтори' : '…'}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-4" style={{ touchAction: 'none' }}>
        <div className="grid w-full max-w-[330px] grid-cols-2 gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i} type="button" aria-label={`Код ${i + 1}`} onPointerDown={() => tap(i)}
              className="aspect-square rounded-[24px] transition-all duration-100"
              style={{
                background: lit === i ? SIMON_COLORS[i] : '#F0F1F5',
                opacity: lit === i ? 1 : 0.92,
                transform: lit === i ? 'scale(1.04)' : 'scale(1)',
                boxShadow: lit === i ? `0 0 0 6px ${SIMON_COLORS[i]}33` : 'none',
              }}
            />
          ))}
        </div>
      </div>
      <div className="px-5 pb-3 text-center text-[12px] text-[#9AA0A8]">Плата мигает кодами — повтори их по памяти</div>
    </div>
  )
}

// ═══════════════════════════ GAUGE: удержи стрелку ═══════════════════════════

export function GaugeGame({ difficulty, onFinish }: MiniGameProps) {
  const duration = 20
  const zoneHalf = difficulty === 'easy' ? 0.17 : difficulty === 'normal' ? 0.13 : 0.09
  const needleRef = useRef<HTMLDivElement | null>(null)
  const zoneRef = useRef<HTMLDivElement | null>(null)
  const holdRef = useRef(false)
  const doneRef = useRef(false)
  const [endAt, setEndAt] = useState<number | null>(null)

  const finish = useCallback((score: number) => {
    if (doneRef.current) return
    doneRef.current = true
    buzz(score >= 60 ? 20 : [10, 40, 10])
    onFinish(Math.round(clamp(score, 0, 100)))
  }, [onFinish])

  useEffect(() => {
    setEndAt(Date.now() + duration * 1000)
    // физика стрелки: y 0..1 (0 — верх), держим — толкаем вверх, отпустили — падает
    let y = 0.7
    let v = 0
    let zc = 0.45
    let zv = 0.12
    let gust = 0
    let gustTimer = 0
    let zoneTimer = 0
    let last = performance.now()
    let inZone = 0
    let elapsed = 0
    let raf = 0
    const gustPower = difficulty === 'hard' ? 0.5 : difficulty === 'normal' ? 0.36 : 0.26
    const step = (t: number) => {
      if (doneRef.current) return
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      elapsed += dt
      // случайные толчки
      gustTimer -= dt
      if (gustTimer <= 0) { gustTimer = 0.35 + Math.random() * 0.5; gust = (Math.random() * 2 - 1) * gustPower }
      // зона дрейфует
      zoneTimer -= dt
      if (zoneTimer <= 0) { zoneTimer = 0.7 + Math.random() * 0.9; zv = (Math.random() * 2 - 1) * 0.16 }
      zc += zv * dt
      if (zc < 0.18) { zc = 0.18; zv = Math.abs(zv) }
      if (zc > 0.82) { zc = 0.82; zv = -Math.abs(zv) }
      // физика стрелки
      const acc = (holdRef.current ? -1.05 : 0.5) + gust
      v = v * Math.pow(0.86, dt * 10) + acc * dt
      y += v * dt
      if (y < 0.02) { y = 0.02; v = Math.abs(v) * 0.25 }
      if (y > 0.98) { y = 0.98; v = -Math.abs(v) * 0.25 }
      const ok = Math.abs(y - zc) <= zoneHalf
      if (ok) inZone += dt
      // рендер через refs — 60fps без setState
      if (needleRef.current) needleRef.current.style.top = `${y * 100}%`
      if (zoneRef.current) {
        zoneRef.current.style.top = `${Math.max(0, (zc - zoneHalf) * 100)}%`
        zoneRef.current.style.height = `${zoneHalf * 200}%`
      }
      if (elapsed >= duration) { finish((inZone / duration) * 100); return }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [difficulty, duration, finish, zoneHalf])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-2">
        <div className="text-[13px] font-medium text-[#5F6368]">Результат покажем в конце</div>
        <TimerBar endAt={endAt ?? Date.now()} total={duration} />
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-8 py-4"
        onPointerDown={(e) => { holdRef.current = true; e.currentTarget.setPointerCapture(e.pointerId) }}
        onPointerUp={() => { holdRef.current = false }}
        onPointerCancel={() => { holdRef.current = false }}
        style={{ touchAction: 'none', userSelect: 'none' }}
      >
        <div className="relative h-full max-h-[440px] w-24 overflow-hidden rounded-full bg-[#F0F1F5] ring-1 ring-black/5">
          <div ref={zoneRef} className="absolute left-0 right-0 bg-[#21A03A]/25" style={{ top: '40%', height: '20%' }}>
            <div className="absolute left-0 right-0 top-0 h-0.5 bg-[#21A03A]" />
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#21A03A]" />
          </div>
          <div ref={needleRef} className="absolute left-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#17181A] shadow-md" style={{ top: '70%' }}>
            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </div>
        </div>
      </div>
      <div className="px-5 pb-3 text-center text-[12px] text-[#9AA0A8]">Держи палец на экране — стрелка поднимется. Удержи её в зелёной зоне</div>
    </div>
  )
}

// ═══════════════════════════ Диспетчер ═══════════════════════════

export function MiniGame({ game, difficulty, onFinish }: { game: GameKey } & MiniGameProps) {
  switch (game) {
    case 'seam': return <SeamGame difficulty={difficulty} onFinish={onFinish} />
    case 'solder': return <SolderGame difficulty={difficulty} onFinish={onFinish} />
    case 'bolt': return <BoltGame difficulty={difficulty} onFinish={onFinish} />
    case 'simon': return <SimonGame difficulty={difficulty} onFinish={onFinish} />
    default: return <GaugeGame difficulty={difficulty} onFinish={onFinish} />
  }
}

// Подсказка «Как играть»: одна строка + SVG-схема
export function GameDiagram({ game }: { game: GameKey }) {
  if (game === 'seam') {
    return (
      <svg viewBox="0 0 200 130" className="h-32 w-full">
        <rect x="10" y="15" width="180" height="100" rx="20" fill="#17181A" />
        <path d="M 40 105 C 90 100, 110 70, 80 60 C 50 50, 45 35, 90 25" fill="none" stroke="#4A4F58" strokeWidth="14" strokeLinecap="round" />
        <path d="M 40 105 C 90 100, 110 70, 80 60 C 50 50, 45 35, 90 25" fill="none" stroke="#FFD53D" strokeWidth="3" strokeDasharray="5 6" />
        <circle cx="40" cy="105" r="7" fill="#21A03A" />
        <circle cx="86" cy="28" r="10" fill="none" stroke="#fff" strokeWidth="3" />
        <path d="M 130 60 l 24 -18 m 0 0 l -6 2 m 6 -2 l -2 6" stroke="#21A03A" strokeWidth="3" fill="none" strokeLinecap="round" />
        <text x="128" y="82" fill="#9AA0A8" fontSize="11">веди по шву</text>
      </svg>
    )
  }
  if (game === 'solder') {
    return (
      <svg viewBox="0 0 200 130" className="h-32 w-full">
        <rect x="30" y="10" width="140" height="110" rx="14" fill="#1E4D2B" />
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={45 + c * 40} y={22 + r * 32} width="26" height="26" rx="7"
            fill={r === 1 && c === 2 ? '#FFD53D' : '#153820'} />
        )))}
        <text x="100" y="126" fill="#9AA0A8" fontSize="11" textAnchor="middle">жми только жёлтый</text>
      </svg>
    )
  }
  if (game === 'bolt') {
    return (
      <svg viewBox="0 0 200 130" className="h-32 w-full">
        <circle cx="100" cy="65" r="48" fill="none" stroke="#E8EAED" strokeWidth="6" strokeDasharray="4 7" />
        <polygon points="100,25 133,45 133,85 100,105 67,85 67,45" fill="#FFD53D" stroke="#C9A400" strokeWidth="3" />
        <path d="M 152 20 a 55 55 0 1 1 -40 -14" stroke="#17181A" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M 112 6 l -8 8 l 10 4 z" fill="#17181A" />
        <text x="100" y="124" fill="#9AA0A8" fontSize="11" textAnchor="middle">крути по кругу</text>
      </svg>
    )
  }
  if (game === 'simon') {
    return (
      <svg viewBox="0 0 200 130" className="h-32 w-full">
        <rect x="45" y="10" width="50" height="50" rx="12" fill="#FFD53D" />
        <rect x="105" y="10" width="50" height="50" rx="12" fill="#F0F1F5" />
        <rect x="45" y="70" width="50" height="50" rx="12" fill="#F0F1F5" />
        <rect x="105" y="70" width="50" height="50" rx="12" fill="#21A03A" />
        <text x="100" y="126" fill="#9AA0A8" fontSize="11" textAnchor="middle">смотри и повтори</text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 130" className="h-32 w-full">
      <rect x="80" y="10" width="40" height="110" rx="20" fill="#F0F1F5" />
      <rect x="80" y="40" width="40" height="34" fill="#21A03A" opacity="0.3" />
      <line x1="78" y1="40" x2="122" y2="40" stroke="#21A03A" strokeWidth="2" />
      <line x1="78" y1="74" x2="122" y2="74" stroke="#21A03A" strokeWidth="2" />
      <circle cx="100" cy="60" r="12" fill="#17181A" />
      <path d="M 140 60 h 34 m 0 0 l -8 -6 m 8 6 l -8 6" stroke="#17181A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <text x="100" y="126" fill="#9AA0A8" fontSize="11" textAnchor="middle">держи в зоне — палец на экране</text>
    </svg>
  )
}
