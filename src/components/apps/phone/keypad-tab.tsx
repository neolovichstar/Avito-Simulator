'use client'

// Вкладка «Клавиатура»: набор номера с авто-форматированием, основной номер,
// экран вызова открывается в PhoneApp через onCall.

import { useState } from 'react'
import { Delete, Hash, Phone } from 'lucide-react'
import { formatDialInput } from '@/lib/phone'
import { sound } from '@/lib/sound'
import { TierBadge, type PhoneDTO } from './shared'

const KEYS: { d: string; sub?: string; label: string }[] = [
  { d: '1', label: 'Цифра 1' },
  { d: '2', sub: 'ABC', label: 'Цифра 2' },
  { d: '3', sub: 'DEF', label: 'Цифра 3' },
  { d: '4', sub: 'GHI', label: 'Цифра 4' },
  { d: '5', sub: 'JKL', label: 'Цифра 5' },
  { d: '6', sub: 'MNO', label: 'Цифра 6' },
  { d: '7', sub: 'PQRS', label: 'Цифра 7' },
  { d: '8', sub: 'TUV', label: 'Цифра 8' },
  { d: '9', sub: 'WXYZ', label: 'Цифра 9' },
  { d: '*', label: 'Звёздочка' },
  { d: '0', sub: '+', label: 'Цифра 0' },
  { d: '#', label: 'Решётка' },
]

interface Props {
  mainNumber: PhoneDTO | null
  onCall: (name: string | null, number: string, peerUserId?: string | null) => void
  /** Чип «Ваш номер» → отдельное приложение «Номера». */
  onOpenNumbers: () => void
}

export default function KeypadTab({ mainNumber, onCall, onOpenNumbers }: Props) {
  const [raw, setRaw] = useState('')
  const display = formatDialInput(raw)

  const press = (d: string) => {
    sound.tap()
    setRaw((cur) => (cur.replace(/[^\d]/g, '').length >= 11 ? cur : cur + d))
  }

  const backspace = () => {
    sound.tap()
    setRaw((cur) => cur.slice(0, -1))
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-3">
      {/* Основной номер игрока */}
      <button
        type="button"
        onClick={onOpenNumbers}
        className="mx-auto mb-1 mt-1 flex max-w-full items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-white/45 transition-colors active:bg-white/[0.09]"
      >
        <Hash className="size-3 shrink-0" aria-hidden="true" />
        {mainNumber ? (
          <span className="truncate tabular-nums">
            Ваш: {mainNumber.number}
          </span>
        ) : (
          <span className="truncate text-emerald-300/80">Выбей номер в приложении «Номера»</span>
        )}
        {mainNumber && <TierBadge tier={mainNumber.tier} />}
      </button>

      <div className="flex min-h-16 items-center justify-center py-3">
        {raw ? (
          <span className="max-w-[75%] truncate text-[24px] font-light tabular-nums tracking-wide text-white">
            {display}
          </span>
        ) : (
          <span className="text-[17px] text-white/25">Введите номер</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k.d}
            type="button"
            onClick={() => press(k.d)}
            aria-label={k.label}
            className="mx-auto flex size-16 flex-col items-center justify-center rounded-full bg-white/[0.08] transition-transform active:scale-95"
          >
            <span className="text-[22px] font-medium leading-none">{k.d}</span>
            {k.sub && <span className="mt-0.5 text-[9px] tracking-[0.25em] text-white/45">{k.sub}</span>}
          </button>
        ))}
      </div>

      {/* Кнопка звонка по центру; рядом — серый круг удаления (как в Google Phone) */}
      <div className="grid grid-cols-3 items-center pt-4">
        <span aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            if (!display.trim()) return
            onCall(null, display.trim())
          }}
          disabled={!raw.trim()}
          aria-label="Позвонить"
          className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#21A038] text-white shadow-lg shadow-emerald-500/25 transition-transform active:scale-95 disabled:opacity-40"
        >
          <Phone className="size-6" aria-hidden="true" />
        </button>
        {raw ? (
          <button
            type="button"
            onClick={backspace}
            aria-label="Удалить цифру"
            className="mx-auto flex size-16 items-center justify-center rounded-full bg-white/[0.08] text-white/70 transition-transform active:scale-95"
          >
            <Delete className="size-6" aria-hidden="true" />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
