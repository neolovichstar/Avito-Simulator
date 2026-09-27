'use client'

// Заметки ОС: список карточками, полноэкранный редактор с автосохранением
// по вводу в localStorage ('avito_sim_notes'), плавающая кнопка новой заметки.
// Визуал — Google Keep (M3): masonry-сетка 2 колонки, пастельные тональные карточки, FAB rounded-[20px].

import { useState } from 'react'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { sound } from '@/lib/sound'

const LS_KEY = 'avito_sim_notes'

interface Note {
  id: string
  text: string
  updatedAt: number
}

function loadNotes(): Note[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (n): n is Note => !!n && typeof n === 'object' && typeof (n as Note).text === 'string',
      )
    }
  } catch {
    /* повреждённые данные — начинаем с пустого списка */
  }
  return []
}

function saveNotes(notes: Note[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(notes))
  } catch {
    /* приватный режим — заметки живут до перезагрузки */
  }
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function splitNote(text: string): { title: string; preview: string } {
  const lines = text.split('\n')
  const first = (lines[0] ?? '').trim()
  const rest = lines.slice(1).join(' ').trim()
  return {
    title: first || 'Без названия',
    preview: rest.length > 80 ? rest.slice(0, 80) + '…' : rest,
  }
}

// Пастельные тональные фоны карточек (M3 secondary-container): выбор детерминированный
// по id заметки — только визуал, данные и логика не меняются
const TINTS = [
  'bg-emerald-500/[0.13]',
  'bg-amber-500/[0.13]',
  'bg-rose-500/[0.13]',
  'bg-violet-500/[0.13]',
  'bg-stone-500/[0.10]',
]

function tintFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

export default function NotesApp() {
  const [notes, setNotes] = useState<Note[]>(loadNotes)
  const [editingId, setEditingId] = useState<string | null>(null)

  const update = (id: string, text: string) => {
    const next = notes.map((n) => (n.id === id ? { ...n, text, updatedAt: Date.now() } : n))
    setNotes(next)
    saveNotes(next)
  }

  const create = () => {
    sound.tap()
    const note: Note = { id: newId(), text: '', updatedAt: Date.now() }
    const next = [note, ...notes]
    setNotes(next)
    saveNotes(next)
    setEditingId(note.id)
  }

  const remove = (id: string) => {
    sound.tap()
    const next = notes.filter((n) => n.id !== id)
    setNotes(next)
    saveNotes(next)
    setEditingId(null)
  }

  const closeEditor = () => {
    // Пустая заметка не сохраняется
    if (editingId !== null) {
      const cur = notes.find((n) => n.id === editingId)
      if (cur && cur.text.trim() === '') {
        const next = notes.filter((n) => n.id !== editingId)
        setNotes(next)
        saveNotes(next)
      }
    }
    sound.tap()
    setEditingId(null)
  }

  /* ------------------------------ Редактор ------------------------------ */

  if (editingId !== null) {
    const note = notes.find((n) => n.id === editingId)
    if (note) {
      return (
        <div className="flex h-full flex-col bg-[#050D09] text-white">
          <header className="flex h-14 shrink-0 items-center justify-between px-3">
            <button
              type="button"
              onClick={closeEditor}
              aria-label="Назад к заметкам"
              className="flex size-10 items-center justify-center rounded-full bg-white/[0.08] text-white transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <span className="text-[12px] text-white/40">Автосохранение</span>
            <button
              type="button"
              onClick={() => remove(note.id)}
              aria-label="Удалить заметку"
              className="flex size-10 items-center justify-center rounded-full bg-white/[0.08] text-[#E5484D] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-90"
            >
              <Trash2 className="size-5" aria-hidden="true" />
            </button>
          </header>
          {/* Панель редактора rounded-[28px] с полем ввода rounded-[18px] */}
          <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col rounded-[28px] bg-white/[0.04] p-1.5 ring-1 ring-white/[0.06]">
            <textarea
              value={note.text}
              onChange={(e) => update(note.id, e.target.value)}
              placeholder="Начните печатать…"
              autoFocus
              aria-label="Текст заметки"
              className="h-full w-full flex-1 resize-none rounded-[18px] bg-white/[0.06] px-4 py-3.5 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30"
            />
          </div>
        </div>
      )
    }
  }

  /* -------------------------------- Список ------------------------------- */

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="relative flex h-full flex-col bg-[#050D09] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Заметки</h1>
        {sorted.length > 0 && <span className="text-[12px] tabular-nums text-white/50">{sorted.length} шт.</span>}
      </header>

      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] px-4 pb-24">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/40">
            <img
              src="/img/empty/notes.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="h-28"
            />
            <p className="text-[13px]">Пока нет заметок</p>
          </div>
        ) : (
          <div className="m3-rise columns-2 gap-2.5 pt-1">
            {sorted.map((n) => {
              const { title, preview } = splitNote(n.text)
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    sound.tap()
                    setEditingId(n.id)
                  }}
                  className={
                    tintFor(n.id) +
                    ' mb-2.5 block w-full break-inside-avoid rounded-[18px] p-3.5 text-left ring-1 ring-white/[0.06] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98]'
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[13.5px] font-bold text-white">{title}</span>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-white/40">{fmtDate(n.updatedAt)}</span>
                  </div>
                  {preview && (
                    <p className="mt-1 line-clamp-4 whitespace-pre-line text-[12px] leading-snug text-white/70">
                      {preview}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={create}
        aria-label="Новая заметка"
        className="absolute bottom-6 right-4 flex size-14 items-center justify-center rounded-[20px] bg-[#21A038] text-white shadow-lg shadow-emerald-500/25 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95"
      >
        <Plus className="size-6" aria-hidden="true" />
      </button>
    </div>
  )
}
