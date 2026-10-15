'use client'

// Вкладка «Номера»: выбивание номеров как в GTA5 RP.
// Платная прокрутка → случайный номер по региону; обычный входит в цену,
// красивый (silver+) ставится на бронь 48ч с ценой выкупа — можно накопить.

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgeCheck,
  Dices,
  Hourglass,
  Info,
  PhoneOff,
  Timer,
} from 'lucide-react'
import { REGIONS, reserveSecondsLeft } from '@/lib/phone'
import { fmtMoney } from '@/lib/format'
import { sound } from '@/lib/sound'
import type { PhoneApi } from './use-phone'
import {
  fmtCountdown,
  tierMeta,
  useTick,
  type PhoneDTO,
  type RollResponse,
} from './shared'

interface Props {
  phone: PhoneApi
  toast: (title: string, body: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Активен',
  reserved: 'В брони',
  released: 'Отпущен',
}

/* ───────────────────────────── Бейдж тира ────────────────────────────────── */

export function TierBadge({ tier, size = 'sm' }: { tier: string; size?: 'sm' | 'lg' }) {
  const meta = tierMeta(tier)
  const Icon = meta.icon
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full font-medium ' +
        (size === 'lg' ? 'px-2.5 py-1 text-[12px]' : 'px-2 py-0.5 text-[10.5px]')
      }
      style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
    >
      <Icon className={size === 'lg' ? 'size-3.5' : 'size-3'} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

/* ─────────────────────────── Шкала красоты ───────────────────────────────── */

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(4, score)}%`,
            background: 'linear-gradient(90deg,#5a6a61,#C0C0C0,#FFD53D,#B9F2FF)',
          }}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-white/50">{score}/100</span>
    </div>
  )
}

/* ────────────────────────── Карточка брони ───────────────────────────────── */

function ReserveCard({
  p,
  busy,
  onBuy,
  onRelease,
}: {
  p: PhoneDTO
  busy: boolean
  onBuy: (p: PhoneDTO) => void
  onRelease: (p: PhoneDTO) => void
}) {
  const tick = useTick()
  const left = reserveSecondsLeft(p.holdUntil)

  // Бронь истекла — тихо обновляем данные (карточка уйдёт после refresh)
  const expired = left <= 0
  if (expired) return null

  const meta = tierMeta(p.tier)
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: `${meta.color}55`, backgroundColor: `${meta.color}0d` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[17px] font-semibold tabular-nums text-white">{p.number}</span>
        <TierBadge tier={p.tier} />
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-300/90">
        <Timer className="size-3.5" aria-hidden="true" />
        Держим за вами ещё{' '}
        <span className="font-semibold tabular-nums">{fmtCountdown(left)}</span>
      </div>
      <div className="mt-3">
        <ScoreBar score={p.beautyScore} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onBuy(p)}
          disabled={busy}
          className="h-10 flex-1 rounded-xl bg-[#22C55E] text-[13.5px] font-semibold text-[#052E16] transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          Выкупить · {fmtMoney(p.buyPrice)}
        </button>
        <button
          type="button"
          onClick={() => onRelease(p)}
          disabled={busy}
          aria-label={`Отпустить номер ${p.number}`}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-white/50 transition-transform active:scale-95"
        >
          <PhoneOff className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────── Карточка моей:, активен ─────────────────────────── */

function OwnedCard({
  p,
  busy,
  onSetMain,
  onRelease,
}: {
  p: PhoneDTO
  busy: boolean
  onSetMain: (p: PhoneDTO) => void
  onRelease: (p: PhoneDTO) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSetMain(p)}
      className={
        'w-full rounded-2xl border p-4 text-left transition-colors ' +
        (p.isMain
          ? 'border-emerald-500/40 bg-emerald-500/[0.07]'
          : 'border-white/10 bg-white/[0.03] active:bg-white/[0.06]')
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[17px] font-semibold tabular-nums text-white">{p.number}</span>
        <TierBadge tier={p.tier} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[12px] text-white/45">
        <span>{p.regionName}</span>
        <span>·</span>
        {p.isMain ? (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Основной
          </span>
        ) : (
          <span className="text-white/40">Тап — сделать основным</span>
        )}
      </div>
      {!p.isMain && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-white/30">{STATUS_LABEL[p.status] ?? p.status}</span>
          <span
            role="button"
            tabIndex={0}
            aria-label={`Отпустить номер ${p.number}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onRelease(p)
              }
            }}
            onClick={(e) => {
              e.stopPropagation()
              onRelease(p)
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-red-400/80 active:bg-red-400/10"
          >
            <PhoneOff className="size-3" aria-hidden="true" />
            Отпустить
          </span>
        </div>
      )}
      <div className="mt-2">
        <ScoreBar score={p.beautyScore} />
      </div>
    </button>
  )
}

/* ───────────────────────── Результат прокрутки ───────────────────────────── */

function RollResult({
  roll,
  balance,
  busy,
  onBuy,
  onKeep,
  onSetMain,
}: {
  roll: RollResponse
  balance: number
  busy: boolean
  onBuy: (p: PhoneDTO) => void
  onKeep: () => void
  onSetMain: (p: PhoneDTO) => void
}) {
  const p = roll.phone
  const meta = tierMeta(p.tier)
  const rich = p.tier === 'gold' || p.tier === 'platinum' || p.tier === 'diamond'

  return (
    <motion.div
      key={p.id}
      initial={{ opacity: 0, y: 14, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="rounded-2xl border p-4"
      style={{
        borderColor: `${meta.color}66`,
        backgroundColor: `${meta.color}0f`,
        boxShadow: rich ? `0 0 26px ${meta.color}33` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-white/40">
          Прокрутка · {p.regionName}
        </span>
        <TierBadge tier={p.tier} size="lg" />
      </div>
      <div className="mt-2 text-center text-[24px] font-semibold tabular-nums tracking-wide text-white">
        {p.number}
      </div>
      <div className="mt-3">
        <ScoreBar score={p.beautyScore} />
      </div>

      {roll.activated ? (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-400">
            <BadgeCheck className="size-4" aria-hidden="true" />
            {p.isMain ? 'Номер ваш и уже основной' : 'Номер закреплён за вами'}
          </div>
          {!p.isMain && (
            <button
              type="button"
              onClick={() => onSetMain(p)}
              disabled={busy}
              className="mt-2 h-10 w-full rounded-xl bg-emerald-500/15 text-[13px] font-semibold text-emerald-300 transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              Сделать основным
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-[12.5px] text-amber-300/90">
            <Hourglass className="size-3.5" aria-hidden="true" />
            Красивые номера выкупаются отдельно · бронь {roll.holdHours} ч
          </div>
          <button
            type="button"
            onClick={() => onBuy(p)}
            disabled={busy}
            className={
              'mt-2 h-11 w-full rounded-xl text-[14px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 ' +
              (balance >= p.buyPrice
                ? 'bg-[#FFD53D] text-[#231a02]'
                : 'bg-amber-400/20 text-amber-200')
            }
          >
            {balance >= p.buyPrice
              ? `Забрать сейчас · ${fmtMoney(p.buyPrice)}`
              : `Не хватает ${fmtMoney(p.buyPrice - balance)} — забронирован`}
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="mt-1.5 h-9 w-full rounded-xl text-[13px] text-white/50 transition-colors active:bg-white/[0.04]"
          >
            Подумаю позже (останется в брони)
          </button>
        </div>
      )}
    </motion.div>
  )
}

/* ───────────────────────────── Вкладка целиком ───────────────────────────── */

export default function NumbersTab({ phone, toast }: Props) {
  const [region, setRegion] = useState('msk')
  const [last, setLast] = useState<RollResponse | null>(null)
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)

  const regionMeta = useMemo(() => REGIONS.find((r) => r.id === region) ?? REGIONS[0], [region])

  const history = useMemo(
    () => [...phone.numbers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
    [phone.numbers],
  )

  const doRoll = async () => {
    if (rolling) return
    sound.tap()
    setRolling(true)
    try {
      const res = await phone.roll(regionMeta.id)
      if (res.ok) {
        setLast(res)
        if (res.phone.tier === 'diamond' || res.phone.tier === 'platinum') {
          toast('ДЖЕКПОТ!', `${res.phone.number} — ${tierMeta(res.phone.tier).label}!`)
        }
      } else {
        toast('Телефон', res.error)
      }
    } finally {
      setRolling(false)
    }
  }

  const doBuy = async (p: PhoneDTO) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await phone.buy(p.id)
      if (res.ok) {
        sound.success()
        toast('Номер ваш', `${p.number} закреплён. Потрачено ${fmtMoney(p.buyPrice)}`)
        if (last?.phone.id === p.id) setLast({ ...last, phone: { ...p, status: 'active', buyPrice: 0, isMain: res.mainSet ?? p.isMain }, activated: true })
      } else {
        toast('Не хватило на выкуп', `${res.error}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const doSetMain = async (p: PhoneDTO) => {
    if (busy || p.isMain) return
    sound.tap()
    setBusy(true)
    try {
      const ok = await phone.setMain(p.id)
      if (ok) {
        toast('Основной номер', `${p.number} теперь в профиле и на звонках`)
        if (last?.phone.id === p.id) setLast({ ...last, phone: { ...p, isMain: true }, activated: true })
      } else {
        toast('Телефон', 'Не получилось закрепить номер')
      }
    } finally {
      setBusy(false)
    }
  }

  const doRelease = async (p: PhoneDTO) => {
    if (busy) return
    sound.tap()
    setBusy(true)
    try {
      const ok = await phone.release(p.id)
      if (ok) {
        if (last?.phone.id === p.id) setLast(null)
        toast('Номер отпущен', p.status === 'reserved' ? 'Бронь снята, номер вернулся в пул' : `${p.number} больше не ваш`)
      } else {
        toast('Телефон', 'Не получилось отпустить номер')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      {/* Мой основной номер */}
      {phone.mainNumber && (
        <div className="mb-3 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.12] to-transparent p-4">
          <div className="text-[11px] uppercase tracking-wider text-emerald-300/70">Ваш номер</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums text-white">
            {phone.mainNumber.number}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <TierBadge tier={phone.mainNumber.tier} />
            <span className="text-[12px] text-white/45">{phone.mainNumber.regionName}</span>
          </div>
        </div>
      )}

      {/* Брони с таймером */}
      {phone.reserves.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {phone.reserves.map((r) => (
            <ReserveCard key={r.id} p={r} busy={busy} onBuy={doBuy} onRelease={doRelease} />
          ))}
        </div>
      )}

      {/* Прокрутка */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white">Выбить номер</span>
          <span className="text-[12px] tabular-nums text-white/45">
            Баланс: {fmtMoney(phone.balance)}
          </span>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
          {REGIONS.map((r) => {
            const active = r.id === region
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  sound.tap()
                  setRegion(r.id)
                }}
                aria-pressed={active}
                className={
                  'shrink-0 rounded-xl px-3 py-2 text-left transition-colors ' +
                  (active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.05] text-white/60')
                }
              >
                <span className="block text-[12.5px] font-medium leading-tight">{r.name}</span>
                <span className="block text-[10.5px] tabular-nums opacity-60">
                  +7 {r.codes[0]}… · {r.rollPrice} ₽
                </span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={doRoll}
          disabled={rolling}
          aria-label={`Прокрутить номер за ${regionMeta.rollPrice} рублей`}
          className="mt-3 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#22C55E] text-[16px] font-bold text-[#052E16] transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {rolling ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              className="inline-block"
            >
              <Dices className="size-6" aria-hidden="true" />
            </motion.span>
          ) : (
            <Dices className="size-6" aria-hidden="true" />
          )}
          {rolling ? 'Крутим…' : `Крутить · ${fmtMoney(regionMeta.rollPrice)}`}
        </button>
        <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-white/35">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          Прокрутка оплачивается сразу. Обычный номер — ваш бесплатно, красивый можно выкупить
          или оставить в брони на 48 часов и накопить.
        </div>
      </div>

      {/* Последняя прокрутка */}
      <AnimatePresence>
        {last && (
          <motion.div
            key={last.phone.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              <RollResult
                roll={last}
                balance={phone.balance}
                busy={busy}
                onBuy={doBuy}
                onKeep={() => {
                  sound.tap()
                  setLast(null)
                }}
                onSetMain={doSetMain}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Мои номера */}
      {phone.owned.length > 0 && (
        <div className="mt-4">
          <div className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
            Мои номера · {phone.owned.length}
          </div>
          <div className="flex flex-col gap-2">
            {phone.owned.map((p) => (
              <OwnedCard key={p.id} p={p} busy={busy} onSetMain={doSetMain} onRelease={doRelease} />
            ))}
          </div>
        </div>
      )}

      {/* История прокруток */}
      {history.length > 0 && (
        <div className="mt-4">
          <div className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
            История прокруток
          </div>
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            {history.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-white/[0.05] px-3.5 py-2.5 last:border-b-0"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tierMeta(p.tier).color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] tabular-nums text-white/85">
                    {p.number}
                  </span>
                  <span className="block text-[10.5px] text-white/35">
                    {tierMeta(p.tier).label} · {p.regionName} · {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-white/30">
                  {new Date(p.createdAt).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phone.loading && (
        <div className="py-6 text-center text-[13px] text-white/35">Загружаем номера…</div>
      )}
    </div>
  )
}
