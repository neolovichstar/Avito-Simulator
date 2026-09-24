'use client'

// Приложение «Карьера» — игровой профиль: градиент #1e1b4b → #312e81, акцент #a78bfa.
import { useCallback, useEffect, useState } from 'react'
import {
  CalendarClock, CheckCircle2, Coins, Flame, Loader2, Lock, Medal, Trophy, Zap,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { playSound } from '@/lib/sounds'
import { fmtMoney } from '@/lib/format'
import type { CareerData, QuestDTO, BonusState } from '@/lib/types'
import { Button } from '@/components/ui/button'

const VIOLET = '#a78bfa'

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
      playSound('cash')
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

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#1e1b4b] to-[#312e81] text-white">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#a78bfa]/30 bg-[#a78bfa]/15">
          <Trophy className="size-5 text-[#a78bfa]" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold text-white">Карьера</div>
          <div className="text-xs text-indigo-200/60">Уровни, задания и достижения</div>
        </div>
      </div>

      {/* Контент */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <div className="h-28 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-11 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-28 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-28 animate-pulse rounded-2xl bg-white/10" />
            <div className="flex items-center justify-center gap-2 text-sm text-indigo-200/50">
              <Loader2 className="size-4 animate-spin" /> Загрузка профиля…
            </div>
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <Button
              className="mt-4 h-11 rounded-xl px-6 text-sm font-semibold text-[#1e1b4b]"
              style={{ backgroundColor: VIOLET }}
              onClick={() => void load()}
            >
              Повторить
            </Button>
          </div>
        ) : data ? (
          <>
            {/* Уровень и XP */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-4xl font-extrabold leading-none text-[#a78bfa] tabular-nums">
                    {data.level}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Уровень</div>
                    <div className="text-[11px] text-indigo-200/60">опыт растёт за сделки</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#a78bfa]/30 bg-[#a78bfa]/10 px-3 py-1.5 text-xs font-medium text-[#c4b5fd]">
                  <Medal className="size-3.5" aria-hidden />
                  Достижения: {data.unlockedCount}/{data.totalCount}
                </div>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#a78bfa] to-[#c4b5fd] transition-[width]"
                  style={{ width: `${Math.min(100, Math.max(0, data.levelProgress))}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-indigo-200/60">
                <span>Прогресс уровня</span>
                <span className="tabular-nums">{data.levelProgress}%</span>
              </div>
            </div>

            {/* Ежедневный бонус за вход */}
            {bonus && (
              <div className="flex items-center gap-3 rounded-2xl border border-[#a78bfa]/25 bg-[#a78bfa]/10 p-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#a78bfa]/20">
                  <Flame className="size-5 text-[#fbbf24]" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">Бонус за вход</div>
                  <div className="text-[11px] text-indigo-200/60">
                    {bonus.claimedToday
                      ? `Серия ${bonus.streak} дн. · получено сегодня`
                      : `Серия ${bonus.streak} дн. · заходите завтра: ${fmtMoney(bonus.nextReward)}`}
                  </div>
                </div>
                <div
                  className={
                    'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ' +
                    (bonus.claimedToday
                      ? 'bg-white/10 text-indigo-200/70'
                      : 'bg-[#fbbf24] text-[#1e1b4b]')
                  }
                >
                  {bonus.claimedToday ? 'Завтра' : fmtMoney(bonus.nextReward)}
                </div>
              </div>
            )}

            {/* Табы */}
            <div className="grid grid-cols-2 rounded-2xl bg-black/25 p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    'h-11 rounded-xl text-sm transition ' +
                    (tab === t.key
                      ? 'font-semibold text-[#1e1b4b]'
                      : 'font-medium text-indigo-200/70')
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
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {claimError}
                  </div>
                )}

                {data.quests.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center">
                    <CalendarClock className="size-8 text-indigo-300/40" aria-hidden />
                    <div className="mt-2 text-sm font-medium text-indigo-100">Заданий пока нет</div>
                    <div className="mt-1 max-w-60 text-xs leading-relaxed text-indigo-200/50">
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
                            ? 'border-[#a78bfa]/50 bg-[#a78bfa]/10'
                            : 'border-white/10 bg-white/5')
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{q.title}</div>
                            <div className="mt-0.5 text-xs leading-relaxed text-indigo-200/60">{q.desc}</div>
                          </div>
                          {q.claimed && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                              <CheckCircle2 className="size-3" aria-hidden /> Получено
                            </span>
                          )}
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[#a78bfa] transition-[width]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] tabular-nums text-indigo-200/60">
                            {q.progress}/{q.target}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                            <Coins className="size-3.5" aria-hidden />+{fmtMoney(q.reward)}
                            <span className="text-indigo-200/40">и</span>
                            <Zap className="size-3.5 text-[#a78bfa]" aria-hidden />+{q.xpReward} XP
                          </span>
                        </div>

                        {done && !q.claimed && (
                          <Button
                            className="mt-3 h-11 w-full rounded-xl text-sm font-semibold text-[#1e1b4b]"
                            style={{ backgroundColor: VIOLET }}
                            disabled={claimBusy === q.id}
                            onClick={() => void claim(q)}
                          >
                            {claimBusy === q.id ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                              'Забрать'
                            )}
                          </Button>
                        )}
                      </div>
                    )
                  })
                )}

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-indigo-300/50">
                  <CalendarClock className="size-3.5" aria-hidden /> Новые задания каждый день
                </div>
              </div>
            )}

            {/* Достижения */}
            {tab === 'achievements' && (
              <div className="grid grid-cols-2 gap-3">
                {data.achievements.length === 0 ? (
                  <div className="col-span-2 flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center">
                    <Medal className="size-8 text-indigo-300/40" aria-hidden />
                    <div className="mt-2 text-sm font-medium text-indigo-100">Достижений пока нет</div>
                    <div className="mt-1 max-w-60 text-xs leading-relaxed text-indigo-200/50">
                      Они появятся по мере игры.
                    </div>
                  </div>
                ) : (
                  data.achievements.map((a) => (
                    <div
                      key={a.id}
                      className={
                        'flex flex-col rounded-2xl border p-3.5 ' +
                        (a.unlocked ? 'border-[#a78bfa]/30 bg-white/5' : 'border-white/5 bg-white/[0.03]')
                      }
                    >
                      <div
                        className={
                          'relative flex size-10 items-center justify-center rounded-xl ' +
                          (a.unlocked ? 'bg-amber-400/15' : 'bg-white/5')
                        }
                      >
                        <Medal
                          className={'size-5 ' + (a.unlocked ? 'text-amber-400' : 'text-stone-500')}
                          aria-hidden
                        />
                        {!a.unlocked && (
                          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-white/10 bg-[#1e1b4b]">
                            <Lock className="size-3 text-stone-400" aria-hidden />
                          </span>
                        )}
                      </div>
                      <div
                        className={
                          'mt-2 text-sm font-semibold leading-snug ' +
                          (a.unlocked ? 'text-white' : 'text-indigo-200/40')
                        }
                      >
                        {a.title}
                      </div>
                      <div
                        className={
                          'mt-0.5 flex-1 text-[11px] leading-relaxed ' +
                          (a.unlocked ? 'text-indigo-200/60' : 'text-indigo-200/35')
                        }
                      >
                        {a.desc}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-1">
                        <span className="text-[11px] font-medium text-emerald-300">+{fmtMoney(a.reward)}</span>
                        {a.unlocked && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                            <CheckCircle2 className="size-2.5" aria-hidden /> Открыто
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="pb-2 text-center text-[10px] text-indigo-300/40">
              Карьера · опыт и награды за активность
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
