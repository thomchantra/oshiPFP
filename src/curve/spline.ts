import type { CurvePoint } from '../types'

function clampByte(v: number): number {
  return Math.min(255, Math.max(0, v))
}

export function defaultCurvePoints(): CurvePoint[] {
  return [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ]
}

/**
 * Fritsch-Carlson monotonic cubic Hermite interpolation through sorted
 * control points, sampled into a 256-entry byte LUT. Chosen over
 * Catmull-Rom because Catmull-Rom isn't guaranteed monotonic between
 * points, and overshoot visibly crushes/blows out tones in a curve editor.
 */
export function sampleCurveLUT(points: CurvePoint[]): Uint8Array {
  const pts = [...points].sort((a, b) => a.x - b.x)
  const n = pts.length
  const lut = new Uint8Array(256)

  if (n < 2) {
    for (let x = 0; x < 256; x++) lut[x] = x
    return lut
  }

  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)

  const d: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i]
    d.push(dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx)
  }

  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    m[i] = (d[i - 1] + d[i]) / 2
  }

  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    if (a < 0) m[i] = 0
    if (b < 0) m[i + 1] = 0
    const aa = m[i] / d[i]
    const bb = m[i + 1] / d[i]
    const s = aa * aa + bb * bb
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      m[i] = tau * aa * d[i]
      m[i + 1] = tau * bb * d[i]
    }
  }

  // Endpoints can be dragged inward on x (see CurveEditor.tsx), behaving like
  // a Levels-style black/white point crush: flat all the way out to the
  // image edge, then a clean line from there — x outside [xs[0], xs[n-1]]
  // clamps flat rather than extrapolating the boundary segment's slope.
  let seg = 0
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) {
      lut[x] = clampByte(Math.round(ys[0]))
      continue
    }
    if (x >= xs[n - 1]) {
      lut[x] = clampByte(Math.round(ys[n - 1]))
      continue
    }
    while (seg < n - 2 && x > xs[seg + 1]) seg++
    const x0 = xs[seg]
    const x1 = xs[seg + 1]
    const h = x1 - x0
    if (h === 0) {
      lut[x] = clampByte(Math.round(ys[seg]))
      continue
    }
    const t = (x - x0) / h
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    const y = h00 * ys[seg] + h10 * h * m[seg] + h01 * ys[seg + 1] + h11 * h * m[seg + 1]
    lut[x] = clampByte(Math.round(y))
  }

  return lut
}

/** Identity ramp (0..255) replicated across all 3 channels — the "no curve applied" state. */
export function identityLutBuffer(): Uint8Array {
  const buf = new Uint8Array(256 * 3)
  for (let x = 0; x < 256; x++) {
    buf[x * 3] = x
    buf[x * 3 + 1] = x
    buf[x * 3 + 2] = x
  }
  return buf
}

/**
 * Composes the master (RGB) curve with independent per-channel curves —
 * standard photo-editing curve stacking (Photoshop/Lightroom convention):
 * the master curve runs first, then each channel's own curve is applied to
 * that already-master-curved value. Lets the Color tab's RGB/R/G/B tabs
 * layer instead of override one another.
 */
export function buildChannelLutBuffer(master: Uint8Array, r: Uint8Array, g: Uint8Array, b: Uint8Array): Uint8Array {
  const buf = new Uint8Array(256 * 3)
  for (let x = 0; x < 256; x++) {
    const m = master[x]
    buf[x * 3] = r[m]
    buf[x * 3 + 1] = g[m]
    buf[x * 3 + 2] = b[m]
  }
  return buf
}
