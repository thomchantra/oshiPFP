import { useEffect, useState } from 'react'
import { useLabPipeline } from './useLabPipeline'
import type { LabMode, ViewMode } from './labPipeline'

const MODES: { id: LabMode; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'v1-reference', label: 'V1 reference (threshold + grow)' },
  { id: 'pathA', label: 'Path A (continuous erosion)' },
  { id: 'pathB', label: 'Path B (distance transform)' },
  { id: 'pathC', label: 'Path C (erosion + soft gate)' },
  { id: 'pathD', label: 'Path D (octagon approximation)' },
  { id: 'pathF', label: 'Path F (find edges + dilate)' },
  { id: 'pathE', label: 'Path E (vectorize + offset)' },
]

const MASK_MODES: LabMode[] = ['v1-reference', 'pathB', 'pathF', 'pathD', 'pathE']

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'composited', label: 'Composited' },
  { id: 'raw', label: 'Raw output' },
]

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  decimals = 2,
  testId,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  decimals?: number
  testId: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      {label}: {value.toFixed(decimals)}
      <input
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function LabApp() {
  const pipeline = useLabPipeline()
  const [mode, setMode] = useState<LabMode>('original')
  const [viewMode, setViewMode] = useState<ViewMode>('composited')
  const [threshold, setThreshold] = useState(0.5)
  const [radius, setRadius] = useState(1.5)
  const [hardness, setHardness] = useState(0)
  const [gateThreshold, setGateThreshold] = useState(0.15)
  const [sensitivity, setSensitivity] = useState(8)
  const [colorExpansion, setColorExpansion] = useState(false)
  const [gamma, setGamma] = useState(1)
  const [colorContrast, setColorContrast] = useState(1)
  const [saturation, setSaturation] = useState(1)
  const [opacity, setOpacity] = useState(1)
  const [exposure, setExposure] = useState(0)
  const [contrast, setContrast] = useState(1)
  const [blackClip, setBlackClip] = useState(0)
  const [whiteClip, setWhiteClip] = useState(1)
  const [tintColorHex, setTintColorHex] = useState('#000000')
  const [vividMode, setVividMode] = useState(false)
  const [tintEnabled, setTintEnabled] = useState(false)
  const [vividDeadzone, setVividDeadzone] = useState(0.15)
  const [vividBoost, setVividBoost] = useState(1.8)
  const [denoiseEnabled, setDenoiseEnabled] = useState(false)
  const [denoiseIntensity, setDenoiseIntensity] = useState(0.4)
  const [denoiseThreshold, setDenoiseThreshold] = useState(0.15)
  const [tracing, setTracing] = useState(false)
  const [traceStatus, setTraceStatus] = useState<string | null>(null)

  useEffect(() => {
    pipeline.setMode(mode)
    // pipeline identity is stable from useLabPipeline; only re-run when mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])
  useEffect(() => {
    pipeline.setViewMode(viewMode)
    // pipeline identity is stable from useLabPipeline; only re-run when viewMode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])
  // "Hardness" macro (-1..1), shared across Path B and Path C now — no
  // sharpen/positive-side concept (two attempts at that were both dropped,
  // see changelog/oshipfp-v0.2-lineart-saga.md). Pure feather-intensity
  // remap, anchored at 3 points against a per-path "old cap" base:
  //   -1 -> 2x the base (200% feather)
  //    0 -> half the base
  //    1 -> 0 (hard clip)
  // Piecewise-linear between those anchors (the two segments have
  // different slopes, so this isn't a single linear formula). Path C's
  // own standalone Feather slider (0.01-0.3) turned out too narrow to
  // have any visible effect against real art — its gate-threshold compare
  // operates on luminance deltas that need a wider feather range, so it
  // adopted the same hardness convention with a larger base instead of
  // keeping a separate raw slider.
  const HARDNESS_BASE_MAX_FEATHER: Partial<Record<LabMode, number>> = { pathB: 5, pathC: 1 }
  const hardnessBase = HARDNESS_BASE_MAX_FEATHER[mode]
  const hardnessFeather = hardnessBase
    ? hardness <= 0
      ? hardnessBase * (2 - 1.5 * (hardness + 1))
      : hardnessBase * 0.5 * (1 - hardness)
    : 0
  const effectiveFeather = hardnessFeather

  useEffect(() => {
    pipeline.setParams({
      threshold,
      radius,
      feather: effectiveFeather,
      gateThreshold,
      sensitivity,
      colorExpansion,
      gamma,
      colorContrast,
      saturation,
      opacity,
      exposure,
      contrast,
      blackClip,
      whiteClip,
      tintColor: hexToRgb01(tintColorHex),
      vividMode,
      tintEnabled,
      vividDeadzone,
      vividBoost,
      denoiseEnabled,
      denoiseIntensity,
      denoiseThreshold,
    })
    // pipeline identity is stable from useLabPipeline; only re-run when params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    threshold,
    radius,
    effectiveFeather,
    gateThreshold,
    sensitivity,
    colorExpansion,
    gamma,
    colorContrast,
    saturation,
    opacity,
    exposure,
    contrast,
    blackClip,
    whiteClip,
    tintColorHex,
    vividMode,
    tintEnabled,
    vividDeadzone,
    vividBoost,
    denoiseEnabled,
    denoiseIntensity,
    denoiseThreshold,
  ])

  const isMaskMode = MASK_MODES.includes(mode) && !(mode === 'pathB' && colorExpansion)
  const showThreshold = mode === 'v1-reference' || mode === 'pathB' || mode === 'pathD' || mode === 'pathE'
  const showRadius = mode !== 'original'
  const showHardness = mode === 'pathB' || mode === 'pathC'
  const showGateThreshold = mode === 'pathC'
  const showSensitivity = mode === 'pathF'
  const showColorExpansion = mode === 'pathB'
  const showGamma = mode === 'pathB' || mode === 'pathF'
  const showColorContrast = mode === 'pathB' && colorExpansion
  const showSaturation = mode === 'pathF'
  const showTintColor = mode === 'pathD' || mode === 'pathF'
  const showTintEnabled = mode === 'pathF'
  const showOpacity = mode !== 'original'
  const showTraceButton = mode === 'pathE'
  const radiusIsIntGrow = mode === 'v1-reference' || mode === 'pathD'
  const radiusIsPxFloatFine = mode === 'pathB'
  const radiusIsPxFloat = mode === 'pathE'
  const radiusIsErosionTexelsFine = mode === 'pathC' || mode === 'pathF'

  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, fontFamily: 'monospace', color: '#eee', background: '#1a1a1a', minHeight: '100vh' }}>
      <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>oshiPFP lab — line art expansion</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Desktop debug harness. Not the product UI — see docs/oshipfp-v0.2-lineart-expansion-spec.md.
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          Image
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) pipeline.loadFile(file)
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          Algorithm
          <select value={mode} onChange={(e) => setMode(e.target.value as LabMode)}>
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          View
          <div style={{ display: 'flex', gap: 4 }}>
            {VIEW_MODES.map((v) => (
              <button
                key={v.id}
                data-testid={`view-${v.id}`}
                onClick={() => setViewMode(v.id)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  background: viewMode === v.id ? '#3060c0' : '#2a2a2a',
                  color: '#eee',
                  border: '1px solid #444',
                  cursor: 'pointer',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 10,
            border: '1px solid #333',
            borderRadius: 4,
          }}
        >
          <p style={{ fontSize: 12, color: '#aaa', margin: 0, fontWeight: 'bold' }}>Color correction (pre-detection)</p>
          <Slider label="Exposure" value={exposure} onChange={setExposure} min={-3} max={3} step={0.01} testId="slider-exposure" />
          <Slider label="Contrast" value={contrast} onChange={setContrast} min={0.2} max={3} step={0.01} testId="slider-contrast" />
          <Slider label="Black clip" value={blackClip} onChange={setBlackClip} min={0} max={0.9} step={0.01} testId="slider-black-clip" />
          <Slider label="White clip" value={whiteClip} onChange={setWhiteClip} min={0.1} max={1} step={0.01} testId="slider-white-clip" />
          <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
            Feeds only the detection input (threshold/edge-detection) of v1, Path B, Path D, Path F, and Path E's
            trace — never the base image being darkened. No effect on Path A/C: their erosion output IS the final
            color, so correcting it would recolor the result, not just tune detection.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 10,
            border: '1px solid #333',
            borderRadius: 4,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 'bold', color: '#aaa' }}>
            <input
              type="checkbox"
              data-testid="checkbox-denoise-enabled"
              checked={denoiseEnabled}
              onChange={(e) => setDenoiseEnabled(e.target.checked)}
            />
            Denoise (pre-detection, experimental)
          </label>
          {denoiseEnabled && (
            <>
              <Slider
                label="Intensity (kernel size)"
                value={denoiseIntensity}
                onChange={setDenoiseIntensity}
                min={0}
                max={1}
                step={0.01}
                decimals={2}
                testId="slider-denoise-intensity"
              />
              <Slider
                label="Threshold (edge sensitivity)"
                value={denoiseThreshold}
                onChange={setDenoiseThreshold}
                min={0.01}
                max={0.6}
                step={0.01}
                decimals={2}
                testId="slider-denoise-threshold"
              />
            </>
          )}
          <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
            Edge-aware range filter ported from a prior Metal/Core Image kernel (referencecode/Shaders2.metal) —
            first pass to test relevance, not an established stage. Chains after color correction, same
            detection-only scope (v1/B/D/F/E, never the composited base). Off by default.
          </p>
        </div>

        {showThreshold && (
          <Slider label="Threshold" value={threshold} onChange={setThreshold} min={0} max={1} step={0.01} testId="slider-threshold" />
        )}

        {showRadius && radiusIsIntGrow && (
          <Slider label="Radius (texels)" value={radius} onChange={setRadius} min={0} max={40} step={1} decimals={0} testId="slider-radius" />
        )}
        {showRadius && radiusIsPxFloatFine && (
          <Slider label="Radius (px)" value={radius} onChange={setRadius} min={0} max={40} step={0.01} decimals={2} testId="slider-radius" />
        )}
        {showRadius && radiusIsPxFloat && (
          <Slider label="Radius (px)" value={radius} onChange={setRadius} min={0} max={40} step={0.5} decimals={1} testId="slider-radius" />
        )}
        {showRadius && radiusIsErosionTexelsFine && (
          <Slider label="Radius (texels)" value={radius} onChange={setRadius} min={0} max={6} step={0.01} decimals={2} testId="slider-radius" />
        )}
        {showRadius && !radiusIsIntGrow && !radiusIsPxFloatFine && !radiusIsPxFloat && !radiusIsErosionTexelsFine && (
          <Slider label="Radius (texels)" value={radius} onChange={setRadius} min={0} max={6} step={0.1} decimals={2} testId="slider-radius" />
        )}

        {showSensitivity && (
          <Slider label="Sensitivity" value={sensitivity} onChange={setSensitivity} min={0.1} max={30} step={0.1} decimals={1} testId="slider-sensitivity" />
        )}

        {showHardness && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Slider label="Hardness" value={hardness} onChange={setHardness} min={-1} max={1} step={0.01} decimals={2} testId="slider-hardness" />
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>-1 = 200% feather · 0 = 50% feather · 1 = hard clip (default)</p>
          </div>
        )}

        {showColorExpansion && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input
              type="checkbox"
              data-testid="checkbox-color-expansion"
              checked={colorExpansion}
              onChange={(e) => setColorExpansion(e.target.checked)}
            />
            Color expansion (sample nearest line color instead of black)
          </label>
        )}

        {showGamma && (
          <Slider
            label="Gamma (blob contrast)"
            value={gamma}
            onChange={setGamma}
            min={0.2}
            max={5}
            step={0.1}
            decimals={1}
            testId="slider-gamma"
          />
        )}

        {showColorContrast && (
          <Slider
            label="Color contrast"
            value={colorContrast}
            onChange={setColorContrast}
            min={0.2}
            max={3}
            step={0.1}
            decimals={1}
            testId="slider-color-contrast"
          />
        )}

        {showSaturation && (
          <Slider
            label="Saturation"
            value={saturation}
            onChange={setSaturation}
            min={0}
            max={2}
            step={0.01}
            decimals={2}
            testId="slider-saturation"
          />
        )}

        {showGateThreshold && (
          <Slider
            label="Gate threshold"
            value={gateThreshold}
            onChange={setGateThreshold}
            min={0}
            max={1}
            step={0.01}
            decimals={2}
            testId="slider-gate-threshold"
          />
        )}

        {showTintEnabled && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input
              type="checkbox"
              data-testid="checkbox-tint-enabled"
              checked={tintEnabled}
              onChange={(e) => setTintEnabled(e.target.checked)}
            />
            Tint mode (override colored edges with a flat tint — makes alpha overdrive's multiply stacking visible)
          </label>
        )}

        {showTintColor && (mode !== 'pathF' || tintEnabled) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              Tint color (multiply target)
              <input
                type="color"
                data-testid="input-tint-color"
                value={tintColorHex}
                onChange={(e) => setTintColorHex(e.target.value)}
                disabled={vividMode}
                style={{ width: 60, height: 24, padding: 0, border: '1px solid #444', background: 'none', opacity: vividMode ? 0.4 : 1 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                data-testid="checkbox-vivid-mode"
                checked={vividMode}
                onChange={(e) => setVividMode(e.target.checked)}
              />
              Vivid mode (per-pixel: boost the source's own color where it's already chromatic, instead of one flat
              swatch)
            </label>
            {vividMode && (
              <>
                <Slider
                  label="Vivid deadzone (saturation floor, ignored below)"
                  value={vividDeadzone}
                  onChange={setVividDeadzone}
                  min={0}
                  max={0.6}
                  step={0.01}
                  decimals={2}
                  testId="slider-vivid-deadzone"
                />
                <Slider
                  label="Vivid boost"
                  value={vividBoost}
                  onChange={setVividBoost}
                  min={1}
                  max={4}
                  step={0.05}
                  decimals={2}
                  testId="slider-vivid-boost"
                />
              </>
            )}
          </div>
        )}

        {showTraceButton && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              data-testid="button-trace"
              disabled={tracing || !pipeline.sourceSize}
              onClick={() => {
                setTracing(true)
                setTraceStatus(null)
                // Yield a frame so the "Tracing..." label actually paints
                // before the synchronous CPU trace/offset work blocks the
                // main thread — this isn't slider-reactive like every
                // other path, see labPipeline.ts's runPathE doc comment.
                setTimeout(async () => {
                  const result = await pipeline.runPathE(radius, threshold)
                  setTracing(false)
                  setTraceStatus(result ? `Traced ${result.contourCount} contours` : 'Trace failed — see error below')
                }, 0)
              }}
              style={{
                padding: '6px 10px',
                fontFamily: 'inherit',
                fontSize: 12,
                background: tracing ? '#444' : '#3060c0',
                color: '#eee',
                border: '1px solid #444',
                cursor: tracing ? 'default' : 'pointer',
              }}
            >
              {tracing ? 'Tracing…' : 'Trace'}
            </button>
            {traceStatus && <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{traceStatus}</p>}
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Not slider-reactive — adjust threshold/radius above, then click Trace to re-run.
            </p>
          </div>
        )}

        {showOpacity && (
          <Slider
            label={mode === 'pathF' ? 'Multiply opacity (alpha overdrive)' : isMaskMode ? 'Multiply opacity' : 'Overlay opacity'}
            value={opacity}
            onChange={setOpacity}
            min={0}
            max={mode === 'pathF' ? 3 : 1}
            step={0.01}
            decimals={2}
            testId="slider-opacity"
          />
        )}
        {isMaskMode && (
          <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
            Mask mode: composited via true multiply blend (darkens base colors), not a crossfade.
            {mode === 'pathF' &&
              ` Alpha overdrive: layer 1 ${Math.round(Math.min(Math.max(opacity, 0), 1) * 100)}% · layer 2 ${Math.round(
                Math.min(Math.max(opacity - 1, 0), 1) * 100,
              )}% · layer 3 ${Math.round(Math.min(Math.max(opacity - 2, 0), 1) * 100)}%`}
          </p>
        )}

        {pipeline.error && <p style={{ color: '#f66', fontSize: 12 }}>{pipeline.error}</p>}
        {pipeline.sourceSize && (
          <p style={{ fontSize: 12, color: '#888' }}>
            Source: {pipeline.sourceSize.width}×{pipeline.sourceSize.height}
          </p>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <canvas ref={pipeline.canvasRef} style={{ maxWidth: '100%', height: 'auto', background: '#000' }} />
        {!pipeline.sourceSize && !pipeline.error && (
          <p style={{ fontSize: 12, color: '#888' }}>Upload an image to begin.</p>
        )}
      </div>
    </div>
  )
}
