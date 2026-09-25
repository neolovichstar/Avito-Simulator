'use client'

// Приложение «Лидеры» — светлая система (как Resale/Сбер):
// фон #F5F6FA, белые карточки radius 20 (тень 0 2px 8px rgba(0,0,0,0.04)),
// акцент — золото #D9A514 на подиуме + нейтральные ранги, вторичный текст #9AA0A8.
// Топ-3 — подиум 2-1-3 с медальонами (золото/серебро/бронза), далее чистые ряды
// (ранг, аватар, имя, баланс tabular-nums); строка «вы» подсвечена
// bg #E7F5EA + ring-1 ring-[#21A03A]/30. Табы-категории — чипы.
// Логика (api.leaderboard, автообновление, табы) — без изменений.

import { useCallback, useEffect, useState } from 'react'
import { Award, Coins, Crown, Flame, Loader2, RefreshCw, ShoppingBag, TrendingUp, Trophy } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtMoney, initials, hueColor } from '@/lib/format'

// Токены светлой системы
const GOLD = '#D9A514'
const SILVER = '#AEB4BC'
const BRONZE = '#C77B3B'
const CARD = 'rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]'

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

// медальон подиума: ранги 1/2/3 → золото/серебро/бронза
function medalOf(rank: number): { bg: string } | null {
  if (rank === 1) return { bg: GOLD }
  if (rank === 2) return { bg: SILVER }
  if (rank === 3) return { bg: BRONZE }
  return null
}

function Avatar({ row, size = 'md' }: { row: Board; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-14 text-base' : 'size-10 text-[12px]'
  // «вы» — зелёное кольцо, остальным — нейтральное
  const ring = row.isMe ? 'ring-2 ring-[#21A03A]/60' : 'ring-1 ring-black/5'
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
    <div className="flex h-full flex-col bg-[#F5F6FA]">
      {/* шапка: корона в золотом медальоне + обновление */}
      <header className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${GOLD}1A`, color: GOLD }}>
            <Crown className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold leading-tight text-[#1A1A1A]">Лидеры</h1>
            <p className="mt-0.5 text-[13px] text-[#9AA0A8]">Топ игроков и ботов · обновляется каждые 20 секунд</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Обновить лидеров"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-transform active:scale-95"
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
                tab === t.key
                  ? 'bg-[#1A1A1A] font-semibold text-white'
                  : 'bg-white font-medium text-black/60 shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
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
              <div key={i} className="h-12 animate-pulse rounded-[20px] bg-white" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-[20px] bg-[#FDEEEE] p-6 text-center">
            <p className="text-sm font-medium text-[#B3382E]">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="h-11 rounded-xl bg-[#1A1A1A] px-6 text-sm font-bold text-white transition active:scale-95"
            >
              Повторить
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-[20px] bg-white px-4 py-12 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex size-14 items-center justify-center rounded-full" style={{ backgroundColor: `${GOLD}1A` }}>
              <Trophy className="size-7" style={{ color: GOLD }} aria-hidden />
            </div>
            <p className="mt-3 text-[15px] font-semibold text-[#1A1A1A]">Пока пусто</p>
            <p className="mt-1 max-w-60 text-[13px] leading-relaxed text-[#9AA0A8]">Совершайте сделки — и вы появитесь в рейтинге</p>
          </div>
        ) : (
          <>
            {/* подиум: центр выше, у первого — корона и золотая рамка */}
            <section aria-label="Топ-3">
              <div className="grid grid-cols-3 items-end gap-2">
                {podiumOrder.map((r) => {
                  const medal = medalOf(r.rank)
                  return (
                    <div
                      key={r.userId}
                      className={
                        'flex flex-col items-center gap-1.5 rounded-[20px] bg-white px-2 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] ' +
                        (r.rank === 1 ? '-mt-3 pb-5 pt-4 ring-1 ring-[#D9A514]/40' : 'pb-4 pt-3 ring-1 ring-black/5')
                      }
                    >
                      {r.rank === 1 && <Crown className="size-5" style={{ color: GOLD }} aria-hidden />}
                      <div className="relative">
                        <Avatar row={r} size="lg" />
                        {r.online && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white"
                            style={{ backgroundColor: '#0AA06E' }}
                            aria-label="Онлайн"
                          />
                        )}
                      </div>
                      <div className={`w-full truncate text-[12px] font-semibold ${r.isMe ? 'text-[#21A03A]' : 'text-[#1A1A1A]'}`}>
                        {r.isMe ? 'Вы' : r.name}
                      </div>
                      <div className="text-[12px] font-bold tabular-nums text-[#1A1A1A]">
                        {unit(r.value)}
                      </div>
                      <span
                        className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white"
                        style={{ backgroundColor: medal?.bg ?? '#F0F1F5', color: medal ? '#FFFFFF' : '#9AA0A8' }}
                      >
                        {r.rank}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* остальные места — чистые ряды */}
            <section className={`${CARD} overflow-hidden`} aria-label="Полный рейтинг">
              {rest.map((r, i) => (
                <div
                  key={r.userId}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-[#F0F1F5]' : ''} ${
                    r.isMe ? 'bg-[#E7F5EA] ring-1 ring-inset ring-[#21A03A]/30' : ''
                  }`}
                >
                  <span className="w-6 shrink-0 text-center text-[13px] font-semibold tabular-nums text-[#9AA0A8]">{r.rank}</span>
                  <div className="relative">
                    <Avatar row={r} />
                    {r.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: '#0AA06E' }} aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate text-[14px] ${r.isMe ? 'font-semibold text-[#1A1A1A]' : 'font-medium text-[#1A1A1A]'}`}>
                        {r.isMe ? 'Вы' : r.name}
                      </span>
                      {r.isBot && <Award className="size-3 shrink-0 text-[#9AA0A8]" aria-label="ИИ-игрок" />}
                    </div>
                    <div className="text-[11px] text-[#9AA0A8]">ур. {r.level}</div>
                  </div>
                  <span className="shrink-0 text-[14px] font-bold tabular-nums text-[#1A1A1A]">
                    {unit(r.value)}
                  </span>
                </div>
              ))}
            </section>

            <p className="px-2 pb-2 pt-1 text-center text-[11px] leading-relaxed text-[#9AA0A8]">
              Рейтинг общий: ИИ-боты живут на площадке и тоже торгуются.
              Выбей бота с первого места — площадка это запомнит.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
