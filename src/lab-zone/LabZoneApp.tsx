import { useEffect, useRef, useState } from 'react'
import { usePipeline } from '../gl/usePipeline'
import LineArtPanel from '../components/LineArtPanel'
import { buildInitialParamsByMode, LINE_ART_LABELS, LINE_ART_MODES } from '../lineArtDefaults'
import { TEST_IMAGES, fetchTestImageFile } from '../lab-grid/testImages'
import type { TestImage } from '../lab-grid/testImages'
import {
  computeLuminanceHistogram,
  otsuThreshold,
  valleyEmphasisThreshold,
  downsampleForAnalysis,
  connectedComponentStats,
} from '../imageStats/thresholdStats'
import type { ConnectedComponentStats } from '../imageStats/thresholdStats'
import { loadZoneRecords, saveZoneRecords } from './zoneStorage'
import type { ZoneRecord } from './zoneStorage'
import { exportZoneJson } from './exportZoneJson'
import type { LineArtDisplayMode, LineArtMode, LineArtParams, LineArtSubTab } from '../types'

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

  const zoneCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const histCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const lineArtParams: LineArtParams = { ...paramsByMode[lineArtMode], mode: lineArtMode, displayMode: lineArtDisplayMode }

  // Mirrors App.tsx's own handleLineArtChange — mode switches swap the active cached entry,
  // in-place edits update it. Kept identical to production's logic so this bench's param
  // behavior can't silently diverge from what LineArtPanel is actually built to drive.
  const handleLineArtChange = (next: LineArtParams) => {
    if (next.mode !== lineArtMode) {
      setLineArtMode(next.mode)
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
    await pipeline.loadFile(file)
  }

  const loadCustomFile = async (file: File) => {
    setSelectedImage({ id: file.name, url: '' })
    setCurrentFile(file)
    setStats(null)
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
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    if (!stats || !histCanvasRef.current) return
    drawHistogram(histCanvasRef.current, stats.histogramBins, [
      { value: stats.otsu255, color: '#e08030' },
      { value: stats.valleyEmphasis255, color: '#40c060' },
    ])
  }, [stats])

  const recordGroundTruth = () => {
    if (!selectedImage || !stats) return
    const fieldName = PRIMARY_THRESHOLD_FIELD[lineArtMode]
    const fieldValue = lineArtParams[fieldName]
    const record: ZoneRecord = {
      imageId: selectedImage.id,
      algo: lineArtMode,
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16, fontFamily: 'sans-serif', color: '#eee', background: '#111', minHeight: '100vh', boxSizing: 'border-box' }}>
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

        <div style={{ position: 'relative', width: '100%', maxWidth: 600, background: '#000' }}>
          <canvas
            ref={pipeline.canvasRef}
            style={{ width: '100%', display: viewMode === 'live' ? 'block' : 'none' }}
          />
          <canvas
            ref={zoneCanvasRef}
            style={{ width: '100%', display: viewMode === 'zone' ? 'block' : 'none' }}
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
                {' '}| Pinch position: {lineArtParams.toneShaping.pinchMode.position.toFixed(3)}
              </div>
            </div>
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
        </div>

        {records.length > 0 && (
          <table style={{ marginTop: 12, fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>image</th>
                <th style={{ textAlign: 'left' }}>algo</th>
                <th style={{ textAlign: 'left' }}>pinch pos</th>
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
                  <td>{r.pinchPosition.toFixed(3)}</td>
                  <td>{r.liveThresholdFieldValue.toFixed(3)}</td>
                  <td>{r.otsuThreshold255}</td>
                  <td>{r.valleyEmphasisThreshold255}</td>
                  <td>{(r.componentStats.largestComponentFraction * 100).toFixed(0)}%</td>
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
