'use client'

// Публичный гейт входа в админ-панель. Единственная открытая страница /admin*.
// Защита: rate-limit 5 неудач / 15 минут (429 с таймером блокировки),
// fail-closed в production без ADMIN_KEY (503). Успешный вход ставит
// подписанную HMAC-сессию на 7 дней и редиректит в панель.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, ShieldCheck, Timer } from 'lucide-react'
import { AdminApiError, adminApi } from '@/lib/admin-client'

export default function AdminLoginPage() {
  const router = useRouter()
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [lockSec, setLockSec] = useState(0)
  const [busy, setBusy] = useState(false)

  // Тикающий таймер блокировки
  useEffect(() => {
    if (lockSec <= 0) return
    const t = setInterval(() => setLockSec((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockSec])

  const login = async () => {
    if (!key.trim() || lockSec > 0 || busy) return
    setBusy(true)
    setErr('')
    try {
      await adminApi.auth.login(key.trim())
      router.replace('/admin')
      router.refresh()
    } catch (e) {
      if (e instanceof AdminApiError) {
        if (e.status === 429) {
          setLockSec(e.body?.lockSec ?? 900)
          setErr('')
        } else {
          setErr(e.body?.error ?? 'Ошибка входа')
        }
      } else {
        setErr('Сервис недоступен, попробуйте позже')
      }
      setKey('')
    } finally {
      setBusy(false)
    }
  }

  const locked = lockSec > 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070B09] p-4 text-zinc-200 antialiased">
      <style>{`@keyframes admIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      <div className="w-full max-w-sm rounded-2xl bg-[#0D120F] p-6 ring-1 ring-white/[0.08] animate-[admIn_.3s_cubic-bezier(0.2,0,0,1)]">
        <div className="mb-5 flex flex-col items-center text-center">
          <img src="/icon.png" alt="Resale Admin" className="size-14 rounded-2xl shadow-lg" />
          <h1 className="mt-3 text-[18px] font-bold text-zinc-50">Resale Admin</h1>
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-zinc-500">
            <ShieldCheck className="size-3.5 text-[#21A038]" />
            Защищённый контур · вход по ключу
          </p>
        </div>

        {locked ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-red-500/5 px-4 py-5 text-center ring-1 ring-red-500/20">
            <Timer className="size-6 text-red-400" />
            <p className="text-[13px] font-semibold text-red-300">Вход заблокирован</p>
            <p className="text-[12px] leading-relaxed text-zinc-400">
              Слишком много неудачных попыток.
              <br />
              Повторите через{' '}
              <span className="font-mono font-bold tabular-nums text-red-300">
                {Math.floor(lockSec / 60)}:{String(lockSec % 60).padStart(2, '0')}
              </span>
            </p>
          </div>
        ) : (
          <>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && login()}
                placeholder="Ключ доступа"
                autoFocus
                autoComplete="current-password"
                className={`h-11 w-full rounded-xl bg-black/30 pl-10 pr-4 text-[14px] text-zinc-100 ring-1 outline-none transition-all placeholder:text-zinc-600 focus:ring-2 ${
                  err ? 'ring-red-500/40 focus:ring-red-500/60' : 'ring-white/10 focus:ring-[#21A038]/60'
                }`}
              />
            </div>
            {err && <p className="mt-2 text-[12px] font-semibold text-red-400">{err}</p>}

            <button
              onClick={login}
              disabled={busy || !key.trim()}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#21A038] text-[14px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(33,160,56,.7)] transition-all hover:bg-[#1F9134] active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Входим…
                </>
              ) : (
                'Войти'
              )}
            </button>
          </>
        )}

        <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
          Ключ задаётся переменной окружения ADMIN_KEY.
          <br />
          Сессия подписана HMAC и хранится 7 дней · 5 неудач = блокировка на 15 минут.
        </p>
      </div>
    </div>
  )
}
