import type { FilterManifestEntry } from './filterTypes'
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

/** The quick Threshold/Thickness field pair for a specific filter — its own `quick` override if it
 * declares one, else its algo's `QUICK_MACRO_FIELDS` default. Every consumer (edit sheet, main
 * carousel view, getEditableFields) goes through this so a per-filter override is honoured
 * everywhere consistently. */
export function resolveQuickFields(filter: FilterManifestEntry): { threshold: keyof LineArtParams; thickness: keyof LineArtParams } {
  return filter.quick ?? QUICK_MACRO_FIELDS[filter.algo]
}

export interface QuickSlotMeta { label: string; min: number; max: number; step?: number }

const DEFAULT_THRESHOLD_META: QuickSlotMeta = { label: 'Threshold', min: 0, max: 1 }
const DEFAULT_THICKNESS_META: QuickSlotMeta = { label: 'Thickness', min: 0, max: 10 }

/** Per-algo label/range for the two quick slots, where the "Threshold 0-1 / Thickness 0-10"
 * default doesn't fit the mapped field — e.g. Fumiko's Sensitivity is 0.5-20, its Radius 0-3.
 * Only algos that need an override appear here; everything else uses the defaults above. */
const QUICK_MACRO_META: Partial<Record<LineArtMode, { threshold?: Partial<QuickSlotMeta>; thickness?: Partial<QuickSlotMeta> }>> = {
  pathF: {
    threshold: { label: 'Sensitivity', min: 0.5, max: 20 },
    thickness: { label: 'Radius', min: 0, max: 3 },
  },
  // Gumi Line: the "thickness" slot is Maximum Blob Size (see QUICK_MACRO_FIELDS comment). Line
  // Overdrive is a separate slider (extraFields) now, not fused into this one.
  pathG: {
    thickness: { label: 'Max Thickness', min: 1, max: 10 },
  },
}

/** Label + slider range for a filter's two quick slots — the per-filter `quickMeta` override (for
 * a sub-mode like Gumi Fill) merged over the per-algo override merged over the shared defaults.
 * Pair with `resolveQuickFields` (which field each slot writes). */
export function resolveQuickMeta(filter: FilterManifestEntry): { threshold: QuickSlotMeta; thickness: QuickSlotMeta } {
  const m = QUICK_MACRO_META[filter.algo]
  return {
    threshold: { ...DEFAULT_THRESHOLD_META, ...m?.threshold, ...filter.quickMeta?.threshold },
    thickness: { ...DEFAULT_THICKNESS_META, ...m?.thickness, ...filter.quickMeta?.thickness },
  }
}
