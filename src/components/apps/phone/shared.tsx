'use client'

// Общие типы, мета тиров и мини-хелперы приложения «Телефон».
// Серверная логика номеров — в '@/lib/phone' (чистые функции, безопасны тут).

import { useSyncExternalStore } from 'react'
import { Crown, Diamond, Gem, Hash, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError, getToken } from '@/lib/api'

export type Tier = 'basic' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface PhoneDTO {
  id: string
  number: string
  digits: string
  regionCode: string
  regionName: string
  tier: string
  beautyScore: number
  status: string // active | reserved | released
  buyPrice: number
  holdUntil: string | null
  isMain: boolean
  createdAt: string
}

export interface CallDTO {
  id: string
  name: string | null
  number: string
  kind: 'in' | 'out' | 'miss'
  status: string
  durationSec: number
  ts: string
}

export interface ContactDTO {
  id: string
  name: string
  num: string
  isBot: boolean
  /** ИИ-личность продавца (personas-data) — звонок будет живым разговором. */
  personaId?: string | null
}

export interface RollResponse {
  ok: true
  activated: boolean
  balance: number
  phone: PhoneDTO
  holdHours: number
}

interface TierMeta {
  label: string
  color: string
  icon: LucideIcon
}

/** Цвета тиров по ТЗ: basic серый, silver/gold/platinum/diamond — свои. */
export const TIER_META: Record<Tier, TierMeta> = {
  basic: { label: 'Обычный', color: '#A8B3AC', icon: Hash },
  silver: { label: 'Серебро', color: '#C0C0C0', icon: Sparkles },
  gold: { label: 'Золото', color: '#FFD53D', icon: Crown },
  platinum: { label: 'Платина', color: '#E5E4E2', icon: Gem },
  diamond: { label: 'Бриллиант', color: '#B9F2FF', icon: Diamond },
}

export function tierMeta(tier: string): TierMeta {
  return TIER_META[(tier as Tier) in TIER_META ? (tier as Tier) : 'basic']
}

/** Мелкий бейдж тира. variant 'light' — заполненная пилюля для светлых экранов. */
export function TierBadge({
  tier,
  size = 'sm',
  variant = 'dark',
}: {
  tier: string
  size?: 'sm' | 'lg'
  variant?: 'dark' | 'light'
}) {
  const meta = tierMeta(tier)
  const Icon = meta.icon
  const light = variant === 'light'
  return (
    <span
      className={
        'inline-flex shrink-0 items-center gap-1 rounded-full font-medium ' +
        (size === 'lg' ? 'px-2.5 py-1 text-[12px]' : 'px-2 py-0.5 text-[10.5px]')
      }
      style={
        light
          ? { backgroundColor: meta.color, color: '#17181A' }
          : { backgroundColor: `${meta.color}1f`, color: meta.color }
      }
    >
      <Icon className={size === 'lg' ? 'size-3.5' : 'size-3'} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

/** Тик раз в секунду — таймеры брони и длительности вызова. */
export function useTick(): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, 1000)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  )
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** «47:02:11» / «2:05:09» — остаток брони по секундам. */
export function fmtCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${pad2(m)}:${pad2(s)}`
}

/** Длительность вызова «5:23». */
export function fmtDuration(sec: number): string {
  if (sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${pad2(s)}`
}

/** fetch с токеном сессии (тот же механизм, что lib/api.ts). */
export async function phoneReq<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getToken()}`,
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Ошибка ${res.status}`)
  return data
}

export function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}
