import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useDoubleTapReset } from './useDoubleTapReset'

interface GradientSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  defaultValue: number
  /** CSS gradient (e.g. 'linear-gradient(90deg, #FF9547, #5297FF)') for parameters with a directional gradient track. Omit for a plain accent-fill track. */
  trackGradient?: string
  formatValue?: (value: number) => string
  onChange: (value: number) => void
}

const DIRECTION_DEADZONE_PX = 6

function snap(raw: number, min: number, max: number, step: number): number {
  const stepped = Math.round((raw - min) / step) * step + min
  return Math.min(max, Math.max(min, stepped))
}

type DragState = { startX: number; startY: number; startValue: number; mode: 'pending' | 'dragging' | 'scrolling' }

export default function GradientSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  trackGradient,
  formatValue,
  onChange,
}: GradientSliderProps) {
  const handleDoubleTap = useDoubleTapReset(defaultValue, onChange)
  const fillPct = ((value - min) / (max - min)) * 100
  const dragRef = useRef<DragState | null>(null)

  // Relative drag, not absolute jump-to-touch-point: touching down anywhere
  // in the (generous, label-covering) hit zone "grabs" the slider at its
  // current value, and horizontal movement shifts it from there — like
  // sliding paper under your finger, not teleporting the knob to your
  // finger. An absolute jump-on-touch first pass here also fired on every
  // vertical scroll gesture that merely started over a slider, since any
  // touchstart within the hit area moved the value immediately; the pending/
  // dragging/scrolling state machine below exists specifically to tell a
  // horizontal drag intent apart from a vertical scroll intent (a small
  // deadzone, then whichever axis moved further wins) and only claims the
  // gesture — via setPointerCapture + preventDefault — once it's confirmed
  // horizontal, so vertical scrolls starting on a slider still scroll.
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    handleDoubleTap(e)
    if (e.defaultPrevented) return // double-tap reset just fired
    dragRef.current = { startX: e.clientX, startY: e.clientY, startValue: value, mode: 'pending' }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragRef.current
    if (!state || state.mode === 'scrolling') return
    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY

    if (state.mode === 'pending') {
      if (Math.abs(dx) < DIRECTION_DEADZONE_PX && Math.abs(dy) < DIRECTION_DEADZONE_PX) return
      if (Math.abs(dy) > Math.abs(dx)) {
        state.mode = 'scrolling' // let the page's native scroll take it from here
        return
      }
      state.mode = 'dragging'
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const deltaValue = (dx / rect.width) * (max - min)
    onChange(snap(state.startValue + deltaValue, min, max, step))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <div
      className="field-row gradient-slider-hitzone"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="field-row-label">
        <span className="font-param-label">{label}</span>
        <span className="value font-value">{formatValue ? formatValue(value) : value.toFixed(2)}</span>
      </div>
      <div className="gradient-slider-wrap">
        <div
          className="gradient-slider-track"
          style={{ background: trackGradient ?? 'var(--white-50)' }}
        >
          {!trackGradient && (
            <div className="gradient-slider-fill" style={{ width: `${fillPct}%` }} />
          )}
        </div>
        <input
          type="range"
          className="gradient-slider-input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
      </div>
    </div>
  )
}
