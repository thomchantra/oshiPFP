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

/** Line Art tab's 3 sub-panels — Tuning (denoise/tone lift/color lift), LineArt (algo selector +
 * per-algorithm params), Blending (Compositor group: Pre-Blend Correction + Blend Mode + Opacity).
 * The algo selector itself stays visible above this subtab bar regardless of which is active, since
 * switching algorithms is a cross-cutting concern relevant in all 3. */
export type LineArtSubTab = 'tuning' | 'lineart' | 'blending'

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

/** 'master' applies globally; the other 8 are the same HSL-module palette as ColorLiftParams, each independently hue/sat/lightness-shiftable — see curvesHsl.frag.ts. */
export type HslBand = 'master' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'magenta'

export type HslByBand = Record<HslBand, HslShift>

/** Color tab's "Invert Colors" toggle. `rgb` is a full negative; r/g/b are independent per-channel inverts — see ColorPanel.tsx for the UI's collapse-to-rgb-when-all-3-are-on and mutual-exclusivity rules. */
export interface InvertParams {
  rgb: boolean
  r: boolean
  g: boolean
  b: boolean
}

/** How each algorithm's resolved "ink" color composites onto the base image — see
 * composite.frag.ts's blendLayer. 'normal' is a full, alpha-ignoring pass of the algorithm's own
 * output — unlike 'overwrite', which still lets the base show through wherever the mask's own
 * alpha is partial/zero. 'difference' is a standard abs(base-layer) blend. 12 modes total, grouped
 * into 4 UI categories (GradientFillControls.tsx's BLEND_CATEGORIES) by composite behavior:
 * Comp (overwrite/normal/difference), Light (screen/add/dodge), Dark (darken/multiply/burn), Punch
 * (softLight/overlay/hardLight) — each non-Comp trio ordered least→most intense. Line Art's own
 * main compositing selector offers all 12; Grade tab's Gradient Map blend selector only offers the
 * original 4 (overwrite/multiply/screen/overlay), see ColorPanel.tsx's own ALL_BLEND_OPTIONS. */
export type BlendMode =
  | 'overwrite' | 'multiply' | 'screen' | 'overlay' | 'normal' | 'difference'
  | 'add' | 'dodge' | 'darken' | 'burn' | 'softLight' | 'hardLight'

/** Grade tab's Gradient Map processor — a general post-grade 3-stop (or 2-stop, with Duo Tone)
 * color remap applied to the whole graded image, distinct from Line Art's per-algorithm Gradient
 * Fill Type (a mask/shape-scoped insertion point, see fillTypeColor.frag.ts). Shares its shader
 * math (gradientMap.frag.ts) and ramp editor UI (GradientFillControls.tsx) with that Line Art
 * feature, but is entirely separate state — see pipeline.ts's runColorChain for how
 * `intensity`/`blendMode` composite the mapped result back over the pre-gradient-map graded color
 * via the existing compositeProgram. */
export interface GradeGradientMapParams {
  enabled: boolean
  shadow: [number, number, number]
  mid: [number, number, number]
  highlight: [number, number, number]
  pivot: number
  duoTone: boolean
  intensity: number
  blendMode: BlendMode
}

/** Botan/Chie/Daiya/Fumiko/Gumi/Hinata/Inori, kept as their internal pathB/C/D/F/G/H/I ids —
 * display names are cosmetic only. Botan is the default from first load; the expensive recompute
 * itself is gated by Pipeline.setLineArtActive (tab-based), not by mode. */
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

/** Desktop-only Dual Pane toggle — replaces the single DISPLAY_MODE_OPTIONS segmented control with
 * a 3-way pane-PAIR selector when active. Each option names the two LineArtDisplayMode variants
 * shown side-by-side (left|right) — see pipeline.ts's setDualPane, which takes the resolved
 * [LineArtDisplayMode, LineArtDisplayMode] tuple directly rather than this string union (App.tsx
 * maps between the two). */
export type DualPaneMode = 'original-composite' | 'composite-overlay' | 'original-overlay'

/** 'image'/'solid'/'gradient' fill-type selector shared by Botan/Chie/Daiya/Fumiko (and Gumi's own
 * gumiFillType/gumiLineFillType, kept separate since Gumi alone needs two simultaneous fill
 * contexts) — see fillTypeColor.frag.ts. */
export type FillType = 'image' | 'solid' | 'gradient'

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
  /** Always applied — identity default values make each a no-op when untouched, so the tray's expand/collapse is appearance-only, not an on/off gate. */
  toneShaping: ToneShapingParams
  denoise: DenoiseParams
  colorLift: ColorLiftParams

  opacity: number
  blendMode: BlendMode
  /** Bypasses blendMode/opacity compositing entirely, reusing the exact same
   * raw-alpha-flattened-onto-matteColor computation the "Overlay" viewport display mode already
   * produces (see pipeline.ts's resolveLineArtDisplay), but for the *Composite* display mode —
   * meaning it flows downstream through Color grading and Export like Composite normally does,
   * unlike switching the top-level display mode to Overlay itself would (a separate,
   * preview-only toggle). LineArtPanel.tsx hides the Blend Mode row and Overlay Opacity slider
   * while this is on, since neither has any effect once compositing is bypassed. */
  overlayPassthrough: boolean
  /** Backdrop color for the raw alpha-flatten both Overlay display mode and overlayPassthrough
   * use (alphaOverWhite.frag.ts) — defaults to white. Only actually applied while overlayPassthrough
   * is on; pipeline.ts's resolveLineArtDisplay falls back to white for the Overlay-preview-only
   * case (overlayPassthrough off) so a stale/hidden custom color set earlier doesn't leak into a
   * plain preview peek. */
  matteColor: [number, number, number]
  /** Pre-Blend Correction ("Color Correct") — a single gated toggle (also the section's own
   * expand/collapse state, no separate flag) exposing Exposure/Contrast/Saturation/Invert Matte,
   * applied to the resolved ink layer right before it composites onto the base — see
   * pipeline.ts's inkCorrect pass. All identity/off at defaults. */
  colorCorrectEnabled: boolean
  colorCorrectExposure: number
  colorCorrectContrast: number
  colorCorrectSaturation: number
  colorCorrectInvertMatte: boolean
  threshold: number
  radius: number
  /** Botan/Chie: piecewise-linear feather macro (see pipeline.ts's hardnessToFeather). Gumi
   * reuses this same field with its own, unrelated meaning — see pipeline.ts's
   * runGumiLinePostProcess: 1 (default) = untouched, 0 = final Line-mode mask box-blurred and
   * mixed in at full strength (a soft/antialiased edge instead of a hard one). Each mode
   * interprets its own shared fields independently, same convention `radius` etc. already
   * follow. */
  hardness: number
  blobContrast: number
  /** Daiya's 2-mode op selector. `false` = JFA (shared distance-transform math with Botan;
   * float-precision Radius, the one thing Octagon can never match). `true` = Octagon (a
   * 4-direction separable min-filter dilate with its own Radius/Hardness/Facets/Rotation/
   * One-Sided). Threshold, Soft Threshold, and Invert Seed apply to both modes identically (same
   * shared `thresholdProgram`/`softThresholdProgram` calls either way) and sit above this selector
   * in the UI rather than being duplicated per-mode. See pipeline.ts's pathD branch doc comment. */
  daiyaOctagonMode: boolean
  /** Octagon's own independent Radius/Hardness — deliberately separate fields from the shared
   * `radius`/`hardness` above (which JFA keeps using unchanged) rather than reusing them, so
   * switching between the two op-mode tabs doesn't make them fight over one value.
   * `daiyaOctagonRadius` is a plain integer texel count (a literal step=1 UI slider, not run
   * through any float-to-int correction) — JFA's Radius stays the only float-precision one, the
   * one permanent, unfixable advantage it has over Octagon. `daiyaOctagonHardness` maps to
   * `runSoftHardness` (box-blur post-process), not JFA Hardness's `uFeather` smoothstep falloff —
   * same slider shape/range, genuinely different math, hence a genuinely separate value. */
  daiyaOctagonRadius: number
  daiyaOctagonHardness: number
  /** Octagon's own facet-count/rotation controls — only read while `daiyaOctagonMode` is on.
   * `daiyaOctagonDirections` sets the pass count (each direction is bidirectional in
   * minFilter1D.frag.ts by default, so N directions produce a 2N-sided facet shape — 4 gives the
   * 8-sided "octagon"); 3 is the minimum that still produces a real polygon under the default
   * bidirectional shape, 1 once `daiyaOctagonOneSided` is on. `daiyaOctagonRotation` (degrees,
   * 0-360) offsets where the first facet points — a real, visible control once One-Sided breaks
   * point-symmetry (see below); barely perceptible under the default bidirectional shape, which
   * stays point-symmetric no matter the rotation. The full 360° range (not just 180°) matters once
   * One-Sided is on with more than 1 direction: a one-sided N-gon's directions are generated
   * across a full turn, not a half-turn, so every unique orientation needs the full range to reach
   * it (see pipeline.ts's pathD branch). */
  daiyaOctagonDirections: number
  daiyaOctagonRotation: number
  /** One-sided growth — minFilter1D.frag.ts normally samples both `+offset` and `-offset` per
   * direction (symmetric growth, the reason more directions only ever approaches a rounder
   * circle, never a spike). This flips each direction pass to sample only `+offset`, so N
   * directions produce a genuine N-sided polygon instead of a 2N-sided one — at low N (1-3) that's
   * an actual spike/wedge/triangle instead of a symmetric diamond/hexagon, and
   * `daiyaOctagonRotation` above becomes meaningful. Uses the shared `minFilterProgram`'s
   * `uOneSided` uniform — every other call site must explicitly set it to 0. */
  daiyaOctagonOneSided: boolean
  /** Flips Daiya's hard-threshold seed mask's own polarity (thresholdProgram's uInvert) — shared
   * by *both* growth modes (same threshold pass either way, nothing octagon-specific about it),
   * independent of `fillInvert`'s own unrelated "which side gets the fill color" job at the very
   * final compositing step. Tests whether growing from the opposite tonal side reads as shading
   * rather than line-tracing. */
  daiyaInvertSeed: boolean
  /** Multiplies a second, independently-computed soft/antialiased threshold weight (same
   * smoothstep-based technique as Hinata Erode's own softThresholdProgram) into the grown mask's
   * alpha, regardless of which of the two growth modes produced it — JFA needs a strictly binary
   * seed mask so this can't soften the seeding itself, only the final result. 0 = off/hard
   * threshold (identity, matches every existing preset), >0 = softness half-width, same units
   * `uThreshold` itself uses (0-1 luminance space). */
  daiyaSoftThresholdWidth: number
  /** Boosts the soft threshold's own weight before it's multiplied in (`alphaModulate.frag.ts`'s
   * `uMaskGain`) — a plain `clamp(mask * gain, 0, 1)`. The raw smoothstep output reads as
   * faint/washed-out at any real softness width (most of the transition band sits well under full
   * alpha), so this pushes it back toward solid while keeping the softened edge itself. No-op at
   * 1 and only ever read while `daiyaSoftThresholdWidth > 0` — irrelevant otherwise, since a hard
   * threshold has no "weak" midband to boost. */
  daiyaSoftThresholdOverdrive: number
  /** Gumi's Color Bleed feature only — reuses distanceToEdge.frag.ts's own image-vs-flat-tint
   * branch independently of the shared `fillType` selector below. Botan does not read this field;
   * its own `fillType === 'image'` drives the same `uColorExpansion` uniform at its call site
   * instead (see pipeline.ts). */
  colorExpansion: boolean
  /** Botan's Image-subtab vivid slider — a contrast curve applied to the nearest-line source
   * color before it's used, only meaningful when `fillType === 'image'`. Also used by Gumi's
   * Color Bleed alongside `colorExpansion` above. */
  colorContrast: number
  /** Image-fill exposure in EV stops (pow(2, ev)), applied to the source color before
   * `colorContrast`. Only meaningful when `fillType === 'image'`; wired to the Simplified/Advanced
   * Image group for Botan/Chie (Daiya/Fumiko's vivid-boost image fill doesn't expose it). 0 = no-op. */
  colorExposure: number
  gateThreshold: number
  sensitivity: number
  saturation: number
  /** Fumiko-only — bypasses `fillType` entirely and shows the raw Sobel edge map's own
   * per-channel color, forced to Multiply blend. */
  findEdge: boolean
  tintColor: [number, number, number]
  vividDeadzone: number
  vividBoost: number

  /** Shared fill-type selector for Botan/Chie/Daiya/Fumiko. Flat/shared (not per-algo-prefixed)
   * since each of these four only has one fill context at a time, unlike Gumi's simultaneous
   * Line+Fill. See fillTypeColor.frag.ts for the shader-side contract. */
  fillType: FillType
  /** Colors the background side instead of the detected stroke/shape — see lineFillColor.frag.ts's
   * uInvert convention, reused here for all four algos. For Botan's continuous (non-binary) alpha
   * this flips the resolved alpha itself (1-alpha) rather than swapping a hard mask side. */
  fillInvert: boolean
  gradientShadow: [number, number, number]
  gradientMid: [number, number, number]
  gradientHighlight: [number, number, number]
  /** -1..1, default 0 — see fillTypeColor.frag.ts's resolveFillTypeColor doc comment for the
   * exact stop-remapping rule (negative compresses mid+highlight toward shadow, positive
   * compresses shadow+mid toward highlight). */
  gradientPivot: number
  /** Drops the mid stop, leaving a direct shadow->highlight 2-point ramp (Pivot still applies,
   * now only compressing whichever end it leans toward). */
  gradientDuoTone: boolean

  // Path G (Gumi) — see src/lab/labPipeline.ts's pathG branch for the full
  // rationale of each. Reuses `threshold`/`radius`/`blobContrast`/
  // `colorContrast`/`tintColor` above where the concept is
  // identical to Botan's (contrast boost reuses colorCorrect's pivot-
  // contrast curve; blob-DT reject vs. color-bleed both build on Botan's
  // own distance-to-edge machinery).
  gumiContrastBoost: number
  blobMaxDt: number
  /** "Overdrive" — line-thickening independent of blobMaxDt: a true morphological dilate
   * (min-filter grow) on the final Line-mode mask, an optical (not algorithmic) post-process that
   * doesn't touch blob suppression's own sizing. Rounded to an int px radius. 0 = off. See
   * pipeline.ts's runGumiLinePostProcess. */
  gumiOverdrive: number
  /** Line mode's own fill-type color, mirroring Fill mode's (see gumiFillType/gumiFillInvert/
   * gumiFillSolidColor below) — reuses the same 3 options/logic (lineFillColor.frag.ts +
   * fillTypeColor.frag.ts) applied to the finished Line-mode mask instead of the fill-region
   * mask. Defaults to 'solid' + black (plain dark strokes under Multiply). */
  gumiLineFillType: 'image' | 'solid' | 'gradient'
  gumiLineSolidColor: [number, number, number]
  /** Colors the background side instead of the detected strokes — see lineFillColor.frag.ts. */
  gumiLineInvert: boolean
  /** A morphological closing (grow by a fixed small radius, then shrink back by the same amount)
   * applied to the closed detection mask before blob/bleed/fill, meant to bridge small gaps at
   * V/Y stroke intersections without permanently thickening straight runs (unlike just cranking
   * `radius`, which grows everywhere). See pipeline.ts's GUMI_GAP_CLOSING_RADIUS. */
  gumiGapClosing: boolean
  /** Top-hat morphological cleanup prototype (see pipeline.ts's pathG branch and
   * topHatDifference.frag.ts) — an alternative to fine threshold/pinch-position tuning for a clean
   * detection: deliberately overshoot the threshold (letting shaded blobs bleed into the mask),
   * then erode the raw mask by gumiTopHatRadius and keep only where the pre/post-erosion masks
   * disagree. A stroke thinner than the erosion radius vanishes completely under erosion and
   * survives whole; a blob wider than that keeps an interior core that gets subtracted away,
   * leaving only its outline. Applied before the existing radius/overdrive/gap-closing/fill chain,
   * which is otherwise unchanged. */
  gumiTopHatMode: boolean
  gumiTopHatRadius: number
  /** "Detection Contrast" — shared by blobMask.frag.ts and fillMask.frag.ts: reshapes their
   * distance-to-edge boundary decision from a hard single-pixel cutoff into an antialiased,
   * gamma-adjustable falloff (exact same `pow(t, gamma)` idea as distanceToEdge.frag.ts's own
   * uGamma, just applied to blob/fill's boundary instead of bleed's). 1 = hard-cutoff behavior at
   * the boundary; >1 sharper/more decisive edge, <1 softer. */
  gumiBlobGamma: number
  gumiColorBleed: boolean
  gumiBleedFeather: number
  /** Color Bleed's own bleed-distance radius (distanceToEdge.frag.ts's uRadius) — deliberately
   * separate from blobMaxDt, so "how thick strokes render" and "how far ink bleeds from a
   * detected line" stay two independent knobs. */
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
   * Dual Line (see pipeline.ts's pathG branch) — runs two independent, simplified
   * luminance-band detectors (Black Line / White Line), each using the same Pinch Mode shape
   * ToneShapingParams' pinchMode already uses (position/expand/feathering, converted via
   * pinchToPlateau()). Each band gets its own full threshold->grow->JFA->blob->fill-color chain,
   * sharing every other Gumi Line-mode slider value (radius/blobMaxDt/gumiOverdrive/hardness/
   * etc), then the two results are merged via Porter-Duff "over" compositing.
   */
  gumiDualLine: boolean
  gumiDualBlack: PinchModeParams
  gumiDualWhite: PinchModeParams
  /** Per-band fill — Image/Solid only (no Gradient), same restricted-union
   * convention as edgeInkOverDarkFillType/edgeInkOverLightFillType below. */
  gumiDualBlackFillType: 'image' | 'solid'
  gumiDualBlackSolidColor: [number, number, number]
  gumiDualBlackInvert: boolean
  gumiDualWhiteFillType: 'image' | 'solid'
  gumiDualWhiteSolidColor: [number, number, number]
  gumiDualWhiteInvert: boolean
  /** Which band renders on top where the two overlap — exposed as a toggle
   * rather than a fixed choice since the "right" answer isn't obvious until
   * tested live on real art. */
  gumiDualWhiteOnTop: boolean

  /**
   * Color Contrast (Image fill) / Gradient Pivot (Gradient fill), one pair per Gumi fill context
   * (Line mode, Fill mode, and Dual Line's two bands). Independent per context rather than
   * reusing the shared top-level colorContrast/gradientPivot fields, since all 4 contexts can be
   * live at once and would otherwise fight over one value. Dual Line's two bands are Image/Solid
   * only (no Gradient), so no gumiDual*GradientPivot.
   */
  gumiLineColorContrast: number
  gumiLineGradientPivot: number
  gumiFillColorContrast: number
  gumiFillGradientPivot: number
  gumiDualBlackColorContrast: number
  gumiDualWhiteColorContrast: number

  // Path H (Hinata) / Path I (Inori) shared fields — see labPipeline.ts's
  // pathH/pathI branches. `threshold` above doubles as their optional
  // Output-treatment binarize cutoff; `radius` doubles as Hinata's blur
  // radius.
  thresholdEnabled: boolean
  hiToneTarget: 'off' | 'multiply' | 'screen'
  hiToneGain: number
  hiToneContrast: number
  /** Shared-tail field (like hiToneGain/hiToneContrast above): -1..1, 0 = identity (matches Raw
   * output exactly). Negative crushes toward solid black, positive toward solid white — see
   * pipeline.ts's runHiRawDarkenLighten (reuses colorCorrectProgram's black/white clip). */
  hiRawDarkenLighten: number
  /** Shared-tail field: 0..1, 1 = hard cutoff (softThresholdProgram's uSoftness=0). Lower values
   * widen the threshold's transition band — see pipeline.ts's Output Treatment tail. */
  hiThresholdContrast: number
  /** Shared-tail field: pivoted-at-0.5 contrast curve applied alongside hiRawDarkenLighten's
   * black/white clip in runHiRawDarkenLighten, 1 = identity. */
  hiRawContrast: number
  /** Shared-tail field, applies to Tone only: standard luma-mix saturation (reuses
   * saturationAdjustProgram, already used by Fumiko), 1 = identity. */
  hiToneSaturation: number
  /** Shared-tail field, applies to Tone only: rotates hue 180° (HSV round-trip) while preserving
   * luminance/saturation — see saturationAdjust.frag.ts's uHueInvert. */
  hiToneHueInvert: boolean
  /** Erode's own erosion-direction toggle: flips which luminance side (surface/shading vs. line
   * art) is classified as ink at the threshold stage itself. Independent of `fillInvert` below,
   * which operates one stage later (color resolution, not shape) — see pipeline.ts's Erode
   * branch. */
  hiThresholdInvert: boolean
  // Path H only.
  highPassStrength: number
  highPassResponsiveColor: boolean
  responsiveCrossover: number
  responsiveGrow: number
  responsiveGrowBias: number
  /** Edge's independent per-polarity fill-type (Image/Solid only, no Gradient — Edge's ink color
   * is a per-pixel binary choice, not a luminance-driven ramp). "Dark"/"Light" name the *local
   * background area* the ink is drawn over (matching responsiveEdgeColor.frag.ts's uCrossover
   * convention), not the ink's own color. See pipeline.ts's runEdgeFillColor /
   * edgeFillColor.frag.ts. */
  edgeInkOverDarkFillType: 'image' | 'solid'
  edgeInkOverDarkSolidColor: [number, number, number]
  edgeInkOverDarkColorContrast: number
  edgeInkOverDarkExposure: number
  edgeInkOverLightFillType: 'image' | 'solid'
  edgeInkOverLightSolidColor: [number, number, number]
  edgeInkOverLightColorContrast: number
  edgeInkOverLightExposure: number
  /** Off (default): single dark-ink color (edgeInkOverDarkSolidColor) over an always-image light
   * side. On: today's full independent per-side fill-type UI. */
  edgeDuoTone: boolean
  /** Inverts ink coverage itself (draws over undetected areas, not detected edges) — distinct from
   * the fillInvert family, which flips solid/image polarity on an already-computed mask. */
  edgeInvertFill: boolean
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
