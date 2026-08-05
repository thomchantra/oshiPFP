import { useDoubleTapReset } from './useDoubleTapReset'

interface CropTopContentProps {
  zoom: number
  onZoomReset: () => void
}

export function CropTopContent({ zoom, onZoomReset }: CropTopContentProps) {
  const handleDoubleTap = useDoubleTapReset(1, onZoomReset)
  return (
    <div className="crop-topcontent">
      <button type="button" className="zoom-pill font-button-label" onPointerDown={handleDoubleTap}>
        ZOOM {zoom.toFixed(2)}x
      </button>
      <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>
        Pinch/Scroll Wheel to Zoom
      </span>
    </div>
  )
}

interface CropDebugInfoProps {
  sourceSize: { width: number; height: number } | null
  fileInfo: { name: string; type: string; size: number } | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Debug-only diagnostic row, deliberately off-spec (not in the Figma) — added
 * to help correlate the pan-stutter bug report with source file size/
 * resolution. Cheap and harmless to leave in the shipped build.
 */
export function CropDebugInfo({ sourceSize, fileInfo }: CropDebugInfoProps) {
  if (!sourceSize) return null
  const format = fileInfo?.type ? fileInfo.type.replace('image/', '').toUpperCase() : '—'
  return (
    <div className="crop-debug-info font-value">
      {sourceSize.width}×{sourceSize.height}px · {format}
      {fileInfo && <> · {formatBytes(fileInfo.size)}</>}
    </div>
  )
}
