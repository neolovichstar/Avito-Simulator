// Магазин Telegram Stars: список товаров, invoice-ссылка, сверка оплат.
// Монетизация без p2w: обои, бейдж, «спасибо». Никакого влияния на баланс.
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { SHOP_ITEMS, shopItemBySku, parseCosmetics, grantCosmetics, type Cosmetics } from '@/lib/shop'
import { rateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const BOT_TOKEN = process.env.BOT_TOKEN ?? ''
const API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : ''

interface TgStarTx {
  id: string
  date: number
  amount: number
  source?: { type?: string; user?: { id?: number } }
}

async function tgCall(method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  if (!API) return { ok: false, error: 'no token' }
  try {
    const res = await fetch(`${API}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    const data = (await res.json()) as { ok?: boolean; result?: unknown; description?: string }
    if (!data.ok) {
      console.warn(`[shop] tg ${method} failed:`, data.description)
      return { ok: false, error: data.description ?? `http ${res.status}` }
    }
    return { ok: true, result: (data.result ?? {}) as Record<string, unknown> }
  } catch (e) {
    console.error(`[shop] tg ${method} error`, e)
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

function myResponse(userId: string, cos: Cosmetics, extra?: Record<string, unknown>) {
  return Response.json({
    items: SHOP_ITEMS,
    cosmetics: cos,
    canPay: Boolean(BOT_TOKEN),
    ...extra,
  })
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()
  const cos = parseCosmetics(me.cosmetics)
  return myResponse(me.id, cos)
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return unauthorized()
  if (!rateLimit(`shop:${me.id}`, 20, 60_000)) {
    return Response.json({ error: 'Слишком часто' }, { status: 429 })
  }

  let body: { action?: string; sku?: string }
  try {
    body = (await req.json()) as { action?: string; sku?: string }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }

  // ── Выдать invoice-ссылку для оплаты Stars ────────────────────────────────
  if (body.action === 'invoice') {
    const item = shopItemBySku(body.sku ?? '')
    if (!item) return Response.json({ error: 'Товар не найден' }, { status: 404 })
    if (!BOT_TOKEN) return Response.json({ error: 'Оплата временно недоступна' }, { status: 503 })
    if (!me.telegramId) return Response.json({ error: 'Оплата доступна внутри Telegram' }, { status: 400 })

    const payload = `shop:${me.id}:${item.sku}:${Date.now().toString(36)}`
    const res = await tgCall('createInvoiceLink', {
      title: item.title,
      description: item.desc,
      payload,
      currency: 'XTR',
      prices: [{ label: item.title, amount: item.stars }],
    })
    // ВАЖНО: createInvoiceLink возвращает result строкой-ссылкой (не объектом)
    const r: unknown = res.result
    const link =
      typeof r === 'string'
        ? r
        : typeof (r as Record<string, unknown> | null)?.invoice_link === 'string'
          ? ((r as Record<string, unknown>).invoice_link as string)
          : null
    if (!link) {
      return Response.json({ error: 'Не удалось создать счёт. Попробуй позже', tgError: res.error ?? 'unknown' }, { status: 502 })
    }

    await db.starsPayment.create({
      data: {
        userId: me.id,
        tgUserId: me.telegramId ?? 'unknown',
        sku: item.sku,
        title: item.title,
        stars: item.stars,
        payload,
        status: 'pending',
      },
    })
    return Response.json({ invoiceLink: link })
  }

  // ── Сверка оплат через getStarTransactions: начислить купленное ──────────
  if (body.action === 'verify') {
    const data = await tgCall('getStarTransactions')
    const raw = data.result?.transactions
    const txs: TgStarTx[] = Array.isArray(raw) ? (raw as TgStarTx[]) : []
    const granted: string[] = []

    if (txs.length) {
      const pendings = await db.starsPayment.findMany({
        where: { userId: me.id, status: 'pending', createdAt: { gt: new Date(Date.now() - 48 * 3600_000) } },
        orderBy: { createdAt: 'asc' },
      })
      const tgId = me.telegramId ? Number(me.telegramId) : NaN
      for (const p of pendings) {
        const tx = txs.find(
          (t) =>
            t.amount === p.stars &&
            t.source?.type === 'user' &&
            Number(t.source?.user?.id ?? NaN) === tgId &&
            t.date * 1000 > p.createdAt.getTime() - 60_000,
        )
        if (!tx) continue
        try {
          await db.starsPayment.update({
            where: { id: p.id },
            data: { status: 'paid', chargeId: tx.id, paidAt: new Date() },
          })
        } catch {
          continue // chargeId уже занят другой оплатой
        }
        await db.user.update({
          where: { id: me.id },
          data: { cosmetics: grantCosmetics(me.cosmetics, p.sku) },
        })
        granted.push(p.sku)
      }
    }

    const fresh = await db.user.findUnique({ where: { id: me.id }, select: { cosmetics: true } })
    const cos = parseCosmetics(fresh?.cosmetics ?? me.cosmetics)
    return myResponse(me.id, cos, { granted })
  }

  return Response.json({ error: 'unknown action' }, { status: 400 })
}
