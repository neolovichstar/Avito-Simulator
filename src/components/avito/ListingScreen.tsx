'use client'

// Страница объявления: карточка товара, продавец, покупка (самовывоз/курьер)
import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft, MapPin, Eye, Star, Truck, HandCoins, MessageSquare, ShoppingBag,
  TrendingUp, Zap, Loader2, PackageCheck, AlertTriangle,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtNum, fmtMoney, timeAgo, initials, hueColor } from '@/lib/format'
import { CATEGORY_LABEL, CONDITION_LABEL } from '@/lib/catalog-types'
import { DELIVERY_FEE } from '@/lib/economy'
import type { ListingDetailData } from '@/lib/types'
import type { SpecItem } from '@/lib/specs'
import { ConditionBadge } from './AvitoApp'

export default function ListingScreen({ id, onBack, onOpenChat, onGoSell }: {
  id: string
  onBack: () => void
  onOpenChat: (chatId: string) => void
  onGoSell: () => void
}) {
  const [data, setData] = useState<(ListingDetailData & { sellerOnline: boolean; sellerRating: number; specs?: SpecItem[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [buyOpen, setBuyOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const session = useOS((s) => s.session)
  const refreshSession = useOS((s) => s.refreshSession)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.listing(id)
      setData(d as ListingDetailData & { sellerOnline: boolean; sellerRating: number; specs?: SpecItem[] })
      setError('')
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

  if (loading && !data) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <Loader2 className="animate-spin text-neutral-300" size={28} />
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="h-full bg-white flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={onBack} className="text-sm font-medium text-[#00AAFF]">Вернуться в ленту</button>
      </div>
    )
  }
  if (!data) return null

  const isMine = data.mine
  const potential = data.price > 0 ? Math.round(((data.baseValue - data.price) / data.price) * 100) : 100

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 px-2 py-2 flex items-center border-b border-black/5">
        <button onClick={onBack} aria-label="Назад" className="w-10 h-10 flex items-center justify-center rounded-full active:bg-neutral-100">
          <ChevronLeft size={22} />
        </button>
        <span className="text-sm font-semibold text-neutral-800 truncate">{CATEGORY_LABEL[data.category] ?? 'Товар'}</span>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="aspect-square bg-neutral-100 relative">
          { }
          <img src={data.image} alt={data.title} className="w-full h-full object-cover" />
          {data.price === 0 && (
            <span className="absolute top-3 left-3 bg-[#04E061] text-white text-xs font-bold px-2 py-1 rounded-lg">Отдам даром</span>
          )}
          {data.boosted && (
            <span className="absolute top-3 right-3 bg-[#965EEB] text-white text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
              <Zap size={12} /> Продвинуто
            </span>
          )}
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-extrabold ${data.price === 0 ? 'text-[#04a94e]' : 'text-neutral-900'}`}>
                {data.price === 0 ? 'Даром' : `${fmtNum(data.price)} ₽`}
              </span>
              {data.price > 0 && data.price < data.baseValue && (
                <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                  <TrendingUp size={12} /> дешевле рынка на {potential}%
                </span>
              )}
            </div>
            <h1 className="text-base font-semibold text-neutral-900 mt-1 leading-snug">{data.title}</h1>
            <div className="flex items-center gap-2 mt-2 text-xs text-neutral-400">
              <MapPin size={12} /> {data.city}
              <span>·</span> {timeAgo(data.createdAt)}
              <span>·</span>
              <span className="flex items-center gap-1"><Eye size={12} /> {data.views}</span>
            </div>
          </div>

          {/* продавец */}
          <div className="flex items-center gap-3 bg-neutral-50 rounded-2xl p-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: hueColor(data.seller.id.length * 47 % 360) }}
            >
              {initials(data.seller.displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-neutral-900 truncate">{data.seller.displayName}</span>
                {data.sellerOnline && <span className="w-2 h-2 rounded-full bg-[#04E061] shrink-0" aria-label="онлайн" />}
              </div>
              <div className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                <Star size={11} className="text-amber-400 fill-amber-400" />
                {data.sellerRating > 0 ? data.sellerRating.toFixed(1) : 'новый'}
                <span>({data.seller.ratingCount})</span>
                <span>· на Авито {timeAgo(data.sellerJoined)}</span>
              </div>
            </div>
          </div>

          {/* характеристики товара */}
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

          {/* описание */}
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 mb-1">Описание</h2>
            <p className="text-sm text-neutral-600 leading-relaxed">{data.description}</p>
            <div className="flex gap-2 mt-3">
              <ConditionBadge condition={data.condition} />
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 font-medium">
                Рынок: ~{fmtNum(data.baseValue)} ₽
              </span>
            </div>
          </div>

          {isMine && (
            <div className="bg-[#f0f7ff] rounded-2xl p-3 space-y-2">
              <div className="text-xs text-neutral-600 flex items-center gap-1.5">
                <PackageCheck size={14} className="text-[#00AAFF]" />
                Это ваше объявление
              </div>
              <div className="flex gap-2">
                <button
                  onClick={boost}
                  disabled={busy || data.boosted}
                  className="flex-1 h-10 rounded-xl bg-[#965EEB] text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Zap size={14} /> {data.boosted ? 'Уже продвинуто' : `Продвинуть · ${fmtMoney(149)}`}
                </button>
                <button
                  onClick={remove}
                  disabled={busy}
                  className="h-10 px-4 rounded-xl bg-neutral-100 text-neutral-500 text-xs font-semibold disabled:opacity-50"
                >
                  Снять
                </button>
              </div>
              <button onClick={onGoSell} className="text-xs text-[#00AAFF] font-medium">
                Продать что-то ещё
              </button>
            </div>
          )}
        </div>
      </div>

      {/* кнопки действия */}
      {!isMine && (
        <div className="shrink-0 p-3 border-t border-black/5 bg-white flex gap-2">
          <button
            onClick={chat}
            disabled={busy}
            className="h-12 px-4 rounded-xl bg-[#00AAFF]/10 text-[#00AAFF] font-semibold text-sm flex items-center gap-2 active:scale-[0.98] transition-transform"
          >
            <MessageSquare size={18} /> Написать
          </button>
          <button
            onClick={() => { setBuyOpen(true); setMsg('') }}
            disabled={busy || (session?.balance ?? 0) < data.price}
            className="flex-1 h-12 rounded-xl bg-[#00AAFF] text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            <ShoppingBag size={18} />
            {data.price === 0 ? 'Забрать даром' : `Купить · ${fmtNum(data.price)} ₽`}
          </button>
        </div>
      )}

      {msg && <div className="shrink-0 px-4 pb-2 -mt-1 text-xs text-red-500">{msg}</div>}
      {okMsg && (
        <div className="shrink-0 px-4 pb-2 -mt-1 text-xs text-green-600 flex items-center gap-1">
          <PackageCheck size={12} /> {okMsg}
        </div>
      )}

      {/* диалог покупки */}
      {buyOpen && (
        <div className="absolute inset-0 z-40 bg-black/40 flex items-end" onClick={() => setBuyOpen(false)}>
          <div className="bg-white w-full rounded-t-3xl p-4 space-y-3 animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-neutral-200 mx-auto" />
            <h3 className="text-base font-bold text-neutral-900">Как получите товар?</h3>
            <button
              onClick={() => buy(false)}
              disabled={busy}
              className="w-full text-left border border-neutral-200 rounded-2xl p-3.5 active:bg-neutral-50 disabled:opacity-50"
            >
              <div className="flex items-center gap-2.5">
                <HandCoins size={20} className="text-[#00AAFF]" />
                <div>
                  <div className="text-sm font-semibold text-neutral-900">Самовывоз</div>
                  <div className="text-xs text-neutral-400 mt-0.5">Осмотрите товар и поторгуйтесь лично. Без доплат</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => buy(true)}
              disabled={busy || data.price === 0}
              className="w-full text-left border border-neutral-200 rounded-2xl p-3.5 active:bg-neutral-50 disabled:opacity-50"
            >
              <div className="flex items-center gap-2.5">
                <Truck size={20} className="text-[#f59e0b]" />
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    Курьер · +{fmtMoney(DELIVERY_FEE)}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={11} className="text-amber-500" />
                    Без осмотра и торга. Возможны скрытые дефекты
                  </div>
                </div>
              </div>
            </button>
            {busy && <div className="flex justify-center py-1"><Loader2 size={18} className="animate-spin text-neutral-300" /></div>}
            {msg && <div className="text-xs text-red-500">{msg}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
