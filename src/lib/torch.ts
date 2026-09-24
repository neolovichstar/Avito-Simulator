// Настоящий фонарик: включаем вспышку камеры через Torch API (Android Chrome / WebView).
// Если устройство не умеет — честно возвращаем false, игра продолжает работать.

let stream: MediaStream | null = null
let track: MediaStreamTrack | null = null

export async function enableTorch(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false
    stopTorch()
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
    })
    track = stream.getVideoTracks()[0] ?? null
    if (!track) {
      stopTorch()
      return false
    }
    const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean }
    if (!caps.torch) {
      stopTorch()
      return false
    }
    await track.applyConstraints({ advanced: [{ torch: true }] } as unknown as MediaTrackConstraints)
    return true
  } catch {
    stopTorch()
    return false
  }
}

export function stopTorch(): void {
  try {
    track?.stop()
    stream?.getTracks().forEach((t) => t.stop())
  } catch {
    // ignore
  }
  track = null
  stream = null
}
