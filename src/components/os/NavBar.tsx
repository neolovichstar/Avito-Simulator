'use client'

// Нижняя Android-панель навигации: назад / домой / недавние.
export default function NavBar({
  onBack,
  onHome,
  onRecents,
  recentsActive,
}: {
  onBack: () => void
  onHome: () => void
  onRecents: () => void
  recentsActive: boolean
}) {
  return (
    <nav
      aria-label="Системная навигация"
      className="absolute inset-x-0 bottom-0 z-40 flex h-12 items-center justify-around bg-black/85 px-12 backdrop-blur-md"
    >
      {/* Треугольник «назад» */}
      <button
        type="button"
        aria-label="Назад"
        onClick={onBack}
        className="flex h-10 w-10 items-center justify-center rounded-full outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <span
          aria-hidden="true"
          className="block h-4 w-4 bg-white/85 [clip-path:polygon(100%_0,100%_100%,0_50%)]"
        />
      </button>

      {/* Круг «домой» */}
      <button
        type="button"
        aria-label="Домой"
        onClick={onHome}
        className="flex h-10 w-10 items-center justify-center rounded-full outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <span
          aria-hidden="true"
          className="block h-4.5 w-4.5 rounded-full border-2 border-white/85"
        />
      </button>

      {/* Квадрат «недавние» */}
      <button
        type="button"
        aria-label="Недавние приложения"
        aria-pressed={recentsActive}
        onClick={onRecents}
        className={`flex h-10 w-10 items-center justify-center rounded-full outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 ${
          recentsActive ? 'bg-blue-500/25' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className={`block h-3.5 w-3.5 rounded-[4px] border-2 ${
            recentsActive ? 'border-blue-400 bg-blue-400/40' : 'border-white/85'
          }`}
        />
      </button>
    </nav>
  )
}
