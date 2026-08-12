import { useEffect, useState } from 'react'
import BottomSheet from './BottomSheet'
import GradientSlider from './GradientSlider'
import { IDENTITY_ENHANCE } from '../crop/useCropEnhance'
import { computeTarget, clampDimension } from '../export/computeTarget'
import type { CropMode, EnhanceParams, ResizeMode } from '../types'

interface CropPanelProps {
  mode: CropMode
  onModeChange: (mode: CropMode) => void
  enhance: EnhanceParams
  setEnhance: (updater: (prev: EnhanceParams) => EnhanceParams) => void
  /** Pipeline's current working-resolution size (post-resize when a resize is active, otherwise the raw crop's native size) — see Pipeline.setCropSizeListener. Used to show the resolved Target size in 'original' mode. */
  cropSize: { width: number; height: number } | null
  resizeMode: ResizeMode
  setResizeMode: (mode: ResizeMode) => void
  resizeCustomSize: { width: number; height: number }
  setResizeCustomSize: (updater: (prev: { width: number; height: number }) => { width: number; height: number }) => void
  /** Aspect ratio (width/height) Custom mode was entered with — see useCropResize. Editing one field propagates the other via this ratio. */
  resizeCustomRatio: number
}

const ASPECT_OPTIONS: { value: CropMode; label: string }[] = [
  { value: 'original', label: 'ORIGINAL' },
  { value: 'square', label: '1:1' },
]

const RESIZE_OPTIONS: { value: ResizeMode; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'custom', label: 'Custom' },
]

/**
 * Crop tab's tray, matching Line Art's dual-pane split (fixed viewport
 * above, draggable sheet below) — aspect ratio at the top (was a bare row
 * under the viewport before), Enhancement below it. Enhancement state is
 * lifted to App.tsx (useCropEnhance) rather than local — App.tsx only
 * mounts this panel while tab === 'crop', so local state got wiped every
 * time the user switched tabs and back.
 */
export default function CropPanel({
  mode, onModeChange, enhance, setEnhance,
  cropSize, resizeMode, setResizeMode, resizeCustomSize, setResizeCustomSize, resizeCustomRatio,
}: CropPanelProps) {
  const set = <K extends keyof EnhanceParams>(key: K, value: EnhanceParams[K]) =>
    setEnhance((prev) => ({ ...prev, [key]: value }))

  // Raw text buffers for the Custom width/height fields, same
  // decoupled-until-blur pattern as ExportPanel's own width/height inputs —
  // lets the field sit empty mid-edit without every keystroke snapping back.
  const [widthText, setWidthText] = useState(String(resizeCustomSize.width))
  const [heightText, setHeightText] = useState(String(resizeCustomSize.height))
  useEffect(() => setWidthText(String(resizeCustomSize.width)), [resizeCustomSize.width])
  useEffect(() => setHeightText(String(resizeCustomSize.height)), [resizeCustomSize.height])

  const commitWidth = () => {
    const n = clampDimension(parseInt(widthText, 10) || resizeCustomSize.width)
    const pairedHeight = clampDimension(Math.round(n / resizeCustomRatio))
    setResizeCustomSize(() => ({ width: n, height: pairedHeight }))
    setWidthText(String(n))
    setHeightText(String(pairedHeight))
  }
  const commitHeight = () => {
    const n = clampDimension(parseInt(heightText, 10) || resizeCustomSize.height)
    const pairedWidth = clampDimension(Math.round(n * resizeCustomRatio))
    setResizeCustomSize(() => ({ width: pairedWidth, height: n }))
    setWidthText(String(pairedWidth))
    setHeightText(String(n))
  }

  const resizeTarget = computeTarget(resizeMode, cropSize, resizeCustomSize)

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

      <div className="lineart-divider" />

      <div className="lineart-preprocessing-header">
        <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Resize</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Target</span>
          {resizeMode === 'custom' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
              <input
                type="number"
                className="pill-toggle-btn font-button-label"
                style={{ textAlign: 'center', border: 'none', minWidth: 0 }}
                value={widthText}
                min={1}
                max={8192}
                onChange={(e) => setWidthText(e.target.value)}
                onBlur={commitWidth}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>x</span>
              <input
                type="number"
                className="pill-toggle-btn font-button-label"
                style={{ textAlign: 'center', border: 'none', minWidth: 0 }}
                value={heightText}
                min={1}
                max={8192}
                onChange={(e) => setHeightText(e.target.value)}
                onBlur={commitHeight}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
            </div>
          ) : (
            <span className="pill-toggle-btn font-button-label" style={{ textAlign: 'center', cursor: 'default' }}>
              {resizeTarget ? `${resizeTarget.width}x${resizeTarget.height}` : '—'}
            </span>
          )}
        </div>
      </div>
      <div className="crop-bottomcontent" style={{ padding: 0, marginTop: 8 }}>
        {RESIZE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`pill-toggle-btn font-button-label${resizeMode === opt.value ? ' active' : ''}`}
            onClick={() => setResizeMode(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
