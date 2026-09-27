'use client'

// Презентационный слой приложения «Банк» (редизайн по макету 08-bank.png).
// Здесь живут дизайн-токены, чистые функции над DTO (категории, схлопывание
// операций, даты) и все визуальные примитивы: тёмно-зелёная карта VISA,
// быстрые действия, строка операции, доначное кольцо на чистом SVG,
// цифровая клавиатура, нижний лист и примитивы кредитного центра.
// Файл намеренно без api и стора: только внешний вид.

import type { ReactNode } from 'react'
import {
  AlertTriangle, ArrowLeftRight, Banknote, Delete, FileText, Landmark, Percent, PiggyBank,
  Receipt, Send, ShoppingBag, TrendingUp, Undo2, X, type LucideIcon,
} from 'lucide-react'
import { fmtMoney, fmtTime } from '@/lib/format'
import { TX_TYPE_LABEL } from '@/lib/types'
import type { LoanHistoryItem, TransactionDTO } from '@/lib/types'

// ---- Дизайн-токены макета ----
export const GREEN = '#0E7A3D'
export const CARD_CLS =
  'rounded-[20px] bg-[#FFFFFF] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
export const CAPS = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40'

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

// Дата «день месяц» для договоров и графиков
export function fmtDayMonth(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

// ---- Цвета и иконки категорий операций ----
export const TX_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  purchase: { label: 'Покупки', color: '#E5584B', icon: ShoppingBag },
  sale: { label: 'Продажи', color: GREEN, icon: TrendingUp },
  loan: { label: 'Кредиты', color: '#7B61FF', icon: Landmark },
  repay: { label: 'Погашение кредита', color: '#7B61FF', icon: Undo2 },
  tax: { label: 'Налоги', color: '#E5584B', icon: Receipt },
  penalty: { label: 'Пени налоговой', color: '#E5584B', icon: AlertTriangle },
  deposit: { label: 'Пополнение вклада', color: GREEN, icon: PiggyBank },
  withdraw: { label: 'Снятие вклада', color: '#F8A13A', icon: Banknote },
  interest: { label: 'Проценты по вкладу', color: GREEN, icon: Percent },
  boost: { label: 'Продвижение', color: '#F8A13A', icon: TrendingUp },
  transfer: { label: 'Переводы', color: '#12A594', icon: Send },
}
const FALLBACK_COLORS = ['#E5584B', GREEN, '#7B61FF', '#F8A13A', '#12A594', '#9CA3AF']

export function txMeta(t: TransactionDTO): { label: string; color: string; icon: LucideIcon } {
  const meta = TX_META[t.type]
  if (meta) return meta
  // Неизвестный тип: группируем по первому слову назначения платежа
  const word = (t.note ?? '').trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}%-]/gu, '') || t.type
  let h = 0
  for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0
  const label = word.charAt(0).toUpperCase() + word.slice(1)
  return { label, color: FALLBACK_COLORS[h % FALLBACK_COLORS.length], icon: ArrowLeftRight }
}

// ---- Агрегация операций для аналитики ----
export interface AggCat {
  key: string
  label: string
  color: string
  icon: LucideIcon
  total: number
  count: number
}

export function buildCats(txs: TransactionDTO[], mode: 'out' | 'in'): AggCat[] {
  const map = new Map<string, AggCat>()
  for (const t of txs) {
    if (mode === 'out' ? t.amount >= 0 : t.amount <= 0) continue
    const { label, color, icon } = txMeta(t)
    const key = label.toLowerCase()
    const cur = map.get(key) ?? { key, label, color, icon, total: 0, count: 0 }
    cur.total += Math.abs(t.amount)
    cur.count += 1
    map.set(key, cur)
  }
  const arr = [...map.values()].sort((a, b) => b.total - a.total)
  if (arr.length > 6) {
    const rest = arr.slice(6)
    const other: AggCat = {
      key: '__other',
      label: 'Прочее',
      color: '#9CA3AF',
      icon: ArrowLeftRight,
      total: rest.reduce((s, c) => s + c.total, 0),
      count: rest.reduce((s, c) => s + c.count, 0),
    }
    return [...arr.slice(0, 6), other]
  }
  return arr
}

// ---- Схлопывание подряд идущих одинаковых операций (×N) ----
export interface MergedTx {
  tx: TransactionDTO
  count: number
  total: number
}

// История приходит отсортированной по дате desc; соседние операции с одинаковыми
// (type, amount, counterpartyName, note) превращаем в одну строку с множителем,
// чтобы повторяющиеся операции не заполняли весь список.
export function mergeTxs(txs: TransactionDTO[]): MergedTx[] {
  const out: MergedTx[] = []
  for (const t of txs) {
    const last = out[out.length - 1]
    if (
      last &&
      last.tx.type === t.type &&
      last.tx.amount === t.amount &&
      (last.tx.counterpartyName ?? null) === (t.counterpartyName ?? null) &&
      (last.tx.note ?? null) === (t.note ?? null)
    ) {
      last.count += 1
      last.total += t.amount
    } else {
      out.push({ tx: t, count: 1, total: t.amount })
    }
  }
  return out
}

// ---- Примитивы ----

// Переключатель (светлый, зелёный в включённом состоянии)
export function Toggle({ checked, onCheckedChange, label }: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full outline-none transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-[#0E7A3D]/50 ${checked ? 'bg-[#0E7A3D]' : 'bg-black/[0.14]'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0.5 size-5 rounded-full bg-[#FFFFFF] shadow transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90 ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

// Сегмент-контрол (перевод: получатель; аналитика: расходы/доходы)
export function Segment<T extends string>({ value, onChange, options, ariaLabel }: {
  value: T
  onChange: (v: T) => void
  options: { key: T; label: string }[]
  ariaLabel: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex rounded-full bg-black/[0.05] p-1">
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`h-9 flex-1 rounded-full text-[13px] transition active:scale-[0.98] ${
              active
                ? 'bg-[#0E7A3D] font-semibold text-white shadow-[0_1px_3px_rgba(14,122,61,0.35)]'
                : 'font-medium text-[#6B7280]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Чип-фильтр истории (Все / Поступления / Списания)
export function Chip({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-9 items-center rounded-full px-4 text-[13px] transition active:scale-[0.98] ${
        active
          ? 'bg-[#0E7A3D] font-semibold text-white shadow-[0_1px_3px_rgba(14,122,61,0.35)]'
          : `${CARD_CLS} font-medium text-[#141414]`
      }`}
    >
      {children}
    </button>
  )
}

// Точки-страницы карусели карт
export function PageDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-[#141414]' : 'w-1.5 bg-black/15'}`}
        />
      ))}
    </div>
  )
}

// Банковская карта: тёмно-зелёный градиент, «Банк» + VISA, крупный баланс,
// маскированный номер и название продукта внизу (как на главном экране макета)
export function BankCard({ label, amount, masked, holder, onClick, aria }: {
  label: string
  amount: string
  masked: string
  holder: string
  onClick: () => void
  aria: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="relative h-[172px] w-[86%] shrink-0 snap-center overflow-hidden rounded-[22px] p-5 text-left text-white transition active:scale-[0.99]"
      style={{ background: 'linear-gradient(135deg, #0B5C2E 0%, #0A3D20 100%)' }}
    >
      <span className="absolute -right-10 -top-14 size-44 rounded-full bg-white/[0.08]" aria-hidden="true" />
      <span className="absolute -bottom-20 -left-12 size-48 rounded-full bg-white/[0.06]" aria-hidden="true" />
      <span className="absolute right-6 top-10 size-24 rounded-full bg-white/[0.05]" aria-hidden="true" />
      <span className="relative flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-white/15" aria-hidden="true">
            <Landmark className="size-3.5" />
          </span>
          <span className="text-[12px] font-semibold tracking-wide">Банк</span>
        </span>
        <span className="text-[15px] font-extrabold italic tracking-tight">VISA</span>
      </span>
      <span className="relative mt-5 block">
        <span className="block text-[11px] text-white/70">{label}</span>
        <span className="value-pop block text-[26px] font-bold leading-tight tabular-nums">{amount}</span>
      </span>
      <span className="absolute inset-x-5 bottom-4 flex items-end justify-between">
        <span className="min-w-0">
          <span className="block text-[13px] font-medium tabular-nums tracking-[0.2em]">{masked}</span>
          <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.12em] text-white/70">{holder}</span>
        </span>
        <span className="flex shrink-0 gap-1 pb-1" aria-hidden="true">
          <span className="size-1 rounded-full bg-white/80" />
          <span className="size-1 rounded-full bg-white/80" />
          <span className="size-1 rounded-full bg-white/80" />
        </span>
      </span>
    </button>
  )
}

// Круглая карточка-действие (Перевести / Пополнить / Оплатить / По QR)
export function QuickAction({ icon: Icon, label, onClick, aria }: {
  icon: LucideIcon
  label: string
  onClick: () => void
  aria: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className={`${CARD_CLS} flex min-h-[88px] flex-col items-center justify-center gap-2 px-1 py-3 transition active:scale-[0.98]`}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-[#0E7A3D]" aria-hidden="true">
        <Icon className="size-5 text-white" strokeWidth={2.1} />
      </span>
      <span className="text-[11px] font-medium leading-none text-[#141414]">{label}</span>
    </button>
  )
}

// Строка операции: цветной кружок с иконкой, название + категория,
// справа сумма (+ зелёная / − чёрная) и время
export function TxRow({ m }: { m: MergedTx }) {
  const { tx: t, count, total } = m
  const { icon: Icon, color } = txMeta(t)
  const positive = total >= 0
  return (
    <div className="flex min-h-[60px] items-center gap-3 py-2.5">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <Icon className="size-[18px] text-white" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[15px] font-semibold text-[#141414]">
            {TX_TYPE_LABEL[t.type] ?? t.type}
          </span>
          {count > 1 && (
            <span className="shrink-0 rounded-full bg-[#0E7A3D]/10 px-2 text-[11px] font-bold leading-5 text-[#0E7A3D]">
              ×{count}
            </span>
          )}
        </div>
        <div className="truncate text-[12px] text-[#9CA3AF]">{t.counterpartyName ?? t.note ?? 'Операция'}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-[15px] font-bold tabular-nums ${positive ? 'text-[#0E7A3D]' : 'text-[#141414]'}`}>
          {positive ? '+' : ''}
          {fmtMoney(total)}
        </div>
        <div className="text-[11px] tabular-nums text-[#9CA3AF]" suppressHydrationWarning>
          {count > 1 ? `${fmtTime(t.createdAt)} · ×${count} ${fmtMoney(t.amount)}` : fmtTime(t.createdAt)}
        </div>
      </div>
    </div>
  )
}

// Плитка сервиса в нижнем листе
export function SheetTile({ icon: Icon, label, color, onClick }: {
  icon: LucideIcon
  label: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2.5 rounded-2xl bg-[#F6F7F9] p-3.5 text-left transition active:scale-[0.98]"
    >
      <span
        className="flex size-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1A`, color }}
        aria-hidden="true"
      >
        <Icon className="size-5" strokeWidth={2.1} />
      </span>
      <span className="text-[13px] font-semibold leading-tight text-[#141414]">{label}</span>
    </button>
  )
}

// Плитка раздела «Платежи» (сетка 2 колонки)
export function ServiceTile({ icon: Icon, color, label, sub, onClick, aria }: {
  icon: LucideIcon
  color: string
  label: string
  sub: string
  onClick: () => void
  aria: string
}) {
  return (
    <button type="button" onClick={onClick} aria-label={aria} className={`${CARD_CLS} p-3.5 text-left transition active:scale-[0.98]`}>
      <span
        className="flex size-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1A`, color }}
        aria-hidden="true"
      >
        <Icon className="size-5" strokeWidth={2.1} />
      </span>
      <span className="mt-2.5 block text-[13.5px] font-bold text-[#141414]">{label}</span>
      <span className="block text-[11px] text-[#9CA3AF]">{sub}</span>
    </button>
  )
}

// Нижний лист (bottom sheet) — светлый
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        className="relative max-h-[82%] overflow-y-auto rounded-t-[24px] bg-[#FFFFFF] px-5 pb-7 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.18)] [scrollbar-width:thin]"
        style={{ animation: 'sheet-up 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/10" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-bold tracking-tight text-[#141414]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-8 items-center justify-center rounded-full bg-[#F6F7F9] text-[#9CA3AF] transition active:scale-95"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Строка «ключ: значение» в договорах и анкетах
export function InfoRow({ k, v, vCls = 'text-[#141414]' }: { k: string; v: string; vCls?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-[13px] text-[#9CA3AF]">{k}</span>
      <span className={`min-w-0 truncate text-right text-[13px] font-semibold tabular-nums ${vCls}`}>{v}</span>
    </div>
  )
}

// Доначное кольцо аналитики: чистый SVG, сегменты через stroke-dasharray
export function Donut({ segs, total, centerLabel }: {
  segs: { key: string; color: string; frac: number; offset: number }[]
  total: string
  centerLabel: string
}) {
  const R = 62
  const CIRC = 2 * Math.PI * R
  return (
    <div className="relative size-[176px]">
      <svg viewBox="0 0 160 160" className="size-full" role="img" aria-label={`${centerLabel}: ${total} по категориям`}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="#ECEFEE" strokeWidth={18} />
        {segs.map((s) => (
          <circle
            key={s.key}
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={18}
            strokeDasharray={`${Math.max(0, s.frac * CIRC - 2)} ${CIRC}`}
            strokeDashoffset={-s.offset * CIRC}
            transform="rotate(-90 80 80)"
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-bold tabular-nums text-[#141414]">{total}</span>
        <span className="mt-0.5 text-[12px] text-[#9CA3AF]">{centerLabel}</span>
      </div>
    </div>
  )
}

// Строка категории в аналитике: цветной кружок, название, сумма и процент
export function CategoryRow({ icon: Icon, color, label, count, total, pct }: {
  icon: LucideIcon
  color: string
  label: string
  count: number
  total: number
  pct: number
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <Icon className="size-[18px] text-white" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-[#141414]">{label}</div>
        <div className="text-[12px] text-[#9CA3AF]">
          {count} {plural(count, 'операция', 'операции', 'операций')}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-bold tabular-nums text-[#141414]">{fmtMoney(total)}</div>
        <div className="text-[12px] tabular-nums text-[#9CA3AF]">{pct}%</div>
      </div>
    </div>
  )
}

// Цифровая клавиатура 3x4 (1-9, 0, backspace; запятая показана, но суммы целые)
export function Numpad({ onKey }: { onKey: (k: 'digit' | 'back', v?: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'] as const
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Цифровая клавиатура">
      {keys.map((k) => {
        const isComma = k === ','
        return (
          <button
            key={k}
            type="button"
            disabled={isComma}
            aria-label={isComma ? 'Запятая недоступна: сумма в рублях' : `Цифра ${k}`}
            onClick={() => { if (!isComma) onKey('digit', k) }}
            className={`flex h-12 items-center justify-center rounded-2xl bg-[#FFFFFF] text-[22px] font-semibold ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition active:scale-[0.98] ${
              isComma ? 'text-[#C4C7CD]' : 'text-[#141414]'
            }`}
          >
            {k}
          </button>
        )
      })}
      <button
        type="button"
        aria-label="Удалить цифру"
        onClick={() => onKey('back')}
        className="flex h-12 items-center justify-center rounded-2xl bg-[#FFFFFF] text-[#141414] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition active:scale-[0.98]"
      >
        <Delete className="size-5 text-[#6B7280]" aria-hidden="true" />
      </button>
    </div>
  )
}

// Шкала кредитного рейтинга: полукруг со секторами и стрелкой
export function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, (score - 300) / 550))
  const angle = -90 + pct * 180
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 86" className="w-full max-w-[220px]" role="img" aria-label={`Кредитный рейтинг ${score} из 850`}>
        <path d="M 18 74 A 52 52 0 0 1 122 74" fill="none" stroke="#ECEFEE" strokeWidth={11} strokeLinecap="round" />
        <path d="M 18 74 A 52 52 0 0 1 122 74" fill="none" stroke="#E5584B" strokeWidth={11} pathLength={100} strokeDasharray="33 100" opacity={0.85} />
        <path d="M 18 74 A 52 52 0 0 1 122 74" fill="none" stroke="#F8A13A" strokeWidth={11} pathLength={100} strokeDasharray="25 100" strokeDashoffset={-33} opacity={0.85} />
        <path d="M 18 74 A 52 52 0 0 1 122 74" fill="none" stroke={GREEN} strokeWidth={11} pathLength={100} strokeDasharray="42 100" strokeDashoffset={-58} opacity={0.85} />
        <line
          x1="70" y1="74" x2="70" y2="32"
          stroke="#141414" strokeWidth={3.5} strokeLinecap="round"
          transform={`rotate(${angle} 70 74)`}
        />
        <circle cx="70" cy="74" r="5" fill="#141414" />
      </svg>
      <div className="-mt-8 text-center">
        <div className="text-[26px] font-extrabold leading-none tabular-nums text-[#141414]">{score}</div>
        <div className="mt-1 text-[10.5px] tabular-nums text-[#9CA3AF]">
          <span className="mr-3">300</span>
          <span>850</span>
        </div>
      </div>
    </div>
  )
}

// Пилюля статуса договора в кредитной истории
export function LoanStatusChip({ status }: { status: string }) {
  if (status === 'repaid') {
    return <span className="shrink-0 rounded-full bg-[#E7F5EA] px-2.5 py-1 text-[11px] font-semibold text-[#0A5C2E]">Погашен</span>
  }
  if (status === 'overdue') {
    return <span className="shrink-0 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-[11px] font-semibold text-[#E5584B]">Просрочен</span>
  }
  return <span className="shrink-0 rounded-full bg-[#FFF4DC] px-2.5 py-1 text-[11px] font-semibold text-[#B25E09]">Активен</span>
}

// Раздел «Кредитная история» (данные /api/bank/loans приходят из BankApp)
export function CreditHistorySection({ items }: { items: LoanHistoryItem[] | null }) {
  return (
    <div className="mt-5 space-y-2">
      <div className={`${CAPS} px-1 pb-2`}>Кредитная история</div>
      <div className={`${CARD_CLS} px-4 py-1`}>
        {items === null ? (
          <div className="space-y-2 py-3">
            <div className="h-9 animate-pulse rounded-xl bg-black/[0.05]" />
            <div className="h-9 animate-pulse rounded-xl bg-black/[0.05]" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-3 text-[12.5px] text-[#9CA3AF]">
            Кредитная история пуста. Первый закрытый вовремя кредит повысит рейтинг и лимит.
          </div>
        ) : (
          <div className="divide-y divide-[#F0F1F5]">
            {items.map((l) => {
              const c = l.status === 'repaid' ? GREEN : l.status === 'overdue' ? '#E5584B' : '#F8A13A'
              return (
                <div key={l.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${c}1A`, color: c }}
                    aria-hidden="true"
                  >
                    <FileText className="size-4" strokeWidth={2.1} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-[#141414]">Кредит · {fmtMoney(l.principal)}</div>
                    <div className="text-[11px] tabular-nums text-[#9CA3AF]" suppressHydrationWarning>
                      от {fmtDayMonth(new Date(l.takenAt))} · {l.rate}% · {l.status === 'repaid' ? `закрыт ${l.repaidAt ? fmtDayMonth(new Date(l.repaidAt)) : ''}` : l.status === 'overdue' ? 'просрочен' : 'активен'}
                    </div>
                  </div>
                  <LoanStatusChip status={l.status} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
