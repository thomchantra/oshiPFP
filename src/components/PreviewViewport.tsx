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
  /** Retires this wrapper's own white-50 "card" background once an image is loaded, so the
   * viewport reads as open page background rather than a visible rounded card behind the
   * image — the card look is only wanted for the pre-upload BlankState (which draws its own
   * white-50 dashed box independently, see BlankState.tsx, so it's unaffected by this). */
  hasImage: boolean
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
  hasImage,
  circle,
  interactive,
  overlay,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PreviewViewportProps) {
  const isSquare = cropMode === 'square'
  // Circle clip now lives on the inner frame div below (sized to hug the canvas's own
  // rendered box, not this outer wrapper's assumed squareSize/originalSize box) — see that
  // div's comment. fillWrapper (Dual Pane) gets its own two-lobe mask instead of a single
  // border-radius, since one canvas holds two side-by-side panes there.
  const showCircle = isSquare && circle
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
        background: hasImage ? 'transparent' : undefined,
        // Blank state's own dashed box (BlankState.tsx) draws its own matching white-50
        // background + shape on top of this — but this outer card's background still shows
        // through at the corners whenever its shape doesn't match (a 20px-rounded rect behind
        // an inscribed circle leaves the rect's corners visibly peeking out past the circle).
        // Only relevant pre-upload — once hasImage, this whole background is transparent above.
        borderRadius: !hasImage && showCircle ? '50%' : undefined,
        touchAction: interactive ? 'none' : 'auto',
        cursor: interactive ? 'grab' : 'default',
      }}
    >
      {/* pipeline.ts's render() now owns the canvas's own CSS width/height imperatively
          (contain-fit, never-enlarge against this wrapper's box — see its final blit
          section), so this wrapper only centers whatever size the canvas ends up being;
          it must NOT set width/height:100% on the canvas itself, or React's style
          reconciliation would stomp the imperative values back on every re-render.
          Critically, the canvas's DOM parent must stay exactly this div — pipeline.ts's
          boxSize() reads canvas.parentElement.clientWidth/Height as the box to contain-fit
          against. An earlier version of the circle-crop fix below inserted an extra unsized
          wrapper div between this div and the canvas so the clip could shrink-wrap to the
          canvas's own rendered size; that made canvas.parentElement resolve to that new
          div instead, whose size is itself derived FROM the canvas's current size — a
          measurement feedback loop that hardlocked every upload to a tiny render regardless
          of source resolution. Fixed by clipping the canvas element directly (clip-path/mask,
          sized relative to its own box) instead of via a wrapper div, so this parent chain
          is untouched. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          className={showCircle ? (fillWrapper ? 'preview-canvas-dualcircle' : 'preview-canvas-circle') : undefined}
          style={{ display: 'block' }}
        />
      </div>
      {overlay && <div style={{ position: 'absolute', inset: 0 }}>{overlay}</div>}
    </div>
  )
}
