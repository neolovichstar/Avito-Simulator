'use client'

// Resale Admin — профессиональная панель управления игрой.
// Вход по ключу (ADMIN_KEY): POST /api/admin/auth ставит httpOnly-cookie на 7 дней.

import { useCallback, useEffect, useState } from 'react'
import {
  Bot,
  Gavel,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from 'lucide-react'
import { AdminApiError, adminApi, EXPORT_TYPES, exportUrl } from '@/lib/admin-client'
import { Toast } from '@/components/admin/ui'
import OverviewSection from '@/components/admin/OverviewSection'
import UsersSection from '@/components/admin/UsersSection'
import ListingsSection from '@/components/admin/ListingsSection'
import MarketSection from '@/components/admin/MarketSection'
import AuctionsSection from '@/components/admin/AuctionsSection'
import MessagesSection from '@/components/admin/MessagesSection'
import BroadcastSection from '@/components/admin/BroadcastSection'

type Section = 'overview' | 'users' | 'listings' | 'market' | 'auctions' | 'messages' | 'broadcast'

const NAV: { key: Section; label: string; icon: React.ReactNode; sub: string }[] = [
  { key: 'overview', label: 'Обзор', icon: <LayoutDashboard className="size-[17px]" />, sub: 'KPI, оборот, рынок' },
  { key: 'users', label: 'Игроки', icon: <Users className="size-[17px]" />, sub: 'Балансы, боты, рейтинги' },
  { key: 'listings', label: 'Объявления', icon: <Store className="size-[17px]" />, sub: 'Модерация площадки' },
  { key: 'market', label: 'Рынок', icon: <Sparkles className="size-[17px]" />, sub: 'Множители и события' },
  { key: 'auctions', label: 'Аукционы', icon: <Gavel className="size-[17px]" />, sub: 'Живые торги' },
  { key: 'messages', label: 'Чаты', icon: <MessagesSquare className="size-[17px]" />, sub: 'Модерация сообщений' },
  { key: 'broadcast', label: 'Рассылка', icon: <Megaphone className="size-[17px]" />, sub: 'Push всем игрокам' },
]

export default function AdminPage() {
  const [state, setState] = useState<'loading' | 'anon' | 'authed'>('loading')
  const [defaultKey, setDefaultKey] = useState(false)
  const [section, setSection] = useState<Section>('overview')

  const [key, setKey] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  const [toasts, setToasts] = useState<{ id: number; text: string; ok: boolean }[]>([])
  const onToast = useCallback((text: string, ok: boolean) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, text, ok }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  useEffect(() => {
    adminApi.auth
      .check()
      .then((r) => {
        setState('authed')
        setDefaultKey(r.usingDefault)
      })
      .catch(() => setState('anon'))
  }, [])

  const login = async () => {
    if (!key.trim()) return
    setLoginBusy(true)
    setLoginErr('')
    try {
      const r = await adminApi.auth.login(key.trim())
      setState('authed')
      setDefaultKey(r.usingDefault)
      setKey('')
    } catch (e) {
      setLoginErr(e instanceof AdminApiError && e.status === 403 ? 'Неверный ключ' : 'Сервис недоступен, попробуйте позже')
    } finally {
      setLoginBusy(false)
    }
  }

  const logout = async () => {
    await adminApi.auth.logout().catch(() => {})
    setState('anon')
    setSection('overview')
  }

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

      {state === 'anon' && (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#0D120F] p-6 ring-1 ring-white/[0.08] animate-[admIn_.3s_cubic-bezier(0.2,0,0,1)]">
            <div className="mb-5 flex flex-col items-center text-center">
              { }
              <img src="/icon.png" alt="Resale Admin" className="size-14 rounded-2xl shadow-lg" />
              <h1 className="mt-3 text-[18px] font-bold text-zinc-50">Resale Admin</h1>
              <p className="mt-1 text-[12.5px] text-zinc-500">Введите административный ключ для входа</p>
            </div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              placeholder="Ключ доступа"
              autoFocus
              className={`h-11 w-full rounded-xl bg-black/30 px-4 text-[14px] text-zinc-100 ring-1 outline-none transition-all placeholder:text-zinc-600 focus:ring-2 ${
                loginErr ? 'ring-red-500/40 focus:ring-red-500/60' : 'ring-white/10 focus:ring-[#21A038]/60'
              }`}
            />
            {loginErr && <p className="mt-2 text-[12px] font-semibold text-red-400">{loginErr}</p>}
            <button
              onClick={login}
              disabled={loginBusy || !key.trim()}
              className="mt-4 h-11 w-full rounded-xl bg-[#21A038] text-[14px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(33,160,56,.7)] transition-all hover:bg-[#1F9134] active:scale-[0.98] disabled:opacity-50"
            >
              {loginBusy ? 'Входим…' : 'Войти'}
            </button>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
              Ключ задаётся переменной окружения ADMIN_KEY.
              <br />
              Сессия хранится 7 дней в защищённой cookie.
            </p>
          </div>
        </div>
      )}

      {state === 'authed' && (
        <div className="flex min-h-screen">
          {/* Сайдбар (desktop) */}
          <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0A0F0C] px-3 py-4 lg:flex">
            <div className="mb-5 flex items-center gap-2.5 px-2">
              { }
              <img src="/icon.png" alt="" className="size-9 rounded-xl" />
              <div>
                <p className="text-[14px] font-bold leading-tight text-zinc-50">Resale Admin</p>
                <p className="text-[10.5px] text-zinc-500">панель управления</p>
              </div>
            </div>
            <nav className="space-y-1">
              {NAV.map((n) => (
                <button
                  key={n.key}
                  onClick={() => setSection(n.key)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-all ${
                    section === n.key
                      ? 'bg-[#21A038]/15 text-[#4ADE80] ring-1 ring-[#21A038]/25'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                  }`}
                >
                  {n.icon}
                  {n.label}
                </button>
              ))}
            </nav>

            <div className="mt-auto space-y-2 px-1">
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
            {/* мобильная навигация */}
            <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0A0F0C]/95 backdrop-blur lg:hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                { }
                <img src="/icon.png" alt="" className="size-7 rounded-lg" />
                <span className="text-[13px] font-bold text-zinc-100">Resale Admin</span>
                <button onClick={logout} className="ml-auto text-zinc-500" aria-label="Выйти">
                  <LogOut className="size-4" />
                </button>
              </div>
              <div className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none]">
                {NAV.map((n) => (
                  <button
                    key={n.key}
                    onClick={() => setSection(n.key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      section === n.key ? 'bg-[#21A038] text-white' : 'bg-white/[0.05] text-zinc-400'
                    }`}
                  >
                    {n.icon}
                    {n.label}
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
              {section === 'overview' && <OverviewSection onToast={onToast} />}
              {section === 'users' && <UsersSection onToast={onToast} />}
              {section === 'listings' && <ListingsSection onToast={onToast} />}
              {section === 'market' && <MarketSection onToast={onToast} />}
              {section === 'auctions' && <AuctionsSection onToast={onToast} />}
              {section === 'messages' && <MessagesSection onToast={onToast} />}
              {section === 'broadcast' && <BroadcastSection onToast={onToast} />}
            </main>
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
