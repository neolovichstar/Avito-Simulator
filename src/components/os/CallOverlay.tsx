'use client'

// ─────────────────────────────────────────────────────────────────────────────
// СИСТЕМНЫЙ ОВЕРЛЕЙ ЗВОНКА ОС «Resale».
//
// Монтируется в page.tsx рядом с VolumePlate и живёт ВЫШЕ приложений: звонок —
// состояние ОС (useCall), а не приложения «Телефон», поэтому он переживает
// выход из приложения (открыл музыку — звонок продолжается, как в Android).
//
//  • фазы dialing/ringing/active/ended → полноэкранный CallScreen;
//  • «Свернуть» → плавающий чип-капсула с именем и таймером (как активный
//    звонок в Android 17), тап возвращает на экран звонка;
//  • входящих звонков нет (нет P2P) — только исходящие.
// ─────────────────────────────────────────────────────────────────────────────

import { AnimatePresence, motion } from 'framer-motion'
import { PhoneCall } from 'lucide-react'
import { useCall } from '@/lib/call'
import CallScreen from '@/components/apps/phone/call-screen'
import { initials, pad2, useTick } from '@/components/apps/phone/shared'

function CallChip() {
  const peer = useCall((s) => s.peer)
  const startedAt = useCall((s) => s.startedAt)
  const restore = useCall((s) => s.restore)
  const tick = useTick()
  if (!peer) return null
  const secs = startedAt ? Math.max(0, Math.floor((tick - startedAt) / 1000)) : 0
  return (
    <motion.button
      type="button"
      key="callchip"
      initial={{ opacity: 0, y: -16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.94, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onClick={restore}
      aria-label={`Вернуться к звонку: ${peer.name}. Длительность ${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`}
      className="absolute left-1/2 top-14 z-[66] flex -translate-x-1/2 select-none items-center gap-2 rounded-full bg-neutral-900/90 py-1.5 pl-1.5 pr-3.5 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.14] backdrop-blur-xl transition-transform active:scale-95"
    >
      <span className="relative flex size-7 items-center justify-center rounded-full bg-emerald-500/25 text-[10px] font-bold text-emerald-200">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" aria-hidden="true" />
        {initials(peer.name || peer.number)}
      </span>
      <span className="max-w-28 truncate text-[12px] font-medium text-white/90">{peer.name || peer.number}</span>
      <span className="flex items-center gap-1 text-[11px] tabular-nums text-emerald-300">
        <PhoneCall className="size-3" aria-hidden="true" />
        {startedAt ? `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}` : 'вызов…'}
      </span>
    </motion.button>
  )
}

export default function CallOverlay() {
  const phase = useCall((s) => s.phase)
  const peer = useCall((s) => s.peer)
  const minimized = useCall((s) => s.minimized)
  const callId = useCall((s) => s.callId)

  if (phase === 'idle' || !peer) return null

  return (
    <div role="dialog" aria-label={`Звонок: ${peer.name || peer.number}`} aria-modal={!minimized}>
      <AnimatePresence>
        {!minimized && (
          <motion.div
            key={`callscreen-${callId ?? 'x'}`}
            initial={{ opacity: 0, y: 44 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 36, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="absolute inset-0 z-[66]"
          >
            <CallScreen key={callId ?? 'call'} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{minimized && <CallChip key="callchip" />}</AnimatePresence>
    </div>
  )
}
