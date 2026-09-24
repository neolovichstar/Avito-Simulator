'use client'

// Браузер «как в жизни»: каноничный мобильный Chrome — вкладки с обзорным режимом,
// омнибокс с прогресс-баром, меню трёх точек, нижний тулбар, история, тёмная тема.
// Внутри: игровые сайты + НАСТОЯЩИЙ интернет через серверный прокси /api/browse.
import { useEffect, useRef, useState } from 'react'
import {
  BookOpen, ChevronLeft, ChevronRight, CreditCard, ExternalLink, Globe, History,
  Lock, Plus, RotateCw, Search, ShoppingBag, Square, TrendingDown,
  TrendingUp, Users, X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtDateTime, timeAgo } from '@/lib/format'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { useDrag, useSwipe } from '@/lib/use-swipe'
import type { MarketStats } from '@/lib/types'
import { Button } from '@/components/ui/button'

// ---------- палитра Chrome (светлая/тёмная) ----------
const C = {
  light: {
    shell: 'bg-white text-[#202124]',
    omnibox: 'bg-[#f1f3f4] text-[#202124] placeholder:text-[#5f6368]',
    icon: 'text-[#5f6368]',
    iconActive: 'text-[#1a73e8]',
    iconDisabled: 'text-[#bdc1c6]',
    toolbarBorder: 'border-[#e8eaed]',
    progress: '#1a73e8',
    overlayBg: 'bg-[#dee1e6]',
    card: 'bg-white',
    cardBorder: 'border-transparent',
    cardActive: 'border-[#1a73e8]',
    sheet: 'bg-white',
    menuBorder: 'border-transparent',
    divider: 'divide-[#e8eaed]',
    sub: 'text-[#5f6368]',
    faint: 'text-[#80868b]',
    hover: 'hover:bg-[#f1f3f4]',
    chip: 'bg-[#f1f3f4] text-[#3c4043]',
    pillBtn: 'bg-[#e8f0fe] text-[#1a73e8]',
  },
  dark: {
    shell: 'bg-[#202124] text-[#e8eaed]',
    omnibox: 'bg-[#303134] text-[#e8eaed] placeholder:text-[#9aa0a6]',
    icon: 'text-[#9aa0a6]',
    iconActive: 'text-[#8ab4f8]',
    iconDisabled: 'text-[#5f6368]',
    toolbarBorder: 'border-[#3c4043]',
    progress: '#8ab4f8',
    overlayBg: 'bg-[#171718]',
    card: 'bg-[#292a2d]',
    cardBorder: 'border-transparent',
    cardActive: 'border-[#8ab4f8]',
    sheet: 'bg-[#292a2d]',
    menuBorder: 'border-[#3c4043]',
    divider: 'divide-[#3c4043]',
    sub: 'text-[#9aa0a6]',
    faint: 'text-[#80868b]',
    hover: 'hover:bg-[#303134]',
    chip: 'bg-[#303134] text-[#e8eaed]',
    pillBtn: 'bg-[#394457] text-[#8ab4f8]',
  },
} as const

type Pal = { [K in keyof typeof C.light]: string }

// вид записи в истории навигации
type NavEntry =
  | { type: 'site'; site: string }
  | { type: 'web'; url: string }
  | { type: 'search'; query: string }

// вкладка браузера — свой стек навигации
interface Tab {
  id: number
  stack: NavEntry[]
  idx: number
}

let tabSeq = 2

function entryKey(e: NavEntry): string {
  return e.type === 'site' ? e.site : e.type === 'web' ? `web:${e.url}` : `search:${e.query}`
}

function isProbablyUrl(s: string): boolean {
  if (/\s/.test(s)) return false
  if (/^https?:\/\//i.test(s)) return true
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s.trim())
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const SITE_META: Record<string, { title: string }> = {
  start: { title: 'Новая вкладка' },
  'sdelka.ru': { title: 'Сделка — объявления' },
  'news.market': { title: 'Market News' },
  'forum.market': { title: 'Market Forum' },
  'banki.ru': { title: 'Банки.ру — ставки' },
  'help.guide': { title: 'Гайд новичку' },
}

function entryTitle(e: NavEntry): string {
  if (e.type === 'site') return SITE_META[e.site]?.title ?? e.site
  if (e.type === 'web') return hostOf(e.url)
  return e.query
}

function entrySub(e: NavEntry): string {
  if (e.type === 'site') return e.site
  if (e.type === 'web') return hostOf(e.url)
  return 'Поиск в интернете'
}

function hueOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 360
}

// круглый «фавикон» — первая буква домена/сайта на цветном круге
function Favicon({ seed, size = 16, className = '' }: { seed: string; size?: number; className?: string }) {
  const letter = (seed.replace(/^https?:\/\//, '')[0] ?? 'w').toUpperCase()
  return (
    <span
      className={'inline-flex shrink-0 items-center justify-center rounded-full font-bold ' + className}
      style={{ width: size, height: size, backgroundColor: `hsl(${hueOf(seed)} 62% 46%)`, color: '#fff', fontSize: Math.round(size * 0.52) }}
    >
      {letter}
    </span>
  )
}

// ----------
const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  demand_up: { label: 'Спрос растёт', cls: 'bg-emerald-100 text-emerald-700' },
  demand_down: { label: 'Спрос падает', cls: 'bg-red-100 text-red-700' },
  fashion: { label: 'Тренд', cls: 'bg-purple-100 text-purple-700' },
  crisis: { label: 'Кризис', cls: 'bg-orange-100 text-orange-700' },
  opu: { label: 'Дефицит', cls: 'bg-fuchsia-100 text-fuchsia-700' },
  tax_raid: { label: 'Налоговая проверка', cls: 'bg-slate-200 text-slate-700' },
  supply: { label: 'Поставки', cls: 'bg-teal-100 text-teal-700' },
  garage: { label: 'Гаражная распродажа', cls: 'bg-yellow-100 text-yellow-700' },
}

const SITES = [
  { site: 'sdelka.ru', title: 'Сделка', desc: 'Объявления и сделки', icon: ShoppingBag, hue: 262 },
  { site: 'news.market', title: 'Market News', desc: 'Новости рынка', icon: TrendingUp, hue: 160 },
  { site: 'forum.market', title: 'Market Forum', desc: 'Сообщество ресейлеров', icon: Users, hue: 210 },
  { site: 'banki.ru', title: 'Банки.ру', desc: 'Ставки и вклады', icon: CreditCard, hue: 42 },
  { site: 'help.guide', title: 'Help Guide', desc: 'Гайд для новичка', icon: BookOpen, hue: 200 },
] as const

const WEB_CHIPS = ['wikipedia.org', 'habr.com', 'lenta.ru', 'bbc.com', 'reddit.com', 'github.com']

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
    title: 'Вклад в банке — тихие проценты каждый час',
    body:
      'Для тех, у кого деньги лежат мёртвым грузом: вклад капает каждый час, и это лучше, чем ноль. Держите подушку на вкладе, а живые деньги на балансе под закупку. Перед крупной сделкой снимайте заранее — снятие моментальное, но лучше не делать это в последний момент перед оплатой счёта.',
    replies: 18,
  },
]

type ForumPost = (typeof FORUM_POSTS)[number]

// ----------
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

// ----------
function NewsSite({ onBusy }: { onBusy?: (b: boolean) => void }) {
  const [news, setNews] = useState<MarketStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let alive = true
    onBusy?.(true)
    api
      .market()
      .then((d) => {
        if (alive) {
          setNews(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof ApiError ? e.message : 'Не удалось загрузить новости')
          setLoading(false)
        }
      })
      .finally(() => {
        if (alive) onBusy?.(false)
      })
    return () => {
      alive = false
    }
  }, [retry, onBusy])

  if (loading && !news) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-16 rounded-2xl bg-neutral-200 animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-neutral-200 animate-pulse" />
        ))}
      </div>
    )
  }
  if (error && !news) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <Button className="mt-4 rounded-xl" onClick={() => setRetry((k) => k + 1)}>
            Повторить
          </Button>
        </div>
      </div>
    )
  }
  if (!news) return null

  return (
    <div className="min-h-full bg-[#f5f6f8]">
      {/* шапка сайта */}
      <div className="bg-white px-4 pb-3 pt-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <TrendingUp className="size-4 text-white" />
            </div>
            <div className="text-base font-bold text-neutral-900">Market News</div>
          </div>
          <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Live</div>
        </div>
        <div className="mt-1 text-[11px] text-neutral-400">Новости обновляются рынком в реальном времени</div>
      </div>

      <div className="space-y-4 p-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {news.indexes.map((idx) => {
            const up = idx.multiplier >= 1
            return (
              <div key={idx.category} className="min-w-[118px] shrink-0 rounded-2xl bg-white p-3 shadow-sm">
                <div className="truncate text-[11px] text-neutral-500">{idx.category}</div>
                <div className={'mt-1 flex items-center gap-1 text-sm font-bold ' + (up ? 'text-emerald-600' : 'text-red-500')}>
                  {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  x{idx.multiplier.toFixed(2)}
                </div>
              </div>
            )
          })}
        </div>

        {news.events.length === 0 ? (
          <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
            <p className="text-xs text-neutral-400">Свежих новостей пока нет — рынок спит.</p>
          </div>
        ) : (
          news.events.map((ev) => {
            const badge = KIND_BADGE[ev.kind] ?? { label: ev.kind, cls: 'bg-neutral-100 text-neutral-600' }
            return (
              <article key={ev.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 bg-neutral-50/80 px-4 py-2">
                  <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + badge.cls}>{badge.label}</span>
                  <span className="text-[10px] text-neutral-400">{CATEGORY_LABEL[ev.category] ?? ev.category}</span>
                </div>
                <div className="p-4">
                  <div className="text-sm font-semibold leading-snug">{ev.headline}</div>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600">{ev.body}</p>
                  <div className="mt-2 text-[10px] text-neutral-400">{timeAgo(ev.createdAt)}</div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}

// ----------
// НАСТОЯЩАЯ ВЕБ-СТРАНИЦА через серверный прокси
function WebPage({ url, onNavigate, onBusy }: { url: string; onNavigate: (url: string) => void; onBusy?: (b: boolean) => void }) {
  const [data, setData] = useState<{ title: string; text: string; links: { href: string; title: string }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    onBusy?.(true)
    api
      .browsePage(url)
      .then((d) => {
        if (!alive) return
        setData({ title: d.title, text: d.text, links: d.links })
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof ApiError ? e.message : 'Не удалось загрузить страницу')
        setLoading(false)
      })
      .finally(() => {
        if (alive) onBusy?.(false)
      })
    return () => {
      alive = false
    }
  }, [url, onBusy])

  if (loading) {
    return (
      <div className="min-h-full bg-white p-4">
        <div className="skeleton-shimmer h-4 w-1/3 rounded" />
        <div className="skeleton-shimmer mt-3 h-6 w-3/4 rounded" />
        <div className="mt-5 space-y-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-shimmer h-3.5 rounded" style={{ width: `${95 - (i % 3) * 12}%` }} />
          ))}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-full bg-white">
        <div className="flex h-full flex-col items-center justify-center p-8 pt-20 text-center">
          <Globe className="size-12 text-neutral-300" />
          <div className="mt-4 text-base font-semibold">Страница не открылась</div>
          <p className="mt-1 max-w-[250px] text-xs leading-relaxed text-neutral-500">{error}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => window.location.reload()}>
              Обновить
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => window.open(url, '_blank', 'noopener')}>
              Открыть в новой вкладке
            </Button>
          </div>
        </div>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="min-h-full bg-white">
      <div className="border-b border-neutral-100 bg-neutral-50/80 px-4 py-3">
        <div className="text-base font-bold leading-snug text-neutral-900">{data.title}</div>
        <div className="mt-0.5 text-[11px] text-neutral-400">{hostOf(url)}</div>
      </div>
      <div className="space-y-2.5 px-4 py-4">
        {data.text.split('\n').map((p, i) =>
          p ? (
            <p key={i} className="text-[13px] leading-relaxed text-neutral-700">
              {p}
            </p>
          ) : null,
        )}
      </div>
      {data.links.length > 0 && (
        <div className="border-t border-neutral-100 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Ссылки на странице</div>
          <ul className="mt-2 space-y-1">
            {data.links.slice(0, 20).map((l) => (
              <li key={l.href}>
                <button
                  type="button"
                  onClick={() => onNavigate(l.href)}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors active:bg-neutral-100"
                >
                  <Favicon seed={hostOf(l.href)} size={18} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[#1a0dab]">{l.title}</span>
                  <ExternalLink className="size-3 shrink-0 text-neutral-300" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ----------
// НАСТОЯЩИЙ ПОИСК
function WebSearch({ query, onNavigate, onBusy }: { query: string; onNavigate: (url: string) => void; onBusy?: (b: boolean) => void }) {
  const [data, setData] = useState<{ results: { title: string; href: string; snippet: string; source: string }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    onBusy?.(true)
    api
      .browseSearch(query)
      .then((d) => {
        if (!alive) return
        setData({ results: d.results })
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof ApiError ? e.message : 'Поиск не удался')
        setLoading(false)
      })
      .finally(() => {
        if (alive) onBusy?.(false)
      })
    return () => {
      alive = false
    }
  }, [query, onBusy])

  if (loading) {
    return (
      <div className="min-h-full bg-white p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mb-4">
            <div className="skeleton-shimmer h-3 w-32 rounded" />
            <div className="skeleton-shimmer mt-2 h-4 w-3/4 rounded" />
            <div className="skeleton-shimmer mt-2 h-3 w-full rounded" />
          </div>
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white p-8 text-center">
        <Search className="size-10 text-neutral-300" />
        <div className="mt-3 text-sm font-semibold">Поиск недоступен</div>
        <p className="mt-1 max-w-[240px] text-xs text-neutral-500">{error}</p>
      </div>
    )
  }
  if (!data || data.results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white p-8 text-center">
        <Search className="size-10 text-neutral-300" />
        <div className="mt-3 text-sm font-semibold">Ничего не найдено</div>
        <p className="mt-1 text-xs text-neutral-500">Попробуйте другой запрос</p>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white p-4">
      <div className="pb-3 text-[11px] text-neutral-400">Результатов: {data.results.length}</div>
      <ul className="space-y-4">
        {data.results.map((r, i) => (
          <li key={i}>
            <button type="button" onClick={() => onNavigate(r.href)} className="w-full text-left">
              <div className="flex items-center gap-2">
                <Favicon seed={hostOf(r.href)} size={22} />
                <div className="min-w-0">
                  <div className="truncate text-[11px] leading-tight text-neutral-600">{hostOf(r.href)}</div>
                  <div className="text-[10px] leading-tight text-neutral-400">{r.source}</div>
                </div>
              </div>
              <div className="mt-1 text-[15px] font-medium leading-snug text-[#1a0dab]">{r.title}</div>
              {r.snippet && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-600">{r.snippet}</p>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ----------
// игровые сайты-интерстициалы
function SdelkaSite({ onOpenApp }: { onOpenApp: (a: 'avito' | 'bank') => void }) {
  return (
    <div className="min-h-full bg-[#f5f6f8]">
      <div className="bg-gradient-to-b from-[#00A0E3] to-[#0489C6] px-5 pb-8 pt-10 text-center text-white">
        <ShoppingBag className="mx-auto size-11" />
        <div className="mt-3 text-xl font-bold">sdelka.ru</div>
        <p className="mx-auto mt-1.5 max-w-[280px] text-xs leading-relaxed text-white/85">
          Крупнейший сайт объявлений этой вселенной. В мобильном приложении удобнее: живая лента, чаты, сделки и продвижение.
        </p>
      </div>
      <div className="mx-auto -mt-4 max-w-xs px-4 pb-6">
        <div className="overflow-hidden rounded-[1.75rem] border-[5px] border-neutral-800 bg-white shadow-2xl">
          <div className="p-4">
            <div className="grid grid-cols-2 gap-2">
              {['Телефоны', 'Кроссовки', 'Ноутбуки', 'Часы'].map((c) => (
                <div key={c} className="rounded-xl bg-neutral-100 px-3 py-2.5 text-center text-[11px] font-medium text-neutral-600">
                  {c}
                </div>
              ))}
            </div>
            <button
              className="mt-3 h-11 w-full rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#00A0E3' }}
              onClick={() => onOpenApp('avito')}
            >
              Открыть приложение Сделка
            </button>
            <p className="mt-2 text-center text-[10px] text-neutral-400">Откроется внутри системы</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function BankiSite({ onOpenApp }: { onOpenApp: (a: 'avito' | 'bank') => void }) {
  return (
    <div className="min-h-full bg-[#f5f6f8] p-4">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="bg-gradient-to-r from-[#21A038] to-[#12842F] px-5 py-5 text-white">
          <CreditCard className="size-7" />
          <div className="mt-2 text-lg font-bold">Столичный Банк</div>
          <div className="text-[11px] text-white/80">banki.ru · обзор ставок</div>
        </div>
        <div className="p-4">
          <p className="text-xs leading-relaxed text-neutral-600">
            Столичный Банк в этой игре один, зато надёжный. Кредит выдают за секунду, лимит растёт вместе с уровнем игрока.
            Накопительный вклад приносит проценты каждый час — маленькие деньги, но капают круглосуточно. Пока кредит не
            погашен, новый не выдадут.
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5 text-xs">
              <span className="text-neutral-500">Кредит</span>
              <span className="font-semibold text-neutral-800">15% на 7 дней</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5 text-xs">
              <span className="text-neutral-500">Вклад</span>
              <span className="font-semibold text-emerald-600">0.04% в час</span>
            </div>
          </div>
          <button
            className="mt-4 h-11 w-full rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#21A038' }}
            onClick={() => onOpenApp('bank')}
          >
            Открыть приложение Банк
          </button>
          <p className="mt-2 text-center text-[10px] text-neutral-400">Банк откроется внутри системы</p>
        </div>
      </div>
    </div>
  )
}

function HelpSite() {
  return (
    <div className="min-h-full bg-[#f5f6f8] p-4">
      <div className="rounded-2xl bg-slate-700 p-4 text-white shadow-sm">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5" />
          <div className="text-base font-bold">Гайд новичку</div>
        </div>
        <div className="mt-0.5 text-[11px] text-white/80">Всё, что нужно знать перед первой сделкой</div>
      </div>
      <div className="mt-3 space-y-3">
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
            b: '4% с каждой продажи капает в счёт налоговой автоматически. Не платите больше суток — получите пеню 10% в сутки, а долг от 10 000 заблокирует продажи.',
          },
          {
            t: '5. Кредит и вклад',
            b: 'Кредит: 15% на 7 дней, лимит зависит от уровня. Брать — только под быстрый оборот. Вклад: проценты капают каждый час, снимайте перед закупкой.',
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
    </div>
  )
}

// ----------
// НОВАЯ ВКЛАДКА (Chrome NTP): цветной вордмарк, поиск, шорткаты
function NewTabPage({
  pal,
  urlInput,
  setUrlInput,
  onSubmit,
  onGo,
}: {
  pal: Pal
  urlInput: string
  setUrlInput: (v: string) => void
  onSubmit: () => void
  onGo: (e: NavEntry) => void
}) {
  // вордмарк в духе Google-цветов, но со своим словом
  const wordmark = [
    { ch: 'П', color: '#4285F4' },
    { ch: 'о', color: '#EA4335' },
    { ch: 'и', color: '#FBBC05' },
    { ch: 'с', color: '#4285F4' },
    { ch: 'к', color: '#34A853' },
  ]
  return (
    <div className={'min-h-full ' + (pal.shell === C.light.shell ? 'bg-white' : 'bg-[#202124]')}>
      <div className="flex flex-col items-center px-6 pt-12">
        {/* вордмарк */}
        <div className="select-none text-[44px] font-medium leading-none tracking-tight" aria-hidden>
          {wordmark.map((w, i) => (
            <span key={i} style={{ color: w.color }}>
              {w.ch}
            </span>
          ))}
        </div>

        {/* поиск-пилюля */}
        <div className="mt-7 w-full max-w-[340px]">
          <div className={'flex h-12 items-center gap-3 rounded-full px-4 shadow-sm ' + pal.omnibox}>
            <Search className={'size-4.5 shrink-0 ' + pal.sub} />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={urlInput === 'start' ? '' : urlInput}
              placeholder="Введите запрос или адрес"
              aria-label="Поиск или адрес"
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit()
              }}
            />
            <button type="button" aria-label="Искать" onClick={onSubmit} className="shrink-0 transition active:scale-90">
              <Search className={'size-4.5 ' + pal.iconActive} />
            </button>
          </div>
        </div>

        {/* шорткаты */}
        <div className="mt-9 w-full">
          <div className={'mb-3 px-1 text-[12px] font-medium ' + pal.faint}>Часто посещаемые</div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-5">
            {SITES.map((s) => (
              <button
                key={s.site}
                type="button"
                onClick={() => onGo({ type: 'site', site: s.site })}
                className="group flex flex-col items-center gap-1.5"
              >
                <span className={'flex size-14 items-center justify-center rounded-full transition group-active:scale-95 ' + pal.chip}>
                  <span
                    className="flex size-9 items-center justify-center rounded-full text-[15px] font-bold text-white"
                    style={{ backgroundColor: `hsl(${s.hue} 62% 48%)` }}
                  >
                    {s.title[0]}
                  </span>
                </span>
                <span className={'max-w-full truncate text-[11px] ' + pal.sub}>{s.title}</span>
              </button>
            ))}
            <button type="button" onClick={() => onGo({ type: 'site', site: 'start' })} className="pointer-events-none hidden" aria-hidden />
          </div>
        </div>

        {/* настоящий интернет */}
        <div className={'mt-9 w-full rounded-2xl p-4 ' + pal.chip}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Globe className={'size-4 ' + pal.iconActive} />
            Настоящий интернет
          </div>
          <p className={'mt-1 text-[11px] leading-relaxed ' + pal.sub}>
            Введите адрес сайта или что угодно для поиска — страницы грузятся из реальной сети.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {WEB_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onGo({ type: 'web', url: `https://${c}` })}
                className={'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition active:scale-95 ' + (pal === C.light ? 'bg-white text-[#3c4043] shadow-sm' : 'bg-[#3c4043] text-[#e8eaed]')}
              >
                <Favicon seed={c} size={14} />
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className={'mt-8 pb-6 text-[10px] ' + pal.faint}>Сделка Браузер · безопасный просмотр включён</div>
      </div>
    </div>
  )
}

// ----------
// ОБЗОР ВКЛАДОК (tab switcher)
function TabSwitcher({
  pal,
  isDark,
  tabs,
  activeId,
  onPick,
  onClose,
  onNew,
  onCloseAll,
}: {
  pal: Pal
  isDark: boolean
  tabs: Tab[]
  activeId: number
  onPick: (id: number) => void
  onClose: (id: number) => void
  onNew: () => void
  onCloseAll: () => void
}) {
  return (
    <div className={'flex h-full flex-col ' + pal.overlayBg}>
      <div className={'flex items-center justify-between px-4 pb-2 pt-3.5'}>
        <div className={'text-sm font-semibold ' + pal.sub}>
          {tabs.length} {tabs.length === 1 ? 'вкладка' : tabs.length < 5 ? 'вкладки' : 'вкладок'}
        </div>
        <button
          type="button"
          onClick={onCloseAll}
          className={'rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ' + pal.chip}
        >
          Закрыть все
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        <div className="grid grid-cols-2 gap-3">
          {tabs.map((t) => {
            const cur = t.stack[t.idx] ?? { type: 'site', site: 'start' as const }
            const isNtp = cur.type === 'site' && cur.site === 'start'
            const active = t.id === activeId
            return (
              <div
                key={t.id}
                className={'tab-card-in overflow-hidden rounded-xl shadow-md ring-1 transition ' + (active ? 'ring-[#1a73e8]' : isDark ? 'ring-white/10' : 'ring-black/10')}
              >
                {/* шапка карточки вкладки */}
                <div className={'flex items-center gap-1.5 px-2.5 py-2 ' + pal.card}>
                  {isNtp ? (
                    <span className="flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: '#4285F4' }}>
                      П
                    </span>
                  ) : (
                    <Favicon seed={entrySub(cur)} size={16} />
                  )}
                  <span className={'min-w-0 flex-1 truncate text-[11px] font-medium ' + pal.shell.split(' ')[1]}>
                    {entryTitle(cur)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Закрыть вкладку ${entryTitle(cur)}`}
                    onClick={() => onClose(t.id)}
                    className={'flex size-4.5 shrink-0 items-center justify-center rounded-full transition hover:bg-black/10 active:scale-90 ' + pal.sub}
                  >
                    <X className="size-3" />
                  </button>
                </div>
                {/* превью вкладки */}
                <button type="button" onClick={() => onPick(t.id)} className={'block h-36 w-full p-3 text-left ' + (isNtp ? (isDark ? 'bg-[#202124]' : 'bg-white') : 'bg-white')}>
                  {isNtp ? (
                    <div className="flex flex-col items-center pt-6">
                      <div className="text-xl font-medium tracking-tight">
                        <span style={{ color: '#4285F4' }}>П</span>
                        <span style={{ color: '#EA4335' }}>о</span>
                        <span style={{ color: '#FBBC05' }}>и</span>
                        <span style={{ color: '#4285F4' }}>с</span>
                        <span style={{ color: '#34A853' }}>к</span>
                      </div>
                      <div className={'mt-3 h-7 w-4/5 rounded-full ' + (isDark ? 'bg-[#303134]' : 'bg-neutral-100')} />
                    </div>
                  ) : (
                    <div>
                      <div className="truncate text-[11px] font-semibold text-neutral-800">{entryTitle(cur)}</div>
                      <div className="mt-1 truncate text-[9px] text-neutral-400">{entrySub(cur)}</div>
                      <div className="mt-2.5 space-y-1.5">
                        {[92, 78, 85, 60, 88].map((w, i) => (
                          <div key={i} className="h-1.5 rounded-full bg-neutral-200" style={{ width: `${w}%` }} />
                        ))}
                      </div>
                      <div className="mt-3 h-12 rounded-lg bg-neutral-100" />
                    </div>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* нижняя панель обзорщика */}
      <div className={'flex items-center justify-between border-t px-4 py-2.5 ' + pal.toolbarBorder + ' ' + pal.sheet}>
        <button
          type="button"
          onClick={onNew}
          className="flex size-10 items-center justify-center rounded-full bg-[#1a73e8] text-white shadow-md transition active:scale-90"
          aria-label="Новая вкладка"
        >
          <Plus className="size-5" />
        </button>
        <div className={'rounded-full px-3 py-1 text-[11px] font-semibold ' + pal.chip}>
          Сделка Браузер
        </div>
        <div className="size-10" />
      </div>
    </div>
  )
}

// ----------
// ПАНЕЛЬ ИСТОРИИ
function HistoryPanel({
  pal,
  entries,
  onPick,
  onBack,
}: {
  pal: Pal
  entries: { entry: NavEntry; at: number }[]
  onPick: (e: NavEntry) => void
  onBack: () => void
}) {
  return (
    <div className={'flex h-full flex-col ' + pal.shell}>
      <div className={'flex items-center gap-2 border-b px-3 py-3 ' + pal.toolbarBorder}>
        <button type="button" onClick={onBack} className={'flex size-9 items-center justify-center rounded-full transition ' + pal.hover} aria-label="Назад в браузер">
          <ChevronLeft className={'size-5 ' + pal.icon} />
        </button>
        <div className="flex-1 text-sm font-semibold">История</div>
        <History className={'size-4.5 ' + pal.faint} />
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-16 text-center">
            <History className={'size-10 ' + (pal === C.light ? 'text-neutral-300' : 'text-[#5f6368]')} />
            <div className={'mt-3 text-sm font-medium ' + pal.sub}>История пуста</div>
            <p className={'mt-1 text-xs ' + pal.faint}>Открытые сайты появятся здесь</p>
          </div>
        ) : (
          <ul className={'divide-y ' + pal.divider}>
            {entries.map(({ entry, at }, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPick(entry)}
                  className={'flex w-full items-center gap-3 px-4 py-3 text-left transition ' + pal.hover}
                >
                  <Favicon seed={entrySub(entry)} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className={'block truncate text-[13px] font-medium ' + pal.shell.split(' ')[1]}>{entryTitle(entry)}</span>
                    <span className={'block truncate text-[11px] ' + pal.faint}>{entrySub(entry)}</span>
                  </span>
                  <span className={'shrink-0 text-[10px] ' + pal.faint}>{timeAgo(new Date(at).toISOString())}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ----------
export default function BrowserApp({ onOpenApp }: { onOpenApp: (app: 'avito' | 'bank') => void }) {
  const theme = useOS((s) => s.theme)
  const pal = theme === 'dark' ? C.dark : C.light

  const [tabs, setTabs] = useState<Tab[]>([
    { id: 1, stack: [{ type: 'site', site: 'start' }], idx: 0 },
  ])
  const [activeId, setActiveId] = useState(1)
  const [urlInput, setUrlInput] = useState('start')
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [omniFocused, setOmniFocused] = useState(false)
  const [view, setView] = useState<'page' | 'tabs' | 'history'>('page')
  const [menuOpen, setMenuOpen] = useState(false)
  // журнал посещений с реальными таймстампами
  const [historyLog, setHistoryLog] = useState<{ entry: NavEntry; at: number }[]>([])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const current = active.stack[active.idx] ?? { type: 'site', site: 'start' }
  const currentKey = entryKey(current)
  const isNtp = current.type === 'site' && current.site === 'start'
  const secure = current.type === 'web'
  const canBack = active.idx > 0
  const canForward = active.idx < active.stack.length - 1

  // синхронизация строки адреса с навигацией: «adjust state when props change»
  const [lastKey, setLastKey] = useState(currentKey)
  if (currentKey !== lastKey) {
    setLastKey(currentKey)
    setUrlInput(
      current.type === 'site'
        ? current.site
        : current.type === 'web'
          ? current.url
          : current.query,
    )
  }

  // история: журнал посещений, свежие сверху
  const historyEntries = [...historyLog].reverse()

  const go = (entry: NavEntry) => {
    setView('page')
    if (entry.type !== 'site' || entry.site !== 'start') {
      setHistoryLog((h) => [...h.slice(-59), { entry, at: Date.now() }])
    }
    if (entryKey(entry) === currentKey) {
      setReloadKey((k) => k + 1)
      return
    }
    setTabs((ts) =>
      ts.map((t) => {
        if (t.id !== activeId) return t
        const stack = [...t.stack.slice(0, t.idx + 1), entry]
        return { ...t, stack, idx: stack.length - 1 }
      }),
    )
  }

  const submitUrl = () => {
    setOmniFocused(false)
    const t = urlInput.trim()
    if (!t) return
    if (isProbablyUrl(t)) {
      go({ type: 'web', url: /^https?:\/\//i.test(t) ? t : `https://${t}` })
    } else {
      go({ type: 'search', query: t })
    }
  }

  const back = () => setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, idx: Math.max(0, t.idx - 1) } : t)))
  const forward = () => setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, idx: Math.min(t.stack.length - 1, t.idx + 1) } : t)))
  const home = () => go({ type: 'site', site: 'start' })
  const reload = () => setReloadKey((k) => k + 1)

  const newTab = () => {
    const t: Tab = { id: tabSeq++, stack: [{ type: 'site', site: 'start' }], idx: 0 }
    setTabs((ts) => [...ts, t])
    setActiveId(t.id)
    setUrlInput('start')
    setView('page')
    setMenuOpen(false)
  }

  const closeTab = (id: number) => {
    setTabs((ts) => {
      const remaining = ts.filter((t) => t.id !== id)
      if (remaining.length === 0) {
        const fresh: Tab = { id: tabSeq++, stack: [{ type: 'site', site: 'start' }], idx: 0 }
        setActiveId(fresh.id)
        setUrlInput('start')
        return [fresh]
      }
      if (id === activeId) {
        const idx = ts.findIndex((t) => t.id === id)
        const neighbor = remaining[Math.min(idx, remaining.length - 1)]
        setActiveId(neighbor.id)
        setUrlInput(
          neighbor.stack[neighbor.idx].type === 'site'
            ? (neighbor.stack[neighbor.idx] as { type: 'site'; site: string }).site
            : neighbor.stack[neighbor.idx].type === 'web'
              ? (neighbor.stack[neighbor.idx] as { type: 'web'; url: string }).url
              : (neighbor.stack[neighbor.idx] as { type: 'search'; query: string }).query,
        )
      }
      return remaining
    })
  }

  const closeAllTabs = () => {
    const fresh: Tab = { id: tabSeq++, stack: [{ type: 'site', site: 'start' }], idx: 0 }
    setTabs([fresh])
    setActiveId(fresh.id)
    setUrlInput('start')
  }

  const pickTab = (id: number) => {
    const t = tabs.find((x) => x.id === id)
    if (t) {
      const e = t.stack[t.idx]
      setUrlInput(e.type === 'site' ? e.site : e.type === 'web' ? e.url : e.query)
    }
    setActiveId(id)
    setView('page')
    setMenuOpen(false)
  }

  // содержимое активной вкладки
  const contentKey = `${activeId}:${currentKey}:${reloadKey}`

  // ─── Chrome-полировка 1: pull-to-refresh — тянем страницу вниз от верха.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState(0)
  const ptr = useDrag({
    onMove: (_dx, dy) => {
      const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0
      setPull(atTop && dy > 0 ? Math.min(dy * 0.42, 96) : 0)
    },
    onEnd: () => {
      setPull((p) => {
        if (p > 52) reload()
        return 0
      })
    },
  })
  const pullShift = Math.min(pull, 64)

  // ─── Chrome-полировка 2: свайп по омнибоксу переключает вкладки (как в мобильном Chrome).
  const omniSwipe = useSwipe({
    threshold: 56,
    onSwipe: (dir) => {
      if (view !== 'page' || tabs.length < 2) return
      const i = tabs.findIndex((t) => t.id === activeId)
      const next = dir === 'left' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length
      pickTab(tabs[next].id)
    },
  })

  return (
    <div className={'relative flex h-full flex-col overflow-hidden ' + pal.shell}>
      {/* ---------- верхний тулбар Chrome ---------- */}
      <div className={'relative z-20 border-b ' + pal.toolbarBorder + ' ' + (isNtp ? (theme === 'dark' ? 'bg-[#202124]' : 'bg-white') : theme === 'dark' ? 'bg-[#292a2d]' : 'bg-white')} onPointerDown={omniSwipe.onPointerDown}>
        <div className="flex items-center gap-2 px-2.5 py-2">
          {/* омнибокс */}
          <div
            className={
              'relative flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full pl-3 pr-1.5 transition ' +
              pal.omnibox +
              (omniFocused ? ' ring-2 ring-[#1a73e8]' : '')
            }
          >
            {isNtp ? (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: '#4285F4' }} aria-hidden>
                П
              </span>
            ) : secure ? (
              <Lock className="size-3.5 shrink-0 text-[#5f6368]" aria-label="Защищённое соединение" />
            ) : (
              <Favicon seed={entrySub(current)} size={18} />
            )}
            <input
              className="min-w-0 flex-1 truncate bg-transparent text-[13px] outline-none"
              value={urlInput}
              placeholder="Поиск или адрес"
              aria-label="Поиск или ввод адреса"
              onFocus={() => setOmniFocused(true)}
              onBlur={() => setOmniFocused(false)}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitUrl()
              }}
            />
            <button
              type="button"
              aria-label="Перезагрузить страницу"
              onClick={reload}
              className={'flex size-7 shrink-0 items-center justify-center rounded-full transition active:scale-90 ' + pal.icon}
            >
              <RotateCw className="size-3.5" />
            </button>
          </div>

          {/* счётчик вкладок */}
          <button
            type="button"
            onClick={() => {
              setView(view === 'tabs' ? 'page' : 'tabs')
              setMenuOpen(false)
            }}
            aria-label={`Вкладки: ${tabs.length}`}
            className={'relative flex size-9 shrink-0 items-center justify-center rounded-full transition active:scale-90 ' + pal.hover}
          >
            <Square className={'size-5 ' + pal.icon} strokeWidth={2} />
            <span className={'absolute inset-0 flex items-center justify-center text-[10px] font-bold ' + pal.icon}>{tabs.length}</span>
          </button>

          {/* меню три точки */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Меню"
              aria-expanded={menuOpen}
              className={'flex size-9 items-center justify-center rounded-full transition active:scale-90 ' + pal.hover}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={pal.icon} aria-hidden>
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />
                <div className={'chrome-menu-in absolute right-0 top-10 z-40 w-60 overflow-hidden rounded-2xl py-1.5 shadow-2xl ring-1 ring-black/10 ' + pal.sheet + ' ' + pal.menuBorder}>
                  {[
                    { icon: Plus, label: 'Новая вкладка', fn: newTab },
                    { icon: History, label: 'История', fn: () => { setView('history'); setMenuOpen(false) } },
                    { icon: BookOpen, label: 'Открыть Сделку', fn: () => { onOpenApp('avito'); setMenuOpen(false) } },
                    { icon: CreditCard, label: 'Открыть Банк', fn: () => { onOpenApp('bank'); setMenuOpen(false) } },
                    { icon: X, label: 'Закрыть все вкладки', fn: closeAllTabs },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.fn}
                      className={'flex w-full items-center gap-3.5 px-4 py-2.5 text-left text-[13px] transition ' + pal.hover}
                    >
                      <item.icon className={'size-4.5 ' + pal.icon} />
                      {item.label}
                    </button>
                  ))}
                  <div className={'mt-1 border-t px-4 pb-1.5 pt-2 text-[10px] ' + pal.faint + ' ' + pal.toolbarBorder}>
                    Сделка Браузер 130.0.6723
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* прогресс-бар загрузки */}
        <div className="absolute bottom-[-1px] left-0 right-0 h-[3px] overflow-hidden">
          {busy && (
            <div className="h-full w-1/3 rounded-full" style={{ backgroundColor: pal.progress }}>
              <div className="chrome-load h-full w-full rounded-full" style={{ backgroundColor: pal.progress }} />
            </div>
          )}
        </div>
      </div>

      {/* ---------- контент ---------- */}
      <div className="relative flex-1 overflow-hidden">
        {/* индикатор pull-to-refresh */}
        {pull > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-2 z-30"
            style={{ transform: `translateX(-50%) translateY(${pullShift}px)` }}
          >
            <span
              className="flex size-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5"
              style={{ transform: `rotate(${Math.min(1, pull / 64) * 300}deg)`, opacity: 0.35 + Math.min(1, pull / 64) * 0.65 }}
            >
              <RotateCw className="size-4 text-[#5f6368]" />
            </span>
          </div>
        )}
        {view === 'tabs' ? (
          <TabSwitcher
            pal={pal}
            isDark={theme === 'dark'}
            tabs={tabs}
            activeId={activeId}
            onPick={pickTab}
            onClose={closeTab}
            onNew={newTab}
            onCloseAll={closeAllTabs}
          />
        ) : view === 'history' ? (
          <HistoryPanel pal={pal} entries={historyEntries} onPick={(e) => { go(e); setMenuOpen(false) }} onBack={() => setView('page')} />
        ) : (
          <div ref={scrollRef} className="h-full overflow-y-auto [scrollbar-width:thin]" onPointerDown={ptr.onPointerDown}>
            {isNtp && (
              <NewTabPage pal={pal} urlInput={urlInput} setUrlInput={setUrlInput} onSubmit={submitUrl} onGo={go} />
            )}

            {current.type === 'web' && (
              <WebPage
                key={`web:${contentKey}`}
                url={current.url}
                onNavigate={(u) => go({ type: 'web', url: u })}
                onBusy={setBusy}
              />
            )}

            {current.type === 'search' && (
              <WebSearch key={`search:${contentKey}`} query={current.query} onNavigate={(u) => go({ type: 'web', url: u })} onBusy={setBusy} />
            )}

            {current.type === 'site' && current.site === 'sdelka.ru' && <SdelkaSite key={`sd:${reloadKey}`} onOpenApp={onOpenApp} />}
            {current.type === 'site' && current.site === 'news.market' && <NewsSite key={`news:${reloadKey}`} onBusy={setBusy} />}
            {current.type === 'site' && current.site === 'forum.market' && (
              <div className="min-h-full bg-[#f5f6f8]">
                <div className="bg-white px-4 pb-3 pt-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-700">
                      <Users className="size-4 text-white" />
                    </div>
                    <div className="text-base font-bold text-neutral-900">Market Forum</div>
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-400">Сообщество ресейлеров: опыт, споры, лайфхаки</div>
                </div>
                <div className="space-y-3 p-4">
                  {FORUM_POSTS.map((p, i) => (
                    <ForumPostCard key={i} post={p} />
                  ))}
                </div>
              </div>
            )}
            {current.type === 'site' && current.site === 'banki.ru' && <BankiSite key={`bk:${reloadKey}`} onOpenApp={onOpenApp} />}
            {current.type === 'site' && current.site === 'help.guide' && <HelpSite key={`hg:${reloadKey}`} />}
          </div>
        )}
      </div>

      {/* ---------- нижний тулбар Chrome (удобно и на ПК, и на телефоне) ---------- */}
      {view !== 'tabs' && (
        <div className={'z-20 flex items-center justify-around border-t px-2 py-1.5 ' + pal.toolbarBorder + ' ' + (theme === 'dark' ? 'bg-[#292a2d]' : 'bg-white')}>
          <button
            type="button"
            onClick={back}
            disabled={!canBack}
            aria-label="Назад"
            className={'flex size-10 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-30 ' + pal.hover}
          >
            <ChevronLeft className={'size-5.5 ' + (canBack ? pal.icon : pal.iconDisabled)} />
          </button>
          <button
            type="button"
            onClick={forward}
            disabled={!canForward}
            aria-label="Вперёд"
            className={'flex size-10 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-30 ' + pal.hover}
          >
            <ChevronRight className={'size-5.5 ' + (canForward ? pal.icon : pal.iconDisabled)} />
          </button>
          <button
            type="button"
            onClick={home}
            aria-label="Домашняя страница"
            className={'flex size-10 items-center justify-center rounded-full transition active:scale-90 ' + pal.hover}
          >
            <Globe className={'size-5 ' + pal.icon} />
          </button>
          <button
            type="button"
            onClick={() => setView('tabs')}
            aria-label="Обзор вкладок"
            className={'relative flex size-10 items-center justify-center rounded-full transition active:scale-90 ' + pal.hover}
          >
            <Square className={'size-5 ' + pal.icon} />
            <span className={'absolute inset-0 flex items-center justify-center text-[9px] font-bold ' + pal.icon}>{tabs.length}</span>
          </button>
          <button
            type="button"
            onClick={newTab}
            aria-label="Новая вкладка"
            className={'flex size-10 items-center justify-center rounded-full transition active:scale-90 ' + pal.hover}
          >
            <Plus className={'size-5.5 ' + pal.icon} />
          </button>
        </div>
      )}
    </div>
  )
}
