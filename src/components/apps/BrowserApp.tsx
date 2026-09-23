'use client'

// Мини-браузер с набором игровых сайтов: стартовая, avito.ru, news.market, forum.market, banki.ru, help.guide.
import { useEffect, useState } from 'react'
import {
  BookOpen, ChevronLeft, ChevronRight, CreditCard, Globe, Loader2, RotateCw,
  ShoppingBag, TrendingDown, TrendingUp, Users,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { fmtDateTime, timeAgo } from '@/lib/format'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import type { MarketStats } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function normalizeSite(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (!t) return 'start'
  const host = t
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/^www\./, '')
  return host || 'start'
}

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  demand_up: { label: 'Спрос растёт', cls: 'bg-emerald-100 text-emerald-700' },
  demand_down: { label: 'Спрос падает', cls: 'bg-red-100 text-red-700' },
  fashion: { label: 'Тренд', cls: 'bg-purple-100 text-purple-700' },
  crisis: { label: 'Кризис', cls: 'bg-orange-100 text-orange-700' },
  opu: { label: 'Дефицит', cls: 'bg-fuchsia-100 text-fuchsia-700' },
  tax_raid: { label: 'Проверка ФНС', cls: 'bg-slate-200 text-slate-700' },
  supply: { label: 'Поставки', cls: 'bg-teal-100 text-teal-700' },
  garage: { label: 'Гаражная распродажа', cls: 'bg-yellow-100 text-yellow-700' },
}

const SITES = [
  { site: 'avito.ru', title: 'Avito', desc: 'Объявления и сделки', icon: ShoppingBag, cls: 'bg-blue-50 text-blue-600' },
  { site: 'news.market', title: 'Market News', desc: 'Новости рынка', icon: TrendingUp, cls: 'bg-emerald-50 text-emerald-600' },
  { site: 'forum.market', title: 'Market Forum', desc: 'Сообщество ресейлеров', icon: Users, cls: 'bg-violet-50 text-violet-600' },
  { site: 'banki.ru', title: 'Банки.ру', desc: 'Ставки и вклады', icon: CreditCard, cls: 'bg-amber-50 text-amber-600' },
  { site: 'help.guide', title: 'Help Guide', desc: 'Гайд для новичка', icon: BookOpen, cls: 'bg-slate-100 text-slate-600' },
] as const

const FORUM_POSTS = [
  {
    nick: 'Reseller_Pro',
    date: '14 мая, 10:12',
    hue: 24,
    title: 'Как распознать недооценённый товар',
    body:
      'Тема избитая, но новички наступают одни и те же грабли. Смотрите на цену ниже рыночной: открываете news.market, находите множитель своей категории — если спрос падает (множитель ниже x1.00), продавцы сливают товар дешевле. Берите состояние «отличное» по цене «хорошего», и маржа сама вам в руки. Ещё лайфхак: сравнивайте цену объявления с базовой ценой каталога, а не с первым попавшимся объявлением.',
    replies: 47,
  },
  {
    nick: 'Торгаш_80',
    date: '13 мая, 21:47',
    hue: 210,
    title: 'Торговля с ботами: что реально работает',
    body:
      'Боты отвечают на аргументы, а не на хамство. Указывайте на состояние товара и царапины, предлагайте свою цену цифрой, а не «ну скинь немного». Второе сообщение бота — уже его реальный потолок, дальше можно соглашаться или уходить. И да, бот помнит ваши прошлые сделки, так что репутацию тут ещё никто не отменял.',
    replies: 33,
  },
  {
    nick: 'Бухгалтерша_Люда',
    date: '13 мая, 08:03',
    hue: 330,
    title: 'Налоги: платите вовремя, а не «когда-нибудь»',
    body:
      'Народ, ну кто опять копит долг до блокировки? С каждой продажи капает 4%, а пеня — 10% в сутки, если просрочили больше дня. Долг дорос до 10 000 — и всё, продажи заморожены, сидите смотрите на чужие объявления. Кнопка «Оплатить всё» в приложении Налоги решает вопрос за секунду. Проверяйте задолженность хотя бы раз в день.',
    replies: 58,
  },
  {
    nick: 'KreditnyiTihon',
    date: '12 мая, 19:26',
    hue: 140,
    title: 'Кредит: брать или не брать?',
    body:
      'Брать можно и нужно, но только под оборотку: взял, купил недооценённый лот, продал с маржой, погасил за пару дней. Ставка 15% за 7 дней — это нормально, если товар уходит быстро. Нельзя брать кредит «на всякий случай» и уж точно нельзя брать второй, пока не погасили первый — банк просто не даст. Лимит растёт с уровнем, так что качайте аккаунт.',
    replies: 41,
  },
  {
    nick: 'Топ1вРайоне',
    date: '12 мая, 11:54',
    hue: 15,
    title: 'Продвижение объявлений: когда буст окупается',
    body:
      'Буст — не волшебная кнопка, а инструмент. Работает на ходовых категориях: электроника, телефоны, кроссовки. Ставьте вечером или в выходные, когда рынок живой, и только если цена у вас конкурентная. Бустить залежалый хлам по завышенной цене — это просто подарить банку денег. Отслеживайте просмотры до и после, они сразу видны.',
    replies: 29,
  },
  {
    nick: 'КопилкаКарта',
    date: '11 мая, 22:31',
    hue: 260,
    title: 'Вклад в банке — тихие 0.1% в час',
    body:
      'Для тех, у кого деньги лежат мёртвым грузом: вклад капает по 0.1% в час, и это лучше, чем ноль. Держите подушку на вкладе, а живые деньги на балансе под закупку. Перед крупной сделкой снимайте заранее — снятие моментальное, но лучше не делать это в последний момент перед оплатой счёта.',
    replies: 18,
  },
]

type ForumPost = (typeof FORUM_POSTS)[number]

function ForumPostCard({ post }: { post: ForumPost }) {
  const nick = post.nick.trim()
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: `hsl(${post.hue} 55% 45%)` }}
        >
          {nick.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-neutral-800">{nick}</div>
          <div className="text-[10px] text-neutral-400">{post.date}</div>
        </div>
      </div>
      <div className="mt-2.5 text-sm font-semibold leading-snug">{post.title}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{post.body}</p>
      <div className="mt-2.5 text-[10px] font-medium text-neutral-400">{post.replies} ответов в теме</div>
    </div>
  )
}

function NewsSite({
  news, loading, error, onRetry,
}: {
  news: MarketStats | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  if (loading && !news) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-16 rounded-2xl bg-neutral-200 animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-neutral-200 animate-pulse" />
        ))}
        <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
          <Loader2 className="size-4 animate-spin" /> Загрузка новостей…
        </div>
      </div>
    )
  }
  if (error && !news) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <Button className="mt-4 rounded-xl" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      </div>
    )
  }
  if (!news) return null

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white shadow-sm">
        <div className="text-base font-bold">Market News</div>
        <div className="mt-0.5 text-[11px] text-white/80">Новости обновляются рынком в реальном времени</div>
      </div>

      {/* Индексные плашки */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {news.indexes.map((idx) => {
          const up = idx.multiplier >= 1
          return (
            <div key={idx.category} className="min-w-[118px] shrink-0 rounded-2xl bg-white p-3 shadow-sm">
              <div className="truncate text-[11px] text-neutral-500">{CATEGORY_LABEL[idx.category] ?? idx.category}</div>
              <div className={'mt-1 flex items-center gap-1 text-sm font-bold ' + (up ? 'text-emerald-600' : 'text-red-500')}>
                {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                x{idx.multiplier.toFixed(2)}
              </div>
            </div>
          )
        })}
      </div>

      {/* События */}
      {news.events.length === 0 ? (
        <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
          <p className="text-xs text-neutral-400">Свежих новостей пока нет — рынок спит.</p>
        </div>
      ) : (
        news.events.map((ev) => {
          const badge = KIND_BADGE[ev.kind] ?? { label: ev.kind, cls: 'bg-neutral-100 text-neutral-600' }
          return (
            <div key={ev.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + badge.cls}>{badge.label}</span>
                <span className="text-[10px] text-neutral-400">{CATEGORY_LABEL[ev.category] ?? ev.category}</span>
              </div>
              <div className="mt-2 text-sm font-semibold leading-snug">{ev.headline}</div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">{ev.body}</p>
              <div className="mt-2 text-[10px] text-neutral-400">{timeAgo(ev.createdAt)}</div>
            </div>
          )
        })
      )}
    </div>
  )
}

export default function BrowserApp({ onOpenApp }: { onOpenApp: (app: 'avito' | 'bank') => void }) {
  const [nav, setNav] = useState<{ items: string[]; idx: number }>({ items: ['start'], idx: 0 })
  const [urlInput, setUrlInput] = useState('start')
  const [news, setNews] = useState<MarketStats | null>(null)
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const current = nav.items[nav.idx] ?? 'start'

  useEffect(() => {
    setUrlInput(current)
  }, [current])

  useEffect(() => {
    if (current !== 'news.market') return
    let alive = true
    setNewsLoading(true)
    setNewsError(null)
    api
      .market()
      .then((d) => {
        if (alive) {
          setNews(d)
          setNewsLoading(false)
        }
      })
      .catch((e) => {
        if (alive) {
          setNewsError(e instanceof ApiError ? e.message : 'Не удалось загрузить новости')
          setNewsLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [current, reloadKey])

  const go = (site: string) => {
    if (site === current) {
      setReloadKey((k) => k + 1)
      return
    }
    setNav((n) => {
      const items = [...n.items.slice(0, n.idx + 1), site]
      return { items, idx: items.length - 1 }
    })
  }

  const submitUrl = () => go(normalizeSite(urlInput))
  const back = () => setNav((n) => ({ ...n, idx: Math.max(0, n.idx - 1) }))
  const forward = () => setNav((n) => ({ ...n, idx: Math.min(n.items.length - 1, n.idx + 1) }))

  return (
    <div className="h-full flex flex-col bg-[#f5f6f8] text-neutral-900">
      {/* Адресная строка */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-white px-2 py-2">
        <button
          onClick={back}
          disabled={nav.idx <= 0}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-30"
          aria-label="Назад"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          onClick={forward}
          disabled={nav.idx >= nav.items.length - 1}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-30"
          aria-label="Вперёд"
        >
          <ChevronRight className="size-5" />
        </button>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100"
          aria-label="Обновить"
        >
          <RotateCw className="size-4" />
        </button>
        <Input
          className="h-9 min-w-0 flex-1 rounded-full border-0 bg-neutral-100 text-[13px]"
          value={urlInput}
          placeholder="Введите адрес сайта"
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitUrl()
          }}
        />
        <Button className="h-9 shrink-0 rounded-full px-4 text-xs font-semibold" onClick={submitUrl}>
          Go
        </Button>
      </div>

      {/* Контент сайтов */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {current === 'start' && (
          <div className="p-4">
            <div className="text-lg font-bold">Стартовая страница</div>
            <p className="mt-0.5 text-xs text-neutral-500">Сайты этой вселенной — выбирайте закладку.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {SITES.map((s) => (
                <button
                  key={s.site}
                  onClick={() => go(s.site)}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-300 active:scale-[0.98]"
                >
                  <div className={'flex size-10 items-center justify-center rounded-xl ' + s.cls}>
                    <s.icon className="size-5" />
                  </div>
                  <div className="mt-2.5 text-sm font-semibold">{s.title}</div>
                  <div className="text-[11px] text-neutral-400">{s.site}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">{s.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-6 text-center text-[10px] text-neutral-300">Мини-браузер · 5 сайтов в сети</div>
          </div>
        )}

        {current === 'avito.ru' && (
          <div className="p-4">
            <div className="mx-auto max-w-xs overflow-hidden rounded-[2rem] border-[6px] border-neutral-300 bg-white shadow-xl">
              <div className="flex h-5 items-center justify-center bg-neutral-200">
                <div className="h-1.5 w-12 rounded-full bg-neutral-400" />
              </div>
              <div className="bg-gradient-to-b from-[#00A0E3] to-[#0489C6] px-5 py-7 text-center text-white">
                <ShoppingBag className="mx-auto size-10" />
                <div className="mt-3 text-lg font-bold">Вы на сайте Avito</div>
                <p className="mt-1.5 text-xs leading-relaxed text-white/85">
                  Это мобильная версия avito.ru в браузере. В приложении удобнее: живая лента, чаты, сделки и
                  продвижение объявлений.
                </p>
              </div>
              <div className="p-4">
                <Button
                  className="h-11 w-full rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: '#00A0E3' }}
                  onClick={() => onOpenApp('avito')}
                >
                  Открыть приложение Avito
                </Button>
                <p className="mt-2 text-center text-[10px] text-neutral-400">Откроется внутри системы</p>
              </div>
            </div>
          </div>
        )}

        {current === 'news.market' && (
          <NewsSite
            news={news}
            loading={newsLoading}
            error={newsError}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        )}

        {current === 'forum.market' && (
          <div className="space-y-3 p-4">
            <div className="rounded-2xl bg-violet-600 p-4 text-white shadow-sm">
              <div className="flex items-center gap-2">
                <Users className="size-5" />
                <div className="text-base font-bold">Market Forum</div>
              </div>
              <div className="mt-0.5 text-[11px] text-white/80">Сообщество ресейлеров: опыт, споры, лайфхаки</div>
            </div>
            {FORUM_POSTS.map((p, i) => (
              <ForumPostCard key={i} post={p} />
            ))}
          </div>
        )}

        {current === 'banki.ru' && (
          <div className="p-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <CreditCard className="size-6" />
                </div>
                <div>
                  <div className="text-base font-bold">Альфа-Банк</div>
                  <div className="text-[11px] text-neutral-400">banki.ru · обзор ставок</div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-neutral-600">
                Альфа-Банк в этой игре один, зато надёжный. Кредит выдают за секунду: ставка 15%, срок 7 дней,
                лимит растёт вместе с уровнем игрока. Накопительный вклад приносит 0.1% в час — маленькие деньги,
                но капают круглосуточно. Пока кредит не погашен, новый не выдадут.
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5 text-xs">
                  <span className="text-neutral-500">Кредит</span>
                  <span className="font-semibold text-neutral-800">15% на 7 дней</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5 text-xs">
                  <span className="text-neutral-500">Вклад</span>
                  <span className="font-semibold text-emerald-600">0.1% в час</span>
                </div>
              </div>
              <Button
                className="mt-4 h-11 w-full rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: '#21A038' }}
                onClick={() => onOpenApp('bank')}
              >
                Открыть приложение Банк
              </Button>
              <p className="mt-2 text-center text-[10px] text-neutral-400">Банк откроется внутри системы</p>
            </div>
          </div>
        )}

        {current === 'help.guide' && (
          <div className="space-y-3 p-4">
            <div className="rounded-2xl bg-slate-700 p-4 text-white shadow-sm">
              <div className="flex items-center gap-2">
                <BookOpen className="size-5" />
                <div className="text-base font-bold">Гайд новичку</div>
              </div>
              <div className="mt-0.5 text-[11px] text-white/80">Всё, что нужно знать перед первой сделкой</div>
            </div>

            {[
              {
                t: '1. Покупки',
                b: 'Ищите товары с ценой ниже рыночной: сравнивайте с индексом категории на news.market и смотрите на состояние (новое дороже, «на запчасти» — почти даром). Проверяйте рейтинг продавца перед покупкой.',
              },
              {
                t: '2. Продажи',
                b: 'Выставляйте товар по рыночной цене или чуть ниже — так быстрее уйдёт. Учитывайте, что с каждой продажи удержат налог 4%: закладывайте его в цену.',
              },
              {
                t: '3. Чат и торг',
                b: 'В чате можно торговаться: предлагайте свою цену цифрой, ссылайтесь на состояние товара. Бот-продавец отвечает сам и соглашается на разумные предложения.',
              },
              {
                t: '4. Налоги',
                b: '4% с каждой продажи капает в счёт ФНС автоматически. Не платите больше суток — получите пеню 10% в сутки, а долг от 10 000 заблокирует продажи.',
              },
              {
                t: '5. Кредит и вклад',
                b: 'Кредит: 15% на 7 дней, лимит зависит от уровня. Брать — только под быстрый оборот. Вклад: 0.1% в час, снимайте перед закупкой.',
              },
              {
                t: '6. Продвижение',
                b: 'Буст поднимает объявление в ленте. Окупается на ходовых категориях и при конкурентной цене. Смотрите просмотры до и после.',
              },
            ].map((s) => (
              <div key={s.t} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold">{s.t}</div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-600">{s.b}</p>
              </div>
            ))}
            <div className="pb-2 text-center text-[10px] text-neutral-300">Обновлено: {fmtDateTime(new Date())}</div>
          </div>
        )}

        {!['start', 'avito.ru', 'news.market', 'forum.market', 'banki.ru', 'help.guide'].includes(current) && (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <Globe className="size-12 text-neutral-300" />
            <div className="mt-4 text-base font-semibold">Сайт недоступен</div>
            <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-neutral-500">
              Не удалось открыть «{current}». Проверьте адрес или вернитесь на стартовую страницу.
            </p>
            <Button variant="outline" className="mt-4 rounded-full" onClick={() => go('start')}>
              На стартовую страницу
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
