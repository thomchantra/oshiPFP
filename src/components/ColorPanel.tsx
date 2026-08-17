import BottomSheet from './BottomSheet'
import SegmentedControl from './SegmentedControl'
import GradientSlider, { formatPercent, formatSignedPercent } from './GradientSlider'
import HslBandSelector from './HslBandSelector'
import Icon from './Icon'
import ToggleSwitch from './ToggleSwitch'
import { GradientFillControls, BlendModeRow } from './GradientFillControls'
import { HUE_BAND_SWATCHES } from '../color/hslPalette'
import { IDENTITY_HSL_SHIFT, IDENTITY_INVERT } from '../color/useColorAdjustments'
import { CURVE_CHANNEL_OPTIONS, type CurveChannel } from '../curve/useColorCurve'
import type { BlendMode, ColorAdjustParams, ColorSubTab, GradeGradientMapParams, HslBand, HslByBand, HslShift, InvertParams, LightParams } from '../types'

const ALL_BLEND_OPTIONS: BlendMode[] = ['overwrite', 'multiply', 'screen', 'overlay']

interface ColorPanelProps {
  subTab: ColorSubTab
  onSubTabChange: (tab: ColorSubTab) => void
  hslByBand: HslByBand
  setHslByBand: (updater: (prev: HslByBand) => HslByBand) => void
  activeBand: HslBand
  setActiveBand: (band: HslBand) => void
  invert: InvertParams
  setInvert: (updater: InvertParams | ((prev: InvertParams) => InvertParams)) => void
  light: LightParams
  setLight: (light: LightParams) => void
  colorAdjust: ColorAdjustParams
  setColorAdjust: (colorAdjust: ColorAdjustParams) => void
  gradeGradientMap: GradeGradientMapParams
  setGradeGradientMap: (gradeGradientMap: GradeGradientMapParams) => void
  curveChannel: CurveChannel
  setCurveChannel: (channel: CurveChannel) => void
  curveVisible: boolean
  setCurveVisible: (visible: boolean) => void
  /** Resets everything in the Color tab (curve + HSL + Invert + Light + Color basic adjustments) — not just the curve. */
  onResetGrade: () => void
  /** Resets only the curve (all 4 channels back to identity) — narrower than onResetGrade, see the 2-row Curve header layout below. */
  onResetCurve: () => void
}

/** Per docs/oshiPFP-v0.2.1-UIspecs.md's Slider Background Gradient list. */
const BLACK_WHITE_GRADIENT = 'linear-gradient(90deg, #000000 0%, #FFFFFF 100%)'

const SUB_TAB_OPTIONS: { value: ColorSubTab; label: string }[] = [
  { value: 'light', label: 'LIGHT' },
  { value: 'color', label: 'COLOR' },
  { value: 'hsl', label: 'HSL' },
]

/**
 * "Invert Colors" toggle click logic — RGB (full invert) and the 3 R/G/B
 * per-channel toggles are mutually exclusive UI states, not independent
 * booleans: clicking RGB while any per-channel toggles are on replaces them
 * with a full invert; clicking a channel while RGB is on switches out of
 * full-invert mode into per-channel mode starting with just that channel;
 * selecting all 3 of R/G/B individually collapses to the RGB state instead
 * (same visual result, no reason to represent it two ways). Clicking an
 * already-active toggle always turns it off.
 */
function toggleInvertRgb(prev: InvertParams): InvertParams {
  return prev.rgb ? IDENTITY_INVERT : { rgb: true, r: false, g: false, b: false }
}
function toggleInvertChannel(prev: InvertParams, channel: 'r' | 'g' | 'b'): InvertParams {
  if (prev.rgb) return { rgb: false, r: channel === 'r', g: channel === 'g', b: channel === 'b' }
  const next = { ...prev, [channel]: !prev[channel] }
  if (next.r && next.g && next.b) return { rgb: true, r: false, g: false, b: false }
  return next
}

/**
 * HSL slider track gradients, responsive to the active band — per
 * docs/oshiPFP-v0.2.1-UIspecs.md's "HSL Background Slider Gradient"
 * convention: Hue runs [prev-neighbor] -> [band color] -> [next-neighbor]
 * (the spec's own Red example is literally Magenta -> Red -> Orange, which
 * is exactly Red's neighbors in HUE_BAND_SWATCHES with wraparound — this
 * generalizes that to all 8 bands instead of hardcoding Red's case),
 * Saturation runs neutral gray -> [band color], Lightness runs
 * black -> [band color] -> white. Master has no single hue, so it gets a
 * full spectrum for Hue and the neutral accent-title brand color as its
 * Saturation/Lightness pivot instead — not spec'd (master is this app's
 * own addition to the Figma reference), but keeps the same visual language.
 */
const MASTER_HUE_GRADIENT = 'linear-gradient(90deg, #FF0000, #FF8000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)'
function hslGradients(band: HslBand): { hue: string; saturation: string; lightness: string } {
  if (band === 'master') {
    return {
      hue: MASTER_HUE_GRADIENT,
      saturation: 'linear-gradient(90deg, #8D8D8D 0%, var(--accent-title) 100%)',
      lightness: 'linear-gradient(90deg, #000000 0%, var(--accent-title) 50%, #FFFFFF 100%)',
    }
  }
  const i = HUE_BAND_SWATCHES.findIndex((s) => s.key === band)
  const prev = HUE_BAND_SWATCHES[(i - 1 + HUE_BAND_SWATCHES.length) % HUE_BAND_SWATCHES.length].hex
  const hex = HUE_BAND_SWATCHES[i].hex
  const next = HUE_BAND_SWATCHES[(i + 1) % HUE_BAND_SWATCHES.length].hex
  return {
    hue: `linear-gradient(90deg, ${prev} 0%, ${hex} 50%, ${next} 100%)`,
    saturation: `linear-gradient(90deg, #8D8D8D 0%, ${hex} 100%)`,
    lightness: `linear-gradient(90deg, #000000 0%, ${hex} 50%, #FFFFFF 100%)`,
  }
}

/**
 * Color tab's sheet — Curve (the "Color" sub-tab) is deliberately mostly
 * absent here: per the UI spec it floats on top of the viewport instead
 * (see ColorCurveOverlay.tsx, rendered by App.tsx), not in this sheet like
 * every other tab's controls. HSL is the real targeted-HSL panel per the
 * Figma "Colordrawer" component (node 26-2353): a swatch row (9 bands —
 * the Figma's 8 targeted hue bands plus a "master"/global one added on the
 * left, see HslBandSelector.tsx) with one shared Hue/Saturation/Lightness
 * slider trio whose bound values switch based on which swatch is selected.
 *
 * All state here (hslByBand/invert/light/colorAdjust/activeBand) must stay owned by App.tsx via
 * useColorAdjustments, not moved to local state here — this component only renders while
 * `tab === 'color'`, so any state kept locally would get wiped on every tab switch (this is why
 * the invert toggle, for example, must not become local state here).
 */
export default function ColorPanel({
  subTab, onSubTabChange,
  hslByBand, setHslByBand, activeBand, setActiveBand,
  invert, setInvert,
  light, setLight,
  colorAdjust, setColorAdjust,
  gradeGradientMap, setGradeGradientMap,
  curveChannel, setCurveChannel, curveVisible, setCurveVisible, onResetGrade, onResetCurve,
}: ColorPanelProps) {
  const setLightField = <K extends keyof LightParams>(key: K, value: LightParams[K]) =>
    setLight({ ...light, [key]: value })
  const setColorAdjustField = <K extends keyof ColorAdjustParams>(key: K, value: ColorAdjustParams[K]) =>
    setColorAdjust({ ...colorAdjust, [key]: value })
  const setGradeGradientMapField = <K extends keyof GradeGradientMapParams>(key: K, value: GradeGradientMapParams[K]) =>
    setGradeGradientMap({ ...gradeGradientMap, [key]: value })

  const activeShift = hslByBand[activeBand]
  const setActiveShift = <K extends keyof HslShift>(key: K, value: HslShift[K]) =>
    setHslByBand((prev) => ({ ...prev, [activeBand]: { ...prev[activeBand], [key]: value } }))
  const gradients = hslGradients(activeBand)

  return (
    <BottomSheet maxHeightFraction={0.5}>
      <div className="subtab-sticky-wrapper">
        <SegmentedControl options={SUB_TAB_OPTIONS} value={subTab} onChange={onSubTabChange} />
      </div>

      {subTab === 'light' && (
        <div className="lineart-slidergroup-stack">
          <div className="crop-topcontent" style={{ gap: 10 }}>
            <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Curve</span>
            <button type="button" className="text-reset-btn font-value" onClick={onResetGrade}>
              Reset Grade
            </button>
          </div>
          <div className="crop-topcontent" style={{ gap: 10 }}>
            <div className="curve-overlay-channels">
              <button
                type="button"
                className={`curve-channel-btn${curveVisible ? ' active' : ''}`}
                style={{ color: curveVisible ? 'var(--bg-light)' : 'var(--accent-title)', background: curveVisible ? 'var(--accent-title)' : undefined }}
                onClick={() => setCurveVisible(!curveVisible)}
                aria-label={curveVisible ? 'Hide curve overlay' : 'Show curve overlay'}
                aria-pressed={curveVisible}
              >
                <Icon name="curve" size={14} color="currentColor" />
              </button>
              {CURVE_CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`curve-channel-btn font-button-label${opt.value === curveChannel ? ' active' : ''}`}
                  style={{ color: opt.value === curveChannel ? 'var(--bg-light)' : opt.color, background: opt.value === curveChannel ? opt.color : undefined }}
                  onClick={() => setCurveChannel(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button type="button" className="text-reset-btn font-value" onClick={onResetCurve}>
              Reset
            </button>
          </div>
          <GradientSlider
            label="Exposure" value={light.exposure} min={-3} max={3} defaultValue={0}
            trackGradient={BLACK_WHITE_GRADIENT}
            onChange={(v) => setLightField('exposure', v)}
          />
          <GradientSlider label="Contrast" value={light.contrast} min={-0.8} max={2} defaultValue={0} onChange={(v) => setLightField('contrast', v)} />
          <GradientSlider label="Brilliance" value={light.brilliance} min={-1} max={1} defaultValue={0} formatValue={formatSignedPercent} onChange={(v) => setLightField('brilliance', v)} />
          <GradientSlider
            label="Whites" value={light.whites} min={-1} max={1} defaultValue={0}
            trackGradient={BLACK_WHITE_GRADIENT}
            formatValue={formatSignedPercent}
            onChange={(v) => setLightField('whites', v)}
          />
          <GradientSlider
            label="Highlights" value={light.highlights} min={-1} max={1} defaultValue={0}
            trackGradient={BLACK_WHITE_GRADIENT}
            formatValue={formatSignedPercent}
            onChange={(v) => setLightField('highlights', v)}
          />
          <GradientSlider
            label="Shadows" value={light.shadows} min={-1} max={1} defaultValue={0}
            trackGradient={BLACK_WHITE_GRADIENT}
            formatValue={formatSignedPercent}
            onChange={(v) => setLightField('shadows', v)}
          />
          <GradientSlider
            label="Blacks" value={light.blacks} min={-1} max={1} defaultValue={0}
            trackGradient={BLACK_WHITE_GRADIENT}
            formatValue={formatSignedPercent}
            onChange={(v) => setLightField('blacks', v)}
          />
        </div>
      )}

      {subTab === 'color' && (
        <div className="lineart-slidergroup-stack">
          <GradientSlider
            label="Temperature" value={colorAdjust.temperature} min={-1} max={1} defaultValue={0}
            trackGradient="linear-gradient(90deg, #5297FF 0%, #FF9547 100%)"
            formatValue={formatSignedPercent}
            onChange={(v) => setColorAdjustField('temperature', v)}
          />
          <GradientSlider
            label="Tint" value={colorAdjust.tint} min={-1} max={1} defaultValue={0}
            trackGradient="linear-gradient(90deg, #FF52EE 0%, #51FF47 100%)"
            formatValue={formatSignedPercent}
            onChange={(v) => setColorAdjustField('tint', v)}
          />
          <GradientSlider
            label="Vibrance" value={colorAdjust.vibrance} min={-1} max={1} defaultValue={0}
            trackGradient="linear-gradient(90deg, #8D8D8D 0%, #C144C8 51.923%, #FF0000 100%)"
            formatValue={formatSignedPercent}
            onChange={(v) => setColorAdjustField('vibrance', v)}
          />
          <div className="lineart-divider" />
          <div className="field-row">
            <div className="field-row-label">
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Colors</span>
            </div>
            <div className="crop-bottomcontent" style={{ padding: 0 }}>
              <button
                type="button"
                className={`pill-toggle-btn font-button-label${invert.rgb ? ' active' : ''}`}
                onClick={() => setInvert(toggleInvertRgb)}
              >
                RGB
              </button>
              <button
                type="button"
                className={`pill-toggle-btn font-button-label${invert.r ? ' active' : ''}`}
                onClick={() => setInvert((prev) => toggleInvertChannel(prev, 'r'))}
              >
                R
              </button>
              <button
                type="button"
                className={`pill-toggle-btn font-button-label${invert.g ? ' active' : ''}`}
                onClick={() => setInvert((prev) => toggleInvertChannel(prev, 'g'))}
              >
                G
              </button>
              <button
                type="button"
                className={`pill-toggle-btn font-button-label${invert.b ? ' active' : ''}`}
                onClick={() => setInvert((prev) => toggleInvertChannel(prev, 'b'))}
              >
                B
              </button>
            </div>
          </div>
          <div className="lineart-divider" />
          <div
            className="lineart-toggle-row"
            role="button"
            tabIndex={0}
            onClick={() => setGradeGradientMapField('enabled', !gradeGradientMap.enabled)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setGradeGradientMapField('enabled', !gradeGradientMap.enabled)
              }
            }}
          >
            <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Gradient Map</span>
            <ToggleSwitch on={gradeGradientMap.enabled} label="Gradient Map" />
          </div>
          {gradeGradientMap.enabled && (
            <>
              <GradientSlider
                label="Intensity" value={gradeGradientMap.intensity} min={0} max={1} defaultValue={1}
                formatValue={formatPercent}
                onChange={(v) => setGradeGradientMapField('intensity', v)}
              />
              <div className="field-row">
                <div className="field-row-label">
                  <span className="font-param-label">Blend Mode</span>
                </div>
              </div>
              <BlendModeRow
                mode={gradeGradientMap.blendMode}
                options={ALL_BLEND_OPTIONS}
                onChange={(m) => setGradeGradientMapField('blendMode', m)}
              />
              <GradientFillControls
                shadow={gradeGradientMap.shadow} mid={gradeGradientMap.mid} highlight={gradeGradientMap.highlight}
                pivot={gradeGradientMap.pivot} duoTone={gradeGradientMap.duoTone}
                onShadowChange={(rgb) => setGradeGradientMapField('shadow', rgb)}
                onMidChange={(rgb) => setGradeGradientMapField('mid', rgb)}
                onHighlightChange={(rgb) => setGradeGradientMapField('highlight', rgb)}
                onPivotChange={(v) => setGradeGradientMapField('pivot', v)}
                onDuoToneChange={(v) => setGradeGradientMapField('duoTone', v)}
              />
            </>
          )}
        </div>
      )}

      {subTab === 'hsl' && (
        <div className="lineart-slidergroup-stack">
          <div className="crop-topcontent" style={{ gap: 10 }}>
            <HslBandSelector active={activeBand} onChange={setActiveBand} />
            <button
              type="button"
              className="text-reset-btn font-value"
              onClick={() => setHslByBand((prev) => ({ ...prev, [activeBand]: IDENTITY_HSL_SHIFT }))}
            >
              Reset
            </button>
          </div>
          <GradientSlider
            label="Hue" value={activeShift.hue} min={-180} max={180} defaultValue={0} step={1}
            formatValue={(v) => `${v}°`}
            trackGradient={gradients.hue}
            onChange={(v) => setActiveShift('hue', v)}
          />
          <GradientSlider
            label="Saturation" value={activeShift.saturation} min={-1} max={1} defaultValue={0}
            trackGradient={gradients.saturation}
            formatValue={formatSignedPercent}
            onChange={(v) => setActiveShift('saturation', v)}
          />
          <GradientSlider
            label="Lightness" value={activeShift.lightness} min={-1} max={1} defaultValue={0}
            formatValue={formatSignedPercent}
            trackGradient={gradients.lightness}
            onChange={(v) => setActiveShift('lightness', v)}
          />
        </div>
      )}
    </BottomSheet>
  )
}
