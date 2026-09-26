'use client'

// Заметки ОС: список карточками, полноэкранный редактор с автосохранением
// по вводу в localStorage ('avito_sim_notes'), плавающая кнопка новой заметки.

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
              className="flex size-11 items-center justify-center rounded-full text-white/80 transition-transform active:scale-90"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
            <span className="text-[12px] text-white/40">Автосохранение</span>
            <button
              type="button"
              onClick={() => remove(note.id)}
              aria-label="Удалить заметку"
              className="flex size-11 items-center justify-center rounded-full text-red-400 transition-transform active:scale-90"
            >
              <Trash2 className="size-5" aria-hidden="true" />
            </button>
          </header>
          <textarea
            value={note.text}
            onChange={(e) => update(note.id, e.target.value)}
            placeholder="Начните печатать…"
            autoFocus
            aria-label="Текст заметки"
            className="w-full flex-1 resize-none bg-transparent px-5 pb-6 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30"
          />
        </div>
      )
    }
  }

  /* -------------------------------- Список ------------------------------- */

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="relative flex h-full flex-col bg-[#050D09] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <h1 className="text-[17px] font-semibold">Заметки</h1>
        {sorted.length > 0 && <span className="text-[12px] text-white/50">{sorted.length} шт.</span>}
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
          <div className="flex flex-col gap-2 pt-1">
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
                  className="rounded-2xl border border-emerald-500/15 bg-[#0E1F16] p-4 text-left transition-transform active:scale-[0.99]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-medium text-white">{title}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-white/40">{fmtDate(n.updatedAt)}</span>
                  </div>
                  {preview && <p className="mt-1 truncate text-[12px] text-white/50">{preview}</p>}
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
        className="absolute bottom-6 right-4 flex size-14 items-center justify-center rounded-full bg-[#22C55E] text-[#052E16] shadow-xl transition-transform active:scale-90"
      >
        <Plus className="size-6" aria-hidden="true" />
      </button>
    </div>
  )
}
