'use client'

// Resale Admin — профессиональная панель управления игрой.
// Защищённый контур: страница открывается только с валидной подписанной сессией
// (edge-middleware), без сессии — редирект на публичный гейт /admin/login.
// Оболочка: сайдбар с группами, бейджи (жалобы/аукционы/операции), live-режим,
// командная палитра Ctrl+K, топбар с часами и индикатором LIVE.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  ChevronRight,
  Command,
  Gavel,
  History,
  LayoutDashboard,
  Landmark,
  LogOut,
  Megaphone,
  MessagesSquare,
  Pause,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Users,
} from 'lucide-react'
import { AdminApiError, adminApi, EXPORT_TYPES, exportUrl, type BadgesData } from '@/lib/admin-client'
import { Toast } from '@/components/admin/ui'
import OverviewSection from '@/components/admin/OverviewSection'
import UsersSection from '@/components/admin/UsersSection'
import ListingsSection from '@/components/admin/ListingsSection'
import MarketSection from '@/components/admin/MarketSection'
import AuctionsSection from '@/components/admin/AuctionsSection'
import MessagesSection from '@/components/admin/MessagesSection'
import BroadcastSection from '@/components/admin/BroadcastSection'
import ComplaintsSection from '@/components/admin/ComplaintsSection'
import FinanceSection from '@/components/admin/FinanceSection'
import OpsSection from '@/components/admin/OpsSection'
import AuditSection from '@/components/admin/AuditSection'

type Section =
  | 'overview'
  | 'ops'
  | 'users'
  | 'listings'
  | 'complaints'
  | 'auctions'
  | 'messages'
  | 'market'
  | 'finance'
  | 'broadcast'
  | 'audit'

const NAV_GROUPS: { label: string; items: { key: Section; label: string; sub: string; icon: React.ReactNode; badge?: 'complaints' | 'liveAuctions' | 'opsStuck' }[] }[] = [
  {
    label: 'Аналитика',
    items: [
      { key: 'overview', label: 'Обзор', sub: 'KPI, оборот, рынок', icon: <LayoutDashboard className="size-[17px]" /> },
      { key: 'ops', label: 'Операции', sub: 'Доставки и ремонты', icon: <Truck className="size-[17px]" />, badge: 'opsStuck' },
    ],
  },
  {
    label: 'Площадка',
    items: [
      { key: 'users', label: 'Игроки', sub: 'Балансы, боты, рейтинги', icon: <Users className="size-[17px]" /> },
      { key: 'listings', label: 'Объявления', sub: 'Модерация площадки', icon: <Store className="size-[17px]" /> },
      { key: 'complaints', label: 'Жалобы', sub: 'Очередь модерации', icon: <ShieldAlert className="size-[17px]" />, badge: 'complaints' },
      { key: 'auctions', label: 'Аукционы', sub: 'Живые торги', icon: <Gavel className="size-[17px]" />, badge: 'liveAuctions' },
      { key: 'messages', label: 'Чаты', sub: 'Модерация сообщений', icon: <MessagesSquare className="size-[17px]" /> },
    ],
  },
  {
    label: 'Экономика',
    items: [
      { key: 'market', label: 'Рынок', sub: 'Множители и события', icon: <Sparkles className="size-[17px]" /> },
      { key: 'finance', label: 'Финансы', sub: 'Налоги и кредиты', icon: <Landmark className="size-[17px]" /> },
      { key: 'broadcast', label: 'Рассылка', sub: 'Push всем игрокам', icon: <Megaphone className="size-[17px]" /> },
    ],
  },
  {
    label: 'Система',
    items: [
      { key: 'audit', label: 'Журнал действий', sub: 'Аудит операций', icon: <History className="size-[17px]" /> },
    ],
  },
]

const NAV_FLAT = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))

export default function AdminPage() {
  const [state, setState] = useState<'loading' | 'authed'>('loading')
  const [defaultKey, setDefaultKey] = useState(false)
  const [section, setSection] = useState<Section>('overview')

  const [badges, setBadges] = useState<BadgesData | null>(null)
  const [live, setLive] = useState(true)
  const [tick, setTick] = useState(0)
  const [clock, setClock] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQ, setPaletteQ] = useState('')
  const [paletteIdx, setPaletteIdx] = useState(0)

  const [toasts, setToasts] = useState<{ id: number; text: string; ok: boolean }[]>([])
  const onToast = useCallback((text: string, ok: boolean) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, text, ok }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  useEffect(() => {
    // Middleware уже отфильтровал неавторизованных; проверка — для UX/подстраховки.
    // При 401 admin-client сам редиректит на /admin/login.
    let alive = true
    adminApi.auth
      .check()
      .then((r) => {
        if (!alive) return
        setState('authed')
        setDefaultKey(r.usingDefault)
      })
      .catch(() => {
        if (alive && typeof window !== 'undefined') window.location.assign('/admin/login')
      })
    return () => {
      alive = false
    }
  }, [])

  // live-режим: тик каждые 12 сек перезагружает активную секцию
  useEffect(() => {
    if (state !== 'authed' || !live) return
    const t = setInterval(() => setTick((x) => x + 1), 12_000)
    return () => clearInterval(t)
  }, [state, live])

  // бейджи сайдбара — полл каждые 20 сек
  useEffect(() => {
    if (state !== 'authed') return
    const load = () => adminApi.badges().then(setBadges).catch(() => {})
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [state, section, tick])

  // часы в топбаре
  useEffect(() => {
    const upd = () =>
      setClock(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    upd()
    const t = setInterval(upd, 1000)
    return () => clearInterval(t)
  }, [])

  // командная палитра Ctrl+K / Cmd+K
  useEffect(() => {
    if (state !== 'authed') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        setPaletteQ('')
        setPaletteIdx(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  const paletteResults = useMemo(() => {
    const q = paletteQ.trim().toLowerCase()
    if (!q) return NAV_FLAT
    return NAV_FLAT.filter((n) => `${n.label} ${n.sub} ${n.group}`.toLowerCase().includes(q))
  }, [paletteQ])

  const logout = async () => {
    await adminApi.auth.logout().catch(() => {})
    window.location.assign('/admin/login')
  }

  const badgeValue = (b?: 'complaints' | 'liveAuctions' | 'opsStuck') => {
    if (!b || !badges) return 0
    return badges[b]
  }

  const current = NAV_FLAT.find((n) => n.key === section)

  return (
    <div className="min-h-screen bg-[#070B09] text-zinc-200 antialiased">
      <style>{`@keyframes admIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {state === 'loading' && (
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <ShieldCheck className="size-8 animate-pulse text-[#21A038]" />
            <p className="text-[13px] text-zinc-500">Проверяем доступ…</p>
          </div>
        </div>
      )}

      {state === 'authed' && (
        <div className="flex min-h-screen">
          {/* Сайдбар (desktop) */}
          <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#0A0F0C] px-3 py-4 [scrollbar-width:thin] lg:flex">
            <div className="mb-4 flex items-center gap-2.5 px-2">
              <img src="/icon.png" alt="" className="size-9 rounded-xl" />
              <div className="min-w-0">
                <p className="text-[14px] font-bold leading-tight text-zinc-50">Resale Admin</p>
                <p className="truncate text-[10.5px] text-zinc-500">центр управления</p>
              </div>
            </div>

            <button
              onClick={() => setPaletteOpen(true)}
              className="mb-4 flex w-full items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-[12px] text-zinc-500 ring-1 ring-white/[0.07] transition-colors hover:bg-black/50 hover:text-zinc-300"
            >
              <Command className="size-3.5" />
              Быстрый переход
              <kbd className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 ring-1 ring-white/[0.08]">⌘K</kbd>
            </button>

            <nav className="space-y-4">
              {NAV_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">{g.label}</p>
                  <div className="space-y-0.5">
                    {g.items.map((n) => {
                      const bv = badgeValue(n.badge)
                      return (
                        <button
                          key={n.key}
                          onClick={() => setSection(n.key)}
                          className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all ${
                            section === n.key
                              ? 'bg-[#21A038]/15 text-[#4ADE80] ring-1 ring-[#21A038]/25'
                              : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                          }`}
                        >
                          {n.icon}
                          <span className="flex-1 text-[13px] font-semibold">{n.label}</span>
                          {bv > 0 && (
                            <span
                              className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10.5px] font-bold tabular-nums ${
                                n.badge === 'complaints'
                                  ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                                  : n.badge === 'opsStuck'
                                    ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                                    : 'bg-[#21A038]/20 text-[#4ADE80] ring-1 ring-[#21A038]/30'
                              }`}
                            >
                              {bv}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-auto space-y-2 px-1 pt-4">
              <p className="px-2 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-600">Экспорт CSV</p>
              <div className="flex flex-wrap gap-1.5 px-1">
                {EXPORT_TYPES.map((t) => (
                  <a
                    key={t.key}
                    href={exportUrl(t.key)}
                    className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09] hover:text-zinc-200"
                  >
                    {t.label}
                  </a>
                ))}
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
              >
                <LogOut className="size-4" /> Выйти
              </button>
            </div>
          </aside>

          {/* Контент */}
          <div className="min-w-0 flex-1">
            {/* топбар */}
            <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0A0F0C]/90 backdrop-blur">
              <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
                <img src="/icon.png" alt="Resale Admin" className="size-7 rounded-lg lg:hidden" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-zinc-100">
                    <span className="hidden text-zinc-500 lg:inline">{current?.group} · </span>
                    {current?.label}
                  </p>
                  <p className="hidden truncate text-[11px] text-zinc-500 sm:block">{current?.sub}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="hidden items-center gap-1.5 rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-[12px] tabular-nums text-zinc-400 ring-1 ring-white/[0.07] md:flex">
                    <Activity className="size-3.5 text-[#4ADE80]" />
                    {clock}
                  </span>
                  <button
                    onClick={() => setLive((v) => !v)}
                    title={live ? 'Live-режим включён — данные обновляются каждые 12 сек' : 'Live-режим выключен'}
                    className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-bold ring-1 transition-all ${
                      live
                        ? 'bg-[#21A038]/15 text-[#4ADE80] ring-[#21A038]/30'
                        : 'bg-white/[0.05] text-zinc-500 ring-white/[0.08] hover:text-zinc-300'
                    }`}
                  >
                    {live ? <Radio className="size-3.5 animate-pulse" /> : <Pause className="size-3.5" />}
                    <span className="hidden sm:inline">{live ? 'LIVE' : 'Пауза'}</span>
                  </button>
                  <button
                    onClick={() => setTick((x) => x + 1)}
                    title="Обновить сейчас"
                    className="flex size-8 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-400 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09] hover:text-zinc-200"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setPaletteOpen(true)}
                    className="flex size-8 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-400 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09] hover:text-zinc-200 lg:hidden"
                    aria-label="Навигация"
                  >
                    <Command className="size-3.5" />
                  </button>
                  <button onClick={logout} className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300" aria-label="Выйти">
                    <LogOut className="size-4" />
                  </button>
                </div>
              </div>
              {/* мобильная навигация */}
              <div className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] lg:hidden">
                {NAV_FLAT.map((n) => (
                  <button
                    key={n.key}
                    onClick={() => setSection(n.key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      section === n.key ? 'bg-[#21A038] text-white' : 'bg-white/[0.05] text-zinc-400'
                    }`}
                  >
                    {n.icon}
                    {n.label}
                    {badgeValue(n.badge) > 0 && (
                      <span className={`rounded-full px-1.5 text-[10px] font-bold ${n.badge === 'complaints' ? 'bg-red-500/25 text-red-200' : 'bg-white/15 text-white'}`}>
                        {badgeValue(n.badge)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <main className="mx-auto max-w-[1200px] p-4 sm:p-6">
              {defaultKey && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-amber-500/10 px-4 py-3 text-[12.5px] text-amber-200 ring-1 ring-amber-500/25">
                  <Bot className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Используется ключ по умолчанию. Задайте переменную окружения <b>ADMIN_KEY</b> (Vercel → Settings →
                    Environment Variables) и войдите с ней — сейчас доступ открыт всем, кто знает дефолт.
                  </span>
                </div>
              )}
              <div key={section} className="animate-[admIn_.25s_cubic-bezier(0.2,0,0,1)]">
                {section === 'overview' && <OverviewSection onToast={onToast} refreshKey={tick} />}
                {section === 'ops' && <OpsSection onToast={onToast} refreshKey={tick} />}
                {section === 'users' && <UsersSection onToast={onToast} refreshKey={tick} />}
                {section === 'listings' && <ListingsSection onToast={onToast} refreshKey={tick} />}
                {section === 'complaints' && <ComplaintsSection onToast={onToast} refreshKey={tick} />}
                {section === 'auctions' && <AuctionsSection onToast={onToast} refreshKey={tick} />}
                {section === 'messages' && <MessagesSection onToast={onToast} refreshKey={tick} />}
                {section === 'market' && <MarketSection onToast={onToast} />}
                {section === 'finance' && <FinanceSection onToast={onToast} refreshKey={tick} />}
                {section === 'broadcast' && <BroadcastSection onToast={onToast} />}
                {section === 'audit' && <AuditSection onToast={onToast} refreshKey={tick} />}
              </div>
            </main>
          </div>
        </div>
      )}

      {/* командная палитра */}
      {paletteOpen && state === 'authed' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[14vh]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPaletteOpen(false)} />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[#101713] ring-1 ring-white/10 shadow-2xl animate-[admIn_.2s_cubic-bezier(0.2,0,0,1)]">
            <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
              <Command className="size-4 text-zinc-500" />
              <input
                autoFocus
                value={paletteQ}
                onChange={(e) => {
                  setPaletteQ(e.target.value)
                  setPaletteIdx(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setPaletteIdx((i) => Math.min(paletteResults.length - 1, i + 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setPaletteIdx((i) => Math.max(0, i - 1))
                  } else if (e.key === 'Enter' && paletteResults[paletteIdx]) {
                    setSection(paletteResults[paletteIdx].key)
                    setPaletteOpen(false)
                  } else if (e.key === 'Escape') {
                    setPaletteOpen(false)
                  }
                }}
                placeholder="Перейти к разделу…"
                className="flex-1 bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              <kbd className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 ring-1 ring-white/[0.08]">esc</kbd>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {paletteResults.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-zinc-500">Ничего не найдено</p>}
              {paletteResults.map((n, i) => (
                <button
                  key={n.key}
                  onClick={() => {
                    setSection(n.key)
                    setPaletteOpen(false)
                  }}
                  onMouseEnter={() => setPaletteIdx(i)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    i === paletteIdx ? 'bg-[#21A038]/15 text-[#4ADE80]' : 'text-zinc-300 hover:bg-white/[0.04]'
                  }`}
                >
                  {n.icon}
                  <span className="flex-1">
                    <span className="block text-[13px] font-semibold">{n.label}</span>
                    <span className="block text-[11px] text-zinc-500">{n.sub}</span>
                  </span>
                  <span className="text-[10.5px] uppercase tracking-wide text-zinc-600">{n.group}</span>
                  <ChevronRight className="size-3.5 text-zinc-600" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* тосты */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-60 flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} text={t.text} tone={t.ok ? 'ok' : 'err'} />
        ))}
      </div>
    </div>
  )
}
