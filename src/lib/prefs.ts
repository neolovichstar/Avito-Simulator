'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Глобальные переключатели ОС с сохранением состояния.
//
// Раньше каждый экран держал переключатели в локальном useState: Wi-Fi,
// Bluetooth, автоповорот, вход по пину и т.д. «слетали» при каждом закрытии
// панели/приложения — пользователь видел это как «ВСЕ свитчи сломаны во ВСЕХ
// приложениях». Теперь состояние живёт здесь, в zustand-сторе, и персистится
// в localStorage ('resale_prefs_v1').
//
// Гидратация: стор стартует с дефолтов (SSR-HTML совпадает с первым клиентским
// рендером), затем hydratePrefs() вызывается один раз при монтировании ОС
// (page.tsx) и накатывает сохранённые значения — как батарея в store.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'

const STORAGE_KEY = 'resale_prefs_v1'

export type PrefsKey =
  | 'wifi' // Wi-Fi (центр управления + Настройки)
  | 'mobileData' // Мобильные данные (Настройки)
  | 'bt' // Bluetooth (центр управления + Настройки)
  | 'rotate' // Автоповорот (центр управления + Настройки)
  | 'appNotif' // Уведомления приложений (Настройки)
  | 'bankPin' // Вход по пину (Банк → Безопасность)
  | 'bankOpsNotif' // Уведомления об операциях (Банк → Безопасность)
  | 'allowCalls' // Приватность: принимать входящие звонки
  | 'hideNumber' // Приватность: скрывать свой номер при звонках/чатах
  | 'hideOnline' // Приватность: скрывать статус «онлайн»
  | 'hideBalance' // Приватность: скрывать баланс в профиле

const DEFAULTS: Record<PrefsKey, boolean> = {
  wifi: true,
  mobileData: true,
  bt: false,
  rotate: true,
  appNotif: true,
  bankPin: true,
  bankOpsNotif: true,
  allowCalls: true,
  hideNumber: false,
  hideOnline: false,
  hideBalance: false,
}

export const PREFS_DEFAULTS: Record<PrefsKey, boolean> = DEFAULTS

interface PrefsState extends Record<PrefsKey, boolean> {
  setPref: (key: PrefsKey, value: boolean) => void
}

function loadPersisted(): Partial<Record<PrefsKey, boolean>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<PrefsKey, boolean>> = {}
    for (const k of Object.keys(DEFAULTS) as PrefsKey[]) {
      if (typeof obj[k] === 'boolean') out[k] = obj[k] as boolean
    }
    return out
  } catch {
    return {}
  }
}

export const usePrefs = create<PrefsState>()((set) => ({
  ...DEFAULTS,
  setPref: (key, value) => {
    set({ [key]: value } as Partial<PrefsState>)
    try {
      const cur = usePrefs.getState()
      const data: Record<string, boolean> = {}
      for (const k of Object.keys(DEFAULTS) as PrefsKey[]) data[k] = cur[k]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* приватный режим — просто держим состояние в памяти */
    }
  },
}))

let hydrated = false

// Один раз при монтировании ОС: накатываем сохранённые значения поверх дефолтов.
export function hydratePrefs() {
  if (hydrated) return
  hydrated = true
  const saved = loadPersisted()
  if (Object.keys(saved).length > 0) usePrefs.setState(saved)
}
