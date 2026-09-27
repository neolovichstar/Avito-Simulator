export function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + Math.abs(Math.round(n)).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽'
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')
}

export function timeAgo(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return 'только что'
  if (diff < 3600) {
    const m = Math.floor(diff / 60)
    return m === 1 ? '1 минуту назад' : `${m} мин. назад`
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600)
    return h === 1 ? '1 час назад' : `${h} ч. назад`
  }
  if (diff < 86400 * 2) return 'вчера'
  const days = Math.floor(diff / 86400)
  if (days < 7) return `${days} дн. назад`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function fmtTime(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDateTime(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export function hueColor(hue: number, s = 55, l = 45): string {
  return `hsl(${hue} ${s}% ${l}%)`
}

// Убираем эмодзи и управляющие символы — пользователи просили интерфейс без эмодзи
export function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}
