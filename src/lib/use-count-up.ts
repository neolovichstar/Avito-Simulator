'use client'

import { useEffect, useRef, useState } from 'react'

// Плавная анимация числа (ease-out cubic): при изменении value интерполирует
// от предыдущего значения к новому. На первом рендере отдаёт value как есть.
export function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) return
    prevRef.current = value
    const start = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return display
}
