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

export interface HslParams {
  hue: number
  saturation: number
  lightness: number
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

/** Crop-tab preprocessing, applied right after crop and before Color/Line Art — unlike LineArtParams.denoise (which only feeds that algorithm's internal edge detection), this visibly affects the whole downstream image, including the final export. */
export interface EnhanceParams {
  smooth: number
  sharpen: number
}

/** Flat param bag mirroring src/lab/labPipeline.ts's LabParams — only the fields relevant to the active `mode` are actually read by the pipeline. */
export interface LineArtParams {
  mode: LineArtMode
  displayMode: LineArtDisplayMode
  toneShapingEnabled: boolean
  toneShaping: ToneShapingParams
  denoiseEnabled: boolean
  denoise: DenoiseParams

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

export interface ExportParams {
  targetSize: number
  resampleMode: ResampleMode
}

export interface TabDef {
  id: string
  label: string
  icon: import('./components/Icon').IconName
}
