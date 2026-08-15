import { useCallback, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { CurvePoint } from '../types'
import { sampleCurveLUT } from './spline'

interface ReferenceCurve {
  lut: Uint8Array
  color: string
}

interface CurveEditorProps {
  points: CurvePoint[]
  onChange: (points: CurvePoint[]) => void
  /** Non-interactive, lighter-weight curves drawn underneath the active (editable) one — e.g. the Color tab's RGB/R/G/B tabs show all 4 curves at once, only the selected one draggable. */
  referenceCurves?: ReferenceCurve[]
  /** Stroke color of the active/editable curve and its control points — defaults to the original single-curve blue. */
  activeColor?: string
  /** Opaque card background + border (the original single-curve look). Off for the Color tab, which now draws curves directly on top of the image — see ColorCurveOverlay.tsx — where an opaque box would hide the artwork underneath. */
  opaque?: boolean
}

const SIZE = 255
const MAX_POINTS = 8
/** Visible dot diameter, in real screen px — fixed regardless of how big or small the curve area itself renders (e.g. a cramped mobile layout); a viewBox-scaled knob shrinks along with the graph and becomes hard to grab. */
const KNOB_SIZE = 20
/** Touch target diameter, in real screen px — matches Apple HIG's 44pt minimum. Also fixed-size, same reasoning as KNOB_SIZE. */
const KNOB_HIT_SIZE = 44

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * Control points are plain HTML buttons, absolutely positioned by
 * percentage over the container — not SVG circles inside the viewBox-
 * scaled `<svg>` (which only renders the curve path/lines, and is
 * pointer-events:none). A percentage-positioned HTML element's *position*
 * scales with its container the way a curve point should, but its
 * fixed-px *size* does not — exactly the decoupling KNOB_SIZE/KNOB_HIT_SIZE
 * above need, which an SVG element's viewBox-relative radius can't give
 * without extra per-render scale math. This also sidesteps SVG-specific
 * hit-testing edge cases (transparent-fill pointer-events quirks, viewBox
 * clip-at-boundary behavior).
 */
export default function CurveEditor({ points, onChange, referenceCurves, activeColor = 'var(--blue)', opaque = true }: CurveEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const draggingIndex = useRef<number | null>(null)

  const sorted = [...points].sort((a, b) => a.x - b.x)
  const lut = sampleCurveLUT(sorted)
  const pathD = Array.from(lut)
    .map((y, x) => `${x === 0 ? 'M' : 'L'} ${x} ${SIZE - y}`)
    .join(' ')

  const toCurveSpace = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const localX = ((clientX - rect.left) / rect.width) * SIZE
    const localY = ((clientY - rect.top) / rect.height) * SIZE
    return {
      x: clamp(localX, 0, SIZE),
      y: clamp(SIZE - localY, 0, SIZE),
    }
  }, [])

  const handlePointDown = useCallback(
    (index: number) => (e: ReactPointerEvent) => {
      e.stopPropagation()
      // Extra insurance alongside the touch-callout/user-select CSS above —
      // iOS's long-press-to-select/callout timer starts on touchstart, and
      // an explicit preventDefault this early is the most reliable way to
      // cancel it before it can win the race against a drag.
      e.preventDefault()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      draggingIndex.current = index
    },
    [],
  )

  const handleContainerPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (draggingIndex.current === null) return
      const { x, y } = toCurveSpace(e.clientX, e.clientY)
      const idx = draggingIndex.current
      // Endpoints move freely on both axes (Photoshop/Lightroom-style
      // black-point/white-point dragging — pulling an endpoint inward on x
      // crushes that end of the range).
      const next = sorted.map((p, i) => (i === idx ? { x, y } : p))
      onChange(next)
    },
    [sorted, onChange, toCurveSpace],
  )

  const handleContainerPointerUp = useCallback(() => {
    draggingIndex.current = null
  }, [])

  const handleContainerDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (sorted.length >= MAX_POINTS) return
      const { x, y } = toCurveSpace(e.clientX, e.clientY)
      onChange([...sorted, { x, y }])
    },
    [sorted, onChange, toCurveSpace],
  )

  const handlePointDoubleClick = useCallback(
    (index: number) => (e: ReactMouseEvent) => {
      e.stopPropagation()
      const isFirst = index === 0
      const isLast = index === sorted.length - 1
      // Endpoints can't be deleted (a curve needs at least its 2 ends) —
      // double-tapping one instead resets it back to its identity corner,
      // undoing a black/white-point crush without having to drag it back.
      if (isFirst || isLast) {
        onChange(sorted.map((p, i) => (i === index ? { x: isFirst ? 0 : SIZE, y: isFirst ? 0 : SIZE } : p)))
        return
      }
      onChange(sorted.filter((_, i) => i !== index))
    },
    [sorted, onChange],
  )

  return (
    <div
      ref={containerRef}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onPointerCancel={handleContainerPointerUp}
      onDoubleClick={handleContainerDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: opaque ? 'var(--bg)' : 'transparent',
        border: opaque ? '1px solid var(--line2)' : 'none',
        borderRadius: opaque ? 'var(--radius-sm)' : 0,
        boxSizing: 'border-box',
        touchAction: 'none',
        cursor: 'crosshair',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', filter: opaque ? undefined : 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))' }}
      >
        <line
          x1={0} y1={SIZE} x2={SIZE} y2={0}
          stroke={opaque ? 'var(--line3)' : 'rgba(255,255,255,0.7)'}
          strokeDasharray="4 4"
        />
        {referenceCurves?.map((ref, i) => (
          <path
            key={i}
            d={Array.from(ref.lut).map((y, x) => `${x === 0 ? 'M' : 'L'} ${x} ${SIZE - y}`).join(' ')}
            fill="none"
            stroke={ref.color}
            strokeWidth={1}
            opacity={0.45}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={pathD} fill="none" stroke={activeColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {sorted.map((p, i) => (
        <button
          key={i}
          type="button"
          onPointerDown={handlePointDown(i)}
          onDoubleClick={handlePointDoubleClick(i)}
          aria-label={`Curve point ${i + 1}`}
          style={{
            position: 'absolute',
            left: `${(p.x / SIZE) * 100}%`,
            top: `${((SIZE - p.y) / SIZE) * 100}%`,
            width: KNOB_HIT_SIZE,
            height: KNOB_HIT_SIZE,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            cursor: 'grab',
            touchAction: 'none',
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
        >
          <span
            style={{
              display: 'block',
              width: KNOB_SIZE,
              height: KNOB_SIZE,
              borderRadius: '50%',
              background: 'var(--bg2)',
              border: `2px solid ${activeColor}`,
              boxShadow: opaque ? undefined : '0 1px 3px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
            }}
          />
        </button>
      ))}
    </div>
  )
}
