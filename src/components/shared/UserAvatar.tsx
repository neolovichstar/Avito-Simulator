'use client'

import { useState } from 'react'
import { avatarFor, BOT_AVATAR } from '@/lib/avatars'
import { initials } from '@/lib/format'

type Props = {
  name: string
  className?: string
  /** бот/ИИ — показываем робота a30 */
  bot?: boolean
  alt?: string
}

/**
 * Фото-аватар по имени (стабильно между сессиями: hash(name) → a01..a40).
 * При ошибке загрузки — цветная плашка с инициалами.
 */
export function UserAvatar({ name, className = '', bot = false, alt }: Props) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span aria-hidden className={`flex shrink-0 items-center justify-center bg-[#B9BFC9] font-bold text-white ${className}`}>
        {initials(name)}
      </span>
    )
  }
  return (
    <img
      loading="lazy"
      decoding="async"
      src={bot ? BOT_AVATAR : avatarFor(name)}
      onError={() => setFailed(true)}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : true}
      className={`shrink-0 object-cover ${className}`}
    />
  )
}
