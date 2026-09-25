'use client'

// Калькулятор ОС: цепочка операций без eval (аккумулятор first/op/second),
// крупный дисплей с историей прошлой операции, тихий звук нажатий.

import { useState } from 'react'
import { sound } from '@/lib/sound'

type Op = '+' | '−' | '×' | '÷'

const APPLY: Record<Op, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '−': (a, b) => a - b,
  '×': (a, b) => a * b,
  '÷': (a, b) => (b === 0 ? Number.NaN : a / b),
}

// Форматирование результата: убираем «плавающий» шум и длинные хвосты
function fmt(n: number): string {
  if (!Number.isFinite(n)) return 'Ошибка'
  const rounded = Math.round(n * 1e10) / 1e10
  const s = String(rounded)
  if (s.length <= 12) return s
  return rounded.toExponential(5)
}

function toNum(display: string): number {
  const n = Number.parseFloat(display)
  return Number.isFinite(n) ? n : 0
}

const NUM_KEY = 'rounded-full h-16 text-[22px] font-medium bg-white/[0.06] text-white transition-transform active:scale-95'
const OP_KEY = 'rounded-full h-16 text-[22px] font-medium bg-white/[0.06] text-emerald-400 transition-transform active:scale-95'

export default function CalcApp() {
  const [display, setDisplay] = useState('0')
  const [prev, setPrev] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [history, setHistory] = useState('')

  const digit = (d: string) => {
    sound.tap()
    if (waiting) {
      setDisplay(d)
      setWaiting(false)
      return
    }
    if (display.replace(/[-.]/g, '').length >= 12) return
    setDisplay(display === '0' ? d : display + d)
  }

  const dot = () => {
    sound.tap()
    if (waiting) {
      setDisplay('0.')
      setWaiting(false)
      return
    }
    if (!display.includes('.')) setDisplay(display + '.')
  }

  const clearAll = () => {
    sound.tap()
    setDisplay('0')
    setPrev(null)
    setOp(null)
    setWaiting(false)
    setHistory('')
  }

  const negate = () => {
    sound.tap()
    if (display === '0' || display === 'Ошибка') return
    setDisplay(display.startsWith('-') ? display.slice(1) : '-' + display)
  }

  const percent = () => {
    sound.tap()
    setDisplay(fmt(toNum(display) / 100))
  }

  const operator = (next: Op) => {
    sound.tap()
    const cur = toNum(display)
    let left: string
    if (prev === null) {
      left = fmt(cur)
      setPrev(cur)
    } else if (op !== null && !waiting) {
      const result = APPLY[op](prev, cur)
      left = fmt(result)
      setPrev(result)
      setDisplay(fmt(result))
    } else {
      left = fmt(prev)
    }
    setOp(next)
    setWaiting(true)
    setHistory(`${left} ${next}`)
  }

  const equals = () => {
    sound.tap()
    const cur = toNum(display)
    if (prev === null || op === null) {
      setHistory(`${fmt(cur)} =`)
      setWaiting(true)
      return
    }
    const result = APPLY[op](prev, cur)
    setHistory(`${fmt(prev)} ${op} ${fmt(cur)} =`)
    setDisplay(fmt(result))
    setPrev(null)
    setOp(null)
    setWaiting(true)
  }

  return (
    <div className="flex h-full flex-col bg-[#050D09] text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 px-5">
        <h1 className="text-[17px] font-semibold">Калькулятор</h1>
      </header>

      {/* Дисплей: история сверху мелко, текущее значение крупно справа */}
      <div className="flex min-h-24 flex-1 flex-col items-end justify-end px-6 pb-3">
        <div className="h-5 max-w-full truncate text-[13px] tabular-nums text-white/40">{history}</div>
        <div className="mt-1 max-w-full truncate text-right text-[44px] font-light leading-none tabular-nums">
          {display}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-3 px-4 pb-5">
        <button type="button" onClick={clearAll} aria-label="Сбросить" className={OP_KEY + ' text-red-400'}>
          AC
        </button>
        <button type="button" onClick={negate} aria-label="Сменить знак" className={OP_KEY}>
          ±
        </button>
        <button type="button" onClick={percent} aria-label="Процент" className={OP_KEY}>
          %
        </button>
        <button type="button" onClick={() => operator('÷')} aria-label="Разделить" className={OP_KEY}>
          ÷
        </button>

        <button type="button" onClick={() => digit('7')} className={NUM_KEY}>7</button>
        <button type="button" onClick={() => digit('8')} className={NUM_KEY}>8</button>
        <button type="button" onClick={() => digit('9')} className={NUM_KEY}>9</button>
        <button type="button" onClick={() => operator('×')} aria-label="Умножить" className={OP_KEY}>×</button>

        <button type="button" onClick={() => digit('4')} className={NUM_KEY}>4</button>
        <button type="button" onClick={() => digit('5')} className={NUM_KEY}>5</button>
        <button type="button" onClick={() => digit('6')} className={NUM_KEY}>6</button>
        <button type="button" onClick={() => operator('−')} aria-label="Вычесть" className={OP_KEY}>−</button>

        <button type="button" onClick={() => digit('1')} className={NUM_KEY}>1</button>
        <button type="button" onClick={() => digit('2')} className={NUM_KEY}>2</button>
        <button type="button" onClick={() => digit('3')} className={NUM_KEY}>3</button>
        <button type="button" onClick={() => operator('+')} aria-label="Прибавить" className={OP_KEY}>+</button>

        <button type="button" onClick={() => digit('0')} aria-label="Ноль" className={NUM_KEY + ' col-span-2'}>0</button>
        <button type="button" onClick={dot} aria-label="Запятая" className={NUM_KEY}>.</button>
        <button
          type="button"
          onClick={equals}
          aria-label="Равно"
          className="rounded-full h-16 text-[22px] font-bold bg-[#22C55E] text-[#052E16] transition-transform active:scale-95"
        >
          =
        </button>
      </div>
    </div>
  )
}
