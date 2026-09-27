// Подписанные сессии админ-панели (HMAC-SHA256 через Web Crypto).
// Работает и в edge-middleware, и в Node-роутах. В cookie лежит ТОЛЬКО
// подписанный токен с истечением — сам ADMIN_KEY никогда не покидает сервер.
//
// Формат токена: `<expiresAtMs>.<nonce32hex>.<hmac_hex>`
// HMAC считается по строке `<expiresAtMs>.<nonce>` секретом = ADMIN_KEY,
// поэтому смена ключа мгновенно инвалидирует все сессии.

export const ADMIN_COOKIE = 'resale_admin'
export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000 // 7 дней
export const SESSION_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000)

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

async function hmac(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
}

/** Постоянно-временное сравнение hex-строк одинаковой длины. */
function timingSafeHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/** Создаёт одноразовую подписанную сессию (каждый вход — новый nonce). */
export async function createSessionToken(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const sig = await hmac(secret, `${exp}.${nonce}`)
  return `${exp}.${nonce}.${sig}`
}

/** Проверяет подпись и срок жизни токена. Секрет = актуальный ADMIN_KEY. */
export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [expS, nonce, sig] = parts
  const exp = Number(expS)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  if (!/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return false
  const expected = await hmac(secret, `${exp}.${nonce}`)
  return timingSafeHex(sig, expected)
}

/** Достаёт токен сессии из cookie запроса (edge-совместимо, без RegExp-конструктора). */
export function readSessionCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return ''
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === ADMIN_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim())
      } catch {
        return ''
      }
    }
  }
  return ''
}
