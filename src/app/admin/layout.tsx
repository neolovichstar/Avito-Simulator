import type { Metadata } from 'next'

// Панель управления — закрытый контур: не индексируется поисковиками
// (плюс X-Robots-Tag: noindex из middleware на все /admin-ответы).

export const metadata: Metadata = {
  title: 'Resale Admin',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
