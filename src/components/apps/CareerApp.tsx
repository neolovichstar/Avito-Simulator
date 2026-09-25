'use client'

// Приложение «Задания» — Resale Dark: графит #050D09 + изумруд #22C55E (по макету юзера).
// Главная: профиль-строка (аватар, имя, уровень, XP-прогресс), ряд статов (серия Flame,
// баллы Star, награды Trophy), баннер серии, строки-задания с круг-чекбоксом и наградой
// с монеткой, CTA «Забрать награду». Достижения — сетка 2 колонки с медалями.
// Логика (api.career / claimQuest / rerollQuest / bonusState, звук success) — без изменений.
import { useCallback, useEffect, useState } from 'react'
import {
  CalendarClock, Check, CheckCircle2, ChevronRight, Coins, Flame, Gavel, Gift, Heart, Landmark, ListChecks,
  Loader2, Lock, Medal, MessageCircle, PiggyBank, Receipt, RefreshCw, ShoppingBag, Sparkles, Star, Tag, Truck,
  TrendingUp, Trophy, Wallet, Wrench, Zap,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { sound } from '@/lib/sound'
import { fmtMoney, fmtNum, hueColor, initials } from '@/lib/format'
import { xpForLevel } from '@/lib/economy'
import type { AchievementDTO, CareerData, QuestDTO, BonusState } from '@/lib/types'

// Иконка задания по kind, зашитому в questId (q_sell_*, q_bid_*, mega_* и т.д.)
function questIcon(questId: string): typeof Coins {
  const id = questId.replace(/^mega_/, '')
  if (id.startsWith('q_sell')) return Tag
  if (id.startsWith('q_buy')) return ShoppingBag
  if (id.startsWith('q_profit')) return TrendingUp
  if (id.startsWith('q_chat')) return MessageCircle
  if (id.startsWith('q_free')) return Gift
  if (id.startsWith('q_repair')) return Wrench
  if (id.startsWith('q_courier')) return Truck
  if (id.startsWith('q_bid')) return Gavel
  if (id.startsWith('q_aucwin')) return Trophy
  if (id.startsWith('q_boost')) return Zap
  if (id.startsWith('q_spend')) return Wallet
  if (id.startsWith('q_review')) return Star
  if (id.startsWith('q_deposit')) return PiggyBank
  if (id.startsWith('q_loan')) return Landmark
  if (id.startsWith('q_tax')) return Receipt
  if (id.startsWith('q_fav')) return Heart
  return Coins
}

// медаль достижения по величине награды (тёмные тона)
function medalTier(reward: number): { ring: string; chip: string; icon: string; label: string } {
  if (reward >= 50000) return { ring: 'bg-amber-400/15', chip: 'border-amber-400/30 bg-amber-400/10 text-amber-300', icon: 'text-amber-400', label: 'Золото' }
  if (reward >= 15000) return { ring: 'bg-white/10', chip: 'border-white/15 bg-white/[0.06] text-white/70', icon: 'text-white/70', label: 'Серебро' }
  return { ring: 'bg-orange-500/15', chip: 'border-orange-400/30 bg-orange-500/10 text-orange-300', icon: 'text-orange-400', label: 'Бронза' }
}

function AchievementCard({ a }: { a: AchievementDTO }) {
  const tier = medalTier(a.reward)
  const hidden = a.secret && !a.unlocked
  return (
    <div
      className={
        'relative flex flex-col overflow-hidden rounded-2xl border p-3.5 ' +
        (a.unlocked ? 'border-emerald-500/15 bg-[#0E1F16]' : 'border-white/[0.08] bg-white/[0.04]')
      }
    >
      {/* декоративная золотая полоса для открытых */}
      {a.unlocked && <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" aria-hidden />}
      <div className="flex items-start justify-between">
        <div className={'relative flex size-11 items-center justify-center rounded-2xl ' + (a.unlocked ? tier.ring : 'bg-white/[0.06]')}>
          {hidden ? (
            <Sparkles className="size-5 text-emerald-400" aria-hidden />
          ) : (
            <Medal className={'size-5.5 ' + (a.unlocked ? tier.icon : 'text-white/30')} aria-hidden />
          )}
          {!a.unlocked && (
            <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-white/15 bg-[#0E1F16]">
              <Lock className="size-2.5 text-white/50" aria-hidden />
            </span>
          )}
        </div>
        <span
          className={
            'rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ' +
            (hidden
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : a.unlocked
                ? tier.chip
                : 'border-white/10 bg-white/[0.04] text-white/40')
          }
        >
          {hidden ? 'Секрет' : tier.label}
        </span>
      </div>
      <div className={'mt-2.5 text-[13px] font-semibold leading-snug ' + (a.unlocked ? 'text-white' : 'text-white/40')}>
        {hidden ? 'Секретное достижение' : a.title}
      </div>
      <div className={'mt-0.5 flex-1 text-[11px] leading-relaxed ' + (a.unlocked ? 'text-white/50' : 'text-white/30')}>
        {hidden ? 'Условие скрыто. Играйте — и однажды оно откроется.' : a.desc}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-1">
        <span className={'text-[11px] font-semibold ' + (a.unlocked ? 'text-amber-300' : 'text-white/30')}>
          {hidden ? '+ ???' : `+${fmtMoney(a.reward)}`}
        </span>
        {a.unlocked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
            <CheckCircle2 className="size-2.5" aria-hidden /> Открыто
          </span>
        )}
      </div>
    </div>
  )
}

type Tab = 'quests' | 'achievements'

export default function CareerApp() {
  const session = useOS((s) => s.session)
  const [data, setData] = useState<CareerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('quests')
  const [claimBusy, setClaimBusy] = useState<string | null>(null)
  const [rerollBusy, setRerollBusy] = useState<string | null>(null)
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
      sound.success()
      os.pushToast('Карьера', `Награда получена: +${fmtMoney(quest.reward)} и +${quest.xpReward} XP`)
      await load()
    } catch (e) {
      setClaimError(e instanceof ApiError ? e.message : 'Не удалось забрать награду')
    } finally {
      setClaimBusy(null)
    }
  }

  const reroll = async (quest: QuestDTO) => {
    setRerollBusy(quest.id)
    setClaimError(null)
    try {
      await api.rerollQuest(quest.questId)
      useOS.getState().pushToast('Карьера', 'Задание заменено — новое уже в списке')
      await load()
    } catch (e) {
      setClaimError(e instanceof ApiError ? e.message : 'Не удалось заменить задание')
    } finally {
      setRerollBusy(null)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'quests', label: 'Задания' },
    { key: 'achievements', label: 'Достижения' },
  ]

  const unlocked = data?.unlockedCount ?? 0
  const total = data?.totalCount ?? 0
  // XP внутри текущего уровня (по единой формуле экономики)
  const xpCur = data ? xpForLevel(data.level) : 0
  const xpNext = data ? xpForLevel(data.level + 1) : 1
  const xpIn = data ? Math.max(0, data.xp - xpCur) : 0
  const xpSpan = Math.max(1, xpNext - xpCur)

  // мега-задания — отдельная секция с янтарными акцентами
  const dailies = data?.quests.filter((q) => !q.questId.startsWith('mega_')) ?? []
  const megas = data?.quests.filter((q) => q.questId.startsWith('mega_')) ?? []

  const renderQuest = (q: QuestDTO, isMega: boolean) => {
    const done = q.progress >= q.target
    const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100))
    const rerollable = data?.rerollAvailable && !q.claimed && q.progress === 0 && !isMega
    const QIcon = questIcon(q.questId)
    return (
      <div
        key={q.id}
        className={
          'relative overflow-hidden rounded-2xl border p-3.5 ' +
          (done && !q.claimed
            ? 'border-emerald-500/30 bg-[#0E1F16] shadow-[0_0_24px_-10px_rgba(34,197,94,0.5)]'
            : isMega
              ? 'border-amber-400/25 bg-amber-500/[0.07]'
              : 'border-white/[0.08] bg-white/[0.04]')
        }
      >
        {isMega && <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" aria-hidden />}
        <div className="flex items-center gap-3">
          <div
            className={
              'flex size-10 shrink-0 items-center justify-center rounded-xl ' +
              (isMega ? 'bg-amber-400/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400')
            }
          >
            <QIcon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-[14px] font-semibold text-white">{q.title}</span>
              {isMega && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-950">
                  <Zap className="size-2.5" aria-hidden /> ×2
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-white/45">{q.desc}</div>
            <div className="mt-1 flex items-center gap-2 text-[12px]">
              <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                <Coins className="size-3.5 text-amber-400" aria-hidden />+{fmtMoney(q.reward)}
              </span>
              <span className="inline-flex items-center gap-1 text-white/40">
                <Zap className="size-3" aria-hidden />+{q.xpReward} XP
              </span>
            </div>
          </div>
          {/* круг-чекбокс статуса */}
          {q.claimed ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[#052E16]" role="img" aria-label="Награда получена">
              <Check className="size-4" aria-hidden />
            </span>
          ) : done ? (
            <span className="flex size-7 shrink-0 animate-pulse items-center justify-center rounded-full bg-emerald-500 text-[#052E16]" role="img" aria-label="Готово к получению награды">
              <Check className="size-4" aria-hidden />
            </span>
          ) : (
            <span className="size-7 shrink-0 rounded-full border-2 border-white/20" aria-hidden />
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={'h-full rounded-full transition-[width] ' + (isMega ? 'bg-amber-400' : 'bg-emerald-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-white/40">
            {q.progress}/{q.target}
          </span>
          {rerollable && (
            <button
              type="button"
              onClick={() => void reroll(q)}
              disabled={rerollBusy === q.id}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-white/60 transition hover:border-emerald-500/40 hover:text-emerald-300 active:scale-95 disabled:opacity-50"
              aria-label={`Заменить задание: ${q.title}`}
            >
              {rerollBusy === q.id ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />}
              Заменить
            </button>
          )}
        </div>

        {done && !q.claimed && (
          <button
            type="button"
            className="mt-3 h-12 w-full rounded-2xl bg-[#22C55E] text-[15px] font-bold text-[#052E16] transition active:scale-[0.98] disabled:opacity-60"
            disabled={claimBusy === q.id}
            onClick={() => void claim(q)}
          >
            {claimBusy === q.id ? (
              <Loader2 className="mx-auto size-4 animate-spin" aria-hidden />
            ) : (
              'Забрать награду'
            )}
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col text-white"
      style={{ background: 'linear-gradient(180deg, #07130D 0%, #050D09 100%)' }}
    >
      {/* ---------- шапка ---------- */}
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <ListChecks className="size-5 text-emerald-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold text-white">Задания</div>
            <div className="mt-0.5 text-[11px] text-white/50">Выполняй задания. Получай награды.</div>
          </div>
        </div>
      </div>

      {/* ---------- контент ---------- */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3 pt-1">
            <div className="h-20 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-16 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex h-11 items-center rounded-2xl bg-[#22C55E] px-6 text-sm font-bold text-[#052E16] transition active:scale-95"
            >
              Повторить
            </button>
          </div>
        ) : data ? (
          <>
            {/* профиль-строка: аватар, имя, уровень, XP-прогресс */}
            <div className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4">
              <div className="flex items-center gap-3">
                {session?.photoUrl ? (
                  <img
                    src={session.photoUrl}
                    alt=""
                    className="size-12 shrink-0 rounded-full border border-white/10 object-cover"
                  />
                ) : (
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{ backgroundColor: hueColor(((session?.id.length ?? 3) * 47) % 360) }}
                    aria-hidden
                  >
                    {initials(session?.displayName ?? 'Игрок')}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-[15px] font-bold text-white">
                      {session?.displayName ?? 'Игрок'}
                    </span>
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      Уровень {data.level}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width]"
                      style={{ width: `${Math.min(100, Math.max(0, data.levelProgress))}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-white/40">
                    <span>Опыт</span>
                    <span className="tabular-nums">{fmtNum(xpIn)} / {fmtNum(xpSpan)} XP</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ряд статов: серия / баллы / награды */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
                <Flame className="size-4.5 text-orange-400" aria-hidden />
                <div className="mt-1.5 text-[15px] font-bold tabular-nums leading-none text-white">{bonus?.streak ?? 0}</div>
                <div className="mt-1 text-[10px] leading-tight text-white/40">дней подряд</div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
                <Star className="size-4.5 fill-amber-400 text-amber-400" aria-hidden />
                <div className="mt-1.5 text-[15px] font-bold tabular-nums leading-none text-white">{fmtNum(data.xp)}</div>
                <div className="mt-1 text-[10px] leading-tight text-white/40">баллов опыта</div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
                <Trophy className="size-4.5 text-amber-400" aria-hidden />
                <div className="mt-1.5 text-[15px] font-bold tabular-nums leading-none text-white">{unlocked}/{total}</div>
                <div className="mt-1 text-[10px] leading-tight text-white/40">наград</div>
              </div>
            </div>

            {/* баннер серии входов (существующий бонус за вход) */}
            {bonus && (
              <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
                    <Flame className="size-5 text-orange-400" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-white">Серия: {bonus.streak} дн.!</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-white/50">
                      {bonus.claimedToday
                        ? 'Бонус за вход получен — приходите завтра'
                        : `Бонус за вход: завтра +${fmtMoney(bonus.nextReward)}`}
                    </div>
                  </div>
                  <span
                    className={
                      'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ' +
                      (bonus.claimedToday ? 'bg-white/10 text-white/50' : 'bg-amber-400 text-amber-950')
                    }
                  >
                    {bonus.claimedToday ? 'Получено' : fmtMoney(bonus.nextReward)}
                  </span>
                </div>
                {/* календарь серии: 7 полосок */}
                <div className="mt-3 flex items-center gap-1.5">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className={
                        'h-1.5 flex-1 rounded-full ' +
                        (i < bonus.streak % 7 || (bonus.streak > 0 && bonus.streak % 7 === 0)
                          ? 'bg-emerald-500'
                          : 'bg-white/10')
                      }
                      aria-hidden
                    />
                  ))}
                </div>
                <div className="mt-1.5 text-[9px] text-white/40">Неделя входов подряд — максимальный множитель</div>
              </div>
            )}

            {/* табы */}
            <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={
                    'h-9 rounded-full text-[13px] transition ' +
                    (tab === t.key ? 'bg-emerald-500 font-semibold text-[#052E16]' : 'text-white/60')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Задания */}
            {tab === 'quests' && (
              <div className="flex flex-col gap-3">
                {claimError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
                    {claimError}
                  </div>
                )}

                {/* секция «Сегодня» */}
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-semibold text-white">Сегодня</div>
                  <span className="inline-flex items-center gap-0.5 text-[13px] text-emerald-400">
                    Все задания <ChevronRight className="size-3.5" aria-hidden />
                  </span>
                </div>

                {data.quests.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
                    <CalendarClock className="size-8 text-white/25" aria-hidden />
                    <div className="mt-2 text-sm font-medium text-white/80">Заданий пока нет</div>
                    <div className="mt-1 max-w-60 text-xs leading-relaxed text-white/40">
                      Заходите завтра — список обновляется ежедневно.
                    </div>
                  </div>
                ) : (
                  dailies.map((q) => renderQuest(q, false))
                )}

                {/* мега-задания (×2) */}
                {megas.length > 0 && (
                  <>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="text-[15px] font-semibold text-white">Мега-задания</div>
                      <span className="text-[13px] text-white/40">награда ×2</span>
                    </div>
                    {megas.map((q) => renderQuest(q, true))}
                  </>
                )}

                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/40">
                    <CalendarClock className="size-3.5" aria-hidden /> Новые задания каждый день
                  </div>
                  <div className="text-[10px] text-white/30">Одну замену задания в день можно сделать бесплатно</div>
                </div>
              </div>
            )}

            {/* Достижения */}
            {tab === 'achievements' && (
              <div className="grid grid-cols-2 gap-3">
                {data.achievements.length === 0 ? (
                  <div className="col-span-2 flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
                    <Medal className="size-8 text-white/25" aria-hidden />
                    <div className="mt-2 text-sm font-medium text-white/80">Достижений пока нет</div>
                    <div className="mt-1 max-w-60 text-xs leading-relaxed text-white/40">
                      Они появятся по мере игры.
                    </div>
                  </div>
                ) : (
                  data.achievements.map((a) => <AchievementCard key={a.id} a={a} />)
                )}
              </div>
            )}

            <div className="pb-2 pt-1 text-center text-[10px] text-white/30">
              Задания · опыт и награды за активность
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
