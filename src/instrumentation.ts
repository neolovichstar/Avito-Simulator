// Фоновый движок живого рынка
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startEngine } = await import('@/lib/engine')
  startEngine()
}
