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
export type BlendMode = 'overwrite' | 'multiply' | 'screen' | 'overlay'

/** Botan/Chie/Daiya/Fumiko/Gumi/Hinata/Inori, kept as their internal pathB/C/D/F/G/H/I ids (ported straight from the lab harness) — display names are cosmetic only. Botan is the default from first load; the expensive recompute itself is gated by Pipeline.setLineArtActive (tab-based), not by mode. */
export type LineArtMode = 'pathB' | 'pathC' | 'pathD' | 'pathF' | 'pathG' | 'pathH' | 'pathI'

/** What the Line Art tab's viewport (and downstream Color/Export) actually reads: the algorithm's raw mask/color output, the multiply/crossfade composite onto the base, or a bypass back to the uncropped base. */
export type LineArtDisplayMode = 'composite' | 'overlay' | 'original'

/** Export tab's own explicit Original/Composite/Overlay selector (Export panel's top "Export"
 * group) — same 3 names as LineArtDisplayMode but a *different* meaning for 'original': this one
 * bypasses Enhancement/Line Art/Color entirely and exports the Crop module's own finished output
 * (crop rect + Resize) directly, not LineArtDisplayMode's 'original' (which is post-Enhancement).
 * See pipeline.ts's readExportPixels. Independent of whatever the live preview/Dual Pane is
 * currently showing. */
export type ExportDisplayMode = 'original' | 'composite' | 'overlay'

/** Desktop-only Dual Pane toggle (oshiPFP v0.3 Workstream C) — replaces the single DISPLAY_MODE_OPTIONS
 * segmented control with a 3-way pane-PAIR selector when active. Each option names the two
 * LineArtDisplayMode variants shown side-by-side (left|right) — see pipeline.ts's setDualPane,
 * which takes the resolved [LineArtDisplayMode, LineArtDisplayMode] tuple directly rather than this
 * string union (App.tsx maps between the two). */
export type DualPaneMode = 'original-composite' | 'composite-overlay' | 'original-overlay'

/** Daiya is tint-or-vivid only (always recolors); Fumiko can also stay in its native colored-edge look. */
export type ColorMode = 'findEdge' | 'tint' | 'vivid'

/** Standard 2-point black/white clip — the original Tone Lift ramp, still the default mode. */
export interface ClipModeParams {
  blackClip: number
  whiteClip: number
}

/** Plateau/pinch 4-point luminance-band isolation — see plateauRamp.frag.ts. `position` is the
 * band center (0..1), `expand` is the band's total width (spacing between the two inner ramp
 * points), `feathering` (0..1) controls how much of the floor->inner (and inner->ceiling) span
 * the fade actually uses. Floor/ceiling are fixed at 0/1 (see pipeline.ts's pinch-mode wiring). */
export interface PinchModeParams {
  position: number
  expand: number
  feathering: number
}

export interface ToneShapingParams {
  /** UI convention: 0 = identity for every field (including contrast — mapped to the shader's 1=identity multiplier internally). */
  exposure: number
  contrast: number
  /** Which ramp interpretation is active — see pipeline.ts's colorCorrect/plateauRamp branch. */
  mode: 'clip' | 'pinch'
  /** Both mode's values are retained across toggling (not just the active one) so users can A/B
   * compare clip vs. pinch on the same source adjustment without losing either — see
   * docs/oshiPFP-v0.3-spec.md's "Pinch Mode Toggle Behavior". */
  clipMode: ClipModeParams
  pinchMode: PinchModeParams
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

/** Crop tab's Resize module — 'original' = crop's native pixel size (no resample), 'custom' = explicit width x height. Unlike Export's ResolutionMode, this actually changes the working pipeline resolution feeding Color/Line Art/Export, not just an export-time hint — see pipeline.ts's resizeTarget stage. Deliberately narrower than ResolutionMode (no 150/256 presets) per the Resize module's "facsimile of Export's core functionality" scope. */
export type ResizeMode = 'original' | 'custom'

export interface ResizeParams {
  mode: ResizeMode
  customSize: { width: number; height: number }
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
  /** Botan/Chie: piecewise-linear feather macro (see pipeline.ts's hardnessToFeather). Gumi (v0.3 tuning) reuses this same field with its own, unrelated meaning — see pipeline.ts's runGumiLinePostProcess: 1 (default) = untouched, 0 = final Line-mode mask box-blurred and mixed in at full strength (a soft/antialiased edge instead of a hard one). Each mode interprets its own shared fields independently, same convention `radius` etc. already follow. */
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

  // Path G (Gumi) — see src/lab/labPipeline.ts's pathG branch for the full
  // rationale of each. Reuses `threshold`/`radius`/`blobContrast`/
  // `colorContrast`/`colorExpansion`/`tintColor` above where the concept is
  // identical to Botan's (contrast boost reuses colorCorrect's pivot-
  // contrast curve; blob-DT reject vs. color-bleed both build on Botan's
  // own distance-to-edge machinery).
  gumiContrastBoost: number
  blobMaxDt: number
  /** "Overdrive" (v0.3 tuning) — line-thickening independent of blobMaxDt: a true morphological dilate (min-filter grow) on the final Line-mode mask, an optical (not algorithmic) post-process that doesn't touch blob suppression's own sizing. Rounded to an int px radius. 0 = off. An earlier box-blur-then-rethreshold version had a real ceiling for thin strokes (erased instead of growing past a certain radius) — see pipeline.ts's runGumiLinePostProcess and changelog/oshipfp-v0.3-saga.md. */
  gumiOverdrive: number
  /** Line mode's own fill-type color, mirroring Fill mode's (see gumiFillType/gumiFillInvert/gumiFillSolidColor below) — reuses the same 3 options/logic (lineFillColor.frag.ts + fillTypeColor.frag.ts) applied to the finished Line-mode mask instead of the fill-region mask. Defaults to 'solid' + black so the default look matches what Line mode always rendered before this existed (plain dark strokes under Multiply), not a silent visual change. */
  gumiLineFillType: 'image' | 'solid' | 'gradient'
  gumiLineSolidColor: [number, number, number]
  /** Colors the background side instead of the detected strokes — see lineFillColor.frag.ts. */
  gumiLineInvert: boolean
  /** Prototype toggle (v0.3 tuning) — a real morphological closing (grow by a fixed small radius, then shrink back by the same amount) applied to the closed detection mask before blob/bleed/fill, meant to bridge small gaps at V/Y stroke intersections without permanently thickening straight runs (unlike just cranking `radius`, which grows everywhere). Boolean-only for now to validate whether it's worth promoting to a real radius param — see pipeline.ts's GUMI_GAP_CLOSING_RADIUS. */
  gumiGapClosing: boolean
  /** "Detection Contrast" (v0.3 tuning) — shared by blobMask.frag.ts and fillMask.frag.ts: reshapes their distance-to-edge boundary decision from a hard single-pixel cutoff into an antialiased, gamma-adjustable falloff (exact same `pow(t, gamma)` idea as distanceToEdge.frag.ts's own uGamma, just applied to blob/fill's boundary instead of bleed's). 1 = matches the old hard-cutoff behavior at the boundary; >1 sharper/more decisive edge, <1 softer. */
  gumiBlobGamma: number
  gumiColorBleed: boolean
  gumiBleedFeather: number
  /** Color Bleed's own bleed-distance radius (distanceToEdge.frag.ts's uRadius) — deliberately separate from blobMaxDt (v0.3 tuning): both used to share blobMaxDt directly, coupling "how thick strokes render" to "how far ink bleeds from a detected line," two different jobs on one knob. */
  gumiBleedRadius: number
  gumiSoftDetection: boolean
  gumiSoftness: number
  gumiFillMode: boolean
  /** Fill Layer's own blob-interior threshold (fillMask.frag.ts's uBlobMaxDt) — same decoupling rationale as gumiBleedRadius above. */
  gumiFillRadius: number
  /** Flips which side of the detected boundary Fill Layer targets — off (default) fills the deep interior of the closed *ink* region (e.g. large flat shadow blobs); on fills the deep interior of the *background* region instead (e.g. skin/highlight areas). Swaps both fillMask.frag.ts's isCandidate polarity and which side of the mask the JFA distance transform is seeded from (pipeline.ts) — the seed direction has to match which side "depth" is being measured into. */
  gumiFillInvert: boolean
  /** What color Fill Layer paints into its selected region — see fillMask.frag.ts's uFillType. 'image' (default) passes the original source color through unmodified; 'solid' uses gumiFillSolidColor; 'gradient' reuses the same 3-point luminance ramp as the standalone Gradient Map mode (gumiGradientShadow/Mid/Highlight below), gated to just the fill selection instead of painted across the whole image. */
  gumiFillType: 'image' | 'solid' | 'gradient'
  gumiFillSolidColor: [number, number, number]
  /** Bypasses the distance-transform/blobMaxDt margin entirely — a raw per-pixel isCandidate test, no falloff. Fill Radius (px) at 0 was already approximating this; this makes it an explicit, well-supported mode instead of an edge case of the radius slider, and skips the smoothing gamma falls back to a hard per-pixel decision regardless of gumiBlobGamma. */
  gumiFillPixelThreshold: boolean
  gumiGradientMap: boolean
  gumiGradientShadow: [number, number, number]
  gumiGradientMid: [number, number, number]
  gumiGradientHighlight: [number, number, number]
  /**
   * Gumi's own always-on 4-point plateau/feather luminance-band ramp (see
   * plateauRamp.frag.ts) — deliberately separate from ToneShapingParams'
   * pinch-mode fields (Workstream B, added independently): this ramp
   * operates on Gumi's own detection input as its "gradient map" stage 1,
   * not on the shared Tone Lift preprocessing every mode's detection
   * source passes through first.
   */
  gumiRampFloor: number
  gumiRampInnerLow: number
  gumiRampInnerHigh: number
  gumiRampCeiling: number
  gumiRampFeather: number

  // Path H (Hinata) / Path I (Inori) shared fields — see labPipeline.ts's
  // pathH/pathI branches. `threshold` above doubles as their optional
  // Output-treatment binarize cutoff; `radius` doubles as Hinata's blur
  // radius.
  thresholdEnabled: boolean
  hiToneTarget: 'off' | 'multiply' | 'screen'
  hiToneGain: number
  hiToneContrast: number
  // Path H only.
  highPassStrength: number
  highPassResponsiveColor: boolean
  responsiveCrossover: number
  responsiveGrow: number
  responsiveGrowBias: number
  // Path I only.
  laplacianStrength: number
  laplacianPreBlur: number
  laplacianSharpenAmount: number
  laplacianGrow: number
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
