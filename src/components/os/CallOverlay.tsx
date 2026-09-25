'use client'

// ─────────────────────────────────────────────────────────────────────────────
// СИСТЕМНЫЙ ОВЕРЛЕЙ ЗВОНКА ОС «Resale».
//
// Монтируется в page.tsx рядом с VolumePlate и живёт ВЫШЕ приложений: звонок —
// состояние ОС (useCall), а не приложения «Телефон», поэтому он переживает
// выход из приложения (открыл музыку — звонок продолжается, как в Android).
//
//  • входящий LIVE-звонок (27-e) → IncomingCallScreen: аватар с инициалами,
//    «Входящий звонок», зелёная пилюля «Принять» / красная «Отклонить»;
//  • фазы dialing/ringing-out/ringing/active/active-live/ended → CallScreen
//    (таймер, «Соединение…», «Связь потеряна» и т.д. — см. call-screen.tsx);
//  • «Свернуть» → плавающий чип-капсула с именем и таймером (как активный
//    звонок в Android 17), тап возвращает на экран звонка.
// ─────────────────────────────────────────────────────────────────────────────

import { AnimatePresence, motion } from 'framer-motion'
import { Phone, PhoneCall, PhoneOff } from 'lucide-react'
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
      aria-label={`Вернуться к звонку: ${peer.name || peer.number}. Длительность ${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`}
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

// ── входящий LIVE-звонок: аватар, имя, Принять/Отклонить (27-e) ──────────────
function IncomingCallScreen() {
  const peer = useCall((s) => s.peer)
  const acceptLive = useCall((s) => s.acceptLive)
  const rejectLive = useCall((s) => s.rejectLive)
  if (!peer) return null
  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#07130D,#050D09)] text-white">
      {/* аватар с расходящимися кольцами (как экран вызова 26-d) */}
      <div className="flex flex-col items-center gap-1.5 pt-16">
        <div className="relative flex items-center justify-center">
          <motion.span
            className="absolute size-24 rounded-full bg-emerald-500/20"
            animate={{ scale: [1, 1.7], opacity: [0.55, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut' }}
            aria-hidden="true"
          />
          <motion.span
            className="absolute size-24 rounded-full bg-emerald-500/15"
            animate={{ scale: [1, 1.7], opacity: [0.4, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut', delay: 0.55 }}
            aria-hidden="true"
          />
          <motion.div
            className="flex size-24 items-center justify-center rounded-full bg-emerald-500/20 text-[30px] font-semibold text-emerald-300"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          >
            {initials(peer.name || peer.number || '?')}
          </motion.div>
        </div>
        <div className="mt-2 max-w-[85%] truncate text-[26px] font-semibold">{peer.name || 'Игрок'}</div>
        <div className="mt-1 text-[14px] text-white/60">Входящий звонок</div>
      </div>

      <div className="flex-1" />

      {/* Принять (зелёная пилюля) / Отклонить (красная) */}
      <div className="flex shrink-0 items-center justify-center gap-6 pb-20" role="group" aria-label="Ответить на звонок">
        <button
          type="button"
          onClick={rejectLive}
          aria-label="Отклонить звонок"
          className="flex h-14 items-center gap-2.5 rounded-full bg-red-500 px-6 font-semibold text-white transition-transform active:scale-95"
        >
          <PhoneOff className="size-5" aria-hidden="true" />
          Отклонить
        </button>
        <button
          type="button"
          onClick={acceptLive}
          aria-label="Принять звонок"
          className="flex h-14 items-center gap-2.5 rounded-full bg-emerald-500 px-7 font-semibold text-[#052E16] shadow-lg shadow-emerald-500/25 transition-transform active:scale-95"
        >
          <Phone className="size-5" aria-hidden="true" />
          Принять
        </button>
      </div>
    </div>
  )
}

export default function CallOverlay() {
  const phase = useCall((s) => s.phase)
  const peer = useCall((s) => s.peer)
  const minimized = useCall((s) => s.minimized)
  const callId = useCall((s) => s.callId)

  if (phase === 'idle' || !peer) return null

  const incoming = phase === 'incoming'
  const chipVisible = minimized && !incoming // входящий не сворачивается

  return (
    <div role="dialog" aria-label={incoming ? `Входящий звонок: ${peer.name}` : `Звонок: ${peer.name || peer.number}`} aria-modal={!minimized}>
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
            {incoming ? (
              <IncomingCallScreen key="incoming" />
            ) : (
              <CallScreen key={callId ?? 'call'} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{chipVisible && <CallChip key="callchip" />}</AnimatePresence>
    </div>
  )
}
