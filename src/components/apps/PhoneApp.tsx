'use client'

// Телефон ОС Resale: клавиатура, недавние (журнал CallLog из БД), вкладка
// «Номера» (выбивание красивых номеров как в GTA5 RP) и контакты
// (локальные + продавцы-боты). Экран звонка — системный CallOverlay
// (useCall), звонки продавцам-ботам — живые голосовые разговоры.

import { useCallback, useEffect, useState } from 'react'
import { Clock, Grid3x3, Hash, Phone, Users } from 'lucide-react'
import { useOS } from '@/lib/store'
import { sound } from '@/lib/sound'
import { useCall } from '@/lib/call'
import { usePhone } from './phone/use-phone'
import KeypadTab from './phone/keypad-tab'
import RecentsTab from './phone/recents-tab'
import NumbersTab from './phone/numbers-tab'
import ContactsTab from './phone/contacts-tab'

type Tab = 'keypad' | 'recents' | 'numbers' | 'contacts'

const TABS: { key: Tab; label: string; icon: typeof Phone }[] = [
  { key: 'keypad', label: 'Клавиатура', icon: Grid3x3 },
  { key: 'recents', label: 'Недавние', icon: Clock },
  { key: 'numbers', label: 'Номера', icon: Hash },
  { key: 'contacts', label: 'Контакты', icon: Users },
]

export default function PhoneApp() {
  const pushToast = useOS((s) => s.pushToast)
  const phone = usePhone()
  const [tab, setTab] = useState<Tab>('keypad')

  // Данные вкладок подгружаем при первом открытии
  useEffect(() => {
    if (tab === 'recents') void phone.loadCalls()
    if (tab === 'contacts') void phone.loadContacts()
  }, [tab])


  const toast = useCallback(
    (title: string, body: string) => pushToast(title, body),
    [pushToast],
  )

  // Звонок — состояние ОС (useCall): экран рисует системный CallOverlay, поэтому
  // звонок переживает выход из приложения. Локального стейта больше нет.
  const startCall = useCallback(
    (name: string | null, number: string, peerUserId: string | null = null, personaId: string | null = null) => {
      sound.tap()
      // Перезвон из «Недавних»/набора тоже опознаём среди продавцов-ботов:
      // совпадение номера превращает фейковый звонок в живой ИИ-разговор.
      const bot = phone.contacts.find((c) => c.isBot && c.num === number)
      useCall.getState().startCall({
        name: name ?? number,
        number,
        peerUserId: peerUserId ?? bot?.id ?? null,
        personaId: personaId ?? bot?.personaId ?? null,
        listingTitle: null,
        listingPrice: null,
      })
    },
    [phone.contacts],
  )

  return (
    <div className="flex h-full flex-col bg-[#050D09] text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 px-5">
        <h1 className="text-[17px] font-semibold">Телефон</h1>
        {phone.reserves.length > 0 && tab !== 'numbers' && (
          <button
            type="button"
            onClick={() => setTab('numbers')}
            className="ml-auto rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition-transform active:scale-95"
          >
            Бронь номера · {phone.reserves.length}
          </button>
        )}
      </header>

      {tab === 'keypad' && (
        <KeypadTab
          mainNumber={phone.mainNumber}
          onCall={startCall}
          onGoNumbers={() => setTab('numbers')}
        />
      )}

      {tab === 'recents' && <RecentsTab calls={phone.calls} onCall={startCall} />}

      {tab === 'numbers' && <NumbersTab phone={phone} toast={toast} />}

      {tab === 'contacts' && (
        <ContactsTab contacts={phone.contacts} loading={phone.loading} onCall={startCall} />
      )}

      <nav className="mt-auto flex shrink-0 border-t border-white/10" aria-label="Разделы телефона">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                sound.tap()
                setTab(t.key)
              }}
              aria-label={t.label}
              aria-current={active}
              className={
                'flex flex-1 flex-col items-center gap-1 py-3 text-[11px] transition-transform active:scale-95 ' +
                (active ? 'text-emerald-400' : 'text-white/50')
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {t.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
