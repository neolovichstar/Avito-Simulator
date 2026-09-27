'use client'

// Вкладка «Контакты»: локальный список + продавцы-боты из БД
// (GET /api/phones/contacts), алфавитные sticky-разделители.
// Умный поиск: fuzzy по имени/номеру («мама», «иван», «903») — опечатки
// и подпоследовательности ловятся модулем smart-search.

import { useMemo, useState } from 'react'
import { Search, Store, X } from 'lucide-react'
import { fuzzyMatch, Highlight } from '@/lib/smart-search'
import { UserAvatar } from '@/components/shared/UserAvatar'
import type { ContactDTO } from './shared'

// Локальные знакомые (не продавцы) — остаются как есть.
const LOCAL_CONTACTS: ContactDTO[] = [
  { id: 'l1', name: 'Анна Соколова', num: '+7 (912) 445-19-02', isBot: false },
  { id: 'l2', name: 'Борис Крылов', num: '+7 (921) 330-77-41', isBot: false },
  { id: 'l3', name: 'Валерия Морозова', num: '+7 (903) 218-56-14', isBot: false },
  { id: 'l4', name: 'Глеб Орлов', num: '+7 (916) 502-83-26', isBot: false },
  { id: 'l5', name: 'Дарья Кузнецова', num: '+7 (926) 174-90-58', isBot: false },
  { id: 'l6', name: 'Егор Лебедев', num: '+7 (905) 663-12-37', isBot: false },
  { id: 'l7', name: 'Жанна Ершова', num: '+7 (962) 809-45-73', isBot: false },
  { id: 'l8', name: 'Захар Панов', num: '+7 (981) 254-61-08', isBot: false },
  { id: 'l9', name: 'Марина Белова', num: '+7 (917) 521-94-60', isBot: false },
]

interface Props {
  contacts: ContactDTO[]
  loading: boolean
  onCall: (name: string | null, number: string, peerUserId?: string | null) => void
}

export default function ContactsTab({ contacts, loading, onCall }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim()

  const list = useMemo(() => {
    const all = [...LOCAL_CONTACTS, ...contacts]
    if (!q) return all.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    return all.filter((c) => fuzzyMatch(q, [`${c.name} ${c.num}`, c.num.replace(/\D/g, ''), c.name]))
  }, [contacts, q])

  const groups = useMemo(() => {
    // при активном поиске — плоский список без буквенных разделителей
    if (q) return [{ letter: '', items: list }]
    const map = new Map<string, ContactDTO[]>()
    for (const c of list) {
      const letter = c.name.charAt(0).toUpperCase()
      const arr = map.get(letter) ?? []
      arr.push(c)
      map.set(letter, arr)
    }
    return [...map.entries()].map(([letter, items]) => ({ letter, items }))
  }, [list, q])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* умный поиск: имя или цифры номера */}
      <div className="px-4 pb-2">
        <div className="flex h-12 items-center gap-2 rounded-full bg-white/[0.08] px-4">
          <Search className="size-4 shrink-0 text-white/40" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя или номер"
            aria-label="Поиск контактов"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/35"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Очистить поиск"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/40 transition active:bg-white/10"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {groups.map((g) => (
          <div key={g.letter || 'all'} className="mb-2">
            {g.letter && (
              <div className="sticky top-0 z-10 bg-[#050D09]/95 px-1 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/50 backdrop-blur">
                {g.letter}
              </div>
            )}
            <div className="rounded-[24px] bg-white/[0.06] p-1.5">
              {g.items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onCall(c.name, c.num, c.isBot ? c.id : null)}
                  aria-label={`Позвонить: ${c.name}`}
                  className="flex min-h-14 w-full items-center gap-3 rounded-[18px] px-2.5 py-2 text-left transition-colors active:bg-white/[0.05]"
                >
                  <UserAvatar name={c.name} bot={c.isBot} className="size-10 rounded-full ring-1 ring-white/10" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] text-white">
                        {q ? <Highlight text={c.name} query={q} /> : c.name}
                      </span>
                      {c.isBot && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-300">
                          <Store className="size-2.5" aria-hidden="true" />
                          Продавец
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] tabular-nums text-white/40">
                      {q ? <Highlight text={c.num} query={q} /> : c.num}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {q && list.length === 0 && (
          <div className="py-6 text-center text-[13px] text-white/35">
            Не нашлось — попробуйте другую букву или цифры номера
          </div>
        )}
        {!q && loading && contacts.length === 0 && (
          <div className="py-6 text-center text-[13px] text-white/35">Загружаем продавцов…</div>
        )}
      </div>
    </div>
  )
}
