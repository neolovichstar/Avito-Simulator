'use client'

import { X } from 'lucide-react'
import { useOS } from '@/lib/store'

export default function ToastStack() {
  const toastQueue = useOS((s) => s.toastQueue)
  const dropToast = useOS((s) => s.dropToast)

  if (toastQueue.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-20 z-50 flex flex-col gap-2"
    >
      {toastQueue.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-xl bg-gray-900/95 p-3 text-white shadow-lg ring-1 ring-white/10 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.title}</p>
            <p className="mt-0.5 text-xs text-white/70">{t.body}</p>
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
      ))}
    </div>
  )
}
