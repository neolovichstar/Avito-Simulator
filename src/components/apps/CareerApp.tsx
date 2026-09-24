'use client'

// Приложение «Карьера» — игровой профиль: кольцо уровня, серия входов,
// задания с прогрессом и достижения с медалями трёх достоинств.
// Светлый-first интерфейс: фиолетовый герой + светлый лист; тёмная тема ОС
// инвертируется через .theme-dark в globals.css.
import { useCallback, useEffect, useState } from 'react'
import {
  CalendarClock, CheckCircle2, Coins, Flame, Loader2, Lock, Medal, Trophy, Zap,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtMoney } from '@/lib/format'
import type { AchievementDTO, CareerData, QuestDTO, BonusState } from '@/lib/types'
import { Button } from '@/components/ui/button'

const VIOLET = '#7c5cff'

function LevelRing({ level, progress }: { level: number; progress: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(100, Math.max(0, progress)) / 100)
  return (
    <div className="relative size-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="size-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="76" y2="76">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#c4b5fd" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold leading-none text-white tabular-nums">{level}</span>
        <span className="text-[8px] uppercase tracking-widest text-violet-200/70">ур.</span>
      </div>
    </div>
  )
}

// медаль достижения по величине награды
function medalTier(reward: number): { ring: string; chip: string; icon: string; label: string } {
  if (reward >= 50000) return { ring: 'bg-amber-100', chip: 'border-amber-200 bg-amber-50 text-amber-700', icon: 'text-amber-500', label: 'Золото' }
  if (reward >= 15000) return { ring: 'bg-slate-100', chip: 'border-slate-200 bg-slate-50 text-slate-600', icon: 'text-slate-500', label: 'Серебро' }
  return { ring: 'bg-orange-100', chip: 'border-orange-200 bg-orange-50 text-orange-700', icon: 'text-orange-500', label: 'Бронза' }
}

function AchievementCard({ a }: { a: AchievementDTO }) {
  const tier = medalTier(a.reward)
  return (
    <div
      className={
        'relative flex flex-col overflow-hidden rounded-2xl border p-3.5 ' +
        (a.unlocked ? 'border-neutral-200 bg-white shadow-sm' : 'border-neutral-200 bg-neutral-50')
      }
    >
      {/* декоративная полоса для открытых */}
      {a.unlocked && <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#a78bfa] to-transparent" aria-hidden />}
      <div className="flex items-start justify-between">
        <div className={'relative flex size-11 items-center justify-center rounded-2xl ' + (a.unlocked ? tier.ring : 'bg-neutral-100')}>
          <Medal className={'size-5.5 ' + (a.unlocked ? tier.icon : 'text-neutral-400')} aria-hidden />
          {!a.unlocked && (
            <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-neutral-200 bg-white">
              <Lock className="size-2.5 text-neutral-500" aria-hidden />
            </span>
          )}
        </div>
        <span className={'rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ' + (a.unlocked ? tier.chip : 'border-neutral-200 bg-neutral-100 text-neutral-400')}>
          {tier.label}
        </span>
      </div>
      <div className={'mt-2.5 text-[13px] font-semibold leading-snug ' + (a.unlocked ? 'text-neutral-900' : 'text-neutral-400')}>
        {a.title}
      </div>
      <div className={'mt-0.5 flex-1 text-[11px] leading-relaxed ' + (a.unlocked ? 'text-neutral-500' : 'text-neutral-400')}>
        {a.desc}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-emerald-600">+{fmtMoney(a.reward)}</span>
        {a.unlocked && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
            <CheckCircle2 className="size-2.5" aria-hidden /> Открыто
          </span>
        )}
      </div>
    </div>
  )
}

type Tab = 'quests' | 'achievements'

export default function CareerApp() {
  const [data, setData] = useState<CareerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('quests')
  const [claimBusy, setClaimBusy] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [bonus, setBonus] = useState<BonusState | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const d = await api.career()
      setData(d)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить карьеру')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    api.bonusState().then(setBonus).catch(() => {})
  }, [load])

  const claim = async (quest: QuestDTO) => {
    setClaimBusy(quest.id)
    setClaimError(null)
    try {
      const res = await api.claimQuest(quest.questId)
      const os = useOS.getState()
      os.refreshSession({ balance: res.balance, xp: res.xp })
      os.pushToast('Карьера', `Награда получена: +${fmtMoney(quest.reward)} и +${quest.xpReward} XP`)
      await load()
    } catch (e) {
      setClaimError(e instanceof ApiError ? e.message : 'Не удалось забрать награду')
    } finally {
      setClaimBusy(null)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'quests', label: 'Задания' },
    { key: 'achievements', label: 'Достижения' },
  ]

  const unlocked = data?.unlockedCount ?? 0
  const total = data?.totalCount ?? 0

  return (
    <div className="flex h-full flex-col bg-[#f4f3fb] text-neutral-900">
      {/* ---------- герой: кольцо уровня + профиль (фирменный фиолетовый блок) ---------- */}
      <div className="relative shrink-0 overflow-hidden px-4 pb-5 pt-4 text-white">
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 100% at 20% 0%, #2b1d6e 0%, #120e2e 62%), linear-gradient(180deg, #17114a 0%, #120e2e 100%)' }}
          aria-hidden
        />
        <div className="relative flex items-center gap-4">
          {data ? <LevelRing level={data.level} progress={data.levelProgress} /> : <div className="size-[76px] animate-pulse rounded-full bg-white/15" />}
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold">Карьера</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-violet-200/60">
              Прогресс хардкорный: опыт растёт только за сделки
            </div>
            {/* XP-полоса */}
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#a78bfa] to-[#c4b5fd] transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, data?.levelProgress ?? 0))}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-violet-200/60">
              <span>Прогресс уровня</span>
              <span className="tabular-nums">{data?.levelProgress ?? 0}%</span>
            </div>
          </div>
        </div>

        {/* мини-статы */}
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Medal className="size-4 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-violet-200/60">Достижения</div>
              <div className="text-sm font-bold tabular-nums">{unlocked}/{total}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Trophy className="size-4 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-violet-200/60">Заданий сегодня</div>
              <div className="text-sm font-bold tabular-nums">{data?.quests.length ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- контент ---------- */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3 pt-4">
            <div className="h-11 animate-pulse rounded-2xl bg-neutral-200/80" />
            <div className="h-28 animate-pulse rounded-2xl bg-neutral-200/80" />
            <div className="h-28 animate-pulse rounded-2xl bg-neutral-200/80" />
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
              <Loader2 className="size-4 animate-spin" /> Загрузка профиля…
            </div>
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button
              className="mt-4 h-11 rounded-xl px-6 text-sm font-semibold text-white"
              style={{ backgroundColor: VIOLET }}
              onClick={() => void load()}
            >
              Повторить
            </Button>
          </div>
        ) : data ? (
          <>
            {/* Ежедневный бонус за вход + серия */}
            {bonus && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                    <Flame className="size-5 text-amber-600" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-neutral-900">Бонус за вход</div>
                    <div className="text-[11px] text-neutral-500">
                      {bonus.claimedToday
                        ? `Серия ${bonus.streak} дн. · получено сегодня`
                        : `Серия ${bonus.streak} дн. · завтра +${fmtMoney(bonus.nextReward)}`}
                    </div>
                  </div>
                  <div
                    className={
                      'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ' +
                      (bonus.claimedToday ? 'bg-neutral-200 text-neutral-500' : 'bg-amber-400 text-amber-950')
                    }
                  >
                    {bonus.claimedToday ? 'Завтра' : fmtMoney(bonus.nextReward)}
                  </div>
                </div>
                {/* календарь серии: 7 точек */}
                <div className="mt-3 flex items-center gap-1.5">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className={
                        'flex-1 rounded-full py-1 text-center text-[9px] font-bold ' +
                        (i < bonus.streak % 7 || (bonus.streak > 0 && bonus.streak % 7 === 0)
                          ? 'bg-amber-400 text-amber-950'
                          : 'bg-neutral-200 text-neutral-400')
                      }
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 text-[9px] text-neutral-400">Неделя входов подряд — максимальный множитель</div>
              </div>
            )}

            {/* Табы */}
            <div className="grid grid-cols-2 rounded-2xl bg-neutral-100 p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    'h-11 rounded-xl text-sm transition ' +
                    (tab === t.key ? 'font-semibold text-white' : 'font-medium text-neutral-500 hover:text-neutral-700')
                  }
                  style={tab === t.key ? { backgroundColor: VIOLET } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Задания */}
            {tab === 'quests' && (
              <div className="flex flex-col gap-3">
                {claimError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {claimError}
                  </div>
                )}

                {data.quests.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-center">
                    <CalendarClock className="size-8 text-neutral-300" aria-hidden />
                    <div className="mt-2 text-sm font-medium text-neutral-700">Заданий пока нет</div>
                    <div className="mt-1 max-w-60 text-xs leading-relaxed text-neutral-500">
                      Заходите завтра — список обновляется ежедневно.
                    </div>
                  </div>
                ) : (
                  data.quests.map((q) => {
                    const done = q.progress >= q.target
                    const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100))
                    return (
                      <div
                        key={q.id}
                        className={
                          'rounded-2xl border p-4 ' +
                          (done && !q.claimed
                            ? 'border-violet-300 bg-violet-50 shadow-[0_0_24px_-10px_rgba(124,92,255,0.55)]'
                            : 'border-neutral-200 bg-white shadow-sm')
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-neutral-900">{q.title}</div>
                            <div className="mt-0.5 text-xs leading-relaxed text-neutral-500">{q.desc}</div>
                          </div>
                          {q.claimed && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              <CheckCircle2 className="size-3" aria-hidden /> Получено
                            </span>
                          )}
                          {done && !q.claimed && (
                            <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-bold text-amber-950">
                              ГОТОВО
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#a78bfa] to-[#c4b5fd] transition-[width]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10px] tabular-nums text-neutral-500">
                            {q.progress}/{q.target}
                          </span>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-[11px] font-medium">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                              <Coins className="size-3" aria-hidden />+{fmtMoney(q.reward)}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-violet-700">
                              <Zap className="size-3" aria-hidden />+{q.xpReward} XP
                            </span>
                          </span>
                        </div>

                        {done && !q.claimed && (
                          <Button
                            className="cta-glow mt-3 h-11 w-full rounded-xl text-sm font-semibold text-white"
                            style={{ backgroundColor: VIOLET }}
                            disabled={claimBusy === q.id}
                            onClick={() => void claim(q)}
                          >
                            {claimBusy === q.id ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                              'Забрать награду'
                            )}
                          </Button>
                        )}
                      </div>
                    )
                  })
                )}

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-400">
                  <CalendarClock className="size-3.5" aria-hidden /> Новые задания каждый день
                </div>
              </div>
            )}

            {/* Достижения */}
            {tab === 'achievements' && (
              <div className="grid grid-cols-2 gap-3">
                {data.achievements.length === 0 ? (
                  <div className="col-span-2 flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-center">
                    <Medal className="size-8 text-neutral-300" aria-hidden />
                    <div className="mt-2 text-sm font-medium text-neutral-700">Достижений пока нет</div>
                    <div className="mt-1 max-w-60 text-xs leading-relaxed text-neutral-500">
                      Они появятся по мере игры.
                    </div>
                  </div>
                ) : (
                  data.achievements.map((a) => <AchievementCard key={a.id} a={a} />)
                )}
              </div>
            )}

            <div className="pb-2 pt-1 text-center text-[10px] text-neutral-400">
              Карьера · опыт и награды за активность
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
