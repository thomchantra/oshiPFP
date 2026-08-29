import type { LineArtParams } from '../types'

/** Simplified-mode Hinata Tone control: one bipolar centre-tap slider replacing Advanced's
 * Multiply / Screen pill + Tone Gain pair. Centre (0) = passthrough (`hiToneTarget: 'off'`, the
 * tone-remap pass is skipped entirely); left = Multiply, right = Screen, magnitude drives
 * `hiToneGain` across its Advanced-validated 0.2–4 range. Same shape as lineBrightness.ts's
 * bipolar Mult / Add blend mapping. */

const GAIN_MIN = 0.2
const GAIN_MAX = 4

/** Slider value (-100..100) → the two params it drives. */
export function toneBlendToParams(v: number): { hiToneTarget: LineArtParams['hiToneTarget']; hiToneGain: number } {
  if (Math.round(v) === 0) return { hiToneTarget: 'off', hiToneGain: 1 }
  const gain = GAIN_MIN + (Math.abs(v) / 100) * (GAIN_MAX - GAIN_MIN)
  return { hiToneTarget: v < 0 ? 'multiply' : 'screen', hiToneGain: gain }
}

/** Inverse, for placing the thumb from current params. `'off'` sits dead centre; any other target
 * maps its gain back onto its own half of the track. */
export function paramsToToneBlend(target: LineArtParams['hiToneTarget'], gain: number): number {
  if (target === 'off') return 0
  const pct = ((Math.min(GAIN_MAX, Math.max(GAIN_MIN, gain)) - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)) * 100
  return target === 'multiply' ? -pct : pct
}

export function formatToneBlend(v: number): string {
  if (Math.round(v) === 0) return 'Off'
  return `${v < 0 ? 'Multiply' : 'Screen'} ${Math.round(Math.abs(v))}%`
}
