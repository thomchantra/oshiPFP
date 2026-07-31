import { useState } from 'react'
import TabNav from './components/TabNav'
import Card from './components/Card'
import PreviewViewport from './components/PreviewViewport'
import CropPanel from './components/CropPanel'
import ColorPanel from './components/ColorPanel'
import MaximizerPanel from './components/MaximizerPanel'
import ExportPanel from './components/ExportPanel'
import { getTheme, toggleTheme } from './theme'
import { usePipeline } from './gl/usePipeline'
import { useCropInteraction } from './crop/useCropInteraction'
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
  const pipeline = usePipeline()
  const crop = useCropInteraction({
    enabled: tab === 'crop',
    sourceSize: pipeline.sourceSize,
    onRectChange: pipeline.setCropRect,
  })

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="eyebrow">Illustration to PFP</div>
          <div className="app-title">PFP Maximizer</div>
        </div>
        <button className="theme-btn" aria-label="Toggle light/dark mode" onClick={() => setTheme(toggleTheme())}>
          {theme === 'light' ? '☀' : '☾'}
        </button>
      </header>

      <TabNav tabs={TABS} activeId={tab} onSelect={setTab} />

      <div className="tool-panel">
        <Card title="Preview" dot={pipeline.error ? 'amber' : 'dim'} meta="1:1">
          <PreviewViewport
            canvasRef={pipeline.canvasRef}
            viewportRef={crop.viewportRef}
            interactive={tab === 'crop'}
            onPointerDown={crop.handlePointerDown}
            onPointerMove={crop.handlePointerMove}
            onPointerUp={crop.endPointer}
            onPointerCancel={crop.endPointer}
          />
          {pipeline.error && (
            <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 12 }}>{pipeline.error}</p>
          )}
          {!pipeline.sourceSize && !pipeline.error && (
            <p style={{ color: 'var(--text3)', marginTop: 10, fontSize: 12 }}>
              Upload an image from the Crop tab to get started.
            </p>
          )}
        </Card>

        {tab === 'crop' && (
          <CropPanel sourceSize={pipeline.sourceSize} zoom={crop.transform.scale} onLoadFile={pipeline.loadFile} />
        )}
        {tab === 'color' && <ColorPanel onCurveChange={pipeline.setCurveLut} onHslChange={pipeline.setHsl} />}
        {tab === 'maximizer' && <MaximizerPanel onChange={pipeline.setMaximizerParams} />}
        {tab === 'export' && <ExportPanel sourceSize={pipeline.sourceSize} readFinalPixels={pipeline.readFinalPixels} />}
      </div>
    </div>
  )
}
