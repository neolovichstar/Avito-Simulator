'use client'

// Приложение «Настройки» — стиль Android-настроек: белый фон, секции-карточки.
import { useCallback, useEffect, useState } from 'react'
import {
  BatteryCharging, Handshake, Info, Loader2, MapPin, Moon, NotebookText, RefreshCw,
  Star, Volume2, Wallet,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney, initials, hueColor } from '@/lib/format'
import type { ProfileData } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const XP_PER_LEVEL = 500

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{title}</div>
      <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm">{children}</div>
    </div>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-neutral-800">{label}</div>
        {value !== null && value !== undefined && value !== '' && (
          <div className="truncate text-xs text-neutral-500">{value}</div>
        )}
      </div>
    </div>
  )
}

export default function SettingsApp() {
  const session = useOS((s) => s.session)
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const setCharging = useOS((s) => s.setCharging)
  const soundOn = useOS((s) => s.soundOn)
  const setSound = useOS((s) => s.setSound)
  const theme = useOS((s) => s.theme)
  const setTheme = useOS((s) => s.setTheme)

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const p = await api.profile()
      setProfile(p)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить профиль')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refreshProfile = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
    useOS.getState().pushToast('Настройки', 'Профиль обновлён')
  }

  const name = session?.displayName ?? 'Игрок'
  const rating = profile?.rating ?? (session && session.ratingCount > 0 ? session.ratingSum / session.ratingCount : 0)
  const ratingCount = profile?.reviews.length ?? session?.ratingCount ?? 0
  const dealsCount = profile?.dealsCount ?? null
  const xpInLevel = (session?.xp ?? 0) % XP_PER_LEVEL
  const xpPct = Math.min(100, Math.round((xpInLevel / XP_PER_LEVEL) * 100))

  return (
    <div className="h-full flex flex-col bg-white text-neutral-900">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 [scrollbar-width:thin]">
        {error && !profile ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <Button className="mt-4 rounded-xl" onClick={load}>
              Повторить
            </Button>
          </div>
        ) : loading && !profile ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-2">
              <div className="size-16 rounded-full bg-neutral-200 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 rounded bg-neutral-200 animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-neutral-200 animate-pulse" />
              </div>
            </div>
            <div className="h-20 rounded-2xl bg-neutral-200 animate-pulse" />
            <div className="h-32 rounded-2xl bg-neutral-200 animate-pulse" />
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
              <Loader2 className="size-4 animate-spin" /> Загрузка профиля…
            </div>
          </div>
        ) : (
          <>
            {/* Профиль */}
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-4">
                {session?.photoUrl ? (
                  <img src={session.photoUrl} alt={name} className="size-16 shrink-0 rounded-full object-cover" />
                ) : (
                  <div
                    className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
                    style={{ backgroundColor: hueColor(210) }}
                  >
                    {initials(name)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold">{name}</div>
                  <div className="truncate text-xs text-neutral-500">@{session?.username ?? 'player'}</div>
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Уровень {session?.level ?? 1}
                  </div>
                </div>
              </div>

              {/* Прогресс XP */}
              <div className="mt-4">
                <div className="flex justify-between text-[11px] text-neutral-500">
                  <span>Опыт</span>
                  <span>
                    {xpInLevel} / {XP_PER_LEVEL} XP
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-[#21A038] transition-all" style={{ width: `${xpPct}%` }} />
                </div>
              </div>

              {/* Рейтинг и баланс */}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3.5">
                <div>
                  <div className="text-[11px] text-neutral-500">Рейтинг</div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
                    <Star className="size-4 fill-yellow-400 text-yellow-400" />
                    {rating.toFixed(1)}
                    <span className="text-[11px] font-normal text-neutral-400">({ratingCount})</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-neutral-500">Баланс</div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
                    <Wallet className="size-4 text-neutral-400" />
                    {fmtMoney(session?.balance ?? 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Устройство */}
            <SectionCard title="Устройство">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  <BatteryCharging className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800">Зарядка подключена</div>
                  <div className="text-xs text-neutral-500">Уровень батареи: {battery}%</div>
                </div>
                <Switch checked={charging} onCheckedChange={setCharging} />
              </div>
              <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  <Volume2 className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800">Звук</div>
                  <div className="text-xs text-neutral-500">{soundOn ? 'Включён' : 'Выключен'}</div>
                </div>
                <Switch checked={soundOn} onCheckedChange={setSound} />
              </div>
              <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  <Moon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800">Тёмная тема</div>
                  <div className="text-xs text-neutral-500">{theme === 'dark' ? 'Включена: тёмный интерфейс ОС' : 'Выключена: светлый интерфейс'}</div>
                </div>
                <Switch
                  checked={theme === 'dark'}
                  onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
                  aria-label="Тёмная тема"
                />
              </div>
            </SectionCard>

            {/* Игрок */}
            <SectionCard title="Игрок">
              <Row icon={<MapPin className="size-4" />} label="Город" value={session?.city ?? '—'} />
              <div className="border-t border-neutral-100" />
              <Row icon={<NotebookText className="size-4" />} label="О себе" value={session?.bio ?? 'Не указано'} />
              <div className="border-t border-neutral-100" />
              <Row icon={<Handshake className="size-4" />} label="Сделок" value={dealsCount !== null ? String(dealsCount) : null} />
            </SectionCard>

            {/* Об игре */}
            <SectionCard title="Об игре">
              <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Info className="size-4 text-neutral-400" />
                  <span className="text-sm font-medium text-neutral-800">Avito Simulator</span>
                  <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                    версия 1.0.0
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                  Avito Simulator — игра-симулятор перепродажи. Экономика живая: цены двигают ИИ-боты и реальные
                  игроки. Налоги, банк, рынок — как в жизни.
                </p>
              </div>
            </SectionCard>

            <Button
              variant="outline"
              className="h-11 w-full rounded-xl text-sm font-semibold"
              disabled={refreshing}
              onClick={refreshProfile}
            >
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Обновить профиль
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
