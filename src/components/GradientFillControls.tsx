import { useState } from 'react'
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
  add: 'Add', dodge: 'Dodge', darken: 'Darker Color', burn: 'Linear Burn', softLight: 'Soft Light', hardLight: 'Hard Light',
}

type BlendCategoryId = 'comp' | 'light' | 'dark' | 'punch'
/** 4 UI groups for the 12-mode blend selector, each non-Comp trio ordered least->most intense. */
const BLEND_CATEGORIES: { id: BlendCategoryId; label: string; modes: BlendMode[] }[] = [
  { id: 'comp', label: 'Composite', modes: ['overwrite', 'normal', 'difference'] },
  { id: 'light', label: 'Lighten', modes: ['screen', 'add', 'dodge'] },
  { id: 'dark', label: 'Darken', modes: ['darken', 'multiply', 'burn'] },
  { id: 'punch', label: 'Contrast', modes: ['softLight', 'overlay', 'hardLight'] },
]
function categoryOf(mode: BlendMode): BlendCategoryId {
  return BLEND_CATEGORIES.find((c) => c.modes.includes(mode))?.id ?? 'comp'
}

/** Grouped 12-mode Blend Mode selector — a 4-way category row (Comp/Light/Dark/Punch) plus the
 * selected category's 3-pill row, one unified layout for both mobile and desktop. Category shown
 * defaults to whichever contains `mode`, but a category click can view a different one before any
 * pill in it is picked (manualCategory); picking a pill clears that override since the derived
 * category already matches. `allowedModes` (Fumiko's Find Edge lock, currently the only caller)
 * disables whichever pills/categories fall outside it rather than removing them, so the layout
 * stays consistent regardless of restriction. */
export function BlendModeCategoryRow({ mode, onChange, allowedModes }: { mode: BlendMode; onChange: (m: BlendMode) => void; allowedModes?: BlendMode[] }) {
  const [manualCategory, setManualCategory] = useState<BlendCategoryId | null>(null)
  const activeCategoryId = manualCategory ?? categoryOf(mode)
  const activeCategory = BLEND_CATEGORIES.find((c) => c.id === activeCategoryId)!
  const isAllowed = (m: BlendMode) => !allowedModes || allowedModes.includes(m)
  // The category actually containing the committed mode — independent of activeCategoryId, which
  // can differ while the user is browsing a category (manualCategory) without having picked a pill
  // in it yet. Underlined regardless of which category is currently viewed/highlighted, so the
  // selected mode's "home" stays visible even while browsing elsewhere.
  const selectedCategoryId = categoryOf(mode)

  return (
    <div className="blend-category-row">
      <div className="segmented-control">
        {BLEND_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={!c.modes.some(isAllowed)}
            className={`segmented-button font-button-label${activeCategoryId === c.id ? ' active' : ''}${selectedCategoryId === c.id ? ' segmented-button-selected-child' : ''}`}
            onClick={() => setManualCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="crop-bottomcontent" style={{ padding: 0, marginTop: 8 }}>
        {activeCategory.modes.map((m) => (
          <button
            key={m}
            type="button"
            disabled={!isAllowed(m)}
            className={`pill-toggle-btn font-button-label${mode === m ? ' active' : ''}`}
            style={{ flex: '1 1 30%' }}
            onClick={() => {
              setManualCategory(null)
              onChange(m)
            }}
          >
            {BLEND_MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Shared 3-stop (or 2-stop, with Duo Tone) gradient color controls — used by Line Art's
 * Botan/Chie/Daiya/Fumiko Gradient Fill Type subtab (`gradientShadow`/`gradientMid`/
 * `gradientHighlight`/`gradientPivot`/`gradientDuoTone`) and Grade tab's Gradient Map processor,
 * so both reuse the exact same ramp editor UI. See fillTypeColor.frag.ts/gradientMap.frag.ts for
 * the shared shader math this UI drives. */
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
 * Art's own 6-option list) lets the row break onto a second line instead of squeezing 6 pills
 * into one — each pill gets an explicit ~1/3-width basis so they land 3-per-row instead of an
 * uneven flex-basis-0 wrap. Grade tab's Gradient Map selector (4 options) doesn't pass this, so
 * it's unaffected — still a single row. */
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
