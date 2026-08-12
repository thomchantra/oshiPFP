import { useDoubleTapReset } from './useDoubleTapReset'

interface CropTopContentProps {
  zoom: number
  onZoomReset: () => void
  sourceSize: { width: number; height: number } | null
  fileInfo: { name: string; type: string; size: number } | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * The "Pinch/Scroll Wheel to Zoom" hint used to sit here, with file info
 * (size/format/bytes) rendered as its own row below via a separate
 * CropDebugInfo component — that extra row made the Crop tab's viewport
 * height inconsistent with every other tab's single-row top content.
 * Folded into one row: file info replaces the hint text outright.
 */
export function CropTopContent({ zoom, onZoomReset, sourceSize, fileInfo }: CropTopContentProps) {
  const handleDoubleTap = useDoubleTapReset(1, onZoomReset)
  const format = fileInfo?.type ? fileInfo.type.replace('image/', '').toUpperCase() : '—'
  return (
    <div className="crop-topcontent">
      <button type="button" className="zoom-pill font-button-label" onPointerDown={handleDoubleTap}>
        ZOOM {zoom.toFixed(2)}x
      </button>
      {sourceSize && (
        <span className="crop-debug-info font-value">
          {sourceSize.width}×{sourceSize.height}px · {format}
          {fileInfo && <> · {formatBytes(fileInfo.size)}</>}
        </span>
      )}
    </div>
  )
}
