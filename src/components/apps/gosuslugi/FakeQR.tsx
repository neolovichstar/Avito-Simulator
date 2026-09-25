'use client'

import { useMemo } from 'react'

// FakeQR — детерминированный «QR-код» для виртуальных документов Госуслуг.
// Настоящее кодирование не используется: сетка модулей строится из хеша строки
// (FNV-1a + mulberry32), а поверх накладываются finder-паттерны и тайминг-линии
// как у настоящего QR — выглядит достоверно, библиотеки не нужны.

const N = 25 // модулей по стороне
const QUIET = 3 // тихая зона (модулей)

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function inFinderZone(r: number, c: number): boolean {
  return (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8)
}

function buildGrid(payload: string): boolean[][] {
  const rng = mulberry32(hashStr(payload))
  const g: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false))

  // данные
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (r === 6 || c === 6 || inFinderZone(r, c)) continue
      // выравнивающий паттерн в правом нижнем углу
      if (r >= N - 9 && r <= N - 5 && c >= N - 9 && c <= N - 5) continue
      g[r][c] = rng() < 0.46
    }
  }

  // finder-паттерны в трёх углах (7×7: кольцо + белое + тёмное ядро 3×3)
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        g[r0 + r][c0 + c] = edge || core
      }
    }
  }
  finder(0, 0)
  finder(0, N - 7)
  finder(N - 7, 0)

  // тайминг-линии (чередование), вне зон finder
  for (let i = 8; i < N - 8; i++) {
    g[6][i] = i % 2 === 0
    g[i][6] = i % 2 === 0
  }

  // выравнивающий паттерн 5×5 внизу справа
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const edge = r === 0 || r === 4 || c === 0 || c === 4
      g[N - 7 + r][N - 7 + c] = edge || (r === 2 && c === 2)
    }
  }

  return g
}

export default function FakeQR({
  payload,
  size = 148,
  className = '',
}: {
  payload: string
  size?: number
  className?: string
}) {
  const path = useMemo(() => {
    const grid = buildGrid(payload)
    let d = ''
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (grid[r][c]) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`
      }
    }
    return d
  }, [payload])

  const total = N + QUIET * 2
  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR-код документа"
      className={className}
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#17181A" />
    </svg>
  )
}
