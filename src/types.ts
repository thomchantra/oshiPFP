export type PipelineStage = 'crop' | 'color' | 'lineart'

export interface CropTransform {
  scale: number
  offsetX: number
  offsetY: number
}

export type CropMode = 'original' | 'square'

export interface CurvePoint {
  x: number
  y: number
}

/** Color tab's 3 sub-panels (docs/oshiPFP-v0.2.1-UIspecs.md's Color Tab section). */
export type ColorSubTab = 'light' | 'color' | 'hsl'

/** Light sub-tab — basic tonal correction, all -1..1 except exposure (-3..3 EV stops) and contrast (-0.8..2, same pivot-multiplier convention as ToneShapingParams). Runs first in the color pipeline, before Invert/Curve/HSL — a photo's basic exposure/contrast correction is meant to apply to the source, not to a creative grade already layered on top. 0 = identity for every field. */
export interface LightParams {
  exposure: number
  contrast: number
  brilliance: number
  whites: number
  highlights: number
  shadows: number
  blacks: number
}

/** Color sub-tab's basic-correction trio (Temperature/Tint white balance + Vibrance smart-saturation) — distinct from the Color sub-tab's Invert Colors and the HSL sub-tab's targeted/master grading. All -1..1, 0 = identity. Runs in the same early pipeline stage as LightParams (see lightColorCorrect.frag.ts). */
export interface ColorAdjustParams {
  temperature: number
  tint: number
  vibrance: number
}

/** One H/S/L shift — used both for the global "master" adjustment and, independently, for each of the 8 targeted hue bands below. Hue in degrees (-180..180); saturation/lightness -1..1. 0/0/0 = identity. */
export interface HslShift {
  hue: number
  saturation: number
  lightness: number
}

/** 'master' applies globally (the old simple HSL panel); the other 8 are the same HSL-module palette as ColorLiftParams, each independently hue/sat/lightness-shiftable — a real (if first-pass) port of the targeted HSL kernel from referencecode/Shaders2.metal, see curvesHsl.frag.ts. */
export type HslBand = 'master' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'magenta'

export type HslByBand = Record<HslBand, HslShift>

/** Color tab's "Invert Colors" toggle. `rgb` is a full negative; r/g/b are independent per-channel inverts — see ColorPanel.tsx for the UI's collapse-to-rgb-when-all-3-are-on and mutual-exclusivity rules. */
export interface InvertParams {
  rgb: boolean
  r: boolean
  g: boolean
  b: boolean
}

/** How each algorithm's resolved "ink" color composites onto the base image — shared across all 4 modes (see composite.frag.ts's blendLayer). */
export type BlendMode = 'multiply' | 'screen' | 'overlay'

/** Botan/Chie/Daiya/Fumiko, kept as their internal pathB/C/D/F ids (ported straight from the lab harness) — display names are cosmetic only. Botan is the default from first load; the expensive recompute itself is gated by Pipeline.setLineArtActive (tab-based), not by mode. */
export type LineArtMode = 'pathB' | 'pathC' | 'pathD' | 'pathF'

/** What the Line Art tab's viewport (and downstream Color/Export) actually reads: the algorithm's raw mask/color output, the multiply/crossfade composite onto the base, or a bypass back to the uncropped base. */
export type LineArtDisplayMode = 'composite' | 'overlay' | 'original'

/** Daiya is tint-or-vivid only (always recolors); Fumiko can also stay in its native colored-edge look. */
export type ColorMode = 'findEdge' | 'tint' | 'vivid'

export interface ToneShapingParams {
  /** UI convention: 0 = identity for every field (including contrast — mapped to the shader's 1=identity multiplier internally). */
  exposure: number
  contrast: number
  blackClip: number
  whiteClip: number
}

export interface DenoiseParams {
  intensity: number
  threshold: number
}

/** Line Art pre-processing "Color Lift" — see colorLift.frag.ts. One lightness/brightness lift value per HSL-module swatch (order matches BAND_HUES there), -1..1, 0 = identity. */
export interface ColorLiftParams {
  red: number
  orange: number
  yellow: number
  green: number
  teal: number
  blue: number
  purple: number
  magenta: number
}

/** Crop-tab preprocessing, applied right after crop and before Color/Line Art — unlike LineArtParams.denoise (which only feeds that algorithm's internal edge detection), this visibly affects the whole downstream image, including the final export. */
export interface EnhanceParams {
  smooth: number
  sharpen: number
}

/** Flat param bag mirroring src/lab/labPipeline.ts's LabParams — only the fields relevant to the active `mode` are actually read by the pipeline. */
export interface LineArtParams {
  mode: LineArtMode
  displayMode: LineArtDisplayMode
  /** Always applied — identity default values make each a no-op when untouched, so pre-processing no longer needs a boolean gate (see changelog: expand/collapse used to double as an on/off switch, now it's tray-appearance-only). */
  toneShaping: ToneShapingParams
  denoise: DenoiseParams
  colorLift: ColorLiftParams

  opacity: number
  blendMode: BlendMode
  threshold: number
  radius: number
  hardness: number
  blobContrast: number
  colorExpansion: boolean
  colorContrast: number
  gateThreshold: number
  sensitivity: number
  saturation: number
  colorMode: ColorMode
  tintColor: [number, number, number]
  vividDeadzone: number
  vividBoost: number
}

export type ResampleMode = 'lanczos3' | 'bilinear' | 'nearest'

/** 'jpegHd'/'jpegTiny' differ only in JPEG quality (see exportPica.ts's JPEG_QUALITY) — same encoder, same resize pipeline. */
export type ExportFormat = 'png' | 'jpegHd' | 'jpegTiny'

/** Resolution presets: 'original' = crop's native pixel size (no resize), a number = target longest-side px (aspect-preserving), 'custom' = explicit width x height from the Export tab's own fields. */
export type ResolutionMode = 'original' | 150 | 256 | 'custom'

export interface TabDef {
  id: string
  label: string
  icon: import('./components/Icon').IconName
}
