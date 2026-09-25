'use client'

// Вкладка «Недавние»: журнал звонков из БД (CallLog). Входящие/пропущенные —
// входящие фейковые контакты, исходящие — реальные звонки игрока.

import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from 'lucide-react'
import { fmtDuration } from './shared'
import type { CallDTO } from './shared'

function fmtRecTime(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

interface Props {
  calls: CallDTO[]
  onCall: (name: string | null, number: string, peerUserId?: string | null) => void
}

export default function RecentsTab({ calls, onCall }: Props) {
  if (calls.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <PhoneOutgoing className="size-8 text-white/15" aria-hidden="true" />
        <p className="text-[14px] text-white/40">Пока никого</p>
        <p className="text-[12px] text-white/25">
          Наберите номер на клавиатуре или позвоните продавцу из контактов
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="flex flex-col gap-1">
        {calls.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onCall(r.name, r.number)}
            aria-label={`Позвонить: ${r.name ?? r.number}`}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:bg-white/[0.04]"
          >
            {r.kind === 'in' && (
              <PhoneIncoming className="size-5 shrink-0 text-emerald-400" aria-hidden="true" />
            )}
            {r.kind === 'out' && (
              <PhoneOutgoing className="size-5 shrink-0 text-white/40" aria-hidden="true" />
            )}
            {r.kind === 'miss' && (
              <PhoneMissed className="size-5 shrink-0 text-red-400" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span
                className={
                  'block truncate text-[15px] ' + (r.kind === 'miss' ? 'text-red-400' : 'text-white')
                }
              >
                {r.name ?? 'Неизвестный'}
              </span>
              <span className="block truncate text-[11px] tabular-nums text-white/40">
                {r.number}
                {r.kind === 'out' && r.status === 'no_answer' ? ' · не ответил' : ''}
                {r.kind === 'out' && r.status === 'completed' ? ` · ${fmtDuration(r.durationSec)}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-white/40">
              {fmtRecTime(r.ts)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
