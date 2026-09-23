'use client'

// Профиль Avito: статистика, мои объявления, инвентарь, отзывы
import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Star, Package, Tag, Zap, Trash2, ChevronLeft, MessageSquareText, Wallet, TrendingUp,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useOS } from '@/lib/store'
import { fmtNum, fmtMoney, timeAgo, initials, hueColor } from '@/lib/format'
import type { ProfileData, FeedListing, InventoryItemDTO } from '@/lib/types'
import { ListingCard } from './FeedScreen'
import { ConditionBadge } from './AvitoApp'

export default function ProfileScreen({ onOpenListing, onGoSell }: {
  onOpenListing: (id: string) => void
  onGoSell: () => void
}) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [items, setItems] = useState<InventoryItemDTO[]>([])
  const [myListings, setMyListings] = useState<FeedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subTab, setSubTab] = useState<'listings' | 'inventory'>('listings')
  const [busy, setBusy] = useState('')
  const refreshSession = useOS((s) => s.refreshSession)

  const load = useCallback(async () => {
    try {
      const [profile, inv, feed] = await Promise.all([
        api.profile(), api.inventory(), api.feed({ mine: true, limit: 30 }),
      ])
      setData(profile)
      setItems(inv.items)
      setMyListings(feed.items)
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const boost = async (id: string) => {
    setBusy(id)
    try {
      const res = await api.boostListing(id)
      refreshSession({ balance: res.balance })
      await load()
    } catch { /* toast? */ } finally { setBusy('') }
  }
  const remove = async (id: string) => {
    setBusy(id)
    try {
      await api.removeListing(id)
      await load()
    } catch { /* ignore */ } finally { setBusy('') }
  }

  if (loading && !data) {
    return (
      <div className="h-full bg-[#f4f5f7] flex items-center justify-center">
        <Loader2 className="animate-spin text-neutral-300" size={28} />
      </div>
    )
  }
  if (error && !data) {
    return <div className="p-6 text-sm text-red-500 text-center">{error}</div>
  }
  if (!data) return null

  const rating = data.rating

  return (
    <div className="h-full overflow-y-auto [scrollbar-width:thin] bg-[#f4f5f7]">
      {/* карточка профиля */}
      <div className="bg-white p-4 border-b border-black/5">
        <div className="flex items-center gap-3">
          {data.user.photoUrl ? (
             
            <img src={data.user.photoUrl} alt={data.user.displayName} className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{ background: hueColor(205) }}
            >
              {initials(data.user.displayName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-neutral-900 truncate">{data.user.displayName}</p>
            <p className="text-xs text-neutral-400">{data.user.username} · {data.user.city}</p>
            <div className="flex items-center gap-1 mt-1">
              <Star size={13} className="text-amber-400 fill-amber-400" />
              <span className="text-sm font-semibold text-neutral-800">
                {rating > 0 ? rating.toFixed(1) : '—'}
              </span>
              <span className="text-xs text-neutral-400">({data.user.ratingCount})</span>
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold">
                {data.user.level} ур.
              </span>
            </div>
          </div>
        </div>
        {data.user.bio && <p className="text-xs text-neutral-500 mt-2.5">{data.user.bio}</p>}

        <div className="grid grid-cols-3 gap-2 mt-3">
          <StatCard icon={Wallet} label="Баланс" value={fmtMoney(data.user.balance)} />
          <StatCard icon={TrendingUp} label="Сделок" value={String(data.soldCount)} />
          <StatCard icon={Package} label="Склад" value={fmtMoney(data.inventoryValue)} />
        </div>
      </div>

      {/* переключатель */}
      <div className="flex gap-2 p-3 sticky top-0 z-10 bg-[#f4f5f7]">
        <button
          onClick={() => setSubTab('listings')}
          className={`flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
            subTab === 'listings' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'
          }`}
        >
          <Tag size={13} /> Объявления ({myListings.length})
        </button>
        <button
          onClick={() => setSubTab('inventory')}
          className={`flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
            subTab === 'inventory' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500'
          }`}
        >
          <Package size={13} /> Инвентарь ({items.length})
        </button>
      </div>

      <div className="px-3 pb-4">
        {subTab === 'listings' ? (
          myListings.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <p className="text-sm text-neutral-500">Нет активных объявлений</p>
              <button onClick={onGoSell} className="mt-2 text-xs font-semibold text-[#00AAFF]">
                Выставить вещь из инвентаря
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {myListings.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl p-3">
                  <button onClick={() => onOpenListing(l.id)} className="w-full flex gap-3 text-left">
                    { }
                    <img src={l.image} alt={l.title} className="w-16 h-16 rounded-xl object-cover bg-neutral-100 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{l.title}</p>
                      <p className="text-sm font-bold text-neutral-900 mt-0.5">{l.price === 0 ? 'Даром' : `${fmtNum(l.price)} ₽`}</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-1">
                        <MessageSquareText size={10} /> {l.views} просмотров
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => boost(l.id)}
                      disabled={busy === l.id || l.boosted}
                      className="flex-1 h-8 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <Zap size={11} /> {l.boosted ? 'Продвинуто' : 'Продвинуть'}
                    </button>
                    <button
                      onClick={() => remove(l.id)}
                      disabled={busy === l.id}
                      className="h-8 px-3 rounded-lg bg-red-50 text-red-500 text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 size={11} /> Снять
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-sm text-neutral-500">Инвентарь пуст</p>
            <p className="text-xs text-neutral-400 mt-1">Купите товары на главной — или ловите «Отдам даром»</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((i) => {
              const profit = i.estValue - i.purchasePrice
              return (
                <div key={i.id} className="bg-white rounded-2xl p-3 flex gap-3">
                  { }
                  <img src={i.image} alt={i.title} className="w-16 h-16 rounded-xl object-cover bg-neutral-100 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{i.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <ConditionBadge condition={i.condition} />
                      {i.listed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00AAFF]/10 text-[#00AAFF] font-bold">ВЫСТАВЛЕНО</span>}
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      за {fmtNum(i.purchasePrice)} ₽ · рынок ~{fmtNum(i.estValue)} ₽
                    </p>
                    {profit !== 0 && (
                      <p className={`text-[11px] font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {profit >= 0 ? '+' : ''}{fmtNum(profit)} ₽
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* отзывы */}
        {data.reviews.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold text-neutral-900 mb-2 px-1">Отзывы</h3>
            <div className="space-y-2">
              {data.reviews.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-neutral-800">{r.from}</span>
                    <span className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={10} className={i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-neutral-200'} />
                      ))}
                    </span>
                    <span className="text-[10px] text-neutral-300 ml-auto">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-1">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="bg-[#f4f5f7] rounded-xl p-2.5">
      <div className="flex items-center gap-1 text-neutral-400">
        <Icon size={11} />
        <span className="text-[9px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xs font-bold text-neutral-900 mt-1 truncate">{value}</p>
    </div>
  )
}
