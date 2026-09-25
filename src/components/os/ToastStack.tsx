'use client'

// Всплывающие уведомления как в настоящем телефоне (heads-up):
// иконка и имя приложения, заголовок, текст, время «сейчас» и тонкий прогресс-
// бар автозакрытия (4.2с — синхронно с TTL тоста в store). Цветная полоска слева
// подсказывает, из какого приложения уведомление. Тап по кнопке открывает его.
import { Bell, Gavel, MessageSquare, Receipt, ShoppingBag, Trophy, TrendingUp, Truck, Crown, X, type LucideIcon } from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { openAppForToast } from '@/lib/toast-apps'

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
  system: { app: 'Система', icon: Bell, bg: 'linear-gradient(145deg,#9ca3af,#4b5563)', openApp: 'settings' },
}

// Ключевые слова в теле/заголовке — чтобы тост попадал в своё приложение
function metaFor(title: string, body: string) {
  const s = `${title} ${body}`.toLowerCase()
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
  if (s.includes('покуп') || s.includes('продаж') || s.includes('сделк') || s.includes('avito')) return APP_META.deal
  return APP_META.system
}

// Автозакрытие тоста в store — 4200мс; прогресс-бар бежит ровно столько же
const TOAST_TTL_MS = 4200

export default function ToastStack({ variant = 'phone' }: { variant?: 'phone' | 'desktop' }) {
  const toastQueue = useOS((s) => s.toastQueue)
  const dropToast = useOS((s) => s.dropToast)
  const openApp = useOS((s) => s.openApp)

  if (toastQueue.length === 0) return null

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
      {toastQueue.map((t) => {
        const meta = metaFor(t.title, t.body)
        const AppIcon = meta.icon
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-[22px] bg-neutral-900/95 p-3.5 text-white shadow-[0_18px_45px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-xl animate-in fade-in slide-in-from-top-3 zoom-in-[98%] duration-300"
          >
            {/* Цветной акцент слева — цвет приложения, как на реальных heads-up */}
            <span
              aria-hidden="true"
              className="absolute inset-y-2 left-0 w-1 rounded-full"
              style={{ background: meta.bg }}
            />
            <span
              className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-[0.7rem] text-white shadow-sm"
              style={{ background: meta.bg }}
            >
              <AppIcon className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{meta.app}</p>
                <span className="shrink-0 text-[11px] text-white/40">сейчас</span>
              </div>
              <p className="truncate text-[13px] font-bold leading-tight">{t.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/70">{t.body}</p>
              <button
                type="button"
                aria-label={`Открыть ${meta.app}`}
                onClick={() => {
                  dropToast(t.id)
                  openApp(openAppForToast(meta.openApp))
                }}
                className="mt-1.5 flex min-h-[44px] items-center rounded-full bg-white/10 px-4 text-xs font-semibold text-emerald-300 outline-none transition-colors active:bg-white/20 focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Открыть {meta.app}
              </button>
            </div>
            <button
              type="button"
              aria-label="Закрыть уведомление"
              onClick={() => dropToast(t.id)}
              className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 outline-none transition-colors hover:text-white active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {/* Прогресс автозакрытия: 100% → 0 за 4.2с */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10"
            >
              <span
                className="block h-full bg-white/50"
                style={{ animation: `toastbar ${TOAST_TTL_MS}ms linear forwards` }}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}
