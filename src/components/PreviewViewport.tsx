import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

interface PreviewViewportProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewportRef: RefObject<HTMLDivElement | null>
  interactive: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void
}

export default function PreviewViewport({
  canvasRef,
  viewportRef,
  interactive,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PreviewViewportProps) {
  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        maxWidth: 360,
        margin: '0 auto',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        background: 'var(--bg)',
        border: '1px solid var(--line2)',
        touchAction: interactive ? 'none' : 'auto',
        cursor: interactive ? 'grab' : 'default',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
