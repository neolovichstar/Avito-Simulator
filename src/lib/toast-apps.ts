// Маппинг тоста к AppKey (может расширяться позже, сейчас 1:1).
import type { AppKey } from '@/lib/store'

export function openAppForToast(app: AppKey): AppKey {
  return app
}
