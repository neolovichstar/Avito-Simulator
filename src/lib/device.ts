// Реальные датчики устройства → в стор ОС.
// Батарея: Battery Status API (Chrome/Android WebView — то, внутри чего
// работает Telegram). Сеть: navigator.onLine + Network Information API.
// Всё необязательно: где API нет — ОС живёт на встроенной симуляции.

import { useOS, type NetKind } from './store'

interface ConnectionLike {
  effectiveType?: string
  type?: string
  saveData?: boolean
  addEventListener?: (t: string, cb: () => void) => void
  removeEventListener?: (t: string, cb: () => void) => void
}

function kindFrom(conn?: ConnectionLike, online = true): NetKind {
  if (!online) return 'offline'
  const type = conn?.type
  const eff = conn?.effectiveType ?? ''
  if (type === 'wifi' || type === 'ethernet') return 'wifi'
  if (eff === 'slow-2g' || eff === '2g') return 'slow'
  if (eff === '3g') return '3g'
  if (type === 'cellular') return '4g'
  // Нет данных о типе (десктоп, часть WebView): онлайн — считаем Wi-Fi.
  return 'wifi'
}

/** Ставим слушатели сети и батареи. Вызывается один раз при старте. */
export async function initDeviceSensors(): Promise<void> {
  const nav = navigator as Navigator & {
    connection?: ConnectionLike
    getBattery?: () => Promise<{
      level: number
      charging: boolean
      addEventListener: (t: string, cb: () => void) => void
    }>
  }

  // ─── Сеть ────────────────────────────────────────────────────────────────
  const applyNet = () => {
    const conn = nav.connection
    const online = nav.onLine !== false
    useOS.getState().setNet(online, kindFrom(conn, online))
  }
  window.addEventListener('online', applyNet)
  window.addEventListener('offline', applyNet)
  nav.connection?.addEventListener?.('change', applyNet)
  applyNet()

  // ─── Батарея ─────────────────────────────────────────────────────────────
  if (typeof nav.getBattery === 'function') {
    try {
      const bat = await nav.getBattery()
      const applyBat = () => {
        const os = useOS.getState()
        os.setBattery(Math.round(bat.level * 100))
        os.setCharging(bat.charging)
        if (!os.batteryReal) os.setBatteryReal(true)
      }
      applyBat()
      bat.addEventListener('levelchange', applyBat)
      bat.addEventListener('chargingchange', applyBat)
    } catch {
      // API отклонён — остаёмся на симуляции
    }
  }
}
