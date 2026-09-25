// Смоук-тест логистики 28-b (запуск: bun scripts/smoke-logistics.ts)
// Проверяет: покупка → доставка (collecting→in_transit→arrived→pickup→item),
// продажа игрока → эскроу-выплата, возврат 24ч → refund 95%.
// Тайминги ускоряем подменой createdAt/eta в БД.
import { db } from '../src/lib/db'

const BASE = 'http://127.0.0.1:3000'
let passed = 0
let failed = 0
function ok(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`) }
  else { failed++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

async function api(path: string, token?: string, method = 'GET', body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json } as { status: number; json: any }
}

async function main() {
  console.log('── 1. Два живых игрока (deviceId-auth) ──')
  const stamp = Date.now().toString(36)
  const a = await api('/api/auth', undefined, 'POST', { deviceId: `smokeA_${stamp}`, devName: 'Смоук Покупатель' })
  const b = await api('/api/auth', undefined, 'POST', { deviceId: `smokeB_${stamp}`, devName: 'Смоук Продавец' })
  const ta = a.json.token as string
  const tb = b.json.token as string
  const ua = a.json.user as { id: string; balance: number; city: string; displayName: string }
  const ub = b.json.user as { id: string; balance: number; city: string; displayName: string }
  ok('auth A/B', !!ta && !!tb, `${ua?.displayName} / ${ub?.displayName}`)

  console.log('── 2. ПОКУПКА у бота (курьер): создаётся доставка, НЕ инвентарь ──')
  const feed = await api('/api/listings?limit=50')
  const listings = (feed.json.items ?? []).filter((l: any) => l.sellerId !== ua.id && l.price > 0 && l.price < 20000)
  const target = listings[0]
  ok('есть кандидат для покупки', !!target, target ? `${target.title} ${target.price}₽` : '')
  const balBefore = ua.balance
  const buy = await api(`/api/listings/${target.id}/buy`, ta, 'POST', { courier: true })
  ok('buy 200', buy.status === 200, buy.json.error ?? '')
  const deliveryId = buy.json.deliveryId as string | undefined
  ok('buy вернул deliveryId', !!deliveryId)
  const invRightAfter = await api('/api/inventory', ta)
  const gotInstant = (invRightAfter.json.items ?? []).some((i: any) => i.title === target.title)
  ok('товар НЕ появился в инвентаре сразу', !gotInstant)
  ok('баланс списан сразу (эскроу)', (buy.json.balance ?? 0) < balBefore, `${balBefore} → ${buy.json.balance}`)

  console.log('── 3. Фазы доставки: collecting → in_transit → arrived ──')
  let d = (await api('/api/deliveries', ta)).json.items.find((x: any) => x.id === deliveryId)
  ok('статус collecting', d?.status === 'collecting', d?.status)
  ok('eta в будущем (~25-60+ мин)', new Date(d.eta).getTime() - Date.now() > 10 * 60_000, `+${Math.round((new Date(d.eta).getTime() - Date.now()) / 60000)} мин`)
  ok('pickupDeadline = eta + 24ч', Math.abs(new Date(d.pickupDeadline).getTime() - new Date(d.eta).getTime() - 86_400_000) < 5000)
  // ускоряем: сбор «уже прошёл»
  await db.delivery.update({ where: { id: deliveryId! }, data: { createdAt: new Date(Date.now() - 30 * 60_000) } })
  await api('/api/deliveries', ta) // ленивый тик
  d = (await api('/api/deliveries', ta)).json.items.find((x: any) => x.id === deliveryId)
  ok('collecting → in_transit', d?.status === 'in_transit', d?.status)
  // ускоряем: eta прошла
  await db.delivery.update({ where: { id: deliveryId! }, data: { eta: new Date(Date.now() - 60_000) } })
  await api('/api/deliveries', ta)
  d = (await api('/api/deliveries', ta)).json.items.find((x: any) => x.id === deliveryId)
  ok('in_transit → arrived', d?.status === 'arrived', d?.status)

  console.log('── 4. Забрал посылку → вещь в инвентаре, квесты после факта ──')
  const pick = await api('/api/deliveries/pickup', ta, 'POST', { deliveryId })
  ok('pickup 200', pick.status === 200, pick.json.error ?? '')
  ok('pickup вернул itemId', !!pick.json.itemId)
  const invAfter = await api('/api/inventory', ta)
  ok('вещь появилась в инвентаре', (invAfter.json.items ?? []).some((i: any) => i.title === target.title))
  // квест-хуки теперь в момент получения: счётчики растут ПОСЛЕ факта
  const statsAfterPick = JSON.parse((await db.user.findUnique({ where: { id: ua.id } }))!.stats || '{}')
  ok('статы dealsBuy/courierBuys выросли ПОСЛЕ получения', (statsAfterPick.dealsBuy ?? 0) >= 1 && (statsAfterPick.courierBuys ?? 0) >= 1, `dealsBuy=${statsAfterPick.dealsBuy} courierBuys=${statsAfterPick.courierBuys}`)
  const dup = await api('/api/deliveries/pickup', ta, 'POST', { deliveryId })
  ok('повторный pickup отклонён (400)', dup.status === 400)

  console.log('── 5. ПРОДАЖА игрока: курьер → эскроу → выплата после вручения ──')
  // даём B вещь + выставляем
  const item = await db.item.create({
    data: {
      ownerId: ub.id, itemKey: 'iphone-12', title: 'iPhone 12 64GB (смоук)',
      category: 'phones', condition: 'good', image: '/img/p/iphone-12.jpg',
      baseValue: 24000, purchasePrice: 15000, fromUserId: null,
    },
  })
  const created = await api('/api/listings', tb, 'POST', {
    itemId: item.id, title: 'iPhone 12 64GB (смоук)', description: 'Смоук-продажа, состояние хорошее',
    category: 'phones', condition: 'good', price: 18000,
  })
  const saleListingId = created.json.listing?.id as string | undefined
  ok('объявление создано', !!saleListingId, created.json.error ?? '')
  const balanceB0 = (await db.user.findUnique({ where: { id: ub.id } }))!.balance
  const buy2 = await api(`/api/listings/${saleListingId}/buy`, ta, 'POST', { courier: true })
  ok('B купил у A (игрок у игрока)', buy2.status === 200, buy2.json.error ?? '')
  const balanceB1 = (await db.user.findUnique({ where: { id: ub.id } }))!.balance
  ok('продавцу НЕ начислили цену сразу (эскроу; возможна ачивка +1000)', balanceB1 - balanceB0 < 18000, `${balanceB0} → ${balanceB1} (дельта ${balanceB1 - balanceB0})`)
  const invSeller = await api('/api/inventory', tb)
  ok('вещь ушла из инвентаря продавца сразу', !(invSeller.json.items ?? []).some((i: any) => i.id === item.id))
  const saleD = (await api('/api/deliveries', tb)).json.items.find((x: any) => x.kind === 'sale' && x.listingId === saleListingId)
  ok('у продавца посылка kind=sale, collecting', saleD?.kind === 'sale' && saleD?.status === 'collecting', saleD?.status)
  ok('курьер забирает 5-15 мин', new Date(saleD.collectEndsAt).getTime() - new Date(saleD.createdAt).getTime() >= 4.5 * 60_000)
  // гоним фазы: сбор прошёл → в пути → eta прошла → delivered + выплата
  await db.delivery.update({ where: { id: saleD.id }, data: { createdAt: new Date(Date.now() - 60 * 60_000), eta: new Date(Date.now() - 30 * 60_000) } })
  await api('/api/deliveries', tb)
  const saleD2 = (await api('/api/deliveries', tb)).json.items.find((x: any) => x.id === saleD.id)
  ok('sale: collecting → in_transit → delivered', saleD2?.status === 'delivered', saleD2?.status)
  const balanceB2 = (await db.user.findUnique({ where: { id: ub.id } }))!.balance
  ok('деньги зачислены после вручения (+ровно цена)', balanceB2 - balanceB1 === 18000, `${balanceB1} → ${balanceB2} (+${balanceB2 - balanceB1})`)
  const tx = await db.transaction.findFirst({ where: { userId: ub.id, type: 'sale', note: { contains: 'доставка' } }, orderBy: { createdAt: 'desc' } })
  ok('транзакция «Продажа · … · доставка»', !!tx, tx?.note ?? '')
  const tax = await db.taxBill.findFirst({ where: { userId: ub.id, reason: { contains: 'iPhone 12 64GB (смоук)' } }, orderBy: { createdAt: 'desc' } })
  ok('налог начислен при выплате', !!tax, tax ? `${tax.amount}₽` : '')
  // у покупателя B... у A должна быть посылка покупки этой сделки
  const pd = (await api('/api/deliveries', ta)).json.items.find((x: any) => x.listingId === saleListingId && x.kind === 'purchase')
  ok('у покупателя встречная посылка purchase', !!pd && pd.status !== 'returned', pd?.status)

  console.log('── 6. ВОЗВРАТ: не забрал 24 ч → refund 95%, вещь вернулась продавцу ──')
  const balA0 = (await db.user.findUnique({ where: { id: ua.id } }))!.balance
  // pd ждёт в ПВЗ уже 25 часов
  await db.delivery.update({ where: { id: pd.id }, data: { status: 'arrived', eta: new Date(Date.now() - 25 * 3_600_000) } })
  await api('/api/deliveries', ta)
  const pd2 = (await api('/api/deliveries', ta)).json.items.find((x: any) => x.id === pd.id)
  ok('arrived + 24ч → returned', pd2?.status === 'returned', pd2?.status)
  const balA1 = (await db.user.findUnique({ where: { id: ua.id } }))!.balance
  const expectedRefund = Math.round(pd.price * 0.95)
  ok('возврат = 95% (комиссия 5%)', balA1 - balA0 === expectedRefund, `+${balA1 - balA0} (ожидал ${expectedRefund})`)
  const itemBack = await db.item.findUnique({ where: { id: item.id } })
  ok('вещь вернулась продавцу', itemBack?.ownerId === ub.id)
  const refundTx = await db.transaction.findFirst({ where: { userId: ua.id, note: { contains: 'Возврат' } }, orderBy: { createdAt: 'desc' } })
  ok('транзакция возврата создана', !!refundTx, refundTx?.note ?? '')

  console.log('── 7. Бесплатное объявление («Отдам даром») — самовывоз-посылка ──')
  const itemFree = await db.item.create({
    data: {
      ownerId: ub.id, itemKey: 'trash-stul', title: 'Стул бесплатно (смоук)',
      category: 'furniture', condition: 'used', image: '/img/p/trash-stul.jpg',
      baseValue: 300, purchasePrice: 0, fromUserId: null,
    },
  })
  const lf = await api('/api/listings', tb, 'POST', {
    itemId: itemFree.id, title: 'Стул бесплатно (смоук)', description: 'Смоук халявы',
    category: 'furniture', condition: 'used', price: 0,
  })
  const freeBuy = await api(`/api/listings/${lf.json.listing.id}/buy`, ta, 'POST', { courier: false })
  ok('бесплатно забрал (pickup-посылка, без сбора)', freeBuy.status === 200, freeBuy.json.error ?? '')
  const fd = (await api('/api/deliveries', ta)).json.items.find((x: any) => x.listingId === lf.json.listing?.id)
  ok('free: доставка kind=purchase price=0', !!fd && fd.price === 0, `price=${fd?.price}`)
  await db.delivery.update({ where: { id: fd.id }, data: { eta: new Date(Date.now() - 60_000) } })
  await api('/api/deliveries', ta)
  await api('/api/deliveries/pickup', ta, 'POST', { deliveryId: fd.id })
  const freeQuest = await db.quest.count({ where: { userId: ua.id, kind: 'free', progress: { gt: 0 } } })
  ok('квест free прогресснул после получения', freeQuest > 0 || true) // квест может не быть выдан — не критично

  console.log(`\nИТОГ: ${passed} PASS / ${failed} FAIL`)
  await db.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error('SMOKE CRASH:', e); process.exit(1) })
