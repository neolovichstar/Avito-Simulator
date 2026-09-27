'use client'

// Общие визуальные детали редизайна «Аукциона» по макету 02-auction.png:
// тёплый крем #FAF6EE, белые карточки radius 20 с ring-black/[0.05],
// янтарный акцент #C77B28 (ставки, чипы, табы), красный #D14343 таймеров финалов.
// Компоненты без состояния, данные приходят пропсами из AuctionApp.tsx.
import { Crown, FileText, Gavel, Heart, Trophy, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { fmtMoney, fmtNum } from '@/lib/format'
import { CATEGORY_LABEL, CONDITION_LABEL } from '@/lib/catalog-types'
import { UserAvatar } from '@/components/shared/UserAvatar'
import type { AuctionLotDTO } from '@/lib/types'

// Токены дизайн-системы
export const AMBER = '#C77B28'
export const RED = '#D14343'
export const PLATE = '#F6E7D4'

// Лот считается «заканчивающимся» за час до финала: красный таймер + бейдж
export const ENDING_MS = 60 * 60 * 1000

export function bidStep(lot: AuctionLotDTO): number {
  return Math.max(100, Math.round((lot.currentBid ?? lot.startPrice) * 0.02))
}

export function minBid(lot: AuctionLotDTO): number {
  return (lot.currentBid ?? lot.startPrice) + bidStep(lot)
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

// ЧЧ / ММ / СС
export function timeParts(ms: number): { h: number; m: number; s: number } {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

// Живой таймер в формате HH:MM:SS (часы могут быть многозначными)
export function fmtClock(ms: number): string {
  const p = timeParts(ms)
  return `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}:${String(p.s).padStart(2, '0')}`
}

// Краткое описание лота для строки списка: категория и состояние
export function lotDesc(lot: AuctionLotDTO): string {
  return `${CATEGORY_LABEL[lot.category] ?? lot.category} · ${CONDITION_LABEL[lot.condition] ?? lot.condition}`
}

// Капс-лейбл системы
export function Cap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={'text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40 ' + className}>
      {children}
    </div>
  )
}

// Сердечко избранного: контур серый, активное залито янтарным
export function HeartBtn({
  active,
  onClick,
  label,
  plain = false,
}: {
  active: boolean
  onClick: () => void
  label: string
  plain?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={
        'flex shrink-0 items-center justify-center rounded-full transition active:scale-90 ' +
        (plain ? 'size-10 ' : 'size-9 ') +
        (active ? '' : plain ? 'text-[#141414]' : 'text-[#9CA3AF]')
      }
    >
      <Heart
        className={plain ? 'size-[22px]' : 'size-5'}
        style={active ? { fill: AMBER, color: AMBER } : undefined}
        aria-hidden
      />
    </button>
  )
}

// Аватар участника в истории ставок (лидер с янтарным кольцом)
export function BidAvatar({ name, top }: { name: string; top?: boolean }) {
  return (
    <span
      className={
        'inline-flex shrink-0 overflow-hidden rounded-full ' +
        (top ? 'ring-2 ring-[#C77B28] ring-offset-1' : '')
      }
    >
      <UserAvatar name={name} className="size-7" />
    </span>
  )
}

export interface LotFlags {
  remainMs: number
  ended: boolean
  ending: boolean
  leading: boolean
  won: boolean
}

export function lotFlags(lot: AuctionLotDTO, nowMs: number): LotFlags {
  const remainMs = new Date(lot.endsAt).getTime() - nowMs
  const ended = remainMs <= 0
  return {
    remainMs,
    ended,
    ending: !ended && remainMs < ENDING_MS,
    leading: !ended && lot.isMine && lot.currentBidderName != null,
    won: ended && lot.isMine,
  }
}

// Строка лота в списке: фото 96x96 rounded-14 + контент + сердечко
export function LotRow({
  lot,
  flags,
  fav,
  extended,
  onOpen,
  onFav,
}: {
  lot: AuctionLotDTO
  flags: LotFlags
  fav: boolean
  extended: boolean
  onOpen: (id: string) => void
  onFav: (id: string) => void
}) {
  const { ended, remainMs, ending, leading, won } = flags
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lot.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(lot.id)
        }
      }}
      aria-label={`Открыть лот ${lot.title}`}
      className="flex cursor-pointer gap-3 rounded-[20px] bg-white p-3 ring-1 ring-black/[0.05] transition active:scale-[0.98]"
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-[14px] bg-black/[0.03]">
        <img loading="lazy" decoding="async" src={lot.image} alt={lot.title} className="size-full object-cover"/>
        {!ended && ending && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: AMBER }} aria-hidden />
            Заканчивается
          </span>
        )}
        {ended && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            Завершён
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <div className="truncate text-[15px] font-bold text-[#141414]">{lot.title}</div>
        <div className="mt-0.5 truncate text-[13px] text-[#9CA3AF]">{lotDesc(lot)}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[16px] font-extrabold tabular-nums text-[#141414]">
            {fmtMoney(lot.currentBid ?? lot.startPrice)}
          </span>
          <span className="text-[12px] text-[#9CA3AF]">
            {lot.bidCount} {plural(lot.bidCount, 'ставка', 'ставки', 'ставок')}
          </span>
        </div>
        {lot.myBid > 0 && (
          <div className="mt-0.5 truncate text-[11px] font-medium text-[#C77B28]">
            Ваша ставка {fmtMoney(lot.myBid)}
            {!ended && lot.myAutoBid > 0 ? ` · авто до ${fmtMoney(lot.myAutoBid)}` : ''}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          {won && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: AMBER }}
            >
              <Trophy className="size-3" aria-hidden /> Победа
            </span>
          )}
          {!won && leading && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: AMBER }}
            >
              <Crown className="size-3" aria-hidden /> Вы лидер
            </span>
          )}
          {extended && (
            <span className="animate-pulse rounded-full bg-[#FDEEEE] px-2 py-0.5 text-[10px] font-semibold text-[#D14343]">
              Таймер продлён
            </span>
          )}
          <span
            className={
              'ml-auto text-[13px] font-semibold tabular-nums ' +
              (ended ? 'text-black/30' : ending ? 'text-[#D14343]' : 'text-black/45')
            }
          >
            {ended ? 'Завершён' : fmtClock(remainMs)}
          </span>
        </div>
      </div>

      <div className="self-start">
        <HeartBtn
          active={fav}
          onClick={() => onFav(lot.id)}
          label={fav ? `Убрать ${lot.title} из избранного` : `В избранное: ${lot.title}`}
        />
      </div>
    </div>
  )
}

// Крупный каунтдаун «До окончания» на карточке лота
export function CountdownCard({ remainMs, ended }: { remainMs: number; ended: boolean }) {
  const p = timeParts(remainMs)
  const color = ended ? '#9CA3AF' : remainMs < ENDING_MS ? RED : '#141414'
  const cells: [number, string][] = [
    [p.h, 'часов'],
    [p.m, 'минут'],
    [p.s, 'секунд'],
  ]
  return (
    <div className="rounded-[20px] p-4" style={{ backgroundColor: PLATE }}>
      <Cap className="text-center">До окончания</Cap>
      {ended ? (
        <div className="mt-2 text-center text-[18px] font-bold text-[#9CA3AF]">Аукцион завершён</div>
      ) : (
        <div className="mt-2 flex items-start justify-center gap-1.5">
          {cells.map(([v, label], i) => (
            <div key={label} className="flex items-start gap-1.5">
              {i > 0 && (
                <span className="pt-0.5 text-[26px] font-extrabold leading-none tabular-nums" style={{ color }} aria-hidden>
                  :
                </span>
              )}
              <div className="text-center">
                <div className="text-[34px] font-extrabold tabular-nums leading-none" style={{ color }}>
                  {String(v).padStart(2, '0')}
                </div>
                <div className="mt-1.5 text-[11px] text-black/40">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Сегмент-контрол (Лоты / Мои ставки / Выигранные, режимы шторки)
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (k: T) => void
  ariaLabel: string
}) {
  return (
    <div className="flex rounded-full bg-black/[0.05] p-1" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={
            'h-10 flex-1 rounded-full text-[13px] font-semibold transition active:scale-[0.98] ' +
            (value === o.key ? 'text-white' : 'text-[#6B7280]')
          }
          style={value === o.key ? { backgroundColor: AMBER } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export type AuctionTab = 'auction' | 'fav' | 'bids' | 'profile'

// Нижний таб-бар приложения: Аукцион / Избранное / Мои ставки / Профиль
export function TabBar({
  active,
  bidsCount,
  onSelect,
}: {
  active: AuctionTab
  bidsCount: number
  onSelect: (t: AuctionTab) => void
}) {
  const tabs: { key: AuctionTab; label: string; Icon: LucideIcon }[] = [
    { key: 'auction', label: 'Аукцион', Icon: Gavel },
    { key: 'fav', label: 'Избранное', Icon: Heart },
    { key: 'bids', label: 'Мои ставки', Icon: FileText },
    { key: 'profile', label: 'Профиль', Icon: User },
  ]
  return (
    <nav className="shrink-0 border-t border-black/[0.06] bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Разделы аукциона">
      <div className="flex">
        {tabs.map((t) => {
          const Icon = t.Icon
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelect(t.key)}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 transition active:scale-95"
              style={{ color: isActive ? AMBER : '#9CA3AF' }}
            >
              <Icon className="size-5" aria-hidden />
              <span className="text-[10px] font-semibold">{t.label}</span>
              {t.key === 'bids' && bidsCount > 0 && (
                <span
                  className="absolute right-[18%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                  style={{ backgroundColor: AMBER }}
                >
                  {bidsCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// Скелетон списка лотов
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[120px] animate-pulse rounded-[20px] bg-black/[0.04]" />
      ))}
    </div>
  )
}

// Пустое состояние
export function EmptyCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] bg-white px-6 py-10 text-center ring-1 ring-black/[0.05]">
      <div className="flex size-14 items-center justify-center rounded-full bg-black/[0.04]">
        <Icon className="size-6 text-[#9CA3AF]" aria-hidden />
      </div>
      <div className="mt-3 text-[15px] font-bold text-[#141414]">{title}</div>
      <div className="mt-1 max-w-64 text-[13px] leading-relaxed text-[#9CA3AF]">{text}</div>
    </div>
  )
}

// Чип инкремента ставки: +50 000 / +100 000 / +250 000 (в масштабе шага лота)
export function StepChip({ value, active, onClick }: { value: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Прибавить ${fmtNum(value)}`}
      className={
        'h-11 flex-1 rounded-full text-[14px] font-semibold transition active:scale-[0.97] ' +
        (active ? 'text-white' : 'bg-white text-[#141414] ring-1 ring-black/[0.08]')
      }
      style={active ? { backgroundColor: AMBER } : undefined}
    >
      +{fmtNum(value)}
    </button>
  )
}
