'use client'

// Heads-up уведомления в духе Android 16: КОМПАКТНАЯ тёмная стеклянная карточка
// (иконка приложения + имя + «сейчас» + заголовок + 1–2 строки тела).
// Никаких кнопок на всю ширину: вся карточка тапается → открывает приложение,
// свайп в сторону смахивает, маленький крестик — тоже. Тонкий прогресс-бар
// автозакрытия (4.2с — синхронно с TTL тоста в store).
import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, Gavel, Landmark, MessageSquare, Receipt, ShoppingBag, Trophy, TrendingUp,
  Truck, Crown, X, type LucideIcon,
} from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { openAppForToast } from '@/lib/toast-apps'
import { sound } from '@/lib/sound'

const APP_META: Record<string, { app: string; icon: LucideIcon; bg: string; openApp: AppKey }> = {
  avito: { app: 'Resale', icon: ShoppingBag, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  message: { app: 'Resale', icon: MessageSquare, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  deal: { app: 'Resale', icon: ShoppingBag, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  tax: { app: 'Налоги', icon: Receipt, bg: 'linear-gradient(145deg,#4a5568,#2d3748)', openApp: 'taxes' },
  market: { app: 'Resale', icon: TrendingUp, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  career: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#4ADE80,#065F46)', openApp: 'career' },
  auction: { app: 'Аукцион', icon: Gavel, bg: 'linear-gradient(145deg,#fbbf24,#b45309)', openApp: 'auction' },
  delivery: { app: 'Доставки', icon: Truck, bg: 'linear-gradient(145deg,#34d399,#047857)', openApp: 'delivery' },
  leader: { app: 'Лидеры', icon: Crown, bg: 'linear-gradient(145deg,#fcd34d,#92400e)', openApp: 'leaderboard' },
  bank: { app: 'Банк', icon: Landmark, bg: 'linear-gradient(145deg,#4ADE80,#166534)', openApp: 'bank' },
  system: { app: 'Система', icon: Bell, bg: 'linear-gradient(145deg,#9ca3af,#4b5563)', openApp: 'settings' },
}

// Ключевые слова в теле/заголовке — чтобы тост попадал в своё приложение
function metaFor(title: string, body: string) {
  const s = `${title} ${body}`.toLowerCase()
  // банк: карты, вклады, кредиты, переводы денег — всё, что про деньги на счетах
  if (s.includes('банк') || s.includes('карт') || s.includes('вклад') || s.includes('кредит') || s.includes('доступно') || s.includes('задолженност')) return APP_META.bank
  if (s.includes('налог') || s.includes('фнс')) return APP_META.tax
  // карьера: уровни, задания, достижения, бонусы
  if (s.includes('уровен') || s.includes('задан') || s.includes('достижен') || s.includes('квест') || s.includes('стрик') || s.includes('бонус') || s.includes('опыт')) return APP_META.career
  // аукцион: лоты и ставки
  if (s.includes('аукцион') || s.includes(' лот') || s.includes('ставк') || s.includes('перебит')) return APP_META.auction
  // доставки
  if (s.includes('достав') || s.includes('посылк') || s.includes('курьер')) return APP_META.delivery
  // лидерборды
  if (s.includes('лидер') || s.includes('топ-') || s.includes('рейтинг')) return APP_META.leader
  if (s.includes('счёт') || s.includes('сообщен') || s.includes('чат')) return APP_META.message
  if (s.includes('рынк') || s.includes('цена') || s.includes('событи')) return APP_META.market
  if (s.includes('покуп') || s.includes('продаж') || s.includes('сделк') || s.includes('resale')) return APP_META.deal
  return APP_META.system
}

// Автозакрытие тоста в store — 4200мс; прогресс-бар бежит ровно столько же
const TOAST_TTL_MS = 4200

export default function ToastStack({ variant = 'phone' }: { variant?: 'phone' | 'desktop' }) {
  const toastQueue = useOS((s) => s.toastQueue)
  const dropToast = useOS((s) => s.dropToast)
  const openApp = useOS((s) => s.openApp)
  const suppressClick = useRef(false)

  return (
    <div
      aria-live="polite"
      className={
        variant === 'desktop'
          ? 'pointer-events-none fixed right-4 top-4 z-[70] flex w-96 flex-col gap-2'
          : 'pointer-events-none absolute inset-x-3 top-12 z-50 flex flex-col gap-2'
      }
    >
      {/* Кейфрейм прогресс-бара автозакрытия — один раз на весь стек тостов */}
      <style>{`@keyframes toastbar{from{width:100%}to{width:0%}}`}</style>
      <AnimatePresence initial={false}>
        {toastQueue.map((t) => {
          const meta = metaFor(t.title, t.body)
          const AppIcon = meta.icon
          return (
            <motion.div
              key={t.id}
              layout
              role="button"
              tabIndex={0}
              aria-label={`${meta.app}: ${t.title}. ${t.body}. Нажмите, чтобы открыть ${meta.app}.`}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.55}
              onDragStart={() => {
                suppressClick.current = true
              }}
              onDragEnd={(_e, info) => {
                setTimeout(() => {
                  suppressClick.current = false
                }, 120)
                if (Math.abs(info.offset.x) > 72 || Math.abs(info.velocity.x) > 420) {
                  sound.swipe()
                  dropToast(t.id)
                }
              }}
              onClick={() => {
                if (suppressClick.current) return
                dropToast(t.id)
                openApp(openAppForToast(meta.openApp))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  dropToast(t.id)
                  openApp(openAppForToast(meta.openApp))
                }
              }}
              initial={{ opacity: 0, y: -14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto relative flex cursor-pointer touch-pan-y items-start gap-2.5 overflow-hidden rounded-[20px] bg-neutral-900/80 p-3 pl-3 text-white shadow-[0_16px_44px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.1] backdrop-blur-2xl select-none"
            >
              {/* тайл иконки приложения — цветовой якорь heads-up */}
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-[11px] text-white shadow-sm"
                style={{ background: meta.bg }}
              >
                <AppIcon className="size-4.5" aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-white/50">{meta.app}</p>
                  <span className="shrink-0 text-[10px] text-white/40">сейчас</span>
                </div>
                <p className="truncate text-[13px] font-bold leading-tight">{t.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/70">{t.body}</p>
              </div>

              <button
                type="button"
                aria-label="Закрыть уведомление"
                onClick={(e) => {
                  e.stopPropagation()
                  dropToast(t.id)
                }}
                className="-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-white/50 outline-none transition-colors active:bg-white/15 active:text-white focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>

              {/* Прогресс автозакрытия: 100% → 0 за 4.2с */}
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-full">
                <span
                  className="block h-full bg-white/45"
                  style={{ animation: `toastbar ${TOAST_TTL_MS}ms linear forwards` }}
                />
              </span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
