import { useState } from 'react'
import Card from './Card'
import Stepper from './Stepper'
import { downloadBlob, exportPng, type FinalPixels } from '../export/exportPica'
import type { ResampleMode } from '../types'

interface ExportPanelProps {
  sourceSize: { width: number; height: number } | null
  readFinalPixels: () => FinalPixels | null
}

const PRESETS = [150, 256, 512]
const RESAMPLE_MODES: ResampleMode[] = ['lanczos3', 'bilinear', 'nearest']

export default function ExportPanel({ sourceSize, readFinalPixels }: ExportPanelProps) {
  const [targetSize, setTargetSize] = useState(256)
  const [resampleMode, setResampleMode] = useState<ResampleMode>('lanczos3')
  const [status, setStatus] = useState<'idle' | 'exporting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleExport = async () => {
    const pixels = readFinalPixels()
    if (!pixels) {
      setStatus('error')
      setErrorMessage('No image loaded yet — upload one from the Crop tab first.')
      return
    }
    setStatus('exporting')
    setErrorMessage(null)
    try {
      const blob = await exportPng(pixels, targetSize, resampleMode)
      downloadBlob(blob, `pfp-${targetSize}.png`)
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Card title="Resolution" dot="dim" meta="1:1">
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              className={`btn${targetSize === size ? ' primary' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setTargetSize(size)}
            >
              {size}px
            </button>
          ))}
        </div>
        <div className="field-row">
          <div className="field-row-label">
            <span>Custom size</span>
            <span className="value">{targetSize}px</span>
          </div>
          <Stepper value={targetSize} min={16} max={4096} step={1} onChange={setTargetSize} />
        </div>
      </Card>
      <Card title="Resample" dot="dim">
        <select
          className="select"
          style={{ width: '100%' }}
          value={resampleMode}
          onChange={(e) => setResampleMode(e.target.value as ResampleMode)}
        >
          {RESAMPLE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </Card>
      <Card title="Export" dot={status === 'error' ? 'amber' : 'dim'} meta="PNG">
        <button
          type="button"
          className="btn primary"
          style={{ width: '100%' }}
          onClick={() => void handleExport()}
          disabled={!sourceSize || status === 'exporting'}
        >
          {status === 'exporting' ? 'Exporting…' : 'Download PNG'}
        </button>
        {errorMessage && <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 12 }}>{errorMessage}</p>}
        {!sourceSize && (
          <p style={{ color: 'var(--text3)', marginTop: 10, fontSize: 12 }}>Upload an image from the Crop tab first.</p>
        )}
      </Card>
    </>
  )
}
