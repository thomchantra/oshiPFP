/**
 * The app's one HSL-module color palette (docs/oshiPFP-v0.2.1-UIspecs.md's
 * "HSL Module" section), shared by every feature that targets these 8 hue
 * bands: Line Art's Color Lift (colorLift.frag.ts, lightness-only, feeds
 * only the line-art detection input) and the Color tab's targeted HSL
 * (curvesHsl.frag.ts, full hue/sat/lightness, affects the base image
 * directly). Two independent features, same palette — kept in one place so
 * they can't quietly drift apart.
 *
 * BAND_HUES are each swatch's actual hue (0-1), not an idealized evenly-
 * spaced wheel — computed from the hex values below, matches what the UI
 * swatches actually look like. Must stay in sync with the identical
 * hardcoded GLSL arrays in colorLift.frag.ts and curvesHsl.frag.ts (GLSL
 * has no way to import this file) — if this palette ever changes, update
 * those two shaders' BAND_HUES to match.
 */
export type HueBandKey = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'magenta'

export const HUE_BAND_SWATCHES: { key: HueBandKey; label: string; hex: string }[] = [
  { key: 'red', label: 'Red', hex: '#FF0000' },
  { key: 'orange', label: 'Orange', hex: '#FF7300' },
  { key: 'yellow', label: 'Yellow', hex: '#FFFF00' },
  { key: 'green', label: 'Green', hex: '#00FF5E' },
  { key: 'teal', label: 'Teal', hex: '#00FFEF' },
  { key: 'blue', label: 'Blue', hex: '#006EFF' },
  { key: 'purple', label: 'Purple', hex: '#9700FF' },
  { key: 'magenta', label: 'Magenta', hex: '#FF00A9' },
]
