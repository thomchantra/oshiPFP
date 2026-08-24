import type { LineArtParams } from '../types'

/** Sign selects the blend branch (multiply = darken/ink-in, add = brighten), magnitude maps to
 * opacity: 0-75% -> 0-1 (plain single-layer crossfade), 75-100% -> 1-3 (the alpha-overdrive
 * range the composite pass already stacks into up to ALPHA_OVERDRIVE_LAYERS when opacity > 1). */
export function brightnessToOpacityBlend(brightness: number): {
  opacity: number
  blendMode: LineArtParams['blendMode']
} {
  const magnitude = Math.abs(brightness)
  const opacity = magnitude <= 75 ? magnitude / 75 : 1 + ((magnitude - 75) / 25) * 2
  const blendMode: LineArtParams['blendMode'] = brightness < 0 ? 'multiply' : 'add'
  return { opacity, blendMode }
}

/** Inverse of brightnessToOpacityBlend, for displaying the slider thumb from current params.
 * Only multiply/add are representable on this bipolar slider — any other blend mode (settable via
 * the Advanced Blend Mode selector) has no faithful position, so it's shown pinned at +magnitude. */
export function opacityBlendToBrightness(opacity: number, blendMode: LineArtParams['blendMode']): number {
  const magnitude = opacity <= 1 ? opacity * 75 : 75 + ((opacity - 1) / 2) * 25
  const sign = blendMode === 'multiply' ? -1 : 1
  return sign * magnitude
}
