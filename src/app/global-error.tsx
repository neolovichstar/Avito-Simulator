'use client'

import { useEffect } from 'react'

// Последний рубеж (падение самого layout): inline-стили, т.к. CSS может не
// загрузиться. Обязателен собственный <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[resale] fatal error:', error)
  }, [error])

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          background: '#0a0a0a',
          color: '#fafafa',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Resale временно недоступен</h1>
          <p style={{ fontSize: 14, opacity: 0.6, margin: '0 0 20px' }}>
            Критическая ошибка. Перезагрузите страницу — прогресс сохранён.
          </p>
          <button
            onClick={reset}
            style={{
              height: 44,
              padding: '0 24px',
              borderRadius: 999,
              background: '#ffffff',
              color: '#0a0a0a',
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Перезагрузить
          </button>
        </div>
      </body>
    </html>
  )
}
