'use client'

// Приложение «Задания» — светлая система (как Resale/Сбер):
// фон #F5F6FA, белые карточки radius 20 (тень 0 2px 8px rgba(0,0,0,0.04)),
// акцент зелёный #21A03A (прогресс, награды, claim), вторичный текст #9AA0A8.
// Карточка задания: иконка-круг 44 (цвет по типу), название 15 semibold,
// тонкий прогресс-бар с зелёной заливкой + «3/5» tabular-nums, награда справа bold;
// выполненные — зелёная галочка-бейдж; «Забрать» — зелёная пилюля h-12 radius 12.
// Мега-задание — белая карточка с золотой рамкой и бейджем.
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

// Токены светлой системы
const GREEN = '#21A03A'
const GOLD = '#D9A514'
const CARD = 'rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]'

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

// Цвет иконки по типу задания (светлые акценты, без синего/фиолетового)
function questColor(questId: string): string {
  const id = questId.replace(/^mega_/, '')
  if (id.startsWith('q_sell')) return '#E8A020'
  if (id.startsWith('q_buy')) return '#0AA06E'
  if (id.startsWith('q_profit')) return GREEN
  if (id.startsWith('q_chat')) return '#E85D75'
  if (id.startsWith('q_free')) return '#F26D6D'
  if (id.startsWith('q_repair')) return '#E8702A'
  if (id.startsWith('q_courier')) return '#0AA06E'
  if (id.startsWith('q_bid')) return GOLD
  if (id.startsWith('q_aucwin')) return GOLD
  if (id.startsWith('q_boost')) return '#F8A13A'
  if (id.startsWith('q_spend')) return GREEN
  if (id.startsWith('q_review')) return GOLD
  if (id.startsWith('q_deposit')) return '#0AA06E'
  if (id.startsWith('q_loan')) return '#E8702A'
  if (id.startsWith('q_tax')) return '#E5584B'
  if (id.startsWith('q_fav')) return '#E85D75'
  return GREEN
}

// медаль достижения по величине награды (светлые тона)
function medalTier(reward: number): { color: string; label: string } {
  if (reward >= 50000) return { color: GOLD, label: 'Золото' }
  if (reward >= 15000) return { color: '#9AA0A8', label: 'Серебро' }
  return { color: '#C77B3B', label: 'Бронза' }
}

function AchievementCard({ a }: { a: AchievementDTO }) {
  const tier = medalTier(a.reward)
  const hidden = a.secret && !a.unlocked
  return (
    <div className="relative flex flex-col overflow-hidden rounded-[20px] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      {a.unlocked && <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: GOLD }} aria-hidden />}
      <div className="flex items-start justify-between">
        <div
          className="relative flex size-11 items-center justify-center rounded-full"
          style={{ backgroundColor: a.unlocked ? `${tier.color}1A` : '#F0F1F5' }}
        >
          {hidden ? (
            <Sparkles className="size-5" style={{ color: GREEN }} aria-hidden />
          ) : (
            <Medal className="size-5.5" style={{ color: a.unlocked ? tier.color : '#C1C5CB' }} aria-hidden />
          )}
          {!a.unlocked && (
            <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-white bg-white shadow-sm">
              <Lock className="size-2.5 text-[#9AA0A8]" aria-hidden />
            </span>
          )}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={
            hidden
              ? { backgroundColor: '#E7F5EA', color: GREEN }
              : a.unlocked
                ? { backgroundColor: `${tier.color}1A`, color: tier.color }
                : { backgroundColor: '#F0F1F5', color: '#9AA0A8' }
          }
        >
          {hidden ? 'Секрет' : tier.label}
        </span>
      </div>
      <div className={'mt-2.5 text-[13px] font-semibold leading-snug ' + (a.unlocked ? 'text-[#1A1A1A]' : 'text-[#9AA0A8]')}>
        {hidden ? 'Секретное достижение' : a.title}
      </div>
      <div className="mt-0.5 flex-1 text-[11px] leading-relaxed text-[#9AA0A8]">
        {hidden ? 'Условие скрыто. Играйте — и однажды оно откроется.' : a.desc}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold" style={{ color: a.unlocked ? GREEN : '#9AA0A8' }}>
          {hidden ? '+ ???' : `+${fmtMoney(a.reward)}`}
        </span>
        {a.unlocked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F5EA] px-1.5 py-0.5 text-[9px] font-medium text-[#21A03A]">
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

  // мега-задания — отдельная секция с золотыми акцентами
  const dailies = data?.quests.filter((q) => !q.questId.startsWith('mega_')) ?? []
  const megas = data?.quests.filter((q) => q.questId.startsWith('mega_')) ?? []

  const renderQuest = (q: QuestDTO, isMega: boolean) => {
    const done = q.progress >= q.target
    const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100))
    const rerollable = data?.rerollAvailable && !q.claimed && q.progress === 0 && !isMega
    const QIcon = questIcon(q.questId)
    const qColor = questColor(q.questId)
    return (
      <div
        key={q.id}
        className={
          'relative rounded-[20px] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] ' +
          (isMega ? 'ring-1 ring-[#D9A514]' : '')
        }
      >
        <div className="flex items-center gap-3">
          <div
            className="relative flex size-11 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${qColor}1A`, color: qColor }}
          >
            <QIcon className="size-5" aria-hidden />
            {/* зелёная галочка-бейдж для выполненных */}
            {done && (
              <span
                className={
                  'absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 border-white text-white ' +
                  (q.claimed ? '' : 'animate-pulse')
                }
                style={{ backgroundColor: GREEN }}
                role="img"
                aria-label={q.claimed ? 'Награда получена' : 'Готово к получению награды'}
              >
                <Check className="size-3" aria-hidden />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-[15px] font-semibold text-[#1A1A1A]">{q.title}</span>
              {isMega && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: GOLD }}>
                  <Zap className="size-2.5" aria-hidden /> ×2
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[#9AA0A8]">{q.desc}</div>
          </div>
          {/* награда справа bold */}
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-[15px] font-bold tabular-nums" style={{ color: q.claimed ? '#9AA0A8' : GREEN }}>
              +{fmtMoney(q.reward)}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-[#9AA0A8]">
              <Zap className="size-3" aria-hidden />{q.xpReward} XP
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F1F5]">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${pct}%`, backgroundColor: q.claimed ? '#C9CED4' : GREEN }}
            />
          </div>
          <span className="shrink-0 text-[12px] font-medium tabular-nums text-[#9AA0A8]">
            {q.progress}/{q.target}
          </span>
          {rerollable && (
            <button
              type="button"
              onClick={() => void reroll(q)}
              disabled={rerollBusy === q.id}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F0F1F5] px-2.5 py-1.5 text-[11px] font-medium text-[#1A1A1A] transition active:scale-95 disabled:opacity-50"
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
            className="mt-3 h-12 w-full rounded-xl text-[15px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: GREEN }}
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
    <div className="flex h-full flex-col bg-[#F5F6FA]">
      {/* ---------- шапка: заголовок bold 22 + подзаголовок 13 ---------- */}
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#E7F5EA]">
            <ListChecks className="size-5" style={{ color: GREEN }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold leading-tight text-[#1A1A1A]">Задания</h1>
            <p className="mt-0.5 text-[13px] text-[#9AA0A8]">Выполняй задания. Получай награды.</p>
          </div>
        </div>
      </div>

      {/* ---------- контент ---------- */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0 [scrollbar-width:thin]">
        {loading && !data ? (
          <div className="flex flex-col gap-3 pt-1">
            <div className="h-20 animate-pulse rounded-[20px] bg-white" />
            <div className="h-16 animate-pulse rounded-[20px] bg-white" />
            <div className="h-12 animate-pulse rounded-[20px] bg-white" />
            <div className="h-12 animate-pulse rounded-[20px] bg-white" />
          </div>
        ) : error && !data ? (
          <div className="rounded-[20px] bg-[#FDEEEE] p-6 text-center">
            <p className="text-sm font-medium text-[#B3382E]">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex h-11 items-center rounded-xl px-6 text-sm font-bold text-white transition active:scale-95"
              style={{ backgroundColor: GREEN }}
            >
              Повторить
            </button>
          </div>
        ) : data ? (
          <>
            {/* профиль-строка: аватар, имя, уровень, XP-прогресс */}
            <div className={`${CARD} p-4`}>
              <div className="flex items-center gap-3">
                {session?.photoUrl ? (
                  <img
                    src={session.photoUrl}
                    alt=""
                    className="size-12 shrink-0 rounded-full object-cover ring-1 ring-black/5"
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
                    <span className="min-w-0 truncate text-[15px] font-bold text-[#1A1A1A]">
                      {session?.displayName ?? 'Игрок'}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#E7F5EA] px-2 py-0.5 text-[10px] font-bold text-[#21A03A]">
                      Уровень {data.level}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F0F1F5]">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${Math.min(100, Math.max(0, data.levelProgress))}%`, backgroundColor: GREEN }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#9AA0A8]">
                    <span>Опыт</span>
                    <span className="tabular-nums">{fmtNum(xpIn)} / {fmtNum(xpSpan)} XP</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ряд статов: серия / баллы / награды */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-[20px] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <Flame className="size-4.5 text-[#E8702A]" aria-hidden />
                <div className="mt-1.5 text-[15px] font-bold tabular-nums leading-none text-[#1A1A1A]">{bonus?.streak ?? 0}</div>
                <div className="mt-1 text-[10px] leading-tight text-[#9AA0A8]">дней подряд</div>
              </div>
              <div className="rounded-[20px] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <Star className="size-4.5 text-[#D9A514]" fill="#D9A514" aria-hidden />
                <div className="mt-1.5 text-[15px] font-bold tabular-nums leading-none text-[#1A1A1A]">{fmtNum(data.xp)}</div>
                <div className="mt-1 text-[10px] leading-tight text-[#9AA0A8]">баллов опыта</div>
              </div>
              <div className="rounded-[20px] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <Trophy className="size-4.5 text-[#E8A020]" aria-hidden />
                <div className="mt-1.5 text-[15px] font-bold tabular-nums leading-none text-[#1A1A1A]">{unlocked}/{total}</div>
                <div className="mt-1 text-[10px] leading-tight text-[#9AA0A8]">наград</div>
              </div>
            </div>

            {/* баннер серии входов (существующий бонус за вход) */}
            {bonus && (
              <div className="rounded-[20px] bg-[#E7F5EA] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
                    <Flame className="size-5 text-[#E8702A]" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[#1A1A1A]">Серия: {bonus.streak} дн.!</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-black/50">
                      {bonus.claimedToday
                        ? 'Бонус за вход получен — приходите завтра'
                        : `Бонус за вход: завтра +${fmtMoney(bonus.nextReward)}`}
                    </div>
                  </div>
                  <span
                    className={
                      'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ' +
                      (bonus.claimedToday ? 'bg-white text-black/50' : 'text-white')
                    }
                    style={bonus.claimedToday ? undefined : { backgroundColor: GREEN }}
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
                          ? ''
                          : 'bg-black/10')
                      }
                      style={i < bonus.streak % 7 || (bonus.streak > 0 && bonus.streak % 7 === 0) ? { backgroundColor: GREEN } : undefined}
                      aria-hidden
                    />
                  ))}
                </div>
                <div className="mt-1.5 text-[9px] text-black/40">Неделя входов подряд — максимальный множитель</div>
              </div>
            )}

            {/* табы-чипы */}
            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Разделы заданий">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={
                    'h-10 rounded-full text-[13px] transition active:scale-[0.98] ' +
                    (tab === t.key ? 'font-semibold text-white' : 'bg-white font-medium text-black/60 shadow-[0_2px_8px_rgba(0,0,0,0.04)]')
                  }
                  style={tab === t.key ? { backgroundColor: GREEN } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Задания */}
            {tab === 'quests' && (
              <div className="flex flex-col gap-3">
                {claimError && (
                  <div className="rounded-2xl bg-[#FDEEEE] px-3 py-2 text-[12px] font-medium text-[#B3382E]">
                    {claimError}
                  </div>
                )}

                {/* секция «Сегодня» */}
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[18px] font-bold text-[#1A1A1A]">Сегодня</h2>
                  <span className="inline-flex items-center gap-0.5 text-[13px] text-[#9AA0A8]">
                    Все задания <ChevronRight className="size-3.5" aria-hidden />
                  </span>
                </div>

                {data.quests.length === 0 ? (
                  <div className="flex flex-col items-center rounded-[20px] bg-white px-4 py-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                    <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
                      <CalendarClock className="size-7 text-[#9AA0A8]" aria-hidden />
                    </div>
                    <div className="mt-3 text-[15px] font-semibold text-[#1A1A1A]">Заданий пока нет</div>
                    <div className="mt-1 max-w-60 text-[13px] leading-relaxed text-[#9AA0A8]">
                      Заходите завтра — список обновляется ежедневно.
                    </div>
                  </div>
                ) : (
                  dailies.map((q) => renderQuest(q, false))
                )}

                {/* мега-задания (×2) */}
                {megas.length > 0 && (
                  <>
                    <div className="mt-1 flex items-center justify-between px-1">
                      <h2 className="text-[18px] font-bold text-[#1A1A1A]">Мега-задания</h2>
                      <span className="text-[13px] text-[#9AA0A8]">награда ×2</span>
                    </div>
                    {megas.map((q) => renderQuest(q, true))}
                  </>
                )}

                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#9AA0A8]">
                    <CalendarClock className="size-3.5" aria-hidden /> Новые задания каждый день
                  </div>
                  <div className="text-[10px] text-[#9AA0A8]/80">Одну замену задания в день можно сделать бесплатно</div>
                </div>
              </div>
            )}

            {/* Достижения */}
            {tab === 'achievements' && (
              <div className="grid grid-cols-2 gap-3">
                {data.achievements.length === 0 ? (
                  <div className="col-span-2 flex flex-col items-center rounded-[20px] bg-white px-4 py-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                    <div className="flex size-14 items-center justify-center rounded-full bg-[#F0F1F5]">
                      <Medal className="size-7 text-[#9AA0A8]" aria-hidden />
                    </div>
                    <div className="mt-3 text-[15px] font-semibold text-[#1A1A1A]">Достижений пока нет</div>
                    <div className="mt-1 max-w-60 text-[13px] leading-relaxed text-[#9AA0A8]">
                      Они появятся по мере игры.
                    </div>
                  </div>
                ) : (
                  data.achievements.map((a) => <AchievementCard key={a.id} a={a} />)
                )}
              </div>
            )}

            <div className="pb-2 pt-1 text-center text-[10px] text-[#9AA0A8]">
              Задания · опыт и награды за активность
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
