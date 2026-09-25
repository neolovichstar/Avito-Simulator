'use client'

// ─────────────────────────────────────────────────────────────────────────────
// РЕАЛЬНЫЕ ДАННЫЕ УСТРОЙСТВА для «О телефоне».
//
// Всё, что можно честно узнать из браузера/Telegram WebApp, — показываем как
// есть: модель и версия Android из User-Agent, объём памяти (deviceMemory),
// число ядер (hardwareConcurrency), экран (CSS + физическое разрешение),
// свободное хранилище (StorageManager.estimate()), реальная батарея, сеть
// (Network Information API), язык, часовой пояс, платформа webview.
//
// Модель бренда маскируется под «Resale Phone» — это всё ещё игра, но
// характеристики (память/ядра/экран/батарея) — настоящие, с реального устройства.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeviceInfo {
  model: string // «Resale Phone 16 Pro» + реальный бренд из UA в desc
  deviceBrand: string // Samsung / Google / Xiaomi / iPhone / Desktop…
  osName: string // Android 15 / iOS 18 / Windows 11 / macOS
  osVersion: string | null
  browser: string // Chrome 130 / Telegram WebView…
  ramGb: number | null // navigator.deviceMemory
  cores: number | null // navigator.hardwareConcurrency
  screen: string // «390 × 844 · @3x»
  screenPhysical: string | null // «1179 × 2556» физические пиксели
  storageUsed: string | null // «23,4 ГБ из 128 ГБ»
  storageFree: string | null
  language: string
  timezone: string
  platform: string
  telegramVersion: string | null
  tgPlatform: string | null // telegram-webapp platform: android/ios/tdesktop/web
}

function parseUA(): { brand: string; os: string; osVersion: string | null; browser: string } {
  if (typeof navigator === 'undefined') return { brand: '—', os: '—', osVersion: null, browser: '—' }
  const ua = navigator.userAgent

  // Android-версия
  const android = ua.match(/Android\s([\d.]+)/)
  // iOS-версия
  const ios = ua.match(/OS\s([\d_]+)\slike\sMac\sOS\sX/)
  // Бренд/модель устройства (Android отдаёт «; SM-S918B» и т.п.)
  const andDev = ua.match(/Android[^;]+;\s([^;)]+?)\s*(?:Build|\))/)
  // Браузер
  let browser = 'WebView'
  if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\//.test(ua)) browser = 'Opera'
  else if (/YaBrowser\//.test(ua)) browser = 'Яндекс Браузер'
  else if (/Chrome\/([\d.]+)/.test(ua)) {
    const v = ua.match(/Chrome\/([\d.]+)/)?.[1]?.split('.')[0]
    browser = v ? `Chrome ${v}` : 'Chrome'
  } else if (/Safari\//.test(ua)) browser = 'Safari'

  let brand = '—'
  if (andDev?.[1]) {
    brand = andDev[1].trim().replace(/\sToken$/, '')
  } else if (/iPhone/.test(ua)) brand = 'iPhone'
  else if (/iPad/.test(ua)) brand = 'iPad'
  else if (/Macintosh/.test(ua)) brand = 'Mac'
  else if (/Windows/.test(ua)) brand = 'PC'
  else if (/Linux/.test(ua)) brand = 'Linux'

  let os = '—'
  let osVersion: string | null = null
  if (android) {
    os = 'Android'
    osVersion = android[1]
  } else if (ios) {
    os = 'iOS'
    osVersion = ios[1].replace(/_/g, '.')
  } else if (/Windows NT 10/.test(ua)) os = 'Windows 10/11'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  return { brand, os, osVersion, browser }
}

/** «Красивое» имя ОС с версией — для строки «Версия ОС». */
export function osLabel(): string {
  const { os, osVersion } = parseUA()
  // Внутри мини-аппа это «Android 16» — игра; реальные данные уходят в desc-строки.
  const gameOs = 'Android 17'
  if (osVersion) return `${gameOs} · на базе ${os} ${osVersion}`
  return `${gameOs} · на базе ${os}`
}

/** Бренд устройства, «Resale Phone XX» — модель игрового телефона. */
export function modelLabel(): { model: string; brand: string } {
  const { brand } = parseUA()
  // Модель игрового телефона подбирается по классу устройства ниже (specTier).
  return { model: 'Resale Phone 17', brand }
}

export interface SpecTier {
  tier: 'flagship' | 'upper' | 'mid' | 'lite'
  label: string // «12 ГБ / 512 ГБ» — реальная память устройства
  ramGb: number | null
  storageGuess: string
}

function storageHuman(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes)) return null
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} ГБ`
  return `${Math.round(bytes / 1024 ** 2)} МБ`
}

/** Асинхронный сбор полной информации (storage.estimate — async-only). */
export async function collectDeviceInfo(): Promise<DeviceInfo> {
  const ua = parseUA()
  const nav = navigator as Navigator & {
    deviceMemory?: number
    hardwareConcurrency?: number
    userAgentData?: { platform?: string }
  }

  let storageUsed: string | null = null
  let storageFree: string | null = null
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      storageUsed = storageHuman(est.usage)
      storageFree = storageHuman(est.quota ? est.quota - (est.usage ?? 0) : null)
    }
  } catch {
    /* нет StorageManager — пропускаем */
  }

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const w = typeof window !== 'undefined' ? window.innerWidth : 0
  const h = typeof window !== 'undefined' ? window.innerHeight : 0

  let telegramVersion: string | null = null
  let tgPlatform: string | null = null
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { version?: string; platform?: string } } }).Telegram?.WebApp
    telegramVersion = tg?.version ?? null
    tgPlatform = tg?.platform ?? null
  } catch {
    /* не в Telegram */
  }

  return {
    model: modelLabel().model,
    deviceBrand: ua.brand,
    osName: ua.os,
    osVersion: ua.osVersion,
    browser: ua.browser,
    ramGb: nav.deviceMemory ?? null,
    cores: nav.hardwareConcurrency ?? null,
    screen: `${w} × ${h} · @${dpr}x`,
    screenPhysical:
      w && dpr ? `${Math.round(w * dpr)} × ${Math.round(h * dpr)}` : null,
    storageUsed,
    storageFree,
    language: typeof navigator !== 'undefined' ? navigator.language : '—',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '—',
    platform: nav.userAgentData?.platform ?? nav.platform ?? '—',
    telegramVersion,
    tgPlatform,
  }
}
