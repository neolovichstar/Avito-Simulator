// Смоук прода: валидный initData → токен → пробег по всем authed GET-роутам.
// Ищет 500-е (реальные баги), отличает их от 401/400. Запуск: bun scripts/smoke-prod.ts
import crypto from 'crypto'

const BOT = process.env.BOT_TOKEN ?? ''
if (!BOT) { console.log('NO BOT_TOKEN'); process.exit(1) }

function buildInitData(): string {
  const user = { id: 900777002, first_name: 'Смоук', username: 'smoke_probe', language_code: 'ru' }
  const params = new URLSearchParams({
    query_id: 'AAFsmoke00000000000000',
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
  })
  const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest()
  params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'))
  return params.toString()
}

const BASE = 'https://avito-simulator.vercel.app'
const auth = await fetch(`${BASE}/api/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ initData: buildInitData() }),
})
const aj = await auth.json().catch(() => ({}))
const tok = aj?.token
if (!tok) { console.log('AUTH FAILED', auth.status, JSON.stringify(aj).slice(0, 200)); process.exit(1) }
console.log('auth OK, user:', aj?.user?.displayName)

const H = { authorization: `Bearer ${tok}` }
const routes = [
  'stats', 'market', 'leaderboard', 'catalog', 'cities', 'bonus', 'day-summary',
  'inventory', 'profile', 'notifications', 'listings', 'chats', 'bank', 'taxes',
  'auction', 'career', 'deliveries', 'repair', 'phones', 'searches', 'favorites',
  'calls', 'music', 'gosuslugi', 'export', 'blocked', 'system', 'users',
]
const bad: Array<{ r: string; s: number; b: string }> = []
for (const r of routes) {
  try {
    const res = await fetch(`${BASE}/api/${r}`, { headers: H, signal: AbortSignal.timeout(15000) })
    if (res.status >= 500) {
      const body = await res.text()
      bad.push({ r, s: res.status, b: body.slice(0, 300) })
    }
    console.log(`${res.status} /api/${r}`)
  } catch (e) {
    console.log(`TIMEOUT/ERR /api/${r}`)
  }
}
console.log(bad.length === 0 ? '\nNO 5xx' : `\n5xx FOUND:`)
for (const b of bad) console.log(`--- /api/${b.r} ${b.s}\n${b.b}`)
