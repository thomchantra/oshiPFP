import { useState } from 'react'
import BottomSheet from './BottomSheet'
import IconButton from './IconButton'
import GradientSlider, { type SliderCurve } from './GradientSlider'
import ToggleSwitch from './ToggleSwitch'
import Modal from './Modal'
import Icon from './Icon'
import RampMeter from './RampMeter'
import { HUE_BAND_SWATCHES } from '../color/hslPalette'
import type { BlendMode, FillType, LineArtMode, LineArtParams, ToneShapingParams } from '../types'

interface LineArtPanelProps {
  params: LineArtParams
  onChange: (params: LineArtParams) => void
  /** Resets the currently active algorithm's params to factory defaults and reverts the display mode to Composite — App.tsx owns both (per-mode param cache and the global display-mode toggle), so this is a plain callback rather than something LineArtPanel can derive from params/onChange alone. */
  onReset: () => void
  /** Lifted to App.tsx (rather than local state) so the mobile vertical meter overlay, a sibling of this panel, can show each meter only while its matching section is expanded here. */
  toneLiftExpanded: boolean
  setToneLiftExpanded: (updater: (prev: boolean) => boolean) => void
  colorLiftExpanded: boolean
  setColorLiftExpanded: (updater: (prev: boolean) => boolean) => void
}

const ALGO_OPTIONS: { mode: LineArtMode; label: string; icon: 'rose' | 'spark' | 'diamond' | 'spiral' | 'bear' | 'sun' | 'moon' }[] = [
  { mode: 'pathB', label: 'Botan', icon: 'rose' },
  { mode: 'pathC', label: 'Chie', icon: 'spark' },
  { mode: 'pathD', label: 'Daiya', icon: 'diamond' },
  { mode: 'pathF', label: 'Fumiko', icon: 'spiral' },
  { mode: 'pathG', label: 'Gumi', icon: 'bear' },
  { mode: 'pathH', label: 'Hinata', icon: 'sun' },
  { mode: 'pathI', label: 'Tsukiko', icon: 'moon' },
]

const ALGO_INFO: { mode: LineArtMode; label: string; technique: string; icon: 'rose' | 'spark' | 'diamond' | 'spiral' | 'bear' | 'sun' | 'moon'; blurb: string }[] = [
  {
    mode: 'pathB',
    label: 'Botan',
    technique: 'Distance Transform',
    icon: 'rose',
    blurb:
      "Grows line art evenly outward in every direction, inflating it — the further from a line, the less it's affected. Gives smooth, rounded, chunky outlines.",
  },
  {
    mode: 'pathC',
    label: 'Chie',
    technique: 'Erosion + Soft Gate',
    icon: 'spark',
    blurb:
      "Softly blends color inward from the edges of line art, reads more gently with a gradual transition instead of a crisp added border.",
  },
  {
    mode: 'pathD',
    label: 'Daiya',
    technique: 'Octagon Approximation',
    icon: 'diamond',
    blurb:
      "Grows lines in 4 directions at once (like stamping in a cross + diagonal pattern), which gives a faceted, slightly angular blob shape instead of a perfect circle. At a low radius this turns into a grainy, textured look.",
  },
  {
    mode: 'pathF',
    label: 'Fumiko',
    technique: 'Find Edge + Dilate',
    icon: 'spiral',
    blurb:
      "Detects edges directly instead of thickening existing lines. Produces crisp, naturally colorful edge-lines with real graduated transparency along each line.",
  },
  {
    mode: 'pathG',
    label: 'Gumi',
    technique: 'Luminance Band + Closing',
    icon: 'bear',
    blurb:
      "Isolates a luminance band, boosts its contrast, then closes and cleans up the result — rejects wide fill interiors so only thin strokes survive (or, in Color Bleed mode, a soft stylized ink falloff instead).",
  },
  {
    mode: 'pathH',
    label: 'Hinata',
    technique: 'High Pass (Blur Diff)',
    icon: 'sun',
    blurb:
      "Subtracts a blurred version of the image from itself to isolate high-frequency detail — reads as a soft, painterly edge response rather than a hard line.",
  },
  {
    mode: 'pathI',
    label: 'Tsukiko',
    technique: 'Laplacian',
    icon: 'moon',
    blurb:
      "A single-pass second-order edge kernel — grittier and more detail-sensitive than High Pass, with optional pre-blur/post-sharpen to tune noise vs. definition.",
  },
]

const IDENTITY_TONE_SHAPING: ToneShapingParams = {
  exposure: 0,
  contrast: 0,
  mode: 'clip',
  clipMode: { blackClip: 0, whiteClip: 1 },
  pinchMode: { position: 0.5, expand: 0.3, feathering: 0.5 },
}
const IDENTITY_DENOISE = { intensity: 0, threshold: 0 }
const IDENTITY_COLOR_LIFT = { red: 0, orange: 0, yellow: 0, green: 0, teal: 0, blue: 0, purple: 0, magenta: 0 }

/** Radius sliders' hot spot is almost always 0-3px within a 0-20px range — see CLAUDE.md-adjacent feedback: taper so 0-3 gets 40% of the track instead of linear's ~15%. */
const RADIUS_CURVE: SliderCurve = { breakpoint: 3, breakpointPosition: 0.4 }
/** Gumi's Luminance Ramp Feather is aggressive across its full 0-1 range (v0.3 tuning: a linear
 * slider gives away most of the track to values that blow the detection band wide open) — taper
 * so 0-0.2 (the actually-usable range) gets 65% of the track instead of linear's 20%. */
const FEATHER_CURVE: SliderCurve = { breakpoint: 0.2, breakpointPosition: 0.65 }

function isModified<T extends Record<string, number>>(current: T, identity: T): boolean {
  return (Object.keys(identity) as (keyof T)[]).some((k) => current[k] !== identity[k])
}

/** Tone Lift's identity check spans both ramp modes' values at once (not just the active one) —
 * A/B retention means drift in either should still show the modified dot. */
function isToneShapingModified(current: ToneShapingParams, identity: ToneShapingParams): boolean {
  return (
    current.exposure !== identity.exposure ||
    current.contrast !== identity.contrast ||
    current.mode !== identity.mode ||
    current.clipMode.blackClip !== identity.clipMode.blackClip ||
    current.clipMode.whiteClip !== identity.clipMode.whiteClip ||
    current.pinchMode.position !== identity.pinchMode.position ||
    current.pinchMode.expand !== identity.pinchMode.expand ||
    current.pinchMode.feathering !== identity.pinchMode.feathering
  )
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const COLOR_LIFT_SWATCHES = HUE_BAND_SWATCHES

/** Small accent-color dot shown next to a pre-processing submodule's pill label when its params have drifted from identity — lets the user spot which submodules have edits without expanding each one (see App.tsx-adjacent feedback: expand/collapse is tray-appearance-only now, so this is the only at-a-glance signal left). */
function ModifiedDot({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="modified-dot" aria-hidden="true" />
}

/** Controlled by App.tsx (params live there, not locally) so slider values survive switching away from and back to the Line Art tab — this component used to own the state itself and reset to defaults on every remount. */
export default function LineArtPanel({
  params, onChange, onReset,
  toneLiftExpanded, setToneLiftExpanded, colorLiftExpanded, setColorLiftExpanded,
}: LineArtPanelProps) {
  const [infoOpen, setInfoOpen] = useState(false)
  // Expand/collapse is tray-appearance-only — Tone Lift/Denoise/Color Lift
  // always apply (their identity defaults are no-ops), so this no longer
  // gates the effect the way toneShapingEnabled/denoiseEnabled used to.
  const [denoiseExpanded, setDenoiseExpanded] = useState(false)

  const set = <K extends keyof LineArtParams>(key: K, value: LineArtParams[K]) =>
    onChange({ ...params, [key]: value })

  // App.tsx caches params per algorithm and swaps in the right (previously
  // edited, or default) object for whichever mode this resolves to — so this
  // just signals "switch to this mode," it doesn't need to carry field values.
  const selectMode = (mode: LineArtMode) => onChange({ ...params, mode })

  const opacityPct = Math.round(params.opacity * 100)

  return (
    <BottomSheet>
      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title="Line Expansion Algorithms">
        {ALGO_INFO.map((info) => (
          <div key={info.mode} className="algo-info-entry">
            <div className="algo-info-entry-title">
              <Icon name={info.icon} size={20} color="var(--accent-title)" className="icon" />
              <span className="font-button-label" style={{ color: 'var(--accent-title)' }}>{info.label}</span>
              <span className="font-value algo-info-entry-technique" style={{ color: 'var(--accent-dark)', opacity: 0.7 }}>{info.technique}</span>
            </div>
            <p className="algo-info-entry-body">{info.blurb}</p>
          </div>
        ))}
      </Modal>

      <div className="lineart-algoselector">
        <div className="lineart-algoselector-header">
          <div className="lineart-algoselector-header-label">
            <p className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Line Expansion Algorithm</p>
            <button type="button" className="info-btn" aria-label="About these algorithms" onClick={() => setInfoOpen(true)}>
              i
            </button>
          </div>
          <button type="button" className="text-reset-btn font-value" onClick={onReset}>
            Reset
          </button>
        </div>
        <div className="lineart-algoselector-row">
          {ALGO_OPTIONS.map((opt) => (
            <IconButton
              key={opt.mode}
              icon={opt.icon}
              variant="secondary"
              active={params.mode === opt.mode}
              onClick={() => selectMode(opt.mode)}
            >
              {opt.label}
            </IconButton>
          ))}
        </div>
      </div>

      {/* Chie (pathC) erodes the raw crop directly (see pipeline.ts's pathC
          branch) rather than reading colorCorrect/denoise's output like every
          other mode — Tone Lift/Denoise/Color Lift are real no-ops here, so
          hide them rather than leave dead controls the user can fiddle with
          for nothing. */}
      {params.mode !== 'pathC' && (
      <div className="lineart-preprocessing">
        <div className="lineart-preprocessing-header">
          <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Pre-detection Tuning</span>
          <button
            type="button"
            className="text-reset-btn font-value"
            onClick={() =>
              onChange({
                ...params,
                toneShaping: IDENTITY_TONE_SHAPING,
                denoise: IDENTITY_DENOISE,
                colorLift: IDENTITY_COLOR_LIFT,
              })
            }
          >
            Reset
          </button>
        </div>
        <div className="lineart-preprocessing-toggles">
          <button
            type="button"
            className={`pill-toggle-btn font-button-label${toneLiftExpanded ? ' active' : ''}`}
            onClick={() => setToneLiftExpanded((v) => !v)}
          >
            <ModifiedDot show={isToneShapingModified(params.toneShaping, IDENTITY_TONE_SHAPING)} />
            Tone Lift
          </button>
          <button
            type="button"
            className={`pill-toggle-btn font-button-label${colorLiftExpanded ? ' active' : ''}`}
            onClick={() => setColorLiftExpanded((v) => !v)}
          >
            <ModifiedDot show={isModified(params.colorLift, IDENTITY_COLOR_LIFT)} />
            Color Lift
          </button>
          <button
            type="button"
            className={`pill-toggle-btn font-button-label${denoiseExpanded ? ' active' : ''}`}
            onClick={() => setDenoiseExpanded((v) => !v)}
          >
            <ModifiedDot show={isModified(params.denoise, IDENTITY_DENOISE)} />
            Denoise
          </button>
        </div>

        {toneLiftExpanded && (
          <div className="lineart-slidergroup-stack">
            <div className="rampmeter-desktop-only">
              <RampMeter kind="tone" toneShaping={params.toneShaping} />
            </div>
            <RampModeRow
              mode={params.toneShaping.mode}
              onChange={(m) => set('toneShaping', { ...params.toneShaping, mode: m })}
            />
            <GradientSlider
              label="Exposure" value={params.toneShaping.exposure} min={-3} max={3} defaultValue={0}
              onChange={(v) => set('toneShaping', { ...params.toneShaping, exposure: v })}
            />
            <GradientSlider
              label="Contrast" value={params.toneShaping.contrast} min={-0.8} max={2} defaultValue={0}
              onChange={(v) => set('toneShaping', { ...params.toneShaping, contrast: v })}
            />
            {params.toneShaping.mode === 'clip' ? (
              <>
                <GradientSlider
                  label="Black Clip" value={params.toneShaping.clipMode.blackClip} min={0} max={1} defaultValue={0}
                  trackGradient="linear-gradient(90deg, #000000, #FFFFFF)"
                  onChange={(v) => set('toneShaping', { ...params.toneShaping, clipMode: { ...params.toneShaping.clipMode, blackClip: Math.min(v, params.toneShaping.clipMode.whiteClip) } })}
                />
                <GradientSlider
                  label="White Clip" value={params.toneShaping.clipMode.whiteClip} min={0} max={1} defaultValue={1}
                  trackGradient="linear-gradient(90deg, #000000, #FFFFFF)"
                  onChange={(v) => set('toneShaping', { ...params.toneShaping, clipMode: { ...params.toneShaping.clipMode, whiteClip: Math.max(v, params.toneShaping.clipMode.blackClip) } })}
                />
              </>
            ) : (
              <>
                <GradientSlider
                  label="Pinch Position" value={params.toneShaping.pinchMode.position} min={0} max={1} defaultValue={0.5}
                  trackGradient="linear-gradient(90deg, #000000, #FFFFFF)"
                  onChange={(v) => set('toneShaping', { ...params.toneShaping, pinchMode: { ...params.toneShaping.pinchMode, position: v } })}
                />
                <GradientSlider
                  label="Pinch Size" value={params.toneShaping.pinchMode.expand} min={0} max={1} defaultValue={0.3}
                  onChange={(v) => set('toneShaping', { ...params.toneShaping, pinchMode: { ...params.toneShaping.pinchMode, expand: v } })}
                />
                <GradientSlider
                  label="Pinch Feathering" value={params.toneShaping.pinchMode.feathering} min={0} max={1} defaultValue={0.5}
                  onChange={(v) => set('toneShaping', { ...params.toneShaping, pinchMode: { ...params.toneShaping.pinchMode, feathering: v } })}
                />
              </>
            )}
          </div>
        )}
        {toneLiftExpanded && colorLiftExpanded && <div className="lineart-divider" />}
        {colorLiftExpanded && (
          <div className="lineart-slidergroup-stack">
            <div className="rampmeter-desktop-only">
              <RampMeter kind="color" colorLift={params.colorLift} />
            </div>
            {COLOR_LIFT_SWATCHES.map((swatch) => (
              <GradientSlider
                key={swatch.key}
                label={`${swatch.label} Lift`}
                value={params.colorLift[swatch.key]}
                min={-1}
                max={1}
                defaultValue={0}
                trackGradient={`linear-gradient(90deg, #000000, ${swatch.hex}, #FFFFFF)`}
                onChange={(v) => set('colorLift', { ...params.colorLift, [swatch.key]: v })}
              />
            ))}
          </div>
        )}
        {(toneLiftExpanded || colorLiftExpanded) && denoiseExpanded && <div className="lineart-divider" />}
        {denoiseExpanded && (
          <div className="lineart-slidergroup-stack">
            <GradientSlider
              label="Intensity" value={params.denoise.intensity} min={0} max={1} defaultValue={0}
              onChange={(v) => set('denoise', { ...params.denoise, intensity: v })}
            />
            <GradientSlider
              label="Threshold" value={params.denoise.threshold} min={0} max={1} defaultValue={0}
              onChange={(v) => set('denoise', { ...params.denoise, threshold: v })}
            />
          </div>
        )}
      </div>
      )}
      <div className="lineart-divider" />

      {/* Blend Mode + Overlay Opacity grouped under one header/Reset (v0.3 tuning UI pass) —
          previously two separate blocks split by a divider; grouped since they're both
          "how the resolved ink combines with the base," unlike everything below which is
          algorithm-specific detection tuning. Shared across all 7 algorithms. */}
      <div className="lineart-preprocessing-header">
        <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Blend Mode</span>
        <button
          type="button"
          className="text-reset-btn font-value"
          onClick={() => onChange({ ...params, blendMode: 'multiply', opacity: 1 })}
        >
          Reset
        </button>
      </div>
      <BlendModeRow
        mode={params.blendMode}
        options={params.mode === 'pathF' && params.findEdge ? FIND_EDGE_BLEND_OPTIONS : ALL_BLEND_OPTIONS}
        onChange={(v) => set('blendMode', v)}
      />
      <GradientSlider
        label="Overlay Opacity" value={params.opacity} min={0} max={3} defaultValue={1}
        formatValue={() => `${opacityPct}%`}
        onChange={(v) => set('opacity', v)}
      />
      <div className="lineart-divider" />

      <div className="lineart-slidergroup-stack">
        {params.mode === 'pathB' && (
          <>
            <GradientSlider label="Threshold" value={params.threshold} min={0} max={1} defaultValue={0} onChange={(v) => set('threshold', v)} />
            <GradientSlider label="Radius (px)" value={params.radius} min={0} max={20} defaultValue={1} step={1} onChange={(v) => set('radius', v)} />
            <GradientSlider label="Hardness" value={params.hardness} min={-1} max={1} defaultValue={0} onChange={(v) => set('hardness', v)} />
            <GradientSlider label="Blob Contrast" value={params.blobContrast} min={0.2} max={5} defaultValue={1} onChange={(v) => set('blobContrast', v)} />
            <div className="lineart-divider" />
            <InvertFillRow on={params.fillInvert} onChange={(v) => set('fillInvert', v)} />
            <FillTypeRow value={params.fillType} onChange={(v) => set('fillType', v)} />
            {params.fillType === 'image' && (
              <GradientSlider label="Color Contrast" value={params.colorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('colorContrast', v)} />
            )}
            {params.fillType === 'solid' && (
              <TintColorRow label="Line Color" tintColor={params.tintColor} onChange={(rgb) => set('tintColor', rgb)} />
            )}
            {params.fillType === 'gradient' && (
              <GradientFillControls
                shadow={params.gradientShadow} mid={params.gradientMid} highlight={params.gradientHighlight}
                pivot={params.gradientPivot} duoTone={params.gradientDuoTone}
                onShadowChange={(rgb) => set('gradientShadow', rgb)}
                onMidChange={(rgb) => set('gradientMid', rgb)}
                onHighlightChange={(rgb) => set('gradientHighlight', rgb)}
                onPivotChange={(v) => set('gradientPivot', v)}
                onDuoToneChange={(v) => set('gradientDuoTone', v)}
              />
            )}
          </>
        )}

        {params.mode === 'pathC' && (
          <>
            <GradientSlider label="Gate Threshold" value={params.gateThreshold} min={0} max={1} defaultValue={0.05} onChange={(v) => set('gateThreshold', v)} />
            <GradientSlider label="Radius (texels)" value={params.radius} min={0} max={20} defaultValue={1} step={0.01} curve={RADIUS_CURVE} onChange={(v) => set('radius', v)} />
            <GradientSlider label="Hardness" value={params.hardness} min={-1} max={1} defaultValue={0} onChange={(v) => set('hardness', v)} />
            <div className="lineart-divider" />
            <InvertFillRow on={params.fillInvert} onChange={(v) => set('fillInvert', v)} />
            <FillTypeRow value={params.fillType} onChange={(v) => set('fillType', v)} />
            {params.fillType === 'image' && (
              <GradientSlider label="Color Contrast" value={params.colorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('colorContrast', v)} />
            )}
            {params.fillType === 'solid' && (
              <TintColorRow tintColor={params.tintColor} onChange={(rgb) => set('tintColor', rgb)} />
            )}
            {params.fillType === 'gradient' && (
              <GradientFillControls
                shadow={params.gradientShadow} mid={params.gradientMid} highlight={params.gradientHighlight}
                pivot={params.gradientPivot} duoTone={params.gradientDuoTone}
                onShadowChange={(rgb) => set('gradientShadow', rgb)}
                onMidChange={(rgb) => set('gradientMid', rgb)}
                onHighlightChange={(rgb) => set('gradientHighlight', rgb)}
                onPivotChange={(v) => set('gradientPivot', v)}
                onDuoToneChange={(v) => set('gradientDuoTone', v)}
              />
            )}
          </>
        )}

        {params.mode === 'pathD' && (
          <>
            <GradientSlider label="Threshold" value={params.threshold} min={0} max={1} defaultValue={0.05} onChange={(v) => set('threshold', v)} />
            <GradientSlider label="Radius (texels)" value={params.radius} min={0} max={20} defaultValue={2} step={1} onChange={(v) => set('radius', v)} />
            <GradientSlider label="Hardness" value={params.hardness} min={-1} max={1} defaultValue={0} onChange={(v) => set('hardness', v)} />
            <div className="lineart-divider" />
            <InvertFillRow on={params.fillInvert} onChange={(v) => set('fillInvert', v)} />
            <FillTypeRow value={params.fillType} onChange={(v) => set('fillType', v)} />
            {params.fillType === 'image' && (
              <>
                <GradientSlider label="Color Contrast" value={params.colorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('colorContrast', v)} />
                <GradientSlider label="Vivid Deadzone" value={params.vividDeadzone} min={0} max={0.6} defaultValue={0.15} onChange={(v) => set('vividDeadzone', v)} />
                <GradientSlider label="Vivid Boost" value={params.vividBoost} min={1} max={4} defaultValue={1} onChange={(v) => set('vividBoost', v)} />
              </>
            )}
            {params.fillType === 'solid' && (
              <TintColorRow tintColor={params.tintColor} onChange={(rgb) => set('tintColor', rgb)} />
            )}
            {params.fillType === 'gradient' && (
              <GradientFillControls
                shadow={params.gradientShadow} mid={params.gradientMid} highlight={params.gradientHighlight}
                pivot={params.gradientPivot} duoTone={params.gradientDuoTone}
                onShadowChange={(rgb) => set('gradientShadow', rgb)}
                onMidChange={(rgb) => set('gradientMid', rgb)}
                onHighlightChange={(rgb) => set('gradientHighlight', rgb)}
                onPivotChange={(v) => set('gradientPivot', v)}
                onDuoToneChange={(v) => set('gradientDuoTone', v)}
              />
            )}
          </>
        )}

        {params.mode === 'pathF' && (
          <>
            <GradientSlider label="Sensitivity" value={params.sensitivity} min={0.5} max={20} defaultValue={3} onChange={(v) => set('sensitivity', v)} />
            <GradientSlider label="Radius (texels)" value={params.radius} min={0} max={3} defaultValue={0.2} step={0.01} onChange={(v) => set('radius', v)} />
            <GradientSlider label="Saturation" value={params.saturation} min={0} max={2} defaultValue={0.5} onChange={(v) => set('saturation', v)} />
            <GradientSlider label="Hardness" value={params.hardness} min={-1} max={1} defaultValue={0} onChange={(v) => set('hardness', v)} />
            <div className="lineart-divider" />
            <div
              className="lineart-toggle-row"
              role="button"
              tabIndex={0}
              onClick={() => set('findEdge', !params.findEdge)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  set('findEdge', !params.findEdge)
                }
              }}
            >
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Find Edge</span>
              <ToggleSwitch on={params.findEdge} label="Find Edge" />
            </div>
            {!params.findEdge && (
              <>
                <InvertFillRow on={params.fillInvert} onChange={(v) => set('fillInvert', v)} />
                <FillTypeRow value={params.fillType} onChange={(v) => set('fillType', v)} />
                {params.fillType === 'image' && (
                  <>
                    <GradientSlider label="Color Contrast" value={params.colorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('colorContrast', v)} />
                    <GradientSlider label="Vivid Deadzone" value={params.vividDeadzone} min={0} max={0.6} defaultValue={0.15} onChange={(v) => set('vividDeadzone', v)} />
                    <GradientSlider label="Vivid Boost" value={params.vividBoost} min={1} max={4} defaultValue={1} onChange={(v) => set('vividBoost', v)} />
                  </>
                )}
                {params.fillType === 'solid' && (
                  <TintColorRow tintColor={params.tintColor} onChange={(rgb) => set('tintColor', rgb)} />
                )}
                {params.fillType === 'gradient' && (
                  <GradientFillControls
                    shadow={params.gradientShadow} mid={params.gradientMid} highlight={params.gradientHighlight}
                    pivot={params.gradientPivot} duoTone={params.gradientDuoTone}
                    onShadowChange={(rgb) => set('gradientShadow', rgb)}
                    onMidChange={(rgb) => set('gradientMid', rgb)}
                    onHighlightChange={(rgb) => set('gradientHighlight', rgb)}
                    onPivotChange={(v) => set('gradientPivot', v)}
                    onDuoToneChange={(v) => set('gradientDuoTone', v)}
                  />
                )}
              </>
            )}
          </>
        )}

        {params.mode === 'pathG' && (
          <>
            {/* Luminance Detection sits above Operation Mode (v0.3 tuning UI pass) — it's the
                shared upstream stage both Line and Fill operation modes read their detection
                input from, not something scoped to either one. "(always on)" dropped from the
                old label since that's now self-evident from its position. */}
            <div className="lineart-preprocessing-header">
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Luminance Detection</span>
              <button
                type="button"
                className="text-reset-btn font-value"
                onClick={() =>
                  onChange({ ...params, gumiRampFloor: 0, gumiRampInnerLow: 0, gumiRampInnerHigh: 0.6, gumiRampCeiling: 1, gumiRampFeather: 0.12 })
                }
              >
                Reset
              </button>
            </div>
            {/* Desktop-only for now, matching Tone Lift/Color Lift's own meters — mobile's
                vertical-stack placement deferred until all algos are tuned (docs/oshiPFP-v0.3-
                tuningspecs.md). */}
            <div className="rampmeter-desktop-only">
              <RampMeter kind="gumiRamp" gumiRamp={params} />
            </div>
            <GradientSlider
              label="Low Clip" value={params.gumiRampInnerLow} min={0} max={1} defaultValue={0}
              trackGradient="linear-gradient(90deg, #000000, #FFFFFF)"
              onChange={(v) => onChange({ ...params, gumiRampInnerLow: v, gumiRampFloor: Math.min(params.gumiRampFloor, v) })}
            />
            <GradientSlider
              label="High Clip" value={params.gumiRampInnerHigh} min={0} max={1} defaultValue={0.6}
              trackGradient="linear-gradient(90deg, #000000, #FFFFFF)"
              onChange={(v) => onChange({ ...params, gumiRampInnerHigh: v, gumiRampCeiling: Math.max(params.gumiRampCeiling, v) })}
            />
            {/* Floor/Ceiling only affect the ramp once Feather > 0 — at Feather=0,
                plateauRamp.frag.ts's rampStart/rampEnd snap straight to Low/High Clip
                regardless of what Floor/Ceiling are set to (see its own doc comment), so
                they're structural no-ops here, not just untouched. Greyed out instead of
                left silently inert.

                Also clamped to Low/High Clip themselves: the shader wraps each in its own
                outer min()/max() (rampStart = min(mix(...), LowClip - eps); rampEnd =
                max(mix(...), HighClip + eps)), so Floor can never push past Low Clip and
                Ceiling can never fall below High Clip no matter what they're set to —
                anything past that boundary was a dead zone on the slider. Capped here
                instead, and Low/High Clip's own onChange drags Floor/Ceiling back inside
                bounds if they'd otherwise end up on the wrong side of a newly-moved
                boundary. */}
            <GradientSlider
              label="Floor" value={params.gumiRampFloor} min={0} max={params.gumiRampInnerLow} defaultValue={0}
              disabled={params.gumiRampFeather === 0 || params.gumiRampInnerLow === 0}
              onChange={(v) => set('gumiRampFloor', v)}
            />
            <GradientSlider
              label="Ceiling" value={params.gumiRampCeiling} min={params.gumiRampInnerHigh} max={1} defaultValue={1}
              disabled={params.gumiRampFeather === 0 || params.gumiRampInnerHigh === 1}
              onChange={(v) => set('gumiRampCeiling', v)}
            />
            <GradientSlider label="Feather" value={params.gumiRampFeather} min={0} max={1} defaultValue={0.12} step={0.001} curve={FEATHER_CURVE} onChange={(v) => set('gumiRampFeather', v)} />

            <div className="lineart-divider" />
            <div className="lineart-preprocessing-header">
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Operation Mode</span>
              <button
                type="button"
                className="text-reset-btn font-value"
                onClick={() =>
                  onChange({
                    ...params,
                    gumiFillMode: false,
                    threshold: 0.5,
                    radius: 1,
                    gumiContrastBoost: 1,
                    blobMaxDt: 2,
                    gumiGapClosing: true,
                    gumiBlobGamma: 1,
                    gumiOverdrive: 0,
                    hardness: 1,
                    gumiLineFillType: 'solid',
                    gumiLineSolidColor: [0, 0, 0],
                    gumiLineInvert: false,
                    gumiFillRadius: 8,
                    gumiFillInvert: false,
                    gumiFillType: 'image',
                    gumiFillSolidColor: [0, 0, 0],
                    gumiFillPixelThreshold: false,
                  })
                }
              >
                Reset
              </button>
            </div>
            <OperationModeRow fillMode={params.gumiFillMode} onChange={(v) => set('gumiFillMode', v)} />

            {!params.gumiFillMode ? (
              <>
                <GradientSlider label="Threshold" value={params.threshold} min={0} max={1} defaultValue={0.5} onChange={(v) => set('threshold', v)} />
                <GradientSlider label="Detection Radius" value={params.radius} min={0} max={40} defaultValue={1} step={1} curve={RADIUS_CURVE} onChange={(v) => set('radius', v)} />
                <GradientSlider label="Contrast Boost" value={params.gumiContrastBoost} min={0} max={2} defaultValue={1} onChange={(v) => set('gumiContrastBoost', v)} />
                <GradientSlider label="Maximum Blob Size" value={params.blobMaxDt} min={1} max={20} defaultValue={2} onChange={(v) => set('blobMaxDt', v)} />
                {/* Prototype (v0.3 tuning) — fixed-radius grow-then-shrink closing pass applied
                    before the blob-suppression/fill split below, meant to bridge small gaps at
                    V/Y stroke intersections without thickening straight runs the way cranking
                    Detection Radius does. Boolean-only for now; see pipeline.ts's
                    GUMI_GAP_CLOSING_RADIUS for the hardcoded value being validated. Also feeds
                    Fill mode's boundary (same closed mask both read), same cross-cutting
                    relationship Maximum Blob Size doesn't have but this and Detection Contrast
                    do — kept here since both are mask-geometry refinements of this same
                    detection, not a Fill-specific concern. */}
                <div
                  className="lineart-toggle-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => set('gumiGapClosing', !params.gumiGapClosing)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      set('gumiGapClosing', !params.gumiGapClosing)
                    }
                  }}
                >
                  <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Gap Closing (prototype)</span>
                  <ToggleSwitch on={params.gumiGapClosing} label="Gap Closing" />
                </div>
                {/* Also shared with Fill mode's boundary (v0.3 tuning, "detection offset") —
                    reshapes the distance-to-edge boundary from a hard single-pixel cutoff into
                    an antialiased, contrast-adjustable falloff, to help clean up residual
                    speckle at blob edges without touching the main ramp/threshold. */}
                <GradientSlider label="Detection Contrast" value={params.gumiBlobGamma} min={0.2} max={5} defaultValue={1} onChange={(v) => set('gumiBlobGamma', v)} />
                {/* Optical post-process (v0.3 tuning), not algorithm changes — see pipeline.ts's
                    runGumiLinePostProcess. Overdrive genuinely thickens already-thin strokes
                    (Maximum Blob Size alone doesn't, since it only governs how large a *blob*
                    can still count as near-boundary ink). Hardness reuses Botan/Chie's shared
                    field with its own meaning here: 1 (default) untouched, lower = softer/more
                    blurred edge. */}
                <GradientSlider label="Overdrive (px)" value={params.gumiOverdrive} min={0} max={5} step={1} defaultValue={0} onChange={(v) => set('gumiOverdrive', v)} />
                <GradientSlider label="Hardness" value={params.hardness} min={0} max={1} defaultValue={1} onChange={(v) => set('hardness', v)} />
                {/* Same Image/Solid/Gradient/Invert mechanism as Fill mode below, applied to
                    the finished Line-mode mask instead — see lineFillColor.frag.ts. Defaults
                    to Solid + black so the default look matches what Line mode always
                    rendered before this existed. */}
                <div
                  className="lineart-toggle-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => set('gumiLineInvert', !params.gumiLineInvert)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      set('gumiLineInvert', !params.gumiLineInvert)
                    }
                  }}
                >
                  <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Fill</span>
                  <ToggleSwitch on={params.gumiLineInvert} label="Invert Fill" />
                </div>
                <FillTypeRow value={params.gumiLineFillType} onChange={(v) => set('gumiLineFillType', v)} />
                {params.gumiLineFillType === 'solid' && (
                  <TintColorRow label="Line Color" tintColor={params.gumiLineSolidColor} onChange={(rgb) => set('gumiLineSolidColor', rgb)} />
                )}
                {params.gumiLineFillType === 'gradient' && (
                  <>
                    <TintColorRow label="Shadow" tintColor={params.gumiGradientShadow} onChange={(rgb) => set('gumiGradientShadow', rgb)} />
                    <TintColorRow label="Mid" tintColor={params.gumiGradientMid} onChange={(rgb) => set('gumiGradientMid', rgb)} />
                    <TintColorRow label="Highlight" tintColor={params.gumiGradientHighlight} onChange={(rgb) => set('gumiGradientHighlight', rgb)} />
                  </>
                )}
              </>
            ) : (
              <>
                {/* Global for Fill mode (v0.3 tuning) — governs all 3 Fill Types below
                    uniformly, so it sits above the type selector rather than nested under one
                    of them. Bypasses the distance-transform/blobMaxDt margin entirely, a raw
                    per-pixel candidate test — Fill Radius near 0 was already approximating
                    this; this makes it an explicit, well-supported mode. */}
                <div
                  className="lineart-toggle-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => set('gumiFillPixelThreshold', !params.gumiFillPixelThreshold)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      set('gumiFillPixelThreshold', !params.gumiFillPixelThreshold)
                    }
                  }}
                >
                  <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Pixel Threshold</span>
                  <ToggleSwitch on={params.gumiFillPixelThreshold} label="Pixel Threshold" />
                </div>
                {/* Grouped with Pixel Threshold, not the per-type controls below — it's the
                    other half of the same "how far the fill margin reaches" concern, global
                    across all 3 Fill Types, not specific to whichever one is selected. */}
                {!params.gumiFillPixelThreshold && (
                  <GradientSlider label="Fill Radius (px)" value={params.gumiFillRadius} min={0} max={20} defaultValue={8} onChange={(v) => set('gumiFillRadius', v)} />
                )}
                {/* Invert before Fill Type per product direction — it decides *where* fill
                    applies (ink/blacks vs. background/skin-tone side) before Fill Type decides
                    *what color* goes there. */}
                <div
                  className="lineart-toggle-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => set('gumiFillInvert', !params.gumiFillInvert)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      set('gumiFillInvert', !params.gumiFillInvert)
                    }
                  }}
                >
                  <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Fill</span>
                  <ToggleSwitch on={params.gumiFillInvert} label="Invert Fill" />
                </div>
                <FillTypeRow value={params.gumiFillType} onChange={(v) => set('gumiFillType', v)} />
                {params.gumiFillType === 'solid' && (
                  <TintColorRow label="Fill Color" tintColor={params.gumiFillSolidColor} onChange={(rgb) => set('gumiFillSolidColor', rgb)} />
                )}
                {params.gumiFillType === 'gradient' && (
                  <>
                    <TintColorRow label="Shadow" tintColor={params.gumiGradientShadow} onChange={(rgb) => set('gumiGradientShadow', rgb)} />
                    <TintColorRow label="Mid" tintColor={params.gumiGradientMid} onChange={(rgb) => set('gumiGradientMid', rgb)} />
                    <TintColorRow label="Highlight" tintColor={params.gumiGradientHighlight} onChange={(rgb) => set('gumiGradientHighlight', rgb)} />
                  </>
                )}
              </>
            )}
          </>
        )}

        {params.mode === 'pathH' && (
          <>
            <GradientSlider label="Radius (px)" value={params.radius} min={0} max={40} defaultValue={1.5} step={0.01} curve={RADIUS_CURVE} onChange={(v) => set('radius', v)} />
            <GradientSlider label="High Pass Strength" value={params.highPassStrength} min={0} max={10} defaultValue={1} step={0.05} onChange={(v) => set('highPassStrength', v)} />
            <div className="lineart-divider" />
            <OutputTreatmentRow params={params} onChange={onChange} />
          </>
        )}

        {params.mode === 'pathI' && (
          <>
            <GradientSlider label="Laplacian Strength" value={params.laplacianStrength} min={0.5} max={10} defaultValue={1} step={0.05} onChange={(v) => set('laplacianStrength', v)} />
            <GradientSlider label="Pre-Blur (px)" value={params.laplacianPreBlur} min={0} max={10} defaultValue={0} step={0.1} onChange={(v) => set('laplacianPreBlur', v)} />
            <GradientSlider label="Post-Sharpen Amount" value={params.laplacianSharpenAmount} min={0} max={3} defaultValue={0} step={0.05} onChange={(v) => set('laplacianSharpenAmount', v)} />
            <GradientSlider label="Grow (texels)" value={params.laplacianGrow} min={0} max={20} defaultValue={0} onChange={(v) => set('laplacianGrow', v)} />

            <div className="lineart-divider" />
            <OutputTreatmentRow params={params} onChange={onChange} />
          </>
        )}
      </div>
    </BottomSheet>
  )
}

/** Hinata/Tsukiko's shared "Output Treatment" pill row — Edge / Emboss / Erode / Tone (Hinata
 * Tuning Saga; widened to Tsukiko once Edge was confirmed applicable there too — Edge's own
 * implementation is self-contained, computing its own blur+zero-crossing diff directly from
 * detectionSource, never touching Path H's highPassDiff or Path I's laplacian machinery, so
 * nothing else needed to change to share this component). Originally forked from a since-deleted
 * `HiTreatmentRow` (the old 4-pill Raw/Binarize/Tone→Multiply/Tone→Screen row) back when Inori
 * had no Edge branch at all — that's no longer true, so both algorithms use this one now. Each
 * pill click sets blend mode alongside the treatment fields (a one-time default snap the user can
 * freely override afterward via the shared Blend Mode row below — not a lock, unlike Fumiko's
 * forcedMultiply). */
function OutputTreatmentRow({ params, onChange }: { params: LineArtParams; onChange: (params: LineArtParams) => void }) {
  type Treatment = 'edge' | 'emboss' | 'erode' | 'tone'
  const TREATMENTS: { id: Treatment; label: string }[] = [
    { id: 'edge', label: 'Edge' },
    { id: 'emboss', label: 'Emboss' },
    { id: 'erode', label: 'Erode' },
    { id: 'tone', label: 'Tone' },
  ]
  const active: Treatment = params.highPassResponsiveColor
    ? 'edge'
    : params.thresholdEnabled
      ? 'erode'
      : params.hiToneTarget !== 'off'
        ? 'tone'
        : 'emboss'
  return (
    <>
      <p className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Output Treatment</p>
      <div className="crop-bottomcontent" style={{ padding: 0 }}>
        {TREATMENTS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pill-toggle-btn font-button-label${active === t.id ? ' active' : ''}`}
            onClick={() => {
              if (t.id === 'edge') {
                onChange({ ...params, highPassResponsiveColor: true, thresholdEnabled: false, hiToneTarget: 'off', blendMode: 'overwrite' })
              } else if (t.id === 'emboss') {
                onChange({ ...params, highPassResponsiveColor: false, thresholdEnabled: false, hiToneTarget: 'off', blendMode: 'overlay' })
              } else if (t.id === 'erode') {
                onChange({ ...params, highPassResponsiveColor: false, thresholdEnabled: true, hiToneTarget: 'off', blendMode: 'multiply' })
              } else {
                onChange({ ...params, highPassResponsiveColor: false, thresholdEnabled: false, hiToneTarget: 'multiply', blendMode: 'multiply' })
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'edge' && (
        <>
          <GradientSlider label="Crossover" value={params.responsiveCrossover} min={0} max={1} defaultValue={0.5} onChange={(v) => onChange({ ...params, responsiveCrossover: v })} />
          <GradientSlider label="Grow (texels)" value={params.responsiveGrow} min={0} max={20} defaultValue={0} onChange={(v) => onChange({ ...params, responsiveGrow: v })} />
          {params.responsiveGrow > 0 && (
            <GradientSlider label="Grow Bias" value={params.responsiveGrowBias} min={-1} max={1} defaultValue={0} onChange={(v) => onChange({ ...params, responsiveGrowBias: v })} />
          )}
          <div className="lineart-divider" />
          <EdgePolarityFillRow
            label="Ink Over Dark Areas"
            fillType={params.edgeInkOverDarkFillType}
            solidColor={params.edgeInkOverDarkSolidColor}
            onFillTypeChange={(v) => onChange({ ...params, edgeInkOverDarkFillType: v })}
            onSolidColorChange={(rgb) => onChange({ ...params, edgeInkOverDarkSolidColor: rgb })}
          />
          <EdgePolarityFillRow
            label="Ink Over Light Areas"
            fillType={params.edgeInkOverLightFillType}
            solidColor={params.edgeInkOverLightSolidColor}
            onFillTypeChange={(v) => onChange({ ...params, edgeInkOverLightFillType: v })}
            onSolidColorChange={(rgb) => onChange({ ...params, edgeInkOverLightSolidColor: rgb })}
          />
        </>
      )}

      {active === 'emboss' && (
        <>
          <GradientSlider label="Darken / Lighten" value={params.hiRawDarkenLighten} min={-1} max={1} defaultValue={0} onChange={(v) => onChange({ ...params, hiRawDarkenLighten: v })} />
          <GradientSlider label="Contrast" value={params.hiRawContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => onChange({ ...params, hiRawContrast: v })} />
        </>
      )}

      {active === 'erode' && (
        <>
          <GradientSlider label="Threshold" value={params.threshold} min={0} max={1} defaultValue={0.48} onChange={(v) => onChange({ ...params, threshold: v })} />
          <GradientSlider label="Contrast" value={params.hiThresholdContrast} min={0} max={1} defaultValue={1} onChange={(v) => onChange({ ...params, hiThresholdContrast: v })} />
          <div
            className="lineart-toggle-row"
            role="button"
            tabIndex={0}
            onClick={() => onChange({ ...params, hiThresholdInvert: !params.hiThresholdInvert })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onChange({ ...params, hiThresholdInvert: !params.hiThresholdInvert })
              }
            }}
          >
            <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Erosion</span>
            <ToggleSwitch on={params.hiThresholdInvert} label="Invert Erosion" />
          </div>
          <div className="lineart-divider" />
          <InvertFillRow on={params.fillInvert} onChange={(v) => onChange({ ...params, fillInvert: v })} />
          <FillTypeRow value={params.fillType} onChange={(v) => onChange({ ...params, fillType: v })} />
          {params.fillType === 'solid' && (
            <TintColorRow tintColor={params.tintColor} onChange={(rgb) => onChange({ ...params, tintColor: rgb })} />
          )}
          {params.fillType === 'gradient' && (
            <GradientFillControls
              shadow={params.gradientShadow} mid={params.gradientMid} highlight={params.gradientHighlight}
              pivot={params.gradientPivot} duoTone={params.gradientDuoTone}
              onShadowChange={(rgb) => onChange({ ...params, gradientShadow: rgb })}
              onMidChange={(rgb) => onChange({ ...params, gradientMid: rgb })}
              onHighlightChange={(rgb) => onChange({ ...params, gradientHighlight: rgb })}
              onPivotChange={(v) => onChange({ ...params, gradientPivot: v })}
              onDuoToneChange={(v) => onChange({ ...params, gradientDuoTone: v })}
            />
          )}
        </>
      )}

      {active === 'tone' && (
        <>
          <div className="crop-bottomcontent" style={{ padding: 0 }}>
            {(['multiply', 'screen'] as const).map((polarity) => (
              <button
                key={polarity}
                type="button"
                className={`pill-toggle-btn font-button-label${params.hiToneTarget === polarity ? ' active' : ''}`}
                onClick={() => onChange({ ...params, hiToneTarget: polarity, blendMode: polarity })}
              >
                {polarity === 'multiply' ? 'Multiply' : 'Screen'}
              </button>
            ))}
          </div>
          <GradientSlider label="Tone Gain" value={params.hiToneGain} min={0.2} max={4} defaultValue={1} step={0.05} onChange={(v) => onChange({ ...params, hiToneGain: v })} />
          <GradientSlider label="Tone Contrast" value={params.hiToneContrast} min={0.2} max={5} defaultValue={1} step={0.05} onChange={(v) => onChange({ ...params, hiToneContrast: v })} />
          <GradientSlider label="Saturation" value={params.hiToneSaturation} min={0} max={2} defaultValue={1} onChange={(v) => onChange({ ...params, hiToneSaturation: v })} />
          <div
            className="lineart-toggle-row"
            role="button"
            tabIndex={0}
            onClick={() => onChange({ ...params, hiToneHueInvert: !params.hiToneHueInvert })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onChange({ ...params, hiToneHueInvert: !params.hiToneHueInvert })
              }
            }}
          >
            <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Hue</span>
            <ToggleSwitch on={params.hiToneHueInvert} label="Invert Hue" />
          </div>
        </>
      )}
    </>
  )
}

/** Edge's independent per-polarity fill-type control (Hinata Tuning Saga Phase 2) — Image/Solid
 * only, no Gradient (see edgeFillColor.frag.ts's doc comment for why), so this is a plain local
 * 2-pill row rather than the shared 3-option FillTypeRow. */
function EdgePolarityFillRow({
  label, fillType, solidColor, onFillTypeChange, onSolidColorChange,
}: {
  label: string
  fillType: 'image' | 'solid'
  solidColor: [number, number, number]
  onFillTypeChange: (v: 'image' | 'solid') => void
  onSolidColorChange: (rgb: [number, number, number]) => void
}) {
  return (
    <>
      <div className="field-row">
        <div className="field-row-label">
          <span className="font-param-label">{label}</span>
        </div>
        <div className="crop-bottomcontent" style={{ padding: 0 }}>
          {(['image', 'solid'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              className={`pill-toggle-btn font-button-label${fillType === opt ? ' active' : ''}`}
              onClick={() => onFillTypeChange(opt)}
            >
              {opt === 'image' ? 'Image' : 'Solid Color'}
            </button>
          ))}
        </div>
      </div>
      {fillType === 'solid' && <TintColorRow tintColor={solidColor} onChange={onSolidColorChange} />}
    </>
  )
}

const BLEND_MODE_LABELS: Record<BlendMode, string> = { overwrite: 'Overwrite', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay' }
const ALL_BLEND_OPTIONS: BlendMode[] = ['overwrite', 'multiply', 'screen', 'overlay']
/** Fumiko's "Find Edge" color mode bakes its colored-edge look into a per-channel white-toward-black fade that only reads correctly under Multiply — see pipeline.ts's forcedMultiply, which hard-overrides the blend mode regardless of selection. Overwrite is deliberately excluded here (unlike every other blend-mode row) so this row never shows a selectable option that would silently do nothing. */
const FIND_EDGE_BLEND_OPTIONS: BlendMode[] = ['multiply']

/** Gumi's Line/Fill split (v0.3 tuning UI pass) — reuses the existing gumiFillMode boolean directly (false=Line, true=Fill) rather than a new field. */
function OperationModeRow({ fillMode, onChange }: { fillMode: boolean; onChange: (fillMode: boolean) => void }) {
  return (
    <div className="crop-bottomcontent" style={{ padding: 0, marginBottom: 16 }}>
      <button
        type="button"
        className={`pill-toggle-btn font-button-label${!fillMode ? ' active' : ''}`}
        onClick={() => onChange(false)}
      >
        Line
      </button>
      <button
        type="button"
        className={`pill-toggle-btn font-button-label${fillMode ? ' active' : ''}`}
        onClick={() => onChange(true)}
      >
        Fill
      </button>
    </div>
  )
}

const FILL_TYPE_LABELS: Record<FillType, string> = { image: 'Image', solid: 'Solid Color', gradient: 'Gradient Map' }
const FILL_TYPE_OPTIONS: FillType[] = ['image', 'solid', 'gradient']

function FillTypeRow({ value, onChange }: { value: FillType; onChange: (v: FillType) => void }) {
  return (
    <div className="field-row">
      <div className="field-row-label">
        <span className="font-param-label">Fill Type</span>
      </div>
      <div className="crop-bottomcontent" style={{ padding: 0 }}>
        {FILL_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`pill-toggle-btn font-button-label${value === opt ? ' active' : ''}`}
            onClick={() => onChange(opt)}
          >
            {FILL_TYPE_LABELS[opt]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Shared toggle-row markup for the "Invert Fill" boolean — used by Gumi's Line/Fill modes and,
 * as of the v0.3 Service Update, Botan/Chie/Daiya/Fumiko's shared fillType selector too. */
function InvertFillRow({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className="lineart-toggle-row"
      role="button"
      tabIndex={0}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange(!on)
        }
      }}
    >
      <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Fill</span>
      <ToggleSwitch on={on} label="Invert Fill" />
    </div>
  )
}

/** Gradient Map subtab's 3-stop (or 2-stop, with Duo Tone) color controls — Botan/Chie/Daiya/
 * Fumiko's shared `gradientShadow`/`gradientMid`/`gradientHighlight`/`gradientPivot`/
 * `gradientDuoTone` fields (v0.3 Service Update; Gumi keeps its own separate gumiGradient* fields
 * and doesn't get Pivot/Duo Tone UI yet — see fillTypeColor.frag.ts for the shared shader math). */
function GradientFillControls({
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

/** Just the pill row — the "Blend Mode" label now lives on the shared group header above (see the Blend Mode + Overlay Opacity grouping in the main render). */
function BlendModeRow({ mode, options, onChange }: { mode: BlendMode; options: BlendMode[]; onChange: (m: BlendMode) => void }) {
  return (
    <div className="crop-bottomcontent" style={{ padding: 0, marginBottom: 16 }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`pill-toggle-btn font-button-label${mode === opt ? ' active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {BLEND_MODE_LABELS[opt]}
        </button>
      ))}
    </div>
  )
}

const RAMP_MODE_LABELS: Record<ToneShapingParams['mode'], string> = { clip: 'Clip', pinch: 'Pinch' }

/** Standard 2-point clip vs. Pinch Mode's 4-point plateau isolation — see docs/oshiPFP-v0.3-spec.md.
 * Switching modes retains both sets of slider values (App.tsx-owned state), only the active
 * interpretation/ramp changes. */
function RampModeRow({ mode, onChange }: { mode: ToneShapingParams['mode']; onChange: (m: ToneShapingParams['mode']) => void }) {
  return (
    <div className="field-row">
      <div className="field-row-label">
        <span className="font-param-label">Ramp Mode</span>
      </div>
      <div className="crop-bottomcontent" style={{ padding: 0 }}>
        {(['clip', 'pinch'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            className={`pill-toggle-btn font-button-label${mode === opt ? ' active' : ''}`}
            onClick={() => onChange(opt)}
          >
            {RAMP_MODE_LABELS[opt]}
          </button>
        ))}
      </div>
    </div>
  )
}

function TintColorRow({
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
