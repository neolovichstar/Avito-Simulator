import { createRoot } from 'react-dom/client'
import DeliveryApp from '../src/components/apps/DeliveryApp'

// Стаб API: реальные ручки DeliveryApp (api.deliveries / pickupDelivery) работают как в игре
const img = (c: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="18" fill="${c}"/><circle cx="60" cy="52" r="22" fill="rgba(255,255,255,0.55)"/><rect x="30" y="84" width="60" height="10" rx="5" fill="rgba(0,0,0,0.12)"/></svg>`)
const now = Date.now()
const min = 60000
const mock = [
  { id: 'd1', kind: 'purchase', listingId: 'l1', title: 'Наушники Apple AirPods Max', image: img('#DDE3EA'), price: 42000, courier: 'Алексей Смирнов', status: 'in_transit', listedCondition: 'good', realCondition: null, createdAt: new Date(now - 90 * min).toISOString(), collectEndsAt: new Date(now - 60 * min).toISOString(), eta: new Date(now + 15 * min).toISOString(), pickupDeadline: null, deliveredAt: null },
  { id: 'd2', kind: 'purchase', listingId: 'l2', title: 'Книга «Мастер и Маргарита»', image: img('#E7DFD2'), price: 850, courier: 'Мария Козлова', status: 'arrived', listedCondition: 'like_new', realCondition: null, createdAt: new Date(now - 200 * min).toISOString(), collectEndsAt: new Date(now - 150 * min).toISOString(), eta: new Date(now - 40 * min).toISOString(), pickupDeadline: new Date(now + 18 * 60 * min).toISOString(), deliveredAt: null },
  { id: 'd3', kind: 'sale', listingId: 'l3', title: 'Кроссовки Nike Air Force 1', image: img('#EAE6DC'), price: 6000, courier: 'Дмитрий Волков', status: 'collecting', listedCondition: 'good', realCondition: null, createdAt: new Date(now - 30 * min).toISOString(), collectEndsAt: new Date(now + 60 * min).toISOString(), eta: new Date(now + 180 * min).toISOString(), pickupDeadline: null, deliveredAt: null },
  { id: 'd4', kind: 'purchase', listingId: 'l4', title: 'Чехол для iPhone 13', image: img('#D8E4DE'), price: 1200, courier: 'Елена Соколова', status: 'delivered', listedCondition: 'good', realCondition: 'good', createdAt: new Date(now - 48 * 60 * min).toISOString(), collectEndsAt: new Date(now - 46 * 60 * min).toISOString(), eta: new Date(now - 44 * 60 * min).toISOString(), pickupDeadline: null, deliveredAt: new Date(now - 43 * 60 * min).toISOString() },
  { id: 'd5', kind: 'purchase', listingId: 'l5', title: 'Принтер старый, не работает', image: img('#E4E0E8'), price: 250, courier: 'Сергей Орлов', status: 'returned', listedCondition: 'satisfactory', realCondition: null, createdAt: new Date(now - 96 * 60 * min).toISOString(), collectEndsAt: new Date(now - 94 * 60 * min).toISOString(), eta: new Date(now - 92 * 60 * min).toISOString(), pickupDeadline: new Date(now - 70 * 60 * min).toISOString(), deliveredAt: new Date(now - 68 * 60 * min).toISOString() },
]
const realFetch = window.fetch.bind(window)
window.fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.includes('/api/deliveries')) {
    return new Response(JSON.stringify({ items: mock }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return realFetch(input as any, init)
}
createRoot(document.getElementById('root')!).render(
  <div style={{ width: 390, height: 844, margin: '16px auto', border: '8px solid #111', borderRadius: 40, overflow: 'hidden', background: '#F6F7F9' }}>
    <DeliveryApp />
  </div>,
)
