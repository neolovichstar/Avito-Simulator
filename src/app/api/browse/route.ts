// Настоящий выход в интернет: серверный прокси на curl (обходит TLS-блокировки),
// чистка текста, кеш. Поиск — Google News RSS + Wikipedia API.
// GET /api/browse?url=<адрес>        -> { kind:'page', url, title, text, links }
// GET /api/browse?q=<поиск>          -> { kind:'search', query, results }
import { NextRequest } from 'next/server'
import { execFile } from 'child_process'
import { cache } from '@/lib/cache'
import { rateLimit } from '@/lib/ratelimit'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

interface PageResult {
  kind: 'page'
  url: string
  title: string
  text: string
  links: { href: string; title: string }[]
}
export interface SearchHit {
  title: string
  href: string
  snippet: string
  source: string
}
interface SearchResult {
  kind: 'search'
  query: string
  results: SearchHit[]
}

function curlFetch(url: string, timeoutSec = 12): Promise<{ status: number; body: string; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      [
        '-sS', '-L', '--compressed', '--max-time', String(timeoutSec),
        '-A', UA,
        '-H', 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-H', 'accept-language: ru-RU,ru;q=0.9,en;q=0.7',
        '-w', '\n__CURL_META__%{http_code} %{url_effective}',
        '--', url,
      ],
      { maxBuffer: 4 * 1024 * 1024, timeout: (timeoutSec + 2) * 1000 },
      (err, stdout) => {
        if (err && !stdout) return reject(new Error('Сеть недоступна'))
        const idx = stdout.lastIndexOf('\n__CURL_META__')
        if (idx === -1) return reject(new Error('Некорректный ответ сети'))
        const meta = stdout.slice(idx + '\n__CURL_META__'.length).trim().split(' ')
        const body = stdout.slice(0, idx)
        resolve({ status: Number(meta[0]) || 0, body, finalUrl: meta[1] ?? url })
      },
    )
  })
}

function decodeEntities(s: string): string {
  const map: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–', '&laquo;': '«', '&raquo;': '»',
    '&rarr;': '→', '&larr;': '←', '&hellip;': '…', '&#160;': ' ',
  }
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z#0-9]+;/gi, (m) => map[m.toLowerCase()] ?? ' ')
}

function stripHtml(html: string): { title: string; text: string; links: { href: string; title: string }[] } {
  let s = html
  const titleM = s.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)
  const title = titleM ? decodeEntities(titleM[1]).replace(/\s+/g, ' ').trim() : ''

  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(nav|footer|header|aside|form|svg)[\s\S]*?<\/\1>/gi, ' ')

  const links: { href: string; title: string }[] = []
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) && links.length < 60) {
    const label = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    let href = m[1]
    if (href.startsWith('//')) href = 'https:' + href
    if (!/^https?:\/\//i.test(href)) continue
    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|rar|mp4|mp3|avi)(\?|$)/i.test(href)) continue
    if (label.length < 3) continue
    if (links.some((l) => l.href === href)) continue
    links.push({ href, title: label.slice(0, 90) })
  }

  const text = decodeEntities(
    s
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .slice(0, 9000)

  return { title, text, links }
}

async function fetchPage(rawUrl: string): Promise<PageResult> {
  let url: URL
  try {
    url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
  } catch {
    throw new Error('Некорректный адрес')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Поддерживаются только http/https')

  const key = `browse:page:${url.toString()}`
  return cache.getOrSet(key, 5 * 60_000, async () => {
    const { status, body, finalUrl } = await curlFetch(url.toString())
    if (status >= 400) throw new Error(`Сайт ответил ошибкой ${status}`)
    if (!body.trim()) throw new Error('Сайт вернул пустую страницу')

    if (body.trimStart().startsWith('{') || body.trimStart().startsWith('[')) {
      try {
        const pretty = JSON.stringify(JSON.parse(body), null, 2)
        return { kind: 'page' as const, url: finalUrl, title: url.hostname, text: pretty.slice(0, 9000), links: [] }
      } catch { /* это был не JSON — идём в html */ }
    }

    const { title, text, links } = stripHtml(body)
    if (!text) throw new Error('Сайт вернул страницу без текста')
    return { kind: 'page' as const, url: finalUrl, title: title || url.hostname, text, links }
  })
}

async function searchNews(q: string, out: SearchHit[]) {
  // Bing News RSS: прямые ссылки на издателя (в параметре url=), работает из датацентров
  const { body } = await curlFetch(
    `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setmkt=ru-RU&setlang=ru`,
    10,
  )
  const items = body.split('<item>').slice(1, 9)
  let added = 0
  for (const it of items) {
    const t = it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''
    const l = it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ''
    const d = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ''
    let href = decodeEntities(l.trim())
    // извлекаем прямую ссылку из редиректа Bing
    const u = href.match(/[?&]url=([^&]+)/)
    if (u) {
      try {
        href = decodeURIComponent(u[1])
      } catch { /* оставили как есть */ }
    }
    const title = decodeEntities(t).trim()
    if (title && /^https?:\/\//.test(href)) {
      out.push({
        title,
        href,
        snippet: d
          ? new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
          : '',
        source: 'Новости',
      })
      added++
    }
  }
  if (added > 0) return
  // запасной источник: Google News (ссылки-редиректы)
  const g = await curlFetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ru&gl=RU&ceid=RU:ru`,
    10,
  ).catch(() => null)
  if (!g) return
  const gItems = g.body.split('<item>').slice(1, 9)
  for (const it of gItems) {
    const t = it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''
    const l = it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ''
    const d = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ''
    const title = decodeEntities(t).trim()
    const href = l.trim()
    if (title && /^https?:\/\//.test(href)) {
      out.push({
        title,
        href,
        snippet: d
          ? new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
          : '',
        source: 'Новости',
      })
    }
  }
}

async function searchWiki(q: string, out: SearchHit[]) {
  const { body } = await curlFetch(
    `https://ru.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=6&namespace=0&format=json`,
    8,
  )
  const arr = JSON.parse(body) as [string, string[], string[], string[]]
  if (Array.isArray(arr?.[1])) {
    arr[1].forEach((title, i) => {
      const href = arr[3]?.[i]
      const desc = arr[2]?.[i] ?? ''
      if (title && href) out.push({ title: `${title} — Википедия`, href, snippet: desc, source: 'Википедия' })
    })
  }
}

async function search(q: string): Promise<SearchResult> {
  const key = `browse:search:${q.toLowerCase()}`
  return cache.getOrSet(key, 10 * 60_000, async () => {
    const results: SearchHit[] = []
    const tasks = [searchNews(q, results), searchWiki(q, results).catch(() => {})]
    await Promise.all(tasks)
    return { kind: 'search' as const, query: q, results: results.slice(0, 14) }
  })
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return Response.json({ error: 'Не авторизован' }, { status: 401 })

  const rl = rateLimit(`browse:${user.id}`, 24, 60_000)
  if (!rl) return Response.json({ error: 'Слишком много запросов, подождите минуту' }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const rawUrl = searchParams.get('url')?.trim()

  try {
    if (q) return Response.json(await search(q.slice(0, 200)))
    if (rawUrl) return Response.json(await fetchPage(rawUrl))
    return Response.json({ error: 'Нужен параметр url или q' }, { status: 400 })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error && e.message ? e.message : 'Не удалось загрузить страницу' },
      { status: 502 },
    )
  }
}
