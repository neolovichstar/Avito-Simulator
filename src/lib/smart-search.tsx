'use client'

/**
 * Умный нечёткий поиск для всей ОС Resale (русский язык).
 *
 * Слои релевантности fuzzyScore (0..1):
 *   1.0  — точное совпадение подстроки (нормализованной);
 *   0.9  — запрос — начало какого-то слова цели («вайф» → «вайфай»);
 *   0.85 — многословный запрос: каждое слово — подстрока своего слова цели;
 *   0.6–0.8 — подпоследовательность символов («звак» → «зарядка»);
 *   0.5     — подпоследовательность с одной «лишней» буквой запроса (з-В-а-к → зарядка);
 *   0.5–0.7 — опечатки: Левенштейн ≤ 2 для слов длиной ≥ 5 («обуфь» → «обувь»).
 *
 * Нормализация: нижний регистр, ё→е, пунктуация → пробелы, схлопывание пробелов.
 * Транслит сознательно не делается (для «вайфай → Wi-Fi» ключевые слова
 * добавляются в сами строки поиска, см. SettingsApp).
 */

import { useMemo, type ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Нормализация
// ─────────────────────────────────────────────────────────────────────────────

/** Нижний регистр, ё→е, пунктуация/символы → пробел, схлопывание пробелов. */
export function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Левенштейн (с ранним выходом — списки маленькие, но вызовов много)
// ─────────────────────────────────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = new Array<number>(n + 1)
  let cur = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    // Оптимизация: минимум следующей строки ≥ текущего минуса 1 за строку,
    // поэтому если даже лучший сценарий уже не дотянется до ≤2 — выходим.
    if (rowMin - (m - i) > 2) return 3
    const tmp = prev
    prev = cur
    cur = tmp
  }
  return prev[n]
}

// ─────────────────────────────────────────────────────────────────────────────
// Подпоследовательность символов: 0.6..0.8 (0 у не-подпоследовательностей)
// ─────────────────────────────────────────────────────────────────────────────

function isSubsequence(q: string, t: string): boolean {
  let i = 0
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++
  }
  return i === q.length
}

/**
 * Подпоследовательность с допущением одной «лишней» буквы запроса — частая
 * опечатка-зажатие («звак» → з-а-к ⊂ «зарядка»). Даёт нижний балл 0.5.
 */
function subsequenceSkipScore(q: string, t: string): number {
  if (q.length < 4 || t.length < q.length) return 0
  for (let s = 0; s < q.length; s++) {
    const qq = q.slice(0, s) + q.slice(s + 1)
    if (isSubsequence(qq, t)) return 0.5
  }
  return 0
}

function subsequenceScore(q: string, t: string): number {
  if (!q || !t || q.length > t.length) return 0
  if (!isSubsequence(q, t)) return subsequenceSkipScore(q, t)
  let lastIdx = -1
  let gaps = 0
  let i = 0
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      if (lastIdx >= 0) gaps += j - lastIdx - 1
      lastIdx = j
      i++
    }
  }
  // Чем плотнее идут символы, тем выше балл; разреженный акроним — 0.6.
  const density = 1 - Math.min(1, gaps / Math.max(1, t.length - q.length))
  return Math.max(0.6, Math.min(0.8, 0.6 + density * 0.2))
}

// ─────────────────────────────────────────────────────────────────────────────
// fuzzyScore — главный скоринг
// ─────────────────────────────────────────────────────────────────────────────

/** Слово запроса против одного слова цели (внутренний хелпер). */
function wordScore(qw: string, tw: string): number {
  if (!qw || !tw) return 0
  if (tw.startsWith(qw)) return 0.9
  if (tw.includes(qw)) return 0.85
  if (qw.length >= 5) {
    const d = levenshtein(qw, tw)
    if (d === 1) return 0.7
    if (d === 2) return 0.5
  }
  return 0
}

/**
 * Релевантность 0..1. Пустой/мусорный ввод — 0. Дробный балл для многословных
 * запросов: ВСЕ слова запроса должны найти своё место в цели (AND-семантика).
 */
export function fuzzyScore(query: string, target: string): number {
  const q = normalize(query)
  const t = normalize(target)
  if (!q || !t) return 0
  if (q === t) return 1
  if (t.includes(q)) return 1

  const qWords = q.split(' ').filter(Boolean)
  const tWords = t.split(' ').filter(Boolean)

  // Целое слово цели начинается с запроса: «вайф» → «вайфай».
  if (tWords.some((w) => w.startsWith(q))) return 0.9

  // Многословный запрос: каждое слово должно сматчиться (хотя бы 0.5).
  if (qWords.length > 1) {
    let sum = 0
    for (const qw of qWords) {
      let best = 0
      for (const tw of tWords) {
        const s = wordScore(qw, tw)
        if (s > best) best = s
        if (best >= 0.9) break
      }
      if (best === 0) {
        // Хвостовое сопоставление слов: акронимы и зажатые буквы.
        for (const tw of tWords) {
          const s = Math.max(subsequenceScore(qw, tw), subsequenceSkipScore(qw, tw))
          if (s > best) best = s
        }
      }
      if (best === 0) return 0
      sum += best
    }
    return Math.min(0.9, sum / qWords.length + 0.04)
  }

  // Однословный запрос: опечатки (Левенштейн ≤2, слово ≥5) против всей цели и её слов.
  if (q.length >= 5) {
    let typo = 0
    const dWhole = levenshtein(q, t)
    if (dWhole === 1) typo = 0.7
    else if (dWhole === 2) typo = 0.5
    if (typo < 0.7) {
      for (const tw of tWords) {
        const d = levenshtein(q, tw)
        if (d === 1) { typo = 0.7; break }
        if (d === 2 && typo < 0.5) typo = 0.5
      }
    }
    return Math.max(typo, subsequenceScore(q, t))
  }

  return Math.max(subsequenceScore(q, t), subsequenceSkipScore(q, t))
}

/** true — хоть одна из целей матчится (score > 0). */
export function fuzzyMatch(query: string, targets: string | string[]): boolean {
  const list = typeof targets === 'string' ? [targets] : targets
  for (const t of list) {
    if (fuzzyScore(query, t) > 0) return true
  }
  return false
}

/** Лучший балл запроса по набору полей (название/артист/жанр…). */
export function bestScore(query: string, fields: Array<string | null | undefined>): number {
  let best = 0
  for (const f of fields) {
    if (!f) continue
    const s = fuzzyScore(query, f)
    if (s > best) best = s
    if (best >= 1) break
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// Автодополнения: топ-N уникальных кандидатов по релевантности
// ─────────────────────────────────────────────────────────────────────────────

export interface FuzzyHit {
  value: string
  score: number
}

export function topMatches(query: string, candidates: string[], limit = 6, minScore = 0.55): FuzzyHit[] {
  const q = normalize(query)
  if (q.length < 2) return []
  const seen = new Set<string>()
  const out: FuzzyHit[] = []
  for (const c of candidates) {
    if (!c) continue
    const key = normalize(c)
    if (!key || seen.has(key) || key === q) continue
    const score = fuzzyScore(q, c)
    if (score >= minScore) {
      seen.add(key)
      out.push({ value: c, score })
    }
    if (out.length >= limit * 4) break
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

// ─────────────────────────────────────────────────────────────────────────────
// Подсветка совпадений: разбивает текст на сегменты { hit: true|false }
// ─────────────────────────────────────────────────────────────────────────────

export interface HighlightPart {
  text: string
  hit: boolean
}

interface Run {
  start: number // индекс в исходном тексте
  norm: string // нормализованное слово (нижний регистр, ё→е)
}

function normRuns(text: string): { norm: string; orig: number[] } {
  const runs: Run[] = []
  const re = /[0-9a-zа-яё]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    runs.push({ start: m.index, norm: m[0].toLowerCase().replace(/ё/g, 'е') })
  }
  let norm = ''
  const orig: number[] = []
  runs.forEach((r, k) => {
    if (k > 0) {
      norm += ' '
      orig.push(-1) // сепаратор — не отображается в диапазонах совпадений
    }
    for (let i = 0; i < r.norm.length; i++) {
      norm += r.norm[i]
      orig.push(r.start + i)
    }
  })
  return { norm, orig }
}

export function highlightParts(text: string, query: string): HighlightPart[] {
  if (!text) return []
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (!tokens.length) return [{ text, hit: false }]

  const { norm, orig } = normRuns(text)
  const ranges: Array<[number, number]> = []

  const whole = norm.indexOf(tokens.join(' '))
  if (whole >= 0) {
    ranges.push([whole, whole + tokens.join(' ').length])
  } else {
    for (const tok of tokens) {
      let at = norm.indexOf(tok)
      if (at < 0 && tok.length >= 5) {
        // Опечатка: ищем слово цели с Левенштейном ≤2 и подсвечиваем его целиком.
        let pos = 0
        for (const w of norm.split(' ')) {
          if (w && levenshtein(tok, w) <= 2) {
            at = pos
            break
          }
          pos += w.length + 1
        }
      }
      if (at >= 0) ranges.push([at, at + tok.length])
    }
  }
  if (!ranges.length) return [{ text, hit: false }]

  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }

  const parts: HighlightPart[] = []
  let cursor = 0
  for (const [s, e] of merged) {
    const os = orig[s]
    const oe = orig[e - 1] + 1
    if (os == null || oe == null || os < cursor) continue
    if (os > cursor) parts.push({ text: text.slice(cursor, os), hit: false })
    parts.push({ text: text.slice(os, oe), hit: true })
    cursor = oe
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts.length ? parts : [{ text, hit: false }]
}

// ─────────────────────────────────────────────────────────────────────────────
// <Highlight> — совпавшая часть жёлтым маркером (читаемо на любом фоне)
// ─────────────────────────────────────────────────────────────────────────────

export function Highlight({
  text,
  query,
  className,
  markClassName,
}: {
  text: string
  query: string
  className?: string
  markClassName?: string
}) {
  const parts = useMemo(() => highlightParts(text, query), [text, query])
  const mark = markClassName ?? 'rounded-[2px] bg-[#FFD53D] px-0.5 text-[#17181A]'
  const nodes: ReactNode[] = parts.map((p, i) =>
    p.hit ? (
      <mark key={i} className={mark}>
        {p.text}
      </mark>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  )
  return className ? <span className={className}>{nodes}</span> : <>{nodes}</>
}
