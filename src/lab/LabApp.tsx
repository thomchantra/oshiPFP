import { useEffect, useState, type MouseEvent } from 'react'
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
  { id: 'pathG', label: 'Path G – Gumi (luminance band + closing)' },
  { id: 'pathH', label: 'Path H – High Pass (blur diff)' },
  { id: 'pathI', label: 'Path I – Laplacian' },
]

const MASK_MODES: LabMode[] = ['v1-reference', 'pathB', 'pathF', 'pathD', 'pathE', 'pathG']

const BLEND_MODE_LABELS: Record<number, string> = { 0: 'Replace', 1: 'Multiply', 2: 'Screen', 3: 'Overlay' }

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'composited', label: 'Composited' },
  { id: 'raw', label: 'Raw output' },
]

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const RAMP_LUMINANCE_WEIGHTS: [number, number, number] = [0.2126, 0.7152, 0.0722]

function rgbLuminance([r, g, b]: [number, number, number]): number {
  return r * RAMP_LUMINANCE_WEIGHTS[0] + g * RAMP_LUMINANCE_WEIGHTS[1] + b * RAMP_LUMINANCE_WEIGHTS[2]
}

/**
 * Derives plateau-ramp floor/inner-low/inner-high/ceiling from two
 * eyedropper samples (a line pixel and a background pixel) — the
 * Photoshop Curves-eyedropper idea: let the user point at ground truth
 * instead of guessing where the histogram's "line cluster" is. Inner-low/
 * inner-high bracket the line sample tightly; floor/ceiling get pushed
 * out toward (but short of) the background sample on whichever side it
 * sits, so it lands safely outside the selected band with some margin.
 * Handles either polarity (line darker or lighter than background).
 */
function calibrateRamp(lineLum: number, bgLum: number) {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const gap = Math.abs(bgLum - lineLum)
  const margin = Math.max(0.015, gap * 0.15)
  const innerLow = clamp01(lineLum - margin)
  const innerHigh = clamp01(lineLum + margin)
  const push = Math.max(margin, gap * 0.7)
  if (bgLum >= lineLum) {
    return { floor: clamp01(innerLow - margin), innerLow, innerHigh, ceiling: clamp01(lineLum + push) }
  }
  return { floor: clamp01(lineLum - push), innerLow, innerHigh, ceiling: clamp01(innerHigh + margin) }
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
  const [rampEnabled, setRampEnabled] = useState(false)
  const [rampFloor, setRampFloor] = useState(0)
  const [rampInnerLow, setRampInnerLow] = useState(0.3)
  const [rampInnerHigh, setRampInnerHigh] = useState(0.7)
  const [rampCeiling, setRampCeiling] = useState(1)
  const [rampFeather, setRampFeather] = useState(0)
  const [gumiContrastBoost, setGumiContrastBoost] = useState(1)
  const [blobMaxDt, setBlobMaxDt] = useState(8)
  const [gumiBlobGamma, setGumiBlobGamma] = useState(1)
  const [thresholdEnabled, setThresholdEnabled] = useState(false)
  const [highPassStrength, setHighPassStrength] = useState(1)
  const [laplacianStrength, setLaplacianStrength] = useState(1)
  const [dragActive, setDragActive] = useState(false)
  const [splitMode, setSplitMode] = useState(false)
  const [gumiColorBleed, setGumiColorBleed] = useState(false)
  const [gumiBleedFeather, setGumiBleedFeather] = useState(1.5)
  const [gumiSoftDetection, setGumiSoftDetection] = useState(false)
  const [gumiSoftness, setGumiSoftness] = useState(0.1)
  const [gumiFillMode, setGumiFillMode] = useState(false)
  const [pickTarget, setPickTarget] = useState<'line' | 'background' | null>(null)
  const [lineSample, setLineSample] = useState<{ rgb: [number, number, number]; lum: number } | null>(null)
  const [bgSample, setBgSample] = useState<{ rgb: [number, number, number]; lum: number } | null>(null)
  const [gumiGradientMap, setGumiGradientMap] = useState(false)
  const [gumiGradientShadowHex, setGumiGradientShadowHex] = useState('#000000')
  const [gumiGradientMidHex, setGumiGradientMidHex] = useState('#808080')
  const [gumiGradientHighlightHex, setGumiGradientHighlightHex] = useState('#ffffff')
  const [laplacianPreBlur, setLaplacianPreBlur] = useState(0)
  const [laplacianSharpenAmount, setLaplacianSharpenAmount] = useState(0)
  const [laplacianGrow, setLaplacianGrow] = useState(0)
  const [hiToneTarget, setHiToneTarget] = useState<'off' | 'multiply' | 'screen'>('off')
  const [hiToneGain, setHiToneGain] = useState(1)
  const [hiToneContrast, setHiToneContrast] = useState(1)
  const [highPassResponsiveColor, setHighPassResponsiveColor] = useState(false)
  const [responsiveCrossover, setResponsiveCrossover] = useState(0.5)
  const [responsiveGrow, setResponsiveGrow] = useState(0)
  const [responsiveGrowBias, setResponsiveGrowBias] = useState(0)
  const [compositeBlendMode, setCompositeBlendMode] = useState(1)

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
  useEffect(() => {
    pipeline.setSplitMode(splitMode)
    // pipeline identity is stable from useLabPipeline; only re-run when splitMode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMode])
  // Eyedropper calibration: re-applies the derived ramp any time either
  // sample changes (including re-picking one after the other's already
  // set), not just once both first become non-null.
  useEffect(() => {
    if (!lineSample || !bgSample) return
    const { floor, innerLow, innerHigh, ceiling } = calibrateRamp(lineSample.lum, bgSample.lum)
    setRampFloor(floor)
    setRampInnerLow(innerLow)
    setRampInnerHigh(innerHigh)
    setRampCeiling(ceiling)
  }, [lineSample, bgSample])

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!pickTarget) return
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const fracX = (e.clientX - rect.left) / rect.width
    const fracY = (e.clientY - rect.top) / rect.height
    // Split mode doubles the canvas width (Original | Composited side by
    // side) — both halves share the same native coordinate space, so fold
    // whichever half was clicked back into it via modulo.
    const paneWidth = pipeline.sourceSize?.width ?? canvas.width
    const nativeX = (fracX * canvas.width) % paneWidth
    const nativeY = fracY * canvas.height
    const rgb = pipeline.pickPixel(nativeX, nativeY)
    if (!rgb) return
    const sample = { rgb, lum: rgbLuminance(rgb) }
    if (pickTarget === 'line') setLineSample(sample)
    else setBgSample(sample)
    setPickTarget(null)
  }
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
      rampEnabled,
      rampFloor,
      rampInnerLow,
      rampInnerHigh,
      rampCeiling,
      rampFeather,
      gumiContrastBoost,
      blobMaxDt,
      gumiBlobGamma,
      gumiColorBleed,
      gumiBleedFeather,
      gumiSoftDetection,
      gumiSoftness,
      gumiFillMode,
      gumiGradientMap,
      gumiGradientShadow: hexToRgb01(gumiGradientShadowHex),
      gumiGradientMid: hexToRgb01(gumiGradientMidHex),
      gumiGradientHighlight: hexToRgb01(gumiGradientHighlightHex),
      thresholdEnabled,
      highPassStrength,
      laplacianStrength,
      laplacianPreBlur,
      laplacianSharpenAmount,
      laplacianGrow,
      hiToneTarget,
      hiToneGain,
      hiToneContrast,
      highPassResponsiveColor,
      responsiveCrossover,
      responsiveGrow,
      responsiveGrowBias,
      compositeBlendMode,
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
    rampEnabled,
    rampFloor,
    rampInnerLow,
    rampInnerHigh,
    rampCeiling,
    rampFeather,
    gumiContrastBoost,
    blobMaxDt,
    gumiBlobGamma,
    gumiColorBleed,
    gumiBleedFeather,
    gumiSoftDetection,
    gumiSoftness,
    gumiFillMode,
    gumiGradientMap,
    gumiGradientShadowHex,
    gumiGradientMidHex,
    gumiGradientHighlightHex,
    thresholdEnabled,
    highPassStrength,
    laplacianStrength,
    laplacianPreBlur,
    laplacianSharpenAmount,
    laplacianGrow,
    hiToneTarget,
    hiToneGain,
    hiToneContrast,
    highPassResponsiveColor,
    responsiveCrossover,
    responsiveGrow,
    responsiveGrowBias,
    compositeBlendMode,
  ])

  const isGumiDotStamping = mode === 'pathG' && !gumiGradientMap
  const isMaskMode =
    (MASK_MODES.includes(mode) || mode === 'pathH' || mode === 'pathI') &&
    !(mode === 'pathB' && colorExpansion) &&
    !(mode === 'pathG' && gumiGradientMap)
  const showThreshold =
    mode === 'v1-reference' || mode === 'pathB' || mode === 'pathD' || mode === 'pathE' || isGumiDotStamping
  const showRadius = mode !== 'original' && mode !== 'pathI' && !(mode === 'pathG' && gumiGradientMap)
  const showHardness = mode === 'pathB' || mode === 'pathC'
  const showGateThreshold = mode === 'pathC'
  const showSensitivity = mode === 'pathF'
  const showColorExpansion = mode === 'pathB' || (isGumiDotStamping && gumiColorBleed)
  const showGamma = mode === 'pathB' || mode === 'pathF' || (isGumiDotStamping && gumiColorBleed)
  const showColorContrast = (mode === 'pathB' && colorExpansion) || (isGumiDotStamping && gumiColorBleed && colorExpansion)
  const showSaturation = mode === 'pathF'
  const showTintColor = mode === 'pathD' || mode === 'pathF'
  const showTintEnabled = mode === 'pathF'
  const showOpacity = mode !== 'original'
  const showTraceButton = mode === 'pathE'
  const radiusIsIntGrow = mode === 'v1-reference' || mode === 'pathD' || mode === 'pathG'
  const radiusIsPxFloatFine = mode === 'pathB' || mode === 'pathH'
  const radiusIsPxFloat = mode === 'pathE'
  const radiusIsErosionTexelsFine = mode === 'pathC' || mode === 'pathF'
  const showRampToggle =
    mode === 'v1-reference' || mode === 'pathB' || mode === 'pathD' || mode === 'pathF' || mode === 'pathH' || mode === 'pathI'
  const showRampSliders = isGumiDotStamping || (showRampToggle && rampEnabled)
  const showGumiContrastBoost = isGumiDotStamping
  const showBlobMaxDt = isGumiDotStamping
  const showGumiColorBleed = isGumiDotStamping
  const showGumiBleedFeather = isGumiDotStamping && gumiColorBleed
  const showGumiSoftDetection = isGumiDotStamping
  const showGumiFillMode = isGumiDotStamping
  const showGumiCalibration = isGumiDotStamping
  const showGumiGradientMap = mode === 'pathG'
  const showGumiGradientColors = mode === 'pathG' && gumiGradientMap
  const showHighPassStrength = mode === 'pathH'
  const showLaplacianStrength = mode === 'pathI'
  const showLaplacianPreBlur = mode === 'pathI'
  const showLaplacianSharpenAmount = mode === 'pathI'
  const showLaplacianGrow = mode === 'pathI'
  const showResponsiveColor = mode === 'pathH'
  const showHiTreatment = mode === 'pathI' || (mode === 'pathH' && !highPassResponsiveColor)
  const showBlendMode = isMaskMode

  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, fontFamily: 'monospace', color: '#eee', background: '#1a1a1a', height: '100vh', boxSizing: 'border-box' }}>
      <div
        style={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: 8,
        }}
      >
        <h1 style={{ fontSize: 16, margin: 0 }}>oshiPFP lab — line art expansion</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Desktop debug harness. Not the product UI — see docs/oshipfp-v0.2-lineart-expansion-spec.md.
        </p>

        <button
          data-testid="button-ab-toggle"
          onClick={() => setSplitMode((v) => !v)}
          style={{
            padding: '8px 10px',
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 'bold',
            background: splitMode ? '#3060c0' : '#2a2a2a',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {splitMode ? 'A/B split: ON (Original | Composited)' : 'A/B split: OFF — click to compare'}
        </button>

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

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragActive(false)
            const file = e.dataTransfer.files?.[0]
            if (file) pipeline.loadFile(file)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '16px 10px',
            fontSize: 11,
            color: dragActive ? '#eee' : '#888',
            border: `2px dashed ${dragActive ? '#3060c0' : '#444'}`,
            borderRadius: 4,
            background: dragActive ? '#1a2a4a' : 'transparent',
          }}
        >
          Drag &amp; drop image here
        </div>

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

        {splitMode ? (
          <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
            View is fixed to Original | Composited while A/B split is on — turn it off to use Raw output or single-
            pane view.
          </p>
        ) : (
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
        )}

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

        {(showRampToggle || isGumiDotStamping) && (
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
            {showRampToggle ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 'bold', color: '#aaa' }}>
                <input
                  type="checkbox"
                  data-testid="checkbox-ramp-enabled"
                  checked={rampEnabled}
                  onChange={(e) => setRampEnabled(e.target.checked)}
                />
                Plateau ramp (luminance-band isolation, pre-detection)
              </label>
            ) : (
              <p style={{ fontSize: 12, color: '#aaa', margin: 0, fontWeight: 'bold' }}>
                Plateau ramp (luminance-band isolation — always on for Path G)
              </p>
            )}
            {showGumiCalibration && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    data-testid="button-pick-line"
                    onClick={() => setPickTarget(pickTarget === 'line' ? null : 'line')}
                    style={{
                      flex: '1 1 auto',
                      minWidth: 70,
                      padding: '4px 6px',
                      fontFamily: 'inherit',
                      fontSize: 11,
                      background: pickTarget === 'line' ? '#3060c0' : '#2a2a2a',
                      color: '#eee',
                      border: '1px solid #444',
                      cursor: 'pointer',
                    }}
                  >
                    {pickTarget === 'line' ? 'Click a line pixel…' : 'Pick line color'}
                  </button>
                  <button
                    data-testid="button-pick-background"
                    onClick={() => setPickTarget(pickTarget === 'background' ? null : 'background')}
                    style={{
                      flex: '1 1 auto',
                      minWidth: 70,
                      padding: '4px 6px',
                      fontFamily: 'inherit',
                      fontSize: 11,
                      background: pickTarget === 'background' ? '#3060c0' : '#2a2a2a',
                      color: '#eee',
                      border: '1px solid #444',
                      cursor: 'pointer',
                    }}
                  >
                    {pickTarget === 'background' ? 'Click a background pixel…' : 'Pick background color'}
                  </button>
                </div>
                {(lineSample || bgSample) && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11 }}>
                    {lineSample && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            border: '1px solid #666',
                            background: `rgb(${lineSample.rgb.map((c) => Math.round(c * 255)).join(',')})`,
                          }}
                        />
                        line lum {lineSample.lum.toFixed(2)}
                      </div>
                    )}
                    {bgSample && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            border: '1px solid #666',
                            background: `rgb(${bgSample.rgb.map((c) => Math.round(c * 255)).join(',')})`,
                          }}
                        />
                        bg lum {bgSample.lum.toFixed(2)}
                      </div>
                    )}
                    {lineSample && bgSample && (
                      <button
                        data-testid="button-clear-calibration"
                        onClick={() => {
                          setLineSample(null)
                          setBgSample(null)
                        }}
                        style={{
                          padding: '2px 6px',
                          fontFamily: 'inherit',
                          fontSize: 11,
                          background: '#2a2a2a',
                          color: '#eee',
                          border: '1px solid #444',
                          cursor: 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
                <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
                  Eyedropper calibration: click each button, then click the matching pixel on the preview canvas.
                  Once both are picked, the ramp below auto-updates — inner-low/inner-high bracket the line sample,
                  floor/ceiling push out toward (but short of) the background sample.
                </p>
              </div>
            )}
            {showRampSliders && (
              <>
                <Slider label="Floor" value={rampFloor} onChange={setRampFloor} min={0} max={1} step={0.01} testId="slider-ramp-floor" />
                <Slider
                  label="Inner low"
                  value={rampInnerLow}
                  onChange={setRampInnerLow}
                  min={0}
                  max={1}
                  step={0.01}
                  testId="slider-ramp-inner-low"
                />
                <Slider
                  label="Inner high"
                  value={rampInnerHigh}
                  onChange={setRampInnerHigh}
                  min={0}
                  max={1}
                  step={0.01}
                  testId="slider-ramp-inner-high"
                />
                <Slider
                  label="Ceiling"
                  value={rampCeiling}
                  onChange={setRampCeiling}
                  min={0}
                  max={1}
                  step={0.01}
                  testId="slider-ramp-ceiling"
                />
                <Slider
                  label="Feather"
                  value={rampFeather}
                  onChange={setRampFeather}
                  min={0}
                  max={1}
                  step={0.01}
                  testId="slider-ramp-feather"
                />
              </>
            )}
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              4-point plateau: floor/ceiling fade to 0, inner-low/inner-high stay at 1. Feather=0 is a hard step
              right at the inner points; feather=1 spans the full floor→inner (and inner→ceiling) fade. Expects
              floor ≤ inner-low ≤ inner-high ≤ ceiling.
            </p>
          </div>
        )}

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

        {showGumiContrastBoost && (
          <Slider
            label="Contrast boost (histogram push)"
            value={gumiContrastBoost}
            onChange={setGumiContrastBoost}
            min={0}
            max={2}
            step={0.01}
            testId="slider-gumi-contrast-boost"
          />
        )}

        {showBlobMaxDt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Slider
              label="Blob max DT (px)"
              value={blobMaxDt}
              onChange={setBlobMaxDt}
              min={1}
              max={20}
              step={0.5}
              decimals={1}
              testId="slider-blob-max-dt"
            />
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Suppresses closed-mask pixels whose distance to nearest background exceeds this — rejects wide fill
              interiors while keeping thin strokes. Also doubles as the color-bleed style's falloff radius below.
            </p>
          </div>
        )}

        {showBlobMaxDt && (
          <Slider
            label="Blob suppression falloff gamma"
            value={gumiBlobGamma}
            onChange={setGumiBlobGamma}
            min={0.1}
            max={4}
            step={0.05}
            decimals={2}
            testId="slider-gumi-blob-gamma"
          />
        )}

        {showGumiSoftDetection && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                data-testid="checkbox-gumi-soft-detection"
                checked={gumiSoftDetection}
                onChange={(e) => setGumiSoftDetection(e.target.checked)}
              />
              Soft detection (taper + antialiasing fix)
            </label>
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Hard threshold collapses the ramp's continuous band-weight to flat 0/1 — a tapering stroke's faint tip
              reads as absent instead of fading out, and edges stair-step instead of antialiasing. This replaces it
              with a smoothstep band, letting weak-but-real signal survive as partial ink through closing and blob
              suppression instead of being cut off.
            </p>
            {gumiSoftDetection && (
              <Slider
                label="Softness (transition width)"
                value={gumiSoftness}
                onChange={setGumiSoftness}
                min={0}
                max={0.3}
                step={0.01}
                decimals={2}
                testId="slider-gumi-softness"
              />
            )}
          </div>
        )}

        {showGumiGradientMap && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 10,
              border: '1px solid #555',
              borderRadius: 4,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 'bold', color: '#aaa' }}>
              <input
                type="checkbox"
                data-testid="checkbox-gumi-gradient-map"
                checked={gumiGradientMap}
                onChange={(e) => setGumiGradientMap(e.target.checked)}
              />
              Gradient map (crude prototype)
            </label>
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              What Gumi was originally meant to be: continuous luminance→color recoloring, no threshold anywhere —
              replaces the entire ramp/threshold/closing/blob-or-bleed pipeline below while on. Crude 3-stop version
              to gauge whether the idea is worth pursuing before building a real multi-stop gradient editor.
            </p>
            {showGumiGradientColors && (
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  Shadow
                  <input
                    type="color"
                    data-testid="input-gumi-gradient-shadow"
                    value={gumiGradientShadowHex}
                    onChange={(e) => setGumiGradientShadowHex(e.target.value)}
                    style={{ width: 50, height: 24, padding: 0, border: '1px solid #444', background: 'none' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  Mid
                  <input
                    type="color"
                    data-testid="input-gumi-gradient-mid"
                    value={gumiGradientMidHex}
                    onChange={(e) => setGumiGradientMidHex(e.target.value)}
                    style={{ width: 50, height: 24, padding: 0, border: '1px solid #444', background: 'none' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  Highlight
                  <input
                    type="color"
                    data-testid="input-gumi-gradient-highlight"
                    value={gumiGradientHighlightHex}
                    onChange={(e) => setGumiGradientHighlightHex(e.target.value)}
                    style={{ width: 50, height: 24, padding: 0, border: '1px solid #444', background: 'none' }}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {showGumiColorBleed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                data-testid="checkbox-gumi-color-bleed"
                checked={gumiColorBleed}
                onChange={(e) => {
                  setGumiColorBleed(e.target.checked)
                  if (e.target.checked) setGumiFillMode(false)
                }}
              />
              Color bleed style (soft ink falloff instead of hard blob reject)
            </label>
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Reuses Path B/Botan's own graduated distance-to-edge treatment on Gumi's closed mask — same Gamma /
              Color contrast / Color expansion controls as Botan, shown below when enabled.
            </p>
          </div>
        )}

        {showGumiBleedFeather && (
          <Slider
            label="Bleed feather (px)"
            value={gumiBleedFeather}
            onChange={setGumiBleedFeather}
            min={0}
            max={10}
            step={0.1}
            decimals={1}
            testId="slider-gumi-bleed-feather"
          />
        )}

        {showGumiFillMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                data-testid="checkbox-gumi-fill-mode"
                checked={gumiFillMode}
                onChange={(e) => {
                  setGumiFillMode(e.target.checked)
                  if (e.target.checked) setGumiColorBleed(false)
                }}
              />
              Fill layer (pass-through color, cheap Illustrator-style fill MVP)
            </label>
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Flips blob suppression: keeps the deep interiors (shading/fill regions) instead of near-line strokes,
              passing the original color through unmodified rather than inking. Mutually exclusive with color bleed
              — both redefine the final stage. Best judged via "Raw output" — composited with Replace blend, a
              pass-through pixel looks identical to the untouched base by design, so Composited view won't show much
              on its own.
            </p>
          </div>
        )}

        {showHighPassStrength && (
          <Slider
            label="High pass strength"
            value={highPassStrength}
            onChange={setHighPassStrength}
            min={0}
            max={10}
            step={0.05}
            testId="slider-highpass-strength"
          />
        )}

        {showLaplacianStrength && (
          <Slider
            label="Laplacian strength"
            value={laplacianStrength}
            onChange={setLaplacianStrength}
            min={0.5}
            max={10}
            step={0.05}
            testId="slider-laplacian-strength"
          />
        )}

        {showLaplacianPreBlur && (
          <Slider
            label="Pre-blur (px, 0 = off)"
            value={laplacianPreBlur}
            onChange={setLaplacianPreBlur}
            min={0}
            max={10}
            step={0.1}
            decimals={1}
            testId="slider-laplacian-pre-blur"
          />
        )}

        {showLaplacianSharpenAmount && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Slider
              label="Post-sharpen amount (0 = off)"
              value={laplacianSharpenAmount}
              onChange={setLaplacianSharpenAmount}
              min={0}
              max={3}
              step={0.05}
              decimals={2}
              testId="slider-laplacian-sharpen"
            />
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Both fight graininess: pre-blur denoises before the kernel runs (softer, less noise-sensitive);
              post-sharpen (unsharp mask) claws back edge definition afterward.
            </p>
          </div>
        )}

        {showLaplacianGrow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Slider
              label="Grow (texels, 0 = off)"
              value={laplacianGrow}
              onChange={setLaplacianGrow}
              min={0}
              max={20}
              step={1}
              decimals={0}
              testId="slider-laplacian-grow"
            />
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Thickens the line — strength/pre-blur/post-sharpen only control grit and intensity, not width.
            </p>
          </div>
        )}

        {showResponsiveColor && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 10,
              border: '1px solid #333',
              borderRadius: 4,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 'bold', color: '#aaa' }}>
              <input
                type="checkbox"
                data-testid="checkbox-responsive-color"
                checked={highPassResponsiveColor}
                onChange={(e) => setHighPassResponsiveColor(e.target.checked)}
              />
              Responsive edge color (dual-polarity litmus test)
            </label>
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Instead of one fixed ink polarity, checks the local blurred neighborhood at each edge: locally dark
              area → white ink, locally light area → black ink. Same spirit as Path B's color expansion (real local
              color instead of a flat swatch), keyed off local lightness instead. Replaces the Output treatment
              section below entirely — this produces a resolved colored mask directly, not a grayscale one.
            </p>
            {highPassResponsiveColor && (
              <>
                <Slider
                  label="Crossover"
                  value={responsiveCrossover}
                  onChange={setResponsiveCrossover}
                  min={0}
                  max={1}
                  step={0.01}
                  testId="slider-responsive-crossover"
                />
                <Slider
                  label="Grow (texels, 0 = off)"
                  value={responsiveGrow}
                  onChange={setResponsiveGrow}
                  min={0}
                  max={20}
                  step={1}
                  decimals={0}
                  testId="slider-responsive-grow"
                />
                {responsiveGrow > 0 && (
                  <>
                    <Slider
                      label="Grow bias (black ↔ white)"
                      value={responsiveGrowBias}
                      onChange={setResponsiveGrowBias}
                      min={-1}
                      max={1}
                      step={0.05}
                      decimals={2}
                      testId="slider-responsive-grow-bias"
                    />
                    <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
                      Zero-crossing lines are ~1px by construction — this grows them afterward instead of via
                      radius/strength. White and black ink grow independently so they can't bleed into each other;
                      bias lets one win where a grown white and grown black region meet.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {showHiTreatment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontSize: 12, color: '#aaa', margin: 0, fontWeight: 'bold' }}>Output treatment</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(
                [
                  { id: 'raw', label: 'Raw' },
                  { id: 'binarize', label: 'Binarize' },
                  { id: 'multiply', label: 'Tone→Multiply' },
                  { id: 'screen', label: 'Tone→Screen' },
                ] as const
              ).map((t) => {
                const active = t.id === 'raw' ? !thresholdEnabled && hiToneTarget === 'off' : t.id === 'binarize' ? thresholdEnabled : hiToneTarget === t.id
                return (
                  <button
                    key={t.id}
                    data-testid={`button-hi-treatment-${t.id}`}
                    onClick={() => {
                      if (t.id === 'raw') {
                        setThresholdEnabled(false)
                        setHiToneTarget('off')
                      } else if (t.id === 'binarize') {
                        setThresholdEnabled(true)
                        setHiToneTarget('off')
                      } else {
                        setThresholdEnabled(false)
                        setHiToneTarget(t.id)
                      }
                    }}
                    style={{
                      flex: '1 1 auto',
                      minWidth: 70,
                      padding: '4px 6px',
                      fontFamily: 'inherit',
                      fontSize: 11,
                      background: active ? '#3060c0' : '#2a2a2a',
                      color: '#eee',
                      border: '1px solid #444',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            {thresholdEnabled && (
              <Slider label="Threshold" value={threshold} onChange={setThreshold} min={0} max={1} step={0.01} testId="slider-threshold-hi" />
            )}
            {hiToneTarget !== 'off' && (
              <>
                <Slider
                  label="Tone gain"
                  value={hiToneGain}
                  onChange={setHiToneGain}
                  min={0.2}
                  max={4}
                  step={0.05}
                  decimals={2}
                  testId="slider-hi-tone-gain"
                />
                <Slider
                  label="Tone contrast"
                  value={hiToneContrast}
                  onChange={setHiToneContrast}
                  min={0.2}
                  max={5}
                  step={0.05}
                  decimals={2}
                  testId="slider-hi-tone-contrast"
                />
                <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
                  Gain controls how much signal gets through before clamping; contrast reshapes weak-vs-strong
                  edges relative to each other afterward — raise it to punch up subtle painting/halftone gradients
                  without just amplifying everything equally.
                </p>
              </>
            )}
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Raw is neutral-gray-centered — pairs with Overlay blend below at no extra cost. Tone→Multiply crushes
              flat regions to white (multiply no-op); Tone→Screen crushes them to black (screen no-op).
            </p>
          </div>
        )}

        {showBlendMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontSize: 12, color: '#aaa', margin: 0, fontWeight: 'bold' }}>Blend mode</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {(
                [
                  { id: 0, label: 'Replace' },
                  { id: 1, label: 'Multiply' },
                  { id: 2, label: 'Screen' },
                  { id: 3, label: 'Overlay' },
                ] as const
              ).map((b) => (
                <button
                  key={b.id}
                  data-testid={`button-blend-mode-${b.id}`}
                  onClick={() => setCompositeBlendMode(b.id)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    background: compositeBlendMode === b.id ? '#3060c0' : '#2a2a2a',
                    color: '#eee',
                    border: '1px solid #444',
                    cursor: 'pointer',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {highPassResponsiveColor && (
              <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
                Responsive edge color needs Replace (or Overlay) — Multiply can never show white ink (multiplying by
                white is a no-op) and Screen can never show black ink, so either one will silently drop half the
                lines this mode produces.
              </p>
            )}
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
            label={
              mode === 'pathF'
                ? `${BLEND_MODE_LABELS[compositeBlendMode]} opacity (alpha overdrive)`
                : isMaskMode
                  ? `${BLEND_MODE_LABELS[compositeBlendMode]} opacity`
                  : 'Overlay opacity'
            }
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
            Mask mode: composited via true {BLEND_MODE_LABELS[compositeBlendMode].toLowerCase()} blend, not a
            crossfade.
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

      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <canvas
          ref={pipeline.canvasRef}
          onClick={handleCanvasClick}
          data-testid="preview-canvas"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            background: '#000',
            cursor: pickTarget ? 'crosshair' : 'default',
          }}
        />
        {!pipeline.sourceSize && !pipeline.error && (
          <p style={{ fontSize: 12, color: '#888' }}>Upload an image to begin.</p>
        )}
      </div>
    </div>
  )
}
