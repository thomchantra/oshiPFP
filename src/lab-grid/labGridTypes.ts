import type { LabMode, LabParams } from '../lab/labPipeline'

// The 7 named, shipped algorithms this lab targets — matches the mapping in
// src/lineArtDefaults.ts / AlgoGalleryModal.tsx (the source of truth for
// which path id is which character). Excludes 'original', 'v1-reference',
// 'pathA', and 'pathE' — older/experimental LabMode-only paths with no
// character name, not part of the shipped 7-algorithm lineup. Production
// Botan is pathB (JFA distance-transform); pathA is a discarded continuous-
// erosion experiment with no threshold input at all — see
// changelog/oshipfp-v0.5-instagram-mode-saga.md for why this distinction
// matters. pathE is the parked CPU vectorize+offset path, easy to confuse
// with pathF/Fumiko (real Sobel edge detection) since both sound plausible
// as "the edge-finding one."
export type AlgoId = 'pathB' | 'pathC' | 'pathD' | 'pathF' | 'pathG' | 'pathH' | 'pathI'

export const ALGOS: { id: AlgoId; label: string }[] = [
  { id: 'pathB', label: 'Botan' },
  { id: 'pathC', label: 'Chie' },
  { id: 'pathD', label: 'Daiya' },
  { id: 'pathF', label: 'Fumiko' },
  { id: 'pathG', label: 'Gumi' },
  { id: 'pathH', label: 'Hinata' },
  { id: 'pathI', label: 'Tsukiko' },
]

export function algoLabel(id: AlgoId): string {
  return ALGOS.find((a) => a.id === id)?.label ?? id
}

export function toLabMode(id: AlgoId): LabMode {
  return id
}

export interface Tier1Knob {
  field: keyof LabParams
  label: string
  min: number
  max: number
  step: number
}

// Tier-1 core knobs per algorithm — grounded directly in which LabParams
// fields each mode's render() branch actually reads (src/lab/labPipeline.ts),
// not the aspirational doc list. pathB/Botan's JFA distance-transform reads
// both threshold and radius (uThreshold on the mask pass, uRadius on the
// distance-to-edge pass) — ranges match production's real slider bounds
// (LineArtPanel.tsx's pathB block: Threshold 0-1, Radius 0-20px);
// pathD/Daiya's octagon-grow never touches `feather`; pathF/Fumiko's Sobel
// edge detection has no threshold either — its core knob is `sensitivity`
// (findEdges.frag.ts's uSensitivity acts as an inverse magnitude threshold,
// 1/uSensitivity).
export const TIER1_KNOBS: Record<AlgoId, Tier1Knob[]> = {
  pathB: [
    { field: 'threshold', label: 'Threshold', min: 0, max: 1, step: 0.01 },
    { field: 'radius', label: 'Radius', min: 0, max: 20, step: 1 },
  ],
  pathC: [
    { field: 'radius', label: 'Radius', min: 0.5, max: 8, step: 0.1 },
    { field: 'gateThreshold', label: 'Gate threshold', min: 0, max: 0.5, step: 0.01 },
    { field: 'feather', label: 'Feather', min: 0, max: 2, step: 0.05 },
  ],
  pathD: [
    { field: 'threshold', label: 'Threshold', min: 0, max: 1, step: 0.01 },
    { field: 'radius', label: 'Radius', min: 0.5, max: 40, step: 0.5 },
  ],
  pathF: [
    { field: 'sensitivity', label: 'Sensitivity', min: 0.1, max: 30, step: 0.1 },
    // Dilated via continuous per-channel erosion (same as Botan), working
    // range 0-3 texels per labPipeline.ts's own comment on this branch.
    { field: 'radius', label: 'Radius', min: 0, max: 3, step: 0.05 },
  ],
  pathG: [
    { field: 'rampFloor', label: 'Ramp floor', min: 0, max: 1, step: 0.01 },
    { field: 'rampInnerLow', label: 'Ramp inner low', min: 0, max: 1, step: 0.01 },
    { field: 'rampInnerHigh', label: 'Ramp inner high', min: 0, max: 1, step: 0.01 },
    { field: 'rampCeiling', label: 'Ramp ceiling', min: 0, max: 1, step: 0.01 },
    { field: 'threshold', label: 'Threshold (fallback)', min: 0, max: 1, step: 0.01 },
    { field: 'radius', label: 'Radius', min: 0.5, max: 40, step: 0.5 },
    { field: 'blobMaxDt', label: 'Blob max distance', min: 0, max: 40, step: 0.5 },
    // Must be set explicitly — a shared-program uniform that defaults to 0
    // (full-reject everywhere, see intensityScaling.ts's comment) if left
    // unset. See labPipeline.ts's gumiBlobGamma field doc comment.
    { field: 'gumiBlobGamma', label: 'Blob falloff gamma', min: 0.1, max: 4, step: 0.05 },
  ],
  pathH: [
    { field: 'radius', label: 'Blur radius', min: 0.5, max: 8, step: 0.1 },
    { field: 'highPassStrength', label: 'High pass strength', min: 0.2, max: 3, step: 0.1 },
    { field: 'threshold', label: 'Threshold', min: 0, max: 1, step: 0.01 },
  ],
  pathI: [
    { field: 'laplacianStrength', label: 'Laplacian strength', min: 0.5, max: 10, step: 0.1 },
    { field: 'laplacianPreBlur', label: 'Pre-blur', min: 0, max: 2, step: 0.1 },
    { field: 'laplacianGrow', label: 'Grow', min: 0, max: 8, step: 0.1 },
  ],
}

// Full flat LabParams default — every field the interface declares, at the
// same defaults LabApp.tsx's own useState initializers use. Tier-1 fields
// (above) get overridden per-image-per-algo baseline; everything else
// (color grading, denoise, Gumi extras, etc.) stays fixed since this lab is
// deliberately scoped to Tier-1 knobs only.
export const DEFAULT_LAB_PARAMS: LabParams = {
  threshold: 0.5,
  radius: 1.5,
  feather: 0.5,
  gateThreshold: 0.15,
  sensitivity: 8,
  colorExpansion: false,
  gamma: 1,
  colorContrast: 1,
  saturation: 1,
  opacity: 1,
  exposure: 0,
  contrast: 1,
  blackClip: 0,
  whiteClip: 1,
  tintColor: [0, 0, 0],
  vividMode: false,
  tintEnabled: false,
  vividDeadzone: 0.15,
  vividBoost: 1.8,
  denoiseEnabled: false,
  denoiseIntensity: 0.4,
  denoiseThreshold: 0.15,
  rampEnabled: false,
  rampFloor: 0,
  rampInnerLow: 0.3,
  rampInnerHigh: 0.7,
  rampCeiling: 1,
  rampFeather: 0,
  gumiContrastBoost: 1,
  blobMaxDt: 8,
  gumiBlobGamma: 1,
  gumiColorBleed: false,
  gumiBleedFeather: 1.5,
  gumiSoftDetection: false,
  gumiSoftness: 0.1,
  gumiFillMode: false,
  gumiGradientMap: false,
  gumiGradientShadow: [0, 0, 0],
  gumiGradientMid: [0.5, 0.5, 0.5],
  gumiGradientHighlight: [1, 1, 1],
  thresholdEnabled: false,
  highPassStrength: 1,
  laplacianStrength: 1,
  laplacianPreBlur: 0,
  laplacianSharpenAmount: 0,
  laplacianGrow: 0,
  hiToneTarget: 'off',
  hiToneGain: 1,
  hiToneContrast: 1,
  highPassResponsiveColor: false,
  responsiveCrossover: 0.5,
  responsiveGrow: 0,
  responsiveGrowBias: 0,
  compositeBlendMode: 1,
}

export const INTENSITY_PRESETS = [0.5, 1.0, 1.5, 2.0] as const
export type Intensity = (typeof INTENSITY_PRESETS)[number]

export type TagValue = 'good' | 'bad' | 'maybe' | 'na'

export interface TagRecord {
  imageId: string
  algo: AlgoId
  intensity: Intensity
  tag: TagValue
  // Free-text note, e.g. "too thick" / "too thin" — most useful on
  // bad/maybe but not restricted to them, in case a specific good result
  // is still worth annotating (e.g. "good but only at this exact radius").
  remark?: string
  timestamp: number
}

// The knob(s) per algorithm that most directly act as its detection
// "sensitivity"/threshold — driving the absolute-value sweep (as opposed to
// the intensity-multiplier sweep above), which tests raw parameter values
// against image content independent of any manually-tuned baseline. Usually
// one field; Hinata co-varies `highPassStrength` with `radius` (blur) since
// the sweep needs both moving together to read clearly. Not always
// literally named "threshold": Botan has none at all (radius is its only
// magnitude knob), Chie sweeps `radius` rather than the fine-tune-only
// `gateThreshold`, and Hinata's own `threshold` field is inert unless
// `thresholdEnabled` is set (default false, see DEFAULT_LAB_PARAMS).
// Only the number-valued LabParams fields can be knob-swept (Tier1Knob's
// min/max/step are numeric ranges) — narrowing to this subset, rather than
// the full `keyof LabParams`, lets a Partial<Record<NumericLabParamKey,
// number>> spread safely into a full LabParams without TypeScript worrying
// about a boolean/string/tuple field (colorExpansion, tintColor, etc.)
// getting a stray number assigned.
export type NumericLabParamKey = { [K in keyof LabParams]: LabParams[K] extends number ? K : never }[keyof LabParams]

export const PRIMARY_KNOB_FIELDS: Record<AlgoId, NumericLabParamKey[]> = {
  pathB: ['threshold'],
  pathC: ['radius'],
  pathD: ['threshold'],
  pathF: ['sensitivity'],
  // Gumi always runs its own plateau ramp regardless of rampEnabled (see
  // labPipeline.ts's pathG branch), so rampInnerHigh is live under default
  // settings; radius/blobMaxDt also affect detected line size/appearance,
  // same category as the ramp band. rampFloor/rampInnerLow held fixed at 0
  // (forced in useValueGridRender.ts, not swept).
  pathG: ['rampInnerHigh', 'radius', 'blobMaxDt'],
  pathH: ['highPassStrength', 'radius'],
  pathI: ['laplacianStrength'],
}

export interface PrimaryKnobSweep {
  field: NumericLabParamKey
  label: string
  values: number[]
}

export const VALUE_GRID_SIZE = 5

// Per-(algo, field) override of the sweep's own min/max, distinct from
// TIER1_KNOBS' min/max (which stay the wide manual-slider bounds — a user
// hand-tuning a baseline should still be able to drag a slider to an
// extreme). Only needed where the full slider range produces a degenerate
// sweep — see changelog/oshipfp-v0.5-instagram-mode-saga.md for the
// Gumi radius/blobMaxDt double-collapse this was added to fix.
const SWEEP_RANGE_OVERRIDES: Partial<Record<AlgoId, Partial<Record<NumericLabParamKey, { min: number; max: number }>>>> = {
  pathG: {
    radius: { min: 0.5, max: 4 },
    blobMaxDt: { min: 2, max: 20 },
  },
}

// One sweep per field in PRIMARY_KNOB_FIELDS[algo], each with its own 5
// values evenly spaced across that field's own working range (TIER1_KNOBS'
// min/max, unless SWEEP_RANGE_OVERRIDES narrows it), endpoints included
// (min, +25%, mid, +75%, max). Multiple fields for one algo are co-varied
// by step index (step i uses each field's i-th value together), not
// combined combinatorially — keeps the grid to VALUE_GRID_SIZE columns
// regardless of how many fields an algo sweeps. Not aligned across
// algorithms (each has its own min/max), so grid columns are addressed by
// step index, not by value.
export function primaryKnobSweeps(algo: AlgoId): PrimaryKnobSweep[] {
  return PRIMARY_KNOB_FIELDS[algo].map((field) => {
    const knob = TIER1_KNOBS[algo].find((k) => k.field === field)
    if (!knob) throw new Error(`primaryKnobSweeps: ${field} missing from TIER1_KNOBS[${algo}]`)
    const override = SWEEP_RANGE_OVERRIDES[algo]?.[field]
    const { min, max, label } = override ? { ...knob, ...override } : knob
    const values = Array.from({ length: VALUE_GRID_SIZE }, (_, i) => min + ((max - min) * i) / (VALUE_GRID_SIZE - 1))
    return { field, label, values }
  })
}

export interface ValueTagRecord {
  imageId: string
  algo: AlgoId
  stepIndex: number
  // One entry per swept field at this step — e.g. Hinata's step 2 might be
  // { highPassStrength: 0.9, radius: 2.4 }.
  values: Partial<Record<NumericLabParamKey, number>>
  tag: TagValue
  remark?: string
  timestamp: number
}
