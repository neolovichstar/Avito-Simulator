'use client'

// Браузер «Resale» — внутренний (walled-garden) браузер в стиле Chrome на Android 16.
// Аутентичная компоновка: омнибокс-пилюля СВЕРХУ (+ счётчик вкладок справа),
// нижний тулбар с ← → ⌂ ⋮, меню открывается ВВЕРХ от кнопки.
// Тема хрома следует за useOS.theme (light: белые панели, dark: #202124/#292A2D/#3C4043),
// приватные вкладки всегда тёмные. Прогресс загрузки — зелёная полоса #21A038.
// Сайты-моки — «веб-страницы» со своим светлым дизайном (как в настоящем Chrome).
// Логика сохранена 1:1: стек вкладок, внутренние сайты, поиск, история, закладки,
// приватный режим, свайпы (переключение вкладок по тулбару, pull-to-refresh), onOpenApp.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Bookmark, Check, ChevronLeft, ChevronRight, Clapperboard, CloudSun, CreditCard as CreditCardIcon, DatabaseBackup, Download,
  EyeOff, FileText, Gamepad2, Globe, Handshake as HandshakeIcon, History, Image as ImageIcon, Landmark, LifeBuoy, Lock,
  Megaphone, Menu, MessagesSquare, Mic, Moon, Music, Newspaper, Package, Plus, RotateCw, Search,
  Settings2, ShoppingBag, Square, Star, Timer, Trash2, TrendingDown, TrendingUp, Trophy, Users,
  VenetianMask, X, Zap, ArrowUpRight, CornerDownLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS, type AppKey } from '@/lib/store'
import { fmtTime, timeAgo } from '@/lib/format'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { useDrag, useSwipe } from '@/lib/use-swipe'
import { fuzzyScore, fuzzyMatch, bestScore, Highlight } from '@/lib/smart-search'
import type { MarketStats } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// навигация
// ─────────────────────────────────────────────────────────────────────────────
type NavEntry =
  | { type: 'site'; site: string }
  | { type: 'web'; url: string }
  | { type: 'search'; query: string }

interface Tab {
  id: number
  stack: NavEntry[]
  idx: number
  incognito?: boolean
}

let tabSeq = 2

// ─────────────────────────────────────────────────────────────────────────────
// каталог внутренних сайтов
// ─────────────────────────────────────────────────────────────────────────────
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
    color: '#21A038',
    keywords: ['avito', 'resale', 'ресейл', 'объявления', 'купить', 'продать', 'маркет', 'товары', 'сделка', 'покупки', 'лоты'],
    thumb: '/img/p/iphone-13.jpg',
  },
  {
    site: 'news.market',
    title: 'Market News',
    desc: 'Новости рынка в реальном времени',
    snippet: 'Спрос, тренды и события рынка: индексы категорий обновляются живьём, свежие новости приходят первыми.',
    color: '#E8702A',
    icon: TrendingUp,
    keywords: ['news', 'новости', 'рынок', 'индексы', 'спрос', 'тренды', 'события', 'кризис', 'лента'],
  },
  {
    site: 'forum.market',
    title: 'Market Forum',
    desc: 'Сообщество ресейлеров',
    snippet: 'Темы о торге с ботами, налогах, кредитах и продвижении объявлений. Опыт, споры и лайфхаки от топовых продавцов.',
    color: '#0A8A76',
    icon: MessagesSquare,
    keywords: ['forum', 'форум', 'темы', 'сообщество', 'технологии', 'общение', 'лайфхаки', 'опыт', 'вопросы'],
  },
  {
    site: 'banki.ru',
    title: 'Столичный Банк',
    desc: 'Кредиты и вклады',
    snippet: 'Кредит 15% на 7 дней, накопительный вклад с начислением каждый час. Лимит растёт вместе с уровнем игрока.',
    color: '#157F2A',
    icon: Landmark,
    keywords: ['banki', 'банк', 'кредит', 'вклад', 'ставка', 'деньги', 'финансы', 'проценты', 'займ'],
  },
  {
    site: 'help.guide',
    title: 'Help Guide',
    desc: 'Гайд новичку',
    snippet: 'Пошаговая инструкция: покупки, продажи, чат и торг, налоги, кредит с вкладом и продвижение объявлений.',
    color: '#E8A020',
    icon: LifeBuoy,
    keywords: ['help', 'помощь', 'гайд', 'инструкция', 'обучение', 'старт', 'новичок', 'путешествия', 'первый раз'],
  },
  {
    site: 'city.ads',
    title: 'City Ads',
    desc: 'Городские объявления',
    snippet: 'Объявления жителей района: мебель, техника, хобби и спорт. Всё по-соседски и без посредников.',
    color: '#D64570',
    keywords: ['city', 'город', 'объявления', 'район', 'соседи', 'местные', 'ads', 'барахолка', 'покупки'],
    thumb: '/img/p/nike-af1.jpg',
  },
  {
    site: 'sport.market',
    title: 'Спорт-Обзор',
    desc: 'Матчи и новости спорта',
    snippet: 'Счёты городских лиг в реальном времени: футбол, баскетбол, хоккей и теннис. Репортажи с площадок района.',
    color: '#7A9A01',
    icon: Trophy,
    keywords: ['sport', 'спорт', 'футбол', 'матч', 'хоккей', 'баскетбол', 'теннис', 'лига', 'счет', 'счёт', 'марафон'],
  },
  {
    site: 'kino.afisha',
    title: 'Афиша',
    desc: 'Что посмотреть сегодня',
    snippet: 'Премьеры недели, рейтинги и сеансы рядом. Драмы, триллеры и документалистика о мире перепродажи.',
    color: '#B3261E',
    icon: Clapperboard,
    keywords: ['kino', 'кино', 'фильм', 'афиша', 'премьера', 'сеанс', 'сериалы', 'смотреть', 'рейтинг'],
  },
  {
    site: 'arcade.games',
    title: 'Arcade',
    desc: 'Мини-игры Resale',
    snippet: 'Казуальные мини-игры о жизни ресейлера: сортировка склада, угадай курс, торг-мастер. Скоро в системе.',
    color: '#44474F',
    icon: Gamepad2,
    keywords: ['games', 'игры', 'аркада', 'мини', 'казуальные', 'развлечение', 'подработка'],
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

// тёплые оттенки (0..149: красные/янтарные/зелёные) — без синевы
function hueOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 150
}

// квадратный «фавикон»: буква домена, у известных сайтов — фирменный цвет
function Favicon({ seed, size = 18 }: { seed: string; size?: number }) {
  const known = SITE_MAP[seed]
  const letter = (seed.replace(/^https?:\/\/(www\.)?/, '')[0] ?? 'w').toUpperCase()
  const style = known
    ? { width: size, height: size, backgroundColor: `${known.color}1F`, color: known.color }
    : { width: size, height: size, backgroundColor: `hsl(${hueOf(seed)} 45% 28%)`, color: `hsl(${hueOf(seed)} 70% 78%)` }
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

// ─────────────────────────────────────────────────────────────────────────────
// палитра хрома (Chrome на Android): светлая / тёмная через CSS-переменные
// ─────────────────────────────────────────────────────────────────────────────
const LIGHT_VARS = {
  '--bg': '#FFFFFF',
  '--sur': '#F1F3F4',
  '--pill': '#ECEEF1',
  '--txt': '#1B1C1E',
  '--txt2': '#5F6368',
  '--bd': '#E8EAED',
  '--hov': 'rgba(0,0,0,0.05)',
  '--stub': 'rgba(0,0,0,0.09)',
  '--link': '#157F2A',
} as React.CSSProperties

const DARK_VARS = {
  '--bg': '#202124',
  '--sur': '#292A2D',
  '--pill': '#3C4043',
  '--txt': '#E8EAED',
  '--txt2': '#9AA0A6',
  '--bd': 'rgba(255,255,255,0.09)',
  '--hov': 'rgba(255,255,255,0.07)',
  '--stub': 'rgba(255,255,255,0.16)',
  '--link': '#4CC36A',
} as React.CSSProperties

// ─────────────────────────────────────────────────────────────────────────────
// контент мок-сайтов
// ─────────────────────────────────────────────────────────────────────────────
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
    hue: 110,
    title: 'Торговля с ботами: что реально работает',
    body:
      'Боты отвечают на аргументы, а не на хамство. Указывайте на состояние товара и царапины, предлагайте свою цену цифрой, а не «ну скинь немного». Второе сообщение бота — уже его реальный потолок, дальше можно соглашаться или уходить. И да, бот помнит ваши прошлые сделки, так что репутацию тут ещё никто не отменял.',
    replies: 33,
  },
  {
    nick: 'Бухгалтерша_Люда',
    date: '13 мая, 08:03',
    hue: 340,
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
    hue: 60,
    title: 'Вклад в банке — тихие проценты каждый час',
    body:
      'Для тех, у кого деньги лежат мёртвым грузом: вклад капает каждый час, и это лучше, чем ноль. Держите подушку на вкладе, а живые деньги на балансе под закупку. Перед крупной сделкой снимайте заранее — снятие моментальное, но лучше не делать это в последний момент перед оплатой счёта.',
    replies: 18,
  },
]

type ForumPost = (typeof FORUM_POSTS)[number]

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

// бейджи новостей (светлые варианты, без синевы)
const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  demand_up: { label: 'Спрос растёт', cls: 'bg-[#E6F4EA] text-[#157F2A]' },
  demand_down: { label: 'Спрос падает', cls: 'bg-[#FDEEEE] text-[#D14343]' },
  fashion: { label: 'Тренд', cls: 'bg-[#FDF3E0] text-[#B25E09]' },
  crisis: { label: 'Кризис', cls: 'bg-[#FDEEE3] text-[#C2620A]' },
  opu: { label: 'Дефицит', cls: 'bg-[#FBE9EF] text-[#C2346B]' },
  tax_raid: { label: 'Налоговая проверка', cls: 'bg-[#ECEEF1] text-[#44474F]' },
  supply: { label: 'Поставки', cls: 'bg-[#E3F2F0] text-[#0A8A76]' },
  garage: { label: 'Гаражная распродажа', cls: 'bg-[#FFF7DC] text-[#A07C08]' },
}

const SPORT_MATCHES = [
  { league: 'Футбол · Кубок района', home: 'Заря', away: 'Волна', hs: 2, as: 1, min: 'Завершён' },
  { league: 'Баскетбол · Городская лига', home: 'Спутник', away: 'Авангард', hs: 84, as: 79, min: '4-я четверть' },
  { league: 'Хоккей · Ночная лига', home: 'Метеор', away: 'Торпедо', hs: 3, as: 3, min: '3-й период' },
  { league: 'Теннис · ATP-чат', home: 'И. Петров', away: 'С. Ким', hs: 1, as: 2, min: 'Перерыв' },
]

const SPORT_NEWS = [
  'Вратарь «Зари» отбил пенальти на 90-й — интервью после матча',
  'Городской марафон: регистрация открыта до конца недели',
  '«Спутник» выходит в плей-офф с первого места',
]

const KINO_FILMS = [
  { t: 'Сделка века', g: 'Драма · 16+', r: 7.8, c: '#21A038' },
  { t: 'Торг невозможен', g: 'Триллер · 16+', r: 8.1, c: '#D14343' },
  { t: 'Пять звёзд', g: 'Комедия · 12+', r: 6.9, c: '#E8A020' },
  { t: 'Сезон распродаж', g: 'Документальный · 12+', r: 7.4, c: '#0A8A76' },
]

const ARCADE_GAMES = [
  { t: 'Склад-сортировка', d: 'Разложи лоты по полкам', icon: Package, c: '#21A038' },
  { t: 'Курс-угадайка', d: 'Вверх или вниз?', icon: TrendingUp, c: '#E8702A' },
  { t: 'Торг-мастер', d: 'Сбей цену боту', icon: HandshakeIcon, c: '#0A8A76' },
  { t: 'Налогобег', d: 'Убеги от пени', icon: Timer, c: '#D14343' },
]

const DOWNLOAD_FILES = [
  { name: 'iphone-13.jpg', meta: '2.4 МБ · сегодня', icon: ImageIcon, color: '#21A038' },
  { name: 'nike-af1.jpg', meta: '1.1 МБ · вчера', icon: ImageIcon, color: '#E8702A' },
  { name: 'resale-guide.pdf', meta: '480 КБ · 12 мая', icon: FileText, color: '#D14343' },
  { name: 'track-preview.m4a', meta: '820 КБ · 11 мая', icon: Music, color: '#D64570' },
]

// ─────────────────────────────────────────────────────────────────────────────
// общая шапка сайта (лого + ряд иконок) — сайты всегда светлые
// ─────────────────────────────────────────────────────────────────────────────
function SiteHeader({ color, icon: Icon, title, right }: { color: string; icon: LucideIcon; title: string; right?: LucideIcon }) {
  const Right = right
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EBEDF0] bg-white/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1A`, color }}>
          <Icon className="size-4.5" aria-hidden />
        </span>
        <span className="text-[15px] font-bold text-[#17181A]">{title}</span>
      </div>
      <div className="flex items-center gap-0.5 text-[#8B8F99]">
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

// ─────────────────────────────────────────────────────────────────────────────
// сайт: news.market (живые данные api.market) — светлый
// ─────────────────────────────────────────────────────────────────────────────
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
      <div className="min-h-full bg-[#F8F9FA]">
        <SiteHeader color="#E8702A" icon={TrendingUp} title="Market News" right={Newspaper} />
        <div className="space-y-3 p-4">
          <div className="h-16 animate-pulse rounded-2xl bg-[#ECEEF1]" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-[#ECEEF1]" />
          ))}
        </div>
      </div>
    )
  }
  if (error && !news) {
    return (
      <div className="min-h-full bg-[#F8F9FA]">
        <SiteHeader color="#E8702A" icon={TrendingUp} title="Market News" right={Newspaper} />
        <div className="flex flex-col items-center p-8 pt-14 text-center">
          <TrendingUp className="size-10 text-[#C9CDD4]" aria-hidden />
          <div className="mt-3 text-[14px] font-semibold text-[#17181A]">{error}</div>
          <button
            type="button"
            onClick={() => setRetry((k) => k + 1)}
            className="mt-5 rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-[#157F2A] shadow-sm transition active:scale-95"
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }
  if (!news) return null

  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#E8702A" icon={TrendingUp} title="Market News" right={Newspaper} />

      <div className="space-y-4 p-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 touch-pan-y">
          {news.indexes.map((idx) => {
            const up = idx.multiplier >= 1
            return (
              <div key={idx.category} className="min-w-[112px] shrink-0 rounded-2xl border border-[#EBEDF0] bg-white p-3 shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
                <div className="truncate text-[11px] text-[#8B8F99]">{CATEGORY_LABEL[idx.category] ?? idx.category}</div>
                <div className={'mt-1 flex items-center gap-1 text-[14px] font-bold ' + (up ? 'text-[#157F2A]' : 'text-[#D14343]')}>
                  {up ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
                  x{idx.multiplier.toFixed(2)}
                </div>
              </div>
            )
          })}
        </div>

        {news.events.length === 0 ? (
          <div className="rounded-2xl border border-[#EBEDF0] bg-white p-5 text-center">
            <p className="text-[12px] text-[#8B8F99]">Свежих новостей пока нет — рынок спит.</p>
          </div>
        ) : (
          news.events.map((ev) => {
            const badge = KIND_BADGE[ev.kind] ?? { label: ev.kind, cls: 'bg-[#ECEEF1] text-[#44474F]' }
            return (
              <article key={ev.id} className="overflow-hidden rounded-2xl border border-[#EBEDF0] bg-white shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
                <div className="flex items-center justify-between gap-2 border-b border-[#F5F6F8] px-4 py-2">
                  <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + badge.cls}>{badge.label}</span>
                  <span className="text-[10px] text-[#8B8F99]">{CATEGORY_LABEL[ev.category] ?? ev.category}</span>
                </div>
                <div className="p-4">
                  <div className="text-[13.5px] font-semibold leading-snug text-[#17181A]">{ev.headline}</div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#5F6368]">{ev.body}</p>
                  <div className="mt-2 text-[10px] text-[#8B8F99]">{timeAgo(ev.createdAt)}</div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// сайт: forum.market (список тем) — светлый
// ─────────────────────────────────────────────────────────────────────────────
function ForumPostCard({ post }: { post: ForumPost }) {
  const nick = post.nick.trim()
  return (
    <div className="rounded-2xl border border-[#EBEDF0] bg-white p-4 shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ backgroundColor: `hsl(${post.hue} 42% 40%)` }}
          aria-hidden
        >
          {nick.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-[#17181A]">{nick}</div>
          <div className="text-[10px] text-[#8B8F99]">{post.date}</div>
        </div>
      </div>
      <div className="mt-2.5 text-[14px] font-semibold leading-snug text-[#17181A]">{post.title}</div>
      <p className="mt-1.5 line-clamp-4 text-[12px] leading-relaxed text-[#5F6368]">{post.body}</p>
      <div className="mt-2.5 text-[10px] font-medium text-[#8B8F99]">{post.replies} ответов в теме</div>
    </div>
  )
}

function ForumSite() {
  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#0A8A76" icon={MessagesSquare} title="Market Forum" right={Users} />
      <div className="px-4 pt-3">
        <div className="text-[11px] text-[#8B8F99]">Сообщество ресейлеров: опыт, споры, лайфхаки</div>
      </div>
      <div className="space-y-3 p-4">
        {FORUM_POSTS.map((p, i) => (
          <ForumPostCard key={i} post={p} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// сайт: sdelka.ru (лендинг Resale) — светлый
// ─────────────────────────────────────────────────────────────────────────────
function ResaleSite({ onOpenApp }: { onOpenApp?: (app: AppKey) => void }) {
  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#21A038" icon={Check} title="Resale" right={ShoppingBag} />

      <div className="mx-4 mt-4">
        <div className="relative h-48 overflow-hidden rounded-3xl border border-[#EBEDF0]">
          <img loading="lazy" decoding="async" src="/img/p/iphone-13.jpg" alt="" className="absolute inset-0 size-full object-cover"/>
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-4">
            <span className="rounded-full bg-[#21A038] px-2.5 py-1 text-[10px] font-semibold text-white">Маркетплейс</span>
            <div className="mt-2 text-[18px] font-bold leading-tight text-white">Б/у — как новый</div>
          </div>
        </div>
      </div>

      <div className="px-4">
        <h1 className="mt-5 text-[20px] font-bold leading-snug text-[#17181A]">Купить и продать почти всё</h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-[#5F6368]">
          Resale — крупнейший сайт объявлений этой вселенной: больше сотни товаров, живой рынок и честный торг. Находите
          недооценённые лоты, сверяйтесь с индексами категорий и продавайте без лишних хлопот.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#5F6368]">
          В мобильном приложении удобнее: живая лента, чаты с продавцами, сделки в пару тапов и продвижение объявлений.
        </p>
        <button
          type="button"
          onClick={() => onOpenApp?.('avito')}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-[#21A038] text-[14px] font-semibold text-white shadow-[0_6px_18px_-6px_rgba(33,160,56,0.5)] transition active:scale-[0.98]"
        >
          Купить
        </button>
      </div>

      <div className="mt-6">
        <div className="mb-2.5 px-4 text-[13px] font-semibold text-[#17181A]">Популярные категории</div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-1 touch-pan-y">
          {RESALE_CATS.map((c) => (
            <button key={c.label} type="button" onClick={() => onOpenApp?.('avito')} className="w-24 shrink-0 text-left transition active:scale-95">
              <img loading="lazy" decoding="async" src={c.img} alt="" className="h-16 w-24 rounded-2xl border border-[#EBEDF0] object-cover"/>
              <span className="mt-1.5 block truncate text-[11px] text-[#5F6368]">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// сайт: banki.ru (лендинг банка) — светлый
// ─────────────────────────────────────────────────────────────────────────────
function BankiSite({ onOpenApp }: { onOpenApp?: (app: AppKey) => void }) {
  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#157F2A" icon={Landmark} title="Столичный Банк" right={CreditCardIcon} />

      <div className="p-4">
        <div className="relative overflow-hidden rounded-3xl border border-[#EBEDF0] bg-[#E6F4EA] p-5">
          <div className="absolute -right-6 -top-8 size-36 rounded-full bg-[#21A038]/15 blur-2xl" aria-hidden />
          <Landmark className="size-7 text-[#157F2A]" aria-hidden />
          <div className="mt-3 text-[17px] font-bold text-[#17181A]">Столичный Банк</div>
          <div className="mt-0.5 text-[11px] text-[#8B8F99]">banki.ru · обзор ставок</div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-[#5F6368]">
          Столичный Банк в этой игре один, зато надёжный. Кредит выдают за секунду, лимит растёт вместе с уровнем игрока.
          Накопительный вклад приносит проценты каждый час — маленькие деньги, но капают круглосуточно. Пока кредит не
          погашен, новый не выдадут.
        </p>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-xl bg-[#F0F2F5] px-3.5 py-3 text-[12px]">
            <span className="text-[#8B8F99]">Кредит</span>
            <span className="font-semibold text-[#17181A]">15% на 7 дней</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#F0F2F5] px-3.5 py-3 text-[12px]">
            <span className="text-[#8B8F99]">Вклад</span>
            <span className="font-semibold text-[#157F2A]">0.04% в час</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenApp?.('bank')}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-[#21A038] text-[14px] font-semibold text-white shadow-[0_6px_18px_-6px_rgba(33,160,56,0.5)] transition active:scale-[0.98]"
        >
          Открыть банк
        </button>
        <p className="mt-2 text-center text-[10px] text-[#8B8F99]">Банк откроется внутри системы</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// сайт: help.guide (гайд) — светлый
// ─────────────────────────────────────────────────────────────────────────────
function HelpSite() {
  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#E8A020" icon={LifeBuoy} title="Help Guide" right={Bookmark} />
      <div className="px-4 pt-3">
        <div className="text-[11px] text-[#8B8F99]">Всё, что нужно знать перед первой сделкой</div>
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
          <div key={s.t} className="rounded-2xl border border-[#EBEDF0] bg-white p-4 shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
            <div className="text-[14px] font-semibold text-[#17181A]">{s.t}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-[#5F6368]">{s.b}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// сайт: city.ads (список объявлений) — светлый
// ─────────────────────────────────────────────────────────────────────────────
function CityAdsSite() {
  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#D64570" icon={Megaphone} title="City Ads" right={Globe} />
      <div className="px-4 pt-3">
        <div className="text-[11px] text-[#8B8F99]">Объявления жителей района — обновляются каждый день</div>
      </div>
      <div className="mt-3 space-y-2.5 px-4">
        {CITY_ADS.map((ad) => (
          <div key={ad.title} className="flex items-center gap-3 rounded-2xl border border-[#EBEDF0] bg-white p-2.5 shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
            <img loading="lazy" decoding="async" src={ad.img} alt="" className="size-16 shrink-0 rounded-xl border border-[#EBEDF0] object-cover"/>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-[#17181A]">{ad.title}</div>
              <div className="mt-0.5 truncate text-[11px] text-[#8B8F99]">{ad.area}</div>
              <div className="mt-1 text-[13px] font-bold text-[#17181A]">{ad.price}</div>
            </div>
            <span className="shrink-0 self-start rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-medium text-[#157F2A]">Сегодня</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// сайт: sport.market (счёты и новости спорта) — светлый
// ─────────────────────────────────────────────────────────────────────────────
function SportSite() {
  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#7A9A01" icon={Trophy} title="Спорт-Обзор" right={Newspaper} />
      <div className="px-4 pt-4">
        <div className="text-[13px] font-semibold text-[#17181A]">Сегодня в спорте</div>
      </div>
      <div className="mt-3 space-y-2.5 px-4">
        {SPORT_MATCHES.map((m) => {
          const live = m.min !== 'Завершён'
          return (
            <div key={m.league} className="rounded-2xl border border-[#EBEDF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-medium text-[#8B8F99]">{m.league}</span>
                <span className={'flex shrink-0 items-center gap-1.5 text-[10px] font-semibold ' + (live ? 'text-[#D14343]' : 'text-[#8B8F99]')}>
                  {live && <span className="dot-pulse size-1.5 rounded-full bg-[#D14343]" aria-hidden />}
                  {m.min}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <span className="truncate text-right text-[13px] font-semibold text-[#17181A]">{m.home}</span>
                <span className="rounded-lg bg-[#F0F2F5] px-2.5 py-1 text-[14px] font-bold tabular-nums text-[#17181A]">
                  {m.hs} : {m.as}
                </span>
                <span className="truncate text-[13px] font-semibold text-[#17181A]">{m.away}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-4 pt-5">
        <div className="text-[13px] font-semibold text-[#17181A]">Лента</div>
        <div className="mt-2.5 space-y-2">
          {SPORT_NEWS.map((n) => (
            <div key={n} className="flex items-start gap-2.5 rounded-xl bg-white px-3.5 py-3 text-[12.5px] leading-snug text-[#3C4043] shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#7A9A01]" aria-hidden />
              {n}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// сайт: kino.afisha (что посмотреть) — светлый
// ─────────────────────────────────────────────────────────────────────────────
function KinoSite() {
  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#B3261E" icon={Clapperboard} title="Афиша" right={Star} />
      <div className="px-4 pt-4">
        <div className="text-[13px] font-semibold text-[#17181A]">Премьеры недели</div>
      </div>
      <div className="mt-3 space-y-2.5 px-4">
        {KINO_FILMS.map((f) => (
          <div key={f.t} className="flex items-center gap-3 rounded-2xl border border-[#EBEDF0] bg-white p-2.5 shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
            <span
              className="flex size-16 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `linear-gradient(135deg, ${f.c}, ${f.c}B0)` }}
              aria-hidden
            >
              <Clapperboard className="size-6 text-white/85" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-[#17181A]">{f.t}</span>
              <span className="mt-0.5 block truncate text-[11px] text-[#8B8F99]">{f.g}</span>
              <span className="mt-1 flex items-center gap-1 text-[12px] font-bold text-[#17181A]">
                <Star className="size-3.5 fill-[#E8A020] text-[#E8A020]" aria-hidden />
                {f.r.toFixed(1)}
              </span>
            </span>
            <span className="shrink-0 self-start rounded-full bg-[#FBE9EF] px-2 py-0.5 text-[10px] font-medium text-[#C2346B]">Сеансы</span>
          </div>
        ))}
      </div>
      <p className="px-4 pt-5 text-[11px] leading-relaxed text-[#8B8F99]">
        Сеансы — по выходным в кинотеатре «Резерв». Билеты оплачиваются балансомResale. Попкорн — за отзыв о сделке.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// сайт: arcade.games (мини-игры) — светлый
// ─────────────────────────────────────────────────────────────────────────────
function ArcadeSite() {
  return (
    <div className="min-h-full bg-[#F8F9FA] pb-8">
      <SiteHeader color="#44474F" icon={Gamepad2} title="Arcade" right={Zap} />
      <div className="px-4 pt-4">
        <div className="text-[13px] font-semibold text-[#17181A]">Мини-игры Resale</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5 px-4">
        {ARCADE_GAMES.map((g) => (
          <div key={g.t} className="rounded-2xl border border-[#EBEDF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(23,24,26,0.04)]">
            <span
              className="flex size-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${g.c}1A`, color: g.c }}
              aria-hidden
            >
              <g.icon className="size-5.5" />
            </span>
            <div className="mt-2.5 text-[13px] font-semibold text-[#17181A]">{g.t}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-[#8B8F99]">{g.d}</div>
            <span className="mt-2.5 inline-block rounded-full bg-[#FFF7DC] px-2 py-0.5 text-[10px] font-semibold text-[#A07C08]">Скоро</span>
          </div>
        ))}
      </div>
      <p className="px-4 pt-5 text-[11px] leading-relaxed text-[#8B8F99]">
        Аркада появится в следующем обновлении Resale OS. Пока лучший мини-гейм — сбить цену боту в чате.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// «Сайт недоступен» (Chrome-стиль, тема хрома)
// ─────────────────────────────────────────────────────────────────────────────
function UnavailablePage({ url, onReload }: { url: string; onReload: () => void }) {
  const host = hostOf(url)
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[var(--bg)] px-8 pb-20 pt-12 text-center text-[var(--txt)]">
      <svg width="76" height="76" viewBox="0 0 48 48" fill="none" aria-hidden className="text-[var(--txt2)]">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
        <circle cx="17" cy="20.5" r="2.2" fill="currentColor" fillOpacity="0.55" />
        <circle cx="31" cy="20.5" r="2.2" fill="currentColor" fillOpacity="0.55" />
        <path d="M17 32.5c2.2-2.4 4.6-3.4 7-3.4s4.8 1 7 3.4" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div className="mt-5 text-[16px] font-semibold">Сайт недоступен</div>
      <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-[var(--txt2)]">
        Не удалось найти IP-адрес сервера {host}. Проверьте адрес или попробуйте позже.
      </p>
      <div className="mt-3 font-mono text-[11px] tracking-wide text-[var(--txt2)] opacity-70">ERR_NAME_NOT_RESOLVED</div>
      <button
        type="button"
        onClick={onReload}
        className="mt-6 rounded-full bg-[var(--sur)] px-5 py-2.5 text-[13px] font-medium text-[var(--link)] transition active:scale-95"
      >
        Перезагрузить
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// стартовая (NTP): логотип, поиск, чипы-подсказки, сетка ярлыков 4×N
// ─────────────────────────────────────────────────────────────────────────────
function SearchPill({ urlInput, setUrlInput, onSubmit }: { urlInput: string; setUrlInput: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="flex h-12 items-center gap-2.5 rounded-full bg-[var(--pill)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[#21A038]/50">
      <Search className="size-4.5 shrink-0 text-[var(--txt2)]" aria-hidden />
      <input
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[var(--txt)] outline-none placeholder:text-[var(--txt2)]"
        value={urlInput}
        placeholder="Введите запрос или URL"
        aria-label="Поиск или адрес"
        onChange={(e) => setUrlInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
      />
      <Mic className="size-4.5 shrink-0 text-[var(--txt2)]" aria-hidden />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// умные подсказки омнибокса: ввод + история + закладки + популярные сайты,
// отсортированные fuzzy-релевантностью (в приватной вкладке история не участвует)
// ─────────────────────────────────────────────────────────────────────────────
interface OmniItem {
  key: string
  entry: NavEntry
  title: string
  sub: string
  favicon: string
}

function omniSuggestionList(
  raw: string,
  history: { entry: NavEntry; at: number }[],
  bookmarks: { key: string; entry: NavEntry }[],
  incognito: boolean,
): OmniItem[] {
  const q = raw.trim()
  if (q.length < 2) return []
  const pool: (OmniItem & { score: number })[] = []
  const push = (entry: NavEntry, title: string, sub: string) => {
    const score = bestScore(q, [title, entrySub(entry), urlOf(entry)])
    if (score > 0.5) pool.push({ key: entryKey(entry), entry, title, sub, favicon: entrySub(entry), score })
  }
  if (!incognito) {
    // свежие визиты первыми в очереди кандидатов
    for (const h of history.slice(0, 30)) push(h.entry, entryTitle(h.entry), entrySub(h.entry))
    for (const b of bookmarks) push(b.entry, entryTitle(b.entry), `Закладка · ${entrySub(b.entry)}`)
  }
  for (const s of SITES) push({ type: 'site', site: s.site }, s.title, s.desc)
  const seen = new Set<string>()
  return pool
    .sort((a, b) => b.score - a.score)
    .filter((x) => {
      if (seen.has(x.key)) return false
      seen.add(x.key)
      return true
    })
    .slice(0, 5)
    .map(({ key, entry, title, sub, favicon }) => ({ key, entry, title, sub, favicon }))
}

function OmniSuggestions({
  q,
  items,
  incognito,
  onPick,
  onSearch,
}: {
  q: string
  items: OmniItem[]
  incognito: boolean
  onPick: (e: NavEntry) => void
  onSearch: (q: string) => void
}) {
  return (
    <div
      className="absolute inset-x-0 top-full z-40 mt-2.5 overflow-hidden rounded-2xl bg-[var(--sur)] py-1 shadow-[0_14px_44px_-10px_rgba(0,0,0,0.4)] ring-1 ring-[var(--bd)]"
      role="listbox"
      aria-label="Подсказки адресной строки"
      onMouseDown={(e) => e.preventDefault()}
    >
      {!incognito && !isProbablyUrl(q) && (
        <button
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onSearch(q)}
          className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left transition active:bg-[var(--hov)]"
        >
          <Search className="size-4 shrink-0 text-[var(--txt2)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--txt)]">
            Искать <span className="font-semibold">«{q}»</span>
          </span>
          <CornerDownLeft className="size-3.5 shrink-0 text-[var(--txt2)]" aria-hidden />
        </button>
      )}
      {items.map((x) => (
        <button
          key={x.key}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(x.entry)}
          className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left transition active:bg-[var(--hov)]"
        >
          <Favicon seed={x.favicon} size={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] text-[var(--txt)]">
              <Highlight text={x.title} query={q} />
            </span>
            <span className="block truncate text-[11px] text-[var(--txt2)]">{x.sub}</span>
          </span>
          <ArrowUpRight className="size-3.5 shrink-0 text-[var(--txt2)]" aria-hidden />
        </button>
      ))}
    </div>
  )
}

function ShortcutTile({ label, node, onTap }: { label: string; node: ReactNode; onTap: () => void }) {
  return (
    <button type="button" onClick={onTap} className="flex min-h-[44px] flex-col items-center gap-1.5 transition active:scale-95">
      <span className="flex size-12 items-center justify-center rounded-full">{node}</span>
      <span className="max-w-full truncate text-[10.5px] text-[var(--txt2)]">{label}</span>
    </button>
  )
}

const NTP_TILES: { label: string; icon: LucideIcon; color: string; kind: 'app' | 'site'; target: string }[] = [
  { label: 'Resale', icon: ShoppingBag, color: '#21A038', kind: 'app', target: 'avito' },
  { label: 'Банк', icon: Landmark, color: '#157F2A', kind: 'app', target: 'bank' },
  { label: 'Новости', icon: Newspaper, color: '#E8702A', kind: 'site', target: 'news.market' },
  { label: 'Погода', icon: CloudSun, color: '#0A8A76', kind: 'app', target: 'weather' },
  { label: 'Спорт', icon: Trophy, color: '#7A9A01', kind: 'site', target: 'sport.market' },
  { label: 'Кино', icon: Clapperboard, color: '#B3261E', kind: 'site', target: 'kino.afisha' },
  { label: 'Музыка', icon: Music, color: '#D64570', kind: 'app', target: 'music' },
  { label: 'Игры', icon: Gamepad2, color: '#44474F', kind: 'site', target: 'arcade.games' },
]

const NTP_CHIPS = ['новости', 'банк', 'объявления', 'спорт', 'кино']

const WORDMARK_COLORS = ['#21A038', '#E8702A', '#E8A020', '#0A8A76', '#D64570', '#44474F']

function NewTabPage({
  urlInput,
  setUrlInput,
  onSubmit,
  onGo,
  onOpenApp,
  onAddShortcut,
  customShortcuts,
}: {
  urlInput: string
  setUrlInput: (v: string) => void
  onSubmit: () => void
  onGo: (e: NavEntry) => void
  onOpenApp: (app: AppKey) => void
  onAddShortcut: () => void
  customShortcuts: { id: number; label: string; entry: NavEntry }[]
}) {
  return (
    <div className="min-h-full bg-[var(--bg)] pb-8">
      {/* логотип + поиск */}
      <div className="px-4 pt-9 text-center">
        <div className="text-[32px] font-bold leading-none tracking-tight" aria-hidden>
          {'Resale'.split('').map((ch, i) => (
            <span key={i} style={{ color: WORDMARK_COLORS[i % WORDMARK_COLORS.length] }}>
              {ch}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[12px] text-[var(--txt2)]">Поиск по внутреннему рынку</div>
      </div>

      <div className="px-4 pt-5">
        <SearchPill urlInput={urlInput} setUrlInput={setUrlInput} onSubmit={onSubmit} />
      </div>

      {/* чипы-подсказки */}
      <div className="flex flex-wrap justify-center gap-2 px-4 pt-3">
        {NTP_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onGo({ type: 'search', query: c })}
            className="h-8 rounded-full bg-[var(--sur)] px-3.5 text-[12.5px] font-medium text-[var(--txt2)] transition active:scale-95"
          >
            {c}
          </button>
        ))}
      </div>

      {/* сетка ярлыков 4×2 + пользовательские */}
      <div className="px-4 pt-8">
        <div className="grid grid-cols-4 gap-y-5">
          {NTP_TILES.map((t) => (
            <ShortcutTile
              key={t.label}
              label={t.label}
              node={
                <span
                  className="flex size-12 items-center justify-center rounded-full transition active:scale-90"
                  style={{ backgroundColor: `${t.color}1A`, color: t.color }}
                  aria-hidden
                >
                  <t.icon className="size-5.5" />
                </span>
              }
              onTap={() => (t.kind === 'app' ? onOpenApp(t.target as AppKey) : onGo({ type: 'site', site: t.target }))}
            />
          ))}
          {customShortcuts.map((c) => (
            <ShortcutTile key={c.id} label={c.label} node={<Favicon seed={c.label} size={48} />} onTap={() => onGo(c.entry)} />
          ))}
          <ShortcutTile
            label="Добавить"
            node={<span className="flex size-12 items-center justify-center rounded-full bg-[var(--sur)]"><Plus className="size-5 text-[var(--txt2)]" aria-hidden /></span>}
            onTap={onAddShortcut}
          />
        </div>
      </div>

      <p className="px-8 pt-9 text-center text-[11px] leading-relaxed text-[var(--txt2)] opacity-80">
        Внутренний браузер Resale — реальный интернет недоступен. Известные адреса ведут на местные сайты.
      </p>
    </div>
  )
}

// стартовая приватной вкладки (всегда тёмная — как в Chrome)
function PrivateNtp({ urlInput, setUrlInput, onSubmit }: { urlInput: string; setUrlInput: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center bg-[var(--bg)] px-6 pb-10 pt-16 text-center" style={DARK_VARS}>
      <span className="flex size-16 items-center justify-center rounded-full bg-[var(--sur)] ring-2 ring-[var(--pill)]" aria-hidden>
        <VenetianMask className="size-7 text-[var(--txt2)]" />
      </span>
      <div className="mt-4 text-[16px] font-bold text-[var(--txt)]">Вы перешли в приватный режим</div>
      <p className="mt-1.5 max-w-[270px] text-[12px] leading-relaxed text-[var(--txt2)]">
        Вкладка не сохраняется в истории, а данные посещений удаляются после её закрытия.
      </p>
      <div className="mt-6 w-full">
        <SearchPill urlInput={urlInput} setUrlInput={setUrlInput} onSubmit={onSubmit} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// результаты поиска (внутренний каталог)
// ─────────────────────────────────────────────────────────────────────────────
const SEARCH_CHIPS = ['Все', 'Картинки', 'Покупки', 'Видео', 'Новости']

function searchCatalog(query: string): SiteDef[] {
  const tokens = query
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^0-9a-zа-я-]+/i)
    .filter(Boolean)
  if (tokens.length === 0) return []
  return SITES.map((s) => {
    const hay = (s.site + ' ' + s.title + ' ' + s.desc + ' ' + s.snippet + ' ' + s.keywords.join(' ')).toLowerCase()
    // точные токены — как раньше (вес 1), промахи добираем fuzzy (опечатки/подпоследовательности)
    let score = 0
    for (const t of tokens) {
      if (hay.includes(t)) {
        score += 1
        continue
      }
      const words = hay.split(/[^0-9a-zа-я]+/).filter(Boolean)
      const fuzzy = Math.max(0, ...words.map((w) => fuzzyScore(t, w)))
      score += fuzzy * 0.8
    }
    return { s, score }
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.s)
}

function SearchResultThumb({ s }: { s: SiteDef }) {
  if (s.thumb) {
    return (
      <span className="relative block size-16 shrink-0 overflow-hidden rounded-xl border border-[var(--bd)]">
        <img loading="lazy" decoding="async" src={s.thumb} alt="" className="absolute inset-0 size-full object-cover"/>
      </span>
    )
  }
  return (
    <span
      className="flex size-16 shrink-0 items-center justify-center rounded-xl"
      style={{ background: `linear-gradient(135deg, ${s.color}33, ${s.color}11)` }}
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
    <div className="min-h-full bg-[var(--bg)] pb-8">
      {/* чипы-фильтры */}
      <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-[var(--bg)]/95 px-4 py-2.5 touch-pan-y backdrop-blur">
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
                (activeChip ? 'bg-[#21A038] text-white' : 'bg-[var(--sur)] text-[var(--txt2)]')
              }
            >
              {activeChip && <Check className="size-3.5" aria-hidden />}
              {c}
            </button>
          )
        })}
      </div>

      <div className="px-4">
        <div className="pb-1 pt-1 text-[11px] text-[var(--txt2)]">Результатов: {results.length}</div>
        {results.length === 0 ? (
          <div className="flex flex-col items-center pt-14 text-center text-[var(--txt)]">
            <Search className="size-10 text-[var(--txt2)] opacity-50" aria-hidden />
            <div className="mt-3 text-[14px] font-semibold">Ничего не найдено</div>
            <p className="mt-1 max-w-[250px] text-[12px] text-[var(--txt2)]">
              Попробуйте другой запрос — например, «новости», «банк» или «объявления»
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--bd)]">
            {results.map((s) => (
              <li key={s.site}>
                <button
                  type="button"
                  onClick={() => onGo({ type: 'site', site: s.site })}
                  className="flex min-h-[44px] w-full items-start gap-3 py-3 text-left transition active:opacity-70"
                >
                  <Favicon seed={s.site} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-[var(--txt2)]">{s.site}</span>
                    <span className="mt-0.5 block truncate text-[15px] font-medium text-[var(--link)]">
                      {s.title} — {s.desc}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-[var(--txt2)]">{s.snippet}</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// закладки
// ─────────────────────────────────────────────────────────────────────────────
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
  // умный поиск по закладкам (fuzzy по названию/адресу)
  const [sq, setSq] = useState('')
  const qTrim = sq.trim()
  const visible = qTrim
    ? bookmarks.filter(({ entry }) => fuzzyMatch(qTrim, [entryTitle(entry), entrySub(entry), urlOf(entry)]))
    : bookmarks

  return (
    <div className="relative flex h-full flex-col bg-[var(--bg)] text-[var(--txt)]">
      <div className="flex items-center gap-2 border-b border-[var(--bd)] px-3 py-3">
        <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-full transition active:bg-[var(--hov)]" aria-label="Назад в браузер">
          <ChevronLeft className="size-5 text-[var(--txt2)]" aria-hidden />
        </button>
        <div className="flex-1 text-[15px] font-bold">Закладки</div>
        <Bookmark className="size-4.5 text-[var(--txt2)] opacity-60" aria-hidden />
      </div>

      {bookmarks.length > 2 && (
        <div className="border-b border-[var(--bd)] px-3 py-2">
          <div className="flex h-10 items-center gap-2 rounded-full bg-[var(--pill)] px-3.5">
            <Search className="size-4 shrink-0 text-[var(--txt2)]" aria-hidden />
            <input
              value={sq}
              onChange={(e) => setSq(e.target.value)}
              placeholder="Найти в закладках"
              aria-label="Поиск по закладкам"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--txt)] outline-none placeholder:text-[var(--txt2)]"
            />
            {qTrim && (
              <button type="button" aria-label="Очистить поиск" onClick={() => setSq('')} className="flex size-7 shrink-0 items-center justify-center rounded-full transition active:bg-[var(--hov)]">
                <X className="size-3.5 text-[var(--txt2)]" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          qTrim ? (
            <div className="flex flex-col items-center px-6 pt-14 text-center">
              <Search className="size-10 text-[var(--txt2)] opacity-50" aria-hidden />
              <div className="mt-3 text-[14px] font-medium">Ничего не нашлось</div>
              <p className="mt-1 text-[12px] text-[var(--txt2)]">Попробуйте другой запрос — опечатки не страшны</p>
            </div>
          ) : (
          <div className="flex flex-col items-center px-6 pt-14 text-center">
            <Bookmark className="size-10 text-[var(--txt2)] opacity-50" aria-hidden />
            <div className="mt-3 text-[14px] font-medium">Закладок нет</div>
            <p className="mt-1 text-[12px] text-[var(--txt2)]">Откройте сайт и нажмите звёздочку в адресной строке</p>
            <button
              type="button"
              onClick={onAdd}
              className="mt-5 rounded-full bg-[var(--sur)] px-5 py-2.5 text-[13px] font-medium text-[var(--link)] transition active:scale-95"
            >
              Добавить закладку вручную
            </button>
          </div>
          )
        ) : (
          <ul className="divide-y divide-[var(--bd)]">
            {visible.map(({ key, entry }) => (
              <li key={key} className="flex items-center pr-2">
                <button type="button" onClick={() => onPick(entry)} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition active:bg-[var(--hov)]">
                  <Favicon seed={entrySub(entry)} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">
                      {qTrim ? <Highlight text={entryTitle(entry)} query={qTrim} /> : entryTitle(entry)}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--txt2)]">{entrySub(entry)}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-[var(--txt2)] opacity-60" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Удалить из закладок: ${entryTitle(entry)}`}
                  onClick={() => onRemove(key)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full transition active:bg-[var(--hov)]"
                >
                  <Trash2 className="size-4 text-[var(--txt2)]" aria-hidden />
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
        className="absolute bottom-4 right-4 flex size-12 items-center justify-center rounded-full bg-[#21A038] text-white shadow-[0_8px_20px_-6px_rgba(33,160,56,0.55)] transition active:scale-90"
      >
        <Plus className="size-6" aria-hidden />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// история (персистится в localStorage resale_browser_history_v1)
// ─────────────────────────────────────────────────────────────────────────────
function HistoryPanel({
  entries,
  onPick,
  onClear,
  onBack,
}: {
  entries: { entry: NavEntry; at: number }[]
  onPick: (e: NavEntry) => void
  onClear: () => void
  onBack: () => void
}) {
  // умный поиск по истории (fuzzy по названию/адресу/запросу)
  const [sq, setSq] = useState('')
  const qTrim = sq.trim()
  const visible = qTrim
    ? entries.filter(({ entry }) => fuzzyMatch(qTrim, [entryTitle(entry), entrySub(entry), urlOf(entry)]))
    : entries

  return (
    <div className="flex h-full flex-col bg-[var(--bg)] text-[var(--txt)]">
      <div className="flex items-center gap-2 border-b border-[var(--bd)] px-3 py-3">
        <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-full transition active:bg-[var(--hov)]" aria-label="Назад в браузер">
          <ChevronLeft className="size-5 text-[var(--txt2)]" aria-hidden />
        </button>
        <div className="flex-1 text-[15px] font-bold">История</div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Очистить историю"
            className="flex size-9 items-center justify-center rounded-full text-[var(--txt2)] transition active:bg-[var(--hov)]"
          >
            <Trash2 className="size-4.5" aria-hidden />
          </button>
        )}
      </div>

      {entries.length > 2 && (
        <div className="border-b border-[var(--bd)] px-3 py-2">
          <div className="flex h-10 items-center gap-2 rounded-full bg-[var(--pill)] px-3.5">
            <Search className="size-4 shrink-0 text-[var(--txt2)]" aria-hidden />
            <input
              value={sq}
              onChange={(e) => setSq(e.target.value)}
              placeholder="Найти в истории"
              aria-label="Поиск по истории"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--txt)] outline-none placeholder:text-[var(--txt2)]"
            />
            {qTrim && (
              <button type="button" aria-label="Очистить поиск" onClick={() => setSq('')} className="flex size-7 shrink-0 items-center justify-center rounded-full transition active:bg-[var(--hov)]">
                <X className="size-3.5 text-[var(--txt2)]" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          qTrim ? (
            <div className="flex flex-col items-center px-6 pt-14 text-center">
              <Search className="size-10 text-[var(--txt2)] opacity-50" aria-hidden />
              <div className="mt-3 text-[14px] font-medium">Ничего не нашлось</div>
              <p className="mt-1 text-[12px] text-[var(--txt2)]">Попробуйте другой запрос — опечатки не страшны</p>
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 pt-14 text-center">
              <History className="size-10 text-[var(--txt2)] opacity-50" aria-hidden />
              <div className="mt-3 text-[14px] font-medium">История пуста</div>
              <p className="mt-1 text-[12px] text-[var(--txt2)]">Открытые сайты появятся здесь</p>
            </div>
          )
        ) : (
          <ul className="divide-y divide-[var(--bd)]">
            {visible.map(({ entry, at }, i) => (
              <li key={i}>
                <button type="button" onClick={() => onPick(entry)} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-[var(--hov)]">
                  <Favicon seed={entrySub(entry)} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">
                      {qTrim ? <Highlight text={entryTitle(entry)} query={qTrim} /> : entryTitle(entry)}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--txt2)]">{entrySub(entry)}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--txt2)]">{fmtTime(new Date(at))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// загрузки (демо-список)
// ─────────────────────────────────────────────────────────────────────────────
function DownloadsPanel({ onBack }: { onBack: () => void }) {
  const [cleared, setCleared] = useState(false)
  const files = cleared ? [] : DOWNLOAD_FILES
  return (
    <div className="flex h-full flex-col bg-[var(--bg)] text-[var(--txt)]">
      <div className="flex items-center gap-2 border-b border-[var(--bd)] px-3 py-3">
        <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-full transition active:bg-[var(--hov)]" aria-label="Назад в браузер">
          <ChevronLeft className="size-5 text-[var(--txt2)]" aria-hidden />
        </button>
        <div className="flex-1 text-[15px] font-bold">Загрузки</div>
        {!cleared && files.length > 0 && (
          <button
            type="button"
            onClick={() => setCleared(true)}
            aria-label="Очистить список загрузок"
            className="flex size-9 items-center justify-center rounded-full text-[var(--txt2)] transition active:bg-[var(--hov)]"
          >
            <Trash2 className="size-4.5" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-14 text-center">
            <Download className="size-10 text-[var(--txt2)] opacity-50" aria-hidden />
            <div className="mt-3 text-[14px] font-medium">Файлов нет</div>
            <p className="mt-1 text-[12px] text-[var(--txt2)]">Здесь появятся файлы, сохранённые из сайтов</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--bd)]">
            {files.map((f) => (
              <li key={f.name}>
                <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${f.color}1A`, color: f.color }}
                    aria-hidden
                  >
                    <f.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{f.name}</span>
                    <span className="block truncate text-[11px] text-[var(--txt2)]">{f.meta}</span>
                  </span>
                  <Download className="size-4 shrink-0 text-[var(--txt2)] opacity-50" aria-hidden />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="px-4 pb-4 pt-1 text-center text-[10px] text-[var(--txt2)] opacity-70">Демо-список: внутренние сайты не качают файлы из сети</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// обзор вкладок: карточки rounded-[16px] с превью-заглушкой
// ─────────────────────────────────────────────────────────────────────────────
function TabCard({ tab, active, onPick, onClose }: { tab: Tab; active: boolean; onPick: () => void; onClose: () => void }) {
  const cur = tab.stack[tab.idx] ?? ({ type: 'site', site: 'start' } as NavEntry)
  const isNtp = cur.type === 'site' && cur.site === 'start'
  const brand = cur.type === 'site' ? SITE_MAP[cur.site] : undefined
  const grad = tab.incognito
    ? 'linear-gradient(135deg, #2A2B2F 0%, #1B1C1E 100%)'
    : brand
      ? `linear-gradient(135deg, ${brand.color}30 0%, ${brand.color}0D 100%)`
      : 'linear-gradient(135deg, var(--sur), var(--bg))'
  const title = tab.incognito && isNtp ? 'Приватная вкладка' : entryTitle(cur)
  const sub = tab.incognito && isNtp ? 'Приватный режим' : entrySub(cur)

  return (
    <div className="tab-card-in">
      <div
        className={'overflow-hidden rounded-[16px] bg-[var(--sur)] transition ' + (active ? 'ring-2 ring-[#21A038]' : 'ring-1 ring-[var(--bd)]')}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-2 text-[var(--txt)]">
          {tab.incognito ? (
            <VenetianMask className="size-3.5 shrink-0 text-[var(--txt2)]" aria-hidden />
          ) : isNtp ? (
            <Globe className="size-3.5 shrink-0 text-[var(--txt2)]" aria-hidden />
          ) : (
            <Favicon seed={entrySub(cur)} size={14} />
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{title}</span>
          <button
            type="button"
            aria-label={`Закрыть вкладку ${title}`}
            onClick={onClose}
            className="flex size-6 shrink-0 items-center justify-center rounded-full transition active:bg-[var(--hov)]"
          >
            <X className="size-3 text-[var(--txt2)]" aria-hidden />
          </button>
        </div>
        <button type="button" onClick={onPick} className="relative block h-32 w-full text-left" aria-label={`Открыть вкладку ${title}`}>
          <span className="absolute inset-0" style={{ background: grad }} aria-hidden />
          {isNtp ? (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2" aria-hidden>
              {tab.incognito ? (
                <VenetianMask className="size-6 text-[var(--txt2)] opacity-70" />
              ) : (
                <>
                  <span className="h-6 w-4/5 rounded-full bg-[var(--stub)]" />
                  <span className="flex gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="size-4 rounded-lg bg-[var(--stub)]" />
                    ))}
                  </span>
                </>
              )}
            </span>
          ) : (
            <span className="absolute inset-0 flex flex-col p-2.5" aria-hidden>
              <span className="flex items-center gap-1.5 text-[var(--txt)]">
                <Favicon seed={entrySub(cur)} size={14} />
                <span className="truncate text-[9px] font-semibold">{title}</span>
              </span>
              <span className="mt-2 h-1.5 w-[88%] rounded-full bg-[var(--stub)]" />
              <span className="mt-1.5 h-1.5 w-[72%] rounded-full bg-[var(--stub)]" />
              <span className="mt-1.5 h-1.5 w-[80%] rounded-full bg-[var(--stub)] opacity-70" />
              <span className="mt-auto h-9 rounded-lg bg-[var(--stub)] opacity-70" />
            </span>
          )}
        </button>
      </div>
      <div className="px-1 pt-1.5 text-[var(--txt)]">
        <div className="truncate text-[11px] font-medium">{title}</div>
        <div className="truncate text-[10px] text-[var(--txt2)]">{sub}</div>
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
    <div className="flex h-full flex-col bg-[var(--bg)] text-[var(--txt)]">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="text-[13px] font-semibold text-[var(--txt2)]">
          {tabs.length} {tabs.length === 1 ? 'вкладка' : tabs.length < 5 ? 'вкладки' : 'вкладок'}
        </div>
        <button type="button" onClick={onCloseAll} className="rounded-full bg-[var(--sur)] px-3 py-1.5 text-[12px] font-medium text-[var(--txt)] transition active:scale-95">
          Закрыть все
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-3">
          {tabs.map((t) => (
            <TabCard key={t.id} tab={t} active={t.id === activeId} onPick={() => onPick(t.id)} onClose={() => onClose(t.id)} />
          ))}
          <button
            type="button"
            onClick={onNew}
            aria-label="Новая вкладка"
            className="flex min-h-[192px] items-center justify-center rounded-[16px] border border-dashed border-[var(--bd)] transition active:scale-[0.98]"
          >
            <span className="flex flex-col items-center gap-2">
              <Plus className="size-6 text-[var(--link)]" aria-hidden />
              <span className="text-[12px] text-[var(--txt2)]">Новая вкладка</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// приватный режим (экран из меню) — всегда тёмный, нейтральные тона
// ─────────────────────────────────────────────────────────────────────────────
function PrivateScreen({ onOpenPrivate, onBack }: { onOpenPrivate: () => void; onBack: () => void }) {
  const features: { icon: LucideIcon; t: string; d: string }[] = [
    { icon: Lock, t: 'Конфиденциальность', d: 'Вкладка не появится в истории и не сохранится после закрытия' },
    { icon: EyeOff, t: 'Без отслеживания', d: 'Сайты не видят ваш профиль и прошлые посещения' },
    { icon: DatabaseBackup, t: 'Данные удаляются', d: 'Cookie и кэш стираются, когда закрыта последняя приватная вкладка' },
  ]
  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] px-6 pb-8 text-[var(--txt)]" style={DARK_VARS}>
      <div className="flex items-center gap-2 py-3">
        <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-full transition active:bg-[var(--hov)]" aria-label="Назад в браузер">
          <ChevronLeft className="size-5 text-[var(--txt2)]" aria-hidden />
        </button>
        <div className="text-[13px] font-semibold text-[var(--txt2)]">Настройки просмотра</div>
      </div>

      <div className="flex flex-col items-center pt-6 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-[var(--sur)] ring-2 ring-[var(--pill)]" aria-hidden>
          <VenetianMask className="size-9 text-[var(--txt2)]" />
        </span>
        <div className="mt-5 text-[18px] font-bold">Приватный режим</div>
        <p className="mt-1.5 max-w-[280px] text-[12.5px] leading-relaxed text-[var(--txt2)]">
          Просмотр без следов: устройство не запоминает, какие сайты вы открывали
        </p>
      </div>

      <div className="mt-7 space-y-3">
        {features.map((f) => (
          <div key={f.t} className="flex items-start gap-3 rounded-2xl bg-[var(--sur)] p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pill)] text-[var(--txt2)]" aria-hidden>
              <f.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium">{f.t}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--txt2)]">{f.d}</span>
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onOpenPrivate}
        className="mt-8 flex h-12 w-full items-center justify-center rounded-full bg-[var(--pill)] text-[14px] font-semibold text-[var(--txt)] transition active:scale-[0.98]"
      >
        Открыть приватную вкладку
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// мини-шторка «добавить ярлык/закладку»
// ─────────────────────────────────────────────────────────────────────────────
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
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-6 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-sm rounded-3xl bg-[var(--sur)] p-5 text-[var(--txt)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-bold">{title}</div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="flex size-8 items-center justify-center rounded-full transition active:bg-[var(--hov)]">
            <X className="size-4 text-[var(--txt2)]" aria-hidden />
          </button>
        </div>

        <input
          className="mt-4 h-11 w-full rounded-full bg-[var(--pill)] px-4 text-[13px] text-[var(--txt)] outline-none placeholder:text-[var(--txt2)] focus:ring-2 focus:ring-[#21A038]/50"
          value={label}
          placeholder="Название (необязательно)"
          aria-label="Название"
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="mt-2.5 h-11 w-full rounded-full bg-[var(--pill)] px-4 text-[13px] text-[var(--txt)] outline-none placeholder:text-[var(--txt2)] focus:ring-2 focus:ring-[#21A038]/50"
          value={url}
          placeholder="Адрес, например news.market"
          aria-label="Адрес"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        {err && <div className="mt-2 px-1 text-[12px] text-[#D14343]">{err}</div>}

        <button
          type="button"
          onClick={submit}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-[#21A038] text-[13.5px] font-semibold text-white transition active:scale-[0.98]"
        >
          {cta}
        </button>
      </div>
    </div>
  )
}

// маленький переключатель для меню (Chrome-стиль)
function ChromeSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${checked ? 'bg-[#21A038]' : 'bg-[var(--pill)] ring-1 ring-[var(--bd)]'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BrowserApp({ onOpenApp }: { onOpenApp?: (app: AppKey) => void }) {
  const osTheme = useOS((s) => s.theme)
  const setTheme = useOS((s) => s.setTheme)

  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, stack: [{ type: 'site', site: 'start' }], idx: 0 }])
  const [activeId, setActiveId] = useState(1)
  const [urlInput, setUrlInput] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [omniFocused, setOmniFocused] = useState(false)
  const [view, setView] = useState<'page' | 'tabs' | 'history' | 'bookmarks' | 'private' | 'downloads'>('page')
  const [menuOpen, setMenuOpen] = useState(false)
  const [addSheet, setAddSheet] = useState<null | 'shortcut' | 'bookmark'>(null)
  // журнал посещений — персистится (приватные вкладки не пишутся)
  const [historyLog, setHistoryLog] = useState<{ entry: NavEntry; at: number }[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('resale_browser_history_v1')
      return raw ? (JSON.parse(raw) as { entry: NavEntry; at: number }[]) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('resale_browser_history_v1', JSON.stringify(historyLog.slice(-60)))
    } catch {
      /* приватный режим */
    }
  }, [historyLog])

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
  // приватная вкладка всегда тёмная (как в Chrome), иначе — тема ОС
  const darkChrome = osTheme === 'dark' || incognito
  const chromeVars = darkChrome ? DARK_VARS : LIGHT_VARS

  // открытие приложений из браузера (контракт onOpenApp сохранён)
  const openAppTarget = (app: AppKey) => {
    if (onOpenApp) onOpenApp(app)
    else useOS.getState().openApp(app)
  }

  // короткая имитация загрузки: тонкий зелёный прогресс под омнибоксом
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

  // звёздочка закладки в омнибоксе
  const bookmarked = !isNtp && bookmarks.some((b) => b.key === currentKey)
  const toggleBookmark = () => {
    if (isNtp) return
    if (bookmarked) {
      setBookmarks((prev) => prev.filter((b) => b.key !== currentKey))
    } else {
      setBookmarks((prev) => [...prev, { key: currentKey, entry: current }].slice(-30))
    }
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

  // умные подсказки омнибокса (история + закладки + каталог сайтов, fuzzy-сортировка;
  // в приватной вкладке история/закладки не подсказываем — как в Chrome)
  const omniItems = view === 'page' ? omniSuggestionList(urlInput, historyLog, bookmarks, incognito) : []
  const showOmniSuggestions = omniFocused && view === 'page' && (omniItems.length > 0 || (!incognito && urlInput.trim().length >= 2 && !isProbablyUrl(urlInput.trim())))

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--txt)]" style={chromeVars}>
      {/* ---------- верхняя панель: омнибокс + счётчик вкладок ---------- */}
      <div className="relative z-20 touch-pan-y bg-[var(--bg)]" onPointerDown={omniSwipe.onPointerDown}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* омнибокс-пилюля */}
          <div
            className={
              'relative flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-[var(--pill)] pl-3.5 pr-1 transition-shadow ' +
              (omniFocused ? 'ring-2 ring-[#21A038]/50' : '')
            }
          >
            {incognito ? (
              <VenetianMask className="size-4 shrink-0 text-[var(--txt2)]" aria-label="Приватный режим" />
            ) : isNtp || current.type === 'search' ? (
              <Search className="size-4 shrink-0 text-[var(--txt2)]" aria-hidden />
            ) : (
              <Favicon seed={entrySub(current)} size={18} />
            )}
            <input
              className="min-w-0 flex-1 truncate bg-transparent text-[13.5px] text-[var(--txt)] outline-none placeholder:text-[var(--txt2)]"
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
                className="flex size-8 shrink-0 items-center justify-center rounded-full transition active:bg-[var(--hov)]"
              >
                <X className="size-3.5 text-[var(--txt2)]" aria-hidden />
              </button>
            )}
            {/* звёздочка закладки */}
            {!omniFocused && !isNtp && (
              <button
                type="button"
                aria-label={bookmarked ? 'Убрать из закладок' : 'Добавить в закладки'}
                onClick={toggleBookmark}
                className="flex size-8 shrink-0 items-center justify-center rounded-full transition active:bg-[var(--hov)]"
              >
                <Star className={`size-4.5 ${bookmarked ? 'fill-[#E8A020] text-[#E8A020]' : 'text-[var(--txt2)]'}`} aria-hidden />
              </button>
            )}
            <button
              type="button"
              aria-label="Перезагрузить страницу"
              onClick={reload}
              className="flex size-8 shrink-0 items-center justify-center rounded-full transition active:bg-[var(--hov)]"
            >
              <RotateCw className="size-4 text-[var(--txt2)]" aria-hidden />
            </button>

            {/* умные подсказки под омнибоксом */}
            {showOmniSuggestions && (
              <OmniSuggestions
                q={urlInput.trim()}
                items={omniItems}
                incognito={incognito}
                onPick={(e) => {
                  setOmniFocused(false)
                  go(e)
                }}
                onSearch={(q) => {
                  setOmniFocused(false)
                  go({ type: 'search', query: q })
                }}
              />
            )}
          </div>

          {/* счётчик вкладок (Chrome-стиль: квадрат с числом) */}
          <button
            type="button"
            onClick={() => {
              setView(view === 'tabs' ? 'page' : 'tabs')
              setMenuOpen(false)
            }}
            aria-label={`Вкладки: ${tabs.length}`}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--txt)] transition active:bg-[var(--hov)]"
          >
            <Square className="size-6" strokeWidth={2} aria-hidden />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{tabs.length > 9 ? '9+' : tabs.length}</span>
          </button>
        </div>

        {/* прогресс-бар загрузки: зелёный #21A038 */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[3px] overflow-visible">
          {busy && (
            <div className="h-full w-1/3">
              <div className="chrome-load h-full w-full rounded-full bg-[#21A038]" />
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
              className="flex size-9 items-center justify-center rounded-full bg-[var(--sur)] shadow-md ring-1 ring-[var(--bd)]"
              style={{ transform: `rotate(${Math.min(1, pull / 64) * 300}deg)`, opacity: 0.35 + Math.min(1, pull / 64) * 0.65 }}
            >
              <RotateCw className="size-4 text-[var(--txt2)]" />
            </span>
          </div>
        )}
        {view === 'tabs' ? (
          <TabSwitcher tabs={tabs} activeId={activeId} onPick={pickTab} onClose={closeTab} onNew={() => newTab(false)} onCloseAll={closeAllTabs} />
        ) : view === 'history' ? (
          <HistoryPanel
            entries={historyEntries}
            onPick={(e) => {
              go(e)
              setMenuOpen(false)
            }}
            onClear={() => setHistoryLog([])}
            onBack={() => setView('page')}
          />
        ) : view === 'bookmarks' ? (
          <BookmarksPanel
            bookmarks={bookmarks}
            onPick={(e) => {
              go(e)
              setView('page')
            }}
            onRemove={(k) => setBookmarks((prev) => prev.filter((b) => b.key !== k))}
            onBack={() => setView('page')}
            onAdd={() => {
              setAddSheet('bookmark')
              setMenuOpen(false)
            }}
          />
        ) : view === 'downloads' ? (
          <DownloadsPanel onBack={() => setView('page')} />
        ) : view === 'private' ? (
          <PrivateScreen onOpenPrivate={() => newTab(true)} onBack={() => setView('page')} />
        ) : (
          <div ref={scrollRef} className="h-full touch-pan-y overflow-y-auto" onPointerDown={ptr.onPointerDown}>
            {current.type === 'site' && isNtp && !incognito && (
              <NewTabPage
                urlInput={urlInput}
                setUrlInput={setUrlInput}
                onSubmit={submitUrl}
                onGo={go}
                onOpenApp={openAppTarget}
                onAddShortcut={() => setAddSheet('shortcut')}
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
            {current.type === 'site' && current.site === 'sport.market' && <SportSite key={`sport:${reloadKey}`} />}
            {current.type === 'site' && current.site === 'kino.afisha' && <KinoSite key={`kino:${reloadKey}`} />}
            {current.type === 'site' && current.site === 'arcade.games' && <ArcadeSite key={`arcade:${reloadKey}`} />}
          </div>
        )}
      </div>

      {/* ---------- нижний тулбар: ← → ⌂ ⋮ ---------- */}
      {view !== 'tabs' && (
        <div className="z-20 flex items-center justify-around border-t border-[var(--bd)] bg-[var(--bg)] px-2 py-1.5">
          <button
            type="button"
            onClick={back}
            disabled={!canBack}
            aria-label="Назад"
            className="flex size-11 items-center justify-center rounded-full transition active:bg-[var(--hov)] disabled:opacity-30"
          >
            <ChevronLeft className={'size-6 ' + (canBack ? 'text-[var(--txt)]' : 'text-[var(--txt2)] opacity-50')} aria-hidden />
          </button>
          <button
            type="button"
            onClick={forward}
            disabled={!canForward}
            aria-label="Вперёд"
            className="flex size-11 items-center justify-center rounded-full transition active:bg-[var(--hov)] disabled:opacity-30"
          >
            <ChevronRight className={'size-6 ' + (canForward ? 'text-[var(--txt)]' : 'text-[var(--txt2)] opacity-50')} aria-hidden />
          </button>
          <button
            type="button"
            onClick={home}
            aria-label="Домашняя страница"
            className="flex size-11 items-center justify-center rounded-full transition active:bg-[var(--hov)]"
          >
            <Globe className="size-6 text-[var(--txt)]" aria-hidden />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Меню браузера"
              aria-expanded={menuOpen}
              className="flex size-11 items-center justify-center rounded-full transition active:bg-[var(--hov)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--txt)]" aria-hidden>
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {/* меню открывается ВВЕРХ от кнопки, как в Chrome на Android */}
            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />
                <div className="chrome-menu-in absolute bottom-[54px] right-0 z-40 w-64 origin-bottom-right overflow-hidden rounded-2xl bg-[var(--sur)] py-1.5 text-[var(--txt)] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.35)] ring-1 ring-[var(--bd)]">
                  {[
                    { icon: Plus, label: 'Новая вкладка', fn: () => newTab(false) },
                    { icon: VenetianMask, label: 'Приватная вкладка', fn: () => newTab(true) },
                    { icon: Bookmark, label: 'Закладки', fn: () => { setView('bookmarks'); setMenuOpen(false) } },
                    { icon: History, label: 'История', fn: () => { setView('history'); setMenuOpen(false) } },
                    { icon: Download, label: 'Загрузки', fn: () => { setView('downloads'); setMenuOpen(false) } },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.fn}
                      className="flex min-h-[44px] w-full items-center gap-3.5 px-4 text-left text-[13px] transition active:bg-[var(--hov)]"
                    >
                      <item.icon className="size-4.5 text-[var(--txt2)]" aria-hidden />
                      {item.label}
                    </button>
                  ))}
                  <div className="my-1 border-t border-[var(--bd)]" />
                  {/* тёмная тема — реальный переключатель ОС */}
                  <div className="flex min-h-[44px] w-full items-center gap-3.5 px-4 text-[13px]">
                    <Moon className="size-4.5 text-[var(--txt2)]" aria-hidden />
                    <span className="flex-1">Тёмная тема</span>
                    <ChromeSwitch checked={osTheme === 'dark'} onChange={(v) => setTheme(v ? 'dark' : 'light')} label="Тёмная тема браузера" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      openAppTarget('settings')
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3.5 px-4 text-left text-[13px] transition active:bg-[var(--hov)]"
                  >
                    <Settings2 className="size-4.5 text-[var(--txt2)]" aria-hidden />
                    Настройки
                  </button>
                  <div className="mt-1 border-t border-[var(--bd)] px-4 pb-1.5 pt-2 text-[10px] text-[var(--txt2)] opacity-70">Resale Browser 130.0</div>
                </div>
              </>
            )}
          </div>
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
