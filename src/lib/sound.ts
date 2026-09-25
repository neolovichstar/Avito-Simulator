'use client'

// Система отклика ОС: только вибро-отклик. Звуки полностью убраны.
// Все прежние WebAudio-синтезаторы (AudioContext, осцилляторы, tone()) удалены —
// модуль физически не может издать ни звука. Оставлен тот же публичный API
// (isEnabled/setEnabled/subscribe/tap/pop/unlock/swipe/success/levelup), чтобы
// все 15+ файлов-потребителей компилировались без правок: tap/swipe стали
// тихими no-op, а pop/unlock/success/levelup дают короткую вибрацию.
// Выключатель хранится в localStorage ('os_sound_v1', по умолчанию включён).

const LS_KEY = 'os_sound_v1'

type Listener = (on: boolean) => void

let enabled = true
if (typeof window !== 'undefined') {
  try {
    enabled = localStorage.getItem(LS_KEY) !== '0'
  } catch {
    /* приватный режим — просто считаем включённым */
  }
}

const listeners = new Set<Listener>()

function buzz(pattern: number | number[]) {
  if (!enabled || typeof navigator === 'undefined') return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* вибрации может не быть — не беда */
  }
}

export const sound = {
  isEnabled: () => enabled,

  setEnabled(v: boolean) {
    enabled = v
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LS_KEY, v ? '1' : '0')
      } catch {
        /* не сохранилось — не беда */
      }
    }
    listeners.forEach((l) => l(v))
  },

  subscribe(l: Listener) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },

  /** Короткий тик: открытие приложения, нажатия. Звуков нет, вибрации нет. */
  tap() {
    /* осознанный no-op: тапы не должны дребезжать в руке */
  },

  /** Всплывающее уведомление (heads-up) — короткий вибро-тычок. */
  pop() {
    buzz(8)
  },

  /** Разблокировка — одиночный вибро-щелчок. */
  unlock() {
    buzz(12)
  },

  /** Свайп страницы/вкладки, удаление карточки. Звуков нет, вибрации нет. */
  swipe() {
    /* осознанный no-op: жесты происходят слишком часто */
  },

  /** Награда/сделка — двойной «пульс». */
  success() {
    buzz([10, 40, 10])
  },

  /** Новый уровень — маленькая «фанфара» из вибро-ударов. */
  levelup() {
    buzz([15, 60, 15, 60, 25])
  },
}
