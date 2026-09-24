'use client'

// Страница объявления: большое фото, продавец, покупка (самовывоз/курьер — радио-карточки)
import { useCallback, useEffect, useId, useState } from 'react'
import {
  ChevronLeft, MapPin, Eye, Star, Truck, HandCoins, MessageSquare, ShoppingBag,
  TrendingDown, Zap, Loader2, PackageCheck, AlertTriangle, Clock, BadgeCheck, PenLine,
  Flag, LineChart, ShieldCheck, ChevronRight,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtNum, fmtMoney, timeAgo, initials, hueColor } from '@/lib/format'
import { CATEGORY_LABEL } from '@/lib/catalog-types'
import { DELIVERY_FEE } from '@/lib/economy'
import type { ListingDetailData, PricePointDTO } from '@/lib/types'
import type { SpecItem } from '@/lib/specs'
import { ConditionBadge } from './AvitoApp'

export default function ListingScreen({ id, onBack, onOpenChat, onOpenSeller, onGoSell }: {
  id: string
  onBack: () => void
  onOpenChat: (chatId: string) => void
  onOpenSeller?: (sellerId: string) => void
  onGoSell: () => void
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
  const session = useOS((s) => s.session)
  const pushToast = useOS((s) => s.pushToast)
  const refreshSession = useOS((s) => s.refreshSession)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.listing(id)
      setData(d as ListingDetailData & { sellerOnline: boolean; sellerRating: number; specs?: SpecItem[] })
      setError('')
      // отзывы о продавце — вторым запросом, не блокируя карточку
      api.userReviews(d.seller.id).then((r) => setSellerReviews(r.items)).catch(() => setSellerReviews([]))
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
      refreshSession({ balance: res.balance })
      setBuyOpen(false)
      setOkMsg(courier ? 'Курьер уже забирает товар — следите в приложении Доставки' : 'Товар ваш! Проверьте инвентарь в профиле')
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
      pushToast('Avito', 'Жалоба отправлена модератору')
      setTimeout(() => setComplaintOpen(false), 900)
    } catch (e) {
      pushToast('Avito', e instanceof ApiError ? e.message : 'Не удалось отправить жалобу')
    } finally {
      setComplaintBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="h-full bg-white flex flex-col">
        <div className="shrink-0 px-2 py-2 flex items-center border-b border-black/5">
          <div className="w-11 h-11" />
        </div>
        <div className="flex-1 p-3 space-y-3 animate-pulse">
          <div className="aspect-[4/3] rounded-2xl bg-neutral-100" />
          <div className="h-7 bg-neutral-100 rounded-lg w-1/2" />
          <div className="h-4 bg-neutral-100 rounded w-3/4" />
          <div className="h-4 bg-neutral-100 rounded w-1/3" />
          <div className="h-[76px] bg-neutral-100 rounded-2xl" />
        </div>
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="h-full bg-white flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={onBack} className="h-11 px-4 text-sm font-semibold text-[#00AAFF]">Вернуться в ленту</button>
      </div>
    )
  }
  if (!data) return null

  const isMine = data.mine
  const sold = data.status === 'sold'
  const total = mode === 'courier' ? data.price + DELIVERY_FEE : data.price
  const balance = session?.balance ?? 0
  const longDesc = data.description.length > 120
  const joined = data.sellerJoined ? new Date(data.sellerJoined).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''

  return (
    <div className="h-full flex flex-col bg-white relative">
      <div className="shrink-0 px-2 py-2 flex items-center border-b border-black/5">
        <button onClick={onBack} aria-label="Назад" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-neutral-100">
          <ChevronLeft size={22} aria-hidden />
        </button>
        <span className="text-sm font-semibold text-neutral-800 truncate">{CATEGORY_LABEL[data.category] ?? 'Товар'}</span>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="p-3 space-y-4">
          {/* фото */}
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-neutral-100">
            <img src={data.image} alt={data.title} className={`w-full h-full object-cover ${sold ? 'opacity-75 saturate-50' : ''}`} />
            {data.price === 0 && (
              <span className="absolute top-3 left-3 bg-[#04E061] text-white text-xs font-bold px-2 py-1 rounded-lg">Отдам даром</span>
            )}
            {data.boosted && (
              <span className="absolute top-3 right-3 bg-[#965EEB] text-white text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                <Zap size={12} aria-hidden /> ТОП
              </span>
            )}
            {sold && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/25" aria-hidden>
                <span className="bg-white/95 text-neutral-900 font-extrabold text-lg px-5 py-2.5 rounded-2xl shadow-lg">Продано</span>
              </div>
            )}
          </div>

          {/* цена, название, метрики */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-3xl font-extrabold tracking-tight ${data.price === 0 ? 'text-[#04a94e]' : 'text-neutral-900'}`}>
                {data.price === 0 ? 'Даром' : `${fmtNum(data.price)} ₽`}
              </span>
              {data.price > 0 && data.marginHint > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                  <TrendingDown size={12} aria-hidden /> Дешевле рынка на {data.marginHint}%
                </span>
              )}
            </div>
            <h1 className="text-base font-semibold text-neutral-900 leading-snug">{data.title}</h1>
            <div className="flex items-center gap-2">
              <ConditionBadge condition={data.condition} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 pt-0.5">
              <MapPin size={12} aria-hidden /> {data.city}
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1"><Eye size={12} aria-hidden /> {data.views}</span>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1"><Clock size={12} aria-hidden /> {timeAgo(data.createdAt)}</span>
            </div>
          </div>

          {/* продавец — тап открывает страницу продавца */}
          <div className="bg-neutral-50 rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onOpenSeller?.(data.seller.id)}
                disabled={!onOpenSeller}
                className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-xl active:opacity-80 transition-opacity disabled:cursor-default"
                aria-label={`Все объявления продавца ${data.seller.displayName}`}
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: hueColor(data.seller.id.length * 47 % 360) }}
                  aria-hidden
                >
                  {initials(data.seller.displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-neutral-900 truncate">{data.seller.displayName}</span>
                    {data.sellerOnline && <span className="w-2 h-2 rounded-full bg-[#04E061] shrink-0" aria-label="Продавец онлайн" />}
                  </div>
                  <div className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                    <Star size={11} className="text-amber-400 fill-amber-400" aria-hidden />
                    {data.sellerRating > 0 ? Math.min(5, data.sellerRating).toFixed(1) : 'новый'}
                    <span>({data.seller.ratingCount})</span>
                  </div>
                </div>
              </button>
              <button
                onClick={chat}
                disabled={busy}
                className="h-11 px-4 rounded-2xl bg-[#00AAFF]/10 text-[#00AAFF] font-semibold text-sm flex items-center gap-1.5 shrink-0 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                <MessageSquare size={16} aria-hidden /> Написать
              </button>
            </div>
            {joined && (
              <div className="flex items-center gap-1 text-[11px] text-neutral-400 pt-2 border-t border-black/5">
                <BadgeCheck size={12} className="text-[#00AAFF]" aria-hidden />
                На Авито с {joined}
              </div>
            )}
            {onOpenSeller && (
              <button
                onClick={() => onOpenSeller(data.seller.id)}
                className="w-full flex items-center justify-between text-[11px] font-medium text-[#00AAFF] active:opacity-70"
              >
                <span>Все объявления продавца</span>
                <ChevronRight size={12} aria-hidden />
              </button>
            )}
          </div>

          {/* отзывы о продавце */}
          {sellerReviews && sellerReviews.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 mb-2">Отзывы о продавце</h2>
              <div className="space-y-2">
                {sellerReviews.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-neutral-100 p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-neutral-800 truncate">{r.from}</span>
                      <span className="flex gap-0.5" aria-label={`Оценка ${r.rating} из 5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={10} className={i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-neutral-200'} aria-hidden />
                        ))}
                      </span>
                      <span className="text-[10px] text-neutral-300 ml-auto shrink-0">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.text}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5 truncate">{r.listing}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* динамика цен на этот товар */}
          {data.priceHistory && data.priceHistory.filter((p) => p.price > 0).length >= 2 && (
            <PriceHistoryCard points={data.priceHistory} />
          )}

          {/* характеристики */}
          {data.specs && data.specs.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 mb-2">Характеристики</h2>
              <div className="rounded-2xl border border-neutral-100 divide-y divide-neutral-100">
                {data.specs.map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-neutral-400">{s.label}</span>
                    <span className="text-xs font-semibold text-neutral-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* описание — максимум 4 строки */}
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 mb-1">Описание</h2>
            <p className={`text-sm text-neutral-600 leading-relaxed ${!showDesc && longDesc ? 'line-clamp-4' : ''}`}>{data.description}</p>
            {longDesc && (
              <button
                onClick={() => setShowDesc((s) => !s)}
                aria-expanded={showDesc}
                className="text-sm font-semibold text-[#00AAFF] mt-1.5"
              >
                {showDesc ? 'Свернуть' : 'Показать полностью'}
              </button>
            )}
          </div>

          {/* отзыв о сделке */}
          {sold && data.purchasedByMe && (
            <div className="bg-[#fffbe8] rounded-2xl p-3 space-y-2.5">
              <div className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                <PenLine size={14} className="text-amber-500" aria-hidden />
                Оцените сделку
              </div>
              {data.reviewedByMe || revSent ? (
                <p className="text-xs text-neutral-500 flex items-center gap-1.5">
                  <BadgeCheck size={14} className="text-green-600" aria-hidden />
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
                        <Star size={26} className={(revHover || revStars) >= n ? 'text-amber-400 fill-amber-400' : 'text-neutral-300'} aria-hidden />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={revText}
                    onChange={(e) => setRevText(e.target.value)}
                    placeholder="Расскажите, как прошла сделка (необязательно)"
                    rows={2}
                    maxLength={300}
                    className="w-full rounded-xl border border-black/10 bg-white p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
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
                      className="h-11 px-5 rounded-2xl bg-amber-400 text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                      Отправить
                    </button>
                    <span className="text-[11px] text-neutral-400">+20 XP за отзыв</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* жалоба на объявление */}
          {!isMine && !sold && (
            <div className="pt-1">
              {complaintSent ? (
                <p className="text-xs text-neutral-400 flex items-center gap-1.5 px-1">
                  <ShieldCheck size={13} className="text-green-600" aria-hidden />
                  Жалоба отправлена. Модератор проверит объявление
                </p>
              ) : (
                <button
                  onClick={openComplaint}
                  className="h-11 px-3 text-xs text-neutral-400 font-medium flex items-center gap-1.5 rounded-2xl active:bg-neutral-100"
                >
                  <Flag size={13} aria-hidden /> Пожаловаться на объявление
                </button>
              )}
            </div>
          )}

          {isMine && (
            <div className="bg-[#f0f7ff] rounded-2xl p-3 space-y-2.5">
              <div className="text-xs text-neutral-600 flex items-center gap-1.5">
                <PackageCheck size={14} className="text-[#00AAFF]" aria-hidden />
                Это ваше объявление
              </div>
              <div className="flex gap-2">
                <button
                  onClick={boost}
                  disabled={busy || data.boosted}
                  className="flex-1 h-11 rounded-2xl bg-[#965EEB] text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Zap size={14} aria-hidden /> {data.boosted ? 'Уже продвинуто' : `Продвинуть · ${fmtMoney(149)}`}
                </button>
                <button
                  onClick={remove}
                  disabled={busy}
                  className="h-11 px-4 rounded-2xl bg-white text-neutral-500 text-xs font-semibold disabled:opacity-50"
                >
                  Снять
                </button>
              </div>
              <button onClick={onGoSell} className="text-xs text-[#00AAFF] font-semibold h-11 flex items-center">
                Продать что-то ещё
              </button>
            </div>
          )}
        </div>
      </div>

      {/* покупка — sticky bottom */}
      {!isMine && (
        <div className="shrink-0 p-3 border-t border-black/5 bg-white/95 backdrop-blur">
          {sold ? (
            <div className="w-full h-11 rounded-2xl bg-neutral-100 text-neutral-400 font-bold text-sm flex items-center justify-center gap-2">
              <PackageCheck size={17} aria-hidden /> Продано
            </div>
          ) : (
            <button
              onClick={() => { setMode('pickup'); setBuyOpen(true); setMsg('') }}
              disabled={busy || balance < data.price}
              className="w-full h-11 rounded-2xl bg-[#00AAFF] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
            >
              <ShoppingBag size={17} aria-hidden />
              {data.price === 0 ? 'Забрать даром' : `Купить за ${fmtNum(data.price)} ₽`}
            </button>
          )}
        </div>
      )}
      {msg && !buyOpen && <div className="shrink-0 px-4 pb-2 text-xs text-red-500">{msg}</div>}
      {okMsg && !buyOpen && (
        <div className="shrink-0 px-4 pb-2 text-xs text-green-600 flex items-center gap-1">
          <PackageCheck size={12} aria-hidden /> {okMsg}
        </div>
      )}

      {/* выбор способа получения */}
      {buyOpen && (
        <div className="absolute inset-0 z-40 bg-black/40 flex items-end" onClick={() => { if (!busy) setBuyOpen(false) }}>
          <div className="bg-white w-full rounded-t-3xl animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
            <div className="pt-3 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-neutral-200" aria-hidden />
            </div>
            <h3 className="text-base font-bold text-neutral-900 px-4 pt-2">Как получите товар?</h3>
            <div role="radiogroup" aria-label="Способ получения" className="p-3 space-y-2">
              <button
                role="radio"
                aria-checked={mode === 'pickup'}
                onClick={() => setMode('pickup')}
                disabled={busy}
                className={`w-full text-left rounded-2xl border-2 p-3 flex items-start gap-3 transition-colors disabled:opacity-50 ${
                  mode === 'pickup' ? 'border-[#00AAFF] bg-[#00AAFF]/5' : 'border-neutral-200'
                }`}
              >
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${mode === 'pickup' ? 'border-[#00AAFF]' : 'border-neutral-300'}`} aria-hidden>
                  {mode === 'pickup' && <span className="w-2.5 h-2.5 rounded-full bg-[#00AAFF]" />}
                </span>
                <HandCoins size={20} className="text-[#00AAFF] shrink-0 mt-0.5" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-neutral-900">Самовывоз</span>
                    <span className="text-sm font-bold text-neutral-900">{data.price === 0 ? 'Даром' : `${fmtNum(data.price)} ₽`}</span>
                  </span>
                  <span className="block text-xs text-neutral-400 mt-0.5">Осмотр и торг при встрече</span>
                </span>
              </button>
              <button
                role="radio"
                aria-checked={mode === 'courier'}
                onClick={() => setMode('courier')}
                disabled={busy || data.price === 0}
                className={`w-full text-left rounded-2xl border-2 p-3 flex items-start gap-3 transition-colors disabled:opacity-50 ${
                  mode === 'courier' ? 'border-[#00AAFF] bg-[#00AAFF]/5' : 'border-neutral-200'
                }`}
              >
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${mode === 'courier' ? 'border-[#00AAFF]' : 'border-neutral-300'}`} aria-hidden>
                  {mode === 'courier' && <span className="w-2.5 h-2.5 rounded-full bg-[#00AAFF]" />}
                </span>
                <Truck size={20} className="text-amber-500 shrink-0 mt-0.5" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-neutral-900">Курьер</span>
                    <span className="text-sm font-bold text-neutral-900">+{fmtMoney(DELIVERY_FEE)}</span>
                  </span>
                  <span className="block text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={11} className="text-amber-500 shrink-0" aria-hidden />
                    Без осмотра и торга
                  </span>
                </span>
              </button>
            </div>
            {msg && <div className="px-4 pb-2 text-xs text-red-500">{msg}</div>}
            {busy && <div className="flex justify-center pb-2"><Loader2 size={18} className="animate-spin text-neutral-300" aria-hidden /></div>}
            <div className="p-3 border-t border-black/5">
              <button
                onClick={() => buy(mode === 'courier')}
                disabled={busy || balance < total}
                className="w-full h-11 rounded-2xl bg-[#00AAFF] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
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
        <div className="absolute inset-0 z-40 bg-black/40 flex items-end" onClick={() => { if (!complaintBusy) setComplaintOpen(false) }}>
          <div className="bg-white w-full rounded-t-3xl animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Жалоба на объявление">
            <div className="pt-3 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-neutral-200" aria-hidden />
            </div>
            <h3 className="text-base font-bold text-neutral-900 px-4 pt-2">Причина жалобы</h3>
            <p className="text-xs text-neutral-400 px-4 pt-1">Модератор проверит объявление и примет решение</p>
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
                    complaintReason === key ? 'border-[#00AAFF] bg-[#00AAFF]/5' : 'border-neutral-200'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${complaintReason === key ? 'border-[#00AAFF]' : 'border-neutral-300'}`} aria-hidden>
                    {complaintReason === key && <span className="w-2.5 h-2.5 rounded-full bg-[#00AAFF]" />}
                  </span>
                  <span className="text-sm font-medium text-neutral-800">{label}</span>
                </button>
              ))}
            </div>
            {complaintSent ? (
              <div className="p-3 border-t border-black/5 text-sm text-green-600 font-semibold flex items-center gap-2">
                <ShieldCheck size={16} aria-hidden /> Жалоба отправлена
              </div>
            ) : (
              <div className="p-3 border-t border-black/5">
                <button
                  onClick={sendComplaint}
                  disabled={complaintBusy}
                  className="w-full h-11 rounded-2xl bg-[#00AAFF] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
                >
                  {complaintBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Flag size={16} aria-hidden />}
                  Отправить жалобу
                </button>
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
    <div className="rounded-2xl border border-neutral-100 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <LineChart size={14} className="text-[#00AAFF]" aria-hidden />
        <h2 className="text-sm font-semibold text-neutral-900">Динамика цен</h2>
        <span
          className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-lg ${
            up ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
          }`}
        >
          {up ? '+' : ''}
          {delta}% {period}
        </span>
      </div>
      <p className="text-[11px] text-neutral-400 mb-2">
        По {ps.length} объявлениям на рынке · min {fmtNum(min)} ₽ / max {fmtNum(max)} ₽
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[72px]" role="img" aria-label={`График цен от ${fmtNum(min)} до ${fmtNum(max)} рублей`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00AAFF" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#00AAFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={padY} x2={w - padX} y2={padY} stroke="#f0f1f3" strokeWidth="1" strokeDasharray="3 4" />
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="#f0f1f3" strokeWidth="1" strokeDasharray="3 4" />
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="#00AAFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(ps.length - 1)} cy={y(last)} r="3.5" fill="#00AAFF" stroke="white" strokeWidth="1.5" />
      </svg>
    </div>
  )
}
