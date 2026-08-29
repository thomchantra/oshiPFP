import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useDoubleTapReset } from './useDoubleTapReset'
import { trace } from '../debug/renderTrace'

/**
 * Value <-> slider-position (0-1) taper: a value of `breakpoint` sits at
 * `breakpointPosition` fraction of the track instead of wherever it'd fall
 * linearly, with the two flanking ranges each linear in their own
 * value-space segment. Used to give a "hot spot" range more scrubbing
 * room — e.g. line-art Radius sliders, whose useful values are almost
 * always 0-3px within a 0-20px range, so 0-3 gets 40% of the track instead
 * of the 15% linear mapping would give it.
 */
export interface SliderCurve {
  breakpoint: number
  breakpointPosition: number
}

/** `formatValue` for a 0..1-domain slider displayed as a plain percentage (e.g. Denoise Intensity). */
export const formatPercent = (v: number) => `${Math.round(v * 100)}%`
/** `formatValue` for a -1..1-domain slider displayed as a signed percentage (e.g. Color Lift, Grade's Whites/Blacks). */
export const formatSignedPercent = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`

interface GradientSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  defaultValue: number
  /** CSS gradient (e.g. 'linear-gradient(90deg, #FF9547, #5297FF)') for parameters with a directional gradient track. Omit for a plain accent-fill track. */
  trackGradient?: string
  curve?: SliderCurve
  formatValue?: (value: number) => string
  /** Rendered between the label and the numeric value, e.g. the Luminance Ramp eyedropper's icon+swatch — see LineArtPanel.tsx. */
  rightAccessory?: ReactNode
  /** Greys the row out and ignores pointer/keyboard input — for params that are currently a structural no-op (e.g. Gumi's Floor/Ceiling when Feather is 0, see LineArtPanel.tsx) rather than just "not yet touched." */
  disabled?: boolean
  /** Optional reference marker(s) drawn as thin red lines on the track, in the same value-space
   * as `value`/`min`/`max` (converted through the same curve, if any) — e.g. Gumi Dual Line's
   * Detection Range slider shows its actual computed innerLow/innerHigh band edges (see
   * RampMeter.tsx for the same visual language). Omit for no markers; zero effect on every
   * other existing consumer. */
  markers?: number[]
  onChange: (value: number) => void
}

const DIRECTION_DEADZONE_PX = 6
// Must match .gradient-slider-thumb's width in base.css — insets the thumb's travel range so it
// never bleeds past the track's edges (otherwise clips the knob / causes a horizontal scrollbar at
// fillPct 0/100). The knob is a 10x20 rounded rect, so this is its 10px width, not a square size.
const THUMB_WIDTH_PX = 10

function snap(raw: number, min: number, max: number, step: number): number {
  const stepped = Math.round((raw - min) / step) * step + min
  return Math.min(max, Math.max(min, stepped))
}

function valueToPos(value: number, min: number, max: number, curve?: SliderCurve): number {
  if (!curve) return (value - min) / (max - min)
  const { breakpoint, breakpointPosition } = curve
  if (value <= breakpoint) return ((value - min) / (breakpoint - min)) * breakpointPosition
  return breakpointPosition + ((value - breakpoint) / (max - breakpoint)) * (1 - breakpointPosition)
}

function posToValue(pos: number, min: number, max: number, curve?: SliderCurve): number {
  if (!curve) return min + pos * (max - min)
  const { breakpoint, breakpointPosition } = curve
  if (pos <= breakpointPosition) return min + (pos / breakpointPosition) * (breakpoint - min)
  return breakpoint + ((pos - breakpointPosition) / (1 - breakpointPosition)) * (max - breakpoint)
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
  curve,
  formatValue,
  rightAccessory,
  disabled,
  markers,
  onChange,
}: GradientSliderProps) {
  const handleDoubleTap = useDoubleTapReset(defaultValue, onChange)
  const fillPct = valueToPos(value, min, max, curve) * 100
  const dragRef = useRef<DragState | null>(null)

  // Debug-only (see docs/oshiPFP-invert-bug-devtool-trace-method.md), scoped to Gumi's
  // "Detection Radius" slider only. GradientSlider itself has no internal state — fillPct is
  // recomputed fresh from `value` every render — so a stale-looking fillPct here points to an
  // upstream params bug, not a paint/CSS issue in this component.
  if (label === 'Detection Radius') {
    trace('render:GradientSlider(DetectionRadius)', { value, fillPct, min, max, curve })
  }

  // Relative drag, not absolute jump-to-touch-point: touching down anywhere in the (generous,
  // label-covering) hit zone "grabs" the slider at its current value, and horizontal movement
  // shifts it from there — like sliding paper under your finger, not teleporting the knob to
  // your finger. The pending/dragging/scrolling state machine below tells a horizontal drag
  // intent apart from a vertical scroll intent (a small deadzone, then whichever axis moved
  // further wins) and only claims the gesture — via setPointerCapture + preventDefault — once
  // confirmed horizontal, so vertical scrolls starting on a slider still scroll.
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
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
    const deltaPos = dx / rect.width
    const startPos = valueToPos(state.startValue, min, max, curve)
    onChange(snap(posToValue(startPos + deltaPos, min, max, curve), min, max, step))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <div
      className={`field-row gradient-slider-hitzone${disabled ? ' gradient-slider-disabled' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="field-row-label">
        <span className="font-param-label">{label}</span>
        <span className="field-row-right">
          {rightAccessory}
          <span className="value font-value">{formatValue ? formatValue(value) : value.toFixed(2)}</span>
        </span>
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
        {/* Reference markers (e.g. Gumi Dual Line's ramp band edges) — siblings to the track,
           not nested inside it: .gradient-slider-track is overflow:hidden (base.css), which
           would clip a marker's slight vertical overhang, while .gradient-slider-wrap is
           position:relative and unclipped, same positioning context the thumb above uses. */}
        {markers?.map((m, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${valueToPos(m, min, max, curve) * 100}%`,
              top: -2,
              bottom: -2,
              width: 2,
              transform: 'translateX(-1px)',
              background: '#FF0000',
              pointerEvents: 'none',
            }}
          />
        ))}
        {/* Custom thumb, positioned directly from the same fillPct the fill bar already uses —
           the native input below is kept only for keyboard accessibility (pointer-events: none,
           see its own comment). Rendering the visible thumb ourselves avoids relying on the
           browser's own native-range-thumb repaint timing after a scripted (non-gesture) value
           change (e.g. switching Line Art algorithms swaps the whole slider set on fresh
           mount). */}
        <div
          className="gradient-slider-thumb"
          style={{ left: `calc((100% - ${THUMB_WIDTH_PX}px) * ${fillPct / 100} + ${THUMB_WIDTH_PX / 2}px)` }}
        />
        {curve ? (
          // Tapered sliders drive the native input in slider-position space
          // (0-1000, not real units) so its browser-rendered thumb tracks
          // the same nonlinear position as gradient-slider-fill above —
          // real min/max/value would visually desync the two once value
          // and position stop being proportional.
          <input
            type="range"
            className="gradient-slider-input"
            min={0}
            max={1000}
            step={1}
            value={Math.round(valueToPos(value, min, max, curve) * 1000)}
            onChange={(e) => onChange(snap(posToValue(Number(e.target.value) / 1000, min, max, curve), min, max, step))}
            disabled={disabled}
            aria-label={label}
          />
        ) : (
          <input
            type="range"
            className="gradient-slider-input"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
            aria-label={label}
          />
        )}
      </div>
    </div>
  )
}
