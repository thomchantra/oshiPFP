import CurveEditor from '../curve/CurveEditor'
import { sampleCurveLUT } from '../curve/spline'
import { CURVE_CHANNEL_OPTIONS, type CurveChannel, type CurvesByChannel } from '../curve/useColorCurve'
import type { CurvePoint } from '../types'

interface ColorCurveOverlayProps {
  channel: CurveChannel
  curves: CurvesByChannel
  onChangeActive: (points: CurvePoint[]) => void
}

/**
 * The draggable curve graph itself, drawn directly on top of the image
 * (channel selector + Reset live in ColorCurveTopContent instead, above the
 * viewport) — per the UI spec. Fills whatever fixed-size, already-square
 * box its parent gives it (App.tsx sizes and positions that box, locked to
 * its own 1:1 boundary independent of the actual image viewport's current
 * size/aspect — see App.tsx's colorCurveSize) — this component owns none
 * of that sizing itself.
 *
 * Padding here (not on the parent box) is 40px, not just visual breathing room: the two corner
 * points (0,0)/(255,255) sitting close to the physical screen edge get intercepted by iOS
 * Safari's edge-swipe gesture (tab switch / back navigation) before the page ever sees a touch
 * event — no amount of touch-action/preventDefault can override that, since it's a system-level
 * gesture recognizer. 40px pushes the corner points comfortably outside that hot zone. Since the
 * box being padded is already square, uniform padding keeps the inner plot area square too — no
 * separate horizontal/vertical math needed.
 */
export default function ColorCurveOverlay({ channel, curves, onChangeActive }: ColorCurveOverlayProps) {
  const active = CURVE_CHANNEL_OPTIONS.find((c) => c.value === channel)!
  const referenceCurves = CURVE_CHANNEL_OPTIONS.filter((c) => c.value !== channel).map((c) => ({
    lut: sampleCurveLUT(curves[c.value]),
    color: c.curveColor,
  }))

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 40,
        boxSizing: 'border-box',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <CurveEditor
        points={curves[channel]}
        onChange={onChangeActive}
        referenceCurves={referenceCurves}
        activeColor={active.curveColor}
        opaque={false}
      />
    </div>
  )
}
