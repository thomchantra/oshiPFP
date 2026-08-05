import { useState } from 'react'
import BottomSheet from './BottomSheet'
import IconButton from './IconButton'
import GradientSlider from './GradientSlider'
import ToggleSwitch from './ToggleSwitch'
import Modal from './Modal'
import Icon from './Icon'
import type { BlendMode, ColorMode, LineArtMode, LineArtParams } from '../types'

interface LineArtPanelProps {
  params: LineArtParams
  onChange: (params: LineArtParams) => void
  /** Resets the currently active algorithm's params to factory defaults and reverts the display mode to Composite — App.tsx owns both (per-mode param cache and the global display-mode toggle), so this is a plain callback rather than something LineArtPanel can derive from params/onChange alone. */
  onReset: () => void
}

const ALGO_OPTIONS: { mode: LineArtMode; label: string; icon: 'rose' | 'spark' | 'diamond' | 'spiral' }[] = [
  { mode: 'pathB', label: 'Botan', icon: 'rose' },
  { mode: 'pathC', label: 'Chie', icon: 'spark' },
  { mode: 'pathD', label: 'Daiya', icon: 'diamond' },
  { mode: 'pathF', label: 'Fumiko', icon: 'spiral' },
]

const ALGO_INFO: { mode: LineArtMode; label: string; technique: string; icon: 'rose' | 'spark' | 'diamond' | 'spiral'; blurb: string }[] = [
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
]

const IDENTITY_TONE_SHAPING = { exposure: 0, contrast: 0, blackClip: 0, whiteClip: 1 }
const IDENTITY_DENOISE = { intensity: 0, threshold: 0 }

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Controlled by App.tsx (params live there, not locally) so slider values survive switching away from and back to the Line Art tab — this component used to own the state itself and reset to defaults on every remount. */
export default function LineArtPanel({ params, onChange, onReset }: LineArtPanelProps) {
  const [infoOpen, setInfoOpen] = useState(false)

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
          other mode — Tone Shaping/Denoise are real no-ops here, so hide them
          rather than leave dead controls the user can fiddle with for nothing. */}
      {params.mode !== 'pathC' && (
      <div className="lineart-preprocessing">
        <div className="lineart-preprocessing-header">
          <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Pre-processing</span>
          <button
            type="button"
            className="text-reset-btn font-value"
            onClick={() =>
              onChange({
                ...params,
                toneShapingEnabled: false,
                toneShaping: IDENTITY_TONE_SHAPING,
                denoiseEnabled: false,
                denoise: IDENTITY_DENOISE,
              })
            }
          >
            Reset
          </button>
        </div>
        <div className="lineart-preprocessing-toggles">
          <button
            type="button"
            className={`pill-toggle-btn font-button-label${params.toneShapingEnabled ? ' active' : ''}`}
            onClick={() => set('toneShapingEnabled', !params.toneShapingEnabled)}
          >
            Tone Shaping
          </button>
          <button
            type="button"
            className={`pill-toggle-btn font-button-label${params.denoiseEnabled ? ' active' : ''}`}
            onClick={() => set('denoiseEnabled', !params.denoiseEnabled)}
          >
            Denoise
          </button>
        </div>

        {params.toneShapingEnabled && (
          <div className="lineart-slidergroup-stack">
            <GradientSlider
              label="Exposure" value={params.toneShaping.exposure} min={-3} max={3} defaultValue={0}
              onChange={(v) => set('toneShaping', { ...params.toneShaping, exposure: v })}
            />
            <GradientSlider
              label="Contrast" value={params.toneShaping.contrast} min={-0.8} max={2} defaultValue={0}
              onChange={(v) => set('toneShaping', { ...params.toneShaping, contrast: v })}
            />
            <GradientSlider
              label="Black Clip" value={params.toneShaping.blackClip} min={0} max={0.5} defaultValue={0}
              onChange={(v) => set('toneShaping', { ...params.toneShaping, blackClip: v })}
            />
            <GradientSlider
              label="White Clip" value={params.toneShaping.whiteClip} min={0.5} max={1} defaultValue={1}
              onChange={(v) => set('toneShaping', { ...params.toneShaping, whiteClip: v })}
            />
          </div>
        )}
        {params.toneShapingEnabled && params.denoiseEnabled && <div className="lineart-divider" />}
        {params.denoiseEnabled && (
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

      <BlendModeRow
        mode={params.blendMode}
        options={params.mode === 'pathF' && params.colorMode === 'findEdge' ? FIND_EDGE_BLEND_OPTIONS : ALL_BLEND_OPTIONS}
        onChange={(v) => set('blendMode', v)}
      />
      <div className="lineart-divider" />

      <div className="lineart-slidergroup-stack">
        <GradientSlider
          label="Overlay Opacity" value={params.opacity} min={0} max={3} defaultValue={1}
          formatValue={() => `${opacityPct}%`}
          onChange={(v) => set('opacity', v)}
        />

        {params.mode === 'pathB' && (
          <>
            <GradientSlider label="Threshold" value={params.threshold} min={0} max={1} defaultValue={0} onChange={(v) => set('threshold', v)} />
            <GradientSlider label="Radius (px)" value={params.radius} min={0} max={20} defaultValue={1} step={0.01} onChange={(v) => set('radius', v)} />
            <GradientSlider label="Hardness" value={params.hardness} min={-1} max={1} defaultValue={0} onChange={(v) => set('hardness', v)} />
            <GradientSlider label="Blob Contrast" value={params.blobContrast} min={0.2} max={5} defaultValue={1} onChange={(v) => set('blobContrast', v)} />
            <div className="lineart-divider" />
            <div
              className="lineart-toggle-row"
              role="button"
              tabIndex={0}
              onClick={() => set('colorExpansion', !params.colorExpansion)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  set('colorExpansion', !params.colorExpansion)
                }
              }}
            >
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Color Expansion</span>
              <ToggleSwitch on={params.colorExpansion} label="Color Expansion" />
            </div>
            {params.colorExpansion && (
              <GradientSlider label="Color Contrast" value={params.colorContrast} min={0.2} max={3} defaultValue={1} onChange={(v) => set('colorContrast', v)} />
            )}
            {!params.colorExpansion && (
              <TintColorRow label="Line Color" tintColor={params.tintColor} onChange={(rgb) => set('tintColor', rgb)} />
            )}
          </>
        )}

        {params.mode === 'pathC' && (
          <>
            <GradientSlider label="Gate Threshold" value={params.gateThreshold} min={0} max={1} defaultValue={0} onChange={(v) => set('gateThreshold', v)} />
            <GradientSlider label="Radius (texels)" value={params.radius} min={0} max={20} defaultValue={1} step={0.01} onChange={(v) => set('radius', v)} />
            <GradientSlider label="Hardness" value={params.hardness} min={-1} max={1} defaultValue={0} onChange={(v) => set('hardness', v)} />
          </>
        )}

        {params.mode === 'pathD' && (
          <>
            <GradientSlider label="Threshold" value={params.threshold} min={0} max={1} defaultValue={0.05} onChange={(v) => set('threshold', v)} />
            <GradientSlider label="Radius (texels)" value={params.radius} min={0} max={20} defaultValue={1} step={0.01} onChange={(v) => set('radius', v)} />
            <div className="lineart-divider" />
            <ColorModeRow mode={params.colorMode} options={['tint', 'vivid']} onChange={(v) => set('colorMode', v)} />
            {params.colorMode === 'tint' && (
              <TintColorRow tintColor={params.tintColor} onChange={(rgb) => set('tintColor', rgb)} />
            )}
            {params.colorMode === 'vivid' && (
              <>
                <GradientSlider label="Vivid Deadzone" value={params.vividDeadzone} min={0} max={0.6} defaultValue={0.15} onChange={(v) => set('vividDeadzone', v)} />
                <GradientSlider label="Vivid Boost" value={params.vividBoost} min={1} max={4} defaultValue={1} onChange={(v) => set('vividBoost', v)} />
              </>
            )}
          </>
        )}

        {params.mode === 'pathF' && (
          <>
            <GradientSlider label="Sensitivity" value={params.sensitivity} min={0.5} max={20} defaultValue={3} onChange={(v) => set('sensitivity', v)} />
            <GradientSlider label="Radius (texels)" value={params.radius} min={0} max={3} defaultValue={0.5} step={0.1} onChange={(v) => set('radius', v)} />
            <GradientSlider label="Saturation" value={params.saturation} min={0} max={2} defaultValue={0.5} onChange={(v) => set('saturation', v)} />
            <div className="lineart-divider" />
            <ColorModeRow mode={params.colorMode} options={['findEdge', 'tint', 'vivid']} onChange={(v) => set('colorMode', v)} />
            {params.colorMode === 'tint' && (
              <TintColorRow tintColor={params.tintColor} onChange={(rgb) => set('tintColor', rgb)} />
            )}
            {params.colorMode === 'vivid' && (
              <>
                <GradientSlider label="Vivid Deadzone" value={params.vividDeadzone} min={0} max={0.6} defaultValue={0.15} onChange={(v) => set('vividDeadzone', v)} />
                <GradientSlider label="Vivid Boost" value={params.vividBoost} min={1} max={4} defaultValue={1} onChange={(v) => set('vividBoost', v)} />
              </>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}

const BLEND_MODE_LABELS: Record<BlendMode, string> = { multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay' }
const ALL_BLEND_OPTIONS: BlendMode[] = ['multiply', 'screen', 'overlay']
/** Fumiko's "Find Edge" color mode bakes its colored-edge look into a per-channel white-toward-black fade that only reads correctly under Multiply — see pipeline.ts's forcedMultiply. */
const FIND_EDGE_BLEND_OPTIONS: BlendMode[] = ['multiply']

function BlendModeRow({ mode, options, onChange }: { mode: BlendMode; options: BlendMode[]; onChange: (m: BlendMode) => void }) {
  return (
    <div className="field-row">
      <div className="field-row-label">
        <span className="font-param-label">Blend Mode</span>
      </div>
      <div className="crop-bottomcontent" style={{ padding: 0 }}>
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
    </div>
  )
}

const COLOR_MODE_LABELS: Record<ColorMode, string> = { findEdge: 'Find Edge', tint: 'Tint', vivid: 'Vivid' }

function ColorModeRow({ mode, options, onChange }: { mode: ColorMode; options: ColorMode[]; onChange: (m: ColorMode) => void }) {
  return (
    <div className="field-row">
      <div className="field-row-label">
        <span className="font-param-label">Color Mode</span>
      </div>
      <div className="crop-bottomcontent" style={{ padding: 0 }}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`pill-toggle-btn font-button-label${mode === opt ? ' active' : ''}`}
            onClick={() => onChange(opt)}
          >
            {COLOR_MODE_LABELS[opt]}
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
