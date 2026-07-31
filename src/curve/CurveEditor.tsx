import { useCallback, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { CurvePoint } from '../types'
import { sampleCurveLUT } from './spline'

interface CurveEditorProps {
  points: CurvePoint[]
  onChange: (points: CurvePoint[]) => void
}

const SIZE = 255
const MAX_POINTS = 8

export default function CurveEditor({ points, onChange }: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const draggingIndex = useRef<number | null>(null)

  const sorted = [...points].sort((a, b) => a.x - b.x)
  const lut = sampleCurveLUT(sorted)
  const pathD = Array.from(lut)
    .map((y, x) => `${x === 0 ? 'M' : 'L'} ${x} ${SIZE - y}`)
    .join(' ')

  const toCurveSpace = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const localX = ((clientX - rect.left) / rect.width) * SIZE
    const localY = ((clientY - rect.top) / rect.height) * SIZE
    return {
      x: Math.min(SIZE, Math.max(0, localX)),
      y: Math.min(SIZE, Math.max(0, SIZE - localY)),
    }
  }, [])

  const handlePointDown = useCallback(
    (index: number) => (e: ReactPointerEvent) => {
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      draggingIndex.current = index
    },
    [],
  )

  const handleSvgPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (draggingIndex.current === null) return
      const { x, y } = toCurveSpace(e.clientX, e.clientY)
      const idx = draggingIndex.current
      const isEndpoint = idx === 0 || idx === sorted.length - 1
      const next = sorted.map((p, i) => (i === idx ? { x: isEndpoint ? p.x : x, y } : p))
      onChange(next)
    },
    [sorted, onChange, toCurveSpace],
  )

  const handleSvgPointerUp = useCallback(() => {
    draggingIndex.current = null
  }, [])

  const handleSvgDoubleClick = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (sorted.length >= MAX_POINTS) return
      const { x, y } = toCurveSpace(e.clientX, e.clientY)
      onChange([...sorted, { x, y }])
    },
    [sorted, onChange, toCurveSpace],
  )

  const handlePointDoubleClick = useCallback(
    (index: number) => (e: ReactMouseEvent) => {
      e.stopPropagation()
      if (index === 0 || index === sorted.length - 1) return
      onChange(sorted.filter((_, i) => i !== index))
    },
    [sorted, onChange],
  )

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={handleSvgPointerUp}
      onPointerCancel={handleSvgPointerUp}
      onDoubleClick={handleSvgDoubleClick}
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        maxWidth: 280,
        display: 'block',
        margin: '0 auto',
        background: 'var(--bg)',
        border: '1px solid var(--line2)',
        borderRadius: 'var(--radius-sm)',
        touchAction: 'none',
        cursor: 'crosshair',
      }}
    >
      <line x1={0} y1={SIZE} x2={SIZE} y2={0} stroke="var(--line3)" strokeDasharray="4 4" />
      <path d={pathD} fill="none" stroke="var(--blue)" strokeWidth={2} />
      {sorted.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={SIZE - p.y}
          r={7}
          fill="var(--bg2)"
          stroke="var(--blue)"
          strokeWidth={2}
          onPointerDown={handlePointDown(i)}
          onDoubleClick={handlePointDoubleClick(i)}
          style={{ cursor: 'grab' }}
        />
      ))}
    </svg>
  )
}
