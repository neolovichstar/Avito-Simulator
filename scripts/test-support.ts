// E2E-проба: поддержка (ИИ), админский чат, магазин Stars, онлайн.
// Запуск: bun scripts/test-support.ts <ORIGIN>
const ORIGIN = process.argv[2] ?? 'http://localhost:3000'
const ADMIN_KEY = process.env.ADMIN_KEY ?? ''

import crypto from 'crypto'

function initDataFor(username: string): string {
  const botToken = process.env.BOT_TOKEN ?? ''
  const user = { id: 9_999_777, first_name: 'Probe', username, language_code: 'ru' }
  const params = new URLSearchParams()
  params.set('auth_date', String(Math.floor(Date.now() / 1000)))
  params.set('query_id', 'AAA123')
  params.set('user', JSON.stringify(user))
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex')
  params.set('hash', hash)
  return params.toString()
}

async function main() {
  const t0 = Date.now()
  // 1. авторизация тест-юзера
  const auth = await fetch(`${ORIGIN}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initDataFor('probe_support'), deviceId: 'probe_support_dev' }),
  })
  const authJson = (await auth.json()) as { token?: string }
  if (!authJson.token) throw new Error(`auth failed: ${auth.status} ${JSON.stringify(authJson)}`)
  const H = { 'content-type': 'application/json', 'x-session-token': authJson.token }
  console.log('1. auth OK', Math.round(Date.now() - t0), 'ms')

  // 2. тред поддержки пустой
  const t1 = await fetch(`${ORIGIN}/api/support`, { headers: H })
  const t1j = (await t1.json()) as { messages: unknown[] }
  console.log('2. GET support →', t1.status, 'messages:', t1j.messages.length)

  // 3. отправка вопроса → ИИ-ответ
  const p1 = await fetch(`${ORIGIN}/api/support`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ text: 'Привет! Подскажи, как получить бонус за вход и сколько дают?' }),
  })
  const p1j = (await p1.json()) as { messages: { role: string; author: string; text: string }[]; adminActive: boolean }
  const ai = p1j.messages.find((m) => m.role === 'support')
  console.log('3. POST support →', p1.status, '| adminActive:', p1j.adminActive)
  console.log('   AI:', ai?.author, JSON.stringify(ai?.text))
  if (ai?.text && /[—–]/.test(ai.text)) console.log('   !! ДЛИННОЕ ТИРЕ В ОТВЕТЕ')

  // 4. магазин
  const s1 = await fetch(`${ORIGIN}/api/shop`, { headers: H })
  const s1j = (await s1.json()) as { items: { sku: string; stars: number }[]; canPay: boolean; cosmetics: { wallpapers: string[]; badge: boolean; tips: number } }
  console.log('4. GET shop →', s1.status, 'items:', s1j.items?.length, 'canPay:', s1j.canPay, 'cos:', JSON.stringify(s1j.cosmetics))

  // 5. invoice на wall.gold
  const s2 = await fetch(`${ORIGIN}/api/shop`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ action: 'invoice', sku: 'wall.gold' }),
  })
  const s2j = (await s2.json()) as { invoiceLink?: string; error?: string }
  console.log('5. invoice wall.gold →', s2.status, s2j.invoiceLink ?? s2j.error)

  // 6. verify (без оплаты — просто не должен падать)
  const s3 = await fetch(`${ORIGIN}/api/shop`, {
    method: 'POST', headers: H, body: JSON.stringify({ action: 'verify' }),
  })
  const s3j = (await s3.json()) as { granted: string[] }
  console.log('6. verify →', s3.status, 'granted:', JSON.stringify(s3j.granted))

  // 7. админ: логин + треды + ответ
  const a0 = await fetch(`${ORIGIN}/api/admin/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: ADMIN_KEY }),
  })
  const cookie = a0.headers.getSetCookie?.().map((c) => c.split(';')[0]).join('; ') ?? ''
  console.log('7. admin auth →', a0.status, 'cookie:', cookie ? 'ok' : 'EMPTY')
  const a1 = await fetch(`${ORIGIN}/api/admin/support`, { headers: { cookie } })
  const a1j = (await a1.json()) as { threads: { userId: string; name: string; unread: number }[] }
  console.log('   threads:', a1.status, a1j.threads?.length, JSON.stringify(a1j.threads?.[0] ?? null))
  const myId = a1j.threads?.[0]?.userId
  if (myId) {
    const a2 = await fetch(`${ORIGIN}/api/admin/support`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ userId: myId, text: 'Привет! Это живой админ, разбираюсь с твоим вопросом.' }),
    })
    console.log('   admin reply →', a2.status)

    // 8. после ответа админа ИИ на паузе
    const p2 = await fetch(`${ORIGIN}/api/support`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ text: 'Спасибо, а ещё вопрос: как выиграть аукцион?' }),
    })
    const p2j = (await p2.json()) as { messages: { role: string }[]; adminActive: boolean }
    console.log('8. after admin → adminActive:', p2j.adminActive, 'aiReply?', p2j.messages.some((m) => m.role === 'support'))
  }

  // 9. онлайн и обороты
  const st = await fetch(`${ORIGIN}/api/stats`, { headers: H })
  const stj = (await st.json()) as { online: number; turnoverRub: number; turnoverStars: number }
  console.log('9. stats →', st.status, JSON.stringify(stj))

  console.log('ALL DONE in', Math.round((Date.now() - t0) / 1000), 's')
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
