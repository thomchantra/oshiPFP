import { useEffect, useState } from 'react'
import Card from './Card'
import CurveEditor from '../curve/CurveEditor'
import { buildRgbLutBuffer, defaultCurvePoints, sampleCurveLUT } from '../curve/spline'
import type { CurvePoint, HslParams } from '../types'

interface ColorPanelProps {
  onCurveChange: (lut: Uint8Array) => void
  onHslChange: (hsl: HslParams) => void
}

const DEFAULT_HSL: HslParams = { hue: 0, saturation: 0, lightness: 0 }

export default function ColorPanel({ onCurveChange, onHslChange }: ColorPanelProps) {
  const [points, setPoints] = useState<CurvePoint[]>(defaultCurvePoints())
  const [hsl, setHsl] = useState<HslParams>(DEFAULT_HSL)

  useEffect(() => {
    onCurveChange(buildRgbLutBuffer(sampleCurveLUT(points)))
    // onCurveChange identity is stable from usePipeline; only re-run when points change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  useEffect(() => {
    onHslChange(hsl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsl])

  return (
    <>
      <Card title="Curve" dot="dim" meta="Master">
        <CurveEditor points={points} onChange={setPoints} />
        <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
          Drag points to adjust · double-click to add/remove
        </p>
      </Card>
      <Card title="HSL" dot="dim">
        <div className="field-row">
          <div className="field-row-label">
            <span>Hue</span>
            <span className="value">{hsl.hue}°</span>
          </div>
          <input
            type="range"
            className="slider"
            min={-180}
            max={180}
            value={hsl.hue}
            onChange={(e) => setHsl((h) => ({ ...h, hue: Number(e.target.value) }))}
          />
        </div>
        <div className="field-row">
          <div className="field-row-label">
            <span>Saturation</span>
            <span className="value">{hsl.saturation.toFixed(2)}</span>
          </div>
          <input
            type="range"
            className="slider"
            min={-1}
            max={1}
            step={0.01}
            value={hsl.saturation}
            onChange={(e) => setHsl((h) => ({ ...h, saturation: Number(e.target.value) }))}
          />
        </div>
        <div className="field-row">
          <div className="field-row-label">
            <span>Lightness</span>
            <span className="value">{hsl.lightness.toFixed(2)}</span>
          </div>
          <input
            type="range"
            className="slider"
            min={-1}
            max={1}
            step={0.01}
            value={hsl.lightness}
            onChange={(e) => setHsl((h) => ({ ...h, lightness: Number(e.target.value) }))}
          />
        </div>
      </Card>
    </>
  )
}
