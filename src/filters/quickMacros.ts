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
  // thickness: 'blobMaxDt', not 'radius' — Detection Radius causes a double-stroke "bubble"
  // artifact (minFilterContinuousProgram's continuous/sub-texel sampling against linearly-
  // filtered render targets) and is retired from Simplified mode entirely; Maximum Blob Size is
  // the field that actually controls perceived line thickness there. See macroFields.ts's
  // COLOR_MACRO_FIELDS.pathG doc comment and the Gumi filter JSON for the rest of that story.
  pathG: { threshold: 'threshold', thickness: 'blobMaxDt' },
  pathH: { threshold: 'highPassStrength', thickness: 'responsiveGrow' },
  pathI: { threshold: 'responsiveCrossover', thickness: 'responsiveGrow' },
}
