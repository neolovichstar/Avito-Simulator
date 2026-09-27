// Проба прода: валидный initData (подписан локальным BOT_TOKEN) → /api/auth на Vercel.
// Если вернётся displayName «Прод-проба» — BOT_TOKEN на Vercel ЕСТЬ и валидация работает.
// Если вернётся «Игрок»/player_* — BOT_TOKEN на Vercel отсутствует (или не совпадает).
import crypto from 'crypto'

const token = process.env.BOT_TOKEN
if (!token) {
  console.log('NO LOCAL BOT_TOKEN — нечем подписать')
  process.exit(1)
}
const user = { id: 900777001, first_name: 'Прод-проба', last_name: '', username: 'prod_probe', language_code: 'ru' }
const params = new URLSearchParams({
  query_id: 'AAFprobe00000000000000',
  user: JSON.stringify(user),
  auth_date: String(Math.floor(Date.now() / 1000)),
})
const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest()
params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'))

const TARGET = process.env.TARGET ?? 'https://avito-simulator.vercel.app'
const res = await fetch(`${TARGET}/api/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ initData: params.toString() }),
})
const j = (await res.json().catch(() => null)) as { user?: { displayName?: string; username?: string } } | null
console.log('status:', res.status)
console.log('displayName:', j?.user?.displayName)
console.log('username:', j?.user?.username)
console.log('VERDICT:', j?.user?.displayName === 'Прод-проба' ? 'BOT_TOKEN на Vercel ЕСТЬ, валидация OK' : 'BOT_TOKEN на Vercel НЕТ/не совпадает → фолбэк Игрок')
