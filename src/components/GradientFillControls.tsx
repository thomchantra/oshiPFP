import GradientSlider from './GradientSlider'
import ToggleSwitch from './ToggleSwitch'
import type { BlendMode } from '../types'

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  overwrite: 'Overwrite', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', normal: 'Normal', difference: 'Difference',
}

/** Shared 3-stop (or 2-stop, with Duo Tone) gradient color controls — originally Line Art's
 * Botan/Chie/Daiya/Fumiko Gradient Fill Type subtab (`gradientShadow`/`gradientMid`/
 * `gradientHighlight`/`gradientPivot`/`gradientDuoTone`), extracted here so Grade tab's own
 * Gradient Map processor can reuse the exact same ramp editor UI instead of duplicating it
 * (v0.3 post-Hinata close-out). See fillTypeColor.frag.ts/gradientMap.frag.ts for the shared
 * shader math this UI drives. */
export function GradientFillControls({
  shadow, mid, highlight, pivot, duoTone,
  onShadowChange, onMidChange, onHighlightChange, onPivotChange, onDuoToneChange,
}: {
  shadow: [number, number, number]
  mid: [number, number, number]
  highlight: [number, number, number]
  pivot: number
  duoTone: boolean
  onShadowChange: (rgb: [number, number, number]) => void
  onMidChange: (rgb: [number, number, number]) => void
  onHighlightChange: (rgb: [number, number, number]) => void
  onPivotChange: (v: number) => void
  onDuoToneChange: (v: boolean) => void
}) {
  return (
    <>
      <GradientSlider label="Gradient Pivot" value={pivot} min={-1} max={1} defaultValue={0} onChange={onPivotChange} />
      <div
        className="lineart-toggle-row"
        role="button"
        tabIndex={0}
        onClick={() => onDuoToneChange(!duoTone)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onDuoToneChange(!duoTone)
          }
        }}
      >
        <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Duo Tone</span>
        <ToggleSwitch on={duoTone} label="Duo Tone" />
      </div>
      <TintColorRow label="Shadow" tintColor={shadow} onChange={onShadowChange} />
      {!duoTone && <TintColorRow label="Mid" tintColor={mid} onChange={onMidChange} />}
      <TintColorRow label="Highlight" tintColor={highlight} onChange={onHighlightChange} />
    </>
  )
}

/** Just the pill row — callers supply their own "Blend Mode" label/header above. `wrap` (Line
 * Art's own 6-option list, since v0.3's Normal/Difference addition) lets the row break onto a
 * second line instead of squeezing 6 pills into one — each pill gets an explicit ~1/3-width basis
 * so they land 3-per-row instead of an uneven flex-basis-0 wrap. Grade tab's Gradient Map selector
 * (4 options) doesn't pass this, so it's unaffected — still a single row. */
export function BlendModeRow({ mode, options, onChange, wrap }: { mode: BlendMode; options: BlendMode[]; onChange: (m: BlendMode) => void; wrap?: boolean }) {
  return (
    <div className="crop-bottomcontent" style={{ padding: 0, marginBottom: 16, flexWrap: wrap ? 'wrap' : undefined }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`pill-toggle-btn font-button-label${mode === opt ? ' active' : ''}`}
          style={wrap ? { flex: '1 1 30%' } : undefined}
          onClick={() => onChange(opt)}
        >
          {BLEND_MODE_LABELS[opt]}
        </button>
      ))}
    </div>
  )
}

export function TintColorRow({
  label = 'Tint Color',
  tintColor,
  onChange,
}: {
  label?: string
  tintColor: [number, number, number]
  onChange: (rgb: [number, number, number]) => void
}) {
  return (
    <div className="field-row">
      <div className="field-row-label">
        <span className="font-param-label">{label}</span>
      </div>
      <input
        type="color"
        value={rgbToHex(tintColor)}
        onChange={(e) => onChange(hexToRgb(e.target.value))}
        className="tint-color-input"
      />
    </div>
  )
}
