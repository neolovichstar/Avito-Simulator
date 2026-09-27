import { createRoot } from 'react-dom/client'
import GameMap from '../src/components/delivery/GameMap'
function App() {
  return (
    <div style={{ background: '#F6F7F9', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 390, height: 420 }}>
        <GameMap etaMin={15} className="h-full w-full rounded-[24px]" />
      </div>
      <div style={{ width: 390, height: 300 }}>
        <GameMap etaMin={7} className="h-full w-full rounded-[24px]" />
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
