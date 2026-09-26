'use client'

// «На устройстве» — локальные аудиофайлы пользователя в Библиотеке MusicApp.
//
// Как это устроено честно:
//  • <input type="file" accept="audio/*" multiple> скрыт, кнопка — обёртка;
//  • для каждого файла строится Track с blob:-URL (URL.createObjectURL) —
//    играет через ОБЩИЙ глобальный плеер (src/lib/player.ts), своего аудио нет;
//  • длительность замеряется заранее через new Audio() + loadedmetadata
//    (restore плеера отбрасывает треки с duration <= 0), при неудаче — 180 сек
//    заглушкой: реальную длину плеер возьмёт из loadedmetadata при игре;
//  • в localStorage живут только метаданные (id/имя/размер/длительность);
//    blob:-URL не переживает перезагрузку страницы, поэтому после неё треки
//    показываются СЕРЫМИ «недоступны до повторного выбора» — повторный выбор
//    тех же файлов мгновенно оживляет те же записи (id стабилен name+size).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, FolderOpen, LoaderCircle, Music4 } from 'lucide-react'
import type { Track } from '@/lib/music-types'

const LS_KEY = 'resale_music_local_v1'
const MAX_LOCAL = 50
const DURATION_FALLBACK = 180 // restore плеера требует duration > 0

interface LocalMeta {
  id: string
  title: string
  size: number
  addedAt: number
  duration: number
}

/** blob:-URL живут на уровне модуля — вкладки библиотеки пересоздаются. */
const urlRegistry = new Map<string, string>()

function readMeta(): LocalMeta[] {
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(list)) return []
    return list.filter(
      (m): m is LocalMeta =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as LocalMeta).id === 'string' &&
        typeof (m as LocalMeta).title === 'string',
    )
  } catch {
    return []
  }
}

function writeMeta(list: LocalMeta[]): void {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_LOCAL)))
  } catch {
    /* приватный режим — живём без персистности */
  }
}

/** «01 - Крутой трек.mp3» → «Крутой трек»; «моя_песня» → «моя песня». */
export function prettyFileName(name: string): string {
  let t = name.replace(/\.[a-z0-9]{1,5}$/i, '')
  t = t.replace(/^\s*\d{1,3}\s*[-–—._)\s]+/, '') // номер-префикс «01 - »
  t = t.replace(/_+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return t || name
}

function localIdOf(file: File): string {
  return `local-${file.name}-${file.size}`
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i.test(file.name)
}

/** Длительность до добавления в очередь: иначе restore плеера отбросит трек. */
function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio()
    let done = false
    const finish = (d: number) => {
      if (done) return
      done = true
      a.onloadedmetadata = null
      a.onerror = null
      a.removeAttribute('src')
      a.load()
      resolve(d > 0 ? Math.round(d) : DURATION_FALLBACK)
    }
    const timer = window.setTimeout(() => finish(DURATION_FALLBACK), 4000)
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      window.clearTimeout(timer)
      finish(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : DURATION_FALLBACK)
    }
    a.onerror = () => {
      window.clearTimeout(timer)
      finish(DURATION_FALLBACK)
    }
    a.src = url
  })
}

export function localTrackFromMeta(m: LocalMeta, url?: string): Track {
  return {
    id: m.id,
    title: m.title,
    artist: 'Моё устройство',
    artwork: '',
    artworkSmall: '',
    duration: m.duration > 0 ? m.duration : DURATION_FALLBACK,
    streamUrl: url ?? '',
  }
}

export interface UseLocalTracks {
  meta: LocalMeta[]
  availableIds: Set<string>
  busy: boolean
  addFiles: (files: FileList | File[]) => Promise<void>
}

export function useLocalTracks(): UseLocalTracks {
  const [meta, setMeta] = useState<LocalMeta[]>([])
  const [availableIds, setAvailableIds] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  // Читаем метаданные при монтировании вкладки; blob:-URL из прошлых сессий
  // не существуют — доступные только те, что добавлены в этой сессии.
  useEffect(() => {
    const list = readMeta()
    setMeta(list)
    const alive = new Set<string>()
    for (const id of urlRegistry.keys()) if (list.some((m) => m.id === id)) alive.add(id)
    setAvailableIds(alive)
  }, [])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(isAudioFile)
    if (!arr.length) return
    setBusy(true)
    try {
      const fresh: LocalMeta[] = []
      for (const f of arr) {
        const id = localIdOf(f)
        let url = urlRegistry.get(id)
        if (!url) {
          url = URL.createObjectURL(f)
          urlRegistry.set(id, url)
        }
        const duration = await probeDuration(url)
        fresh.push({ id, title: prettyFileName(f.name), size: f.size, addedAt: Date.now(), duration })
      }
      setMeta((prev) => {
        const merged = [...fresh, ...prev.filter((p) => !fresh.some((f) => f.id === p.id))].slice(0, MAX_LOCAL)
        writeMeta(merged)
        return merged
      })
      setAvailableIds(new Set(urlRegistry.keys()))
    } finally {
      setBusy(false)
    }
  }, [])

  return { meta, availableIds, busy, addFiles }
}

// ─────────────────────────────────────────────────────────────────────────────
// Секция «На устройстве» (стиль остальных секций Библиотеки)
// ─────────────────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} МБ`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${bytes} Б`
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function pluralFiles(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'файл'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'файла'
  return 'файлов'
}

export function LocalTracksSection({
  currentId,
  onPlay,
}: {
  currentId: string | null
  onPlay: (tracks: Track[], i: number) => void
}) {
  const { meta, availableIds, busy, addFiles } = useLocalTracks()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const availableTracks = useMemo(
    () => meta.filter((m) => availableIds.has(m.id)).map((m) => localTrackFromMeta(m, urlRegistry.get(m.id))),
    [meta, availableIds],
  )
  const staleTracks = useMemo(() => meta.filter((m) => !availableIds.has(m.id)), [meta, availableIds])

  return (
    <section className="mt-5" aria-label="На устройстве">
      <div className="px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[20px] font-bold leading-tight text-[#17181A]">
            <FolderOpen size={18} className="text-[#8B8F99]" aria-hidden />
            На устройстве
          </h2>
          {/* Скрытый input: клик по кнопке-обёртке открывает выбор файлов */}
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const files = e.target.files
              if (files && files.length > 0) void addFiles(files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-full bg-[#F0F1F5] px-4 text-[13px] font-semibold text-[#17181A] transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <FolderOpen size={15} aria-hidden />}
            {busy ? 'Читаем…' : 'Добавить файлы'}
          </button>
        </div>
        <p className="mt-0.5 text-[13px] text-[#8B8F99]">
          {meta.length > 0
            ? `${meta.length} ${pluralFiles(meta.length)} · играют в общем плеере ОС`
            : 'Файлы не покидают устройство — никуда не загружаются'}
        </p>
      </div>

      {availableTracks.length > 0 && (
        <div className="mx-4 mt-3 rounded-[24px] bg-white p-1.5 shadow-sm">
          {availableTracks.map((t, i) => (
            <div
              key={t.id}
              className={
                'flex items-center gap-1.5 rounded-[18px] p-1.5 transition-colors ' +
                (t.id === currentId ? 'bg-[#21A038]/[0.12]' : 'active:bg-[#F5F6F8]')
              }
            >
              <button
                type="button"
                onClick={() => onPlay(availableTracks, i)}
                aria-label={`Слушать: ${t.title} — локальный файл`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-gradient-to-br from-[#F0F1F5] to-[#E4E6EB]" aria-hidden>
                  <Music4 className="h-5 w-5 text-[#B9BDC7]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={'block truncate text-[14px] font-semibold leading-tight ' + (t.id === currentId ? 'text-emerald-800' : 'text-[#17181A]')}>{t.title}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[#8B8F99]">
                    Моё устройство · {mmss(t.duration)}
                  </span>
                </span>
              </button>
              <span className="flex w-10 shrink-0 items-center justify-end" aria-hidden>
                {t.id === currentId && <AudioLines size={18} className="text-emerald-700" />}
              </span>
            </div>
          ))}
        </div>
      )}

      {staleTracks.length > 0 && (
        <div className="mx-4 mt-3 rounded-[24px] bg-white/60 p-1.5 shadow-sm">
          {staleTracks.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-[18px] p-2.5 opacity-55" aria-disabled="true">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#F0F1F5]" aria-hidden>
                <Music4 className="h-4 w-4 text-[#B9BDC7]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-[#8B8F99]">{m.title}</span>
                <span className="block truncate text-[11.5px] text-[#B9BDC7]">
                  Недоступен до повторного выбора · {fmtSize(m.size)}
                </span>
              </span>
            </div>
          ))}
          <p className="px-2.5 pb-2 pt-1 text-[11px] leading-snug text-[#8B8F99]">
            Браузер не хранит сами файлы между запусками — нажмите «Добавить файлы» и выберите их снова.
          </p>
        </div>
      )}

      {meta.length === 0 && (
        <div className="mx-4 mt-3 rounded-[24px] bg-white p-4 text-center shadow-sm">
          <p className="text-[13px] leading-snug text-[#8B8F99]">
            Нажмите «Добавить файлы» — выбранные треки появятся здесь и в общем плеере
          </p>
        </div>
      )}
    </section>
  )
}
