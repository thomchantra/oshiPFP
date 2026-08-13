import { useEffect, useState } from 'react'
import { buildChannelLutBuffer, defaultCurvePoints, sampleCurveLUT } from './spline'
import type { CurvePoint } from '../types'

export type CurveChannel = 'rgb' | 'r' | 'g' | 'b'

/**
 * `color` styles the channel pill button (background when active, text when
 * not); `curveColor` styles the actual plotted line/points on the viewport.
 * Split apart because RGB's pill uses the accent brand color (matches every
 * other pill in the app) but its curve line is solid white — the master
 * curve needs to read clearly against arbitrary artwork, and accent-title's
 * brown blends into a lot of photos.
 */
export const CURVE_CHANNEL_OPTIONS: { value: CurveChannel; label: string; color: string; curveColor: string }[] = [
  { value: 'rgb', label: 'RGB', color: 'var(--accent-title)', curveColor: '#FFFFFF' },
  { value: 'r', label: 'R', color: '#FF0000', curveColor: '#FF0000' },
  { value: 'g', label: 'G', color: '#00A650', curveColor: '#00A650' },
  { value: 'b', label: 'B', color: '#006EFF', curveColor: '#006EFF' },
]

export type CurvesByChannel = Record<CurveChannel, CurvePoint[]>

function initialCurves(): CurvesByChannel {
  return { rgb: defaultCurvePoints(), r: defaultCurvePoints(), g: defaultCurvePoints(), b: defaultCurvePoints() }
}

/**
 * Shared curve state, lifted out of any one component (App.tsx instantiates
 * this once) since the channel selector + Reset now live in their own row
 * above the viewport (ColorCurveTopContent) while the actual draggable
 * graph draws on top of the image (ColorCurveOverlay) — both need the same
 * channel/points state, so neither can own it locally the way the original
 * single-card version did.
 */
export function useColorCurve(onCurveChange: (lut: Uint8Array) => void) {
  const [channel, setChannel] = useState<CurveChannel>('rgb')
  const [curves, setCurves] = useState<CurvesByChannel>(initialCurves)
  // Whether the curve graph draws on the viewport — purely a display toggle
  // (ColorCurveTopContent's leftmost icon button); the curve LUT itself
  // keeps applying to the image either way, this only hides the
  // interactive overlay so it doesn't obscure the artwork underneath.
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const luts = {
      rgb: sampleCurveLUT(curves.rgb),
      r: sampleCurveLUT(curves.r),
      g: sampleCurveLUT(curves.g),
      b: sampleCurveLUT(curves.b),
    }
    onCurveChange(buildChannelLutBuffer(luts.rgb, luts.r, luts.g, luts.b))
    // onCurveChange identity is stable from usePipeline; only re-run when curves change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves])

  const setActivePoints = (points: CurvePoint[]) => setCurves((prev) => ({ ...prev, [channel]: points }))
  const reset = () => setCurves(initialCurves())

  return { channel, setChannel, curves, setCurves, setActivePoints, reset, visible, setVisible }
}
