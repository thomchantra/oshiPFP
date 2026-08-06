import BottomSheet from './BottomSheet'
import GradientSlider from './GradientSlider'
import { IDENTITY_ENHANCE } from '../crop/useCropEnhance'
import type { CropMode, EnhanceParams } from '../types'

interface CropPanelProps {
  mode: CropMode
  onModeChange: (mode: CropMode) => void
  enhance: EnhanceParams
  setEnhance: (updater: (prev: EnhanceParams) => EnhanceParams) => void
}

const ASPECT_OPTIONS: { value: CropMode; label: string }[] = [
  { value: 'original', label: 'ORIGINAL' },
  { value: 'square', label: '1:1' },
]

/**
 * Crop tab's tray, matching Line Art's dual-pane split (fixed viewport
 * above, draggable sheet below) — aspect ratio at the top (was a bare row
 * under the viewport before), Enhancement below it. Enhancement state is
 * lifted to App.tsx (useCropEnhance) rather than local — App.tsx only
 * mounts this panel while tab === 'crop', so local state got wiped every
 * time the user switched tabs and back.
 */
export default function CropPanel({ mode, onModeChange, enhance, setEnhance }: CropPanelProps) {
  const set = <K extends keyof EnhanceParams>(key: K, value: EnhanceParams[K]) =>
    setEnhance((prev) => ({ ...prev, [key]: value }))

  return (
    <BottomSheet>
      <div className="field-row" style={{ marginBottom: 24 }}>
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

      <div className="lineart-preprocessing-header">
        <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Enhancement</span>
        <button type="button" className="text-reset-btn font-value" onClick={() => setEnhance(() => IDENTITY_ENHANCE)}>
          Reset
        </button>
      </div>
      <div className="lineart-slidergroup-stack" style={{ marginTop: 8 }}>
        <GradientSlider label="Smooth" value={enhance.smooth} min={0} max={3} defaultValue={0} onChange={(v) => set('smooth', v)} />
        <GradientSlider label="Sharpen" value={enhance.sharpen} min={0} max={5} defaultValue={0} onChange={(v) => set('sharpen', v)} />
      </div>
    </BottomSheet>
  )
}
