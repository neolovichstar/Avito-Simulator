'use client'

// Общие UI-примитивы Госуслуг (Task 26-b): лого-ромб, аватар, шапка-сабвью,
// заголовки секций, карточки документов и ряды сервисов.
// Фирменные цвета: синий #0D4CD3, красный штрафов #EE3F58, фон #F5F6F8.

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BookUser, CarFront, ChevronLeft, ChevronRight, CircleAlert, FileDigit, Fingerprint, Hash,
  HeartPulse, Landmark, MapPin, Plane, ReceiptText,
} from 'lucide-react'
import { initials } from '@/lib/format'
import type { GosDoc, GosDocIcon, GosService } from '@/lib/gos-docs'
import FakeQR from './FakeQR'

export const GOS_BLUE = '#0D4CD3'
export const GOS_RED = '#EE3F58'
export const CARD = 'rounded-[22px] bg-white shadow-[0_2px_10px_rgba(15,35,95,0.05)]'

// Иконки документов
export const DOC_ICONS: Record<GosDocIcon, LucideIcon> = {
  id: Fingerprint,
  hash: Hash,
  filedigit: FileDigit,
  car: CarFront,
  heart: HeartPulse,
  plane: Plane,
}

// Градиенты карточек документов по типу (синие — фирменная гамма портала)
export const DOC_GRADIENTS: Record<GosDoc['id'], [string, string]> = {
  passport: ['#0D4CD3', '#377FF3'],
  snils: ['#0A7EA4', '#2BB3D0'],
  inn: ['#4C1D95', '#8B5CF6'],
  license: ['#0F766E', '#17B39B'],
  oms: ['#0E7490', '#22B8D6'],
  international: ['#134E6F', '#1D7FA8'],
}

// Иконки сервисов. Профессиональный минимум: один акцент (синий), красный —
// только у штрафов.
export const SERVICE_UI: Record<string, { icon: LucideIcon; color: string }> = {
  debts: { icon: ReceiptText, color: GOS_RED },
  taxes: { icon: Landmark, color: GOS_BLUE },
  'passport-replace': { icon: BookUser, color: GOS_BLUE },
  registration: { icon: MapPin, color: GOS_BLUE },
  'license-replace': { icon: CarFront, color: GOS_BLUE },
}

export function serviceUi(id: string): { icon: LucideIcon; color: string } {
  return SERVICE_UI[id] ?? { icon: CircleAlert, color: '#64748B' }
}

// Логотип Госуслуг: синий скруглённый ромб с белым флагом
export function GosLogo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="6.1" y="6.1" width="19.8" height="19.8" rx="4.5" transform="rotate(45 16 16)" fill={GOS_BLUE} />
      <path d="M12 10.6h1.9v10.8H12z" fill="#fff" />
      <path d="M13.9 11h7.1l-2.3 2.7 2.3 2.7h-7.1z" fill="#fff" />
    </svg>
  )
}

export function GosAvatar({
  name,
  photoUrl,
  className = 'size-9',
}: {
  name: string
  photoUrl?: string | null
  className?: string
}) {
  const base = 'flex shrink-0 items-center justify-center overflow-hidden rounded-full ' + className
  if (photoUrl) return <img loading="lazy" decoding="async" src={photoUrl} alt={name} className={base + ' object-cover'}/>
  return (
    <div className={base + ' text-white'} style={{ background: 'linear-gradient(140deg,#377FF3,#0D4CD3)' }}>
      <span className="text-[11px] font-bold">{initials(name)}</span>
    </div>
  )
}

// Шапка подэкрана: стрелка назад + заголовок + опциональный правый слот
export function SubHeader({
  title,
  onBack,
  right,
}: {
  title: string
  onBack: () => void
  right?: ReactNode
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 bg-[#F5F6F8] px-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Назад"
        className="flex size-10 shrink-0 items-center justify-center rounded-full transition active:bg-black/[0.06]"
      >
        <ChevronLeft className="size-6 text-[#17181A]" strokeWidth={2.2} />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-[#17181A]">{title}</h1>
      {right}
    </header>
  )
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="mb-3 flex items-end justify-between px-5">
      <h2 className="text-[19px] font-bold tracking-tight text-[#17181A]">{title}</h2>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="flex items-center gap-0.5 text-[13px] font-semibold text-[#0D4CD3] transition active:opacity-60"
        >
          {action}
          <ChevronRight className="size-4" strokeWidth={2.4} />
        </button>
      )}
    </div>
  )
}

// Карточка документа: компактная для карусели на главной и крупная для сетки «Документы»
export function DocPreviewCard({
  doc,
  onClick,
  large = false,
}: {
  doc: GosDoc
  onClick: () => void
  large?: boolean
}) {
  const [c1, c2] = DOC_GRADIENTS[doc.id]
  const Icon = DOC_ICONS[doc.icon]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Открыть: ${doc.title}`}
      className={
        'press relative flex shrink-0 flex-col overflow-hidden rounded-[20px] p-4 text-left text-white shadow-[0_6px_16px_rgba(13,76,211,0.18)] ' +
        (large ? 'h-[132px] w-full' : 'h-[116px] w-[168px]')
      }
      style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)` }}
    >
      <div className="flex items-start justify-between">
        <span className="flex size-8 items-center justify-center rounded-full bg-white/20">
          <Icon className="size-[17px]" strokeWidth={2} />
        </span>
        {large && (
          <span className="rounded-md bg-white/95 p-[3px] shadow-sm">
            <FakeQR payload={doc.qr} size={30} />
          </span>
        )}
      </div>
      <div className="mt-auto pt-2">
        <div className="line-clamp-2 text-[14px] font-semibold leading-tight">{doc.title}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/75">{doc.subtitle}</div>
      </div>
      <div className="pointer-events-none absolute -right-5 -top-6 size-16 rounded-full bg-white/10" aria-hidden="true" />
    </button>
  )
}

// Ряд сервиса в списке «Услуги»: название + одна строка описания, без больше
export function ServiceRow({
  service,
  onClick,
  badge,
}: {
  service: GosService
  onClick: () => void
  badge?: string
}) {
  const { icon: Icon, color } = serviceUi(service.id)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-black/[0.04]"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-[14px]"
        style={{ backgroundColor: `${color}14`, color }}
        aria-hidden="true"
      >
        <Icon className="size-[19px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-[#17181A]">{service.title}</span>
          {badge && (
            <span className="shrink-0 rounded-full bg-[#EE3F58] px-1.5 text-[10px] font-bold leading-4 text-white">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[#9AA0A8]">{service.desc}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-[#9AA0A8]" strokeWidth={2} />
    </button>
  )
}
