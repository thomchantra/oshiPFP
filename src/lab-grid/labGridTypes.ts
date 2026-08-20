import type { LabMode, LabParams } from '../lab/labPipeline'

// The 7 named, shipped algorithms this lab targets — matches the mapping in
// src/lineArtDefaults.ts / AlgoGalleryModal.tsx (the source of truth for
// which path id is which character). Excludes 'original', 'v1-reference',
// and 'pathB'/'pathE', which are older/experimental LabMode-only paths with
// no character name and aren't part of the shipped 7-algorithm lineup —
// pathE in particular is the parked CPU vectorize+offset path, easy to
// confuse with pathF/Fumiko (real Sobel edge detection) since both sound
// plausible as "the edge-finding one."
export type AlgoId = 'pathA' | 'pathC' | 'pathD' | 'pathF' | 'pathG' | 'pathH' | 'pathI'

export const ALGOS: { id: AlgoId; label: string }[] = [
  { id: 'pathA', label: 'Botan' },
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
// not the aspirational doc list. E.g. pathA/Botan's continuous-RGB erosion
// has no threshold or feather input at all; pathD/Daiya's octagon-grow
// never touches `feather`; pathF/Fumiko's Sobel edge detection has no
// threshold either — its core knob is `sensitivity` (findEdges.frag.ts's
// uSensitivity acts as an inverse magnitude threshold, 1/uSensitivity).
export const TIER1_KNOBS: Record<AlgoId, Tier1Knob[]> = {
  pathA: [{ field: 'radius', label: 'Radius', min: 0.5, max: 8, step: 0.1 }],
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
