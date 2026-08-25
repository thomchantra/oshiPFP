import type { LineArtMode, LineArtParams } from '../types'

/** Per-algorithm (not per-filter) mapping of the two quick sliders shown in the carousel-selected
 * view, before the user opens the full edit sheet. Conceptually always "Threshold" + "Thickness",
 * but each algo's own field for those concepts differs — Hinata/Tsukiko's Edge treatment has no
 * literal `threshold`/`radius` fields, so they map onto their nearest equivalents instead. */
export const QUICK_MACRO_FIELDS: Record<LineArtMode, { threshold: keyof LineArtParams; thickness: keyof LineArtParams }> = {
  pathB: { threshold: 'threshold', thickness: 'radius' },
  pathC: { threshold: 'gateThreshold', thickness: 'radius' },
  pathD: { threshold: 'threshold', thickness: 'radius' },
  pathF: { threshold: 'sensitivity', thickness: 'radius' },
  pathG: { threshold: 'threshold', thickness: 'radius' },
  pathH: { threshold: 'highPassStrength', thickness: 'responsiveGrow' },
  pathI: { threshold: 'responsiveCrossover', thickness: 'responsiveGrow' },
}
