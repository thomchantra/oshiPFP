import { useEffect, useState } from 'react'
import Card from './Card'
import type { BlendMode, MaximizerParams } from '../types'

interface MaximizerPanelProps {
  onChange: (params: MaximizerParams) => void
}

const DEFAULT_PARAMS: MaximizerParams = {
  threshold: 0.5,
  growRadius: 2,
  layerCount: 2,
  layerOpacity: 0,
  blendMode: 'normal',
}

const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen']

export default function MaximizerPanel({ onChange }: MaximizerPanelProps) {
  const [params, setParams] = useState<MaximizerParams>(DEFAULT_PARAMS)

  useEffect(() => {
    onChange(params)
    // onChange identity is stable from usePipeline; only re-run when params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <>
      <Card title="Threshold &amp; grow" dot="dim" meta="Line art">
        <div className="field-row">
          <div className="field-row-label">
            <span>Threshold</span>
            <span className="value">{params.threshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            className="slider"
            min={0}
            max={1}
            step={0.01}
            value={params.threshold}
            onChange={(e) => setParams((p) => ({ ...p, threshold: Number(e.target.value) }))}
          />
        </div>
        <div className="field-row">
          <div className="field-row-label">
            <span>Grow radius</span>
            <span className="value">{params.growRadius}px</span>
          </div>
          <input
            type="range"
            className="slider"
            min={0}
            max={40}
            step={1}
            value={params.growRadius}
            onChange={(e) => setParams((p) => ({ ...p, growRadius: Number(e.target.value) }))}
          />
        </div>
      </Card>
      <Card title="Alpha overdrive" dot="dim" meta="Layer stack">
        <div className="field-row">
          <div className="field-row-label">
            <span>Layer count</span>
            <span className="value">{params.layerCount}</span>
          </div>
          <input
            type="range"
            className="slider"
            min={2}
            max={4}
            step={1}
            value={params.layerCount}
            onChange={(e) => setParams((p) => ({ ...p, layerCount: Number(e.target.value) }))}
          />
        </div>
        <div className="field-row">
          <div className="field-row-label">
            <span>Layer opacity</span>
            <span className="value">{params.layerOpacity.toFixed(2)}</span>
          </div>
          <input
            type="range"
            className="slider"
            min={0}
            max={1}
            step={0.01}
            value={params.layerOpacity}
            onChange={(e) => setParams((p) => ({ ...p, layerOpacity: Number(e.target.value) }))}
          />
        </div>
        <div className="field-row">
          <div className="field-row-label">
            <span>Blend mode</span>
          </div>
          <select
            className="select"
            value={params.blendMode}
            onChange={(e) => setParams((p) => ({ ...p, blendMode: e.target.value as BlendMode }))}
          >
            {BLEND_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
      </Card>
    </>
  )
}
