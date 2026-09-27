'use client'

// Окно приложения в стиле Windows 11: заголовок с перетаскиванием,
// кнопки свернуть/развернуть/закрыть, ресайз за правый-нижний угол.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'
import type { AppKey } from '@/lib/store'
import { APP_TILE, AppTileImage } from '@/components/os/app-logos'

export interface WindowState {
  id: AppKey
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
  maximized: boolean
}

interface Props {
  win: WindowState
  focused: boolean
  onFocus: () => void
  onClose: () => void
  onMinimize: () => void
  onToggleMax: () => void
  onChange: (patch: Partial<WindowState>) => void
  children: React.ReactNode
}

export default function WindowFrame({ win, focused, onFocus, onClose, onMinimize, onToggleMax, onChange, children }: Props) {
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const resize = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Геометрия применяется напрямую через DOM: в dev-режиме React может
  // не перезаписывать style-атрибут при изменении props — а окно должно двигаться чётко.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    el.style.left = win.maximized ? '0px' : `${win.x}px`
    el.style.top = win.maximized ? '0px' : `${win.y}px`
    el.style.width = win.maximized ? '100%' : `${win.w}px`
    el.style.height = win.maximized ? '100%' : `${win.h}px`
    el.style.zIndex = String(win.z)
  }, [win.x, win.y, win.w, win.h, win.z, win.maximized])

  const onTitlePointerDown = useCallback((e: React.PointerEvent) => {
    if (win.maximized) return
    onFocus()
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y }
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [win.x, win.y, win.maximized, onFocus])

  const onTitlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return
    const nx = Math.min(Math.max(e.clientX - drag.current.dx, -win.w + 160), window.innerWidth - 120)
    const ny = Math.min(Math.max(e.clientY - drag.current.dy, 8), window.innerHeight - 96)
    onChange({ x: nx, y: ny })
  }, [win.w, onChange])

  const endDrag = useCallback(() => {
    drag.current = null
    setDragging(false)
  }, [])

  const onResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    onFocus()
    resize.current = { startX: e.clientX, startY: e.clientY, startW: win.w, startH: win.h }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [win.w, win.h, onFocus])

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resize.current) return
    const r = resize.current
    onChange({
      w: Math.max(560, Math.min(r.startW + (e.clientX - r.startX), window.innerWidth - 40)),
      h: Math.max(420, Math.min(r.startH + (e.clientY - r.startY), window.innerHeight - 100)),
    })
  }, [onChange])

  const endResize = useCallback(() => { resize.current = null }, [])

  if (win.minimized) return null
  const tile = APP_TILE[win.id]

  return (
    <div
      ref={rootRef}
      className={`absolute flex flex-col overflow-hidden rounded-xl border shadow-2xl ${
        win.maximized ? 'rounded-none border-transparent' : ''
      } ${focused ? 'border-white/20 shadow-black/60' : 'border-white/10 shadow-black/40'}`}
      style={{
        background: '#0c0d12',
      }}
      onPointerDown={onFocus}
      role="dialog"
      aria-label={`Окно: ${tile.label}`}
    >
      {/* заголовок */}
      <div
        className={`flex h-8 shrink-0 select-none items-center gap-2 border-b border-white/10 pl-3 pr-1 ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${win.maximized ? '' : 'touch-none'}`}
        style={{ background: 'linear-gradient(180deg,#1a1c24,#141519)' }}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onToggleMax}
      >
        <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] ring-1 ring-black/20">
          <AppTileImage app={win.id} className="h-full w-full" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/85">{tile.label}</span>
        <div className="flex items-center" onPointerDown={(e) => e.stopPropagation()}>
          <button
            aria-label="Свернуть"
            onClick={onMinimize}
            className="flex h-8 w-10 items-center justify-center text-white/70 transition hover:bg-white/10"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            aria-label={win.maximized ? 'Восстановить' : 'Развернуть'}
            onClick={onToggleMax}
            className="flex h-8 w-10 items-center justify-center text-white/70 transition hover:bg-white/10"
          >
            {win.maximized ? <Copy className="size-3 -scale-x-100" /> : <Square className="size-3" />}
          </button>
          <button
            aria-label="Закрыть"
            onClick={onClose}
            className="flex h-8 w-10 items-center justify-center text-white/70 transition hover:bg-[#c42b1c] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* контент приложения */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {children}
      </div>

      {/* ресайз уголком */}
      {!win.maximized && (
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 z-10 size-4 cursor-nwse-resize touch-none"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      )}
    </div>
  )
}
