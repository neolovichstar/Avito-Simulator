'use client'

// Страница объявления — светлый дизайн 1:1 как настоящий Авито:
// фото во всю ширину со счётчиком «1/3», цена bold 24, чипы параметров,
// карточка продавца #F7F8FA, липкий низ с «Написать» (#F0F1F5) и «Купить» (чёрная).
// ВСЯ логика (покупка/чат/жалоба/блокировка/отзыв/продвижение) сохранена 1:1.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  ChevronLeft, MapPin, Eye, Star, Truck, HandCoins, MessageSquare, ShoppingBag,
  TrendingDown, Zap, Loader2, PackageCheck, AlertTriangle, Clock, BadgeCheck, PenLine,
  Flag, LineChart, ShieldCheck, ChevronRight, Ban, CircleSlash, Handshake,
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
        ? 'Оплачено! Продавец собирает посылку — следите в Доставках'
        : 'Оплачено! Заберите товар через приложение Доставки')
      pushToast('Resale', courier ? 'Посылка собирается — следите в Доставках' : 'Заберите товар через Доставки')
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
          ? `«${res.name ?? data.seller.displayName}» заблокирован — объявления скрыты из ленты`
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
      <div className="h-full bg-white flex flex-col">
        <div className="shrink-0 aspect-[4/3] bg-[#F0F1F5] animate-pulse" />
        <div className="flex-1 p-4 space-y-3 animate-pulse">
          <div className="h-7 bg-[#F0F1F5] rounded-lg w-1/2" />
          <div className="h-4 bg-[#F0F1F5] rounded w-3/4" />
          <div className="h-4 bg-[#F0F1F5] rounded w-1/3" />
          <div className="h-[76px] bg-[#F0F1F5] rounded-2xl" />
        </div>
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="h-full bg-white flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-[#D14343]">{error}</p>
        <button onClick={onBack} className="h-11 px-5 rounded-[12px] bg-[#F0F1F5] text-sm font-semibold text-black">Вернуться в ленту</button>
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
    <div className="h-full flex flex-col bg-white relative">
      {/* фото со свайп-каруселью (нативный scroll-snap, touch-action pan-x — свайпы работают на телефоне) */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] overscroll-contain">
        <div className="relative aspect-[4/3] bg-[#F0F1F5]">
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
          {/* плавающая кнопка «назад» — как в настоящем приложении */}
          <button
            onClick={onBack}
            aria-label="Назад"
            className="absolute top-3 left-3 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-black active:bg-[#F0F1F5]"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
          <span
            className="absolute bottom-2.5 right-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-black tabular-nums shadow-sm"
            aria-label={`Фото ${shot + 1} из ${GALLERY_SHOTS.length}`}
          >
            {shot + 1}/{GALLERY_SHOTS.length}
          </span>
          {data.price === 0 && (
            <span className="absolute top-3 right-3 bg-[#0AC760] text-white text-xs font-bold px-2 py-1 rounded-[10px]">Отдам даром</span>
          )}
          {data.boosted && (
            <span className="absolute top-3 left-14 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded-[10px] flex items-center gap-1 backdrop-blur-sm">
              <Zap size={12} aria-hidden /> ТОП
            </span>
          )}
          {sold && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40" aria-hidden>
              <span className="bg-white text-black font-extrabold text-lg px-5 py-2.5 rounded-2xl shadow-lg">Продано</span>
            </div>
          )}
        </div>

        <div className="pb-4">
          {/* цена, название, чипы параметров, метрики */}
          <div className="px-4 pt-3.5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[24px] font-extrabold tracking-tight tabular-nums leading-none ${data.price === 0 ? 'text-[#067A47]' : 'text-black'}`}>
                {data.price === 0 ? 'Даром' : `${fmtNum(data.price)} ₽`}
              </span>
              {data.price > 0 && data.marginHint > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold text-[#067A47] bg-[#E6F9EF] px-2 py-1 rounded-[10px]">
                  <TrendingDown size={12} aria-hidden /> Дешевле рынка на {data.marginHint}%
                </span>
              )}
              {!isMine && data.negotiable && (
                <span className="flex items-center gap-1 text-xs font-semibold text-[#5C616B] bg-[#F0F1F5] px-2 py-1 rounded-[10px]">
                  <Handshake size={12} aria-hidden /> Торг уместен
                </span>
              )}
            </div>
            <h1 className="text-[16px] font-semibold text-black leading-snug">{data.title}</h1>
            <div className="flex items-center gap-1.5 flex-wrap">
              <ConditionBadge condition={data.condition} />
              <span className="text-[11px] px-2 py-0.5 rounded-[10px] font-medium bg-[#F0F1F5] text-[#5C616B]">
                {CATEGORY_LABEL[data.category] ?? 'Товар'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-[#8B8F99] pt-0.5">
              <MapPin size={12} aria-hidden /> {data.city}
              <span aria-hidden>•</span>
              <span className="flex items-center gap-1"><Eye size={12} aria-hidden /> {data.views}</span>
              <span aria-hidden>•</span>
              <span className="flex items-center gap-1"><Clock size={12} aria-hidden /> {timeAgo(data.createdAt)}</span>
            </div>
          </div>

          {/* описание */}
          <div className="px-4 pt-4 mt-3.5 border-t border-[#EBEDF0]">
            <h2 className="text-[15px] font-semibold text-black mb-1">Описание</h2>
            <p className={`text-[14px] text-[#333333] leading-relaxed ${!showDesc && longDesc ? 'line-clamp-4' : ''}`}>{data.description}</p>
            {longDesc && (
              <button
                onClick={() => setShowDesc((s) => !s)}
                aria-expanded={showDesc}
                className="text-[14px] font-semibold text-black mt-1.5 active:opacity-70"
              >
                {showDesc ? 'Свернуть' : 'Показать полностью'}
              </button>
            )}
          </div>

          {/* характеристики — чипы-параметры */}
          {data.specs && data.specs.length > 0 && (
            <div className="px-4 pt-4">
              <div className="flex flex-wrap gap-1.5">
                {data.specs.map((s) => (
                  <span key={s.label} className="text-[12px] px-2.5 py-1 rounded-[10px] bg-[#F0F1F5] text-[#5C616B]">
                    {s.label}: <span className="font-semibold text-black">{s.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* продавец — тап открывает страницу продавца */}
          <div className="px-4 pt-4 mt-3.5 border-t border-[#EBEDF0]">
            <button
              onClick={() => onOpenSeller?.(data.seller.id)}
              disabled={!onOpenSeller}
              className="w-full text-left rounded-2xl bg-[#F7F8FA] p-3 active:opacity-80 transition-opacity disabled:cursor-default"
              aria-label={`Все объявления продавца ${data.seller.displayName}`}
            >
              <div className="flex items-center gap-3">
                <UserAvatar name={data.seller.displayName} className="w-11 h-11 rounded-full" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-bold text-black truncate">{data.seller.displayName}</span>
                    {data.sellerOnline && <span className="w-2 h-2 rounded-full bg-[#0AC760] shrink-0" aria-label="Продавец онлайн" />}
                  </div>
                  <div className="text-[12px] text-[#8B8F99] flex items-center gap-1 mt-0.5">
                    <Star size={11} className="text-[#0AC760] fill-[#0AC760]" aria-hidden />
                    {data.sellerRating > 0 ? Math.min(5, data.sellerRating).toFixed(1) : 'новый'}
                    <span>({data.seller.ratingCount})</span>
                  </div>
                </div>
                {onOpenSeller && <ChevronRight size={16} className="text-[#8B8F99] shrink-0" aria-hidden />}
              </div>
              {joined && (
                <div className="flex items-center gap-1 text-[12px] text-[#8B8F99] mt-2.5 pt-2.5 border-t border-[#EBEDF0]">
                  <BadgeCheck size={12} className="text-[#0AC760]" aria-hidden />
                  На Resale с {joined}
                </div>
              )}
            </button>
          </div>

          {/* отзывы о продавце */}
          {sellerReviews && sellerReviews.length > 0 && (
            <div className="px-4 pt-4">
              <h2 className="text-[15px] font-semibold text-black mb-2">Отзывы о продавце</h2>
              <div className="space-y-2">
                {sellerReviews.map((r) => (
                  <div key={r.id} className="rounded-2xl bg-[#F7F8FA] p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-black truncate">{r.from}</span>
                      <span className="flex gap-0.5" aria-label={`Оценка ${r.rating} из 5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={10} className={i < r.rating ? 'text-[#0AC760] fill-[#0AC760]' : 'text-[#EBEDF0]'} aria-hidden />
                        ))}
                      </span>
                      <span className="text-[10px] text-[#8B8F99] ml-auto shrink-0">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="text-xs text-[#5C616B] mt-1 line-clamp-2">{r.text}</p>
                    <p className="text-[10px] text-[#8B8F99] mt-0.5 truncate">{r.listing}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* динамика цен на этот товар */}
          {data.priceHistory && data.priceHistory.filter((p) => p.price > 0).length >= 2 && (
            <div className="px-4 pt-4">
              <PriceHistoryCard points={data.priceHistory} />
            </div>
          )}

          {/* похожие объявления: конкуренты по этому же товару */}
          {data.similar && data.similar.length > 0 && (
            <div className="pt-4 pl-4">
              <SimilarStrip items={data.similar} currentPrice={data.price} onOpen={(lid) => onOpenListing?.(lid)} />
            </div>
          )}

          {/* отзыв о сделке */}
          {sold && data.purchasedByMe && (
            <div className="px-4 pt-4">
              <div className="rounded-2xl bg-[#FFF4E5] p-3 space-y-2.5">
                <div className="text-xs font-semibold text-black flex items-center gap-1.5">
                  <PenLine size={14} className="text-[#B25E09]" aria-hidden />
                  Оцените сделку
                </div>
                {data.reviewedByMe || revSent ? (
                  <p className="text-xs text-[#5C616B] flex items-center gap-1.5">
                    <BadgeCheck size={14} className="text-[#0AC760]" aria-hidden />
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
                          className="p-1 active:scale-90 transition-transform"
                        >
                          <Star size={26} className={(revHover || revStars) >= n ? 'text-[#0AC760] fill-[#0AC760]' : 'text-white'} aria-hidden />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={revText}
                      onChange={(e) => setRevText(e.target.value)}
                      placeholder="Расскажите, как прошла сделка (необязательно)"
                      rows={2}
                      maxLength={300}
                      className="w-full rounded-[12px] border border-[#EBEDF0] bg-white p-2.5 text-sm resize-none text-black placeholder:text-[#8B8F99] outline-none focus:border-[#8B8F99]"
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
                            setOkMsg('Отзыв сохранён — +20 XP')
                          } catch (e) {
                            setMsg(e instanceof ApiError ? e.message : 'Не удалось отправить отзыв')
                          } finally {
                            setBusy(false)
                          }
                        }}
                        disabled={busy || revStars < 1}
                        className="h-11 px-5 rounded-[12px] bg-black text-white font-bold text-sm disabled:opacity-40 active:bg-[#1A1A1A] transition-colors"
                      >
                        Отправить
                      </button>
                      <span className="text-[11px] text-[#8B8F99]">+20 XP за отзыв</span>
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
                <p className="text-xs text-[#8B8F99] flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[#0AC760]" aria-hidden />
                  Жалоба отправлена. Модератор проверит объявление
                </p>
              ) : (
                <button
                  onClick={openComplaint}
                  className="h-11 px-3 text-xs text-[#8B8F99] font-medium flex items-center gap-1.5 rounded-2xl active:bg-[#F0F1F5]"
                >
                  <Flag size={13} aria-hidden /> Пожаловаться на объявление
                </button>
              )}
            </div>
          )}

          {isMine && (
            <div className="px-4 pt-4">
              <div className="rounded-2xl bg-[#F7F8FA] p-3 space-y-2.5">
                <div className="text-xs text-[#5C616B] flex items-center gap-1.5">
                  <PackageCheck size={14} className="text-[#0AC760]" aria-hidden />
                  Это ваше объявление
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={boost}
                    disabled={busy || data.boosted}
                    className="flex-1 h-11 rounded-[12px] bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 active:bg-[#1A1A1A]"
                  >
                    <Zap size={14} aria-hidden /> {data.boosted ? 'Уже продвинуто' : `Продвинуть · ${fmtMoney(149)}`}
                  </button>
                  <button
                    onClick={remove}
                    disabled={busy}
                    className="h-11 px-4 rounded-[12px] bg-[#F0F1F5] text-black text-xs font-semibold disabled:opacity-50 active:bg-[#E6E8ED]"
                  >
                    Снять
                  </button>
                </div>
                <button onClick={onGoSell} className="text-xs text-[#5C616B] font-semibold h-8 flex items-center active:opacity-70">
                  Продать что-то ещё
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ЛИПАЮЩИЙ низ: «Написать» (серая) + «Купить» (чёрная пилюля) */}
      {!isMine && (
        <div className="shrink-0 px-3 py-2.5 border-t border-[#EBEDF0] bg-white pb-[max(10px,env(safe-area-inset-bottom))]">
          {sold ? (
            <div className="w-full h-12 rounded-[12px] bg-[#F0F1F5] text-[#8B8F99] font-bold text-sm flex items-center justify-center gap-2">
              <PackageCheck size={17} aria-hidden /> Продано
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={chat}
                disabled={busy}
                className="h-12 px-5 rounded-[12px] bg-[#F0F1F5] text-black text-[15px] font-bold flex items-center justify-center gap-2 active:bg-[#E6E8ED] disabled:opacity-50"
              >
                <MessageSquare size={17} aria-hidden /> Написать
              </button>
              <button
                onClick={() => { setMode('pickup'); setBuyOpen(true); setMsg('') }}
                disabled={busy || balance < data.price}
                className="flex-1 h-12 rounded-[12px] bg-black text-white text-[15px] font-bold flex items-center justify-center gap-2 active:bg-[#1A1A1A] disabled:opacity-40"
              >
                <ShoppingBag size={17} aria-hidden />
                {data.price === 0 ? 'Забрать даром' : `Купить за ${fmtNum(data.price)} ₽`}
              </button>
            </div>
          )}
        </div>
      )}
      {msg && !buyOpen && <div className="shrink-0 px-4 pb-2 text-xs text-[#D14343]">{msg}</div>}
      {okMsg && !buyOpen && (
        <div className="shrink-0 px-4 pb-2 text-xs text-[#067A47] flex items-center gap-1">
          <PackageCheck size={12} aria-hidden /> {okMsg}
        </div>
      )}

      {/* выбор способа получения */}
      {buyOpen && (
        <div className="absolute inset-0 z-40 bg-black/50 flex items-end" onClick={() => { if (!busy) setBuyOpen(false) }}>
          <div className="bg-white w-full rounded-t-3xl animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
            <div className="pt-3 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-[#EBEDF0]" aria-hidden />
            </div>
            <h3 className="text-base font-bold text-black px-4 pt-2">Как получите товар?</h3>
            <div role="radiogroup" aria-label="Способ получения" className="p-3 space-y-2">
              <button
                role="radio"
                aria-checked={mode === 'pickup'}
                onClick={() => setMode('pickup')}
                disabled={busy}
                className={`w-full text-left rounded-2xl border-2 p-3 flex items-start gap-3 transition-colors disabled:opacity-50 ${
                  mode === 'pickup' ? 'border-black bg-white' : 'border-[#EBEDF0] bg-[#F7F8FA]'
                }`}
              >
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${mode === 'pickup' ? 'border-black' : 'border-[#C4C8CF]'}`} aria-hidden>
                  {mode === 'pickup' && <span className="w-2.5 h-2.5 rounded-full bg-black" />}
                </span>
                <HandCoins size={20} className="text-[#067A47] shrink-0 mt-0.5" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-black">Самовывоз</span>
                    <span className="text-sm font-bold text-black tabular-nums">{data.price === 0 ? 'Даром' : `${fmtNum(data.price)} ₽`}</span>
                  </span>
                  <span className="block text-xs text-[#8B8F99] mt-0.5">Осмотр и торг при встрече</span>
                </span>
              </button>
              <button
                role="radio"
                aria-checked={mode === 'courier'}
                onClick={() => setMode('courier')}
                disabled={busy || data.price === 0}
                className={`w-full text-left rounded-2xl border-2 p-3 flex items-start gap-3 transition-colors disabled:opacity-50 ${
                  mode === 'courier' ? 'border-black bg-white' : 'border-[#EBEDF0] bg-[#F7F8FA]'
                }`}
              >
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${mode === 'courier' ? 'border-black' : 'border-[#C4C8CF]'}`} aria-hidden>
                  {mode === 'courier' && <span className="w-2.5 h-2.5 rounded-full bg-black" />}
                </span>
                <Truck size={20} className="text-[#B25E09] shrink-0 mt-0.5" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-black">Курьер</span>
                    <span className="text-sm font-bold text-black">+{fmtMoney(DELIVERY_FEE)}</span>
                  </span>
                  <span className="block text-xs text-[#8B8F99] mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={11} className="text-[#B25E09] shrink-0" aria-hidden />
                    Без осмотра и торга
                  </span>
                </span>
              </button>
            </div>
            {msg && <div className="px-4 pb-2 text-xs text-[#D14343]">{msg}</div>}
            {busy && <div className="flex justify-center pb-2"><Loader2 size={18} className="animate-spin text-[#8B8F99]" aria-hidden /></div>}
            <div className="p-3 border-t border-[#EBEDF0]">
              <button
                onClick={() => buy(mode === 'courier')}
                disabled={busy || balance < total}
                className="w-full h-12 rounded-[12px] bg-black text-white text-[15px] font-bold flex items-center justify-center gap-2 active:bg-[#1A1A1A] disabled:opacity-40"
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
        <div className="absolute inset-0 z-40 bg-black/50 flex items-end" onClick={() => { if (!complaintBusy) setComplaintOpen(false) }}>
          <div className="bg-white w-full rounded-t-3xl max-h-[86%] overflow-y-auto [scrollbar-width:thin] animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Жалоба на объявление">
            <div className="pt-3 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-[#EBEDF0]" aria-hidden />
            </div>
            <h3 className="text-base font-bold text-black px-4 pt-2">Причина жалобы</h3>
            <p className="text-xs text-[#8B8F99] px-4 pt-1">Модератор проверит объявление и примет решение</p>
            <div role="radiogroup" aria-label="Причина жалобы" className="p-3 space-y-2">
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
                  className={`w-full text-left rounded-2xl border-2 p-3 flex items-center gap-3 transition-colors disabled:opacity-50 ${
                    complaintReason === key ? 'border-black bg-white' : 'border-[#EBEDF0] bg-[#F7F8FA]'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${complaintReason === key ? 'border-black' : 'border-[#C4C8CF]'}`} aria-hidden>
                    {complaintReason === key && <span className="w-2.5 h-2.5 rounded-full bg-black" />}
                  </span>
                  <span className="text-sm font-medium text-black">{label}</span>
                </button>
              ))}
            </div>
            {complaintSent ? (
              <div className="p-3 border-t border-[#EBEDF0] text-sm text-[#067A47] font-semibold flex items-center gap-2">
                <ShieldCheck size={16} aria-hidden /> Жалоба отправлена
              </div>
            ) : (
              <div className="p-3 border-t border-[#EBEDF0]">
                <button
                  onClick={sendComplaint}
                  disabled={complaintBusy}
                  className="w-full h-12 rounded-[12px] bg-black text-white text-[15px] font-bold flex items-center justify-center gap-2 active:bg-[#1A1A1A] disabled:opacity-40"
                >
                  {complaintBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Flag size={16} aria-hidden />}
                  Отправить жалобу
                </button>
              </div>
            )}
            {/* чёрный список: действует мгновенно, объявления скрываются из ленты */}
            {!data.mine && (
              <div className="border-t border-[#EBEDF0] p-3">
                <button
                  onClick={toggleBlockSeller}
                  disabled={blockBusy}
                  className={`w-full h-12 rounded-[12px] text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40 ${
                    sellerBlocked
                      ? 'bg-[#F0F1F5] text-black'
                      : 'bg-[#FDEBEB] text-[#D14343]'
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
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#8B8F99]">
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
    <div className="rounded-2xl bg-[#F7F8FA] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <LineChart size={14} className="text-[#067A47]" aria-hidden />
        <h2 className="text-sm font-semibold text-black">Динамика цен</h2>
        <span
          className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-[10px] ${
            up ? 'bg-[#FDEBEB] text-[#D14343]' : 'bg-[#E6F9EF] text-[#067A47]'
          }`}
        >
          {up ? '+' : ''}
          {delta}% {period}
        </span>
      </div>
      <p className="text-[11px] text-[#8B8F99] mb-2">
        По {ps.length} объявлениям на рынке · min {fmtNum(min)} ₽ / max {fmtNum(max)} ₽
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[72px]" role="img" aria-label={`График цен от ${fmtNum(min)} до ${fmtNum(max)} рублей`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0AC760" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0AC760" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={padY} x2={w - padX} y2={padY} stroke="#000000" strokeOpacity="0.06" strokeWidth="1" strokeDasharray="3 4" />
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="#000000" strokeOpacity="0.06" strokeWidth="1" strokeDasharray="3 4" />
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="#0AC760" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(ps.length - 1)} cy={y(last)} r="3.5" fill="#0AC760" stroke="#FFFFFF" strokeWidth="1.5" />
      </svg>
    </div>
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
      <div className="flex items-center gap-1.5 mb-2 pr-4">
        <h2 className="text-[15px] font-semibold text-black">Похожие объявления</h2>
        <span className="text-[11px] text-[#8B8F99]">{items.length} шт.</span>
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
              className="shrink-0 w-[150px] text-left bg-white rounded-2xl overflow-hidden border border-[#EBEDF0] active:scale-[0.98] transition-transform"
            >
              <div className="relative aspect-[4/3] bg-[#F0F1F5]">
                <img src={s.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                {s.boosted && (
                  <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 backdrop-blur-sm">
                    <Zap size={9} aria-hidden /> ТОП
                  </span>
                )}
                {s.mine && (
                  <span className="absolute top-1.5 right-1.5 bg-white text-black text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
                    Ваше
                  </span>
                )}
              </div>
              <div className="p-2 space-y-1">
                <p className="text-[14px] font-extrabold text-black leading-none tabular-nums">
                  {s.price === 0 ? 'Даром' : `${fmtNum(s.price)} ₽`}
                </p>
                {!equal && currentPrice > 0 && s.price > 0 && (
                  <p className={`text-[10px] font-semibold ${cheaper ? 'text-[#067A47]' : 'text-[#8B8F99]'}`}>
                    {cheaper ? 'дешевле' : 'дороже'} на {Math.abs(diff)}%
                  </p>
                )}
                <p className="text-[10px] text-[#5C616B] truncate">{s.sellerName}</p>
                <p className="text-[10px] text-[#8B8F99] flex items-center gap-0.5">
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
