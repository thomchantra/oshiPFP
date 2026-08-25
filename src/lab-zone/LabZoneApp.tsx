import { useEffect, useRef, useState } from 'react'
import { usePipeline } from '../gl/usePipeline'
import LineArtPanel from '../components/LineArtPanel'
import { buildInitialParamsByMode, LINE_ART_LABELS, LINE_ART_MODES } from '../lineArtDefaults'
import { TEST_IMAGES, fetchTestImageFile } from '../lab-grid/testImages'
import type { TestImage } from '../lab-grid/testImages'
import {
  computeLuminanceHistogram,
  computeEdgeStrengthHistogram,
  otsuThreshold,
  valleyEmphasisThreshold,
  peakBasedThreshold,
  downsampleForAnalysis,
  connectedComponentStats,
} from '../imageStats/thresholdStats'
import type { ConnectedComponentStats, PeakThresholdResult } from '../imageStats/thresholdStats'
import { loadZoneRecords, saveZoneRecords, clearZoneRecords } from './zoneStorage'
import type { ZoneRecord } from './zoneStorage'
import { exportZoneJson } from './exportZoneJson'
import { loadGuessRecords, saveGuessRecords, clearGuessRecords } from './guessStorage'
import type { GuessRecord } from './guessStorage'
import { exportGuessJson } from './exportGuessJson'
import { loadChieZoneRecords, saveChieZoneRecords, clearChieZoneRecords } from './chieZoneStorage'
import type { ChieZoneRecord } from './chieZoneStorage'
import { exportChieZoneJson } from './exportChieZoneJson'
import type { LineArtDisplayMode, LineArtMode, LineArtParams, LineArtSubTab } from '../types'

// Guess is only computed/shown for algorithms with a validated formula — presenting an
// unvalidated number with equal confidence risks being trusted as if it were real. Botan/Daiya
// use peakBasedThreshold (same underlying detection math, both confirmed 10/10 good against real
// ground truth). Chie uses a plain multiplier on Otsu(edgeStrengthHistogram) instead — peak-
// detection degenerates to Otsu's own value on Chie's histogram shape, adding nothing — with
// gateThreshold's polarity flipped from Botan/Daiya's (higher = more restrictive here, so the
// multiplier biases low, not high), validated only at radius=1/hardness=1 so far. Gumi/Fumiko/
// Hinata/Tsukiko use different detection math entirely and aren't supported yet — see
// changelog/oshipfp-v0.5-instagram-mode-saga.md session 6 for the full per-algo investigation and
// calibration data behind all of this.
const GUESS_SUPPORTED_MODES: LineArtMode[] = ['pathB', 'pathD', 'pathC']
const CHIE_GATE_MULTIPLIER = 0.55

// Which field each algo's own detection strength most directly maps to — production-param
// analogue of labGridTypes.ts's PRIMARY_KNOB_FIELDS (that one keys off the separate lab
// harness's LabParams shape, this one off the real LineArtParams shape production/this bench
// both use). Not always literally "threshold" — see labGridTypes.ts's own comment on why (Chie's
// gateThreshold, Fumiko's inverse-magnitude sensitivity, Hinata/Tsukiko's highPass/laplacian
// strength since their own `threshold` field is inert unless thresholdEnabled).
const PRIMARY_THRESHOLD_FIELD: Record<LineArtMode, keyof LineArtParams> = {
  pathB: 'threshold',
  pathC: 'gateThreshold',
  pathD: 'threshold',
  pathF: 'sensitivity',
  pathG: 'threshold',
  pathH: 'highPassStrength',
  pathI: 'laplacianStrength',
}

interface Stats {
  otsu255: number
  valleyEmphasis255: number
  componentsAtValley: ConnectedComponentStats
  componentsAtOtsu: ConnectedComponentStats
  histogramBins: number[]
}

// Chie/pathC data-gathering only, no algorithm committed yet — see changelog session 6. Kept as a
// separate state/panel from Stats (Botan/Daiya's luminance-domain one) rather than unifying, since
// edge-strength isn't luminance and the "ink" cluster sits on the *opposite* side of the histogram
// (real edges = high edgeStrength, vs. Botan's ink = low luminance) — forcing them into one shape
// would be more confusing than two clearly-separate, honestly-labeled panels.
interface EdgeStats {
  otsu255: number
  valleyEmphasis255: number
  peak: PeakThresholdResult
  histogramBins: number[]
  radiusUsed: number
}

const STATS_ANALYSIS_MAX_DIMENSION = 500

function drawHistogram(canvas: HTMLCanvasElement, bins: number[], markers: { value: number; color: string }[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, w, h)
  const max = Math.max(1, ...bins)
  ctx.fillStyle = '#8ab4f8'
  const barWidth = w / bins.length
  bins.forEach((count, i) => {
    const barHeight = (count / max) * h
    ctx.fillRect(i * barWidth, h - barHeight, Math.max(1, barWidth), barHeight)
  })
  for (const marker of markers) {
    ctx.strokeStyle = marker.color
    ctx.lineWidth = 2
    const x = (marker.value / 255) * w
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
}

async function decodeToImageData(file: File): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  return { data: imageData.data, width: bitmap.width, height: bitmap.height }
}

export default function LabZoneApp() {
  const pipeline = usePipeline()
  const [lineArtMode, setLineArtMode] = useState<LineArtMode>('pathB')
  const [paramsByMode, setParamsByMode] = useState<Record<LineArtMode, LineArtParams>>(buildInitialParamsByMode)
  const [lineArtSubTab, setLineArtSubTab] = useState<LineArtSubTab>('tuning')
  const [lineArtDisplayMode] = useState<LineArtDisplayMode>('composite')
  const [selectedImage, setSelectedImage] = useState<TestImage | null>(null)
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [viewMode, setViewMode] = useState<'live' | 'zone'>('live')
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [records, setRecords] = useState<ZoneRecord[]>(loadZoneRecords)
  const [remark, setRemark] = useState('')
  const [guess, setGuess] = useState<PeakThresholdResult | null>(null)
  const [guessRemark, setGuessRemark] = useState('')
  const [guessRecords, setGuessRecords] = useState<GuessRecord[]>(loadGuessRecords)
  const [edgeStats, setEdgeStats] = useState<EdgeStats | null>(null)
  const [edgeStatsLoading, setEdgeStatsLoading] = useState(false)
  const [chieRecords, setChieRecords] = useState<ChieZoneRecord[]>(loadChieZoneRecords)
  const [chieRemark, setChieRemark] = useState('')

  const zoneCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const histCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const edgeHistCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const lineArtParams: LineArtParams = { ...paramsByMode[lineArtMode], mode: lineArtMode, displayMode: lineArtDisplayMode }

  // Mirrors App.tsx's own handleLineArtChange — mode switches swap the active cached entry,
  // in-place edits update it. Kept identical to production's logic so this bench's param
  // behavior can't silently diverge from what LineArtPanel is actually built to drive.
  const handleLineArtChange = (next: LineArtParams) => {
    if (next.mode !== lineArtMode) {
      setLineArtMode(next.mode)
      // A guess/stats snapshot computed for one algo is meaningless for another (different
      // domain entirely — Chie's is edge-strength, Botan/Daiya's is raw luminance) — clear all
      // three on algo switch so a stale cross-algo value can never be silently applied/recorded.
      setGuess(null)
      setStats(null)
      setEdgeStats(null)
      return
    }
    setParamsByMode((prev) => ({ ...prev, [lineArtMode]: next }))
  }

  const handleReset = () => {
    setParamsByMode((prev) => ({ ...prev, [lineArtMode]: buildInitialParamsByMode()[lineArtMode] }))
  }

  useEffect(() => {
    pipeline.setLineArtParams(lineArtParams)
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsByMode, lineArtMode, lineArtDisplayMode])

  // Zone preview: pulls the Tone Lift/Pinch stage's own isolated output whenever the relevant
  // params (or the loaded image) change, but only while that view is actually selected — no
  // point paying for the extra GPU readback while looking at the live composite instead.
  useEffect(() => {
    if (viewMode !== 'zone') return
    const result = pipeline.readToneShapingZonePixels(lineArtParams)
    const canvas = zoneCanvasRef.current
    if (!result || !canvas) return
    canvas.width = result.width
    canvas.height = result.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height), 0, 0)
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, lineArtParams.toneShaping, selectedImage, currentFile])

  const loadTestImage = async (image: TestImage) => {
    const file = await fetchTestImageFile(image)
    setSelectedImage(image)
    setCurrentFile(file)
    setStats(null)
    setGuess(null)
    setEdgeStats(null)
    await pipeline.loadFile(file)
  }

  const loadCustomFile = async (file: File) => {
    setSelectedImage({ id: file.name, url: '' })
    setCurrentFile(file)
    setStats(null)
    setGuess(null)
    setEdgeStats(null)
    await pipeline.loadFile(file)
  }

  const computeStats = async () => {
    if (!currentFile) return
    setStatsLoading(true)
    try {
      const full = await decodeToImageData(currentFile)
      const histogram = computeLuminanceHistogram(full.data)
      const otsu255 = otsuThreshold(histogram)
      const valleyEmphasis255 = valleyEmphasisThreshold(histogram)
      const downsampled = downsampleForAnalysis(full.data as Uint8ClampedArray, full.width, full.height, STATS_ANALYSIS_MAX_DIMENSION)
      const componentsAtValley = connectedComponentStats(downsampled.data, downsampled.width, downsampled.height, valleyEmphasis255)
      const componentsAtOtsu = connectedComponentStats(downsampled.data, downsampled.width, downsampled.height, otsu255)
      setStats({ otsu255, valleyEmphasis255, componentsAtValley, componentsAtOtsu, histogramBins: histogram.bins })
      setGuess(peakBasedThreshold(histogram))
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    if (!stats || !histCanvasRef.current) return
    const markers = [
      { value: stats.otsu255, color: '#e08030' },
      { value: stats.valleyEmphasis255, color: '#40c060' },
    ]
    if (guess) markers.push({ value: guess.threshold255, color: '#c060e0' })
    drawHistogram(histCanvasRef.current, stats.histogramBins, markers)
  }, [stats, guess])

  // Chie/pathC data-gathering only — no algorithm chosen yet (see EdgeStats's own doc comment).
  // Uses the CURRENT live `radius` slider value, since edge-strength is computed against that
  // exact erosion radius — a different radius produces a genuinely different edge-strength
  // histogram, unlike Botan/Daiya's luminance histogram which is radius-independent.
  const computeEdgeStats = async () => {
    if (!currentFile || lineArtMode !== 'pathC') return
    setEdgeStatsLoading(true)
    try {
      const full = await decodeToImageData(currentFile)
      const radiusUsed = lineArtParams.radius
      const histogram = computeEdgeStrengthHistogram(full.data, full.width, full.height, radiusUsed)
      const otsu255 = otsuThreshold(histogram)
      const valleyEmphasis255 = valleyEmphasisThreshold(histogram)
      const peak = peakBasedThreshold(histogram)
      setEdgeStats({ otsu255, valleyEmphasis255, peak, histogramBins: histogram.bins, radiusUsed })
      // Not peak-based for Chie (see GUESS_SUPPORTED_MODES's doc comment on why) — reuses the
      // same generic `guess`/GuessRecord flow as Botan/Daiya's peak-detection guess, just with a
      // different formula and confidence pinned 'high' (this multiplier was actually validated,
      // unlike a 'low'-confidence peak fallback).
      setGuess({ threshold255: Math.round(otsu255 * CHIE_GATE_MULTIPLIER), peaks: [], confidence: 'high' })
    } finally {
      setEdgeStatsLoading(false)
    }
  }

  useEffect(() => {
    if (!edgeStats || !edgeHistCanvasRef.current) return
    drawHistogram(edgeHistCanvasRef.current, edgeStats.histogramBins, [
      { value: edgeStats.otsu255, color: '#e08030' },
      { value: edgeStats.valleyEmphasis255, color: '#40c060' },
      { value: edgeStats.peak.threshold255, color: '#c060e0' },
    ])
  }, [edgeStats])

  // Applies the current guess directly to the live params, writing into whichever field this
  // algo's own threshold-family knob actually is (PRIMARY_THRESHOLD_FIELD — Chie's is
  // `gateThreshold`, not `threshold`). Also resets Tone Lift to identity (Clip mode,
  // blackClip=0/whiteClip=1/exposure=0/contrast=0) since Botan/Daiya's guess is computed against
  // raw, unstretched luminance — applying it on top of leftover Clip/Pinch tuning would silently
  // double-correct. Harmless no-op for Chie (its erosion reads the base image directly, never
  // goes through toneShaping at all) — not special-cased away, just doesn't do anything there.
  // Switches to Live so the result is immediately visible.
  const applyGuessToLive = () => {
    if (!guess || !GUESS_SUPPORTED_MODES.includes(lineArtMode)) return
    handleLineArtChange({
      ...lineArtParams,
      [PRIMARY_THRESHOLD_FIELD[lineArtMode]]: guess.threshold255 / 255,
      toneShaping: {
        ...lineArtParams.toneShaping,
        mode: 'clip',
        exposure: 0,
        contrast: 0,
        clipMode: { blackClip: 0, whiteClip: 1 },
      },
    })
    setViewMode('live')
  }

  const recordGuessRating = (rating: GuessRecord['rating']) => {
    if (!selectedImage || !guess) return
    const record: GuessRecord = {
      imageId: selectedImage.id,
      algo: lineArtMode,
      guessedThreshold255: guess.threshold255,
      guessConfidence: guess.confidence,
      rating,
      ...(guessRemark ? { remark: guessRemark } : {}),
      timestamp: Date.now(),
    }
    const next = [...guessRecords, record]
    setGuessRecords(next)
    saveGuessRecords(next)
    setGuessRemark('')
  }

  // Chie ground truth: captures whatever gateThreshold/hardness the user actually converged on
  // live, alongside the edge-strength stats computed at record time — the pairing this
  // calibration needs (same shape as Botan's ZoneRecord, different fields entirely, see
  // chieZoneStorage.ts's own doc comment on why it's not a reuse). Uses edgeStats.radiusUsed
  // (not the live radius slider) for the recorded radius — the stats were computed against
  // whatever radius was live at the time "Compute Edge Stats" ran, so if the slider moved since
  // then, radiusUsed is the value that actually stays consistent with otsu255/valleyEmphasis255/
  // peakThreshold255 below. Gate the record button on live radius matching radiusUsed instead.
  const recordChieGroundTruth = () => {
    if (!selectedImage || !edgeStats || lineArtMode !== 'pathC') return
    const record: ChieZoneRecord = {
      imageId: selectedImage.id,
      gateThreshold: lineArtParams.gateThreshold,
      radius: edgeStats.radiusUsed,
      hardness: lineArtParams.hardness,
      otsu255: edgeStats.otsu255,
      valleyEmphasis255: edgeStats.valleyEmphasis255,
      peakThreshold255: edgeStats.peak.threshold255,
      peakConfidence: edgeStats.peak.confidence,
      ...(chieRemark ? { remark: chieRemark } : {}),
      timestamp: Date.now(),
    }
    const next = [...chieRecords, record]
    setChieRecords(next)
    saveChieZoneRecords(next)
    setChieRemark('')
  }

  const recordGroundTruth = () => {
    if (!selectedImage || !stats) return
    const fieldName = PRIMARY_THRESHOLD_FIELD[lineArtMode]
    const fieldValue = lineArtParams[fieldName]
    const record: ZoneRecord = {
      imageId: selectedImage.id,
      algo: lineArtMode,
      toneShapingMode: lineArtParams.toneShaping.mode,
      toneShapingExposure: lineArtParams.toneShaping.exposure,
      toneShapingContrast: lineArtParams.toneShaping.contrast,
      clipBlackClip: lineArtParams.toneShaping.clipMode.blackClip,
      clipWhiteClip: lineArtParams.toneShaping.clipMode.whiteClip,
      pinchPosition: lineArtParams.toneShaping.pinchMode.position,
      pinchExpand: lineArtParams.toneShaping.pinchMode.expand,
      pinchFeathering: lineArtParams.toneShaping.pinchMode.feathering,
      liveThresholdFieldName: String(fieldName),
      liveThresholdFieldValue: typeof fieldValue === 'number' ? fieldValue : NaN,
      otsuThreshold255: stats.otsu255,
      valleyEmphasisThreshold255: stats.valleyEmphasis255,
      componentStats: stats.componentsAtValley,
      ...(remark ? { remark } : {}),
      timestamp: Date.now(),
    }
    const next = [...records, record]
    setRecords(next)
    saveZoneRecords(next)
    setRemark('')
  }

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16, fontFamily: 'sans-serif', color: '#eee', background: '#111', boxSizing: 'border-box',
        // base.css (imported for LineArtPanel's real styling) sets html/body/#root to
        // overflow:hidden — correct for the production app's fixed-viewport shell, wrong here.
        // Rather than fight that cascade, this becomes its own scroll container: fixed to the
        // viewport height, scrollable internally, so mouse-wheel/trackpad scrolling works
        // regardless of what the ancestors' overflow is set to.
        height: '100vh', overflowY: 'auto',
      }}
    >
      <div style={{ flex: '1 1 480px', minWidth: 320 }}>
        <h2 style={{ marginTop: 0 }}>oshiPFP lab zone — auto-detection bench</h2>
        <p style={{ opacity: 0.7, fontSize: 13 }}>
          Real production Pipeline, no reimplementation — see changelog/oshipfp-v0.5-instagram-mode-saga.md session 6.
        </p>

        <div style={{ marginBottom: 12 }}>
          <label>Test image: </label>
          <select
            value={selectedImage?.url ?? ''}
            onChange={(e) => {
              const img = TEST_IMAGES.find((i) => i.url === e.target.value)
              if (img) void loadTestImage(img)
            }}
          >
            <option value="">— select —</option>
            {TEST_IMAGES.map((img) => (
              <option key={img.id} value={img.url}>{img.id}</option>
            ))}
          </select>
          {' '}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void loadCustomFile(file)
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <button type="button" onClick={() => setViewMode('live')} disabled={viewMode === 'live'}>Live</button>{' '}
          <button type="button" onClick={() => setViewMode('zone')} disabled={viewMode === 'zone'}>Zone (Pinch isolation, inverted)</button>
        </div>

        {/* Fixed-size box, not just a max-width — a tall/portrait source photo would otherwise
            blow the canvas's CSS height out to its full native pixel height (canvas doesn't
            auto-scale height with width the way <img> does without an explicit aspect-ratio),
            which pushed the Record/Export controls far below the fold. */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 600, height: '60vh', maxHeight: 600, background: '#000' }}>
          <canvas
            ref={pipeline.canvasRef}
            style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: viewMode === 'live' ? 'block' : 'none', margin: '0 auto' }}
          />
          <canvas
            ref={zoneCanvasRef}
            style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: viewMode === 'zone' ? 'block' : 'none', margin: '0 auto' }}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => void computeStats()} disabled={!currentFile || statsLoading}>
            {statsLoading ? 'Computing…' : 'Compute Stats'}
          </button>
        </div>

        {stats && (
          <div style={{ marginTop: 12 }}>
            <canvas ref={histCanvasRef} width={512} height={120} style={{ width: '100%', maxWidth: 512, border: '1px solid #444' }} />
            <div style={{ fontSize: 13, marginTop: 4 }}>
              <div><span style={{ color: '#e08030' }}>■</span> Otsu: {stats.otsu255} (÷255 = {(stats.otsu255 / 255).toFixed(3)})</div>
              <div><span style={{ color: '#40c060' }}>■</span> Valley-emphasis: {stats.valleyEmphasis255} (÷255 = {(stats.valleyEmphasis255 / 255).toFixed(3)})</div>
              <div style={{ marginTop: 6 }}>
                Connected components @ valley-emphasis: {stats.componentsAtValley.componentCount} components,
                {' '}largest = {(stats.componentsAtValley.largestComponentFraction * 100).toFixed(1)}% of ink pixels
              </div>
              <div>
                Connected components @ Otsu: {stats.componentsAtOtsu.componentCount} components,
                {' '}largest = {(stats.componentsAtOtsu.largestComponentFraction * 100).toFixed(1)}% of ink pixels
              </div>
              <div style={{ marginTop: 6 }}>
                Current {String(PRIMARY_THRESHOLD_FIELD[lineArtMode])}: {String(lineArtParams[PRIMARY_THRESHOLD_FIELD[lineArtMode]])}
                {' '}| Ramp mode: {lineArtParams.toneShaping.mode}
                {lineArtParams.toneShaping.mode === 'clip'
                  ? ` | Black/White clip: ${lineArtParams.toneShaping.clipMode.blackClip.toFixed(3)} / ${lineArtParams.toneShaping.clipMode.whiteClip.toFixed(3)}`
                  : ` | Pinch position: ${lineArtParams.toneShaping.pinchMode.position.toFixed(3)}`}
              </div>
            </div>
          </div>
        )}

        {guess && GUESS_SUPPORTED_MODES.includes(lineArtMode) && (() => {
          // Chie's guess is tied to edgeStats (computed at a specific radius) — if the live radius
          // has since drifted, the guess is stale the same way a Record would be (see edgeStats's
          // own staleness warning above); block Apply/Rate here too rather than only the Record
          // button, since applying a stale guess is the same silent-mismatch risk.
          const chieStale = lineArtMode === 'pathC' && edgeStats && lineArtParams.radius !== edgeStats.radiusUsed
          return (
          <div style={{ marginTop: 16, borderTop: '1px solid #333', paddingTop: 12 }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: '#c060e0' }}>■</span> {lineArtMode === 'pathC' ? `Gate threshold guess (${CHIE_GATE_MULTIPLIER}× Otsu)` : 'Peak-based guess'}: {guess.threshold255} (÷255 = {(guess.threshold255 / 255).toFixed(3)})
              {' '}— confidence: {guess.confidence}
              {guess.peaks.length > 0 && ` — peaks used: ${guess.peaks.join(', ')}`}
            </div>
            {chieStale && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#e08030' }}>
                Radius changed since this guess was computed — recompute Edge Stats before applying/rating.
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              <button type="button" onClick={applyGuessToLive} disabled={!!chieStale}>Apply Guess to Live</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                placeholder="remark (optional)"
                value={guessRemark}
                onChange={(e) => setGuessRemark(e.target.value)}
                style={{ width: '50%' }}
              />
              {' '}
              <button type="button" onClick={() => recordGuessRating('good')} disabled={!!chieStale}>✓ Good</button>{' '}
              <button type="button" onClick={() => recordGuessRating('maybe')} disabled={!!chieStale}>? Maybe</button>{' '}
              <button type="button" onClick={() => recordGuessRating('bad')} disabled={!!chieStale}>✗ Bad</button>
            </div>
          </div>
          )
        })()}
        {guess && !GUESS_SUPPORTED_MODES.includes(lineArtMode) && (
          <div style={{ marginTop: 16, fontSize: 12, opacity: 0.6 }}>
            Guess is only validated for Botan/Daiya/Chie — switch to one of those to see/rate it.
          </div>
        )}

        {lineArtMode === 'pathC' && (
          <div style={{ marginTop: 16, borderTop: '1px solid #333', paddingTop: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
              Chie data-gathering (no algorithm chosen yet) — edge-strength histogram at the
              current Radius ({lineArtParams.radius.toFixed(2)} texels). Real gate decision is
              edgeStrength &gt; gateThreshold (opposite direction from Botan's luminance cutoff).
            </div>
            <button type="button" onClick={() => void computeEdgeStats()} disabled={!currentFile || edgeStatsLoading}>
              {edgeStatsLoading ? 'Computing…' : 'Compute Edge Stats'}
            </button>
            {edgeStats && (
              <div style={{ marginTop: 12 }}>
                <canvas ref={edgeHistCanvasRef} width={512} height={120} style={{ width: '100%', maxWidth: 512, border: '1px solid #444' }} />
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  <div>Radius used: {edgeStats.radiusUsed.toFixed(2)} texels</div>
                  <div><span style={{ color: '#e08030' }}>■</span> Otsu: {edgeStats.otsu255} (÷255 = {(edgeStats.otsu255 / 255).toFixed(3)})</div>
                  <div><span style={{ color: '#40c060' }}>■</span> Valley-emphasis: {edgeStats.valleyEmphasis255} (÷255 = {(edgeStats.valleyEmphasis255 / 255).toFixed(3)})</div>
                  <div>
                    <span style={{ color: '#c060e0' }}>■</span> Peak-based: {edgeStats.peak.threshold255} (÷255 = {(edgeStats.peak.threshold255 / 255).toFixed(3)})
                    {' '}— confidence: {edgeStats.peak.confidence}
                  </div>
                  <div style={{ marginTop: 6 }}>Current gateThreshold: {lineArtParams.gateThreshold.toFixed(3)}</div>
                </div>
                {lineArtParams.radius !== edgeStats.radiusUsed && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#e08030' }}>
                    Radius changed since these stats were computed ({edgeStats.radiusUsed.toFixed(2)} → {lineArtParams.radius.toFixed(2)}) — recompute before recording.
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <input
                    type="text"
                    placeholder="remark (optional)"
                    value={chieRemark}
                    onChange={(e) => setChieRemark(e.target.value)}
                    style={{ width: '50%' }}
                  />
                  {' '}
                  <button type="button" onClick={recordChieGroundTruth} disabled={lineArtParams.radius !== edgeStats.radiusUsed}>
                    Record ground truth
                  </button>
                </div>
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <button type="button" onClick={() => exportChieZoneJson(chieRecords)} disabled={chieRecords.length === 0}>
                Export Chie JSON ({chieRecords.length})
              </button>
              {' '}
              <button
                type="button"
                onClick={() => {
                  if (chieRecords.length === 0) return
                  if (!window.confirm(`Clear all ${chieRecords.length} Chie records? This can't be undone.`)) return
                  clearChieZoneRecords()
                  setChieRecords([])
                }}
                disabled={chieRecords.length === 0}
              >
                Clear all Chie records
              </button>
            </div>
            {chieRecords.length > 0 && (
              <table style={{ marginTop: 12, fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>image</th>
                    <th style={{ textAlign: 'left' }}>gateThreshold</th>
                    <th style={{ textAlign: 'left' }}>radius</th>
                    <th style={{ textAlign: 'left' }}>hardness</th>
                    <th style={{ textAlign: 'left' }}>otsu</th>
                    <th style={{ textAlign: 'left' }}>valley</th>
                    <th style={{ textAlign: 'left' }}>peak</th>
                    <th style={{ textAlign: 'left' }}>remark</th>
                  </tr>
                </thead>
                <tbody>
                  {chieRecords.map((r) => (
                    <tr key={r.timestamp}>
                      <td>{r.imageId}</td>
                      <td>{r.gateThreshold.toFixed(3)}</td>
                      <td>{r.radius.toFixed(2)}</td>
                      <td>{r.hardness.toFixed(2)}</td>
                      <td>{r.otsu255}</td>
                      <td>{r.valleyEmphasis255}</td>
                      <td>{r.peakThreshold255} ({r.peakConfidence})</td>
                      <td>{r.remark ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, borderTop: '1px solid #333', paddingTop: 12 }}>
          <input
            type="text"
            placeholder="remark (optional)"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            style={{ width: '60%' }}
          />
          {' '}
          <button type="button" onClick={recordGroundTruth} disabled={!selectedImage || !stats}>
            Record ground truth
          </button>
          {' '}
          <button type="button" onClick={() => exportZoneJson(records)} disabled={records.length === 0}>
            Export JSON ({records.length})
          </button>
          {' '}
          <button
            type="button"
            onClick={() => {
              if (records.length === 0) return
              if (!window.confirm(`Clear all ${records.length} recorded entries? This can't be undone.`)) return
              clearZoneRecords()
              setRecords([])
            }}
            disabled={records.length === 0}
          >
            Clear all records
          </button>
        </div>

        {records.length > 0 && (
          <table style={{ marginTop: 12, fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>image</th>
                <th style={{ textAlign: 'left' }}>algo</th>
                <th style={{ textAlign: 'left' }}>mode</th>
                <th style={{ textAlign: 'left' }}>clip b/w</th>
                <th style={{ textAlign: 'left' }}>pinch pos/exp/feath</th>
                <th style={{ textAlign: 'left' }}>field val</th>
                <th style={{ textAlign: 'left' }}>otsu</th>
                <th style={{ textAlign: 'left' }}>valley</th>
                <th style={{ textAlign: 'left' }}>largest %</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.timestamp}>
                  <td>{r.imageId}</td>
                  <td>{LINE_ART_LABELS[r.algo]}</td>
                  <td>{r.toneShapingMode}</td>
                  <td>{r.toneShapingMode === 'clip' ? `${r.clipBlackClip.toFixed(2)} / ${r.clipWhiteClip.toFixed(2)}` : '—'}</td>
                  <td>{r.toneShapingMode === 'pinch' ? `${r.pinchPosition.toFixed(2)} / ${r.pinchExpand.toFixed(2)} / ${r.pinchFeathering.toFixed(2)}` : '—'}</td>
                  <td>{r.liveThresholdFieldValue.toFixed(3)}</td>
                  <td>{r.otsuThreshold255}</td>
                  <td>{r.valleyEmphasisThreshold255}</td>
                  <td>{(r.componentStats.largestComponentFraction * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 16, borderTop: '1px solid #333', paddingTop: 12 }}>
          <button type="button" onClick={() => exportGuessJson(guessRecords)} disabled={guessRecords.length === 0}>
            Export Guess Ratings JSON ({guessRecords.length})
          </button>
          {' '}
          <button
            type="button"
            onClick={() => {
              if (guessRecords.length === 0) return
              if (!window.confirm(`Clear all ${guessRecords.length} guess ratings? This can't be undone.`)) return
              clearGuessRecords()
              setGuessRecords([])
            }}
            disabled={guessRecords.length === 0}
          >
            Clear all guess ratings
          </button>
        </div>

        {guessRecords.length > 0 && (
          <table style={{ marginTop: 12, fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>image</th>
                <th style={{ textAlign: 'left' }}>algo</th>
                <th style={{ textAlign: 'left' }}>guess</th>
                <th style={{ textAlign: 'left' }}>confidence</th>
                <th style={{ textAlign: 'left' }}>rating</th>
                <th style={{ textAlign: 'left' }}>remark</th>
              </tr>
            </thead>
            <tbody>
              {guessRecords.map((r) => (
                <tr key={r.timestamp}>
                  <td>{r.imageId}</td>
                  <td>{LINE_ART_LABELS[r.algo]}</td>
                  <td>{r.guessedThreshold255}</td>
                  <td>{r.guessConfidence}</td>
                  <td>{r.rating}</td>
                  <td>{r.remark ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ flex: '1 1 380px', minWidth: 320, background: '#1a1a1a', padding: 12, borderRadius: 8 }}>
        <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.7 }}>
          Algorithm: {LINE_ART_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleLineArtChange({ ...lineArtParams, mode: m })}
              style={{ fontWeight: m === lineArtMode ? 'bold' : 'normal', marginRight: 6 }}
            >
              {LINE_ART_LABELS[m]}
            </button>
          ))}
        </div>
        <LineArtPanel
          params={lineArtParams}
          onChange={handleLineArtChange}
          onReset={handleReset}
          subTab={lineArtSubTab}
          onSubTabChange={setLineArtSubTab}
          onOpenGallery={() => {}}
        />
      </div>
    </div>
  )
}
