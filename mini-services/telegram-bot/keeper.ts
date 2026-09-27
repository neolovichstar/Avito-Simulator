// Хранитель telegram-бота: запускает bun index.ts и перезапускает его при падении
// или после pkill (обновление кода). bun-процессы в песочнице живут долго,
// bash-надзиратели — нет, поэтому keeper сам bun.
const CHILD = ['bun', 'index.ts']

async function main(): Promise<void> {
  console.log('[keeper] started')
  for (;;) {
    try {
      const proc = Bun.spawn(CHILD, {
        cwd: import.meta.dir,
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'ignore',
      })
      const code = await proc.exited
      console.warn(`[keeper] bot exited (code=${code}) — restart in 2s`)
    } catch (e) {
      console.error('[keeper] spawn error', e)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
}

void main()
