import type { CSSProperties } from 'react'
import type { ColorLiftParams, ToneShapingParams } from '../types'
import { colorLiftLevels, toneRampDisplayMarkers } from '../tone/rampMeterMath'

const BAR_SIZE = 20

/** Solid red marker line — deliberately a plain literal, not `var(--red)` (that token is a
 * muted brand red used for destructive UI, not the pure indicator red this meter calls for). */
const MARKER_COLOR = '#FF0000'

interface RampMeterProps {
  kind: 'tone' | 'color'
  toneShaping?: ToneShapingParams
  colorLift?: ColorLiftParams
  /** 'row' (default) for the desktop horizontal bar embedded in the expand group;
   * 'column' for the mobile overlay's vertical bar on top of the preview viewport. */
  orientation?: 'row' | 'column'
}

/** Tone Lift/Color Lift's "ramp feedback meter" — see docs/oshiPFP-v0.3-spec.md.
 * Tone: black->white gradient bar with a solid red line per active ramp point.
 * Color: one swatch-colored (pure hue, opaque) indicator per hue band at its lifted brightness. */
export default function RampMeter({ kind, toneShaping, colorLift, orientation = 'row' }: RampMeterProps) {
  const isRow = orientation === 'row'
  const trackStyle: CSSProperties = {
    position: 'relative',
    flex: 1,
    ...(isRow
      ? { height: BAR_SIZE, width: '100%', background: 'linear-gradient(90deg, #000000, #FFFFFF)' }
      : { width: BAR_SIZE, height: '100%', background: 'linear-gradient(0deg, #000000, #FFFFFF)' }),
    borderRadius: 4,
  }

  if (kind === 'tone' && toneShaping) {
    const markers = toneRampDisplayMarkers(toneShaping)
    return (
      <div
        className="rampmeter rampmeter-tone"
        style={{ display: 'flex', flexDirection: isRow ? 'row' : 'column', alignItems: 'stretch', gap: 4, ...(isRow ? {} : { height: '100%' }) }}
      >
        <div style={trackStyle}>
          {markers.map((pos, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                ...(isRow
                  ? { left: `${pos * 100}%`, top: -2, bottom: -2, width: 2, transform: 'translateX(-1px)' }
                  : { bottom: `${pos * 100}%`, left: -2, right: -2, height: 2, transform: 'translateY(1px)' }),
                background: MARKER_COLOR,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (kind === 'color' && colorLift) {
    const levels = colorLiftLevels(colorLift)
    return (
      <div
        className="rampmeter rampmeter-color"
        style={{ display: 'flex', flexDirection: isRow ? 'row' : 'column', gap: 3, ...(isRow ? {} : { height: '100%' }) }}
      >
        {levels.map((band) => (
          <div
            key={band.key}
            title={`${band.label} lift`}
            style={{
              flex: 1,
              borderRadius: 3,
              background: band.hex,
              ...(isRow ? { height: BAR_SIZE } : { width: BAR_SIZE }),
            }}
          />
        ))}
      </div>
    )
  }

  return null
}
