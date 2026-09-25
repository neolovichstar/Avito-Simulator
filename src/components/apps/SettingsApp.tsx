'use client'

// Приложение «Настройки» — редизайн по макету юзера, дизайн-система «Resale Dark»:
// всегда тёмный фон #050D09, профиль сверху (аватар, @username, уровень + XP-прогресс
// в строке), секции-списки строк с иконками в зелёных плашках и ChevronRight,
// секция «Состояние системы» (БД/Кэш/ИИ-бюджет с прогресс-баром и перезагрузкой).
// Вся бизнес-логика (api.profile/blockedList/telegram*/toggleBlock/systemStatus,
// switches устройства, обои, виджеты) сохранена 1:1.
import { useCallback, useEffect, useState } from 'react'
import {
  BatteryCharging, Ban, Bot, CheckCircle2, ChevronRight, Database, Handshake, Info, Loader2, MapPin, Moon, MoonStar, NotebookText, RefreshCw,
  Send, Server, Settings as SettingsIcon, Shield, Star, Vibrate, Wallet, Zap,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS, ALL_WIDGETS, WIDGET_LABEL, type WidgetKey } from '@/lib/store'
import { levelProgress, xpForLevel } from '@/lib/economy'
import { WALLPAPERS, wallpaperPreviewStyle } from '@/lib/wallpapers'
import { fmtMoney, initials, hueColor, timeAgo } from '@/lib/format'
import { sound } from '@/lib/sound'
import type { ProfileData, BlockedSellerDTO } from '@/lib/types'

// Тёмные тоны иконок строк
const TINTS = {
  emerald: 'bg-emerald-500/15 text-emerald-400',
  sky: 'bg-sky-500/15 text-sky-400',
  amber: 'bg-amber-500/15 text-amber-400',
  red: 'bg-red-500/15 text-red-400',
  plain: 'bg-white/[0.06] text-white/60',
} as const
type Tint = keyof typeof TINTS

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/35">{title}</div>
      <div className="overflow-hidden rounded-2xl border border-emerald-500/15 bg-[#0E1F16]">{children}</div>
    </section>
  )
}

function Row({ icon, tint = 'emerald', label, value, chevron = true }: {
  icon: React.ReactNode
  tint?: Tint
  label: string
  value?: React.ReactNode
  chevron?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TINTS[tint]}`} aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{label}</div>
        {value !== null && value !== undefined && value !== '' && (
          <div className="truncate text-xs text-white/50">{value}</div>
        )}
      </div>
      {chevron && <ChevronRight className="size-4 shrink-0 text-white/25" aria-hidden="true" />}
    </div>
  )
}

// Зелёный переключатель (пилюля w-11 h-6) по дизайн-системе
function Toggle({ checked, onCheckedChange, label }: {
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
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#22C55E]' : 'bg-white/15'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

type SystemStatus = Awaited<ReturnType<typeof api.systemStatus>>

export default function SettingsApp() {
  const session = useOS((s) => s.session)
  const battery = useOS((s) => s.battery)
  const charging = useOS((s) => s.charging)
  const setCharging = useOS((s) => s.setCharging)
  const dnd = useOS((s) => s.dnd)
  const setDnd = useOS((s) => s.setDnd)
  const theme = useOS((s) => s.theme)
  const setTheme = useOS((s) => s.setTheme)
  const wallpaper = useOS((s) => s.wallpaper)
  const setWallpaper = useOS((s) => s.setWallpaper)
  const widgets = useOS((s) => s.widgets)
  const setWidgets = useOS((s) => s.setWidgets)
  // вибро-отклик интерфейса (звуки полностью убраны — остался только haptic)
  const [soundOn, setSoundOn] = useState(sound.isEnabled())
  useEffect(() => sound.subscribe(setSoundOn), [])

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
    <div
      className="flex h-full flex-col text-white"
      style={{ background: 'linear-gradient(180deg,#07130D 0%,#050D09 100%)' }}
    >
      {/* шапка приложения */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15">
          <SettingsIcon className="size-4.5 text-emerald-400" aria-hidden="true" />
        </div>
        <div className="text-[15px] font-bold text-white">Настройки</div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 [scrollbar-width:thin]">
        {error && !profile ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center">
            <p className="text-[13px] text-red-400">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 text-[13px] font-semibold text-emerald-400 transition active:opacity-70"
            >
              Повторить
            </button>
          </div>
        ) : loading && !profile ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-2">
              <div className="size-16 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.06]" />
              </div>
            </div>
            <div className="h-20 animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="flex items-center justify-center gap-2 text-[13px] text-white/40">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Загрузка профиля…
            </div>
          </div>
        ) : (
          <>
            {/* Профиль — hero-карточка */}
            <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 p-4">
              <div className="flex items-center gap-4">
                {session?.photoUrl ? (
                  <img src={session.photoUrl} alt={name} className="size-16 shrink-0 rounded-full object-cover ring-2 ring-white/20" />
                ) : (
                  <div
                    className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white ring-2 ring-white/20"
                    style={{ backgroundColor: hueColor(210) }}
                  >
                    {initials(name)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold text-white">{name}</div>
                  <div className="truncate text-xs text-white/50">@{session?.username ?? 'player'}</div>
                  {/* уровень + XP-прогресс в одной строке */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                      <Zap className="size-3" aria-hidden="true" />
                      Уровень {session?.level ?? 1}
                    </span>
                    <span className="text-[11px] tabular-nums text-white/50">{xpInLevel} / {xpNeed} XP</span>
                  </div>
                </div>
              </div>

              {/* Прогресс XP (хардкорная кривая) */}
              <div className="mt-3.5">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#22C55E] transition-all" style={{ width: `${xpPct}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-white/35">Прогресс хардкорный: на высоких уровнях XP нужен в разы больше</p>
              </div>

              {/* Рейтинг и баланс */}
              <div className="mt-3.5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.07] px-3 py-2">
                  <div className="text-[10px] text-white/45">Рейтинг</div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-white">
                    <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    {rating.toFixed(1)}
                    <span className="text-[11px] font-normal text-white/40">({ratingCount})</span>
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.07] px-3 py-2">
                  <div className="text-[10px] text-white/45">Баланс</div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-white">
                    <Wallet className="size-4 text-emerald-400" aria-hidden="true" />
                    {fmtMoney(session?.balance ?? 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Устройство */}
            <SectionCard title="Устройство">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
                  <BatteryCharging className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Зарядка подключена</div>
                  <div className="text-xs text-white/50">Уровень батареи: {battery}%</div>
                </div>
                <Toggle checked={charging} onCheckedChange={setCharging} label="Зарядка подключена" />
              </div>
              <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
                  <Moon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Тёмная тема</div>
                  <div className="text-xs text-white/50">{theme === 'dark' ? 'Включена: тёмный интерфейс ОС' : 'Выключена: светлый интерфейс'}</div>
                </div>
                <Toggle
                  checked={theme === 'dark'}
                  onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
                  label="Тёмная тема"
                />
              </div>
              <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
                  <MoonStar className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Не беспокоить</div>
                  <div className="text-xs text-white/50">{dnd ? 'Тосты скрыты — всё копится в шторке' : 'Уведомления всплывают поверх экрана'}</div>
                </div>
                <Toggle checked={dnd} onCheckedChange={setDnd} label="Не беспокоить" />
              </div>
              <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
                  <Vibrate className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Вибро-отклик</div>
                  <div className="text-xs text-white/50">{soundOn ? 'Вибрация на действия и события включена' : 'Полная тишина: без вибрации'}</div>
                </div>
                <Toggle
                  checked={soundOn}
                  onCheckedChange={(v) => sound.setEnabled(v)}
                  label="Вибро-отклик"
                />
              </div>
            </SectionCard>

            {/* Игрок */}
            <SectionCard title="Игрок">
              <div className="divide-y divide-white/[0.06]">
                <Row icon={<MapPin className="size-5" />} label="Город" value={session?.city ?? '—'} />
                <Row icon={<NotebookText className="size-5" />} label="О себе" value={session?.bio ?? 'Не указано'} />
                <Row icon={<Handshake className="size-5" />} label="Сделок" value={dealsCount !== null ? String(dealsCount) : null} />
              </div>
            </SectionCard>

            {/* Персонализация: обои и виджеты */}
            <SectionCard title="Персонализация">
              <div className="px-4 py-3">
                <div className="text-sm font-medium text-white">Обои</div>
                <div className="mt-2.5 grid grid-cols-4 gap-2.5">
                  {WALLPAPERS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      aria-label={`Обои: ${w.name}`}
                      aria-pressed={wallpaper === w.id}
                      onClick={() => setWallpaper(w.id)}
                      className={`group relative h-16 overflow-hidden rounded-xl border transition active:scale-95 ${
                        wallpaper === w.id ? 'border-[#22C55E] ring-2 ring-[#22C55E]/40' : 'border-white/10 hover:border-white/25'
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
              <div className="border-t border-white/[0.06] px-4 py-3">
                <div className="text-sm font-medium text-white">Виджеты</div>
                <div className="mt-1 text-xs text-white/50">Что показывать на домашнем экране и рабочем столе</div>
                <div className="mt-2 space-y-1">
                  {ALL_WIDGETS.map((w: WidgetKey) => {
                    const on = widgets.includes(w)
                    return (
                      <div key={w} className="flex items-center justify-between rounded-lg px-1 py-1.5">
                        <span className="text-sm text-white/80">{WIDGET_LABEL[w]}</span>
                        <Toggle
                          checked={on}
                          onCheckedChange={(v) => {
                            const next = v ? [...widgets, w] : widgets.filter((x) => x !== w)
                            setWidgets(next)
                          }}
                          label={`Виджет: ${WIDGET_LABEL[w]}`}
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
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400" aria-hidden="true">
                  <Send className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Уведомления в Telegram</div>
                  {tg === null ? (
                    <div className="text-xs text-white/40">Проверяем привязку…</div>
                  ) : tg.linked ? (
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                      Привязано{tg.tgUsername ? `: @${tg.tgUsername}` : ''} — бот присылает сделки, ставки и налоги
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-white/50">
                      Привяжите аккаунт — бот @{tg.botUsername} сообщит о сделке, перебитой ставке, доставке и налогах
                    </div>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0 text-white/25" aria-hidden="true" />
              </div>

              {tg !== null && !tg.linked && (
                <div className="border-t border-white/[0.06] px-4 py-3">
                  {tgCode ? (
                    <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5">
                      <div className="text-[11px] font-medium text-white/60">Ваш код привязки (живёт 15 минут):</div>
                      <div className="mt-1.5 select-all text-center font-mono text-2xl font-bold tracking-[0.3em] text-sky-300">
                        {tgCode}
                      </div>
                      <ol className="mt-2.5 space-y-1 text-[11px] leading-relaxed text-white/60">
                        <li>1. Откройте в Telegram бота <span className="font-semibold text-white">@{tg.botUsername}</span></li>
                        <li>2. Нажмите «Старт» и отправьте команду</li>
                        <li>3. Затем напишите боту: <span className="font-mono font-semibold text-white">/start {tgCode}</span></li>
                      </ol>
                      <div className="mt-2 text-[10px] text-white/35">После привязки этот код погасится автоматически.</div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-center rounded-xl bg-[#22C55E] text-[13px] font-bold text-[#052E16] transition active:scale-[0.98] disabled:opacity-60"
                      disabled={tgBusy}
                      onClick={() => void getTgCode()}
                    >
                      {tgBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Получить код привязки'}
                    </button>
                  )}
                </div>
              )}

              {tg?.linked && (
                <div className="border-t border-white/[0.06] px-4 py-3">
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-[11px] font-semibold text-red-400 transition active:scale-[0.98] disabled:opacity-60"
                    disabled={tgBusy}
                    onClick={() => void unlinkTg()}
                  >
                    {tgBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : 'Отвязать Telegram'}
                  </button>
                </div>
              )}
            </SectionCard>

            {/* Безопасность: чёрный список продавцов */}
            <SectionCard title={`Безопасность · чёрный список${blocked?.length ? ` (${blocked.length})` : ''}`}>
              {blocked === null ? (
                <div className="flex items-center justify-center gap-2 px-4 py-4 text-xs text-white/40">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Загружаем…
                </div>
              ) : blocked.length === 0 ? (
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/50" aria-hidden="true">
                    <Shield className="size-5" />
                  </div>
                  <p className="text-xs leading-relaxed text-white/50">
                    Список пуст. Заблокированные продавцы исчезнут из ленты и перестанут писать вам первыми.
                    Заблокировать можно в шите «Пожаловаться» на карточке любого объявления.
                  </p>
                </div>
              ) : (
                blocked.map((b, i) => (
                  <div key={b.sellerId} className={i > 0 ? 'border-t border-white/[0.06]' : ''}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      {b.photoUrl ? (
                        <img src={b.photoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: hueColor(b.sellerId.length * 47 % 360) }}
                          aria-hidden="true"
                        >
                          {initials(b.name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{b.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-white/50">
                          <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                          {b.rating > 0 ? b.rating.toFixed(1) : 'новый'}
                          {b.ratingCount > 0 && <span className="text-white/35">({b.ratingCount})</span>}
                          <span aria-hidden="true">·</span>
                          <MapPin className="size-3" aria-hidden="true" /> {b.city}
                        </div>
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-white/35">
                          <Ban className="size-3" aria-hidden="true" /> заблокирован {timeAgo(b.blockedAt)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="flex h-9 shrink-0 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 px-3 text-[11px] font-semibold text-red-400 transition active:scale-[0.98] disabled:opacity-60"
                        disabled={unblocking === b.sellerId}
                        onClick={() => void unblock(b)}
                      >
                        {unblocking === b.sellerId ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : 'Разблокировать'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </SectionCard>

            {/* Состояние системы */}
            <SectionCard title="Состояние системы">
              <div className="divide-y divide-white/[0.06]">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
                    <Database className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      База данных
                      {sys && (
                        <span
                          className={`size-2 shrink-0 rounded-full ${sys.db.ok ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' : 'bg-red-400'}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="text-xs text-white/50">
                      {sys ? `SQLite (Prisma) · запрос ${sys.db.latencyMs} мс` : 'проверяем…'}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${sys ? (sys.db.ok ? 'text-emerald-400' : 'text-red-400') : 'text-white/30'}`}>
                    {sys ? (sys.db.ok ? 'Норма' : 'Сбой') : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400" aria-hidden="true">
                    <Zap className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      Кэш
                      {sys ? (
                        sys.redis.alive ? (
                          <span className="size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" aria-hidden="true" />
                        ) : (
                          <span className="size-2 shrink-0 rounded-full bg-red-400" aria-hidden="true" />
                        )
                      ) : (
                        <Loader2 className="size-3 animate-spin text-white/30" aria-hidden="true" />
                      )}
                    </div>
                    <div className="text-xs text-white/50">
                      {sys
                        ? sys.redis.alive
                          ? `Upstash · подключён · ${sys.redis.latencyMs ?? '—'} мс`
                          : sys.redis.enabled
                            ? 'недоступен — лимиты на памяти'
                            : 'не настроен — лимиты на памяти'
                        : 'проверяем…'}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${sys ? (sys.redis.alive ? 'text-emerald-400' : 'text-red-400') : 'text-white/30'}`}>
                    {sys ? (sys.redis.alive ? 'Норма' : 'Недоступен') : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400" aria-hidden="true">
                    <Bot className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white">ИИ-бюджет</div>
                    <div className="text-xs text-white/50">
                      {sys
                        ? `${sys.ai.used} из ${sys.ai.limit} · только в чатах · всё остальное на скриптах`
                        : 'проверяем…'}
                    </div>
                  </div>
                  {sys && (
                    <div className="w-16 shrink-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${sys.ai.used / sys.ai.limit > 0.85 ? 'bg-red-400' : 'bg-[#22C55E]'}`}
                          style={{ width: `${Math.min(100, Math.round((sys.ai.used / sys.ai.limit) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
                    <Server className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white">Сервер</div>
                    <div className="text-xs text-white/50">
                      {sys ? `аптайм ${Math.floor(sys.uptimeSec / 60)} мин ${sys.uptimeSec % 60} с · Next.js 16` : 'проверяем…'}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-emerald-400">{sys ? 'Норма' : '—'}</span>
                </div>
              </div>
              <div className="border-t border-white/[0.06] px-4 py-3">
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] text-[12px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
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
                  {sysBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3.5" aria-hidden="true" />}
                  Перезагрузить
                </button>
              </div>
            </SectionCard>

            {/* Об игре */}
            <SectionCard title="Об игре">
              <div className="divide-y divide-white/[0.06]">
                <Row
                  icon={<Info className="size-5" />}
                  tint="plain"
                  label="Resale"
                  value="Игра-симулятор перепродажи"
                />
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/50">
                      версия 2.5.0
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/50">
                    «Resale» — игра-симулятор перепродажи. Экономика живая: цены двигают ИИ-боты и реальные
                    игроки. Налоги, банк, рынок — как в жизни.
                  </p>
                </div>
              </div>
            </SectionCard>

            <button
              type="button"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              disabled={refreshing}
              onClick={refreshProfile}
            >
              {refreshing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              Обновить профиль
            </button>
          </>
        )}
      </div>
    </div>
  )
}
