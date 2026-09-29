import Link from 'next/link'
import { SearchX } from 'lucide-react'

// Пользователи Telegram могут попасть по битой ссылке — даём фирменный 404.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-neutral-100">
      <div className="w-full max-w-sm rounded-3xl bg-neutral-900/80 p-6 text-center shadow-2xl ring-1 ring-white/10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800">
          <SearchX className="h-7 w-7 text-neutral-400" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">Такой страницы нет</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Похоже, ссылка устарела или была введена с ошибкой. Игра ждёт тебя на главном экране.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98]"
        >
          Вернуться в игру
        </Link>
      </div>
    </main>
  )
}
