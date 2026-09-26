// Детерминированные фото-аватары для всех сущностей ОС.
// 40 нарезанных портретов в /img/avatars (a01..a40), a30 — робот для ботов.
export const AVATAR_COUNT = 40
export const BOT_AVATAR = '/img/avatars/a30.webp'

export function avatarFor(name: string): string {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0
  const idx = (Math.abs(h) % AVATAR_COUNT) + 1
  return `/img/avatars/a${String(idx).padStart(2, '0')}.webp`
}
