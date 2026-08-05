import { useEffect, useState } from 'react'
import BottomSheet from './BottomSheet'
import GradientSlider from './GradientSlider'
import type { CropMode, EnhanceParams } from '../types'

interface CropPanelProps {
  mode: CropMode
  onModeChange: (mode: CropMode) => void
  onEnhanceChange: (params: EnhanceParams) => void
}

const ASPECT_OPTIONS: { value: CropMode; label: string }[] = [
  { value: 'original', label: 'ORIGINAL' },
  { value: 'square', label: '1:1' },
]

const IDENTITY_ENHANCE: EnhanceParams = { smooth: 0, sharpen: 0 }

/**
 * Crop tab's tray, matching Line Art's dual-pane split (fixed viewport
 * above, draggable sheet below) — aspect ratio at the top (was a bare row
 * under the viewport before), Enhancement below it. Enhancement state is
 * local + pushed to the pipeline via onEnhanceChange (same pattern as
 * ColorPanel's curve/HSL state), not lifted to App.tsx, since — unlike
 * crop mode, which App.tsx needs for viewport sizing — nothing outside
 * this panel needs to read it.
 */
export default function CropPanel({ mode, onModeChange, onEnhanceChange }: CropPanelProps) {
  const [enhance, setEnhance] = useState<EnhanceParams>(IDENTITY_ENHANCE)

  useEffect(() => {
    onEnhanceChange(enhance)
    // onEnhanceChange identity is stable from usePipeline; only re-run when enhance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enhance])

  const set = <K extends keyof EnhanceParams>(key: K, value: EnhanceParams[K]) =>
    setEnhance((prev) => ({ ...prev, [key]: value }))

  return (
    <BottomSheet>
      <div className="field-row">
        <div className="field-row-label">
          <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Crop Aspect Ratio</span>
        </div>
        <div className="crop-bottomcontent" style={{ padding: 0 }}>
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`pill-toggle-btn font-button-label${opt.value === mode ? ' active' : ''}`}
              onClick={() => onModeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lineart-divider" />

      <div className="lineart-preprocessing-header">
        <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Enhancement</span>
        <button type="button" className="text-reset-btn font-value" onClick={() => setEnhance(IDENTITY_ENHANCE)}>
          Reset
        </button>
      </div>
      <div className="lineart-slidergroup-stack" style={{ marginTop: 8 }}>
        <GradientSlider label="Smooth" value={enhance.smooth} min={0} max={1} defaultValue={0} onChange={(v) => set('smooth', v)} />
        <GradientSlider label="Sharpen" value={enhance.sharpen} min={0} max={2} defaultValue={0} onChange={(v) => set('sharpen', v)} />
      </div>
    </BottomSheet>
  )
}
