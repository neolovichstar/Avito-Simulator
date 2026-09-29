'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Глобальная граница ошибок уровня роута: вместо белого экрана — фирменный
// экран с сохранением прогресса. digest помогает сопоставить жалобу с логами.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[resale] runtime error:', error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-neutral-100">
      <div className="w-full max-w-sm rounded-3xl bg-neutral-900/80 p-6 text-center shadow-2xl ring-1 ring-white/10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
          <AlertTriangle className="h-7 w-7 text-red-400" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">Что-то сломалось</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Произошла непредвиденная ошибка. Прогресс сохранён — можно продолжить с того же места.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={reset}
            className="h-11 rounded-full bg-white text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98]"
          >
            Продолжить
          </button>
          <button
            onClick={() => window.location.reload()}
            className="mx-auto flex h-11 items-center gap-2 rounded-full px-4 text-sm text-neutral-400 transition hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Перезагрузить игру
          </button>
        </div>
        {error.digest ? <p className="mt-4 text-[11px] text-neutral-600">Код: {error.digest}</p> : null}
      </div>
    </main>
  )
}
