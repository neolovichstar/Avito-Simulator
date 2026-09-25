'use client'

// Браузер «Resale» — внутренний (walled-garden) браузер в navy-теме по макету.
// Шесть экранов: стартовая (NTP), результаты поиска, страница сайта, закладки,
// обзор вкладок, приватный режим. Реальный интернет не загружается: известные
// адреса ведут на внутренние сайты, всё остальное — «Сайт недоступен».
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Bookmark, Check, ChevronLeft, ChevronRight, Compass, CreditCard, DatabaseBackup, EyeOff,
  Globe, History, Landmark, LifeBuoy, Lock, Mail, Megaphone, Menu, MessagesSquare, Mic,
  Newspaper, Plus, RotateCw, Search, Send, Settings2, ShoppingBag, Square, Trash2,
  TrendingDown, TrendingUp, Users, VenetianMask, X, Youtube,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { AppKey } from '@/lib/store'
import { fmtTime, timeAgo } from '@/lib/format'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { useDrag, useSwipe } from '@/lib/use-swipe'
import type { MarketStats } from '@/lib/types'

// ---------- палитра (браузер всегда тёмный, navy) ----------
// фон #0A1420 / глубже #060D18, поверхности #12203A и white/[0.05],
// бордеры white/10, акцент blue-500 / #60A5FA, вторичный текст white/55.

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
  incognito?: boolean
}

let tabSeq = 2

// ---------- каталог внутренних сайтов ----------
interface SiteDef {
  site: string
  title: string
  desc: string
  snippet: string
  color: string
  icon?: LucideIcon
  keywords: string[]
  thumb?: string
}

const SITES: SiteDef[] = [
  {
    site: 'sdelka.ru',
    title: 'Resale',
    desc: 'Купить и продать почти всё',
    snippet: 'Крупнейший сайт объявлений этой вселенной: б/у техника, кроссовки, мебель. Торг в чате, проверка товара при встрече, сделка в пару тапов.',
    color: '#16A34A',
    keywords: ['avito', 'resale', 'ресейл', 'объявления', 'купить', 'продать', 'маркет', 'товары', 'сделка', 'покупки', 'лоты'],
    thumb: '/img/p/iphone-13.jpg',
  },
  {
    site: 'news.market',
    title: 'Market News',
    desc: 'Новости рынка в реальном времени',
    snippet: 'Спрос, тренды и события рынка: индексы категорий обновляются живьём, свежие новости приходят первыми.',
    color: '#3B82F6',
    icon: TrendingUp,
    keywords: ['news', 'новости', 'рынок', 'индексы', 'спрос', 'тренды', 'события', 'кризис', 'лента'],
  },
  {
    site: 'forum.market',
    title: 'Market Forum',
    desc: 'Сообщество ресейлеров',
    snippet: 'Темы о торге с ботами, налогах, кредитах и продвижении объявлений. Опыт, споры и лайфхаки от топовых продавцов.',
    color: '#8B5CF6',
    icon: MessagesSquare,
    keywords: ['forum', 'форум', 'темы', 'сообщество', 'технологии', 'общение', 'лайфхаки', 'опыт', 'вопросы'],
  },
  {
    site: 'banki.ru',
    title: 'Столичный Банк',
    desc: 'Кредиты и вклады',
    snippet: 'Кредит 15% на 7 дней, накопительный вклад с начислением каждый час. Лимит растёт вместе с уровнем игрока.',
    color: '#21A038',
    icon: Landmark,
    keywords: ['banki', 'банк', 'кредит', 'вклад', 'ставка', 'деньги', 'финансы', 'проценты', 'займ'],
  },
  {
    site: 'help.guide',
    title: 'Help Guide',
    desc: 'Гайд новичку',
    snippet: 'Пошаговая инструкция: покупки, продажи, чат и торг, налоги, кредит с вкладом и продвижение объявлений.',
    color: '#0EA5E9',
    icon: LifeBuoy,
    keywords: ['help', 'помощь', 'гайд', 'инструкция', 'обучение', 'старт', 'новичок', 'путешествия', 'первый раз'],
  },
  {
    site: 'city.ads',
    title: 'City Ads',
    desc: 'Городские объявления',
    snippet: 'Объявления жителей района: мебель, техника, хобби и спорт. Всё по-соседски и без посредников.',
    color: '#F59E0B',
    keywords: ['city', 'город', 'объявления', 'район', 'соседи', 'местные', 'ads', 'барахолка', 'покупки'],
    thumb: '/img/p/nike-af1.jpg',
  },
]

const SITE_MAP: Record<string, SiteDef> = Object.fromEntries(SITES.map((s) => [s.site, s]))

const SITE_TITLES: Record<string, string> = {
  start: 'Новая вкладка',
  ...Object.fromEntries(SITES.map((s) => [s.site, s.title])),
}

function entryKey(e: NavEntry): string {
  return e.type === 'site' ? e.site : e.type === 'web' ? `web:${e.url}` : `search:${e.query}`
}

function entryTitle(e: NavEntry): string {
  if (e.type === 'site') return SITE_TITLES[e.site] ?? e.site
  if (e.type === 'web') return hostOf(e.url)
  return e.query
}

function entrySub(e: NavEntry): string {
  if (e.type === 'site') return e.site
  if (e.type === 'web') return hostOf(e.url)
  return 'Поиск в Resale'
}

function urlOf(e: NavEntry): string {
  if (e.type === 'site') return e.site === 'start' ? '' : e.site
  if (e.type === 'web') return e.url
  return e.query
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

// адрес -> запись навигации: внутренние сайты распознаются по домену
function resolveAddress(raw: string): NavEntry | null {
  const t = raw.trim()
  if (!t) return null
  if (isProbablyUrl(t)) {
    const host = t
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[/?#]/)[0]
      .toLowerCase()
    if (SITE_MAP[host]) return { type: 'site', site: host }
    return { type: 'web', url: /^https?:\/\//i.test(t) ? t : `https://${t}` }
  }
  return { type: 'search', query: t }
}

function hueOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 360
}

// квадратный «фавикон»: буква домена, у известных сайтов — фирменный цвет
function Favicon({ seed, size = 18 }: { seed: string; size?: number }) {
  const known = SITE_MAP[seed]
  const letter = (seed.replace(/^https?:\/\/(www\.)?/, '')[0] ?? 'w').toUpperCase()
  const style = known
    ? { width: size, height: size, backgroundColor: `${known.color}26`, color: known.color }
    : { width: size, height: size, backgroundColor: `hsl(${hueOf(seed)} 45% 22%)`, color: `hsl(${hueOf(seed)} 80% 72%)` }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-bold"
      style={{ ...style, borderRadius: Math.max(6, Math.round(size * 0.3)), fontSize: Math.round(size * 0.5) }}
      aria-hidden
    >
      {letter}
    </span>
  )
}

// ---------- шорткаты стартовой ----------
function GoogleWordmark() {
  const cols = ['#4285F4', '#EA4335', '#FBBC05', '#4285F4', '#34A853', '#EA4335']
  return (
    <span className="text-[10px] font-bold leading-none tracking-tight" aria-hidden>
      {'Google'.split('').map((ch, i) => (
        <span key={i} style={{ color: cols[i] }}>
          {ch}
        </span>
      ))}
    </span>
  )
}

const SHORTCUTS: { label: string; url: string; node: ReactNode }[] = [
  { label: 'Яндекс', url: 'https://ya.ru', node: <span className="text-[19px] font-black leading-none text-[#FC3F1D]">Я</span> },
  { label: 'Google', url: 'https://google.com', node: <GoogleWordmark /> },
  { label: 'YouTube', url: 'https://youtube.com', node: <Youtube className="size-5 text-[#FF0033]" /> },
  { label: 'VK', url: 'https://vk.com', node: <span className="text-[13px] font-black leading-none text-[#0077FF]">VK</span> },
  { label: 'Telegram', url: 'https://telegram.org', node: <Send className="size-5 text-[#229ED9]" /> },
  { label: 'Gmail', url: 'https://gmail.com', node: <Mail className="size-5 text-[#EA4335]" /> },
  { label: 'Wikipedia', url: 'https://Wikipedia.org', node: <span className="text-[15px] font-black leading-none text-white/75">W</span> },
]

const FAVORITES: { label: string; site: string; grad: string; icon: LucideIcon }[] = [
  { label: 'Новости', site: 'news.market', grad: 'from-blue-600 via-blue-700 to-indigo-950', icon: Newspaper },
  { label: 'Технологии', site: 'forum.market', grad: 'from-violet-600 via-purple-700 to-indigo-950', icon: MessagesSquare },
  { label: 'Путешествия', site: 'help.guide', grad: 'from-sky-600 via-sky-700 to-blue-950', icon: Compass },
]

// ---------- данные форум-тем ----------
const FORUM_POSTS = [
  {
    nick: 'Reseller_Pro',
    date: '14 мая, 10:12',
    hue: 24,
    title: 'Как распознать недооценённый товар',
    body:
      'Смотрите на цену ниже рыночной: открываете news.market, находите множитель своей категории — если спрос падает (множитель ниже x1.00), продавцы сливают товар дешевле. Берите состояние «отличное» по цене «хорошего», и маржа сама вам в руки. Ещё лайфхак: сравнивайте цену объявления с базовой ценой каталога, а не с первым попавшимся объявлением.',
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
      'Народ, ну кто опять копит долг до блокировки? С каждой продажи капает 4%, а пеня — 10% в сутки, если просрочили больше дня. Долг дорос до 10 000 — и всё, продажи заморожены. Кнопка «Оплатить всё» в приложении Налоги решает вопрос за секунду. Проверяйте задолженность хотя бы раз в день.',
    replies: 58,
  },
  {
    nick: 'KreditnyiTihon',
    date: '12 мая, 19:26',
    hue: 140,
    title: 'Кредит: брать или не брать?',
    body:
      'Брать можно и нужно, но только под оборотку: взял, купил недооценённый лот, продал с маржой, погасил за пару дней. Ставка 15% за 7 дней — это нормально, если товар уходит быстро. Нельзя брать кредит «на всякий случай» — банк просто не даст второй, пока не погашен первый. Лимит растёт с уровнем.',
    replies: 41,
  },
  {
    nick: 'Топ1вРайоне',
    date: '12 мая, 11:54',
    hue: 15,
    title: 'Продвижение объявлений: когда буст окупается',
    body:
      'Буст — не волшебная кнопка, а инструмент. Работает на ходовых категориях: электроника, телефоны, кроссовки. Ставьте вечером или в выходные, когда рынок живой, и только если цена у вас конкурентная. Бустить залежалый хлам по завышенной цене — это просто подарить банку денег.',
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

// ---------- данные городских объявлений ----------
const CITY_ADS = [
  { title: 'Диван-книжка, состояние хорошее', price: '3 200 ₽', area: 'р-н Северный', img: '/img/p/divan-knizhka.jpg' },
  { title: 'Кофемашина Delonghi, всё работает', price: '7 900 ₽', area: 'Центр', img: '/img/p/delonghi-kofemashina.jpg' },
  { title: 'Кресло-мешок, новое', price: '1 800 ₽', area: 'р-н Западный', img: '/img/p/bean-bag.jpg' },
  { title: 'Аквариум 60 л с тумбой', price: '2 500 ₽', area: 'р-н Восточный', img: '/img/p/akvarium-60.jpg' },
  { title: 'Коньки Bauer, размер 41', price: '3 000 ₽', area: 'р-н Северный', img: '/img/p/bauer-konki.jpg' },
  { title: 'Летние диски R16, комплект', price: '8 000 ₽', area: 'Гаражный кооператив', img: '/img/p/diski-r16.jpg' },
]

const RESALE_CATS = [
  { label: 'Телефоны', img: '/img/p/iphone-12.jpg' },
  { label: 'Кроссовки', img: '/img/p/adidas-samba.jpg' },
  { label: 'Ноутбуки', img: '/img/p/macbook-air-2020.jpg' },
  { label: 'Консоли', img: '/img/p/ps5.jpg' },
  { label: 'Наушники', img: '/img/p/airpods-pro-2.jpg' },
  { label: 'Часы', img: '/img/p/apple-watch-7.jpg' },
]

// бейджи новостей (тёмные варианты)
const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  demand_up: { label: 'Спрос растёт', cls: 'bg-emerald-500/15 text-emerald-300' },
  demand_down: { label: 'Спрос падает', cls: 'bg-red-500/15 text-red-300' },
  fashion: { label: 'Тренд', cls: 'bg-violet-500/15 text-violet-300' },
  crisis: { label: 'Кризис', cls: 'bg-orange-500/15 text-orange-300' },
  opu: { label: 'Дефицит', cls: 'bg-fuchsia-500/15 text-fuchsia-300' },
  tax_raid: { label: 'Налоговая проверка', cls: 'bg-slate-500/20 text-slate-300' },
  supply: { label: 'Поставки', cls: 'bg-teal-500/15 text-teal-300' },
  garage: { label: 'Гаражная распродажа', cls: 'bg-yellow-500/15 text-yellow-200' },
}

// ---------- общая шапка сайта (лого + ряд иконок, как на макете) ----------
function SiteHeader({ color, icon: Icon, title, right }: { color: string; icon: LucideIcon; title: string; right?: LucideIcon }) {
  const Right = right
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0A1420]/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}24`, color }}>
          <Icon className="size-4.5" aria-hidden />
        </span>
        <span className="text-[15px] font-bold text-white">{title}</span>
      </div>
      <div className="flex items-center gap-0.5 text-white/50">
        <span className="flex size-9 items-center justify-center" aria-hidden>
          <Search className="size-4.5" />
        </span>
        {Right && (
          <span className="flex size-9 items-center justify-center" aria-hidden>
            <Right className="size-4.5" />
          </span>
        )}
        <span className="flex size-9 items-center justify-center" aria-hidden>
          <Menu className="size-4.5" />
        </span>
      </div>
    </div>
  )
}

// ---------- сайт: news.market (синие карточки из api.market) ----------
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
      <div className="min-h-full bg-[#0A1420]">
        <SiteHeader color="#3B82F6" icon={TrendingUp} title="Market News" right={Newspaper} />
        <div className="space-y-3 p-4">
          <div className="h-16 animate-pulse rounded-2xl bg-white/[0.06]" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.06]" />
          ))}
        </div>
      </div>
    )
  }
  if (error && !news) {
    return (
      <div className="min-h-full bg-[#0A1420]">
        <SiteHeader color="#3B82F6" icon={TrendingUp} title="Market News" right={Newspaper} />
        <div className="flex flex-col items-center p-8 pt-14 text-center">
          <TrendingUp className="size-10 text-white/20" aria-hidden />
          <div className="mt-3 text-[14px] font-semibold text-white">{error}</div>
          <button
            type="button"
            onClick={() => setRetry((k) => k + 1)}
            className="mt-5 rounded-full bg-white/[0.06] px-5 py-2.5 text-[13px] font-medium text-blue-400 transition active:scale-95"
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }
  if (!news) return null

  return (
    <div className="min-h-full bg-[#0A1420] pb-8">
      <SiteHeader color="#3B82F6" icon={TrendingUp} title="Market News" right={Newspaper} />

      <div className="space-y-4 p-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {news.indexes.map((idx) => {
            const up = idx.multiplier >= 1
            return (
              <div key={idx.category} className="min-w-[112px] shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.05] p-3">
                <div className="truncate text-[11px] text-white/50">{CATEGORY_LABEL[idx.category] ?? idx.category}</div>
                <div className={'mt-1 flex items-center gap-1 text-[14px] font-bold ' + (up ? 'text-emerald-400' : 'text-red-400')}>
                  {up ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
                  x{idx.multiplier.toFixed(2)}
                </div>
              </div>
            )
          })}
        </div>

        {news.events.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.05] p-5 text-center">
            <p className="text-[12px] text-white/45">Свежих новостей пока нет — рынок спит.</p>
          </div>
        ) : (
          news.events.map((ev) => {
            const badge = KIND_BADGE[ev.kind] ?? { label: ev.kind, cls: 'bg-white/10 text-white/60' }
            return (
              <article key={ev.id} className="overflow-hidden rounded-2xl border border-blue-500/[0.14] bg-blue-500/[0.07]">
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] px-4 py-2">
                  <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + badge.cls}>{badge.label}</span>
                  <span className="text-[10px] text-white/40">{CATEGORY_LABEL[ev.category] ?? ev.category}</span>
                </div>
                <div className="p-4">
                  <div className="text-[13.5px] font-semibold leading-snug text-white">{ev.headline}</div>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/60">{ev.body}</p>
                  <div className="mt-2 text-[10px] text-white/35">{timeAgo(ev.createdAt)}</div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---------- сайт: forum.market (список тем) ----------
function ForumPostCard({ post }: { post: ForumPost }) {
  const nick = post.nick.trim()
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.05] p-4">
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ backgroundColor: `hsl(${post.hue} 42% 34%)` }}
          aria-hidden
        >
          {nick.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-white">{nick}</div>
          <div className="text-[10px] text-white/35">{post.date}</div>
        </div>
      </div>
      <div className="mt-2.5 text-[14px] font-semibold leading-snug text-white">{post.title}</div>
      <p className="mt-1.5 line-clamp-4 text-[12px] leading-relaxed text-white/55">{post.body}</p>
      <div className="mt-2.5 text-[10px] font-medium text-white/35">{post.replies} ответов в теме</div>
    </div>
  )
}

function ForumSite() {
  return (
    <div className="min-h-full bg-[#0A1420] pb-8">
      <SiteHeader color="#8B5CF6" icon={MessagesSquare} title="Market Forum" right={Users} />
      <div className="px-4 pt-3">
        <div className="text-[11px] text-white/40">Сообщество ресейлеров: опыт, споры, лайфхаки</div>
      </div>
      <div className="space-y-3 p-4">
        {FORUM_POSTS.map((p, i) => (
          <ForumPostCard key={i} post={p} />
        ))}
      </div>
    </div>
  )
}

// ---------- сайт: sdelka.ru (зелёный лендинг Resale) ----------
function ResaleSite({ onOpenApp }: { onOpenApp?: (app: AppKey) => void }) {
  return (
    <div className="min-h-full bg-[#0A1420] pb-8">
      <SiteHeader color="#16A34A" icon={Check} title="Resale" right={ShoppingBag} />

      {/* фото-блок */}
      <div className="mx-4 mt-4">
        <div className="relative h-48 overflow-hidden rounded-3xl border border-white/[0.06]">
          { }
          <img src="/img/p/iphone-13.jpg" alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06210f] via-[#06210f]/25 to-transparent" />
          <div className="absolute bottom-4 left-4">
            <span className="rounded-full bg-emerald-500/25 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">Маркетплейс</span>
            <div className="mt-2 text-[18px] font-bold leading-tight text-white">Б/у — как новый</div>
          </div>
        </div>
      </div>

      {/* заголовок + абзацы */}
      <div className="px-4">
        <h1 className="mt-5 text-[20px] font-bold leading-snug text-white">Купить и продать почти всё</h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-white/60">
          Resale — крупнейший сайт объявлений этой вселенной: больше сотни товаров, живой рынок и честный торг. Находите
          недооценённые лоты, сверяйтесь с индексами категорий и продавайте без лишних хлопот.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/60">
          В мобильном приложении удобнее: живая лента, чаты с продавцами, сделки в пару тапов и продвижение объявлений.
        </p>
        {/* белая пилюля-действие */}
        <button
          type="button"
          onClick={() => onOpenApp?.('avito')}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-white text-[14px] font-semibold text-[#0A1420] transition active:scale-[0.98]"
        >
          Купить
        </button>
      </div>

      {/* ряд мини-карточек */}
      <div className="mt-6">
        <div className="mb-2.5 px-4 text-[13px] font-semibold text-white/80">Популярные категории</div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {RESALE_CATS.map((c) => (
            <button key={c.label} type="button" onClick={() => onOpenApp?.('avito')} className="w-24 shrink-0 text-left transition active:scale-95">
              { }
              <img src={c.img} alt="" className="h-16 w-24 rounded-2xl border border-white/[0.06] object-cover" />
              <span className="mt-1.5 block truncate text-[11px] text-white/60">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- сайт: banki.ru (лендинг банка) ----------
function BankiSite({ onOpenApp }: { onOpenApp?: (app: AppKey) => void }) {
  return (
    <div className="min-h-full bg-[#0A1420] pb-8">
      <SiteHeader color="#21A038" icon={Landmark} title="Столичный Банк" right={CreditCard} />

      <div className="p-4">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-emerald-900 via-[#0c2417] to-[#0A1420] p-5">
          <div className="absolute -right-6 -top-8 size-36 rounded-full bg-emerald-500/15 blur-2xl" aria-hidden />
          <Landmark className="size-7 text-emerald-400" aria-hidden />
          <div className="mt-3 text-[17px] font-bold text-white">Столичный Банк</div>
          <div className="mt-0.5 text-[11px] text-white/50">banki.ru · обзор ставок</div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-white/60">
          Столичный Банк в этой игре один, зато надёжный. Кредит выдают за секунду, лимит растёт вместе с уровнем игрока.
          Накопительный вклад приносит проценты каждый час — маленькие деньги, но капают круглосуточно. Пока кредит не
          погашен, новый не выдадут.
        </p>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.05] px-3.5 py-3 text-[12px]">
            <span className="text-white/50">Кредит</span>
            <span className="font-semibold text-white">15% на 7 дней</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.05] px-3.5 py-3 text-[12px]">
            <span className="text-white/50">Вклад</span>
            <span className="font-semibold text-emerald-400">0.04% в час</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenApp?.('bank')}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-white text-[14px] font-semibold text-[#0A1420] transition active:scale-[0.98]"
        >
          Открыть банк
        </button>
        <p className="mt-2 text-center text-[10px] text-white/30">Банк откроется внутри системы</p>
      </div>
    </div>
  )
}

// ---------- сайт: help.guide (гайд) ----------
function HelpSite() {
  return (
    <div className="min-h-full bg-[#0A1420] pb-8">
      <SiteHeader color="#0EA5E9" icon={LifeBuoy} title="Help Guide" right={Bookmark} />
      <div className="px-4 pt-3">
        <div className="text-[11px] text-white/40">Всё, что нужно знать перед первой сделкой</div>
      </div>
      <div className="mt-3 space-y-3 px-4">
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
          <div key={s.t} className="rounded-2xl border border-white/[0.06] bg-white/[0.05] p-4">
            <div className="text-[14px] font-semibold text-white">{s.t}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-white/55">{s.b}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- сайт: city.ads (список объявлений) ----------
function CityAdsSite() {
  return (
    <div className="min-h-full bg-[#0A1420] pb-8">
      <SiteHeader color="#F59E0B" icon={Megaphone} title="City Ads" right={Globe} />
      <div className="px-4 pt-3">
        <div className="text-[11px] text-white/40">Объявления жителей района — обновляются каждый день</div>
      </div>
      <div className="mt-3 space-y-2.5 px-4">
        {CITY_ADS.map((ad) => (
          <div key={ad.title} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.05] p-2.5">
            { }
            <img src={ad.img} alt="" className="size-16 shrink-0 rounded-xl border border-white/[0.06] object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-white">{ad.title}</div>
              <div className="mt-0.5 truncate text-[11px] text-white/45">{ad.area}</div>
              <div className="mt-1 text-[13px] font-bold text-white">{ad.price}</div>
            </div>
            <span className="shrink-0 self-start rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">Сегодня</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- «Сайт недоступен» (Chrome-стиль, плоско) ----------
function UnavailablePage({ url, onReload }: { url: string; onReload: () => void }) {
  const host = hostOf(url)
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#060D18] px-8 pb-20 pt-12 text-center">
      <svg width="76" height="76" viewBox="0 0 48 48" fill="none" aria-hidden>
        <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.22)" strokeWidth="2.5" />
        <circle cx="17" cy="20.5" r="2.2" fill="rgba(255,255,255,0.45)" />
        <circle cx="31" cy="20.5" r="2.2" fill="rgba(255,255,255,0.45)" />
        <path d="M17 32.5c2.2-2.4 4.6-3.4 7-3.4s4.8 1 7 3.4" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div className="mt-5 text-[16px] font-semibold text-white">Сайт недоступен</div>
      <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-white/55">
        Не удалось найти IP-адрес сервера {host}. Проверьте адрес или попробуйте позже.
      </p>
      <div className="mt-3 font-mono text-[11px] tracking-wide text-white/35">ERR_NAME_NOT_RESOLVED</div>
      <button
        type="button"
        onClick={onReload}
        className="mt-6 rounded-full bg-white/[0.06] px-5 py-2.5 text-[13px] font-medium text-blue-400 transition active:scale-95"
      >
        Перезагрузить
      </button>
    </div>
  )
}

// ---------- стартовая (NTP) ----------
function SearchPill({ urlInput, setUrlInput, onSubmit }: { urlInput: string; setUrlInput: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="flex h-12 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.06] px-4 transition focus-within:border-blue-500/40">
      <Search className="size-4.5 shrink-0 text-white/45" aria-hidden />
      <input
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-white outline-none placeholder:text-white/40"
        value={urlInput}
        placeholder="Введите запрос или URL"
        aria-label="Поиск или адрес"
        onChange={(e) => setUrlInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
      />
      <Mic className="size-4.5 shrink-0 text-blue-400" aria-hidden />
    </div>
  )
}

function ShortcutTile({ label, node, onTap }: { label: string; node: ReactNode; onTap: () => void }) {
  return (
    <button type="button" onClick={onTap} className="flex min-h-[44px] flex-col items-center gap-1.5">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] transition active:scale-95">
        {node}
      </span>
      <span className="max-w-full truncate text-[10px] text-white/60">{label}</span>
    </button>
  )
}

function NewTabPage({
  urlInput,
  setUrlInput,
  onSubmit,
  onGo,
  onAddShortcut,
  onOpenMenu,
  customShortcuts,
}: {
  urlInput: string
  setUrlInput: (v: string) => void
  onSubmit: () => void
  onGo: (e: NavEntry) => void
  onAddShortcut: () => void
  onOpenMenu: () => void
  customShortcuts: { id: number; label: string; entry: NavEntry }[]
}) {
  return (
    <div className="min-h-full bg-[#0A1420] pb-8">
      {/* шапка «Браузер» */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400" aria-hidden>
            <Globe className="size-5" />
          </span>
          <span className="text-[15px] font-bold text-white">Браузер</span>
        </div>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Настройки браузера"
          className="flex size-10 items-center justify-center rounded-full transition active:scale-90 hover:bg-white/[0.06]"
        >
          <Settings2 className="size-5 text-white/60" aria-hidden />
        </button>
      </div>

      {/* hero с горным пейзажем */}
      <div className="px-4 pt-4">
        <div
          className="relative h-40 overflow-hidden rounded-3xl border border-white/[0.06]"
          style={{
            backgroundImage: "url('/img/wall/peak.png'), linear-gradient(180deg, #0c4a6e 0%, #172554 100%)",
            backgroundSize: 'cover',
            backgroundPosition: 'center 30%',
          }}
        >
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,13,24,0.2) 0%, rgba(6,13,24,0.55) 55%, rgba(6,13,24,0.9) 100%)' }} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="text-[22px] font-bold leading-tight text-white">Ищи больше, открывай мир</div>
            <div className="mt-1 text-[12px] text-white/60">Быстрый поиск по внутреннему рынку Resale</div>
          </div>
        </div>
      </div>

      {/* поисковая пилюля */}
      <div className="px-4 pt-4">
        <SearchPill urlInput={urlInput} setUrlInput={setUrlInput} onSubmit={onSubmit} />
      </div>

      {/* шорткаты 4×N */}
      <div className="px-4 pt-6">
        <div className="grid grid-cols-4 gap-y-4">
          {SHORTCUTS.map((s) => (
            <ShortcutTile key={s.label} label={s.label} node={s.node} onTap={() => onGo({ type: 'web', url: s.url })} />
          ))}
          {customShortcuts.map((c) => (
            <ShortcutTile key={c.id} label={c.label} node={<Favicon seed={c.label} size={24} />} onTap={() => onGo(c.entry)} />
          ))}
          <ShortcutTile
            label="Добавить"
            node={<Plus className="size-5 text-white/60" aria-hidden />}
            onTap={onAddShortcut}
          />
        </div>
      </div>

      {/* избранное — внутренние сайты */}
      <div className="px-4 pt-6">
        <div className="mb-2.5 text-[13px] font-semibold text-white/80">Избранное</div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {FAVORITES.map((f) => (
            <button key={f.site} type="button" onClick={() => onGo({ type: 'site', site: f.site })} className="w-[132px] shrink-0 text-left transition active:scale-[0.97]">
              <span className={`relative flex h-20 items-end overflow-hidden rounded-2xl bg-gradient-to-br ${f.grad} p-2.5`}>
                <f.icon className="absolute right-2 top-2 size-6 text-white/30" aria-hidden />
                <span className="text-[12px] font-semibold text-white">{f.label}</span>
              </span>
              <span className="mt-1.5 block truncate text-[11px] font-medium text-white">{SITE_TITLES[f.site]}</span>
              <span className="block truncate text-[10px] text-white/40">{f.site}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// стартовая приватной вкладки
function PrivateNtp({ urlInput, setUrlInput, onSubmit }: { urlInput: string; setUrlInput: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center bg-[#0A1420] px-6 pb-10 pt-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-violet-500/10 ring-2 ring-violet-500/40" aria-hidden>
        <VenetianMask className="size-7 text-violet-300" />
      </span>
      <div className="mt-4 text-[16px] font-bold text-white">Вы перешли в приватный режим</div>
      <p className="mt-1.5 max-w-[270px] text-[12px] leading-relaxed text-white/55">
        Вкладка не сохраняется в истории, а данные посещений удаляются после её закрытия.
      </p>
      <div className="mt-6 w-full">
        <SearchPill urlInput={urlInput} setUrlInput={setUrlInput} onSubmit={onSubmit} />
      </div>
    </div>
  )
}

// ---------- результаты поиска (внутренний каталог) ----------
const SEARCH_CHIPS = ['Все', 'Картинки', 'Покупки', 'Видео', 'Новости']

function searchCatalog(query: string): SiteDef[] {
  const tokens = query
    .toLowerCase()
    .split(/[^0-9a-zа-яё-]+/i)
    .filter(Boolean)
  if (tokens.length === 0) return []
  return SITES.map((s) => {
    const hay = (s.site + ' ' + s.title + ' ' + s.desc + ' ' + s.snippet + ' ' + s.keywords.join(' ')).toLowerCase()
    return { s, score: tokens.filter((t) => hay.includes(t)).length }
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.s)
}

function SearchResultThumb({ s }: { s: SiteDef }) {
  if (s.thumb) {
    return (
      <span className="relative block size-16 shrink-0 overflow-hidden rounded-xl border border-white/[0.06]">
        { }
        <img src={s.thumb} alt="" className="absolute inset-0 size-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className="flex size-16 shrink-0 items-center justify-center rounded-xl"
      style={{ background: `linear-gradient(135deg, ${s.color}45, ${s.color}14)` }}
      aria-hidden
    >
      {s.icon && <s.icon className="size-6" style={{ color: s.color }} />}
    </span>
  )
}

function SearchScreen({ query, onGo }: { query: string; onGo: (e: NavEntry) => void }) {
  const [chip, setChip] = useState('Все')
  const matched = searchCatalog(query)
  const results = chip === 'Новости' ? matched.filter((s) => s.site === 'news.market') : chip === 'Покупки' ? matched.filter((s) => s.site === 'sdelka.ru' || s.site === 'city.ads') : matched

  return (
    <div className="min-h-full bg-[#0A1420] pb-8">
      {/* чипы-фильтры */}
      <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-[#0A1420]/95 px-4 py-2.5 [scrollbar-width:none] backdrop-blur">
        {SEARCH_CHIPS.map((c) => {
          const activeChip = c === chip
          return (
            <button
              key={c}
              type="button"
              onClick={() => setChip(c)}
              aria-pressed={activeChip}
              className={
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium transition active:scale-95 ' +
                (activeChip ? 'bg-blue-500 text-white' : 'bg-white/[0.06] text-white/60')
              }
            >
              {activeChip && <Check className="size-3.5" aria-hidden />}
              {c}
            </button>
          )
        })}
      </div>

      <div className="px-4">
        <div className="pb-1 pt-1 text-[11px] text-white/35">Результатов: {results.length}</div>
        {results.length === 0 ? (
          <div className="flex flex-col items-center pt-14 text-center">
            <Search className="size-10 text-white/20" aria-hidden />
            <div className="mt-3 text-[14px] font-semibold text-white">Ничего не найдено</div>
            <p className="mt-1 max-w-[250px] text-[12px] text-white/50">
              Попробуйте другой запрос — например, «новости», «банк» или «объявления»
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {results.map((s) => (
              <li key={s.site}>
                <button
                  type="button"
                  onClick={() => onGo({ type: 'site', site: s.site })}
                  className="flex min-h-[44px] w-full items-start gap-3 py-3 text-left transition active:opacity-80"
                >
                  <Favicon seed={s.site} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-white/50">{s.site}</span>
                    <span className="mt-0.5 block truncate text-[15px] font-medium text-blue-400">
                      {s.title} — {s.desc}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-white/60">{s.snippet}</span>
                  </span>
                  <SearchResultThumb s={s} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------- закладки ----------
function BookmarksPanel({
  bookmarks,
  onPick,
  onRemove,
  onBack,
  onAdd,
}: {
  bookmarks: { key: string; entry: NavEntry }[]
  onPick: (e: NavEntry) => void
  onRemove: (key: string) => void
  onBack: () => void
  onAdd: () => void
}) {
  const [chip, setChip] = useState('Все')
  const chips = ['Все', 'Папки', 'Панель', 'Недавние']
  return (
    <div className="flex h-full flex-col bg-[#0A1420]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-3">
        <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-full transition hover:bg-white/[0.06]" aria-label="Назад в браузер">
          <ChevronLeft className="size-5 text-white/70" aria-hidden />
        </button>
        <div className="flex-1 text-[15px] font-bold text-white">Закладки</div>
        <Bookmark className="size-4.5 text-white/35" aria-hidden />
      </div>

      <div className="flex gap-2 px-4 py-2.5">
        {chips.map((c) => {
          const activeChip = c === chip
          return (
            <button
              key={c}
              type="button"
              onClick={() => setChip(c)}
              aria-pressed={activeChip}
              className={
                'flex h-8 items-center rounded-full px-3.5 text-[12px] font-medium transition active:scale-95 ' +
                (activeChip ? 'bg-blue-500/20 text-blue-300' : 'bg-white/[0.06] text-white/55')
              }
            >
              {c}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-14 text-center">
            <Bookmark className="size-10 text-white/20" aria-hidden />
            <div className="mt-3 text-[14px] font-medium text-white">Закладок нет</div>
            <p className="mt-1 text-[12px] text-white/45">Нажмите «плюс», чтобы добавить страницу вручную</p>
            <button
              type="button"
              onClick={onAdd}
              className="mt-5 rounded-full bg-white/[0.06] px-5 py-2.5 text-[13px] font-medium text-blue-400 transition active:scale-95"
            >
              Добавить закладку
            </button>
          </div>
        ) : (
          <ul>
            {bookmarks.map(({ key, entry }) => (
              <li key={key} className="flex items-center pr-2">
                <button type="button" onClick={() => onPick(entry)} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.04]">
                  <Favicon seed={entrySub(entry)} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-white">{entryTitle(entry)}</span>
                    <span className="block truncate text-[11px] text-white/40">{entrySub(entry)}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-white/25" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Удалить из закладок: ${entryTitle(entry)}`}
                  onClick={() => onRemove(key)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/[0.06] active:scale-90"
                >
                  <Trash2 className="size-4 text-white/35" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* FAB «добавить» */}
      <button
        type="button"
        onClick={onAdd}
        aria-label="Добавить закладку"
        className="absolute bottom-4 right-4 flex size-12 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl shadow-blue-500/25 transition active:scale-90"
      >
        <Plus className="size-6" aria-hidden />
      </button>
    </div>
  )
}

// ---------- история ----------
function HistoryPanel({
  entries,
  onPick,
  onBack,
}: {
  entries: { entry: NavEntry; at: number }[]
  onPick: (e: NavEntry) => void
  onBack: () => void
}) {
  return (
    <div className="flex h-full flex-col bg-[#0A1420]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-3">
        <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-full transition hover:bg-white/[0.06]" aria-label="Назад в браузер">
          <ChevronLeft className="size-5 text-white/70" aria-hidden />
        </button>
        <div className="flex-1 text-[15px] font-bold text-white">История</div>
        <History className="size-4.5 text-white/35" aria-hidden />
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-14 text-center">
            <History className="size-10 text-white/20" aria-hidden />
            <div className="mt-3 text-[14px] font-medium text-white">История пуста</div>
            <p className="mt-1 text-[12px] text-white/45">Открытые сайты появятся здесь</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {entries.map(({ entry, at }, i) => (
              <li key={i}>
                <button type="button" onClick={() => onPick(entry)} className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.04]">
                  <Favicon seed={entrySub(entry)} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-white">{entryTitle(entry)}</span>
                    <span className="block truncate text-[11px] text-white/40">{entrySub(entry)}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-white/35">{fmtTime(new Date(at))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------- обзор вкладок ----------
function TabCard({ tab, active, onPick, onClose }: { tab: Tab; active: boolean; onPick: () => void; onClose: () => void }) {
  const cur = tab.stack[tab.idx] ?? ({ type: 'site', site: 'start' } as NavEntry)
  const isNtp = cur.type === 'site' && cur.site === 'start'
  const brand = cur.type === 'site' ? SITE_MAP[cur.site] : undefined
  const grad = tab.incognito
    ? 'linear-gradient(135deg, #2b1d4d 0%, #150e2e 100%)'
    : brand
      ? `linear-gradient(135deg, ${brand.color}55 0%, ${brand.color}12 100%)`
      : 'linear-gradient(135deg, #16233f 0%, #0e1830 100%)'
  const title = tab.incognito && isNtp ? 'Приватная вкладка' : entryTitle(cur)
  const sub = tab.incognito && isNtp ? 'Приватный режим' : entrySub(cur)

  return (
    <div className="tab-card-in">
      <div className={'overflow-hidden rounded-2xl bg-[#0e1930] ring-1 transition ' + (active ? 'ring-blue-500' : 'ring-white/10')}>
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          {tab.incognito ? (
            <VenetianMask className="size-3.5 shrink-0 text-violet-300" aria-hidden />
          ) : isNtp ? (
            <Globe className="size-3.5 shrink-0 text-blue-400" aria-hidden />
          ) : (
            <Favicon seed={entrySub(cur)} size={14} />
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white">{title}</span>
          <button
            type="button"
            aria-label={`Закрыть вкладку ${title}`}
            onClick={onClose}
            className="flex size-5 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10 active:scale-90"
          >
            <X className="size-3 text-white/60" aria-hidden />
          </button>
        </div>
        <button type="button" onClick={onPick} className="relative block h-32 w-full text-left" aria-label={`Открыть вкладку ${title}`}>
          <span className="absolute inset-0" style={{ background: grad }} aria-hidden />
          {isNtp ? (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2" aria-hidden>
              {tab.incognito ? (
                <VenetianMask className="size-6 text-violet-300/70" />
              ) : (
                <>
                  <span className="h-6 w-4/5 rounded-full bg-white/10" />
                  <span className="flex gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="size-4 rounded-lg bg-white/10" />
                    ))}
                  </span>
                </>
              )}
            </span>
          ) : (
            <span className="absolute inset-0 flex flex-col p-2.5" aria-hidden>
              <span className="flex items-center gap-1.5">
                <Favicon seed={entrySub(cur)} size={14} />
                <span className="truncate text-[9px] font-semibold text-white/85">{title}</span>
              </span>
              <span className="mt-2 h-1.5 w-[88%] rounded-full bg-white/15" />
              <span className="mt-1.5 h-1.5 w-[72%] rounded-full bg-white/15" />
              <span className="mt-1.5 h-1.5 w-[80%] rounded-full bg-white/10" />
              <span className="mt-auto h-9 rounded-lg bg-white/10" />
            </span>
          )}
        </button>
      </div>
      <div className="px-1 pt-1.5">
        <div className="truncate text-[11px] font-medium text-white">{title}</div>
        <div className="truncate text-[10px] text-white/40">{sub}</div>
      </div>
    </div>
  )
}

function TabSwitcher({
  tabs,
  activeId,
  onPick,
  onClose,
  onNew,
  onCloseAll,
}: {
  tabs: Tab[]
  activeId: number
  onPick: (id: number) => void
  onClose: (id: number) => void
  onNew: () => void
  onCloseAll: () => void
}) {
  return (
    <div className="flex h-full flex-col bg-[#060D18]">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="text-[13px] font-semibold text-white/55">
          {tabs.length} {tabs.length === 1 ? 'вкладка' : tabs.length < 5 ? 'вкладки' : 'вкладок'}
        </div>
        <button type="button" onClick={onCloseAll} className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/70 transition active:scale-95">
          Закрыть все
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        <div className="grid grid-cols-2 gap-3">
          {tabs.map((t) => (
            <TabCard key={t.id} tab={t} active={t.id === activeId} onPick={() => onPick(t.id)} onClose={() => onClose(t.id)} />
          ))}
          <button
            type="button"
            onClick={onNew}
            aria-label="Новая вкладка"
            className="flex min-h-[192px] items-center justify-center rounded-2xl border border-dashed border-white/15 transition active:scale-[0.98]"
          >
            <span className="flex flex-col items-center gap-2">
              <Plus className="size-6 text-blue-400" aria-hidden />
              <span className="text-[12px] text-white/55">Новая вкладка</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- приватный режим (экран из меню) ----------
function PrivateScreen({ onOpenPrivate, onBack }: { onOpenPrivate: () => void; onBack: () => void }) {
  const features: { icon: LucideIcon; t: string; d: string }[] = [
    { icon: Lock, t: 'Конфиденциальность', d: 'Вкладка не появится в истории и не сохранится после закрытия' },
    { icon: EyeOff, t: 'Без отслеживания', d: 'Сайты не видят ваш профиль и прошлые посещения' },
    { icon: DatabaseBackup, t: 'Данные удаляются', d: 'Cookie и кэш стираются, когда закрыта последняя приватная вкладка' },
  ]
  return (
    <div className="h-full overflow-y-auto bg-[#060D18] px-6 pb-8 [scrollbar-width:thin]">
      <div className="flex items-center gap-2 py-3">
        <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-full transition hover:bg-white/[0.06]" aria-label="Назад в браузер">
          <ChevronLeft className="size-5 text-white/70" aria-hidden />
        </button>
        <div className="text-[13px] font-semibold text-white/55">Настройки просмотра</div>
      </div>

      <div className="flex flex-col items-center pt-6 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-blue-500/10 ring-2 ring-blue-500/40" aria-hidden>
          <VenetianMask className="size-9 text-blue-400" />
        </span>
        <div className="mt-5 text-[18px] font-bold text-white">Приватный режим</div>
        <p className="mt-1.5 max-w-[280px] text-[12.5px] leading-relaxed text-white/55">
          Просмотр без следов: устройство не запоминает, какие сайты вы открывали
        </p>
      </div>

      <div className="mt-7 space-y-3">
        {features.map((f) => (
          <div key={f.t} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400" aria-hidden>
              <f.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-white">{f.t}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-white/50">{f.d}</span>
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onOpenPrivate}
        className="mt-8 flex h-12 w-full items-center justify-center rounded-full bg-blue-500 text-[14px] font-semibold text-white shadow-xl shadow-blue-500/25 transition active:scale-[0.98]"
      >
        Открыть приватную вкладку
      </button>
    </div>
  )
}

// ---------- мини-шторка «добавить ярлык/закладку» ----------
function AddSheet({
  title,
  cta,
  initialLabel,
  initialUrl,
  onClose,
  onSubmit,
}: {
  title: string
  cta: string
  initialLabel: string
  initialUrl: string
  onClose: () => void
  onSubmit: (label: string, url: string) => void
}) {
  const [label, setLabel] = useState(initialLabel)
  const [url, setUrl] = useState(initialUrl)
  const [err, setErr] = useState<string | null>(null)

  const submit = () => {
    if (!url.trim()) {
      setErr('Введите адрес сайта')
      return
    }
    onSubmit(label.trim(), url.trim())
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#12203A] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-bold text-white">{title}</div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="flex size-8 items-center justify-center rounded-full transition hover:bg-white/[0.06] active:scale-90">
            <X className="size-4 text-white/60" aria-hidden />
          </button>
        </div>

        <input
          className="mt-4 h-11 w-full rounded-full border border-white/10 bg-white/[0.06] px-4 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-blue-500/50"
          value={label}
          placeholder="Название (необязательно)"
          aria-label="Название"
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="mt-2.5 h-11 w-full rounded-full border border-white/10 bg-white/[0.06] px-4 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-blue-500/50"
          value={url}
          placeholder="Адрес, например news.market"
          aria-label="Адрес"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        {err && <div className="mt-2 px-1 text-[12px] text-red-300">{err}</div>}

        <button
          type="button"
          onClick={submit}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-blue-500 text-[13.5px] font-semibold text-white transition active:scale-[0.98]"
        >
          {cta}
        </button>
      </div>
    </div>
  )
}

// ----------
export default function BrowserApp({ onOpenApp }: { onOpenApp?: (app: AppKey) => void }) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, stack: [{ type: 'site', site: 'start' }], idx: 0 }])
  const [activeId, setActiveId] = useState(1)
  const [urlInput, setUrlInput] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [omniFocused, setOmniFocused] = useState(false)
  const [view, setView] = useState<'page' | 'tabs' | 'history' | 'bookmarks' | 'private'>('page')
  const [menuOpen, setMenuOpen] = useState(false)
  const [addSheet, setAddSheet] = useState<null | 'shortcut' | 'bookmark'>(null)
  // журнал посещений с таймстампами (приватные вкладки не пишутся)
  const [historyLog, setHistoryLog] = useState<{ entry: NavEntry; at: number }[]>([])
  // закладки — localStorage
  const [bookmarks, setBookmarks] = useState<{ key: string; entry: NavEntry }[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('resale_browser_bookmarks_v1')
      return raw ? (JSON.parse(raw) as { key: string; entry: NavEntry }[]) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('resale_browser_bookmarks_v1', JSON.stringify(bookmarks))
    } catch {
      /* приватный режим */
    }
  }, [bookmarks])
  // пользовательские ярлыки стартовой
  const [customShortcuts, setCustomShortcuts] = useState<{ id: number; label: string; entry: NavEntry }[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('resale_browser_shortcuts_v1')
      return raw ? (JSON.parse(raw) as { id: number; label: string; entry: NavEntry }[]) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('resale_browser_shortcuts_v1', JSON.stringify(customShortcuts))
    } catch {
      /* ignore */
    }
  }, [customShortcuts])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const current = active.stack[active.idx] ?? { type: 'site', site: 'start' }
  const currentKey = entryKey(current)
  const isNtp = current.type === 'site' && current.site === 'start'
  const incognito = !!active.incognito
  const canBack = active.idx > 0
  const canForward = active.idx < active.stack.length - 1

  // короткая имитация загрузки: тонкий синий прогресс под тулбаром
  const busyTimer = useRef<number | null>(null)
  const flashBusy = () => {
    if (busyTimer.current) window.clearTimeout(busyTimer.current)
    setBusy(true)
    busyTimer.current = window.setTimeout(() => setBusy(false), 480)
  }
  useEffect(() => {
    return () => {
      if (busyTimer.current) window.clearTimeout(busyTimer.current)
    }
  }, [])

  // синхронизация строки адреса с навигацией: «adjust state when props change»
  const [lastKey, setLastKey] = useState(currentKey)
  if (currentKey !== lastKey) {
    setLastKey(currentKey)
    setUrlInput(urlOf(current))
  }

  const historyEntries = [...historyLog].reverse()

  const go = (entry: NavEntry) => {
    setView('page')
    setMenuOpen(false)
    if (!(entry.type === 'site' && entry.site === 'start') && !incognito) {
      setHistoryLog((h) => [...h.slice(-59), { entry, at: Date.now() }])
    }
    if (entryKey(entry) === currentKey) {
      setReloadKey((k) => k + 1)
      flashBusy()
      return
    }
    flashBusy()
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
    const e = resolveAddress(urlInput)
    if (e) go(e)
  }

  const back = () => setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, idx: Math.max(0, t.idx - 1) } : t)))
  const forward = () => setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, idx: Math.min(t.stack.length - 1, t.idx + 1) } : t)))
  const home = () => go({ type: 'site', site: 'start' })
  const reload = () => {
    flashBusy()
    setReloadKey((k) => k + 1)
  }

  const newTab = (inc = false) => {
    const t: Tab = { id: tabSeq++, stack: [{ type: 'site', site: 'start' }], idx: 0, incognito: inc || undefined }
    setTabs((ts) => [...ts, t])
    setActiveId(t.id)
    setView('page')
    setMenuOpen(false)
  }

  const closeTab = (id: number) => {
    setTabs((ts) => {
      const remaining = ts.filter((t) => t.id !== id)
      if (remaining.length === 0) {
        const fresh: Tab = { id: tabSeq++, stack: [{ type: 'site', site: 'start' }], idx: 0 }
        setActiveId(fresh.id)
        return [fresh]
      }
      if (id === activeId) {
        const idx = ts.findIndex((t) => t.id === id)
        const neighbor = remaining[Math.min(idx, remaining.length - 1)]
        setActiveId(neighbor.id)
      }
      return remaining
    })
  }

  const closeAllTabs = () => {
    const fresh: Tab = { id: tabSeq++, stack: [{ type: 'site', site: 'start' }], idx: 0 }
    setTabs([fresh])
    setActiveId(fresh.id)
    setMenuOpen(false)
  }

  const pickTab = (id: number) => {
    setActiveId(id)
    setView('page')
    setMenuOpen(false)
  }

  // содержимое активной вкладки
  const contentKey = `${activeId}:${currentKey}:${reloadKey}`

  // добавление ярлыка/закладки из шторки
  const submitSheet = (label: string, url: string) => {
    const entry = resolveAddress(url)
    if (!entry) return
    if (addSheet === 'shortcut') {
      const finalLabel = label || (entry.type === 'site' ? entryTitle(entry) : hostOf(url))
      setCustomShortcuts((prev) => [...prev, { id: Date.now(), label: finalLabel, entry }].slice(-4))
    } else if (addSheet === 'bookmark') {
      const key = entryKey(entry)
      setBookmarks((prev) => (prev.some((b) => b.key === key) ? prev : [...prev, { key, entry }].slice(-30)))
    }
    setAddSheet(null)
  }

  // ─── pull-to-refresh: тянем страницу вниз от верха
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

  // ─── свайп по тулбару переключает вкладки
  const omniSwipe = useSwipe({
    threshold: 56,
    onSwipe: (dir) => {
      if (view !== 'page' || tabs.length < 2) return
      const i = tabs.findIndex((t) => t.id === activeId)
      const next = dir === 'left' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length
      pickTab(tabs[next].id)
    },
  })

  const clearable = urlInput.length > 0 && (omniFocused || current.type === 'search')

  return (
    <div className={'relative flex h-full flex-col overflow-hidden ' + (incognito ? 'bg-[#090D1A] text-white' : 'bg-[#0A1420] text-white')}>
      {/* ---------- верхний тулбар ---------- */}
      <div
        className={'relative z-20 border-b border-white/[0.06] ' + (incognito ? 'bg-[#080C16]' : 'bg-[#0A1420]')}
        onPointerDown={omniSwipe.onPointerDown}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          {/* омнибокс-пилюля */}
          <div
            className={
              'relative flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full pl-3 pr-1 transition ' +
              (omniFocused ? 'bg-[#243044] ring-1 ring-blue-500/60' : 'bg-[#1A2332]')
            }
          >
            {incognito ? (
              <VenetianMask className="size-4 shrink-0 text-violet-300" aria-label="Приватный режим" />
            ) : isNtp || current.type === 'search' ? (
              <Search className="size-4 shrink-0 text-white/45" aria-hidden />
            ) : (
              <Favicon seed={entrySub(current)} size={18} />
            )}
            <input
              className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
              value={urlInput}
              placeholder="Запрос или адрес"
              aria-label="Поиск или ввод адреса"
              onFocus={() => setOmniFocused(true)}
              onBlur={() => setOmniFocused(false)}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitUrl()
              }}
            />
            {/* очистить */}
            {clearable && (
              <button
                type="button"
                aria-label="Очистить строку"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setUrlInput('')}
                className="flex size-7 shrink-0 items-center justify-center rounded-full transition active:scale-90"
              >
                <X className="size-3.5 text-white/50" aria-hidden />
              </button>
            )}
            <button
              type="button"
              aria-label="Перезагрузить страницу"
              onClick={reload}
              className="flex size-8 shrink-0 items-center justify-center rounded-full transition active:scale-90"
            >
              <RotateCw className="size-4 text-white/55" aria-hidden />
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
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full transition active:scale-90 hover:bg-white/[0.06]"
          >
            <Square className="size-5 text-white/70" strokeWidth={2} aria-hidden />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">{tabs.length}</span>
          </button>

          {/* меню трёх точек */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Меню"
              aria-expanded={menuOpen}
              className="flex size-10 items-center justify-center rounded-full transition active:scale-90 hover:bg-white/[0.06]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white/70" aria-hidden>
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />
                <div className="chrome-menu-in absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-2xl border border-white/10 bg-[#12203A] py-1.5 shadow-2xl">
                  {[
                    { icon: Plus, label: 'Новая вкладка', fn: () => newTab(false) },
                    { icon: Bookmark, label: 'Закладки', fn: () => { setView('bookmarks'); setMenuOpen(false) } },
                    { icon: History, label: 'История', fn: () => { setView('history'); setMenuOpen(false) } },
                    { icon: VenetianMask, label: 'Приватный режим', fn: () => { setView('private'); setMenuOpen(false) } },
                    { icon: X, label: 'Закрыть все вкладки', fn: closeAllTabs },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.fn}
                      className="flex min-h-[44px] w-full items-center gap-3.5 px-4 text-left text-[13px] text-white/85 transition hover:bg-white/[0.06]"
                    >
                      <item.icon className="size-4.5 text-white/55" aria-hidden />
                      {item.label}
                    </button>
                  ))}
                  <div className="mt-1 border-t border-white/[0.06] px-4 pb-1.5 pt-2 text-[10px] text-white/35">Resale Browser 130.0</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* прогресс-бар загрузки */}
        <div className="absolute bottom-[-1px] left-0 right-0 h-[3px] overflow-hidden">
          {busy && (
            <div className="h-full w-1/3">
              <div className="chrome-load h-full w-full rounded-full bg-blue-500" />
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
              className="flex size-9 items-center justify-center rounded-full bg-[#12203A] shadow-md ring-1 ring-white/10"
              style={{ transform: `rotate(${Math.min(1, pull / 64) * 300}deg)`, opacity: 0.35 + Math.min(1, pull / 64) * 0.65 }}
            >
              <RotateCw className="size-4 text-white/70" />
            </span>
          </div>
        )}
        {view === 'tabs' ? (
          <TabSwitcher tabs={tabs} activeId={activeId} onPick={pickTab} onClose={closeTab} onNew={() => newTab(false)} onCloseAll={closeAllTabs} />
        ) : view === 'history' ? (
          <HistoryPanel entries={historyEntries} onPick={(e) => { go(e); setMenuOpen(false) }} onBack={() => setView('page')} />
        ) : view === 'bookmarks' ? (
          <BookmarksPanel
            bookmarks={bookmarks}
            onPick={(e) => { go(e); setView('page') }}
            onRemove={(k) => setBookmarks((prev) => prev.filter((b) => b.key !== k))}
            onBack={() => setView('page')}
            onAdd={() => {
              setAddSheet('bookmark')
              setMenuOpen(false)
            }}
          />
        ) : view === 'private' ? (
          <PrivateScreen onOpenPrivate={() => newTab(true)} onBack={() => setView('page')} />
        ) : (
          <div ref={scrollRef} className="h-full overflow-y-auto [scrollbar-width:thin]" onPointerDown={ptr.onPointerDown}>
            {current.type === 'site' && isNtp && !incognito && (
              <NewTabPage
                urlInput={urlInput}
                setUrlInput={setUrlInput}
                onSubmit={submitUrl}
                onGo={go}
                onAddShortcut={() => setAddSheet('shortcut')}
                onOpenMenu={() => setMenuOpen(true)}
                customShortcuts={customShortcuts}
              />
            )}

            {current.type === 'site' && isNtp && incognito && <PrivateNtp urlInput={urlInput} setUrlInput={setUrlInput} onSubmit={submitUrl} />}

            {current.type === 'search' && <SearchScreen key={`search:${contentKey}`} query={current.query} onGo={go} />}

            {current.type === 'web' && <UnavailablePage url={current.url} onReload={reload} />}

            {current.type === 'site' && current.site === 'sdelka.ru' && <ResaleSite key={`sd:${reloadKey}`} onOpenApp={onOpenApp} />}
            {current.type === 'site' && current.site === 'news.market' && <NewsSite key={`news:${reloadKey}`} onBusy={setBusy} />}
            {current.type === 'site' && current.site === 'forum.market' && <ForumSite key={`forum:${reloadKey}`} />}
            {current.type === 'site' && current.site === 'banki.ru' && <BankiSite key={`bk:${reloadKey}`} onOpenApp={onOpenApp} />}
            {current.type === 'site' && current.site === 'help.guide' && <HelpSite key={`hg:${reloadKey}`} />}
            {current.type === 'site' && current.site === 'city.ads' && <CityAdsSite key={`city:${reloadKey}`} />}
          </div>
        )}
      </div>

      {/* ---------- нижний тулбар ---------- */}
      {view !== 'tabs' && (
        <div className={'z-20 flex items-center justify-around border-t border-white/[0.06] px-2 py-1.5 ' + (incognito ? 'bg-[#080C16]' : 'bg-[#0A1420]')}>
          <button
            type="button"
            onClick={back}
            disabled={!canBack}
            aria-label="Назад"
            className="flex size-10 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-25"
          >
            <ChevronLeft className={'size-5.5 ' + (canBack ? 'text-white/75' : 'text-white/30')} aria-hidden />
          </button>
          <button
            type="button"
            onClick={forward}
            disabled={!canForward}
            aria-label="Вперёд"
            className="flex size-10 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-25"
          >
            <ChevronRight className={'size-5.5 ' + (canForward ? 'text-white/75' : 'text-white/30')} aria-hidden />
          </button>
          <button
            type="button"
            onClick={home}
            aria-label="Домашняя страница"
            className="flex size-10 items-center justify-center rounded-full transition active:scale-90 hover:bg-white/[0.06]"
          >
            <Globe className="size-5 text-white/75" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setView('tabs')}
            aria-label="Обзор вкладок"
            className="relative flex size-10 items-center justify-center rounded-full transition active:scale-90 hover:bg-white/[0.06]"
          >
            <Square className="size-5 text-white/75" aria-hidden />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">{tabs.length}</span>
          </button>
          <button
            type="button"
            onClick={() => newTab(false)}
            aria-label="Новая вкладка"
            className="flex size-10 items-center justify-center rounded-full transition active:scale-90 hover:bg-white/[0.06]"
          >
            <Plus className="size-5.5 text-white/75" aria-hidden />
          </button>
        </div>
      )}

      {/* шторка добавления ярлыка/закладки */}
      {addSheet && (
        <AddSheet
          title={addSheet === 'shortcut' ? 'Новый ярлык' : 'Новая закладка'}
          cta={addSheet === 'shortcut' ? 'Добавить ярлык' : 'Сохранить закладку'}
          initialLabel={addSheet === 'bookmark' && !isNtp ? entryTitle(current) : ''}
          initialUrl={addSheet === 'bookmark' && !isNtp ? urlOf(current) : ''}
          onClose={() => setAddSheet(null)}
          onSubmit={submitSheet}
        />
      )}
    </div>
  )
}
