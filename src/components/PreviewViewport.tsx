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
  /** Dual Pane override (oshiPFP v0.3) — bypasses squareSize/originalSize's single-image aspect
   * lock entirely and fills the wrapper's full available box instead. Dual Pane shows two flush
   * panes side by side (double-wide content), which needs the actual available area to contain-fit
   * against, not a box shaped for one image — see pipeline.ts's final blit for the contain-fit math
   * this box feeds. Background also switches to the page background (not the white-50 card color)
   * so any left-over letterboxing reads as open space rather than a visible narrower card. */
  fillWrapper?: boolean
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
  fillWrapper,
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
      className={`preview-viewport${fillWrapper ? ' preview-viewport-fill' : ''}`}
      style={{
        width: fillWrapper ? '100%' : isSquare ? (squareSize ?? '100%') : (originalSize?.width ?? '100%'),
        height: fillWrapper ? '100%' : isSquare ? squareSize : originalSize?.height,
        flex: fillWrapper ? '1 1 auto' : isSquare || originalSize ? '0 0 auto' : '1 1 auto',
        borderRadius: !fillWrapper && isSquare && circle ? '50%' : undefined,
        touchAction: interactive ? 'none' : 'auto',
        cursor: interactive ? 'grab' : 'default',
      }}
    >
      {/* pipeline.ts's render() now owns the canvas's own CSS width/height imperatively
          (contain-fit, never-enlarge against this wrapper's box — see its final blit
          section), so this wrapper only centers whatever size the canvas ends up being;
          it must NOT set width/height:100% on the canvas itself, or React's style
          reconciliation would stomp the imperative values back on every re-render. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
      {overlay && <div style={{ position: 'absolute', inset: 0 }}>{overlay}</div>}
    </div>
  )
}
