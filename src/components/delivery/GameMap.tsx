'use client'

// 2D ИГРОВАЯ КАРТА «Доставки»: чистый SVG в стилистике настольной игры /
// милого города. Пастельные кварталы (с детерминированной рандомизацией),
// белые дороги с обводкой, река, парк с деревьями, домики с крышами.
// Маршрут курьера: зелёная ломаная по дорогам, машинка (вид сверху) ездит
// туда-обратно. Анимация: rAF-интерполяция точек маршрута (CSS offset-path
// в части WebView Telegram работает нестабильно, поэтому надёжнее JS).
// Карта декоративная: позиция машинки не привязана к реальному миру.

import { useEffect, useId, useRef } from 'react'

const W = 360
const H = 320
const GREEN = '#12894B'

// Сетка дорог
const ROADS_H = [58, 140, 222, 292]
const ROADS_V = [46, 132, 218, 314]

const BLOCK_COLORS = ['#E8EBE0', '#DDE8D8', '#EFE9DC', '#E4E9DE']
const ROOFS = ['#E3B7A0', '#B7C9E2', '#D9C79E']

// Маршрут по дорогам: склад (юго-запад) -> адрес (северо-восток)
const ROUTE: Array<[number, number]> = [
  [46, 292],
  [132, 292],
  [132, 222],
  [218, 222],
  [218, 140],
  [314, 140],
  [314, 58],
]

const ROUTE_D = 'M ' + ROUTE.map(([x, y]) => `${x} ${y}`).join(' L ')

// Река: мягкая голубая лента через карту (дороги рисуются поверх = мосты)
const RIVER_D = 'M -14 116 C 40 132, 76 188, 128 198 S 222 240, 270 222 S 344 170, 374 178'

// Детерминированный PRNG: «случайная» застройка одинакова при каждом рендере
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- статичная планировка города (считается один раз) ----------
const XS = [0, ...ROADS_V, W]
const YS = [0, ...ROADS_H, H]

type Block = { x: number; y: number; w: number; h: number; fill: string; r: number }

function buildCity() {
  const rng = mulberry32(20240517)
  const blocks: Block[] = []
  for (let j = 0; j < YS.length - 1; j++) {
    for (let i = 0; i < XS.length - 1; i++) {
      const x = XS[i]
      const y = YS[j]
      const w = XS[i + 1] - x
      const h = YS[j + 1] - y
      if (w < 30 || h < 30) continue // узкие кромки не застраиваем
      blocks.push({
        x: x + 7,
        y: y + 7,
        w: w - 14,
        h: h - 14,
        fill: BLOCK_COLORS[Math.floor(rng() * BLOCK_COLORS.length)],
        r: 9 + rng() * 5,
      })
    }
  }
  const park = blocks[6] // квартал парка в центре слева
  const trees = Array.from({ length: 7 }, () => ({
    cx: park.x + 9 + rng() * (park.w - 18),
    cy: park.y + 9 + rng() * (park.h - 18),
    r: 3.5 + rng() * 3,
  }))
  const bushes = [2, 9, 14, 18]
    .filter((i) => blocks[i] && blocks[i] !== park)
    .map((i) => ({
      cx: blocks[i].x + 9 + rng() * (blocks[i].w - 18),
      cy: blocks[i].y + 9 + rng() * (blocks[i].h - 18),
      r: 2.5 + rng() * 2,
    }))
  const houses = [1, 8, 12, 16, 3]
    .filter((i) => blocks[i] && blocks[i] !== park)
    .map((i) => ({
      x: blocks[i].x + 13 + rng() * Math.max(4, blocks[i].w - 26),
      y: blocks[i].y + 14 + rng() * Math.max(4, blocks[i].h - 26),
      roof: ROOFS[Math.floor(rng() * ROOFS.length)],
      rot: Math.round((rng() - 0.5) * 12),
    }))
  return { blocks, park, trees, bushes, houses }
}

const CITY = buildCity()

// ---------- геометрия маршрута для анимации ----------
const SEGMENTS = ROUTE.slice(0, -1).map(([x, y], i) => {
  const [nx, ny] = ROUTE[i + 1]
  return { x, y, dx: nx - x, dy: ny - y, len: Math.hypot(nx - x, ny - y) }
})
const ROUTE_LEN = SEGMENTS.reduce((s, seg) => s + seg.len, 0)

function pointAt(dist: number): { x: number; y: number; angle: number } {
  const d = Math.max(0, Math.min(ROUTE_LEN, dist))
  let acc = 0
  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg = SEGMENTS[i]
    if (d <= acc + seg.len || i === SEGMENTS.length - 1) {
      const t = seg.len === 0 ? 0 : (d - acc) / seg.len
      return {
        x: seg.x + seg.dx * t,
        y: seg.y + seg.dy * t,
        angle: (Math.atan2(seg.dy, seg.dx) * 180) / Math.PI,
      }
    }
    acc += seg.len
  }
  const last = ROUTE[ROUTE.length - 1]
  return { x: last[0], y: last[1], angle: 0 }
}

export interface GameMapProps {
  /** ETA курьера в минутах для пузыря (если есть реальные данные посылки) */
  etaMin?: number
  className?: string
}

export default function GameMap({ etaMin = 15, className }: GameMapProps) {
  const uid = useId()
  const carRef = useRef<SVGGElement | null>(null)
  const bubbleRef = useRef<SVGGElement | null>(null)

  useEffect(() => {
    const car = carRef.current
    const bubble = bubbleRef.current
    if (!car || !bubble) return

    const place = (dist: number, flip: boolean) => {
      const p = pointAt(dist)
      const angle = flip ? p.angle + 180 : p.angle
      car.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)})`)
      const bx = Math.max(96, Math.min(264, p.x))
      bubble.setAttribute('transform', `translate(${bx.toFixed(1)} ${(p.y - 14).toFixed(1)})`)
    }

    // уважаем reduced-motion: машинка стоит на маршруте, без анимации
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      place(ROUTE_LEN * 0.62, false)
      return
    }

    const ONE_WAY_MS = 24000
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const phase = ((now - t0) % (ONE_WAY_MS * 2)) / ONE_WAY_MS // 0..2: туда / обратно
      const forward = phase <= 1
      place((forward ? phase : 2 - phase) * ROUTE_LEN, !forward)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  const start = pointAt(0)
  const finish = pointAt(ROUTE_LEN)
  const mid = pointAt(ROUTE_LEN * 0.45)
  const midBubbleX = Math.max(96, Math.min(264, mid.x))
  const eta = Math.max(1, Math.round(etaMin))

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="block h-full w-full"
        role="img"
        aria-label="Игровая карта города с маршрутом курьера"
      >
        <defs>
          <filter id={`${uid}sh`} x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1F2937" floodOpacity="0.14" />
          </filter>
        </defs>

        {/* газоны-фон и кварталы */}
        <rect width={W} height={H} fill="#F0F2E7" />
        {CITY.blocks.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={b.r}
            fill={b === CITY.park ? '#DFEDD9' : b.fill}
          />
        ))}

        {/* река */}
        <path d={RIVER_D} fill="none" stroke="#BFDDEB" strokeWidth="27" strokeLinecap="round" />
        <path d={RIVER_D} fill="none" stroke="#CFE6F2" strokeWidth="21" strokeLinecap="round" />

        {/* парк: деревья + кусты по городу */}
        {CITY.trees.map((t, i) => (
          <circle key={i} cx={t.cx} cy={t.cy} r={t.r} fill="#BFE3C0" stroke="#A5D2A7" strokeWidth="1" />
        ))}
        {CITY.bushes.map((t, i) => (
          <circle key={i} cx={t.cx} cy={t.cy} r={t.r} fill="#D8E8CE" />
        ))}

        {/* дороги: обводка #E3E6DA -> белое полотно -> разметка */}
        <g strokeLinecap="round">
          {ROADS_H.map((y) => (
            <line key={`hc${y}`} x1={-8} x2={W + 8} y1={y} y2={y} stroke="#E3E6DA" strokeWidth="12.5" />
          ))}
          {ROADS_V.map((x) => (
            <line key={`vc${x}`} y1={-8} y2={H + 8} x1={x} x2={x} stroke="#E3E6DA" strokeWidth="12.5" />
          ))}
          {ROADS_H.map((y) => (
            <line key={`h${y}`} x1={-8} x2={W + 8} y1={y} y2={y} stroke="#FFFFFF" strokeWidth="9.5" />
          ))}
          {ROADS_V.map((x) => (
            <line key={`v${x}`} y1={-8} y2={H + 8} x1={x} x2={x} stroke="#FFFFFF" strokeWidth="9.5" />
          ))}
          {ROADS_H.map((y) => (
            <line key={`hd${y}`} x1={-8} x2={W + 8} y1={y} y2={y} stroke="#DADDCB" strokeWidth="1.3" strokeDasharray="7 9" />
          ))}
          {ROADS_V.map((x) => (
            <line key={`vd${x}`} y1={-8} y2={H + 8} x1={x} x2={x} stroke="#DADDCB" strokeWidth="1.3" strokeDasharray="7 9" />
          ))}
        </g>

        {/* домики с крышами-треугольниками */}
        {CITY.houses.map((h, i) => (
          <g key={i} transform={`translate(${h.x.toFixed(1)} ${h.y.toFixed(1)}) rotate(${h.rot})`}>
            <rect x="-8" y="-2" width="16" height="11" rx="1.5" fill="#FFFFFF" stroke="#D8DCCB" strokeWidth="1" />
            <rect x="-1.8" y="3.2" width="3.6" height="5.8" rx="0.6" fill="#C9CEC0" />
            <path d="M -10 -2 L 0 -10.5 L 10 -2 Z" fill={h.roof} stroke="#00000014" strokeWidth="0.5" />
          </g>
        ))}

        {/* маршрут курьера: белая подложка + зелёная линия */}
        <path d={ROUTE_D} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
        <path d={ROUTE_D} fill="none" stroke={GREEN} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* склад-старт: маленький домик-депо с полосатым навесом */}
        <g transform={`translate(${start.x} ${start.y})`}>
          <rect x="-9.5" y="-6" width="19" height="13" rx="2.5" fill="#FFFFFF" stroke="#D8DCCB" strokeWidth="1.2" />
          <rect x="-7.2" y="-6" width="3" height="4.6" fill="#C9CEC0" />
          <rect x="-1.5" y="-6" width="3" height="4.6" fill="#C9CEC0" />
          <rect x="4.2" y="-6" width="3" height="4.6" fill="#C9CEC0" />
          <rect x="-2" y="1.4" width="4" height="5.6" rx="0.8" fill="#9CA3AF" />
        </g>

        {/* финиш: зелёный маркер с домиком */}
        <g filter={`url(#${uid}sh)`}>
          <circle cx={finish.x} cy={finish.y} r="17" fill="none" stroke={GREEN} strokeOpacity="0.18" strokeWidth="4" />
          <circle cx={finish.x} cy={finish.y} r="13" fill={GREEN} stroke="#FFFFFF" strokeWidth="2.5" />
          <g
            transform={`translate(${finish.x - 9} ${finish.y - 9}) scale(0.75)`}
            stroke="#FFFFFF"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </g>
        </g>

        {/* пузырь ETA над машинкой */}
        <g ref={bubbleRef} transform={`translate(${midBubbleX.toFixed(1)} ${(mid.y - 14).toFixed(1)})`} filter={`url(#${uid}sh)`}>
          <rect x="-93" y="-46" width="186" height="32" rx="11" fill="#FFFFFF" stroke="#141414" strokeOpacity="0.06" />
          <polygon points="-7,-14 7,-14 0,0" fill="#FFFFFF" />
          <text y="-24" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#141414">
            Курьер приедет через{' '}
            <tspan fontWeight="700" fill={GREEN}>
              {eta} мин
            </tspan>
          </text>
        </g>

        {/* машинка курьера (вид сверху) */}
        <g ref={carRef} transform={`translate(${mid.x.toFixed(1)} ${mid.y.toFixed(1)}) rotate(${mid.angle.toFixed(1)})`}>
          <ellipse cy="4.5" rx="13" ry="6.5" fill="rgba(20,20,20,0.10)" />
          <rect x="-12" y="-7" width="24" height="14" rx="4.5" fill="#FFFFFF" stroke="#C6CBC0" strokeWidth="1.4" />
          <rect x="5.5" y="-5" width="3.2" height="10" rx="1.4" fill="#A9CBE3" />
          <rect x="-3.5" y="-5.2" width="8.5" height="10.4" rx="2" fill="#E7EADF" stroke="#D4D8CC" strokeWidth="0.8" />
          <rect x="-11.5" y="-4.6" width="2.2" height="9.2" rx="1" fill="#A9CBE3" opacity="0.75" />
          <circle cx="11.6" cy="-3.6" r="1.05" fill="#F2C94C" />
          <circle cx="11.6" cy="3.6" r="1.05" fill="#F2C94C" />
        </g>
      </svg>
    </div>
  )
}
