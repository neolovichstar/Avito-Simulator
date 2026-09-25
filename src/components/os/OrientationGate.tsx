'use client'

import { useEffect, useState } from 'react'

/**
 * Блокировка ориентации телефона (по умолчанию — портрет).
 *
 * 1) Нативный лок: screen.orientation.lock('portrait') — работает на
 *    Android/Chrome (в полноэкране) и в Telegram-Webview на Android.
 *    iOS Safari API не имеет — попытка тихо игнорируется.
 *    Повторяем на fullscreenchange/visibilitychange: браузеры сбрасывают
 *    лок при выходе из полноэкранного режима.
 *
 * 2) Страховка, где нативный лок недоступен (iOS): на тач-устройствах в
 *    ландшафте показываем системный оверлей «Поверни телефон» — контент
 *    рассчитан только на вертикальный экран. На десктопе (pointer: fine)
 *    оверлей никогда не появляется.
 */
export default function OrientationGate() {
  const [landscape, setLandscape] = useState(false)

  useEffect(() => {
    // --- 1) нативный портрет-лок, где поддерживается ---
    const lock = () => {
      try {
        const so = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined
        so?.lock?.('portrait')?.catch(() => {
          /* отказ/не поддерживается — рисуем оверлей-страховку */
        })
      } catch {
        /* старые движки без screen.orientation — ок */
      }
    }
    lock()
    window.addEventListener('fullscreenchange', lock)
    document.addEventListener('visibilitychange', lock)

    // --- 2) страховочный оверлей: только тач + ландшафт + невысокий вьюпорт ---
    // (max-height отсекает «широкие» десктопные окна с тачскрином)
    const mq = window.matchMedia('(pointer: coarse) and (orientation: landscape) and (max-height: 520px)')
    const apply = () => setLandscape(mq.matches)
    apply()
    mq.addEventListener('change', apply)

    return () => {
      window.removeEventListener('fullscreenchange', lock)
      document.removeEventListener('visibilitychange', lock)
      mq.removeEventListener('change', apply)
    }
  }, [])

  if (!landscape) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-7 bg-[#0B0D10] px-10 text-center"
    >
      <div className="relative flex h-20 w-24 items-center justify-center">
        {/* зона-подсказка: телефон качается из ландшафта в портрет и обратно */}
        <span className="orient-hint-phone absolute h-11 w-20 rounded-[12px] border-2 border-white/70 bg-white/[0.08]" />
        <span className="absolute -bottom-7 h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-white/35" />
      </div>
      <div>
        <p className="text-[17px] font-bold tracking-tight text-white">Поверни телефон вертикально</p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/45">
          Игра работает только в портретном режиме
        </p>
      </div>
    </div>
  )
}
