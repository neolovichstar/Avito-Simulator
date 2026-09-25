'use client'

// Приложение «Лидеры» — спортивное табло площадки в Resale Dark (по макету):
// пьедестал топ-3 с золотом и короной + список мест строками, табы-чипы.
// Приложение всегда тёмное и не зависит от темы ОС.

import { useCallback, useEffect, useState } from 'react'
import { Award, CircleHelp, Coins, Crown, Flame, Loader2, RefreshCw, ShoppingBag, TrendingUp } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtMoney, initials, hueColor } from '@/lib/format'

type Board = {
  userId: string
  name: string
  photoUrl: string | null
  isBot: boolean
  online: boolean
  level: number
  value: number
  rank: number
  isMe: boolean
}

type Boards = {
  balance: Board[]
  level: Board[]
  deals: Board[]
  profit: Board[]
}

type TabKey = keyof Boards

const TABS: { key: TabKey; label: string; icon: React.ReactNode; unit: (v: number) => string }[] = [
  { key: 'balance', label: 'Богатство', icon: <Coins className="size-3.5" aria-hidden />, unit: (v) => fmtMoney(v) },
  { key: 'level', label: 'Опыт', icon: <TrendingUp className="size-3.5" aria-hidden />, unit: (v) => `ур. ${v}` },
  { key: 'deals', label: 'Сделки', icon: <ShoppingBag className="size-3.5" aria-hidden />, unit: (v) => `${v} сд.` },
  { key: 'profit', label: 'Прибыль', icon: <Flame className="size-3.5" aria-hidden />, unit: (v) => fmtMoney(v) },
]

function Avatar({ row, size = 'md', gold = false }: { row: Board; size?: 'md' | 'lg'; gold?: boolean }) {
  const cls = size === 'lg' ? 'size-14 text-base' : 'size-10 text-[12px]'
  // золото — у лидера подиума и у себя (по макету); остальным — нейтральное кольцо
  const ring = gold || row.isMe ? 'ring-2 ring-amber-400' : 'ring-1 ring-white/10'
  if (row.photoUrl) {
    return (
      <img src={row.photoUrl} alt="" className={`${cls} shrink-0 rounded-full object-cover ${ring}`} />
    )
  }
  return (
    <span
      className={`${cls} flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${ring}`}
      style={{ backgroundColor: hueColor(row.userId.length * 47 % 360) }}
      aria-hidden
    >
      {initials(row.name)}
    </span>
  )
}

export default function LeaderboardApp() {
  const [boards, setBoards] = useState<Boards | null>(null)
  const [tab, setTab] = useState<TabKey>('balance')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api.leaderboard()
      setBoards(d)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить лидеров')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const active = TABS.find((t) => t.key === tab)
  const rows = boards?.[tab] ?? []
  const top3 = rows.slice(0, 3)
  const rest = rows.slice(3)
  const unit = active?.unit ?? ((v: number) => String(v))
  // порядок на пьедестале: 2-1-3 (как на реальном табло)
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean)

  return (
    <div className="flex h-full flex-col bg-[#050D09] text-white">
      {/* шапка: корона в золотом кубике + обновление */}
      <header className="shrink-0 px-4 pb-3 pt-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15">
            <Crown className="size-5 text-amber-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-bold leading-tight">Лидеры</h1>
            <p className="mt-0.5 text-[11px] text-white/40">Топ игроков и ботов · обновляется каждые 20 секунд</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Обновить лидеров"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-colors active:scale-95"
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          </button>
        </div>

        {/* табы-чипы (существующие категории) */}
        <nav
          className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Категории лидеров"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] transition-colors active:scale-[0.97] ${
                tab === t.key ? 'bg-emerald-500 font-semibold text-[#052E16]' : 'bg-white/[0.06] text-white/70'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pt-0 [scrollbar-width:thin]">
        {loading && !boards ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
            <p className="text-sm font-medium text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="h-11 rounded-2xl bg-[#22C55E] px-6 text-sm font-bold text-[#052E16] transition active:scale-95"
            >
              Повторить
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-2 text-white/40">
            <CircleHelp className="size-8" aria-hidden />
            <p className="text-sm">Пока пусто — совершайте сделки</p>
          </div>
        ) : (
          <>
            {/* пьедестал: центр выше, у первого — корона и золотое кольцо */}
            <section aria-label="Топ-3">
              <div className="grid grid-cols-3 items-end gap-2">
                {podiumOrder.map((r) => (
                  <div
                    key={r.userId}
                    className={
                      'flex flex-col items-center gap-1.5 rounded-2xl border px-2 text-center ' +
                      (r.rank === 1
                        ? '-mt-3 border-amber-400/30 bg-gradient-to-b from-amber-400/10 to-[#0E1F16] pb-5 pt-4'
                        : 'border-white/[0.08] bg-white/[0.04] pb-4 pt-3')
                    }
                  >
                    {r.rank === 1 && <Crown className="size-5 text-amber-400" aria-hidden />}
                    <div className="relative">
                      <Avatar row={r} size="lg" gold={r.rank === 1} />
                      {r.online && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-[#0E1F16]"
                          aria-label="Онлайн"
                        />
                      )}
                    </div>
                    <div className={`w-full truncate text-[12px] font-semibold ${r.isMe ? 'text-emerald-400' : 'text-white'}`}>
                      {r.isMe ? 'Вы' : r.name}
                    </div>
                    <div className={`text-[12px] font-bold tabular-nums ${r.rank === 1 ? 'text-amber-400' : 'text-white/80'}`}>
                      {unit(r.value)}
                    </div>
                    <span
                      className={
                        'flex size-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ' +
                        (r.rank === 1 ? 'bg-amber-400/15 text-amber-400' : 'bg-white/10 text-white/60')
                      }
                    >
                      {r.rank}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* остальные места — строками */}
            <section
              className="overflow-hidden rounded-2xl border border-emerald-500/15 bg-[#0E1F16]"
              aria-label="Полный рейтинг"
            >
              {rest.map((r, i) => (
                <div
                  key={r.userId}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/[0.06]' : ''} ${r.isMe ? 'bg-emerald-500/[0.08]' : ''}`}
                >
                  <span className="w-6 shrink-0 text-center text-[13px] font-bold tabular-nums text-white/40">{r.rank}</span>
                  <div className="relative">
                    <Avatar row={r} />
                    {r.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0E1F16]" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate text-[14px] font-medium ${r.isMe ? 'text-emerald-400' : 'text-white'}`}>
                        {r.isMe ? 'Вы' : r.name}
                      </span>
                      {r.isBot && <Award className="size-3 shrink-0 text-white/30" aria-label="ИИ-игрок" />}
                    </div>
                    <div className="text-[11px] text-white/40">ур. {r.level}</div>
                  </div>
                  <span className={`shrink-0 text-[14px] font-bold tabular-nums ${r.isMe ? 'text-emerald-400' : 'text-white'}`}>
                    {unit(r.value)}
                  </span>
                </div>
              ))}
            </section>

            <p className="px-2 pb-2 pt-1 text-center text-[11px] leading-relaxed text-white/30">
              Рейтинг общий: ИИ-боты живут на площадке и тоже торгуются.
              Выбей бота с первого места — площадка это запомнит.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
