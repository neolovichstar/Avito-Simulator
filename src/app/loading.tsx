// Плашка на время холодного старта serverless-функции: вместо белого
// экрана — мгновенный фирменный сплэш в тон игры.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="flex animate-pulse flex-col items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-white/10 shadow-inner ring-1 ring-white/10" />
        <p className="text-sm text-neutral-500">Resale загружается…</p>
      </div>
    </div>
  )
}
