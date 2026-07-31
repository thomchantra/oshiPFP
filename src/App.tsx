import { useState } from 'react'
import TabNav from './components/TabNav'
import CropPanel from './components/CropPanel'
import ColorPanel from './components/ColorPanel'
import MaximizerPanel from './components/MaximizerPanel'
import ExportPanel from './components/ExportPanel'
import { getTheme, toggleTheme } from './theme'
import type { TabDef } from './types'

const TABS: TabDef[] = [
  { id: 'crop', label: 'Crop' },
  { id: 'color', label: 'Color' },
  { id: 'maximizer', label: 'Maximizer' },
  { id: 'export', label: 'Export' },
]

export default function App() {
  const [tab, setTab] = useState('crop')
  const [theme, setTheme] = useState(getTheme)

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="eyebrow">Illustration to PFP</div>
          <div className="app-title">PFP Maximizer</div>
        </div>
        <button
          className="theme-btn"
          aria-label="Toggle light/dark mode"
          onClick={() => setTheme(toggleTheme())}
        >
          {theme === 'light' ? '☀' : '☾'}
        </button>
      </header>

      <TabNav tabs={TABS} activeId={tab} onSelect={setTab} />

      <div className="tool-panel">
        {tab === 'crop' && <CropPanel />}
        {tab === 'color' && <ColorPanel />}
        {tab === 'maximizer' && <MaximizerPanel />}
        {tab === 'export' && <ExportPanel />}
      </div>
    </div>
  )
}
