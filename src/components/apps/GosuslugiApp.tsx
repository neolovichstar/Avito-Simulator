'use client'

// Приложение «Госуслуги» (Task 27-b) — виртуальный портал госуслуг с документами.
// Первый экран: компактный профиль (ФИО + СНИЛС), «Документы» горизонтальной каруселью,
// «Штрафы» с красным бейджем суммы, короткий список «Услуги» (название + 1 строка).
// Фирменный стиль: синий #0D4CD3, фон #F5F6F8, красный штрафов #EE3F58, светлый UI.
// Документы и штрафы приходят из /api/gosuslugi (детерминированы из userId),
// оплата штрафа — POST /api/gosuslugi/pay (списание через ту же схему, что банк/налоги).
// Оплаченные штрафы дублируются в localStorage (зеркало User.stats на сервере).
// Сеть: загрузка переживает мелкие сбои — до 3 тихих ретраев с задержкой,
// экран ошибки только после этого (и вручную по «Повторить»).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, BadgeCheck, Car, CheckCircle2, ChevronRight, Loader2,
  ReceiptText, Search, X,
} from 'lucide-react'
import { ApiError, getToken } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, fmtDateTime } from '@/lib/format'
import { fineAmountDue } from '@/lib/gos-docs'
import type { GosData, GosDoc, GosFineDTO, GosService } from '@/lib/gos-docs'
import {
  CARD, DOC_ICONS, DocPreviewCard, GosAvatar, SectionTitle, ServiceRow, SubHeader,
} from './gosuslugi/ui'
import DocumentFull from './gosuslugi/DocumentFull'
import ServiceDetail from './gosuslugi/ServiceDetail'

type View =
  | { k: 'home' }
  | { k: 'docs' }
  | { k: 'fines' }
  | { k: 'profile' }
  | { k: 'search' }
  | { k: 'service'; id: string }

const LS_PAID_KEY = 'resale_gos_fines_paid_v1'
const POPULAR_QUERIES = ['Паспорт', 'Штрафы', 'ИНН', 'Права', 'Регистрация']

function readLsPaid(): string[] {
  try {
    const raw = localStorage.getItem(LS_PAID_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeLsPaid(ids: string[]) {
  try {
    localStorage.setItem(LS_PAID_KEY, JSON.stringify(ids))
  } catch {
    /* приватный режим — не критично */
  }
}

async function gosFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getToken()}`,
      ...(init?.headers ?? {}),
    },
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, json?.error ?? `Ошибка ${res.status}`)
  return json
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

// ---------------------------------------------------------------------------
// Скелет загрузки
// ---------------------------------------------------------------------------

function SkeletonScreen() {
  return (
    <div className="flex h-full flex-col px-4 pt-3">
      <div className="flex items-center gap-2">
        <div className="skeleton-shimmer size-8 rounded-lg" />
        <div className="skeleton-shimmer h-5 w-28 rounded-md" />
        <div className="flex-1" />
        <div className="skeleton-shimmer size-9 rounded-full" />
      </div>
      <div className="skeleton-shimmer mt-3 h-11 w-full rounded-full" />
      <div className="skeleton-shimmer mt-4 h-32 w-full rounded-[24px]" />
      <div className="mt-5 flex gap-3 overflow-hidden">
        <div className="skeleton-shimmer h-[104px] w-[152px] shrink-0 rounded-[20px]" />
        <div className="skeleton-shimmer h-[104px] w-[152px] shrink-0 rounded-[20px]" />
      </div>
      <div className="mt-6 space-y-3">
        <div className="skeleton-shimmer h-12 w-full rounded-[22px]" />
        <div className="skeleton-shimmer h-12 w-full rounded-[22px]" />
        <div className="skeleton-shimmer h-12 w-full rounded-[22px]" />
      </div>
    </div>
  )
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-[#EE3F58]/10">
        <AlertTriangle className="size-6 text-[#EE3F58]" strokeWidth={2} />
      </span>
      <div className="text-[15px] font-semibold text-[#17181A]">Портал недоступен</div>
      <p className="text-[13px] leading-relaxed text-[#9AA0A8]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 flex h-11 items-center rounded-full bg-[#0D4CD3] px-6 text-[14px] font-semibold text-white"
      >
        Повторить
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Главный экран: профиль → Документы → Штрафы → Услуги
// ---------------------------------------------------------------------------

function HomeScreen({
  data,
  unpaid,
  onOpenDoc,
  onOpenService,
  onGo,
}: {
  data: GosData
  unpaid: GosFineDTO[]
  onOpenDoc: (id: string) => void
  onOpenService: (id: string) => void
  onGo: (v: View) => void
}) {
  const unpaidTotal = unpaid.reduce((s, f) => s + fineAmountDue(f), 0)
  const snils = data.docs.find((d) => d.id === 'snils')?.number

  return (
    <div className="flex h-full flex-col">
      {/* компактный профиль: ФИО + СНИЛС, тап → личный кабинет */}
      <header className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
        <button
          type="button"
          onClick={() => onGo({ k: 'profile' })}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] p-1.5 text-left transition active:bg-black/[0.04]"
          aria-label="Личный кабинет"
        >
          <GosAvatar name={data.user.displayName} photoUrl={data.user.photoUrl} className="size-11" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16.5px] font-bold leading-tight tracking-tight text-[#17181A]">
              {data.user.displayName}
            </span>
            {snils && (
              <span className="mt-0.5 block truncate text-[12px] tabular-nums text-[#9AA0A8]">СНИЛС {snils}</span>
            )}
          </span>
          <ChevronRight className="size-5 shrink-0 text-[#9AA0A8]" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onGo({ k: 'search' })}
          aria-label="Поиск"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_1px_5px_rgba(15,35,95,0.06)] transition active:scale-95"
        >
          <Search className="size-[19px] text-[#17181A]" strokeWidth={2.1} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-7">
        {/* Документы: крупные карточки, горизонтальный скролл */}
        <section className="mt-4">
          <SectionTitle title="Документы" action="Все" onAction={() => onGo({ k: 'docs' })} />
          <div className="flex gap-3 overflow-x-auto px-5 pb-1">
            {data.docs.map((d) => (
              <DocPreviewCard key={d.id} doc={d} onClick={() => onOpenDoc(d.id)} />
            ))}
          </div>
        </section>

        {/* Штрафы: красный бейдж суммы, если есть */}
        <section className="mt-6">
          <SectionTitle title="Штрафы" />
          <div className="px-5">
            {unpaid.length > 0 ? (
              <button
                type="button"
                onClick={() => onGo({ k: 'fines' })}
                className={CARD + ' flex w-full items-center gap-3.5 p-4 text-left transition active:bg-black/[0.03]'}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#EE3F58]/10">
                  <ReceiptText className="size-[21px] text-[#EE3F58]" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-[#17181A]">Штрафы ГИБДД</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[#9AA0A8]">
                    {unpaid.length === 1 ? '1 счёт' : unpaid.length < 5 ? `${unpaid.length} счёта` : `${unpaid.length} счетов`}
                    {' · '}
                    скидка 50%
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[#EE3F58] px-3 py-1.5 text-[13px] font-bold tabular-nums text-white">
                  {fmtMoney(unpaidTotal)}
                </span>
              </button>
            ) : (
              <div className={CARD + ' flex items-center gap-3.5 p-4'}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#0AC760]/10">
                  <CheckCircle2 className="size-[21px] text-[#067A47]" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-[#17181A]">Штрафов нет</div>
                  <div className="mt-0.5 text-[12px] text-[#9AA0A8]">Все начисления оплачены</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Услуги: название + одна строка описания */}
        <section className="mt-6">
          <SectionTitle title="Услуги" />
          <div className="mx-5 divide-y divide-[#F0F1F5] overflow-hidden rounded-[20px] bg-white shadow-[0_2px_10px_rgba(15,35,95,0.05)]">
            {data.services.map((s) => (
              <ServiceRow
                key={s.id}
                service={s}
                badge={s.special === 'debts' && unpaid.length > 0 ? String(unpaid.length) : undefined}
                onClick={() => onOpenService(s.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Штрафы
// ---------------------------------------------------------------------------

function FinesView({
  unpaid,
  paid,
  paying,
  onPay,
  onPayAll,
}: {
  unpaid: GosFineDTO[]
  paid: GosFineDTO[]
  paying: string | null
  onPay: (f: GosFineDTO) => void
  onPayAll: () => void
}) {
  const total = unpaid.reduce((s, f) => s + fineAmountDue(f), 0)

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-7">
      {unpaid.length > 0 ? (
        <div className={CARD + ' p-5'}>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[12px] text-[#9AA0A8]">К оплате</div>
              <div className="mt-0.5 text-[26px] font-extrabold leading-none text-[#EE3F58]">{fmtMoney(total)}</div>
            </div>
            <span className="rounded-full bg-[#EE3F58]/10 px-2.5 py-1 text-[11px] font-bold text-[#EE3F58]">
              {unpaid.length === 1 ? '1 счёт' : `${unpaid.length} счёта`}
            </span>
          </div>
          <button
            type="button"
            onClick={onPayAll}
            disabled={paying !== null}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[13px] bg-[#0D4CD3] text-[14.5px] font-semibold text-white shadow-[0_6px_16px_rgba(13,76,211,0.28)] transition active:scale-[0.985] disabled:opacity-60"
          >
            {paying && <Loader2 className="size-[17px] animate-spin" strokeWidth={2.2} />}
            Оплатить всё со счёта
          </button>
        </div>
      ) : (
        <div className={CARD + ' flex flex-col items-center p-7 text-center'}>
          <span className="flex size-14 items-center justify-center rounded-full bg-[#0AC760]/10">
            <BadgeCheck className="size-7 text-[#067A47]" strokeWidth={2} />
          </span>
          <div className="mt-3 text-[16px] font-bold text-[#17181A]">Всё оплачено</div>
          <p className="mt-1 text-[13px] text-[#9AA0A8]">Новых начислений за сегодня нет</p>
        </div>
      )}

      {unpaid.length > 0 && (
        <div className="mt-4 divide-y divide-[#F0F1F5] overflow-hidden rounded-[22px] bg-white shadow-[0_2px_10px_rgba(15,35,95,0.05)]">
          {unpaid.map((f) => {
            const due = fineAmountDue(f)
            const half = due < f.amount
            return (
              <div key={f.id} className="flex items-center gap-3 p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#EE3F58]/10">
                  <Car className="size-[19px] text-[#EE3F58]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[#17181A]">{f.title}</div>
                  <div className="mt-0.5 truncate text-[11.5px] text-[#9AA0A8]">
                    {f.article} · выдан {fmtDay(f.issuedAt)}
                  </div>
                  {half && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#0AC760]/10 px-2 py-0.5 text-[10.5px] font-bold text-[#067A47]">
                      Скидка 50% · вместо {fmtMoney(f.amount)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[15px] font-bold tabular-nums text-[#17181A]">{fmtMoney(due)}</span>
                  <button
                    type="button"
                    onClick={() => onPay(f)}
                    disabled={paying !== null}
                    className="flex h-8 items-center rounded-full bg-[#0D4CD3] px-3.5 text-[12px] font-bold text-white transition active:scale-[0.96] disabled:opacity-50"
                  >
                    {paying === f.id ? <Loader2 className="size-4 animate-spin" strokeWidth={2.2} /> : 'Оплатить'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {paid.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-[#9AA0A8]">Оплаченные</div>
          <div className="divide-y divide-[#F0F1F5] overflow-hidden rounded-[22px] bg-white shadow-[0_2px_10px_rgba(15,35,95,0.05)]">
            {paid.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0AC760]/10">
                  <CheckCircle2 className="size-[19px] text-[#067A47]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[#17181A]">{f.title}</div>
                  <div className="mt-0.5 truncate text-[11.5px] text-[#9AA0A8]">
                    {f.paidAt ? `Оплачен ${fmtDateTime(f.paidAt)}` : 'Оплачен'}
                  </div>
                </div>
                <span className="shrink-0 text-[15px] font-bold tabular-nums text-[#067A47]">−{fmtMoney(f.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Все документы
// ---------------------------------------------------------------------------

function DocsView({ docs, onOpenDoc }: { docs: GosDoc[]; onOpenDoc: (id: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-7">
      <div className="grid grid-cols-2 gap-3">
        {docs.map((d) => (
          <DocPreviewCard key={d.id} doc={d} large onClick={() => onOpenDoc(d.id)} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Поиск
// ---------------------------------------------------------------------------

function SearchView({
  data,
  onOpenDoc,
  onOpenService,
}: {
  data: GosData
  onOpenDoc: (id: string) => void
  onOpenService: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()

  const services = query
    ? data.services.filter((s) =>
        [s.title, s.desc, s.category].some((t) => t.toLowerCase().includes(query)),
      )
    : []
  const docs = query
    ? data.docs.filter((d) =>
        [d.title, d.subtitle, d.number].some((t) => t.toLowerCase().includes(query)),
      )
    : []
  const nothing = query.length > 0 && services.length === 0 && docs.length === 0

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-[#F5F6F8] px-4">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white px-4 shadow-[0_1px_5px_rgba(15,35,95,0.06)]">
          <Search className="size-[18px] shrink-0 text-[#9AA0A8]" strokeWidth={2.1} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Сервис или документ"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-[#17181A] outline-none placeholder:text-[#9AA0A8]"
            aria-label="Поиск по сервисам"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Очистить" className="shrink-0">
              <X className="size-[17px] text-[#9AA0A8]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-7">
        {!query && (
          <div className="pt-2">
            <div className="mb-2.5 text-[13px] font-semibold text-[#9AA0A8]">Часто ищут</div>
            <div className="flex flex-wrap gap-2">
              {POPULAR_QUERIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setQ(p)}
                  className="h-9 rounded-full bg-white px-4 text-[13px] font-medium text-[#17181A] shadow-[0_1px_5px_rgba(15,35,95,0.06)] transition active:scale-[0.97]"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {query && docs.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9AA0A8]">Документы</div>
            <div className="divide-y divide-[#F0F1F5] overflow-hidden rounded-[20px] bg-white shadow-[0_2px_10px_rgba(15,35,95,0.05)]">
              {docs.map((d) => {
                const Icon = DOC_ICONS[d.icon]
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onOpenDoc(d.id)}
                    className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04]"
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: 'linear-gradient(140deg,#377FF3,#0D4CD3)' }}
                    >
                      <Icon className="size-[17px]" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[#17181A]">{d.title}</span>
                      <span className="block truncate text-[11.5px] text-[#9AA0A8]">{d.subtitle}</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-[#9AA0A8]" strokeWidth={2} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {query && services.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9AA0A8]">Услуги</div>
            <div className="divide-y divide-[#F0F1F5] overflow-hidden rounded-[20px] bg-white shadow-[0_2px_10px_rgba(15,35,95,0.05)]">
              {services.map((s) => (
                <ServiceRow key={s.id} service={s} onClick={() => onOpenService(s.id)} />
              ))}
            </div>
          </div>
        )}

        {nothing && (
          <div className="flex flex-col items-center pt-14 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
              <Search className="size-6 text-[#9AA0A8]" strokeWidth={2} />
            </span>
            <div className="mt-3 text-[15px] font-semibold text-[#17181A]">Ничего не нашлось</div>
            <p className="mt-1 text-[13px] text-[#9AA0A8]">Попробуйте «паспорт» или «штрафы»</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Профиль (личный кабинет)
// ---------------------------------------------------------------------------

function ProfileView({
  data,
  onOpenDoc,
  onGoFines,
}: {
  data: GosData
  onOpenDoc: (id: string) => void
  onGoFines: () => void
}) {
  const snils = data.docs.find((d) => d.id === 'snils')
  const inn = data.docs.find((d) => d.id === 'inn')
  const passport = data.docs.find((d) => d.id === 'passport')
  const birth = passport?.fields.find((f) => f.label === 'Дата рождения')?.value

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-7">
      <div className={CARD + ' flex items-center gap-4 p-5'}>
        <GosAvatar name={data.user.displayName} photoUrl={data.user.photoUrl} className="size-16" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold text-[#17181A]">{data.user.displayName}</div>
          <div className="mt-0.5 truncate text-[12.5px] text-[#9AA0A8]">@{data.user.username}</div>
          <span className="mt-1.5 inline-block rounded-full bg-[#0D4CD3]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#0D4CD3]">
            Уровень {data.user.level}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <SectionTitle title="Персональные данные" />
        <div className={CARD + ' divide-y divide-[#F0F1F5]'}>
          <DataRow label="СНИЛС" value={snils?.number ?? '—'} />
          <DataRow label="ИНН" value={inn?.number ?? '—'} />
          {birth && <DataRow label="Дата рождения" value={birth} />}
          <DataRow label="Город" value={data.user.city} />
          <DataRow label="На портале с" value={fmtDay(data.user.createdAt)} />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle title="Мои документы" />
        <div className={CARD + ' divide-y divide-[#F0F1F5]'}>
          {data.docs.map((d) => {
            const Icon = DOC_ICONS[d.icon]
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onOpenDoc(d.id)}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04]"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: 'linear-gradient(140deg,#377FF3,#0D4CD3)' }}
                >
                  <Icon className="size-[17px]" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[#17181A]">{d.title}</span>
                  <span className="block truncate text-[11.5px] text-[#9AA0A8]">{d.subtitle}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-[#9AA0A8]" strokeWidth={2} />
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle title="Платежи" />
        <div className={CARD + ' divide-y divide-[#F0F1F5]'}>
          <DataRow label="Баланс счёта" value={fmtMoney(data.user.balance)} />
          <DataRow label="Оплачено через портал" value={fmtMoney(data.paidTotal)} />
        </div>
        <button
          type="button"
          onClick={onGoFines}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-[14px] bg-[#0D4CD3] text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(13,76,211,0.28)] transition active:scale-[0.985]"
        >
          Штрафы ГИБДД
        </button>
      </div>
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-[13px] text-[#9AA0A8]">{label}</span>
      <span className="truncate text-[13.5px] font-semibold text-[#17181A]">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Корень приложения
// ---------------------------------------------------------------------------

export default function GosuslugiApp() {
  const [data, setData] = useState<GosData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ k: 'home' })
  const [docOpen, setDocOpen] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [lsPaid, setLsPaid] = useState<string[]>([])
  const retryTimer = useRef<number | null>(null)
  const pushToast = useOS((s) => s.pushToast)
  const refreshSession = useOS((s) => s.refreshSession)

  // Загрузка с мягким ретраем: первые 3 неудачи (холодный старт, пересборка dev,
  // пропавший интернет) повторяются тихо с растущей задержкой, скелет остаётся на
  // экране; «Портал недоступен» показываем только после всех ретраев.
  const load = useCallback(async (attempt = 0): Promise<void> => {
    if (attempt === 0) {
      setLoading(true)
      setError(null)
    }
    try {
      const d = await gosFetch<GosData>('/api/gosuslugi')
      setData(d)
      setLsPaid(readLsPaid())
      setError(null)
      setLoading(false)
    } catch (e) {
      if (attempt < 3) {
        if (retryTimer.current) window.clearTimeout(retryTimer.current)
        retryTimer.current = window.setTimeout(() => void load(attempt + 1), 800 + attempt * 900)
        return
      }
      setError(
        e instanceof ApiError
          ? e.status >= 500 || e.status === 401
            ? 'Сервис временно недоступен'
            : e.message
          : 'Не удалось связаться с порталом',
      )
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
    }
  }, [load])

  // объединяем статус оплаты: сервер (User.stats) + зеркало localStorage
  const isPaid = useCallback((f: GosFineDTO) => f.status === 'paid' || lsPaid.includes(f.id), [lsPaid])

  const unpaid = useMemo(() => data?.fines.filter((f) => !isPaid(f)) ?? [], [data, isPaid])
  const paid = useMemo(() => data?.fines.filter(isPaid) ?? [], [data, isPaid])

  const markLsPaid = useCallback((id: string) => {
    setLsPaid((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      writeLsPaid(next)
      return next
    })
  }, [])

  const payFine = useCallback(
    async (fine: GosFineDTO) => {
      if (paying) return
      setPaying(fine.id)
      try {
        const res = await gosFetch<{ ok: boolean; balance: number; paidAt: string }>(
          '/api/gosuslugi/pay',
          { method: 'POST', body: JSON.stringify({ fineId: fine.id }) },
        )
        refreshSession({ balance: res.balance })
        pushToast('Госуслуги', `Штраф оплачен: ${fmtMoney(fine.amount)}`)
        markLsPaid(fine.id)
        setData((prev) =>
          prev
            ? {
                ...prev,
                user: { ...prev.user, balance: res.balance },
                fines: prev.fines.map((f) =>
                  f.id === fine.id ? { ...f, status: 'paid', paidAt: res.paidAt } : f,
                ),
                paidTotal: prev.paidTotal + fine.amount,
              }
            : prev,
        )
      } catch (e) {
        pushToast('Госуслуги', e instanceof ApiError ? e.message : 'Не удалось оплатить штраф')
      } finally {
        setPaying(null)
      }
    },
    [paying, refreshSession, pushToast, markLsPaid],
  )

  const payAll = useCallback(async () => {
    for (const f of unpaid) {
      await payFine(f)
    }
  }, [unpaid, payFine])

  const openDoc = useCallback((id: string) => setDocOpen(id), [])
  const openService = useCallback((id: string) => setView({ k: 'service', id }), [])
  const go = useCallback((v: View) => setView(v), [])

  const doc: GosDoc | null = data?.docs.find((d) => d.id === docOpen) ?? null
  const activeService: GosService | null =
    data && view.k === 'service' ? data.services.find((s) => s.id === view.id) ?? null : null

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#F5F6F8] text-[#17181A]">
      {loading && <SkeletonScreen />}
      {!loading && error && <ErrorScreen message={error} onRetry={() => void load()} />}

      {!loading && !error && data && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view.k === 'service' ? `service-${view.id}` : view.k}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {view.k !== 'home' && view.k !== 'search' && view.k !== 'service' && (
              <SubHeader
                title={
                  view.k === 'docs' ? 'Документы' : view.k === 'fines' ? 'Штрафы ГИБДД' : 'Профиль'
                }
                onBack={() => setView({ k: 'home' })}
              />
            )}
            {view.k === 'home' && (
              <HomeScreen data={data} unpaid={unpaid} onOpenDoc={openDoc} onOpenService={openService} onGo={go} />
            )}
            {view.k === 'docs' && <DocsView docs={data.docs} onOpenDoc={openDoc} />}
            {view.k === 'fines' && (
              <FinesView
                unpaid={unpaid}
                paid={paid}
                paying={paying}
                onPay={(f) => void payFine(f)}
                onPayAll={() => void payAll()}
              />
            )}
            {view.k === 'profile' && (
              <ProfileView data={data} onOpenDoc={openDoc} onGoFines={() => setView({ k: 'fines' })} />
            )}
            {view.k === 'search' && (
              <SearchView data={data} onOpenDoc={openDoc} onOpenService={openService} />
            )}
            {view.k === 'service' && activeService && (
              <ServiceDetail
                service={activeService}
                user={data.user}
                onBack={() => setView({ k: 'home' })}
                onGoDebts={() => setView({ k: 'fines' })}
                toast={pushToast}
              />
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* полноэкранный документ */}
      <AnimatePresence>
        {doc && data && (
          <motion.div key="doc-sheet" className="absolute inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              onClick={() => setDocOpen(null)}
              aria-label="Закрыть документ"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 330, damping: 33 }}
              className="absolute inset-x-0 bottom-0 top-[44px] flex flex-col overflow-hidden rounded-t-[24px] bg-[#F5F6F8]"
              role="dialog"
              aria-label={`Документ: ${doc.title}`}
            >
              <div className="relative flex h-12 shrink-0 items-center justify-center bg-white">
                <div className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-[#E4E6EB]" aria-hidden="true" />
                <div className="mt-1.5 text-[14px] font-bold text-[#17181A]">{doc.title}</div>
                <button
                  type="button"
                  onClick={() => setDocOpen(null)}
                  aria-label="Закрыть"
                  className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full transition active:bg-black/[0.06]"
                >
                  <X className="size-5 text-[#17181A]" strokeWidth={2.2} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <DocumentFull doc={doc} user={data.user} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

