import { useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import IconButton from './IconButton'
import GradientSlider, { type SliderCurve } from './GradientSlider'
import ToggleSwitch from './ToggleSwitch'
import RampMeter from './RampMeter'
import SegmentedControl from './SegmentedControl'
import { GradientFillControls, BlendModeCategoryRow, TintColorRow } from './GradientFillControls'
import { ALGO_OPTIONS } from './AlgoGalleryModal'
import { HUE_BAND_SWATCHES } from '../color/hslPalette'
import { pinchToPlateau } from '../tone/pinchRamp'
import type { BlendMode, FillType, LineArtParams, LineArtSubTab, ToneShapingParams } from '../types'

const SUB_TAB_OPTIONS: { value: LineArtSubTab; label: string }[] = [
  { value: 'tuning', label: 'TUNING' },
  { value: 'lineart', label: 'LINEART' },
  { value: 'blending', label: 'BLENDING' },
]

interface LineArtPanelProps {
  params: LineArtParams
  onChange: (params: LineArtParams) => void
  /** Resets the currently active algorithm's params to factory defaults and reverts the display mode to Composite — App.tsx owns both (per-mode param cache and the global display-mode toggle), so this is a plain callback rather than something LineArtPanel can derive from params/onChange alone. */
  onReset: () => void
  /** Lifted to App.tsx (rather than local state) so the mobile vertical meter overlay, a sibling of
   * this panel, can show Tone Lift/Color Lift's meters only while this panel is actually on the
   * Tuning subtab (their sliders are now always-expanded there, no per-section collapse anymore). */
  subTab: LineArtSubTab
  onSubTabChange: (tab: LineArtSubTab) => void
  /** Opens AlgoGalleryModal (App.tsx owns its open state — lifted out so BlankState's own "Browse
   * Gallery" button can open the same modal before any image, and therefore this panel, exists). */
  onOpenGallery: () => void
}

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
/** Gumi's Luminance Ramp Feather is aggressive across its full 0-1 range — taper so 0-0.2 (the
 * actually-usable range) gets 65% of the track instead of linear's 20%. */
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

const COLOR_LIFT_SWATCHES = HUE_BAND_SWATCHES

/** Small accent-color dot shown next to a submodule's title label when its params have drifted from
 * identity — lets the user spot which sections have edits at a glance. `className` lets header rows
 * pass 'modified-dot-after' (dot follows the title text, not precedes it — see base.css) while the
 * Color Correct toggle row keeps the default before-text spacing. */
function ModifiedDot({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null
  return <span className={`modified-dot${className ? ` ${className}` : ''}`} aria-hidden="true" />
}

/** Controlled by App.tsx (params live there, not locally) so slider values survive switching away from and back to the Line Art tab. */
export default function LineArtPanel({
  params, onChange, onReset,
  subTab, onSubTabChange,
  onOpenGallery,
}: LineArtPanelProps) {
  // Which Dual Line band's controls are showing — UI-only, not a LineArtParams field, since
  // this doesn't need to round-trip through JSON presets.
  const [dualBandTab, setDualBandTab] = useState<'black' | 'white'>('black')

  const set = <K extends keyof LineArtParams>(key: K, value: LineArtParams[K]) =>
    onChange({ ...params, [key]: value })

  // App.tsx caches params per algorithm and swaps in the right (previously
  // edited, or default) object for whichever mode this resolves to — so this
  // just signals "switch to this mode," it doesn't need to carry field values.
  const selectMode = (mode: LineArtParams['mode']) => onChange({ ...params, mode })

  const opacityPct = Math.round(params.opacity * 100)

  return (
    <BottomSheet>
      <div className="subtab-sticky-wrapper">
        <SegmentedControl options={SUB_TAB_OPTIONS} value={subTab} onChange={onSubTabChange} />
      </div>

      {subTab === 'tuning' && (
        params.mode === 'pathC' ? (
          <p className="font-param-label" style={{ color: 'var(--accent-dark)', padding: '4px 0 12px' }}>
            Chie erodes the crop directly — pre-detection tuning doesn't apply to this algorithm.
          </p>
        ) : (
          <>
            <div className="lineart-preprocessing-header">
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>
                Denoise
                <ModifiedDot show={isModified(params.denoise, IDENTITY_DENOISE)} className="modified-dot-after" />
              </span>
              <button type="button" className="text-reset-btn font-value" onClick={() => set('denoise', IDENTITY_DENOISE)}>
                Reset
              </button>
            </div>
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

            <div className="lineart-preprocessing-header">
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>
                Tone Lift
                <ModifiedDot show={isToneShapingModified(params.toneShaping, IDENTITY_TONE_SHAPING)} className="modified-dot-after" />
              </span>
              <button type="button" className="text-reset-btn font-value" onClick={() => set('toneShaping', IDENTITY_TONE_SHAPING)}>
                Reset
              </button>
            </div>
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

            <div className="lineart-preprocessing-header">
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>
                Color Lift
                <ModifiedDot show={isModified(params.colorLift, IDENTITY_COLOR_LIFT)} className="modified-dot-after" />
              </span>
              <button type="button" className="text-reset-btn font-value" onClick={() => set('colorLift', IDENTITY_COLOR_LIFT)}>
                Reset
              </button>
            </div>
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
          </>
        )
      )}

      {subTab === 'blending' && (
        <>
          {/* Pre-Blend Correction — the toggle IS the expand state (no separate enabled+expanded
              pair): either the user needs correction (on, controls visible) or doesn't (off,
              nothing rendered). Collapsed by default — a power-user feature most algorithms never
              need. Runs on the resolved ink layer right before compositing, see pipeline.ts's
              applyInkCorrect. */}
          <div
            className="lineart-toggle-row"
            role="button"
            tabIndex={0}
            onClick={() => set('colorCorrectEnabled', !params.colorCorrectEnabled)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                set('colorCorrectEnabled', !params.colorCorrectEnabled)
              }
            }}
          >
            <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>
              <ModifiedDot show={params.colorCorrectEnabled} />
              Color Correct
            </span>
            <ToggleSwitch on={params.colorCorrectEnabled} label="Color Correct" />
          </div>
          {params.colorCorrectEnabled && (
            <div className="lineart-slidergroup-stack">
              <GradientSlider
                label="Exposure" value={params.colorCorrectExposure} min={-1} max={1} defaultValue={0}
                formatValue={(v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`}
                onChange={(v) => set('colorCorrectExposure', v)}
              />
              <GradientSlider
                label="Contrast" value={params.colorCorrectContrast} min={-1} max={1} defaultValue={0}
                formatValue={(v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`}
                onChange={(v) => set('colorCorrectContrast', v)}
              />
              <GradientSlider
                label="Saturation" value={params.colorCorrectSaturation} min={-1} max={1} defaultValue={0}
                formatValue={(v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`}
                onChange={(v) => set('colorCorrectSaturation', v)}
              />
              <div
                className="lineart-toggle-row"
                role="button"
                tabIndex={0}
                onClick={() => set('colorCorrectInvertMatte', !params.colorCorrectInvertMatte)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    set('colorCorrectInvertMatte', !params.colorCorrectInvertMatte)
                  }
                }}
              >
                <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Matte</span>
                <ToggleSwitch on={params.colorCorrectInvertMatte} label="Invert Matte" />
              </div>
            </div>
          )}

          {/* Bypasses Blend Mode/Opacity entirely, reusing the exact raw alpha-flattened-on-matteColor
              computation the Overlay display mode already produces, but for Composite (so it flows
              downstream through Color/Export). See pipeline.ts's resolveLineArtDisplay and
              LineArtParams.overlayPassthrough's own doc comment. When on, the Blend Mode
              selector/Opacity below is entirely irrelevant (passthrough bypasses it), so that whole
              section — and the divider that would otherwise introduce it — stays hidden rather than
              showing dead controls. */}
          <div
            className="lineart-toggle-row"
            role="button"
            tabIndex={0}
            onClick={() => set('overlayPassthrough', !params.overlayPassthrough)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                set('overlayPassthrough', !params.overlayPassthrough)
              }
            }}
          >
            <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Overlay Passthrough</span>
            <ToggleSwitch on={params.overlayPassthrough} label="Overlay Passthrough" />
          </div>
          {params.overlayPassthrough ? (
            <TintColorRow label="Matte Color" tintColor={params.matteColor} onChange={(rgb) => set('matteColor', rgb)} />
          ) : (
            <>
              <div className="lineart-preprocessing-header">
                <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>
                  Blending Mode
                  <ModifiedDot show={params.blendMode !== 'multiply' || params.opacity !== 1} className="modified-dot-after" />
                </span>
                <button
                  type="button"
                  className="text-reset-btn font-value"
                  onClick={() => onChange({ ...params, blendMode: 'multiply', opacity: 1 })}
                >
                  Reset
                </button>
              </div>
              <BlendModeCategoryRow
                mode={params.blendMode}
                allowedModes={params.mode === 'pathF' && params.findEdge ? FIND_EDGE_BLEND_OPTIONS : undefined}
                onChange={(v) => set('blendMode', v)}
              />
              <GradientSlider
                label="Blend Opacity" value={params.opacity} min={0} max={3} defaultValue={1}
                formatValue={() => `${opacityPct}%`}
                onChange={(v) => set('opacity', v)}
              />
            </>
          )}
        </>
      )}

      {subTab === 'lineart' && (
      <>
      <div className="lineart-algoselector">
        <div className="lineart-algoselector-header">
          <div className="lineart-algoselector-header-label">
            <p className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Line Expansion Algorithm</p>
            <button
              type="button"
              className="info-btn"
              aria-label="About these algorithms"
              onClick={onOpenGallery}
            >
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
            {/* Threshold/Soft Threshold/Invert Seed sit above the op-mode selector since they
                apply identically to JFA and Octagon (same shared thresholdProgram/
                softThresholdProgram calls either way) — only Radius/Hardness/Facets/Rotation/
                One-Sided differ per mode, so those live inside their own tab instead of being
                duplicated or fought over. See pipeline.ts's pathD branch. */}
            <GradientSlider label="Threshold" value={params.threshold} min={0} max={1} defaultValue={0.05} onChange={(v) => set('threshold', v)} />
            <GradientSlider
              label="Soft Threshold" value={params.daiyaSoftThresholdWidth} min={0} max={1} step={0.01} defaultValue={0}
              onChange={(v) => set('daiyaSoftThresholdWidth', v)}
            />
            {params.daiyaSoftThresholdWidth > 0 && (
              <GradientSlider
                label="Soft Threshold Overdrive" value={params.daiyaSoftThresholdOverdrive} min={1} max={10} step={0.1} defaultValue={1}
                onChange={(v) => set('daiyaSoftThresholdOverdrive', v)}
              />
            )}
            <div
              className="lineart-toggle-row"
              role="button"
              tabIndex={0}
              onClick={() => set('daiyaInvertSeed', !params.daiyaInvertSeed)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  set('daiyaInvertSeed', !params.daiyaInvertSeed)
                }
              }}
            >
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Seed</span>
              <ToggleSwitch on={params.daiyaInvertSeed} label="Invert Seed" />
            </div>
            <div className="lineart-divider" />
            <p className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Operation Mode</p>
            <div className="crop-bottomcontent" style={{ padding: 0 }}>
              <button
                type="button"
                className={`pill-toggle-btn font-button-label${!params.daiyaOctagonMode ? ' active' : ''}`}
                onClick={() => set('daiyaOctagonMode', false)}
              >
                JFA
              </button>
              <button
                type="button"
                className={`pill-toggle-btn font-button-label${params.daiyaOctagonMode ? ' active' : ''}`}
                onClick={() => set('daiyaOctagonMode', true)}
              >
                Octagon
              </button>
            </div>
            {params.daiyaOctagonMode ? (
              <>
                <GradientSlider
                  label="Radius (texels)" value={params.daiyaOctagonRadius} min={0} max={20} step={1} defaultValue={2}
                  onChange={(v) => set('daiyaOctagonRadius', v)}
                />
                <GradientSlider
                  label="Hardness" value={params.daiyaOctagonHardness} min={-1} max={1} defaultValue={0}
                  onChange={(v) => set('daiyaOctagonHardness', v)}
                />
                <div
                  className="lineart-toggle-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => set('daiyaOctagonOneSided', !params.daiyaOctagonOneSided)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      set('daiyaOctagonOneSided', !params.daiyaOctagonOneSided)
                    }
                  }}
                >
                  <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>One-Sided (spike)</span>
                  <ToggleSwitch on={params.daiyaOctagonOneSided} label="One-Sided" />
                </div>
                <GradientSlider
                  label="Facets (directions)" value={params.daiyaOctagonDirections}
                  min={params.daiyaOctagonOneSided ? 1 : 3} max={12} step={1} defaultValue={1}
                  formatValue={(v) => `${params.daiyaOctagonOneSided ? v : v * 2}`}
                  onChange={(v) => set('daiyaOctagonDirections', v)}
                />
                <GradientSlider
                  label="Facet Rotation" value={params.daiyaOctagonRotation} min={0} max={360} step={1} defaultValue={0}
                  formatValue={(v) => `${v}°`}
                  onChange={(v) => set('daiyaOctagonRotation', v)}
                />
              </>
            ) : (
              <>
                <GradientSlider label="Radius (texels)" value={params.radius} min={0} max={20} defaultValue={2} step={0.01} curve={RADIUS_CURVE} onChange={(v) => set('radius', v)} />
                <GradientSlider label="Hardness" value={params.hardness} min={-1} max={1} defaultValue={0} onChange={(v) => set('hardness', v)} />
              </>
            )}
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
                    gumiGapClosing: false,
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
                    // Dual Line's reset scope is folded into this button rather than getting a
                    // dedicated Reset of its own.
                    gumiDualLine: false,
                    gumiDualBlack: { position: 0.2, expand: 0.3, feathering: 0.15 },
                    gumiDualWhite: { position: 0.8, expand: 0.3, feathering: 0.15 },
                    gumiDualBlackFillType: 'solid',
                    gumiDualBlackSolidColor: [0, 0, 0],
                    gumiDualBlackInvert: false,
                    gumiDualWhiteFillType: 'solid',
                    gumiDualWhiteSolidColor: [1, 1, 1],
                    gumiDualWhiteInvert: false,
                    gumiDualWhiteOnTop: true,
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
                <GradientSlider label="Contrast Boost" value={params.gumiContrastBoost} min={0} max={2} defaultValue={1} onChange={(v) => set('gumiContrastBoost', v)} />
                <GradientSlider label="Detection Radius" value={params.radius} min={0} max={40} defaultValue={1} step={0.01} curve={RADIUS_CURVE} onChange={(v) => set('radius', v)} />
                {/* Reshapes the distance-to-edge boundary from a hard single-pixel cutoff into
                    an antialiased, contrast-adjustable falloff, to help clean up residual
                    speckle at blob edges without touching the main ramp/threshold. Also shared
                    with Fill mode's own boundary. */}
                <GradientSlider label="Detection Contrast" value={params.gumiBlobGamma} min={0.2} max={5} defaultValue={1} onChange={(v) => set('gumiBlobGamma', v)} />
                <GradientSlider label="Maximum Blob Size" value={params.blobMaxDt} min={1} max={20} defaultValue={2} onChange={(v) => set('blobMaxDt', v)} />
                {/* Optical post-process, not algorithm changes — see pipeline.ts's
                    runGumiLinePostProcess. Overdrive genuinely thickens already-thin strokes
                    (Maximum Blob Size alone doesn't, since it only governs how large a *blob*
                    can still count as near-boundary ink). Hardness reuses Botan/Chie's shared
                    field with its own meaning here: 1 (default) untouched, lower = softer/more
                    blurred edge. */}
                <GradientSlider label="Overdrive (px)" value={params.gumiOverdrive} min={0} max={5} step={0.01} defaultValue={0} onChange={(v) => set('gumiOverdrive', v)} />
                <GradientSlider label="Hardness" value={params.hardness} min={0} max={1} defaultValue={1} onChange={(v) => set('hardness', v)} />
                {/* Dual Line overrides the single fill-type block below with two independent
                    simplified-band detection+fill chains (Black Line / White Line). Placed
                    right before fill settings since turning it on is what makes that single
                    block moot. */}
                <div
                  className="lineart-toggle-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => set('gumiDualLine', !params.gumiDualLine)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      set('gumiDualLine', !params.gumiDualLine)
                    }
                  }}
                >
                  <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Dual Line</span>
                  <ToggleSwitch on={params.gumiDualLine} label="Dual Line" />
                </div>
                {!params.gumiDualLine ? (
                  <>
                    {/* Same Image/Solid/Gradient/Invert mechanism as Fill mode below, applied to
                        the finished Line-mode mask instead — see lineFillColor.frag.ts. Defaults
                        to Solid + black to match Line mode's original look. */}
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
                    {params.gumiLineFillType === 'image' && (
                      <GradientSlider label="Color Contrast" value={params.gumiLineColorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('gumiLineColorContrast', v)} />
                    )}
                    {params.gumiLineFillType === 'solid' && (
                      <TintColorRow label="Line Color" tintColor={params.gumiLineSolidColor} onChange={(rgb) => set('gumiLineSolidColor', rgb)} />
                    )}
                    {params.gumiLineFillType === 'gradient' && (
                      <>
                        <GradientSlider label="Gradient Pivot" value={params.gumiLineGradientPivot} min={-1} max={1} defaultValue={0} onChange={(v) => set('gumiLineGradientPivot', v)} />
                        <TintColorRow label="Shadow" tintColor={params.gumiGradientShadow} onChange={(rgb) => set('gumiGradientShadow', rgb)} />
                        <TintColorRow label="Mid" tintColor={params.gumiGradientMid} onChange={(rgb) => set('gumiGradientMid', rgb)} />
                        <TintColorRow label="Highlight" tintColor={params.gumiGradientHighlight} onChange={(rgb) => set('gumiGradientHighlight', rgb)} />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="lineart-divider" />
                    <div
                      className="lineart-toggle-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => set('gumiDualWhiteOnTop', !params.gumiDualWhiteOnTop)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          set('gumiDualWhiteOnTop', !params.gumiDualWhiteOnTop)
                        }
                      }}
                    >
                      <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>White On Top</span>
                      <ToggleSwitch on={params.gumiDualWhiteOnTop} label="White On Top" />
                    </div>
                    <div className="crop-bottomcontent" style={{ padding: 0, marginBottom: 16 }}>
                      <button type="button" className={`pill-toggle-btn font-button-label${dualBandTab === 'black' ? ' active' : ''}`} onClick={() => setDualBandTab('black')}>Black Line</button>
                      <button type="button" className={`pill-toggle-btn font-button-label${dualBandTab === 'white' ? ' active' : ''}`} onClick={() => setDualBandTab('white')}>White Line</button>
                    </div>
                    {dualBandTab === 'black' ? (
                      <>
                        <GradientSlider
                          label="Detection Range" value={params.gumiDualBlack.position} min={0} max={1} defaultValue={0.2}
                          trackGradient="linear-gradient(90deg, #000000, #FFFFFF)"
                          markers={[pinchToPlateau(params.gumiDualBlack).innerLow, pinchToPlateau(params.gumiDualBlack).innerHigh]}
                          onChange={(v) => set('gumiDualBlack', { ...params.gumiDualBlack, position: v })}
                        />
                        <GradientSlider
                          label="Detection Size" value={params.gumiDualBlack.expand} min={0} max={1} defaultValue={0.3}
                          onChange={(v) => set('gumiDualBlack', { ...params.gumiDualBlack, expand: v })}
                        />
                        <GradientSlider
                          label="Feathering" value={params.gumiDualBlack.feathering} min={0} max={1} defaultValue={0.15}
                          step={0.001} curve={FEATHER_CURVE}
                          onChange={(v) => set('gumiDualBlack', { ...params.gumiDualBlack, feathering: v })}
                        />
                        <EdgePolarityFillRow
                          label="Fill" fillType={params.gumiDualBlackFillType} solidColor={params.gumiDualBlackSolidColor}
                          onFillTypeChange={(v) => set('gumiDualBlackFillType', v)}
                          onSolidColorChange={(rgb) => set('gumiDualBlackSolidColor', rgb)}
                        />
                        {params.gumiDualBlackFillType === 'image' && (
                          <GradientSlider label="Color Contrast" value={params.gumiDualBlackColorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('gumiDualBlackColorContrast', v)} />
                        )}
                        <div
                          className="lineart-toggle-row"
                          role="button"
                          tabIndex={0}
                          onClick={() => set('gumiDualBlackInvert', !params.gumiDualBlackInvert)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              set('gumiDualBlackInvert', !params.gumiDualBlackInvert)
                            }
                          }}
                        >
                          <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Fill</span>
                          <ToggleSwitch on={params.gumiDualBlackInvert} label="Invert Fill" />
                        </div>
                      </>
                    ) : (
                      <>
                        <GradientSlider
                          label="Detection Range" value={params.gumiDualWhite.position} min={0} max={1} defaultValue={0.8}
                          trackGradient="linear-gradient(90deg, #000000, #FFFFFF)"
                          markers={[pinchToPlateau(params.gumiDualWhite).innerLow, pinchToPlateau(params.gumiDualWhite).innerHigh]}
                          onChange={(v) => set('gumiDualWhite', { ...params.gumiDualWhite, position: v })}
                        />
                        <GradientSlider
                          label="Detection Size" value={params.gumiDualWhite.expand} min={0} max={1} defaultValue={0.3}
                          onChange={(v) => set('gumiDualWhite', { ...params.gumiDualWhite, expand: v })}
                        />
                        <GradientSlider
                          label="Feathering" value={params.gumiDualWhite.feathering} min={0} max={1} defaultValue={0.15}
                          step={0.001} curve={FEATHER_CURVE}
                          onChange={(v) => set('gumiDualWhite', { ...params.gumiDualWhite, feathering: v })}
                        />
                        <EdgePolarityFillRow
                          label="Fill" fillType={params.gumiDualWhiteFillType} solidColor={params.gumiDualWhiteSolidColor}
                          onFillTypeChange={(v) => set('gumiDualWhiteFillType', v)}
                          onSolidColorChange={(rgb) => set('gumiDualWhiteSolidColor', rgb)}
                        />
                        {params.gumiDualWhiteFillType === 'image' && (
                          <GradientSlider label="Color Contrast" value={params.gumiDualWhiteColorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('gumiDualWhiteColorContrast', v)} />
                        )}
                        <div
                          className="lineart-toggle-row"
                          role="button"
                          tabIndex={0}
                          onClick={() => set('gumiDualWhiteInvert', !params.gumiDualWhiteInvert)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              set('gumiDualWhiteInvert', !params.gumiDualWhiteInvert)
                            }
                          }}
                        >
                          <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Fill</span>
                          <ToggleSwitch on={params.gumiDualWhiteInvert} label="Invert Fill" />
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {/* Global for Fill mode — governs all 3 Fill Types below uniformly, so it sits
                    above the type selector rather than nested under one of them. Bypasses the
                    distance-transform/blobMaxDt margin entirely, a raw per-pixel candidate test. */}
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
                {params.gumiFillType === 'image' && (
                  <GradientSlider label="Color Contrast" value={params.gumiFillColorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('gumiFillColorContrast', v)} />
                )}
                {params.gumiFillType === 'solid' && (
                  <TintColorRow label="Fill Color" tintColor={params.gumiFillSolidColor} onChange={(rgb) => set('gumiFillSolidColor', rgb)} />
                )}
                {params.gumiFillType === 'gradient' && (
                  <>
                    <GradientSlider label="Gradient Pivot" value={params.gumiFillGradientPivot} min={-1} max={1} defaultValue={0} onChange={(v) => set('gumiFillGradientPivot', v)} />
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
      </>
      )}
    </BottomSheet>
  )
}

/** Hinata/Tsukiko's shared "Output Treatment" pill row — Edge / Emboss / Erode / Tone. Edge's
 * implementation is self-contained, computing its own blur+zero-crossing diff directly from
 * detectionSource, never touching Path H's highPassDiff or Path I's laplacian machinery. Each
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
  const DEFAULT_BLEND: Record<Treatment, BlendMode> = {
    edge: 'overwrite',
    emboss: 'overlay',
    erode: 'multiply',
    tone: 'multiply',
  }
  const active: Treatment = params.highPassResponsiveColor
    ? 'edge'
    : params.thresholdEnabled
      ? 'erode'
      : params.hiToneTarget !== 'off'
        ? 'tone'
        : 'emboss'
  // A treatment's blend-mode default is applied only the FIRST time this component instance ever
  // switches to it, tracked in this ref (not persisted params, so it resets naturally on algo
  // switch/reset via remount). Re-clicking an already-visited treatment only switches its fields,
  // leaving blendMode exactly as the user left it — avoids stomping a user's own tuned choice
  // when hopping between treatments to compare (e.g. tune Erode, hop to Emboss, hop back).
  const visitedRef = useRef<Set<Treatment>>(new Set([active]))
  const switchTreatment = (t: Treatment) => {
    const alreadyVisited = visitedRef.current.has(t)
    if (!alreadyVisited) visitedRef.current.add(t)
    const blendMode = alreadyVisited ? params.blendMode : DEFAULT_BLEND[t]
    if (t === 'edge') {
      onChange({ ...params, highPassResponsiveColor: true, thresholdEnabled: false, hiToneTarget: 'off', blendMode })
    } else if (t === 'emboss') {
      onChange({ ...params, highPassResponsiveColor: false, thresholdEnabled: false, hiToneTarget: 'off', blendMode })
    } else if (t === 'erode') {
      onChange({ ...params, highPassResponsiveColor: false, thresholdEnabled: true, hiToneTarget: 'off', blendMode })
    } else {
      onChange({ ...params, highPassResponsiveColor: false, thresholdEnabled: false, hiToneTarget: 'multiply', blendMode })
    }
  }
  return (
    <>
      <p className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Output Treatment</p>
      <div className="crop-bottomcontent" style={{ padding: 0 }}>
        {TREATMENTS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pill-toggle-btn font-button-label${active === t.id ? ' active' : ''}`}
            onClick={() => switchTreatment(t.id)}
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
          {params.fillType === 'image' && (
            <GradientSlider label="Color Contrast" value={params.colorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => onChange({ ...params, colorContrast: v })} />
          )}
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

/** Edge's independent per-polarity fill-type control — Image/Solid only, no Gradient (see
 * edgeFillColor.frag.ts's doc comment for why), so this is a plain local 2-pill row rather than
 * the shared 3-option FillTypeRow. */
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

/** Fumiko's "Find Edge" color mode bakes its colored-edge look into a per-channel white-toward-black fade that only reads correctly under Multiply — see pipeline.ts's forcedMultiply, which hard-overrides the blend mode regardless of selection. Passed as BlendModeCategoryRow's `allowedModes` so every other pill/category renders disabled instead of silently doing nothing if picked. */
const FIND_EDGE_BLEND_OPTIONS: BlendMode[] = ['multiply']

/** Gumi's Line/Fill split reuses the existing gumiFillMode boolean directly (false=Line, true=Fill) rather than a new field. */
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

/** Shared toggle-row markup for the "Invert Fill" boolean — used by Gumi's Line/Fill modes and
 * Botan/Chie/Daiya/Fumiko's shared fillType selector too. */
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

