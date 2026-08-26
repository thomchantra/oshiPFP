import { pinchToPlateau } from '../tone/pinchRamp'

/**
 * Scores a candidate Tone Lift Pinch position (pinchExpand=0, fixed feathering — see
 * changelog/oshipfp-v0.5-instagram-mode-saga.md) by how elongated/curvy the resulting ink mask's
 * connected components are (perimeter/area — high for thin strokes, low for round/blobby
 * regions). Sits upstream of Gumi's own threshold/contrastBoost, left at neutral defaults (0.5/1)
 * once Pinch is doing the real selection work. Unvalidated — a starting guess for the user to
 * rate, same posture as Botan/Daiya/Chie's own guess flow before each was validated.
 */

export interface PinchPositionGuess {
  position255: number
  score: number
  density: number
}

function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Mirrors plateauRamp.frag.ts's weight computation exactly (rampStart/rampEnd/smoothstep), given
 * the floor/innerLow/innerHigh/ceiling/feather points pinchToPlateau() already derives from the
 * user-facing position/expand/feathering params — reuses that function rather than re-deriving the
 * same mix/clamp logic here, so this can't silently drift from the real Pinch Mode math. */
function plateauWeight(luminance01: number, position: number, feathering: number): number {
  const { floor, innerLow, innerHigh, ceiling, feather } = pinchToPlateau({ position, expand: 0, feathering })
  const rampStart = Math.min(feather * floor + (1 - feather) * innerLow, innerLow - 1e-4)
  const rampEnd = Math.max(feather * ceiling + (1 - feather) * innerHigh, innerHigh + 1e-4)
  const rising = smoothstep(rampStart, innerLow, luminance01)
  const falling = 1 - smoothstep(innerHigh, rampEnd, luminance01)
  return Math.min(rising, falling)
}

/**
 * Flood-fills the binary mask "plateauWeight(luminance, position, feathering) >= 0.5" (the same
 * cutoff Gumi's own fixed threshold=0.5 applies downstream) and scores it by total boundary-edge
 * count / total area across components at least `minComponentPx` in size — small enough to filter
 * isolated noise specks (which are ~100% boundary themselves and would otherwise inflate the score
 * without representing a real stroke), large enough to keep genuine thin line fragments. High
 * score = thin/curvy (real ink candidate); low score = round/blobby (background, flat color
 * regions). `data`/`width`/`height` should already be downsampled by the caller — this is
 * O(pixels) per call and gets called once per swept position.
 */
export function strokeShapeScore(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  position: number,
  feathering: number,
  minComponentPx = 3,
): { score: number; density: number } {
  const size = width * height
  const isInk = new Uint8Array(size)
  for (let p = 0; p < size; p++) {
    const i = p * 4
    const luminance01 = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    isInk[p] = plateauWeight(luminance01, position, feathering) >= 0.5 ? 1 : 0
  }

  const visited = new Uint8Array(size)
  const stack: number[] = []
  let totalPerim = 0
  let totalArea = 0
  for (let start = 0; start < size; start++) {
    if (!isInk[start] || visited[start]) continue
    const comp: number[] = []
    stack.push(start)
    visited[start] = 1
    while (stack.length > 0) {
      const p = stack.pop()!
      comp.push(p)
      const x = p % width
      const y = (p - x) / width
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const np = ny * width + nx
          if (isInk[np] && !visited[np]) {
            visited[np] = 1
            stack.push(np)
          }
        }
      }
    }
    if (comp.length < minComponentPx) continue
    let perim = 0
    for (const p of comp) {
      const x = p % width
      const y = (p - x) / width
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || !isInk[ny * width + nx]) perim++
      }
    }
    totalPerim += perim
    totalArea += comp.length
  }
  return {
    score: totalArea > 0 ? totalPerim / totalArea : 0,
    density: totalArea / size,
  }
}

/**
 * Sweeps candidate pinch positions (0-255, step `step255`) and returns the one with the highest
 * strokeShapeScore among candidates whose density clears `minDensity` — that floor exists because
 * a near-empty mask's few remaining pixels can score deceptively high (small, jagged components
 * still clear minComponentPx yet aren't a real stroke network). Returns null if no candidate
 * clears the density floor at all (nothing resembling ink found anywhere in the sweep).
 */
export function findBestPinchPosition(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  feathering: number,
  step255 = 4,
  minDensity = 0.02,
): PinchPositionGuess | null {
  let best: PinchPositionGuess | null = null
  for (let p255 = 0; p255 <= 255; p255 += step255) {
    const position = p255 / 255
    const { score, density } = strokeShapeScore(data, width, height, position, feathering)
    if (density < minDensity) continue
    if (!best || score > best.score) best = { position255: p255, score, density }
  }
  return best
}
