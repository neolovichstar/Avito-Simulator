// Настоящий выход в интернет: серверный прокси на curl (обходит TLS-блокировки),
// чистка текста, кеш. Поиск — Google News RSS + Wikipedia API.
// GET /api/browse?url=<адрес>        -> { kind:'page', url, title, text, links }
// GET /api/browse?q=<поиск>          -> { kind:'search', query, results }
import { NextRequest } from 'next/server'
import { execFile } from 'child_process'
import { promises as dnsPromises } from 'node:dns'
import { cache } from '@/lib/cache'
import { rateLimit } from '@/lib/ratelimit'
import { rateLimit as slidingLimit, ipKey, tooMany } from '@/lib/rate-limit'
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
        '-sS', '-L', '--max-redirs', '3', '--compressed', '--max-time', String(timeoutSec),
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

// ─── SSRF-гард (64-F1, H-2) ─────────────────────────────────────────────────
// curlFetch ходит по ЛЮБОМУ url из запроса и читает ответ — без гарда это SSRF:
// http://127.0.0.1:3000/api/*, метаданные облака (169.254.169.254) и т.п.
// Перед fetch резолвим хост через dns.lookup(all) и блокируем приватные/
// loopback/link-local сети (все адреса ответа — иначе round-robin DNS обходит
// проверку по одному адресу). Редиректы ограничены (--max-redirs 3, -L сохранён
// для UX игровых сайтов); локальных фейковых страниц через /api/browse нет —
// мок-страницы браузера рендерятся на клиенте, allowlist не нужен.

class BrowseHostError extends Error {}

function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6: ::ffff:10.0.0.1 (dotted) и ::ffff:a00:1 (hex) — блокируем целиком
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
  const v4 = mapped ? mapped[1] : /^[0-9.]+$/.test(ip) && ip.includes('.') ? ip : null
  if (v4) {
    const [a, b] = v4.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true // 0/8, 10/8, 127/8
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 (CGNAT)
    if (a === 169 && b === 254) return true // 169.254/16 link-local (метаданные облака)
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
    if (a === 192 && b === 168) return true // 192.168/16
    if (a >= 224) return true // multicast 224/4 + reserved 240/4
    return false
  }
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true // unspecified + loopback
  if (lower.startsWith('::ffff:')) return true // IPv4-mapped (hex-форма)
  if (/^f[cd]/.test(lower)) return true // fc00::/7 unique local
  if (/^fe[89ab]/.test(lower)) return true // fe80::/10 link-local
  return false
}

async function assertPublicHost(url: URL): Promise<void> {
  let host = url.hostname
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  let addrs: { address: string; family: number }[]
  try {
    addrs = await dnsPromises.lookup(host, { all: true })
  } catch {
    throw new BrowseHostError('Недоступный адрес')
  }
  if (!addrs.length) throw new BrowseHostError('Недоступный адрес')
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new BrowseHostError('Недоступный адрес')
  }
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

  // SSRF-гард ДО кеша: даже закешированный ответ не должен обходить проверку хоста
  await assertPublicHost(url)

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
  // 61-c: мягкий лимит 120 req/мин на IP (внутри игры это «браузер» — дорого)
  const ipRl = slidingLimit(ipKey(req, 'browse'), { limit: 120, windowMs: 60_000 })
  if (!ipRl.ok) return tooMany(ipRl.retryAfter)

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
    // 64-F1 (H-2): приватный/нерезолвящийся хост — это не «страница не загрузилась»,
    // а запрещённый адрес: отдаём 400, не 502
    if (e instanceof BrowseHostError) {
      return Response.json({ error: 'Недоступный адрес' }, { status: 400 })
    }
    // 61-c: наружу — только безопасный текст; детали (в т.ч. адреса/ошибки
    // внешних сервисов) — в лог сервера
    console.error('[browse] failed:', e instanceof Error ? e.message : e)
    return Response.json({ error: 'Не удалось загрузить страницу' }, { status: 502 })
  }
}
