'use client'

// Мастерская (Task 28-c) — светлая ОС Resale: фон #F5F6F8, белые блоки rounded-[20px],
// текст #17181A, чёрные pill-CTA, жёлтый #FFD53D. Минимум текста.
// Вкладки: Мастерская (мои вещи + активные наряды) / Запчасти (склад + поставщик,
// совместимость по canFit с живыми причинами отказа) / Инструмент.
// Флоу: диагностика (платная) → выбор запчасти → старт работы (деньги списывает сервер)
// → мини-игра на весь экран (src/components/apps/repair/minigames.tsx) → результат
// (score → /api/repair/finish: condition+, ценность+, XP; < 60 — гарантия на переделку).
// Легаси «наёмный мастер» (RepairOrder) остался узкой секцией с выдачей, чтобы не
// блокировать вещи старыми заказами.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, ArrowRight, Check, Loader2, Package, ScanLine, ShieldCheck, Wrench, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import { nextCondition, repairCost } from '@/lib/economy'
import { CONDITION_LABEL } from '@/lib/catalog-types'
import {
  canFit, GAME_INFO, PART_GROUPS, PARTS, partById,
  type GameKey, type Part,
} from '@/lib/parts'
import { sound } from '@/lib/sound'
import type {
  JobConfigDTO, JobResultDTO, RepairOrderDTO, StockDTO, ToolDTO, WorkshopDataDTO, WorkshopItemDTO,
} from '@/lib/types'
import { GameDiagram, MiniGame } from './repair/minigames'

const CARD = 'rounded-[20px] bg-white shadow-[0_2px_14px_rgba(23,24,26,0.05)]'
const GREEN = '#21A03A'
const RED = '#D14343'
const YELLOW = '#FFD53D'

type TabKey = 'workshop' | 'parts' | 'tools'
type Difficulty = 'easy' | 'normal' | 'hard'

// ─────────────────────────── утилиты ───────────────────────────

function useTick(ms = 1000): number {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, ms)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / ms),
    () => 0,
  )
}

function hpPct(c: string): number {
  switch (c) {
    case 'new': return 100
    case 'excellent': return 82
    case 'good': return 60
    case 'used': return 35
    case 'parts': return 12
    default: return 50
  }
}

function hpColor(pct: number): string {
  if (pct >= 75) return GREEN
  if (pct >= 45) return '#E8A020'
  return RED
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function shortTitle(s: string): string {
  return s.length > 26 ? s.slice(0, 25) + '…' : s
}

// Оценки стоимости — зеркало серверных формул (repair-server.ts), только для подписей.
function workDiscount(level: number): number {
  return Math.min(0.3, Math.max(0, level - 1) * 0.02)
}
function estWorkCost(
  baseValue: number,
  opts: { kind: 'repair' | 'install'; diagnosed: boolean; level: number; withPart: boolean },
): number {
  let c = repairCost(baseValue)
  if (opts.kind === 'install') c = Math.round(c * 0.5)
  if (opts.kind === 'repair' && !opts.diagnosed) c = Math.round(c * 1.35)
  else if (opts.diagnosed) c = Math.round(c * 0.85)
  if (opts.withPart) c = Math.round(c * 0.9)
  c = Math.round(c * (1 - workDiscount(opts.level)))
  return Math.max(150, c)
}
const estDiagFee = (baseValue: number) => Math.max(150, Math.round(repairCost(baseValue) * 0.15))
const estSellRefund = (price: number, wearAvg: number) =>
  Math.max(50, Math.round(price * 0.55 * (1 - wearAvg / 200)))

const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Легко', normal: 'Обычно', hard: 'Сложно' }

function gameOf(g: string): GameKey {
  return g === 'seam' || g === 'solder' || g === 'bolt' || g === 'simon' || g === 'gauge' ? g : 'gauge'
}

// Каталог поставщика по группам (модуль читается один раз)
const PARTS_BY_GROUP: Record<string, Part[]> = {
  phones: PARTS.filter((p) => p.group === 'phones'),
  pc: PARTS.filter((p) => p.group === 'pc'),
  home: PARTS.filter((p) => p.group === 'home'),
  misc: PARTS.filter((p) => p.group === 'misc'),
}

// ─────────────────────────── мелкие блоки UI ───────────────────────────

function ConditionBadge({ value }: { value: string }) {
  const cls =
    value === 'new' ? 'bg-[#E6F6EC] text-[#067A47]'
    : value === 'excellent' ? 'bg-[#EFF8E6] text-[#4C8A1F]'
    : value === 'good' ? 'bg-[#F0F1F5] text-[#5F6368]'
    : value === 'used' ? 'bg-[#FFF4DC] text-[#B25E09]'
    : 'bg-[#FDEEEE] text-[#D14343]'
  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ' + cls}>
      {CONDITION_LABEL[value] ?? value}
    </span>
  )
}

function HpBar({ value }: { value: string }) {
  const pct = hpPct(value)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F1F5]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: hpColor(pct) }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[10px] font-semibold tabular-nums text-[#9AA0A8]">{pct}%</span>
    </div>
  )
}

function Chip({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'amber' | 'yellow' | 'red'; children: React.ReactNode }) {
  const cls =
    tone === 'green' ? 'bg-[#E6F6EC] text-[#067A47]'
    : tone === 'amber' ? 'bg-[#FFF4DC] text-[#B25E09]'
    : tone === 'yellow' ? 'text-[#231A02]'
    : tone === 'red' ? 'bg-[#FDEEEE] text-[#D14343]'
    : 'bg-[#F0F1F5] text-[#5F6368]'
  return (
    <span
      className={'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ' + cls}
      style={tone === 'yellow' ? { backgroundColor: YELLOW } : undefined}
    >
      {children}
    </span>
  )
}

function PillButton({
  children, onClick, variant = 'dark', disabled, busy, className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'dark' | 'outline' | 'ghost' | 'yellow'
  disabled?: boolean
  busy?: boolean
  className?: string
}) {
  const base = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold transition active:scale-[0.97] disabled:opacity-45'
  const style =
    variant === 'dark' ? 'bg-[#17181A] text-white'
    : variant === 'yellow' ? 'text-[#231A02]'
    : variant === 'outline' ? 'border-2 border-[#17181A]/10 bg-white text-[#17181A]'
    : 'text-[#5F6368]'
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={base + ' ' + style + ' ' + className}
      style={variant === 'yellow' ? { backgroundColor: YELLOW } : undefined}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

function EmptyState({ icon: Icon, title, sub, image }: { icon?: typeof Wrench; title: string; sub?: string; image?: string }) {
  return (
    <div className={`flex flex-col items-center rounded-[20px] bg-white px-4 py-8 text-center shadow-[0_2px_14px_rgba(23,24,26,0.05)]`}>
      {image ? (
        <img src={image} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-24" />
      ) : Icon ? (
        <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
          <Icon className="size-6 text-[#9AA0A8]" aria-hidden />
        </div>
      ) : null}
      <div className="mt-3 text-[15px] font-semibold text-[#17181A]">{title}</div>
      {sub && <div className="mt-1 max-w-64 text-[13px] leading-snug text-[#9AA0A8]">{sub}</div>}
    </div>
  )
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[17px] font-bold text-[#17181A]">{children}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="text-[12px] font-semibold tabular-nums text-[#9AA0A8]">{count}</span>
      )}
    </div>
  )
}

// ─────────────────────────── карточка вещи (Мастерская) ───────────────────────────

function ItemCard({
  item, level, stockOf, onStart, onDiagnose, onResume, onPickParts, busyKey,
}: {
  item: WorkshopItemDTO
  level: number
  stockOf: (partKey: string) => number
  onStart: (item: WorkshopItemDTO, kind: 'repair' | 'install', partKey?: string) => void
  onDiagnose: (item: WorkshopItemDTO) => void
  onResume: (item: WorkshopItemDTO) => void
  onPickParts: (item: WorkshopItemDTO) => void
  busyKey: string | null
}) {
  const repairable = nextCondition(item.condition) !== null
  const diagnosed = Boolean(item.faults?.length)
  const suggested = item.suggestedPartKey ? partById(item.suggestedPartKey) ?? null : null
  const suggestedInStock = Boolean(suggested && stockOf(suggested.key) > 0)
  const canStart = busyKey === `start:${item.id}`
  const canDiag = busyKey === `diag:${item.id}`

  const costRepair = estWorkCost(item.baseValue, { kind: 'repair', diagnosed, level, withPart: false })
  const costRepairPart = estWorkCost(item.baseValue, { kind: 'repair', diagnosed, level, withPart: true })
  const warrantyUntil = item.warrantyUntil && new Date(item.warrantyUntil).getTime() > Date.now() ? item.warrantyUntil : null

  return (
    <div className={CARD + ' p-4'}>
      <div className="flex gap-3">
        <img
          src={item.image} alt={item.title} loading="lazy" decoding="async"
          className="size-16 shrink-0 rounded-2xl object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight">{item.title}</div>
          <div className="mt-1 flex items-center gap-2">
            <ConditionBadge value={item.condition} />
            <span className="text-[12px] font-semibold tabular-nums text-[#5F6368]">~{fmtMoney(item.estValue)}</span>
          </div>
          <div className="mt-2"><HpBar value={item.condition} /></div>
        </div>
      </div>

      {/* активный наряд — продолжить */}
      {item.activeJob ? (
        <div className="mt-3">
          <div className="text-[12px] text-[#9AA0A8]">
            Работа оплачена{item.activeJob.partKey ? ` · ${partById(item.activeJob.partKey)?.title ?? 'запчасть'}` : ''}
          </div>
          <PillButton className="mt-2 w-full" busy={canStart} onClick={() => onResume(item)}>
            <Wrench className="size-4" aria-hidden />
            {GAME_INFO[gameOf(item.activeJob.game)].title}
          </PillButton>
        </div>
      ) : (
        <>
          {/* узлы после диагностики: тап — заменить (есть на складе) или купить */}
          {item.faults && item.faults.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.faults.map((f) => {
                const part = f.partKey ? partById(f.partKey) : undefined
                const inStock = Boolean(part && stockOf(part.key) > 0)
                return (
                  <button
                    key={f.code}
                    type="button"
                    disabled={!part}
                    onClick={() => { if (part) { if (inStock) onStart(item, 'install', part.key); else onPickParts(item) } }}
                    className={
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold transition active:scale-[0.97] disabled:cursor-default ' +
                      (part ? (inStock ? 'bg-[#17181A]/[0.06] text-[#17181A]' : 'bg-[#F0F1F5] text-[#5F6368]') : 'bg-[#F0F1F5] text-[#8A8F98]')
                    }
                  >
                    {f.label}
                    <span className="tabular-nums opacity-60">{f.wear}%</span>
                    {part && (inStock ? <ArrowRight className="size-3" aria-hidden /> : <Package className="size-3" aria-hidden />)}
                  </button>
                )
              })}
            </div>
          )}

          {/* гарантия на переделку */}
          {warrantyUntil && (
            <div className="mt-3">
              <Chip tone="yellow">
                <ShieldCheck className="size-3.5" aria-hidden />
                Гарантия до {fmtClock(warrantyUntil)} · повтор бесплатно
              </Chip>
            </div>
          )}

          {/* CTA */}
          <div className="mt-3 flex gap-2">
            {repairable ? (
              suggested && suggestedInStock ? (
                <>
                  <PillButton className="flex-1" busy={canStart} onClick={() => onStart(item, 'repair', suggested.key)}>
                    {shortTitle(suggested.title)} · {fmtMoney(costRepairPart)}
                  </PillButton>
                  <PillButton variant="ghost" className="px-3" busy={canStart} onClick={() => onStart(item, 'repair')}>
                    Без детали
                  </PillButton>
                </>
              ) : (
                <>
                  <PillButton className="flex-1" busy={canStart} onClick={() => onStart(item, 'repair')}>
                    Ремонт{warrantyUntil ? ' · гарантия' : ` · ${fmtMoney(costRepair)}`}
                  </PillButton>
                  {!diagnosed ? (
                    <PillButton variant="outline" className="flex-1" busy={canDiag} onClick={() => onDiagnose(item)}>
                      <ScanLine className="size-4" aria-hidden />
                      Диагностика · {fmtMoney(estDiagFee(item.baseValue))}
                    </PillButton>
                  ) : (
                    <PillButton variant="outline" className="px-3.5" onClick={() => onPickParts(item)} aria-label="Подобрать запчасть">
                      <Package className="size-4" aria-hidden />
                      Запчасть
                    </PillButton>
                  )}
                </>
              )
            ) : (
              <PillButton variant="outline" className="flex-1" onClick={() => onPickParts(item)}>
                <Package className="size-4" aria-hidden />
                Поставить запчасть
              </PillButton>
            )}
          </div>
          {!repairable && (
            <div className="mt-2 text-center text-[11.5px] text-[#9AA0A8]">Состояние отличное — можно улучшить деталью</div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────── строка склада / поставщика (Запчасти) ───────────────────────────

function PartRow({
  part, stockQty, fit, reason, contextMode, onBuyNew, onBuyUsed, onInstall, busyKey,
}: {
  part: Part
  stockQty: number
  fit: boolean | null // null — контекста нет
  reason?: string
  contextMode: boolean
  onBuyNew: () => void
  onBuyUsed: () => void
  onInstall: (() => void) | null
  busyKey: string | null
}) {
  const [open, setOpen] = useState(false)
  const dim = contextMode && fit === false
  return (
    <div className={CARD + ' p-3 transition-opacity'} style={{ opacity: dim ? 0.62 : 1 }}>
      <button
        type="button"
        className="flex w-full items-start gap-2.5 text-left"
        onClick={() => { if (contextMode && fit === false) setOpen((v) => !v) }}
        aria-expanded={contextMode ? open : undefined}
      >
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ background: contextMode ? (fit ? GREEN : RED) : '#D8DBE0' }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium leading-snug text-[#17181A]">{part.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {part.tags.slice(0, 2).map((t) => (
              <span key={t} className="rounded-full bg-[#F0F1F5] px-2 py-0.5 text-[10px] font-semibold text-[#5F6368]">{t}</span>
            ))}
            <span className="text-[10.5px] text-[#9AA0A8]">{GAME_INFO[part.game].title}</span>
            {stockQty > 0 && <span className="text-[10.5px] font-semibold text-[#067A47]">в наличии: {stockQty}</span>}
          </span>
        </span>
      </button>

      {open && reason && (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-[#FFF4DC] px-2.5 py-2 text-[11.5px] font-medium leading-snug text-[#B25E09]">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {reason}
        </div>
      )}

      <div className="mt-2.5 flex gap-2">
        {onInstall && (
          <PillButton variant="yellow" className="flex-1" busy={busyKey === `start:${part.key}`} onClick={onInstall}>
            Поставить
          </PillButton>
        )}
        <PillButton variant={onInstall ? 'outline' : 'dark'} className="flex-1" busy={busyKey === `buy:${part.key}:new`} onClick={onBuyNew}>
          {fmtMoney(part.price)}
        </PillButton>
        <PillButton variant="outline" className="flex-1" busy={busyKey === `buy:${part.key}:used`} onClick={onBuyUsed}>
          {fmtMoney(Math.round(part.price * 0.45))} · б/у
        </PillButton>
      </div>
    </div>
  )
}

function StockRow({
  stock, part, fit, onSell, onInstall, busyKey,
}: {
  stock: StockDTO
  part: Part | undefined
  fit: boolean | null
  onSell: () => void
  onInstall: (() => void) | null
  busyKey: string | null
}) {
  if (!part) return null
  return (
    <div className="flex items-center gap-3 border-b border-[#17181A]/[0.05] py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-[#17181A]">{part.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9AA0A8]">
          <span className="font-bold tabular-nums text-[#17181A]">×{stock.qty}</span>
          {stock.wearAvg > 0 && <span>износ ~{stock.wearAvg}%</span>}
          <span>{GAME_INFO[part.game].title}</span>
        </div>
      </div>
      {onInstall && fit !== false && (
        <PillButton variant="yellow" className="h-9 px-3.5 text-[12px]" busy={busyKey === `start:${part.key}`} onClick={onInstall}>
          Поставить
        </PillButton>
      )}
      <PillButton variant="outline" className="h-9 px-3.5 text-[12px]" busy={busyKey === `sell:${part.key}`} onClick={onSell}>
        {fmtMoney(estSellRefund(part.price, stock.wearAvg))}
      </PillButton>
    </div>
  )
}

// ─────────────────────────── шторка-наряд: интро / игра / результат ───────────────────────────

function ScoreDial({ score, success, perfect }: { score: number; success: boolean; perfect: boolean }) {
  const R = 56
  const C = 2 * Math.PI * R
  const color = perfect ? '#E4B800' : success ? GREEN : RED
  return (
    <div className="relative size-40">
      <svg viewBox="0 0 140 140" className="size-full -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#ECEDEF" strokeWidth="11" />
        <motion.circle
          cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - score / 100) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-bold leading-none tabular-nums text-[#17181A]">{score}</span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9AA0A8]">точность</span>
      </div>
    </div>
  )
}

function JobOverlay({
  job, phase, score, result, resultLoading, originCond, onStart, onCancel, onClose, onFinishGame,
}: {
  job: JobConfigDTO
  phase: 'intro' | 'play' | 'result'
  score: number
  result: JobResultDTO | null
  resultLoading: boolean
  originCond: string
  onStart: () => void
  onCancel: () => void
  onClose: () => void
  onFinishGame: (s: number) => void
}) {
  const game = gameOf(job.game)
  const info = GAME_INFO[game]
  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col bg-[#F5F6F8]"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
    >
      {phase === 'intro' && (
        <div className="flex h-full flex-col px-5 pb-5 pt-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#9AA0A8]">
                {job.kind === 'install' ? 'Установка запчасти' : 'Ремонт'}
              </div>
              <div className="mt-1 text-[21px] font-bold leading-tight text-[#17181A]">{info.title}</div>
              <div className="mt-0.5 max-w-[240px] truncate text-[12.5px] text-[#9AA0A8]">
                {job.itemTitle}{job.partTitle ? ` · ${shortTitle(job.partTitle)}` : ''}
              </div>
            </div>
            <button
              type="button" onClick={onCancel} aria-label="Отменить работу"
              className="flex size-9 items-center justify-center rounded-full bg-white text-[#5F6368] shadow-[0_2px_10px_rgba(23,24,26,0.07)] transition active:scale-90"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone={job.difficulty === 'easy' ? 'green' : job.difficulty === 'hard' ? 'red' : 'gray'}>
              {DIFF_LABEL[job.difficulty]}
            </Chip>
            {job.hasTool && <Chip tone="green">С инструментом</Chip>}
            {job.warranty && <Chip tone="yellow"><ShieldCheck className="size-3.5" aria-hidden />По гарантии</Chip>}
            {job.cost > 0 && <Chip>Работа · {fmtMoney(job.cost)}</Chip>}
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="w-full max-w-[320px] rounded-[24px] bg-white p-4 shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
              <GameDiagram game={game} />
            </div>
          </div>

          <p className="text-center text-[13px] font-medium text-[#5F6368]">{info.hint}</p>
          <PillButton className="mt-3 h-13 w-full py-3.5" onClick={onStart}>Начать</PillButton>
          {job.cost > 0 && (
            <button type="button" onClick={onCancel} className="mt-2 text-center text-[12px] font-semibold text-[#9AA0A8] transition active:text-[#5F6368]">
              Отменить — вернём {fmtMoney(job.cost)}
            </button>
          )}
        </div>
      )}

      {phase === 'play' && (
        <div className="h-full">
          <MiniGame key={job.jobId} game={game} difficulty={job.difficulty} onFinish={onFinishGame} />
        </div>
      )}

      {phase === 'result' && (
        <div className="flex h-full flex-col px-5 pb-5 pt-8">
          <div className="flex flex-1 flex-col items-center justify-center">
            {resultLoading || !result ? (
              <>
                <ScoreDial score={score} success={score >= 60} perfect={score >= 85} />
                <div className="mt-5 flex items-center gap-2 text-[13px] font-semibold text-[#9AA0A8]">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Принимаем работу…
                </div>
              </>
            ) : (
              <>
                <ScoreDial score={result.score} success={result.success} perfect={result.perfect} />
                <div className="mt-4 text-[20px] font-bold text-[#17181A]">
                  {result.perfect ? 'Идеально!' : result.success ? 'Получилось' : 'Не вышло'}
                </div>
                <p className="mt-1 max-w-64 text-center text-[13px] leading-snug text-[#5F6368]">{result.message}</p>
                {result.perfect && (
                  <div className="mt-3">
                    <Chip tone="yellow"><ShieldCheck className="size-3.5" aria-hidden />С гарантийным чеком</Chip>
                  </div>
                )}
                <div className="mt-4 w-full max-w-[320px] rounded-[20px] bg-white p-1 shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
                  {result.success && result.valueAdd > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                      <span className="text-[#5F6368]">Ценность вещи</span>
                      <span className="font-bold tabular-nums text-[#067A47]">+{fmtMoney(result.valueAdd)}</span>
                    </div>
                  )}
                  {result.success && result.item && result.item.condition !== originCond && (
                    <div className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                      <span className="text-[#5F6368]">Состояние</span>
                      <span className="flex items-center gap-1.5 font-bold">
                        <ConditionBadge value={originCond} />
                        <ArrowRight className="size-3.5 text-[#9AA0A8]" aria-hidden />
                        <ConditionBadge value={result.item.condition} />
                      </span>
                    </div>
                  )}
                  {result.success && result.item && result.item.condition === originCond && result.valueAdd > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                      <span className="text-[#5F6368]">Состояние</span>
                      <ConditionBadge value={result.item.condition} />
                    </div>
                  )}
                  <div className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                    <span className="text-[#5F6368]">Опыт мастера</span>
                    <span className="font-bold tabular-nums text-[#17181A]">+{result.xp} XP</span>
                  </div>
                  {result.partWasted && (
                    <div className="flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold text-[#D14343]">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden />
                      Запчасть повреждена
                    </div>
                  )}
                  {!result.success && result.warrantyUntil && (
                    <div className="flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold text-[#B25E09]">
                      <ShieldCheck className="size-4 shrink-0" aria-hidden />
                      Переделка бесплатно до {fmtClock(result.warrantyUntil)}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {!resultLoading && result && (
            <PillButton className="h-13 w-full py-3.5" onClick={onClose}>Готово</PillButton>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ─────────────────────────── главный компонент ───────────────────────────

export default function RepairApp() {
  const session = useOS((s) => s.session)
  const [data, setData] = useState<WorkshopDataDTO | null>(null)
  const [legacy, setLegacy] = useState<RepairOrderDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('workshop')
  const [group, setGroup] = useState<string>('phones')
  const [ctxItemId, setCtxItemId] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // наряд (мини-игра)
  const [job, setJob] = useState<JobConfigDTO | null>(null)
  const [jobPhase, setJobPhase] = useState<'intro' | 'play' | 'result'>('intro')
  const [gameScore, setGameScore] = useState(0)
  const [result, setResult] = useState<JobResultDTO | null>(null)
  const [resultLoading, setResultLoading] = useState(false)
  const originCondRef = useRef<string>('')

  useTick(1000) // живой прогресс легаси-заказов

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [w, leg] = await Promise.all([api.workshop(), api.repair().catch(() => null)])
      setData(w)
      setLegacy(leg?.orders ?? [])
      // уровень мастера мог вырасти после ремонтов — синхроним ОС-сессию
      if (w.level && w.level !== useOS.getState().session?.level) {
        useOS.getState().refreshSession({ level: w.level })
      }
      setError(null)
    } catch (e) {
      if (!quiet) setError(e instanceof ApiError ? e.message : 'Не удалось загрузить мастерскую')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toast = (title: string, msg: string) => useOS.getState().pushToast(title, msg)
  const syncBalance = (b: number) => useOS.getState().refreshSession({ balance: b })

  // ── диагностика
  const diagnose = async (item: WorkshopItemDTO) => {
    setBusyKey(`diag:${item.id}`)
    try {
      const res = await api.diagnose(item.id)
      syncBalance(res.balance)
      await load(true)
    } catch (e) {
      toast('Мастерская', e instanceof ApiError ? e.message : 'Диагностика не прошла')
    } finally {
      setBusyKey(null)
    }
  }

  // ── старт наряда (ремонт/установка) → шторка с интро
  const startJob = async (item: WorkshopItemDTO, kind: 'repair' | 'install', partKey?: string) => {
    if (partKey) setBusyKey(`start:${partKey}`)
    else setBusyKey(`start:${item.id}`)
    try {
      const res = await api.jobStart({ itemId: item.id, kind, partKey })
      syncBalance(res.balance)
      originCondRef.current = item.condition
      setJob(res.job)
      setJobPhase('intro')
      setGameScore(0)
      setResult(null)
      await load(true)
    } catch (e) {
      toast('Мастерская', e instanceof ApiError ? e.message : 'Не удалось начать работу')
    } finally {
      setBusyKey(null)
    }
  }

  // ── продолжение незавершённого наряда
  const resumeJob = (item: WorkshopItemDTO) => {
    const aj = item.activeJob
    if (!aj) return
    originCondRef.current = item.condition
    setJob({
      jobId: aj.id,
      kind: aj.kind,
      game: gameOf(aj.game),
      difficulty: aj.difficulty,
      itemTitle: item.title,
      itemImage: item.image,
      partKey: aj.partKey,
      partTitle: aj.partKey ? partById(aj.partKey)?.title ?? null : null,
      cost: aj.cost,
      warranty: false,
      hasTool: aj.hasTool,
    })
    setJobPhase('intro')
    setGameScore(0)
    setResult(null)
  }

  // ── отмена наряда (возврат денег делает сервер)
  const cancelJob = async () => {
    if (!job) return
    try {
      const res = await api.jobCancel(job.jobId)
      syncBalance(res.balance)
      toast('Мастерская', 'Работа отменена — деньги вернулись')
    } catch (e) {
      toast('Мастерская', e instanceof ApiError ? e.message : 'Не удалось отменить')
    }
    setJob(null)
    await load(true)
  }

  // ── финал мини-игры: стабильно для компонентов игр (ref синхронизируется эффектом)
  const finishRef = useRef<(s: number) => void>(() => {})
  const onGameFinish = useCallback((s: number) => {
    setGameScore(s)
    setJobPhase('result')
    setResultLoading(true)
    finishRef.current(s)
  }, [])
  useEffect(() => {
    finishRef.current = async (s: number) => {
      if (!job) return
      try {
        const res = await api.jobFinish(job.jobId, s)
        setResult(res)
        if (res.success) sound.success()
        else sound.pop()
        // обновляем в любом случае: после неудачи надо убрать активный наряд
        // и показать гарантию на переделку
        void load(true)
      } catch (e) {
        toast('Мастерская', e instanceof ApiError ? e.message : 'Не удалось принять работу')
        setJob(null)
      } finally {
        setResultLoading(false)
      }
    }
  }, [job, load])

  // ── склад: покупка/продажа/установка
  const buyPart = async (partKey: string, used: boolean) => {
    setBusyKey(`buy:${partKey}:${used ? 'used' : 'new'}`)
    try {
      const res = await api.partBuy(partKey, used)
      syncBalance(res.balance)
      setData((d) => (d ? { ...d, stock: res.stock } : d))
    } catch (e) {
      toast('Мастерская', e instanceof ApiError ? e.message : 'Поставщик не ответил')
    } finally {
      setBusyKey(null)
    }
  }

  const sellPart = async (partKey: string) => {
    setBusyKey(`sell:${partKey}`)
    try {
      const res = await api.partSell(partKey)
      syncBalance(res.balance)
      setData((d) => (d ? { ...d, stock: res.stock } : d))
    } catch (e) {
      toast('Мастерская', e instanceof ApiError ? e.message : 'Не удалось продать')
    } finally {
      setBusyKey(null)
    }
  }

  const buyTool = async (toolKey: string) => {
    setBusyKey(`tool:${toolKey}`)
    try {
      const res = await api.toolBuy(toolKey)
      syncBalance(res.balance)
      setData((d) => (d ? { ...d, tools: res.tools } : d))
      toast('Мастерская', 'Инструмент готов к работе')
    } catch (e) {
      toast('Мастерская', e instanceof ApiError ? e.message : 'Инструмент не куплен')
    } finally {
      setBusyKey(null)
    }
  }

  // ── легаси: забрать у наёмного мастера
  const pickupLegacy = async (o: RepairOrderDTO) => {
    setBusyKey(`pickup:${o.id}`)
    try {
      await api.repairPickup(o.id)
      toast('Мастерская', `«${o.itemTitle}» забран из ремонта`)
      await load(true)
    } catch (e) {
      toast('Мастерская', e instanceof ApiError ? e.message : 'Не удалось забрать')
    } finally {
      setBusyKey(null)
    }
  }

  // ── производные списки
  const items = data?.items ?? []
  const ctxItem = items.find((i) => i.id === ctxItemId) ?? null
  const needRepair = items.filter((i) => nextCondition(i.condition) !== null)
  const perfect = items.filter((i) => nextCondition(i.condition) === null)
  const stockMap = useMemo(() => {
    const m = new Map<string, StockDTO>()
    ;(data?.stock ?? []).forEach((s) => m.set(s.partKey, s))
    return m
  }, [data?.stock])
  const stockTotal = useMemo(() => [...stockMap.values()].reduce((a, s) => a + s.qty, 0), [stockMap])
  const level = data?.level ?? session?.level ?? 1
  const discount = data?.workDiscount ?? 0

  const openPartsFor = (item: WorkshopItemDTO) => {
    setCtxItemId(item.id)
    setTab('parts')
  }

  const stockOf = (key: string) => stockMap.get(key)?.qty ?? 0

  // совместимость для выбранной вещи
  const fitFor = useCallback(
    (part: Part): { fit: boolean | null; reason?: string } => {
      if (!ctxItem) return { fit: null }
      const r = canFit(part, { itemKey: ctxItem.itemKey, category: ctxItem.category }, {
        installedPartKeys: ctxItem.installedParts.map((p) => p.partKey),
      })
      return { fit: r.ok, reason: r.reason }
    },
    [ctxItem],
  )

  const supplierParts = useMemo(() => {
    const list = PARTS_BY_GROUP[group] ?? []
    if (!ctxItem) return list
    return [...list].sort((a, b) => {
      const fa = fitFor(a)
      const fb = fitFor(b)
      const sa = (fa.fit ? 0 : 1) - (fb.fit ? 0 : 1)
      if (sa !== 0) return sa
      return a.price - b.price
    })
  }, [group, ctxItem, fitFor])

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'workshop', label: 'Мастерская', badge: needRepair.length },
    { key: 'parts', label: 'Запчасти', badge: stockTotal },
    { key: 'tools', label: 'Инструмент' },
  ]

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#F5F6F8] text-[#17181A]">
      {/* шапка */}
      <div className="shrink-0 px-4 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-bold leading-tight">Мастерская</div>
            <div className="mt-0.5 text-[12px] text-[#9AA0A8]">
              Ур. {level}{discount > 0 ? ` · скидка ${Math.round(discount * 100)}% на работу` : ''}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end rounded-[14px] bg-white px-3 py-1.5 shadow-[0_2px_10px_rgba(23,24,26,0.05)]">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-[#9AA0A8]">Баланс</span>
            <span className="text-[13px] font-bold tabular-nums">{fmtMoney(session?.balance ?? 0)}</span>
          </div>
        </div>

        {/* вкладки */}
        <div className="mt-3 flex rounded-full bg-[#EBEDF1] p-1" role="tablist" aria-label="Разделы мастерской">
          {tabs.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={
                  'relative flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition ' +
                  (active ? 'bg-white text-[#17181A] shadow-[0_1px_6px_rgba(23,24,26,0.10)]' : 'text-[#8A8F98]')
                }
              >
                {t.label}
                {typeof t.badge === 'number' && t.badge > 0 && (
                  <span className={
                    'rounded-full px-1.5 text-[10px] font-bold tabular-nums ' +
                    (active ? 'bg-[#FFD53D] text-[#231A02]' : 'bg-[#DDDFE4] text-[#5F6368]')
                  }>{t.badge}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* контент */}
      <div className="nice-scroll flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-2 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
            <div className="h-40 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
            <div className="h-40 animate-pulse rounded-[20px] bg-[#EBEDF2]" />
          </div>
        ) : error && !data ? (
          <div className="rounded-[20px] bg-white p-6 text-center shadow-[0_2px_14px_rgba(23,24,26,0.05)]">
            <p className="text-sm text-[#D14343]">{error}</p>
            <PillButton className="mt-4" onClick={() => void load()}>Повторить</PillButton>
          </div>
        ) : data ? (
          <>
            {/* ─── Мастерская ─── */}
            {tab === 'workshop' && (
              <>
                {legacy.length > 0 && (
                  <section>
                    <SectionTitle>У наёмного мастера</SectionTitle>
                    <div className={CARD + ' mt-2 divide-y divide-[#17181A]/[0.05] px-4'}>
                      {legacy.map((o) => {
                        const start = new Date(o.startedAt).getTime()
                        const total = Math.max(1000, new Date(o.readyAt).getTime() - start)
                        const pct = o.status === 'ready' ? 100 : Math.min(100, Math.round(((Date.now() - start) / total) * 100))
                        return (
                          <div key={o.id} className="flex items-center gap-3 py-3">
                            <img src={o.itemImage} alt="" className="size-10 shrink-0 rounded-xl object-cover" loading="lazy" decoding="async" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold">{o.itemTitle}</div>
                              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#F0F1F5]">
                                <div className="h-full rounded-full bg-[#17181A] transition-[width] duration-1000" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            {o.status === 'ready' && (
                              <PillButton variant="yellow" className="h-9 px-3.5 text-[12px]" busy={busyKey === `pickup:${o.id}`} onClick={() => void pickupLegacy(o)}>
                                Забрать
                              </PillButton>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                <section className="flex flex-col gap-3">
                  <SectionTitle count={needRepair.length}>Нуждается в ремонте</SectionTitle>
                  {needRepair.length === 0 ? (
                    <EmptyState image="/img/empty/repair.webp" title="Всё в отличном состоянии" sub="Покупайте с состоянием хуже — ремонт поднимает цену" />
                  ) : (
                    needRepair.map((it) => (
                      <ItemCard
                        key={it.id} item={it} level={level} stockOf={stockOf}
                        onStart={(...a) => void startJob(...a)}
                        onDiagnose={(...a) => void diagnose(...a)}
                        onResume={resumeJob}
                        onPickParts={openPartsFor}
                        busyKey={busyKey}
                      />
                    ))
                  )}
                </section>

                {perfect.length > 0 && (
                  <section>
                    <SectionTitle count={perfect.length}>Отличное состояние</SectionTitle>
                    <div className={CARD + ' mt-2 divide-y divide-[#17181A]/[0.05] px-4'}>
                      {perfect.map((it) => (
                        <button key={it.id} type="button" onClick={() => openPartsFor(it)} className="flex w-full items-center gap-3 py-2.5 text-left transition active:opacity-70">
                          <img src={it.image} alt="" className="size-10 shrink-0 rounded-xl object-cover" loading="lazy" decoding="async" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] font-medium">{it.title}</div>
                            <div className="text-[11px] text-[#9AA0A8]">можно улучшить запчастью</div>
                          </div>
                          <Package className="size-4 shrink-0 text-[#9AA0A8]" aria-hidden />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* ─── Запчасти ─── */}
            {tab === 'parts' && (
              <>
                {ctxItem && (
                  <div className="flex items-center gap-2 rounded-[16px] bg-[#17181A] px-4 py-3 text-white">
                    <img src={ctxItem.image} alt="" className="size-8 rounded-lg object-cover" loading="lazy" decoding="async" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">Совместимость для</div>
                      <div className="truncate text-[13px] font-semibold">{ctxItem.title}</div>
                    </div>
                    <button
                      type="button" onClick={() => setCtxItemId(null)} aria-label="Убрать контекст"
                      className="flex size-8 items-center justify-center rounded-full bg-white/10 transition active:scale-90"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                )}

                <section>
                  <SectionTitle count={stockTotal}>Склад</SectionTitle>
                  {stockTotal === 0 ? (
                    <div className={CARD + ' mt-2 px-4 py-5 text-center text-[12.5px] text-[#9AA0A8]'}>
                      Пусто — закупите детали у поставщика
                    </div>
                  ) : (
                    <div className={CARD + ' mt-2 divide-y divide-[#17181A]/[0.05] px-4'}>
                      {[...stockMap.values()]
                        .sort((a, b) => (partById(a.partKey)?.title ?? '').localeCompare(partById(b.partKey)?.title ?? ''))
                        .map((s) => (
                          <StockRow
                            key={s.partKey} stock={s} part={partById(s.partKey)} fit={fitFor(partById(s.partKey)!).fit}
                            busyKey={busyKey}
                            onSell={() => void sellPart(s.partKey)}
                            onInstall={
                              ctxItem && fitFor(partById(s.partKey)!).fit
                                ? () => {
                                    const item = ctxItem
                                    void startJob(item, 'install', s.partKey)
                                  }
                                : null
                            }
                          />
                        ))}
                    </div>
                  )}
                </section>

                <section>
                  <SectionTitle>Поставщик</SectionTitle>
                  <div className="nice-scroll mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {PART_GROUPS.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setGroup(g.key)}
                        className={
                          'h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-bold transition active:scale-[0.97] ' +
                          (group === g.key ? 'bg-[#17181A] text-white' : 'bg-white text-[#5F6368] shadow-[0_1px_6px_rgba(23,24,26,0.06)]')
                        }
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  {ctxItem && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#9AA0A8]">
                      <span className="size-1.5 rounded-full" style={{ background: GREEN }} aria-hidden />
                      подходит · <span className="size-1.5 rounded-full" style={{ background: RED }} aria-hidden /> не встал — тапни, покажу причину
                    </div>
                  )}
                  <div className="mt-2 flex flex-col gap-2">
                    {supplierParts.map((p) => {
                      const { fit, reason } = fitFor(p)
                      const stockQty = stockOf(p.key)
                      const installable =
                        ctxItem != null &&
                        fit === true &&
                        stockQty > 0 &&
                        !ctxItem.activeJob &&
                        stockMap.get(p.key) != null
                      return (
                        <PartRow
                          key={p.key} part={p} stockQty={stockQty}
                          fit={fit} reason={reason} contextMode={Boolean(ctxItem)}
                          busyKey={busyKey}
                          onBuyNew={() => void buyPart(p.key, false)}
                          onBuyUsed={() => void buyPart(p.key, true)}
                          onInstall={installable ? () => void startJob(ctxItem!, 'install', p.key) : null}
                        />
                      )
                    })}
                  </div>
                </section>
              </>
            )}

            {/* ─── Инструмент ─── */}
            {tab === 'tools' && (
              <section>
                <SectionTitle>Инструмент мастера</SectionTitle>
                <p className="mt-1 text-[12px] text-[#9AA0A8]">Без своего инструмента мини-игра сложнее на ступень</p>
                <div className="mt-2 flex flex-col gap-2">
                  {(data.tools ?? []).map((t) => {
                    const alive = t.durability > 0
                    return (
                      <div key={t.key} className={CARD + ' p-4'}>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[14.5px] font-semibold">{t.title}</div>
                            <div className="mt-0.5 text-[12px] text-[#9AA0A8]">{t.hint} · {GAME_INFO[t.game as GameKey]?.title}</div>
                          </div>
                          {alive ? (
                            <Chip tone="green">{t.durability} исп.</Chip>
                          ) : (
                            <PillButton className="h-9 px-4 text-[12.5px]" busy={busyKey === `tool:${t.key}`} onClick={() => void buyTool(t.key)}>
                              {fmtMoney(t.price)}
                            </PillButton>
                          )}
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F1F5]">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{ width: `${Math.round((t.durability / t.uses) * 100)}%`, backgroundColor: alive ? GREEN : '#D8DBE0' }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold tabular-nums text-[#9AA0A8]">{t.durability}/{t.uses}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>

      {/* шторка наряда: интро → мини-игра → результат */}
      <AnimatePresence>
        {job && (
          <JobOverlay
            job={job}
            phase={jobPhase}
            score={gameScore}
            result={result}
            resultLoading={resultLoading}
            originCond={originCondRef.current}
            onStart={() => setJobPhase('play')}
            onCancel={() => void cancelJob()}
            onClose={() => setJob(null)}
            onFinishGame={onGameFinish}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
