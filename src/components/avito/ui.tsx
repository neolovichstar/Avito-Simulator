'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Атомы дизайн-системы «Resale»: светлое минималистичное приложение
// с тёмно-зелёным акцентом. Общие строительные блоки всех экранов.
// Фон страницы #F6F7F9, карточки белые со скруглением 20 и тонким кольцом,
// чипы-пилюли, капс-надзаголовки, скелетоны и пустые состояния.
// ─────────────────────────────────────────────────────────────────────────────

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

/** Основной акцент: тёмно-зелёный (кнопки «Купить», «Опубликовать», активные табы) */
export const ACCENT = '#14532D'
/** Вторичный зелёный: мелкие элементы (звёзды, бейджи, точки) */
export const ACCENT_SOFT = '#16A34A'

/** Склейка классов без зависимостей */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Белая карточка: rounded-[20px], кольцо black/5, едва заметная тень */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[20px] bg-white ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/** Экранный заголовок: 26px bold tracking-tight */
export function ScreenTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h1 className={cn('text-[26px] font-bold tracking-tight leading-tight text-[#17181A]', className)}>
      {children}
    </h1>
  )
}

/** Капс-надзаголовок секции: 11px uppercase с трекингом */
export function Overline({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40', className)}>
      {children}
    </p>
  )
}

/** Чип-фильтр: пилюля h-9. Неактивный белый с кольцом, активный тёмно-зелёный */
export function Chip({
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] transition-all active:scale-[0.97]',
        'h-9 outline-none focus-visible:ring-2 focus-visible:ring-[#15803D]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#F5F6F8]',
        active
          ? 'bg-[#14532D] font-semibold text-white shadow-[0_2px_10px_rgba(20,83,45,0.28)]'
          : 'bg-white font-medium text-black/70 ring-1 ring-black/[0.08]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Круглая иконочная кнопка с тач-таргетом 44px */
export function IconBtn({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full text-[#17181A] transition-all active:scale-95 active:bg-neutral-200/60',
        'outline-none focus-visible:ring-2 focus-visible:ring-[#15803D]/50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Пульсирующий серый блок скелетона */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-neutral-200/60', className)} aria-hidden />
}

/** Пустое состояние: иконка в круге, заголовок, подсказка, опциональное действие */
export function EmptyState({
  icon,
  title,
  note,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  note?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-8 py-12 text-center', className)}>
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-neutral-200/60 text-[#17181A]/30" aria-hidden>
        {icon}
      </div>
      <p className="mt-3 text-[15px] font-semibold text-[#17181A]">{title}</p>
      {note && <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-[#17181A]/45">{note}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Кнопка-пилюля основного действия (тёмно-зелёная заливка) */
export function PrimaryButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#14532D] text-[15px] font-bold text-white',
        'shadow-[0_4px_14px_rgba(20,83,45,0.25)] transition-all active:scale-[0.98] active:bg-[#0F3F22]',
        'outline-none focus-visible:ring-2 focus-visible:ring-[#15803D]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F6F8]',
        'disabled:opacity-40 disabled:shadow-none',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Ошибка загрузки: иконка, сообщение и кнопка «Повторить» — единый стиль с EmptyState.
 *  Ретрай — белая пилюля 44px; опциональная вторичная кнопка (например «Назад») — текстовая. */
export function ErrorState({
  icon,
  title = 'Не удалось загрузить',
  note,
  retryLabel = 'Повторить',
  onRetry,
  secondaryLabel,
  onSecondary,
  className,
}: {
  icon?: ReactNode
  title?: string
  note?: string
  retryLabel?: string
  onRetry?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-8 py-12 text-center', className)}>
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-red-500/[0.07] text-red-500" aria-hidden>
        {icon}
      </div>
      <p className="mt-3 text-[15px] font-semibold text-[#17181A]">{title}</p>
      {note && <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-[#17181A]/45">{note}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-[#17181A] ring-1 ring-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all active:scale-[0.98] active:bg-neutral-200/60 outline-none focus-visible:ring-2 focus-visible:ring-[#15803D]/50"
        >
          {retryLabel}
        </button>
      )}
      {onSecondary && secondaryLabel && (
        <button
          type="button"
          onClick={onSecondary}
          className="mt-2 flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-[#15803D] transition-opacity active:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-[#15803D]/50"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  )
}
