'use client'

// Рамка смартфона: на десктопе — чёрный бевел по центру экрана, на мобиле — во весь экран.
export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full select-none items-center justify-center bg-[radial-gradient(circle_at_25%_15%,rgba(16,185,129,0.25),transparent_55%),radial-gradient(circle_at_75%_80%,rgba(21,128,61,0.22),transparent_50%),linear-gradient(165deg,#0a1712_0%,#060d0a_55%,#020704_100%)] max-[500px]:items-stretch max-[500px]:bg-none">
      <div className="relative rounded-[3rem] bg-black p-3 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.08)] max-[500px]:h-[100dvh] max-[500px]:w-full max-[500px]:rounded-none max-[500px]:p-0 max-[500px]:shadow-none">
        <div className="relative h-[844px] w-[390px] overflow-hidden rounded-[2.4rem] bg-black max-[500px]:h-full max-[500px]:w-full max-[500px]:rounded-none">
          {children}
          {/* Punch-hole камера */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-2 z-50 h-3 w-3 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/15"
          />
        </div>
      </div>
    </div>
  )
}
