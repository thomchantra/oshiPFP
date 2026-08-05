import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import type { CropMode } from '../types'

interface PreviewViewportProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewportRef: RefObject<HTMLDivElement | null>
  cropMode: CropMode
  /** Explicit pixel size for the square box in 'square' mode (App.tsx computes it as min(wrapper width, wrapper height) — see there for why this can't just be CSS aspect-ratio + max-height). Unused in 'original' mode. */
  squareSize?: number
  /** Explicit contain-fit pixel size for 'original' mode, preserving the source image's fixed native aspect ratio regardless of how much space the current tab's chrome leaves the wrapper (App.tsx computes this from sourceSize, not the wrapper's own aspect). Unused in 'square' mode. */
  originalSize?: { width: number; height: number }
  circle: boolean
  interactive: boolean
  /** Rendered absolutely inset within this component's own shaped box (not the outer centering wrapper) — e.g. BlankState, so it matches the square's actual bounds instead of stretching to fill leftover flex space. */
  overlay?: ReactNode
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void
}

/**
 * Edge-to-edge viewport for the shared pipeline canvas — square mode locks a
 * true (undistorted) square sized in JS by App.tsx (see useElementSize),
 * optionally circle-clipped; original mode contain-fits the source image's
 * fixed native aspect ratio within the available space (also computed by
 * App.tsx), so it renders identically regardless of how much room the
 * current tab's chrome leaves the wrapper.
 */
export default function PreviewViewport({
  canvasRef,
  viewportRef,
  cropMode,
  squareSize,
  originalSize,
  circle,
  interactive,
  overlay,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PreviewViewportProps) {
  const isSquare = cropMode === 'square'
  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="preview-viewport"
      style={{
        width: isSquare ? (squareSize ?? '100%') : (originalSize?.width ?? '100%'),
        height: isSquare ? squareSize : originalSize?.height,
        flex: isSquare || originalSize ? '0 0 auto' : '1 1 auto',
        borderRadius: isSquare && circle ? '50%' : undefined,
        touchAction: interactive ? 'none' : 'auto',
        cursor: interactive ? 'grab' : 'default',
      }}
    >
      {/* Absolutely positioned rather than width/height:100% — canvas is a replaced
          element whose intrinsic (backing-store) aspect ratio can otherwise leak
          into percentage-height resolution and override the flex-grown box size. */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {overlay && <div style={{ position: 'absolute', inset: 0 }}>{overlay}</div>}
    </div>
  )
}
