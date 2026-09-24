'use client'

// Приложение «Лидеры» — спортивное табло площадки: пьедестал топ-3 + списки по категориям.
// Светлый-first интерфейс, медальные акценты (золото/серебро/бронза), «ты» подсвечен фиолетовым.

import { useCallback, useEffect, useState } from 'react'
import {
  Award, CircleHelp, Coins, Crown, Flame, Gavel, Loader2, Medal, RefreshCw, ShoppingBag, TrendingUp, Trophy,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtMoney, initials, hueColor } from '@/lib/format'
import { useOS } from '@/lib/store'
import { Button } from '@/components/ui/button'

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

const PODIUM_STYLE: Record<number, { bar: string; medal: React.ReactNode; label: string }> = {
  1: {
    bar: 'bg-gradient-to-t from-amber-300 to-amber-200',
    medal: <Crown className="size-5 text-amber-500" aria-hidden />,
    label: 'text-amber-600',
  },
  2: {
    bar: 'bg-gradient-to-t from-slate-300 to-slate-200',
    medal: <Medal className="size-5 text-slate-400" aria-hidden />,
    label: 'text-slate-500',
  },
  3: {
    bar: 'bg-gradient-to-t from-orange-300 to-orange-200',
    medal: <Medal className="size-5 text-orange-500" aria-hidden />,
    label: 'text-orange-600',
  },
}

function Avatar({ row, size = 'md' }: { row: Board; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-11 text-sm' : 'size-8 text-[11px]'
  if (row.photoUrl) {
    return (
       
      <img
        src={row.photoUrl}
        alt=""
        className={`${cls} shrink-0 rounded-full object-cover ring-1 ring-black/5 ${row.isMe ? 'ring-2 ring-emerald-400' : ''}`}
      />
    )
  }
  return (
    <span
      className={`${cls} flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${row.isMe ? 'ring-2 ring-emerald-400' : ''}`}
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
  const pushToast = useOS((s) => s.pushToast)

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
    <div className="flex h-full flex-col bg-[#f7f7f8]">
      {/* шапка */}
      <header className="shrink-0 border-b border-neutral-100 bg-white px-4 pb-4 pt-4">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-amber-500" aria-hidden />
          <h1 className="text-lg font-bold tracking-tight text-neutral-900">Лидеры площадки</h1>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-8 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            onClick={() => void load()}
            aria-label="Обновить лидеров"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Топ игроков и ботов. Обновляется каждые 20 секунд</p>
      </header>

      {/* табы */}
      <nav className="flex shrink-0 gap-1 border-b border-neutral-100 bg-white px-3 pb-3 pt-1" aria-label="Категории лидеров">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key)
            }}
            className={`press flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition-colors ${
              tab === t.key ? 'bg-amber-400 text-amber-950 shadow-sm' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
            aria-pressed={tab === t.key}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {loading && !boards ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-7 animate-spin text-neutral-400" />
          </div>
        ) : error ? (
          <div className="mt-10 text-center text-sm text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-2 text-neutral-400">
            <CircleHelp className="size-8" aria-hidden />
            <p className="text-sm">Пока пусто — совершайте сделки</p>
          </div>
        ) : (
          <>
            {/* пьедестал */}
            <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm" aria-label="Топ-3">
              <div className="grid grid-cols-3 items-end gap-2">
                {podiumOrder.map((r) => {
                  const style = PODIUM_STYLE[r.rank]
                  const barH = r.rank === 1 ? 'h-20' : r.rank === 2 ? 'h-14' : 'h-10'
                  return (
                    <div key={r.userId} className="flex flex-col items-center">
                      {r.rank === 1 && <div className="mb-1">{style.medal}</div>}
                      <Avatar row={r} size="lg" />
                      <div className="mt-1.5 w-full truncate text-center text-xs font-semibold text-neutral-800">
                        {r.isMe ? 'Вы' : r.name}
                      </div>
                      <div className={`text-[11px] font-bold ${style.label}`}>{unit(r.value)}</div>
                      <div
                        className={`mt-1.5 w-full ${barH} ${style.bar} flex items-start justify-center rounded-t-lg pt-1 text-[11px] font-black text-white/90`}
                      >
                        {r.rank}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* остальные */}
            <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm" aria-label="Полный рейтинг">
              {rest.map((r, i) => (
                <div
                  key={r.userId}
                  className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-neutral-100' : ''} ${r.isMe ? 'bg-emerald-50/70' : ''}`}
                >
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-neutral-400">{r.rank}</span>
                  <div className="relative">
                    <Avatar row={r} />
                    {r.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-neutral-800">{r.isMe ? 'Вы' : r.name}</span>
                      {r.isBot && <Award className="size-3 shrink-0 text-neutral-300" aria-label="ИИ-игрок" />}
                    </div>
                    <div className="text-[11px] text-neutral-400">ур. {r.level}</div>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${r.isMe ? 'text-emerald-600' : 'text-neutral-700'}`}>
                    {unit(r.value)}
                  </span>
                </div>
              ))}
            </section>

            <p className="mt-3 px-2 text-center text-[11px] leading-relaxed text-neutral-400">
              Рейтинг общий: ИИ-боты живут на площадке и тоже торгуются.
              Выбей бота с первого места — площадка это запомнит.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
