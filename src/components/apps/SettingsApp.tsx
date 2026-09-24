'use client'

// Приложение «Настройки» — стиль Android-настроек: белый фон, секции-карточки.
import { useCallback, useEffect, useState } from 'react'
import {
  BatteryCharging, Ban, Bot, CheckCircle2, Database, Handshake, Info, Loader2, MapPin, Moon, MoonStar, NotebookText, RefreshCw,
  Send, Server, Shield, Star, Volume2, Wallet, Zap,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS, ALL_WIDGETS, WIDGET_LABEL, type WidgetKey } from '@/lib/store'
import { levelProgress, xpForLevel } from '@/lib/economy'
import { WALLPAPERS, wallpaperPreviewStyle } from '@/lib/wallpapers'
import { fmtMoney, initials, hueColor, timeAgo } from '@/lib/format'
import type { ProfileData, BlockedSellerDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

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

type SystemStatus = Awaited<ReturnType<typeof api.systemStatus>>

export default function SettingsApp() {
  const session = useOS((s) => s.session)
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const setCharging = useOS((s) => s.setCharging)
  const soundOn = useOS((s) => s.soundOn)
  const dnd = useOS((s) => s.dnd)
  const setDnd = useOS((s) => s.setDnd)
  const setSound = useOS((s) => s.setSound)
  const theme = useOS((s) => s.theme)
  const setTheme = useOS((s) => s.setTheme)
  const wallpaper = useOS((s) => s.wallpaper)
  const setWallpaper = useOS((s) => s.setWallpaper)
  const widgets = useOS((s) => s.widgets)
  const setWidgets = useOS((s) => s.setWidgets)

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [sys, setSys] = useState<SystemStatus | null>(null)
  const [sysBusy, setSysBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // чёрный список продавцов
  const [blocked, setBlocked] = useState<BlockedSellerDTO[] | null>(null)
  const [unblocking, setUnblocking] = useState<string | null>(null)
  // telegram-бот
  const [tg, setTg] = useState<{ linked: boolean; tgUsername: string | null; botUsername: string } | null>(null)
  const [tgCode, setTgCode] = useState<string | null>(null)
  const [tgBusy, setTgBusy] = useState(false)

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
    api.blockedList()
      .then((r) => setBlocked(r.items))
      .catch(() => setBlocked([]))
    api.telegramStatus().then(setTg).catch(() => setTg({ linked: false, tgUsername: null, botUsername: 'resalesimbot' }))
    const loadSys = () => api.systemStatus().then(setSys).catch(() => setSys(null))
    loadSys()
    const t = setInterval(loadSys, 30_000)
    return () => clearInterval(t)
  }, [load])

  const getTgCode = async () => {
    setTgBusy(true)
    try {
      const r = await api.telegramCode()
      setTgCode(r.code)
    } catch (e) {
      useOS.getState().pushToast('Telegram', e instanceof ApiError ? e.message : 'Не удалось получить код')
    } finally {
      setTgBusy(false)
    }
  }

  const unlinkTg = async () => {
    setTgBusy(true)
    try {
      await api.telegramUnlink()
      setTg({ linked: false, tgUsername: null, botUsername: tg?.botUsername ?? 'resalesimbot' })
      setTgCode(null)
      useOS.getState().pushToast('Telegram', 'Аккаунт отвязан')
    } catch {
      useOS.getState().pushToast('Telegram', 'Не удалось отвязать')
    } finally {
      setTgBusy(false)
    }
  }

  const unblock = async (b: BlockedSellerDTO) => {
    setUnblocking(b.sellerId)
    try {
      await api.toggleBlock(b.sellerId)
      setBlocked((prev) => (prev ? prev.filter((x) => x.sellerId !== b.sellerId) : prev))
      useOS.getState().pushToast('Чёрный список', `${b.name} разблокирован — объявления снова в ленте`)
    } catch {
      useOS.getState().pushToast('Чёрный список', 'Не удалось разблокировать')
    } finally {
      setUnblocking(null)
    }
  }

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
  const xpTotal = session?.xp ?? 0
  const lvl = session?.level ?? 1
  const curLvlXp = xpForLevel(lvl)
  const nextLvlXp = xpForLevel(lvl + 1)
  const xpInLevel = xpTotal - curLvlXp
  const xpNeed = nextLvlXp - curLvlXp
  const xpPct = levelProgress(xpTotal)

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

              {/* Прогресс XP (хардкорная кривая) */}
              <div className="mt-4">
                <div className="flex justify-between text-[11px] text-neutral-500">
                  <span>Опыт</span>
                  <span>
                    {xpInLevel} / {xpNeed} XP
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-[#21A038] transition-all" style={{ width: `${xpPct}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-neutral-400">Прогресс хардкорный: на высоких уровнях XP нужен в разы больше</p>
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
              <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  <MoonStar className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800">Не беспокоить</div>
                  <div className="text-xs text-neutral-500">{dnd ? 'Тосты скрыты — всё копится в шторке' : 'Уведомления всплывают поверх экрана'}</div>
                </div>
                <Switch checked={dnd} onCheckedChange={setDnd} aria-label="Не беспокоить" />
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

            {/* Персонализация: обои и виджеты */}
            <SectionCard title="Персонализация">
              <div className="px-4 py-3">
                <div className="text-sm font-medium text-neutral-800">Обои</div>
                <div className="mt-2.5 grid grid-cols-4 gap-2.5">
                  {WALLPAPERS.map((w) => (
                    <button
                      key={w.id}
                      aria-label={`Обои: ${w.name}`}
                      aria-pressed={wallpaper === w.id}
                      onClick={() => setWallpaper(w.id)}
                      className={`group relative h-16 overflow-hidden rounded-xl border transition active:scale-95 ${
                        wallpaper === w.id ? 'border-[#965EEB] ring-2 ring-[#965EEB]/40' : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                      style={wallpaperPreviewStyle(w.id)}
                    >
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-3 text-[9px] font-semibold text-white">
                        {w.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-neutral-100 px-4 py-3">
                <div className="text-sm font-medium text-neutral-800">Виджеты</div>
                <div className="mt-1 text-xs text-neutral-500">Что показывать на домашнем экране и рабочем столе</div>
                <div className="mt-2 space-y-1">
                  {ALL_WIDGETS.map((w: WidgetKey) => {
                    const on = widgets.includes(w)
                    return (
                      <div key={w} className="flex items-center justify-between rounded-lg px-1 py-1.5">
                        <span className="text-sm text-neutral-700">{WIDGET_LABEL[w]}</span>
                        <Switch
                          checked={on}
                          onCheckedChange={(v) => {
                            const next = v ? [...widgets, w] : widgets.filter((x) => x !== w)
                            setWidgets(next)
                          }}
                          aria-label={`Виджет: ${WIDGET_LABEL[w]}`}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </SectionCard>

            {/* Telegram-бот: уведомления и команды */}
            <SectionCard title="Telegram">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#2AABEE]/10 text-[#2AABEE]">
                  <Send className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800">Уведомления в Telegram</div>
                  {tg === null ? (
                    <div className="text-xs text-neutral-400">Проверяем привязку…</div>
                  ) : tg.linked ? (
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 className="size-3.5" />
                      Привязано{tg.tgUsername ? `: @${tg.tgUsername}` : ''} — бот присылает сделки, ставки и налоги
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-neutral-500">
                      Привяжите аккаунт — бот @{tg.botUsername} сообщит о сделке, перебитой ставке, доставке и налогах
                    </div>
                  )}
                </div>
              </div>

              {tg !== null && !tg.linked && (
                <div className="border-t border-neutral-100 px-4 py-3">
                  {tgCode ? (
                    <div className="rounded-xl border border-[#2AABEE]/30 bg-[#2AABEE]/5 p-3.5">
                      <div className="text-[11px] font-medium text-neutral-600">Ваш код привязки (живёт 15 минут):</div>
                      <div className="mt-1.5 select-all text-center font-mono text-2xl font-bold tracking-[0.3em] text-[#2AABEE]">
                        {tgCode}
                      </div>
                      <ol className="mt-2.5 space-y-1 text-[11px] leading-relaxed text-neutral-600">
                        <li>1. Откройте в Telegram бота <span className="font-semibold">@{tg.botUsername}</span></li>
                        <li>2. Нажмите «Старт» и отправьте команду</li>
                        <li>3. Затем напишите боту: <span className="font-mono font-semibold">/start {tgCode}</span></li>
                      </ol>
                      <div className="mt-2 text-[10px] text-neutral-400">После привязки этот код погасится автоматически.</div>
                    </div>
                  ) : (
                    <Button
                      className="h-10 w-full rounded-xl bg-[#2AABEE] text-[13px] font-semibold text-white hover:bg-[#2AABEE]/90"
                      disabled={tgBusy}
                      onClick={() => void getTgCode()}
                    >
                      {tgBusy ? <Loader2 className="size-4 animate-spin" /> : 'Получить код привязки'}
                    </Button>
                  )}
                </div>
              )}

              {tg?.linked && (
                <div className="border-t border-neutral-100 px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full rounded-lg border-red-200 text-[11px] font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={tgBusy}
                    onClick={() => void unlinkTg()}
                  >
                    {tgBusy ? <Loader2 className="size-3.5 animate-spin" /> : 'Отвязать Telegram'}
                  </Button>
                </div>
              )}
            </SectionCard>

            {/* Безопасность: чёрный список продавцов */}
            <SectionCard title={`Безопасность · чёрный список${blocked?.length ? ` (${blocked.length})` : ''}`}>
              {blocked === null ? (
                <div className="flex items-center justify-center gap-2 px-4 py-4 text-xs text-neutral-400">
                  <Loader2 className="size-3.5 animate-spin" /> Загружаем…
                </div>
              ) : blocked.length === 0 ? (
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                    <Shield className="size-4" />
                  </div>
                  <p className="text-xs leading-relaxed text-neutral-500">
                    Список пуст. Заблокированные продавцы исчезнут из ленты и перестанут писать вам первыми.
                    Заблокировать можно в шите «Пожаловаться» на карточке любого объявления.
                  </p>
                </div>
              ) : (
                blocked.map((b, i) => (
                  <div key={b.sellerId} className={i > 0 ? 'border-t border-neutral-100' : ''}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      {b.photoUrl ? (
                        <img src={b.photoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: hueColor(b.sellerId.length * 47 % 360) }}
                          aria-hidden
                        >
                          {initials(b.name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-neutral-800">{b.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                          <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                          {b.rating > 0 ? b.rating.toFixed(1) : 'новый'}
                          {b.ratingCount > 0 && <span className="text-neutral-400">({b.ratingCount})</span>}
                          <span aria-hidden>·</span>
                          <MapPin className="size-3" aria-hidden /> {b.city}
                        </div>
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-neutral-400">
                          <Ban className="size-3" aria-hidden /> заблокирован {timeAgo(b.blockedAt)}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 rounded-lg border-red-200 px-3 text-[11px] font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={unblocking === b.sellerId}
                        onClick={() => void unblock(b)}
                      >
                        {unblocking === b.sellerId ? <Loader2 className="size-3.5 animate-spin" /> : 'Разблокировать'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </SectionCard>

            {/* Инфраструктура */}
            <SectionCard title="Инфраструктура">
              <div className="divide-y divide-neutral-100">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                    <Zap className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                      Redis-кэш
                      {sys ? (
                        sys.redis.alive ? (
                          <span className="size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" aria-hidden />
                        ) : (
                          <span className="size-2 shrink-0 rounded-full bg-red-400" aria-hidden />
                        )
                      ) : (
                        <Loader2 className="size-3 animate-spin text-neutral-300" />
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {sys
                        ? sys.redis.alive
                          ? `Upstash · подключён · ${sys.redis.latencyMs ?? '—'} мс`
                          : sys.redis.enabled
                            ? 'недоступен — лимиты на памяти'
                            : 'не настроен — лимиты на памяти'
                        : 'проверяем…'}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 rounded-lg px-2.5 text-[11px] font-semibold"
                    disabled={sysBusy}
                    onClick={async () => {
                      setSysBusy(true)
                      try {
                        setSys(await api.systemStatus())
                      } catch {
                        /* статус остаётся прежним */
                      } finally {
                        setSysBusy(false)
                      }
                    }}
                  >
                    {sysBusy ? <Loader2 className="size-3.5 animate-spin" /> : 'Проверить'}
                  </Button>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                    <Database className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                      База данных
                      {sys && (
                        <span
                          className={`size-2 shrink-0 rounded-full ${sys.db.ok ? 'bg-emerald-500' : 'bg-red-400'}`}
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {sys ? `SQLite (Prisma) · запрос ${sys.db.latencyMs} мс` : 'проверяем…'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Bot className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-neutral-800">ИИ-запросы сегодня</div>
                    <div className="text-xs text-neutral-500">
                      {sys
                        ? `${sys.ai.used} из ${sys.ai.limit} · только в чатах · всё остальное на скриптах`
                        : 'проверяем…'}
                    </div>
                  </div>
                  {sys && (
                    <div className="w-16 shrink-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className={`h-full rounded-full ${sys.ai.used / sys.ai.limit > 0.85 ? 'bg-red-400' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, Math.round((sys.ai.used / sys.ai.limit) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                    <Server className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-neutral-800">Сервер</div>
                    <div className="text-xs text-neutral-500">
                      {sys ? `аптайм ${Math.floor(sys.uptimeSec / 60)} мин ${sys.uptimeSec % 60} с · Next.js 16` : 'проверяем…'}
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Об игре */}
            <SectionCard title="Об игре">
              <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Info className="size-4 text-neutral-400" />
                  <span className="text-sm font-medium text-neutral-800">Сделка</span>
                  <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                    версия 2.2.0
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                  «Сделка» — игра-симулятор перепродажи. Экономика живая: цены двигают ИИ-боты и реальные
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
