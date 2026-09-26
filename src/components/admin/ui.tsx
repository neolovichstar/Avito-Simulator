'use client'

// Общие визуальные блоки админ-панели Resale. Тёмная фирменная тема:
// фон #070B09, панели #0D120F, акцент #21A038. Компактно и без зависимостей.

import { useEffect, useRef, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'

export function fmtMoney(n: number) {
  return `${Math.abs(Math.round(n)).toLocaleString('ru-RU')} ₽`
}

export function fmtShort(n: number) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 10_000 ? 0 : 1).replace('.0', '')}K`
  return String(Math.round(n))
}

export function fmtDT(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtRel(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} дн назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

export function Page({
  title,
  sub,
  actions,
  children,
}: {
  title: string
  sub?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="animate-[admIn_.3s_cubic-bezier(0.2,0,0,1)]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-zinc-50">{title}</h1>
          {sub && <p className="mt-0.5 text-[12.5px] text-zinc-500">{sub}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl bg-[#0D120F] ring-1 ring-white/[0.07] ${className}`}>{children}</div>
  )
}

export function StatCard({
  label,
  value,
  delta,
  icon,
  accent = false,
  loading,
}: {
  label: string
  value: string
  delta?: number | null
  icon: ReactNode
  accent?: boolean
  loading?: boolean
}) {
  return (
    <Card className={`p-4 ${accent ? 'bg-gradient-to-br from-[#12331D] to-[#0D120F]' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        <span
          className={`flex size-7 items-center justify-center rounded-lg ${
            accent ? 'bg-[#21A038]/25 text-[#4ADE80]' : 'bg-white/[0.06] text-zinc-400'
          }`}
        >
          {icon}
        </span>
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded-lg bg-white/[0.07]" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-[26px] font-bold leading-none tabular-nums text-zinc-50">{value}</span>
          {delta != null && Math.abs(delta) > 0.005 && (
            <span
              className={`text-[12px] font-semibold tabular-nums ${
                delta > 0 ? 'text-[#4ADE80]' : 'text-red-400'
              }`}
            >
              {delta > 0 ? '+' : ''}
              {Math.round(delta * 100)}%
            </span>
          )}
        </div>
      )}
    </Card>
  )
}

export function Badge({
  tone = 'zinc',
  children,
}: {
  tone?: 'green' | 'red' | 'amber' | 'zinc' | 'violet'
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    green: 'bg-[#21A038]/15 text-[#4ADE80] ring-[#21A038]/25',
    red: 'bg-red-500/12 text-red-300 ring-red-500/25',
    amber: 'bg-amber-500/12 text-amber-300 ring-amber-500/25',
    violet: 'bg-violet-500/12 text-violet-300 ring-violet-500/25',
    zinc: 'bg-white/[0.07] text-zinc-400 ring-white/10',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Btn({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  loading,
  type = 'button',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  title?: string
}) {
  const variants: Record<string, string> = {
    default:
      'bg-white/[0.07] text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.11] active:scale-[0.98]',
    primary:
      'bg-[#21A038] text-white shadow-[0_8px_20px_-8px_rgba(33,160,56,.6)] hover:bg-[#1F9134] active:scale-[0.98]',
    danger: 'bg-red-500/12 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/20 active:scale-[0.98]',
    ghost: 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 active:scale-[0.98]',
  }
  return (
    <button
      type={type}
      title={title}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[#21A038]/60 disabled:cursor-not-allowed disabled:opacity-45 ${
        size === 'sm' ? 'h-8 px-3 text-[12px]' : 'h-10 px-4 text-[13px]'
      } ${variants[variant]}`}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  )
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  onKeyDown,
  className = '',
  min,
  max,
}: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  onKeyDown?: (e: React.KeyboardEvent) => void
  className?: string
  min?: number
  max?: number
}) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={`h-10 rounded-xl bg-black/30 px-3.5 text-[13px] text-zinc-100 ring-1 ring-white/10 outline-none transition-all placeholder:text-zinc-600 focus:ring-2 focus:ring-[#21A038]/60 ${className}`}
    />
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        className={`relative w-full ${width} max-h-[86vh] overflow-y-auto rounded-2xl bg-[#101713] p-5 ring-1 ring-white/10 shadow-2xl animate-[admIn_.22s_cubic-bezier(0.2,0,0,1)] [scrollbar-width:thin]`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-zinc-50">{title}</h3>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200"
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.05] text-zinc-500">
        {icon}
      </div>
      <p className="text-[14px] font-semibold text-zinc-300">{title}</p>
      {sub && <p className="max-w-xs text-[12.5px] text-zinc-500">{sub}</p>}
    </div>
  )
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (p: number) => void
}) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
      <span className="text-[12px] text-zinc-500">
        Страница {page} из {pages}
      </span>
      <div className="flex gap-1.5">
        <Btn size="sm" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>
          Назад
        </Btn>
        <Btn size="sm" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages}>
          Вперёд
        </Btn>
      </div>
    </div>
  )
}

export function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle text-[13px] text-zinc-300 ${className}`}>{children}</td>
}

export function Toast({ text, tone }: { text: string; tone: 'ok' | 'err' }) {
  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-semibold text-white shadow-2xl ring-1 backdrop-blur-md ${
        tone === 'ok' ? 'bg-[#16351F]/95 ring-[#21A038]/40' : 'bg-[#3B1414]/95 ring-red-500/40'
      } animate-[admIn_.25s_cubic-bezier(0.2,0,0,1)]`}
    >
      <span className={`size-2 rounded-full ${tone === 'ok' ? 'bg-[#4ADE80]' : 'bg-red-400'}`} />
      {text}
    </div>
  )
}
