'use client'

// Карточка товара «Resale» — светлый минимализм по фирменному макету:
// большое фото со счётчиком, цена 18 extrabold, описание и характеристики
// в белых карточках, блок продавца, липкий низ с «Купить» (тёмно-зелёная).
// ВСЯ логика (покупка/чат/жалоба/блокировка/отзыв/продвижение) сохранена 1:1.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  ChevronLeft, MapPin, Eye, Star, Truck, HandCoins, MessageSquare, ShoppingBag,
  TrendingDown, Zap, Loader2, PackageCheck, AlertTriangle, Clock, BadgeCheck, PenLine,
  Flag, LineChart, ShieldCheck, ChevronRight, Ban, CircleSlash, Handshake, CloudOff,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { sound } from '@/lib/sound'
import { fmtNum, fmtMoney, timeAgo } from '@/lib/format'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { DELIVERY_FEE } from '@/lib/economy'
import type { ListingDetailData, PricePointDTO } from '@/lib/types'
import type { SpecItem } from '@/lib/specs'
import { addViewed } from '@/lib/viewed'
import { ConditionBadge } from './AvitoApp'
import { Card, ErrorState, Overline, Skeleton } from './ui'

// Галерея карточки товара: кадров из одной реальной фотографии нет в API,
// поэтому «снимки» — декоративные кропы (деталь/ракурс) того же изображения, как на макете
const GALLERY_SHOTS: { label: string; style?: React.CSSProperties }[] = [
  { label: 'Фото' },
  { label: 'Деталь', style: { transform: 'scale(1.9)', transformOrigin: '32% 28%' } },
  { label: 'Ракурс', style: { transform: 'scale(2.4)', transformOrigin: '68% 68%' } },
]

export default function ListingScreen({ id, onBack, onOpenChat, onOpenSeller, onGoSell, onOpenListing }: {
  id: string
  onBack: () => void
  onOpenChat: (chatId: string) => void
  onOpenSeller?: (sellerId: string) => void
  onGoSell: () => void
  onOpenListing?: (listingId: string) => void
}) {
  const [data, setData] = useState<(ListingDetailData & { sellerOnline: boolean; sellerRating: number; specs?: SpecItem[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [buyOpen, setBuyOpen] = useState(false)
  const [mode, setMode] = useState<'pickup' | 'courier'>('pickup')
  const [showDesc, setShowDesc] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [revStars, setRevStars] = useState(0)
  const [revHover, setRevHover] = useState(0)
  const [revText, setRevText] = useState('')
  const [revSent, setRevSent] = useState(false)
  const [sellerReviews, setSellerReviews] = useState<{ id: string; from: string; rating: number; text: string; listing: string; createdAt: string }[] | null>(null)
  const [complaintOpen, setComplaintOpen] = useState(false)
  const [complaintReason, setComplaintReason] = useState('spam')
  const [complaintSent, setComplaintSent] = useState(false)
  const [complaintBusy, setComplaintBusy] = useState(false)
  // чёрный список: заблокирован ли продавец этого объявления
  const [sellerBlocked, setSellerBlocked] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  // галерея: активный «снимок» (счётчик 1/N)
  const galleryRef = useRef<HTMLDivElement>(null)
  const [shot, setShot] = useState(0)
  const session = useOS((s) => s.session)
  const pushToast = useOS((s) => s.pushToast)
  const refreshSession = useOS((s) => s.refreshSession)

  const load = useCallback(async () => {
    setLoading(true)
    setShot(0)
    if (galleryRef.current) galleryRef.current.scrollLeft = 0
    try {
      const d = await api.listing(id)
      setData(d as ListingDetailData & { sellerOnline: boolean; sellerRating: number; specs?: SpecItem[] })
      setError('')
      addViewed({ id: d.id, title: d.title, price: d.price, image: d.image })
      // отзывы о продавце — вторым запросом, не блокируя карточку
      api.userReviews(d.seller.id).then((r) => setSellerReviews(r.items)).catch(() => setSellerReviews([]))
      // состояние чёрного списка для продавца
      if (!d.mine) {
        api.blockedIds().then((r) => setSellerBlocked(r.ids.includes(d.seller.id))).catch(() => {})
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const buy = async (courier: boolean) => {
    if (!data) return
    setBusy(true)
    setMsg('')
    try {
      const res = await api.buyListing(id, { courier })
      refreshSession({ balance: res.balance, xp: res.xp, level: res.level })
      sound.success()
      setBuyOpen(false)
      // ЛОГИСТИКА (28-b): товар больше не попадает в инвентарь мгновенно — едет посылкой
      setOkMsg(courier
        ? 'Оплачено! Продавец собирает посылку. Следите в Доставках'
        : 'Оплачено! Заберите товар через приложение Доставки')
      pushToast('Resale', courier ? 'Посылка собирается. Следите в Доставках' : 'Заберите товар через Доставки')
      await load()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Не удалось купить')
    } finally {
      setBusy(false)
    }
  }

  const chat = async () => {
    if (!data) return
    setBusy(true)
    try {
      const c = await api.openChat(data.id)
      onOpenChat(c.id)
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const boost = async () => {
    setBusy(true)
    setMsg('')
    try {
      const res = await api.boostListing(id)
      refreshSession({ balance: res.balance })
      setOkMsg('Объявление продвинуто на 2 часа')
      await load()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.removeListing(id)
      onBack()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const openComplaint = () => {
    setComplaintOpen(true)
    api.complaintState(id).then((st) => {
      if (st.complainedByMe) setComplaintSent(true)
    }).catch(() => {})
  }

  const sendComplaint = async () => {
    setComplaintBusy(true)
    try {
      await api.addComplaint(id, complaintReason)
      setComplaintSent(true)
      pushToast('Resale', 'Жалоба отправлена модератору')
      setTimeout(() => setComplaintOpen(false), 900)
    } catch (e) {
      pushToast('Resale', e instanceof ApiError ? e.message : 'Не удалось отправить жалобу')
    } finally {
      setComplaintBusy(false)
    }
  }

  const toggleBlockSeller = async () => {
    if (!data) return
    setBlockBusy(true)
    try {
      const res = await api.toggleBlock(data.seller.id)
      setSellerBlocked(res.blocked)
      pushToast(
        'Resale',
        res.blocked
          ? `«${res.name ?? data.seller.displayName}» заблокирован. Объявления скрыты из ленты`
          : 'Продавец разблокирован',
      )
    } catch (e) {
      pushToast('Resale', e instanceof ApiError ? e.message : 'Не удалось изменить список')
    } finally {
      setBlockBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex h-full flex-col bg-[#F5F6F8]">
        <Skeleton className="aspect-[4/3] w-full rounded-none" />
        <div className="flex-1 space-y-3 p-4">
          <Skeleton className="h-7 w-1/2 rounded-lg" />
          <Skeleton className="h-4 w-3/4 rounded-md" />
          <Skeleton className="h-4 w-1/3 rounded-md" />
          <Skeleton className="h-24 w-full rounded-[20px]" />
          <Skeleton className="h-16 w-full rounded-[20px]" />
        </div>
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="h-full bg-[#F5F6F8]">
        <ErrorState
          icon={<CloudOff size={28} />}
          note={error}
          onRetry={() => void load()}
          secondaryLabel="Вернуться в ленту"
          onSecondary={onBack}
          className="pt-16"
        />
      </div>
    )
  }
  if (!data) return null

  const isMine = data.mine
  const sold = data.status === 'sold'
  const total = mode === 'courier' ? data.price + DELIVERY_FEE : data.price
  const balance = session?.balance ?? 0
  const longDesc = data.description.length > 120
  const joined = data.sellerJoined
    ? new Date(data.sellerJoined).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="relative flex h-full flex-col bg-[#F5F6F8]">
      {/* фото со свайп-каруселью (нативный scroll-snap, touch-action pan-x — свайпы работают на телефоне) */}
      <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        <div className="relative aspect-[4/3] bg-[#f0f1f3]">
          <div
            ref={galleryRef}
            onScroll={() => {
              const el = galleryRef.current
              if (!el || el.clientWidth === 0) return
              setShot(Math.min(GALLERY_SHOTS.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))))
            }}
            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ touchAction: 'pan-x' }}
          >
            {GALLERY_SHOTS.map((s, i) => (
              <div key={s.label} className="relative h-full w-full shrink-0 snap-center overflow-hidden">
                <img
                  src={data.image}
                  alt={i === 0 ? data.title : ''}
                  aria-hidden={i > 0}
                  draggable={false}
                  className={`h-full w-full select-none object-cover ${sold ? 'opacity-75 saturate-50' : ''}`}
                  style={s.style}
                />
              </div>
            ))}
          </div>
          {/* плавающая кнопка «назад» */}
          <button
            onClick={onBack}
            aria-label="Назад"
            className="absolute left-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-white text-[#17181A] shadow-md transition-colors active:bg-neutral-200/60 outline-none focus-visible:ring-2 focus-visible:ring-[#15803D]/50"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
          <span
            className="absolute bottom-2.5 right-2.5 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#17181A] backdrop-blur-sm"
            aria-label={`Фото ${shot + 1} из ${GALLERY_SHOTS.length}`}
          >
            {shot + 1}/{GALLERY_SHOTS.length}
          </span>
          {data.price === 0 && (
            <span className="absolute right-3 top-3 rounded-full bg-[#14532D] px-2.5 py-1 text-xs font-bold text-white">Отдам даром</span>
          )}
          {data.boosted && (
            <span className="absolute left-14 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
              <Zap size={12} aria-hidden /> ТОП
            </span>
          )}
          {sold && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40" aria-hidden>
              <span className="rounded-2xl bg-white px-5 py-2.5 text-lg font-extrabold text-[#17181A] shadow-lg">Продано</span>
            </div>
          )}
        </div>

        <div className="pb-4">
          {/* цена, название, чипы, метрики */}
          <div className="space-y-2 px-4 pb-4 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[18px] font-extrabold tracking-tight leading-none tabular-nums ${data.price === 0 ? 'text-[#16A34A]' : 'text-[#17181A]'}`}>
                {data.price === 0 ? 'Даром' : `${fmtNum(data.price)} ₽`}
              </span>
              {data.price > 0 && data.marginHint > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-[#14532D]/[0.08] px-2 py-1 text-xs font-bold text-[#15803D]">
                  <TrendingDown size={12} aria-hidden /> Дешевле рынка на {data.marginHint}%
                </span>
              )}
              {!isMine && data.negotiable && (
                <span className="flex items-center gap-1 rounded-full bg-neutral-200/60 px-2 py-1 text-xs font-semibold text-[#17181A]/50">
                  <Handshake size={12} aria-hidden /> Торг уместен
                </span>
              )}
            </div>
            <h1 className="text-[16px] font-semibold leading-snug text-[#17181A]">{data.title}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <ConditionBadge condition={data.condition} />
              <span className="rounded-full bg-neutral-200/60 px-2 py-0.5 text-[11px] font-medium leading-none text-[#17181A]/50">
                {CATEGORY_LABEL[data.category] ?? 'Товар'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[12px] text-[#17181A]/45">
              <span className="flex items-center gap-1"><MapPin size={12} aria-hidden /> {data.city}</span>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1"><Eye size={12} aria-hidden /> {data.views}</span>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1"><Clock size={12} aria-hidden /> {timeAgo(data.createdAt)}</span>
            </div>
          </div>

          {/* описание */}
          <Card className="mx-4 p-4">
            <Overline className="mb-1.5">Описание</Overline>
            <p className={`text-[14px] leading-relaxed text-[#3c4043] ${!showDesc && longDesc ? 'line-clamp-4' : ''}`}>{data.description}</p>
            {longDesc && (
              <button
                onClick={() => setShowDesc((s) => !s)}
                aria-expanded={showDesc}
                className="mt-1.5 text-[14px] font-semibold text-[#15803D] transition-opacity active:opacity-70"
              >
                {showDesc ? 'Свернуть' : 'Показать полностью'}
              </button>
            )}
          </Card>

          {/* характеристики — строки «параметр: значение» */}
          {data.specs && data.specs.length > 0 && (
            <Card className="mx-4 mt-3 p-4">
              <Overline className="mb-1">Характеристики</Overline>
              <div className="divide-y divide-[#EBEDF0]">
                {data.specs.map((s) => (
                  <div key={s.label} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="shrink-0 text-[13px] text-[#17181A]/45">{s.label}</span>
                    <span className="min-w-0 text-right text-[13px] font-semibold text-[#17181A]">{s.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* продавец — тап открывает страницу продавца */}
          <Card className="mx-4 mt-3 overflow-hidden">
            <button
              onClick={() => onOpenSeller?.(data.seller.id)}
              disabled={!onOpenSeller}
              className="w-full p-4 text-left transition-opacity active:opacity-80 disabled:cursor-default"
              aria-label={`Все объявления продавца ${data.seller.displayName}`}
            >
              <div className="flex items-center gap-3">
                <UserAvatar name={data.seller.displayName} className="h-11 w-11 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-bold text-[#17181A]">{data.seller.displayName}</span>
                    {data.sellerOnline && <span className="size-2 shrink-0 rounded-full bg-[#16A34A]" aria-label="Продавец онлайн" />}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[12px] text-[#17181A]/45">
                    <Star size={11} className="fill-[#16A34A] text-[#16A34A]" aria-hidden />
                    {data.sellerRating > 0 ? Math.min(5, data.sellerRating).toFixed(1) : 'новый'}
                    <span>({data.seller.ratingCount})</span>
                  </div>
                </div>
                {onOpenSeller && <ChevronRight size={16} className="shrink-0 text-[#17181A]/25" aria-hidden />}
              </div>
              {joined && (
                <div className="mt-3 flex items-center gap-1 border-t border-black/[0.05] pt-3 text-[12px] text-[#17181A]/45">
                  <BadgeCheck size={12} className="text-[#16A34A]" aria-hidden />
                  На Resale с {joined}
                </div>
              )}
            </button>
          </Card>

          {/* отзывы о продавце */}
          {sellerReviews && sellerReviews.length > 0 && (
            <div className="px-4 pt-3">
              <Overline className="mb-2 px-1">Отзывы о продавце</Overline>
              <div className="space-y-2">
                {sellerReviews.map((r) => (
                  <Card key={r.id} className="p-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-[#17181A]">{r.from}</span>
                      <span className="flex gap-0.5" aria-label={`Оценка ${r.rating} из 5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={10} className={i < r.rating ? 'fill-[#16A34A] text-[#16A34A]' : 'text-[#17181A]/25'} aria-hidden />
                        ))}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-black/40">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[#17181A]/50">{r.text}</p>
                    <p className="mt-0.5 truncate text-[10px] text-black/40">{r.listing}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* динамика цен на этот товар */}
          {data.priceHistory && data.priceHistory.filter((p) => p.price > 0).length >= 2 && (
            <div className="px-4 pt-3">
              <PriceHistoryCard points={data.priceHistory} />
            </div>
          )}

          {/* похожие объявления: конкуренты по этому же товару */}
          {data.similar && data.similar.length > 0 && (
            <div className="pl-4 pt-4">
              <SimilarStrip items={data.similar} currentPrice={data.price} onOpen={(lid) => onOpenListing?.(lid)} />
            </div>
          )}

          {/* отзыв о сделке */}
          {sold && data.purchasedByMe && (
            <div className="px-4 pt-4">
              <div className="space-y-2.5 rounded-[20px] bg-amber-500/[0.1] p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#17181A]">
                  <PenLine size={14} className="text-amber-700" aria-hidden />
                  Оцените сделку
                </div>
                {data.reviewedByMe || revSent ? (
                  <p className="flex items-center gap-1.5 text-xs text-[#17181A]/50">
                    <BadgeCheck size={14} className="text-[#16A34A]" aria-hidden />
                    Отзыв отправлен. Продавец увидит вашу оценку
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-1" role="radiogroup" aria-label="Оценка от 1 до 5" onMouseLeave={() => setRevHover(0)}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          role="radio"
                          aria-checked={revStars === n}
                          aria-label={`${n} из 5`}
                          onClick={() => setRevStars(n)}
                          onMouseEnter={() => setRevHover(n)}
                          className="p-1 transition-transform active:scale-90"
                        >
                          <Star size={26} className={(revHover || revStars) >= n ? 'fill-[#16A34A] text-[#16A34A]' : 'text-white'} aria-hidden />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={revText}
                      onChange={(e) => setRevText(e.target.value)}
                      placeholder="Расскажите, как прошла сделка (необязательно)"
                      rows={2}
                      maxLength={300}
                      className="w-full resize-none rounded-[14px] bg-white p-3 text-sm text-[#17181A] outline-none ring-1 ring-black/[0.06] placeholder:text-[#17181A]/35 focus:ring-black/[0.14]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          if (revStars < 1) return
                          setBusy(true)
                          setMsg('')
                          try {
                            await api.leaveReview(id, revStars, revText)
                            setRevSent(true)
                            setOkMsg('Отзыв сохранён. +20 XP')
                          } catch (e) {
                            setMsg(e instanceof ApiError ? e.message : 'Не удалось отправить отзыв')
                          } finally {
                            setBusy(false)
                          }
                        }}
                        disabled={busy || revStars < 1}
                        className="flex h-11 items-center rounded-full bg-[#14532D] px-5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
                      >
                        Отправить
                      </button>
                      <span className="text-[11px] text-black/40">+20 XP за отзыв</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* жалоба на объявление */}
          {!isMine && !sold && (
            <div className="px-4 pt-4">
              {complaintSent ? (
                <p className="flex items-center gap-1.5 text-xs text-[#17181A]/45">
                  <ShieldCheck size={13} className="text-[#16A34A]" aria-hidden />
                  Жалоба отправлена. Модератор проверит объявление
                </p>
              ) : (
                <button
                  onClick={openComplaint}
                  className="flex h-11 items-center gap-1.5 rounded-2xl px-3 text-xs font-medium text-[#17181A]/45 transition-colors active:bg-neutral-200/60"
                >
                  <Flag size={13} aria-hidden /> Пожаловаться на объявление
                </button>
              )}
            </div>
          )}

          {isMine && (
            <div className="px-4 pt-4">
              <Card className="space-y-2.5 p-4">
                <div className="flex items-center gap-1.5 text-xs text-[#17181A]/50">
                  <PackageCheck size={14} className="text-[#16A34A]" aria-hidden />
                  Это ваше объявление
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={boost}
                    disabled={busy || data.boosted}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#14532D] text-xs font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
                  >
                    <Zap size={14} aria-hidden /> {data.boosted ? 'Уже продвинуто' : `Продвинуть · ${fmtMoney(149)}`}
                  </button>
                  <button
                    onClick={remove}
                    disabled={busy}
                    className="h-11 rounded-full bg-neutral-200/60 px-4 text-xs font-semibold text-[#17181A] transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    Снять
                  </button>
                </div>
                <button onClick={onGoSell} className="flex h-8 items-center text-xs font-semibold text-[#17181A]/50 transition-opacity active:opacity-70">
                  Продать что-то ещё
                </button>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ЛИПАЮЩИЙ низ: «Написать» (белая) + «Купить» (тёмно-зелёная пилюля) */}
      {!isMine && (
        <div className="shrink-0 border-t border-black/[0.05] bg-white/95 px-3 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-md">
          {sold ? (
            <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-200/60 text-sm font-bold text-black/40">
              <PackageCheck size={17} aria-hidden /> Продано
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={chat}
                disabled={busy}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-[15px] font-bold text-[#17181A] ring-1 ring-black/[0.1] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <MessageSquare size={17} aria-hidden /> Написать
              </button>
              <button
                onClick={() => { setMode('pickup'); setBuyOpen(true); setMsg('') }}
                disabled={busy || balance < data.price}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#14532D] text-[15px] font-bold text-white shadow-[0_4px_14px_rgba(20,83,45,0.25)] transition-all active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
              >
                <ShoppingBag size={17} aria-hidden />
                {data.price === 0 ? 'Забрать даром' : `Купить за ${fmtNum(data.price)} ₽`}
              </button>
            </div>
          )}
        </div>
      )}
      {msg && !buyOpen && <div className="shrink-0 px-4 pb-2 text-xs text-red-600">{msg}</div>}
      {okMsg && !buyOpen && (
        <div className="flex shrink-0 items-center gap-1 px-4 pb-2 text-xs text-[#15803D]">
          <PackageCheck size={12} aria-hidden /> {okMsg}
        </div>
      )}

      {/* выбор способа получения */}
      {buyOpen && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/50" onClick={() => { if (!busy) setBuyOpen(false) }}>
          <div className="w-full rounded-t-[24px] bg-white animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center pt-3">
              <span className="h-1 w-10 rounded-full bg-neutral-200/70" aria-hidden />
            </div>
            <h3 className="px-4 pt-2 text-base font-bold text-[#17181A]">Как получите товар?</h3>
            <div role="radiogroup" aria-label="Способ получения" className="space-y-2 p-3">
              <button
                role="radio"
                aria-checked={mode === 'pickup'}
                onClick={() => setMode('pickup')}
                disabled={busy}
                className={`flex w-full items-start gap-3 rounded-[18px] border-2 p-3.5 text-left transition-colors disabled:opacity-50 ${
                  mode === 'pickup' ? 'border-[#16A34A] bg-white' : 'border-black/[0.06] bg-[#F5F6F8]'
                }`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${mode === 'pickup' ? 'border-[#16A34A]' : 'border-black/20'}`} aria-hidden>
                  {mode === 'pickup' && <span className="h-2.5 w-2.5 rounded-full bg-[#14532D]" />}
                </span>
                <HandCoins size={20} className="mt-0.5 shrink-0 text-[#15803D]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#17181A]">Самовывоз</span>
                    <span className="text-sm font-bold tabular-nums text-[#17181A]">{data.price === 0 ? 'Даром' : `${fmtNum(data.price)} ₽`}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-[#17181A]/45">Осмотр и торг при встрече</span>
                </span>
              </button>
              <button
                role="radio"
                aria-checked={mode === 'courier'}
                onClick={() => setMode('courier')}
                disabled={busy || data.price === 0}
                className={`flex w-full items-start gap-3 rounded-[18px] border-2 p-3.5 text-left transition-colors disabled:opacity-50 ${
                  mode === 'courier' ? 'border-[#16A34A] bg-white' : 'border-black/[0.06] bg-[#F5F6F8]'
                }`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${mode === 'courier' ? 'border-[#16A34A]' : 'border-black/20'}`} aria-hidden>
                  {mode === 'courier' && <span className="h-2.5 w-2.5 rounded-full bg-[#14532D]" />}
                </span>
                <Truck size={20} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#17181A]">Курьер</span>
                    <span className="text-sm font-bold text-[#17181A]">+{fmtMoney(DELIVERY_FEE)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-[#17181A]/45">
                    <AlertTriangle size={11} className="shrink-0 text-amber-700" aria-hidden />
                    Без осмотра и торга
                  </span>
                </span>
              </button>
            </div>
            {msg && <div className="px-4 pb-2 text-xs text-red-600">{msg}</div>}
            {busy && <div className="flex justify-center pb-2"><Loader2 size={18} className="animate-spin text-[#17181A]/35" aria-hidden /></div>}
            <div className="border-t border-black/[0.05] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <button
                onClick={() => buy(mode === 'courier')}
                disabled={busy || balance < total}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#14532D] text-[15px] font-bold text-white shadow-[0_4px_14px_rgba(20,83,45,0.25)] transition-all active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
              >
                <ShoppingBag size={17} aria-hidden />
                {data.price === 0 ? 'Забрать даром' : `Купить за ${fmtNum(total)} ₽`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* жалоба — bottom sheet */}
      {complaintOpen && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/50" onClick={() => { if (!complaintBusy) setComplaintOpen(false) }}>
          <div className="max-h-[86%] w-full overflow-y-auto rounded-t-[24px] bg-white [scrollbar-width:thin] animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Жалоба на объявление">
            <div className="flex justify-center pt-3">
              <span className="h-1 w-10 rounded-full bg-neutral-200/70" aria-hidden />
            </div>
            <h3 className="px-4 pt-2 text-base font-bold text-[#17181A]">Причина жалобы</h3>
            <p className="px-4 pt-1 text-xs text-[#17181A]/45">Модератор проверит объявление и примет решение</p>
            <div role="radiogroup" aria-label="Причина жалобы" className="space-y-2 p-3">
              {([
                ['spam', 'Реклама или спам'],
                ['fake', 'Товар не существует'],
                ['scam', 'Похоже на обман'],
                ['wrong', 'Неверное описание или цена'],
                ['other', 'Другое'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={complaintReason === key}
                  onClick={() => setComplaintReason(key)}
                  disabled={complaintBusy}
                  className={`flex w-full items-center gap-3 rounded-[18px] border-2 p-3.5 text-left transition-colors disabled:opacity-50 ${
                    complaintReason === key ? 'border-[#16A34A] bg-white' : 'border-black/[0.06] bg-[#F5F6F8]'
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${complaintReason === key ? 'border-[#16A34A]' : 'border-black/20'}`} aria-hidden>
                    {complaintReason === key && <span className="h-2.5 w-2.5 rounded-full bg-[#14532D]" />}
                  </span>
                  <span className="text-sm font-medium text-[#17181A]">{label}</span>
                </button>
              ))}
            </div>
            {complaintSent ? (
              <div className="flex items-center gap-2 border-t border-black/[0.05] p-3 text-sm font-semibold text-[#15803D]">
                <ShieldCheck size={16} aria-hidden /> Жалоба отправлена
              </div>
            ) : (
              <div className="border-t border-black/[0.05] p-3">
                <button
                  onClick={sendComplaint}
                  disabled={complaintBusy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#14532D] text-[15px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  {complaintBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Flag size={16} aria-hidden />}
                  Отправить жалобу
                </button>
              </div>
            )}
            {/* чёрный список: действует мгновенно, объявления скрываются из ленты */}
            {!data.mine && (
              <div className="border-t border-black/[0.05] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                <button
                  onClick={toggleBlockSeller}
                  disabled={blockBusy}
                  className={`flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40 ${
                    sellerBlocked
                      ? 'bg-neutral-200/60 text-[#17181A]'
                      : 'bg-red-500/[0.09] text-red-600'
                  }`}
                >
                  {blockBusy ? (
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                  ) : sellerBlocked ? (
                    <CircleSlash size={15} aria-hidden />
                  ) : (
                    <Ban size={15} aria-hidden />
                  )}
                  {sellerBlocked ? `Разблокировать ${data.seller.displayName}` : `Заблокировать ${data.seller.displayName}`}
                </button>
                <p className="mt-1.5 text-[10px] leading-relaxed text-black/40">
                  {sellerBlocked
                    ? 'Объявления продавца снова появятся в ленте.'
                    : 'Его объявления исчезнут из вашей ленты, а боты-продавцы перестанут вам писать.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Динамика цен на этот товар: спарклайн по точкам рынка (PricePoint)
function PriceHistoryCard({ points }: { points: PricePointDTO[] }) {
  const gid = useId()
  const ps = points.filter((p) => p.price > 0)
  if (ps.length < 2) return null
  const w = 320
  const h = 72
  const padX = 4
  const padY = 8
  const min = Math.min(...ps.map((p) => p.price))
  const max = Math.max(...ps.map((p) => p.price))
  const span = max - min || 1
  const x = (i: number) => padX + (i / (ps.length - 1)) * (w - padX * 2)
  const y = (v: number) => h - padY - ((v - min) / span) * (h - padY * 2)
  const line = ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ')
  const area = `${line} L${x(ps.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`
  const firstPoint = ps[0]
  const lastPoint = ps[ps.length - 1]
  const first = firstPoint.price
  const last = lastPoint.price
  const delta = Math.round(((last - first) / first) * 100)
  const up = delta > 0
  const days = Math.max(1, Math.round((new Date(lastPoint.at).getTime() - new Date(firstPoint.at).getTime()) / 86_400_000))
  const period = days >= 25 ? 'за месяц' : days >= 5 ? `за ${days} дн.` : 'за неделю'

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <LineChart size={14} className="text-[#15803D]" aria-hidden />
        <Overline>Динамика цен</Overline>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${
            up ? 'bg-red-500/[0.09] text-red-600' : 'bg-[#14532D]/[0.08] text-[#15803D]'
          }`}
        >
          {up ? '+' : ''}
          {delta}% {period}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-[#17181A]/45">
        По {ps.length} объявлениям на рынке · min {fmtNum(min)} ₽ / max {fmtNum(max)} ₽
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full" role="img" aria-label={`График цен от ${fmtNum(min)} до ${fmtNum(max)} рублей`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14532D" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#14532D" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={padY} x2={w - padX} y2={padY} stroke="#141414" strokeOpacity="0.06" strokeWidth="1" strokeDasharray="3 4" />
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="#141414" strokeOpacity="0.06" strokeWidth="1" strokeDasharray="3 4" />
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="#14532D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(ps.length - 1)} cy={y(last)} r="3.5" fill="#14532D" stroke="#FFFFFF" strokeWidth="1.5" />
      </svg>
    </Card>
  )
}

// Похожие объявления того же товара у других продавцов: рыночная конкуренция в лицо
function SimilarStrip({ items, currentPrice, onOpen }: {
  items: NonNullable<ListingDetailData['similar']>
  currentPrice: number
  onOpen: (id: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 pr-4">
        <Overline>Похожие объявления</Overline>
        <span className="text-[11px] text-[#17181A]/35">{items.length} шт.</span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: 'pan-x' }}>
        {items.map((s) => {
          const diff = currentPrice > 0 ? Math.round(((s.price - currentPrice) / currentPrice) * 100) : 0
          const cheaper = diff < 0
          const equal = diff === 0
          return (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              className="w-[150px] shrink-0 overflow-hidden rounded-[16px] bg-white text-left ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform active:scale-[0.98]"
            >
              <div className="relative aspect-[4/3] bg-[#f0f1f3]">
                <img src={s.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                {s.boosted && (
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                    <Zap size={9} aria-hidden /> ТОП
                  </span>
                )}
                {s.mine && (
                  <span className="absolute right-1.5 top-1.5 rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#17181A] shadow-sm">
                    Ваше
                  </span>
                )}
              </div>
              <div className="space-y-1 p-2">
                <p className="text-[14px] font-extrabold leading-none tabular-nums text-[#17181A]">
                  {s.price === 0 ? 'Даром' : `${fmtNum(s.price)} ₽`}
                </p>
                {!equal && currentPrice > 0 && s.price > 0 && (
                  <p className={`text-[10px] font-semibold ${cheaper ? 'text-[#15803D]' : 'text-black/40'}`}>
                    {cheaper ? 'дешевле' : 'дороже'} на {Math.abs(diff)}%
                  </p>
                )}
                <p className="truncate text-[10px] text-[#17181A]/50">{s.sellerName}</p>
                <p className="flex items-center gap-0.5 text-[10px] text-black/40">
                  <MapPin size={9} aria-hidden /> {s.city}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
