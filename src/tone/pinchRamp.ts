import type { PinchModeParams } from '../types'

export interface PlateauRampPoints {
  floor: number
  innerLow: number
  innerHigh: number
  ceiling: number
  feather: number
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Maps the Tone Lift Pinch Mode's user-facing params (band center, band
 * width, feather hardness) onto plateauRamp.frag.ts's floor/inner-low/
 * inner-high/ceiling/feather uniforms. Floor/ceiling are fixed at 0/1 (the
 * full tonal range) — only the two inner points move, clamped to stay
 * within that range per docs/oshiPFP-v0.3-spec.md's "Clamp to low ceiling
 * or high floor if one of the ramp point exceeds the bounds".
 */
export function pinchToPlateau(pinch: PinchModeParams): PlateauRampPoints {
  const half = pinch.expand / 2
  return {
    floor: 0,
    innerLow: clamp01(pinch.position - half),
    innerHigh: clamp01(pinch.position + half),
    ceiling: 1,
    feather: clamp01(pinch.feathering),
  }
}
