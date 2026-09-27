// Настоящий фонарик: вспышка камеры через Torch API (Android Chrome / WebView).
//
// ГЛАВНОЕ ПРАВИЛО — разрешение на камеру запрашивается ОДИН раз за сессию:
// • стрим не останавливаем при выключении фонарика — просто снимаем constraint
//   torch, поэтому повторное включение не дёргает getUserMedia и не спрашивает
//   разрешение заново;
// • статус возможности кэшируется в localStorage: если вспышки нет или юзер
//   отказал — камера больше не беспокоится вовсе, фонарик светит виртуально.
//
// Стрим освобождается при скрытии страницы (вежливость к системе), но статус
// 'ok' сохраняется — при возврате вспышка включится молча.

type TorchStatus = 'unknown' | 'ok' | 'notorch' | 'denied'

const STATUS_KEY = 'avito_sim_torch_status'

let stream: MediaStream | null = null
let track: MediaStreamTrack | null = null
let torchOn = false
let status: TorchStatus = 'unknown'

// Восстанавливаем статус прошлой сессии — чтобы не спрашивать повторно.
try {
  const saved = localStorage.getItem(STATUS_KEY)
  if (saved === 'ok' || saved === 'notorch' || saved === 'denied') status = saved
} catch {
  /* private mode — просто живём без кэша */
}

function saveStatus(): void {
  try {
    if (status !== 'unknown') localStorage.setItem(STATUS_KEY, status)
  } catch {
    /* ignore */
  }
}

async function acquire(): Promise<MediaStreamTrack | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
    })
    track = stream.getVideoTracks()[0] ?? null
    if (!track) {
      release()
      return null
    }
    return track
  } catch {
    // NotAllowedError и прочее — считаем отказом, больше не спрашиваем.
    status = 'denied'
    saveStatus()
    release()
    return null
  }
}

function release(): void {
  try {
    track?.stop()
    stream?.getTracks().forEach((t) => t.stop())
  } catch {
    /* ignore */
  }
  track = null
  stream = null
  torchOn = false
}

/** Включить/выключить фонарик. Возвращает фактическое состояние. */
export async function setTorch(on: boolean): Promise<{ active: boolean; real: boolean }> {
  if (!on) {
    // Выключение — без остановки стрима: разрешение сохраняется «прогретым».
    if (track) {
      try {
        await track.applyConstraints({ advanced: [{ torch: false }] } as unknown as MediaTrackConstraints)
      } catch {
        /* ignore */
      }
    }
    torchOn = false
    return { active: false, real: status === 'ok' }
  }

  // Уже горит — ничего не делаем.
  if (torchOn) return { active: true, real: true }

  // Стрим ещё жив с прошлого раза — не пересоздаём, просто включаем вспышку.
  if (!track) {
    if (status === 'denied' || status === 'notorch') {
      // Разрешение однажды уже было отклонено / вспышки нет — молча светим виртуально.
      return { active: true, real: false }
    }
    const t = await acquire()
    if (!t) return { active: true, real: false }
    const caps = (t.getCapabilities?.() ?? {}) as { torch?: boolean }
    if (!caps.torch) {
      status = 'notorch'
      saveStatus()
      release()
      return { active: true, real: false }
    }
    status = 'ok'
    saveStatus()
  }

  try {
    await track!.applyConstraints({ advanced: [{ torch: true }] } as unknown as MediaTrackConstraints)
    torchOn = true
    return { active: true, real: true }
  } catch {
    torchOn = false
    return { active: true, real: false }
  }
}

/** Освободить камеру (при скрытии вкладки). Статус сохраняется. */
export function releaseTorch(): void {
  if (torchOn) return // горящую вспышку не гасим при сворачивании
  release()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseTorch()
  })
}
