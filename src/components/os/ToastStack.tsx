'use client'

// Всплывающие уведомления как в настоящем телефоне (heads-up):
// иконка и имя приложения, заголовок, текст. Тап по заголовку открывает приложение.
import { Bell, MessageSquare, Receipt, ShoppingBag, TrendingUp, X, type LucideIcon } from 'lucide-react'
import { useOS, type AppKey } from '@/lib/store'
import { openAppForToast } from '@/lib/toast-apps'

const APP_META: Record<string, { app: string; icon: LucideIcon; bg: string; openApp: AppKey }> = {
  avito: { app: 'Avito', icon: ShoppingBag, bg: 'linear-gradient(145deg,#35c3ff,#0091d5)', openApp: 'avito' },
  message: { app: 'Avito', icon: MessageSquare, bg: 'linear-gradient(145deg,#35c3ff,#0091d5)', openApp: 'avito' },
  deal: { app: 'Avito', icon: ShoppingBag, bg: 'linear-gradient(145deg,#35c3ff,#0091d5)', openApp: 'avito' },
  tax: { app: 'Налоги', icon: Receipt, bg: 'linear-gradient(145deg,#4a5568,#2d3748)', openApp: 'taxes' },
  market: { app: 'Avito', icon: TrendingUp, bg: 'linear-gradient(145deg,#35c3ff,#0091d5)', openApp: 'avito' },
  system: { app: 'Система', icon: Bell, bg: 'linear-gradient(145deg,#9ca3af,#4b5563)', openApp: 'settings' },
}

// Ключевые слова в теле/заголовке — чтобы тост попадал в своё приложение
function metaFor(title: string, body: string) {
  const s = `${title} ${body}`.toLowerCase()
  if (s.includes('счёт') || s.includes('сообщен') || s.includes('чат')) return APP_META.message
  if (s.includes('налог') || s.includes('фнс')) return APP_META.tax
  if (s.includes('рынк') || s.includes('цена') || s.includes('событи') || s.includes('аукцион')) return APP_META.market
  if (s.includes('покуп') || s.includes('продаж') || s.includes('сделк') || s.includes('avito')) return APP_META.deal
  return APP_META.system
}

export default function ToastStack() {
  const toastQueue = useOS((s) => s.toastQueue)
  const dropToast = useOS((s) => s.dropToast)
  const openApp = useOS((s) => s.openApp)

  if (toastQueue.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-3 top-12 z-50 flex flex-col gap-2"
    >
      {toastQueue.map((t) => {
        const meta = metaFor(t.title, t.body)
        const AppIcon = meta.icon
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-neutral-900/95 p-3.5 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl animate-in fade-in slide-in-from-top-3 duration-300"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-[0.7rem] text-white shadow-sm"
              style={{ background: meta.bg }}
            >
              <AppIcon className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{meta.app}</p>
              <p className="truncate text-[13px] font-bold leading-tight">{t.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/70">{t.body}</p>
              <button
                type="button"
                aria-label={`Открыть ${meta.app}`}
                onClick={() => {
                  dropToast(t.id)
                  openApp(openAppForToast(meta.openApp))
                }}
                className="mt-1.5 h-7 rounded-full bg-white/10 px-3 text-[11px] font-semibold text-sky-300 outline-none transition-colors active:bg-white/20 focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                Открыть {meta.app}
              </button>
            </div>
            <button
              type="button"
              aria-label="Закрыть уведомление"
              onClick={() => dropToast(t.id)}
              className="rounded-full p-1 text-white/60 outline-none transition-colors hover:text-white active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
