import { useEffect, useState } from 'react'
import BottomSheet from './BottomSheet'
import Icon from './Icon'
import { downloadBlob, exportImage, type FinalPixels } from '../export/exportPica'
import { computeTarget, clampDimension } from '../export/computeTarget'
import type { ExportDisplayMode, ExportFormat, ResampleMode, ResolutionMode } from '../types'

interface ExportPanelProps {
  /** Crop's actual output pixel dimensions (post-crop, native res) — not the original upload's dimensions, see usePipeline's cropSize (Pipeline.setCropSizeListener). This is what "Source" shows and what presets/Original resolve against. */
  cropSize: { width: number; height: number } | null
  /** Original upload's filename (usePipeline's fileInfo) — used to build the download filename, see handleExport. */
  fileName: string | null
  readExportPixels: (mode: ExportDisplayMode) => FinalPixels | null
  exportDisplayMode: ExportDisplayMode
  setExportDisplayMode: (mode: ExportDisplayMode) => void
  resolutionMode: ResolutionMode
  setResolutionMode: (mode: ResolutionMode) => void
  customSize: { width: number; height: number }
  setCustomSize: (updater: (prev: { width: number; height: number }) => { width: number; height: number }) => void
  resampleMode: ResampleMode
  setResampleMode: (mode: ResampleMode) => void
  format: ExportFormat
  setFormat: (format: ExportFormat) => void
}

/** Export's own explicit Original/Composite/Overlay selector — see pipeline.ts's readExportPixels
 * doc comment for why 'original' here means something stricter than the Line Art tab's own
 * displayMode toggle (bypasses Enhancement too, not just Line Art/Color). */
const EXPORT_MODE_OPTIONS: { value: ExportDisplayMode; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'composite', label: 'Composite' },
  { value: 'overlay', label: 'Overlay' },
]

const RESOLUTION_OPTIONS: { value: ResolutionMode; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 150, label: '150px' },
  { value: 256, label: '256px' },
  { value: 'custom', label: 'Custom' },
]
const RESAMPLE_OPTIONS: { value: ResampleMode; label: string }[] = [
  { value: 'lanczos3', label: 'Lanczos3' },
  { value: 'bilinear', label: 'Bilinear' },
  { value: 'nearest', label: 'Nearest' },
]
const FORMAT_OPTIONS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: 'png', label: 'PNG', ext: 'png' },
  { value: 'jpegHd', label: 'JPG HD', ext: 'jpg' },
  { value: 'jpegTiny', label: 'JPG Tiny', ext: 'jpg' },
]

export default function ExportPanel({
  cropSize, fileName, readExportPixels,
  exportDisplayMode, setExportDisplayMode,
  resolutionMode, setResolutionMode,
  customSize, setCustomSize,
  resampleMode, setResampleMode,
  format, setFormat,
}: ExportPanelProps) {
  const [status, setStatus] = useState<'idle' | 'exporting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Raw text buffers for the Custom width/height fields — decoupled from
  // customSize (the committed numeric value) so the field can sit empty
  // mid-edit (backspacing to retype) without every keystroke snapping back
  // to "1". Committed (clamped 1-8192) only on blur; re-synced from
  // customSize whenever it changes from elsewhere (e.g. the prefill when
  // switching into Custom).
  const [widthText, setWidthText] = useState(String(customSize.width))
  const [heightText, setHeightText] = useState(String(customSize.height))
  useEffect(() => setWidthText(String(customSize.width)), [customSize.width])
  useEffect(() => setHeightText(String(customSize.height)), [customSize.height])

  const commitWidth = () => {
    const n = clampDimension(parseInt(widthText, 10) || customSize.width)
    setCustomSize((prev) => ({ ...prev, width: n }))
    setWidthText(String(n))
  }
  const commitHeight = () => {
    const n = clampDimension(parseInt(heightText, 10) || customSize.height)
    setCustomSize((prev) => ({ ...prev, height: n }))
    setHeightText(String(n))
  }

  const target = computeTarget(resolutionMode, cropSize, customSize)

  // Prefill the custom fields with whatever the previously-selected mode was
  // already resolving to, so switching to Custom doesn't jolt to an
  // unrelated stale value.
  const selectResolution = (mode: ResolutionMode) => {
    if (mode === 'custom' && resolutionMode !== 'custom') {
      const t = computeTarget(resolutionMode, cropSize, customSize)
      if (t) setCustomSize(() => t)
    }
    setResolutionMode(mode)
  }

  const handleExport = async () => {
    const pixels = readExportPixels(exportDisplayMode)
    if (!pixels || !target) {
      setStatus('error')
      setErrorMessage('No image loaded yet — upload one from the Crop tab first.')
      return
    }
    setStatus('exporting')
    setErrorMessage(null)
    try {
      const formatOpt = FORMAT_OPTIONS.find((f) => f.value === format)!
      const blob = await exportImage(pixels, target.width, target.height, resampleMode, format)
      const baseName = fileName ? fileName.replace(/\.[^./]+$/, '') : 'pfp'
      downloadBlob(blob, `${baseName}_pfp-${target.width}x${target.height}-${exportDisplayMode}.${formatOpt.ext}`)
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <BottomSheet>
      <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Export</span>
      <div className="crop-bottomcontent" style={{ padding: 0, marginTop: 8, marginBottom: 16 }}>
        {EXPORT_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`pill-toggle-btn font-button-label${exportDisplayMode === opt.value ? ' active' : ''}`}
            onClick={() => setExportDisplayMode(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Source</span>
          <span className="pill-toggle-btn font-button-label" style={{ textAlign: 'center', cursor: 'default' }}>
            {cropSize ? `${cropSize.width}x${cropSize.height}` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Target</span>
          {resolutionMode === 'custom' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
              <input
                type="number"
                className="pill-toggle-btn font-button-label"
                style={{ textAlign: 'center', border: 'none', minWidth: 0 }}
                value={widthText}
                min={1}
                max={8192}
                onChange={(e) => setWidthText(e.target.value)}
                onBlur={commitWidth}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>x</span>
              <input
                type="number"
                className="pill-toggle-btn font-button-label"
                style={{ textAlign: 'center', border: 'none', minWidth: 0 }}
                value={heightText}
                min={1}
                max={8192}
                onChange={(e) => setHeightText(e.target.value)}
                onBlur={commitHeight}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
            </div>
          ) : (
            <span className="pill-toggle-btn font-button-label" style={{ textAlign: 'center', cursor: 'default' }}>
              {target ? `${target.width}x${target.height}` : '—'}
            </span>
          )}
        </div>
      </div>

      <div className="crop-bottomcontent" style={{ padding: 0, marginTop: 10 }}>
        {RESOLUTION_OPTIONS.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            className={`pill-toggle-btn font-button-label${resolutionMode === opt.value ? ' active' : ''}`}
            onClick={() => selectResolution(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="lineart-divider" />

      <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Resample</span>
      <div className="crop-bottomcontent" style={{ padding: 0, marginTop: 8 }}>
        {RESAMPLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`pill-toggle-btn font-button-label${resampleMode === opt.value ? ' active' : ''}`}
            onClick={() => setResampleMode(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="lineart-divider" />

      <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Format</span>
      <div className="crop-bottomcontent" style={{ padding: 0, marginTop: 8 }}>
        {FORMAT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`pill-toggle-btn font-button-label${format === opt.value ? ' active' : ''}`}
            onClick={() => setFormat(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="icon-button icon-button-secondary active"
        style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
        onClick={() => void handleExport()}
        disabled={!cropSize || status === 'exporting'}
      >
        <Icon name="download" size={20} color="var(--bg-light)" />
        <span className="font-button-label">{status === 'exporting' ? 'EXPORTING…' : 'EXPORT TO DEVICE'}</span>
      </button>
      {errorMessage && <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 12 }}>{errorMessage}</p>}
    </BottomSheet>
  )
}
