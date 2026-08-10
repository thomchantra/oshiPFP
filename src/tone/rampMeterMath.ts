import type { ColorLiftParams, ToneShapingParams } from '../types'
import { HUE_BAND_SWATCHES } from '../color/hslPalette'
import { pinchToPlateau } from './pinchRamp'

/** Ordered 0..1 positions along the black->white ramp — 2 for Clip mode (blackClip/
 * whiteClip), 4 for Pinch mode (floor/innerLow/innerHigh/ceiling, via the same mapping
 * the pipeline uses). This is the *math*, still 4 points for pinch — see
 * `toneRampDisplayMarkers` for what the meter actually draws. */
export function toneRampMarkers(toneShaping: ToneShapingParams): number[] {
  if (toneShaping.mode === 'clip') {
    return [toneShaping.clipMode.blackClip, toneShaping.clipMode.whiteClip]
  }
  const plateau = pinchToPlateau(toneShaping.pinchMode)
  return [plateau.floor, plateau.innerLow, plateau.innerHigh, plateau.ceiling]
}

/** What the meter actually draws — clip mode shows both points as-is; pinch mode drops
 * the fixed floor/ceiling (always 0/1, never informative) and shows only the two inner
 * band-edge points. */
export function toneRampDisplayMarkers(toneShaping: ToneShapingParams): number[] {
  const markers = toneRampMarkers(toneShaping)
  return toneShaping.mode === 'pinch' ? markers.slice(1, 3) : markers
}

/** Gumi's Luminance Detection ramp meter (v0.3 tuning) — unlike Pinch mode's fixed 0/1
 * floor/ceiling (hidden by toneRampDisplayMarkers as uninformative), Gumi's Floor/Ceiling are
 * genuinely user-adjustable and only equal Low/High Clip when Feather=0 — showing all 4 points
 * is real, meaningful feedback (Floor/Ceiling markers visibly separating from Low/High Clip's
 * exactly when Feather makes them start to matter, see plateauRamp.frag.ts's own doc comment). */
export function gumiRampMarkers(p: { gumiRampFloor: number; gumiRampInnerLow: number; gumiRampInnerHigh: number; gumiRampCeiling: number }): number[] {
  return [p.gumiRampFloor, p.gumiRampInnerLow, p.gumiRampInnerHigh, p.gumiRampCeiling]
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Hue in degrees (0-360) from an RGB triple — saturation/lightness aren't needed since
 * every band swatch is reconstructed at a fixed 100% saturation for the meter. */
function rgbToHueDegrees([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

/** Standard HSL->RGB (h in degrees, s/l 0-1) -> `#rrggbb`. */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let [r, g, b] = [0, 0, 0]
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export interface ColorLiftLevel {
  key: keyof ColorLiftParams
  label: string
  /** Fully-opaque color for this band at its lifted brightness — pure hue/100% saturation
   * throughout, only lightness moves with the lift value. No alpha/opacity involved, so
   * the cell never reads as desaturated/washed-out against the page background. */
  hex: string
}

/** One entry per hue band swatch, in the same order as the Color Lift sliders — see
 * docs/oshiPFP-v0.3-spec.md's "Color meter display the brightness value of each hue band".
 * Lift (-1..1) maps to lightness only (0.5 = identity, ->1 brighter/toward white, ->0
 * darker/toward black) — hue and saturation (100%) never change, so the band's actual
 * chroma stays constant and only its brightness visibly shifts. */
export function colorLiftLevels(colorLift: ColorLiftParams): ColorLiftLevel[] {
  return HUE_BAND_SWATCHES.map((swatch) => {
    const hue = rgbToHueDegrees(hexToRgb01(swatch.hex))
    const lightness = 0.5 + colorLift[swatch.key] / 2
    return { key: swatch.key, label: swatch.label, hex: hslToHex(hue, 1, lightness) }
  })
}
