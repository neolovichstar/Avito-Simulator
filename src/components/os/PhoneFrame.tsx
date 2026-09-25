'use client'

// Рамка смартфона: на десктопе — чёрный бевел по центру экрана, на мобиле — во
// весь экран. Полировка Android 16: бевел с внутренним кантом, боковые кнопки
// питания/громкости и лёгкий блик на стекле экрана.
export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full select-none items-center justify-center bg-[radial-gradient(circle_at_25%_15%,rgba(16,185,129,0.25),transparent_55%),radial-gradient(circle_at_75%_80%,rgba(21,128,61,0.22),transparent_50%),linear-gradient(165deg,#0a1712_0%,#060d0a_55%,#020704_100%)] max-[500px]:items-stretch max-[500px]:bg-none">
      <div className="relative rounded-[3rem] bg-black p-3 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.09),inset_0_1px_1px_rgba(255,255,255,0.14)] max-[500px]:h-[100dvh] max-[500px]:w-full max-[500px]:rounded-none max-[500px]:p-0 max-[500px]:shadow-none">
        {/* боковые кнопки: качелька громкости слева, питание справа (только десктоп) */}
        <span
          aria-hidden="true"
          className="absolute -left-[3px] top-[150px] h-[88px] w-[3px] rounded-l-md bg-[#181d1a] ring-1 ring-white/10 max-[500px]:hidden"
        />
        <span
          aria-hidden="true"
          className="absolute -right-[3px] top-[196px] h-[56px] w-[3px] rounded-r-md bg-[#181d1a] ring-1 ring-white/10 max-[500px]:hidden"
        />
        <div className="relative h-[844px] w-[390px] overflow-hidden rounded-[2.4rem] bg-black ring-1 ring-white/[0.06] max-[500px]:h-full max-[500px]:w-full max-[500px]:rounded-none max-[500px]:ring-0">
          {children}
          {/* Punch-hole камера */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-2 z-50 h-3 w-3 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/15"
          />
          {/* лёгкий блик стекла — диагональный, едва заметный */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[80] bg-[linear-gradient(115deg,rgba(255,255,255,0.05)_0%,transparent_28%,transparent_72%,rgba(255,255,255,0.03)_100%)]"
          />
        </div>
      </div>
    </div>
  )
}
