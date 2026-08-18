import { createGLContext, wireContextLossHandlers } from './glContext'
import { createProgram, createFullscreenQuad, bindFullscreenQuadAttribs, drawFullscreenQuad } from './shaderUtils'
import { createTargetTexture, createFloatTargetTexture, disposeTargetTexture, type TargetTexture } from './framebufferPool'
import { passthroughVert } from './shaders/passthrough.vert'
import { cropFrag } from './shaders/crop.frag'
import { curvesHslFrag } from './shaders/curvesHsl.frag'
import { lightColorCorrectFrag } from './shaders/lightColorCorrect.frag'
import { colorCorrectFrag } from './shaders/colorCorrect.frag'
import { denoiseFrag } from './shaders/denoise.frag'
import { thresholdFrag } from './shaders/threshold.frag'
import { minFilter1DFrag } from './shaders/minFilter1D.frag'
import { minFilterContinuousFrag } from './shaders/minFilterContinuous.frag'
import { erosionRgbFrag } from './shaders/erosionRgb.frag'
import { erosionGateFrag } from './shaders/erosionGate.frag'
import { distanceSeedFrag } from './shaders/distanceSeed.frag'
import { jfaStepFrag } from './shaders/jfaStep.frag'
import { distanceToEdgeFrag } from './shaders/distanceToEdge.frag'
import { findEdgesFrag } from './shaders/findEdges.frag'
import { boxBlurFrag } from './shaders/boxBlur.frag'
import { mixBlendFrag } from './shaders/mixBlend.frag'
import { alphaModulateFrag } from './shaders/alphaModulate.frag'
import { layerMergeFrag } from './shaders/layerMerge.frag'
import { unsharpMaskFrag } from './shaders/unsharpMask.frag'
import { saturationAdjustFrag } from './shaders/saturationAdjust.frag'
import { inkCorrectFrag } from './shaders/inkCorrect.frag'
import { edgeFillColorFrag } from './shaders/edgeFillColor.frag'
import { colorLiftFrag } from './shaders/colorLift.frag'
import { alphaOverWhiteFrag } from './shaders/alphaOverWhite.frag'
import { compositeFrag } from './shaders/composite.frag'
import { blitFrag } from './shaders/blit.frag'
import { resizeFrag } from './shaders/resize.frag'
import { plateauRampFrag } from './shaders/plateauRamp.frag'
import { softThresholdFrag } from './shaders/softThreshold.frag'
import { fillMaskFrag } from './shaders/fillMask.frag'
import { blobMaskFrag } from './shaders/blobMask.frag'
import { maskFillColorFrag } from './shaders/maskFillColor.frag'
import { gradientMapFrag } from './shaders/gradientMap.frag'
import { highPassDiffFrag } from './shaders/highPassDiff.frag'
import { laplacianFrag } from './shaders/laplacian.frag'
import { toneRemapFrag } from './shaders/toneRemap.frag'
import { responsiveEdgeColorFrag } from './shaders/responsiveEdgeColor.frag'
import { inkColorMaskFrag } from './shaders/inkColorMask.frag'
import { inkColorRecombineFrag } from './shaders/inkColorRecombine.frag'
import { createSourceTexture, createLutTexture, updateLutTexture } from './texture'
import { loadSourceBitmap } from '../imageLoad'
import { identityLutBuffer } from '../curve/spline'
import type { ColorAdjustParams, ColorLiftParams, EnhanceParams, ExportDisplayMode, GradeGradientMapParams, HslByBand, HslShift, InvertParams, LightParams, LineArtDisplayMode, LineArtParams, PinchModeParams, ResizeParams } from '../types'
import { HUE_BAND_SWATCHES } from '../color/hslPalette'
import { pinchToPlateau } from '../tone/pinchRamp'
import type { PlateauRampPoints } from '../tone/pinchRamp'
import { trace } from '../debug/renderTrace'

export type CropRect = [number, number, number, number]

const IDENTITY_HSL_SHIFT: HslShift = { hue: 0, saturation: 0, lightness: 0 }
export const IDENTITY_HSL_BY_BAND: HslByBand = {
  master: IDENTITY_HSL_SHIFT,
  red: IDENTITY_HSL_SHIFT,
  orange: IDENTITY_HSL_SHIFT,
  yellow: IDENTITY_HSL_SHIFT,
  green: IDENTITY_HSL_SHIFT,
  teal: IDENTITY_HSL_SHIFT,
  blue: IDENTITY_HSL_SHIFT,
  purple: IDENTITY_HSL_SHIFT,
  magenta: IDENTITY_HSL_SHIFT,
}
export const IDENTITY_INVERT: InvertParams = { rgb: false, r: false, g: false, b: false }
export const IDENTITY_LIGHT: LightParams = { exposure: 0, contrast: 0, brilliance: 0, whites: 0, highlights: 0, shadows: 0, blacks: 0 }
export const IDENTITY_COLOR_ADJUST: ColorAdjustParams = { temperature: 0, tint: 0, vibrance: 0 }
export const IDENTITY_GRADE_GRADIENT_MAP: GradeGradientMapParams = {
  enabled: false,
  shadow: [0, 0, 0],
  mid: [0.5, 0.5, 0.5],
  highlight: [1, 1, 1],
  pivot: 0,
  duoTone: false,
  intensity: 1,
  blendMode: 'overwrite',
}
const IDENTITY_ENHANCE: EnhanceParams = { smooth: 0, sharpen: 0 }
const IDENTITY_RESIZE: ResizeParams = { mode: 'original', customSize: { width: 512, height: 512 } }
export const IDENTITY_COLOR_LIFT: ColorLiftParams = {
  red: 0, orange: 0, yellow: 0, green: 0, teal: 0, blue: 0, purple: 0, magenta: 0,
}

const IDENTITY_LINE_ART: LineArtParams = {
  mode: 'pathB',
  displayMode: 'composite',
  toneShaping: {
    exposure: 0,
    contrast: 0,
    mode: 'clip',
    clipMode: { blackClip: 0, whiteClip: 1 },
    pinchMode: { position: 0.5, expand: 0.3, feathering: 0.5 },
  },
  denoise: { intensity: 0, threshold: 0 },
  colorLift: IDENTITY_COLOR_LIFT,
  opacity: 1,
  blendMode: 'multiply',
  overlayPassthrough: false,
  matteColor: [1, 1, 1],
  colorCorrectEnabled: false,
  colorCorrectExposure: 0,
  colorCorrectContrast: 0,
  colorCorrectSaturation: 0,
  colorCorrectInvertMatte: false,
  threshold: 0,
  radius: 1,
  hardness: 1,
  blobContrast: 1,
  daiyaOctagonMode: false,
  daiyaOctagonRadius: 2,
  daiyaOctagonHardness: 0,
  daiyaOctagonDirections: 1,
  daiyaOctagonRotation: 0,
  daiyaOctagonOneSided: false,
  daiyaInvertSeed: false,
  daiyaSoftThresholdWidth: 0,
  daiyaSoftThresholdOverdrive: 1,
  colorExpansion: false,
  colorContrast: 1,
  gateThreshold: 0,
  sensitivity: 3,
  saturation: 0.5,
  findEdge: false,
  tintColor: [1, 0.475, 0.886], // #FF79E2
  vividDeadzone: 0.15,
  vividBoost: 1,
  fillType: 'image',
  fillInvert: false,
  gradientShadow: [0, 0, 0],
  gradientMid: [0.5, 0.5, 0.5],
  gradientHighlight: [1, 1, 1],
  gradientPivot: 0,
  gradientDuoTone: false,
  gumiContrastBoost: 1,
  blobMaxDt: 8,
  gumiOverdrive: 0,
  gumiLineFillType: 'solid',
  gumiLineSolidColor: [0, 0, 0],
  gumiLineInvert: false,
  // Retired from the UI — frozen off rather than deleted, keeping the pipeline branch
  // dormant/revivable instead of dead code removal.
  gumiGapClosing: false,
  gumiBlobGamma: 1,
  gumiColorBleed: false,
  gumiBleedFeather: 1.5,
  gumiBleedRadius: 8,
  gumiSoftDetection: false,
  gumiSoftness: 0.1,
  gumiFillMode: false,
  gumiFillRadius: 8,
  gumiFillInvert: false,
  gumiFillType: 'image',
  gumiFillSolidColor: [0, 0, 0],
  gumiFillPixelThreshold: false,
  gumiGradientMap: false,
  gumiGradientShadow: [0, 0, 0],
  gumiGradientMid: [0.5, 0.5, 0.5],
  gumiGradientHighlight: [1, 1, 1],
  gumiDualLine: false,
  gumiDualBlack: { position: 0.2, expand: 0.3, feathering: 0.15 },
  gumiDualWhite: { position: 0.8, expand: 0.3, feathering: 0.15 },
  gumiDualBlackFillType: 'solid',
  gumiDualBlackSolidColor: [0, 0, 0],
  gumiDualBlackInvert: false,
  gumiDualWhiteFillType: 'solid',
  gumiDualWhiteSolidColor: [1, 1, 1],
  gumiDualWhiteInvert: false,
  gumiDualWhiteOnTop: true,
  gumiLineColorContrast: 1,
  gumiLineGradientPivot: 0,
  gumiFillColorContrast: 1,
  gumiFillGradientPivot: 0,
  gumiDualBlackColorContrast: 1,
  gumiDualWhiteColorContrast: 1,
  thresholdEnabled: false,
  hiToneTarget: 'off',
  hiToneGain: 1,
  hiToneContrast: 1,
  hiRawDarkenLighten: 0,
  hiThresholdContrast: 1,
  hiRawContrast: 1,
  hiToneSaturation: 1,
  hiToneHueInvert: false,
  hiThresholdInvert: false,
  highPassStrength: 1,
  highPassResponsiveColor: false,
  responsiveCrossover: 0.5,
  responsiveGrow: 0,
  responsiveGrowBias: 0,
  edgeInkOverDarkFillType: 'solid',
  edgeInkOverDarkSolidColor: [1, 1, 1],
  edgeInkOverLightFillType: 'solid',
  edgeInkOverLightSolidColor: [0, 0, 0],
  laplacianStrength: 1,
  laplacianPreBlur: 0,
  laplacianSharpenAmount: 0,
  laplacianGrow: 0,
}

/** Piecewise-linear "hardness" macro shared by Botan/Chie/Daiya: -1 -> 200% of base max feather, 0 -> 50%, 1 -> hard clip (0).
 * pathD: 5 is a starting guess (matches pathB, the closer reference — both share a 0-20 texel
 * radius range, unlike pathC's differently-shaped erosion falloff) — needs visual tuning. */
const HARDNESS_BASE_MAX_FEATHER: Partial<Record<LineArtParams['mode'], number>> = { pathB: 5, pathC: 1, pathD: 5 }
function hardnessToFeather(hardness: number, base: number): number {
  return hardness <= 0 ? base * (2 - 1.5 * (hardness + 1)) : base * 0.5 * (1 - hardness)
}

/** uBlendMode ints for composite.frag.ts's blendLayer. */
const BLEND_MODE_INT: Record<LineArtParams['blendMode'], number> = {
  overwrite: 0, multiply: 1, screen: 2, overlay: 3, normal: 4, difference: 5,
  add: 6, dodge: 7, darken: 8, burn: 9, softLight: 10, hardLight: 11,
}

/** Dual Pane "which pane is canonical" priority — composite beats overlay beats original. Mirrors
 * App.tsx's DUAL_PANE_PRIORITY_INDEX (UI-side precedent for the corner preview); kept here as the
 * source of truth for readFinalPixels()/the final blit's own pane-selection needs. */
const DISPLAY_MODE_PRIORITY: Record<LineArtDisplayMode, number> = { composite: 2, overlay: 1, original: 0 }
/** Fixed radius for the Gap Closing prototype (LineArtParams.gumiGapClosing) — see its doc comment. Not yet a user-facing slider; this is the one value being validated before promoting it to a real param. */
const GUMI_GAP_CLOSING_RADIUS = 2
/** fillMask.frag.ts's uFillType ints. */
const FILL_TYPE_INT: Record<LineArtParams['gumiFillType'], number> = { image: 0, solid: 1, gradient: 2 }

const ALPHA_OVERDRIVE_LAYERS = 3

/**
 * Stage chain: crop (native-res offscreen) -> [Botan/Chie/Daiya/Fumiko line
 * art, mode-switched] -> curves+HSL -> blit (cheap downsample for live
 * preview). The line-art stage's own sub-chain (color-correct -> optional
 * denoise -> algorithm -> mask/crossfade composite) is a straight port of
 * src/lab/labPipeline.ts's render() — see that file's comments for the
 * per-algorithm rationale; this class just adds it as one more dirty-
 * tracked stage in the product's fixed pipeline instead of the lab's
 * standalone switchable-only harness.
 *
 * `cropDirty` cascades to `lineArtDirty` cascades to `colorDirty`, mirroring
 * the crop->color cascade the class already had — a downstream-only param
 * change (e.g. a curve edit) skips re-running crop/line-art and reuses
 * their cached textures.
 */
export class Pipeline {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private cropProgram: WebGLProgram
  private colorCorrectProgram: WebGLProgram
  private denoiseProgram: WebGLProgram
  private thresholdProgram: WebGLProgram
  private minFilterProgram: WebGLProgram
  /** Continuous-radius sibling of minFilterProgram (see minFilterContinuous.frag.ts) — scoped to
   * Gumi's Detection Radius/Overdrive only, deliberately not shared with minFilterProgram's other
   * consumers (Gap Closing, Chie/Fumiko erosion, Fumiko/Tsukiko grow). */
  private minFilterContinuousProgram: WebGLProgram
  private erosionProgram: WebGLProgram
  private erosionGateProgram: WebGLProgram
  private distanceSeedProgram: WebGLProgram
  private jfaStepProgram: WebGLProgram
  private distanceToEdgeProgram: WebGLProgram
  private findEdgesProgram: WebGLProgram
  private boxBlurProgram: WebGLProgram
  private mixBlendProgram: WebGLProgram
  /** Porter-Duff "over" merge of two independent RGBA layers — Gumi Dual Line's only
   * consumer (see layerMerge.frag.ts's doc comment for why mixBlendProgram/composite.frag.ts
   * don't already cover this). */
  private layerMergeProgram: WebGLProgram
  private unsharpMaskProgram: WebGLProgram
  private saturationAdjustProgram: WebGLProgram
  private inkCorrectProgram: WebGLProgram
  private edgeFillColorProgram: WebGLProgram
  private colorLiftProgram: WebGLProgram
  private alphaOverWhiteProgram: WebGLProgram
  /** Multiplies a base texture's ink-weight channel (uBaseChannel: 0=.r, 1=.a — same convention
   * maskFillColorProgram's uMaskChannel already uses) by a second grayscale mask's .r — Daiya's
   * soft-threshold toggle is the only consumer today. */
  private alphaModulateProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private lightColorProgram: WebGLProgram
  private colorProgram: WebGLProgram
  private blitProgram: WebGLProgram
  private resizeProgram: WebGLProgram
  private plateauRampProgram: WebGLProgram
  private softThresholdProgram: WebGLProgram
  private fillMaskProgram: WebGLProgram
  private blobMaskProgram: WebGLProgram
  private maskFillColorProgram: WebGLProgram
  private gradientMapProgram: WebGLProgram
  private highPassDiffProgram: WebGLProgram
  private laplacianProgram: WebGLProgram
  private toneRemapProgram: WebGLProgram
  private responsiveEdgeColorProgram: WebGLProgram
  private inkColorMaskProgram: WebGLProgram
  private inkColorRecombineProgram: WebGLProgram
  private quadBuffer: WebGLBuffer
  private lutTexture: WebGLTexture

  private sourceTexture: WebGLTexture | null = null
  private sourceBitmap: ImageBitmap | null = null
  private cropTarget: TargetTexture | null = null
  private resizeTarget: TargetTexture | null = null
  private smoothTarget: TargetTexture | null = null
  private sharpenBlurHTarget: TargetTexture | null = null
  private sharpenBlurVTarget: TargetTexture | null = null
  private sharpenTarget: TargetTexture | null = null
  private enhanceTarget: TargetTexture | null = null
  private correctedTarget: TargetTexture | null = null
  private toneExposureTarget: TargetTexture | null = null
  private colorLiftTarget: TargetTexture | null = null
  private denoisedTarget: TargetTexture | null = null
  private maskTarget: TargetTexture | null = null
  private erodeHTarget: TargetTexture | null = null
  private erodeVTarget: TargetTexture | null = null
  private gateTarget: TargetTexture | null = null
  private seedTargetA: TargetTexture | null = null
  private seedTargetB: TargetTexture | null = null
  private distanceMaskTarget: TargetTexture | null = null
  /** Daiya's own JFA ping-pong buffers (float), kept separate from Botan's
   * seedTargetA/B above rather than shared: Daiya's dirty-tracking (daiyaSeedDirty) has different
   * invalidation triggers than Botan's, so sharing fields would either couple the two algorithms'
   * cache lifetimes or silently skip recompute when only one algorithm's params changed. */
  private daiyaSeedTargetA: TargetTexture | null = null
  private daiyaSeedTargetB: TargetTexture | null = null
  private daiyaDistanceMaskTarget: TargetTexture | null = null
  /** Pre-JFA-port growth path (`daiyaOctagonMode`) — the original 4-direction separable min-filter
   * dilate ("octagon approximation"), scratch targets for its 2-buffer ping-pong. Deliberately
   * separate fields from seedTargetA/B above (JFA's own ping-pong) rather than reused, since only
   * one growth mode runs per frame but both could be mid-cache from a previous frame — sharing
   * risks the same field-ownership hazard CLAUDE.md's ensureTarget gotcha warns about. */
  private daiyaOctagonHTarget: TargetTexture | null = null
  private daiyaOctagonVTarget: TargetTexture | null = null
  /** Soft-threshold alpha-modulate toggle (`daiyaSoftThreshold`) — see pipeline.ts's pathD branch
   * doc comment for the full rationale. `daiyaSoftThresholdTarget` holds softThresholdProgram's
   * raw grayscale output; `daiyaSoftThresholdModTarget` holds the result of multiplying it into
   * whichever growth mode's mask (JFA's `.a` or octagon's `.r`). */
  private daiyaSoftThresholdTarget: TargetTexture | null = null
  private daiyaSoftThresholdModTarget: TargetTexture | null = null
  /** Botan's solid/gradient fillType final-color pass output (see pipeline.ts's
   * pathB branch); unused (outputTarget stays distanceMaskTarget directly) when fillType is 'image'. */
  private botanFillColorTarget: TargetTexture | null = null
  /** Chie's fillType final-color pass output (Chie had no color mechanism
   * before this, so this is always used, unlike Botan's equivalent above). */
  private chieFillColorTarget: TargetTexture | null = null
  /** Scratch targets for `runSoftHardness`'s box-blur+mix, shared
   * across Daiya/Fumiko (never both active in the same render() pass, so one set suffices). */
  private softHardnessHTarget: TargetTexture | null = null
  private softHardnessVTarget: TargetTexture | null = null
  private softHardnessMixTarget: TargetTexture | null = null
  private edgeMapTarget: TargetTexture | null = null
  private blurHTarget: TargetTexture | null = null
  private blurVTarget: TargetTexture | null = null
  private tintTarget: TargetTexture | null = null
  private saturationTarget: TargetTexture | null = null
  private lineArtBlendTarget: TargetTexture | null = null
  private lineArtOverlayPreviewTarget: TargetTexture | null = null
  private lineArtOutputTarget: TargetTexture | null = null
  private lightColorTarget: TargetTexture | null = null
  private colorTarget: TargetTexture | null = null
  // Grade tab's Gradient Map processor — own dedicated targets,
  // never aliasing colorTarget itself (see CLAUDE.md's Recurring Gotchas entry on exactly this
  // class of bug). gradeGradientMapTarget
  // holds gradientMapProgram's raw remapped output; gradeGradientMapCompositeTarget holds that
  // blended back over the pre-gradient-map color via compositeProgram (intensity/blend mode).
  private gradeGradientMapTarget: TargetTexture | null = null
  private gradeGradientMapCompositeTarget: TargetTexture | null = null

  // Dual Pane (desktop-only) — second independent copy of the
  // display-mode-resolution and Color-chain targets above, only populated
  // while dualPaneEnabled is true. Pane A always reuses the primary fields
  // (lineArtOutputTarget/colorTarget etc.) unchanged, so single-pane
  // behavior (and readFinalPixels/export) is completely unaffected by this
  // feature; pane B gets its own set so both panes' final textures can
  // coexist for the double-wide blit at the end of render().
  private lineArtBlendTargetB: TargetTexture | null = null
  private lineArtOverlayPreviewTargetB: TargetTexture | null = null
  private lineArtOutputTargetB: TargetTexture | null = null
  private lightColorTargetB: TargetTexture | null = null
  private colorTargetB: TargetTexture | null = null
  private gradeGradientMapTargetB: TargetTexture | null = null
  private gradeGradientMapCompositeTargetB: TargetTexture | null = null

  // Export tab's own live-preview resolve — a THIRD independent slot alongside the primary/B pair
  // above, for when Export's own (displayMode, colorGrade) selection differs from whatever Line
  // Art's live displayMode/Grade tab's live adjustments currently show. See renderExportPreview.
  // lineArtRawTarget caches computeLineArtRaw's output (expensive — e.g. Botan's JFA) across the
  // frame so this preview never pays for a second compute; it doesn't depend on displayMode so the
  // same raw target from the main render is always valid to reuse here. When colorCorrectEnabled is
  // on, lineArtRawTarget is reassigned (see applyInkCorrect) to point at inkCorrectTarget instead of
  // computeLineArtRaw's own return value — same "rotating alias to whichever target currently holds
  // the current raw output" pattern computeLineArtRaw's own per-algorithm branches already use, not
  // a new one; inkCorrectTarget itself is always freshly rendered into, never reused as anyone
  // else's destination.
  private lineArtRawTarget: TargetTexture | null = null
  private inkCorrectTarget: TargetTexture | null = null
  private exportLineArtBlendTarget: TargetTexture | null = null
  private exportLineArtOverlayTarget: TargetTexture | null = null
  private exportLightColorTarget: TargetTexture | null = null
  private exportColorTarget: TargetTexture | null = null
  private exportGradeGradientMapTarget: TargetTexture | null = null
  private exportGradeGradientMapCompositeTarget: TargetTexture | null = null

  // On-screen-only "peek" slots ('previewA'/'previewB' in resolveLineArtDisplay) — used exclusively
  // to substitute an alternate view (currently only 'overlay') into the live canvas at blit time,
  // for either the single-pane preview strip (previewA) or Dual Pane's per-pane mode selector
  // (previewA/previewB), WITHOUT ever touching lineArtOutputTarget/lineArtOutputTargetB/colorTarget/
  // colorTargetB themselves — those must always reflect the true composite (or sticky
  // overlayPassthrough) result regardless of what's being previewed, per the same
  // never-repoint-an-ensureTarget-field invariant as every other bypass in this file. 'original'
  // mode needs no target at all here — it's always just enhanceTarget directly. Deliberately
  // ungraded (unlike the primary/secondary/export slots' colorTarget/colorTargetB/exportColorTarget)
  // — this is a lightweight raw-stage peek, not a second full grading pipeline; same treatment as
  // the pre-existing 'original' peek already got.
  private lineArtPeekOverlayTarget: TargetTexture | null = null
  private lineArtPeekOverlayTargetB: TargetTexture | null = null
  /** Export tab's "Grade Intensity" slider blend output — see
   * blendGradeIntensity. Export's own preview/readback never run concurrently with each other (both
   * force a synchronous render() first), so a single shared field is safe, unlike Dual Pane's
   * primary/secondary pairs elsewhere in this class. */
  private exportGradeIntensityTarget: TargetTexture | null = null
  /** Whichever existing target actually answers the current Export selection — never a fresh
   * allocation, just a pointer to colorTarget/resizeTarget/exportColorTarget/the raw resolve
   * output, whichever applies. See renderExportPreview. */
  private exportPreviewResult: TargetTexture | null = null

  // Path G (Gumi) / H (Hinata) / I (Inori) — see renderLineArt's pathG/H/I
  // branches, ported 1:1 from src/lab/labPipeline.ts's render().
  private rampTarget: TargetTexture | null = null
  private gumiBoostTarget: TargetTexture | null = null
  private gumiMaskTarget: TargetTexture | null = null
  private gumiMaxHTarget: TargetTexture | null = null
  private gumiMaxVTarget: TargetTexture | null = null
  /** Gap Closing prototype (gated by LineArtParams.gumiGapClosing) — a separate grow-then-shrink pair applied on top of gumiMaxVTarget, ping-ponging through these two rather than reusing gumiMaxHTarget/gumiMaxVTarget so this pass's own output never aliases the texture it reads as input. */
  private gumiCloseHTarget: TargetTexture | null = null
  private gumiCloseVTarget: TargetTexture | null = null
  /** Gumi Line mode's post-process (see runGumiLinePostProcess) — Overdrive's min-filter dilate ping-pong pair, then Hardness's blur-mix (its own ping-pong pair plus one more target for the mix output). */
  private gumiOverdriveHTarget: TargetTexture | null = null
  private gumiOverdriveVTarget: TargetTexture | null = null
  private gumiHardnessHTarget: TargetTexture | null = null
  private gumiHardnessVTarget: TargetTexture | null = null
  private gumiHardnessMixTarget: TargetTexture | null = null
  /** Line mode's fill-type color resolution output (lineFillColor.frag.ts) — see runGumiLinePostProcess's doc comment for why this is its own final pass instead of folded into blobMaskFrag. */
  private gumiLineColorTarget: TargetTexture | null = null
  /** Dual Line — each band's finished colored+alpha output,
   * consumed by layerMergeProgram to produce gumiDualMergeTarget. */
  private gumiDualBlackColorTarget: TargetTexture | null = null
  private gumiDualWhiteColorTarget: TargetTexture | null = null
  private gumiDualMergeTarget: TargetTexture | null = null
  private gumiSeedTargetA: TargetTexture | null = null
  private gumiSeedTargetB: TargetTexture | null = null
  private gumiBlobTarget: TargetTexture | null = null
  private gumiBleedTarget: TargetTexture | null = null
  private gradientMapTarget: TargetTexture | null = null
  private highPassTarget: TargetTexture | null = null
  private laplacianTarget: TargetTexture | null = null
  private laplacianSharpenTarget: TargetTexture | null = null
  private hiThreshTarget: TargetTexture | null = null
  /** Darken/Lighten's output when Emboss/Raw is the active treatment. */
  private hiRawTreatedTarget: TargetTexture | null = null
  /** Edge's per-polarity fill-color resolution output. */
  private edgeFillColorTarget: TargetTexture | null = null
  /** Erode's shared-fill-type-mechanism color resolution output. */
  private hiThreshFillColorTarget: TargetTexture | null = null
  private toneRemapTarget: TargetTexture | null = null
  private responsiveColorTarget: TargetTexture | null = null
  private responsiveWhiteExtractTarget: TargetTexture | null = null
  private responsiveBlackExtractTarget: TargetTexture | null = null
  private responsiveGrowWhiteTarget: TargetTexture | null = null
  private responsiveGrowBlackTarget: TargetTexture | null = null

  private cropDirty = true
  private resizeDirty = true
  private enhanceDirty = true
  private lineArtDirty = true
  private colorDirty = true
  /** See setLineArtActive — true by default so the very first render (before anything settles it) still shows Botan. */
  private lineArtActive = true
  /** See armLineArtSettle — non-null while crop interaction has frozen line-art and is waiting to reactivate it. */
  private lineArtSettleTimer: ReturnType<typeof setTimeout> | null = null
  /** Fullscreen-preview A/B toggle (App.tsx renders it only while no tab is selected) — 'original' blits cropTarget (post-crop, pre-Enhancement/Line Art/Color) instead of the fully-processed colorTarget. Only affects the on-screen canvas; Export always reads the full colorTarget regardless. */
  private previewMode: 'original' | 'result' = 'result'
  /** Tab-scoped live-preview bypass — lets the Grade tab's Original/Graded toggle, Line Art tab's
   * own preview strip (Original/Overlay buttons), and Export tab's own group peek at an earlier
   * pipeline stage (or Export's own independent resolve) on the live canvas, same idea as
   * previewMode above but for later stage boundaries previewMode was never built to express.
   * 'enhance' -> enhanceTarget (post-crop+resize+Enhancement, pre-Line-Art-algorithm), used by
   * Line Art's own "Original" preview button. 'lineArtComposite' -> lineArtOutputTarget (the true,
   * ungraded Line Art module output), used by Grade's "Original" toggle — workflow runs
   * crop -> line art -> grade -> export, so Grade's "Original" means "before Grade," i.e. what
   * Line Art produced, not further back at pre-Line-Art. 'exportPreview' -> exportPreviewResult, see renderExportPreview —
   * Export tab is the sole WYSIWYG authority for its own (displayMode, colorGrade) selection, fully
   * decoupled from Line Art's/Grade's own live tab state. 'lineArtOverlay' -> lineArtPeekOverlayTarget,
   * computed on-demand right here at blit time via a dedicated 'previewA' resolveLineArtDisplay call
   * — lineArtOutputTarget/colorTarget themselves must never be repointed to show this (see
   * ensureTarget's "this field always owns its own private texture" invariant, CLAUDE.md's Recurring
   * Gotchas) — the substitution happens only here, at the point of consumption. App.tsx computes
   * this from whichever tab is actually active, resetting to 'none' whenever none of these apply, so
   * it can't leak into Crop/deselected views or Grade's own "Graded" mode. Dual Pane bypasses this
   * mechanism entirely (its own blit branch has its own previewA/previewB peek resolves, since two
   * panes can each want a different mode simultaneously). */
  private tabPreviewBypass: 'none' | 'enhance' | 'lineArtComposite' | 'exportPreview' | 'lineArtOverlay' = 'none'
  /** Export tab's own (displayMode, colorGrade) selection — see setExportPreviewParams/
   * renderExportPreview. Independent of this.lineArt.displayMode; that's the whole point. */
  private exportDisplayMode: ExportDisplayMode = 'composite'
  private exportColorGrade = true
  /** Export tab's "Grade Intensity" slider — 1 = fully graded (default, zero extra cost),
   * 0 = fully ungraded (also zero extra cost, same as colorGrade=false),
   * strictly between blends the two via blendGradeIntensity's mixBlendProgram pass. */
  private exportColorGradeIntensity = 1
  /** True whenever anything upstream of the Export preview changed — set alongside every colorDirty=true site, since the preview depends on everything colorDirty does plus Export's own selection. */
  private exportPreviewDirty = true
  /**
   * Botan's JFA seed (threshold -> distanceSeed -> ~11 flood-fill passes)
   * only depends on `threshold` and the detection source (crop/tone-shaping/
   * denoise) — Radius/Hardness/Blob Contrast/Color Contrast/Color Expansion/
   * Opacity only affect the one cheap distanceToEdge pass downstream of it.
   * Recomputing the whole seed on every one of those slider's `input` events
   * was the actual cause of Botan specifically feeling laggy to drag — see
   * setLineArtParams for what actually invalidates this.
   */
  private botanSeedDirty = true
  private botanSeedTarget: TargetTexture | null = null
  /**
   * Daiya's own JFA seed, same shape/rationale as Botan's pair above (threshold -> distanceSeed ->
   * flood-fill passes only depends on `threshold`/detectionSource; Radius/Hardness/Color Contrast
   * only affect the cheap distanceToEdge pass downstream) — kept as a separate flag/field pair
   * rather than reusing Botan's, since each algorithm's invalidation triggers differ. Never
   * independently disposed/ensureTarget'd — it's always just a pointer into whichever of
   * daiyaSeedTargetA/B currently holds the converged result, same "read-only alias" rule as
   * botanSeedTarget above.
   */
  private daiyaSeedDirty = true
  private daiyaSeedTarget: TargetTexture | null = null
  /** Notified with cropTarget's pixel dimensions whenever a crop recompute resolves — cheap (no GPU readback, just the already-known width/height), lets the Export tab show/compute against the real crop output size without needing a full readFinalPixels() call just to read two numbers. */
  private onCropSizeChange: ((size: { width: number; height: number }) => void) | null = null

  /** Dual Pane toggle state — see setDualPane. Desktop-only in the UI (App.tsx gates it behind the
   * same 900px breakpoint as .rampmeter-desktop-only), but the pipeline itself has no width
   * awareness and will happily render dual-pane at any canvas size if asked. */
  private dualPaneEnabled = false
  private dualPaneModes: [LineArtDisplayMode, LineArtDisplayMode] = ['original', 'composite']
  /** Grade tab's own Dual Pane — see setGradeDualPane. Always a fixed enhanceTarget|colorTarget
   * pair (no "modes" tuple like Line Art's above), since both sides already exist every frame
   * regardless of dual-pane state — this costs zero extra GPU work, just a different blit split. */
  private gradeDualPaneEnabled = false

  private cropRect: CropRect = [0, 0, 1, 1]
  private hslByBand: HslByBand = IDENTITY_HSL_BY_BAND
  private invert: InvertParams = IDENTITY_INVERT
  private light: LightParams = IDENTITY_LIGHT
  private colorAdjust: ColorAdjustParams = IDENTITY_COLOR_ADJUST
  private gradeGradientMap: GradeGradientMapParams = IDENTITY_GRADE_GRADIENT_MAP
  private lineArt: LineArtParams = IDENTITY_LINE_ART
  private enhance: EnhanceParams = IDENTITY_ENHANCE
  private resizeParams: ResizeParams = IDENTITY_RESIZE

  private disposeContextHandlers: () => void
  private canvasResizeObserver: ResizeObserver

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = createGLContext(canvas)
    this.gl.getExtension('EXT_color_buffer_float')
    this.cropProgram = createProgram(this.gl, passthroughVert, cropFrag)
    this.colorCorrectProgram = createProgram(this.gl, passthroughVert, colorCorrectFrag)
    this.denoiseProgram = createProgram(this.gl, passthroughVert, denoiseFrag)
    this.thresholdProgram = createProgram(this.gl, passthroughVert, thresholdFrag)
    this.minFilterProgram = createProgram(this.gl, passthroughVert, minFilter1DFrag)
    this.minFilterContinuousProgram = createProgram(this.gl, passthroughVert, minFilterContinuousFrag)
    this.erosionProgram = createProgram(this.gl, passthroughVert, erosionRgbFrag)
    this.erosionGateProgram = createProgram(this.gl, passthroughVert, erosionGateFrag)
    this.distanceSeedProgram = createProgram(this.gl, passthroughVert, distanceSeedFrag)
    this.jfaStepProgram = createProgram(this.gl, passthroughVert, jfaStepFrag)
    this.distanceToEdgeProgram = createProgram(this.gl, passthroughVert, distanceToEdgeFrag)
    this.findEdgesProgram = createProgram(this.gl, passthroughVert, findEdgesFrag)
    this.boxBlurProgram = createProgram(this.gl, passthroughVert, boxBlurFrag)
    this.mixBlendProgram = createProgram(this.gl, passthroughVert, mixBlendFrag)
    this.layerMergeProgram = createProgram(this.gl, passthroughVert, layerMergeFrag)
    this.unsharpMaskProgram = createProgram(this.gl, passthroughVert, unsharpMaskFrag)
    this.saturationAdjustProgram = createProgram(this.gl, passthroughVert, saturationAdjustFrag)
    this.inkCorrectProgram = createProgram(this.gl, passthroughVert, inkCorrectFrag)
    this.edgeFillColorProgram = createProgram(this.gl, passthroughVert, edgeFillColorFrag)
    this.colorLiftProgram = createProgram(this.gl, passthroughVert, colorLiftFrag)
    this.alphaOverWhiteProgram = createProgram(this.gl, passthroughVert, alphaOverWhiteFrag)
    this.alphaModulateProgram = createProgram(this.gl, passthroughVert, alphaModulateFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.lightColorProgram = createProgram(this.gl, passthroughVert, lightColorCorrectFrag)
    this.colorProgram = createProgram(this.gl, passthroughVert, curvesHslFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.resizeProgram = createProgram(this.gl, passthroughVert, resizeFrag)
    this.plateauRampProgram = createProgram(this.gl, passthroughVert, plateauRampFrag)
    this.softThresholdProgram = createProgram(this.gl, passthroughVert, softThresholdFrag)
    this.fillMaskProgram = createProgram(this.gl, passthroughVert, fillMaskFrag)
    this.blobMaskProgram = createProgram(this.gl, passthroughVert, blobMaskFrag)
    this.maskFillColorProgram = createProgram(this.gl, passthroughVert, maskFillColorFrag)
    this.gradientMapProgram = createProgram(this.gl, passthroughVert, gradientMapFrag)
    this.highPassDiffProgram = createProgram(this.gl, passthroughVert, highPassDiffFrag)
    this.laplacianProgram = createProgram(this.gl, passthroughVert, laplacianFrag)
    this.toneRemapProgram = createProgram(this.gl, passthroughVert, toneRemapFrag)
    this.responsiveEdgeColorProgram = createProgram(this.gl, passthroughVert, responsiveEdgeColorFrag)
    this.inkColorMaskProgram = createProgram(this.gl, passthroughVert, inkColorMaskFrag)
    this.inkColorRecombineProgram = createProgram(this.gl, passthroughVert, inkColorRecombineFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    this.lutTexture = createLutTexture(this.gl, identityLutBuffer(), 3)
    this.disposeContextHandlers = wireContextLossHandlers(
      canvas,
      () => this.handleContextLost(),
      () => this.handleContextRestored(),
    )
    // render() only runs when scheduleRender() is called by a param/data
    // setter — nothing previously re-ran it when the canvas's own CSS-driven
    // clientWidth/clientHeight changed (e.g. a layout reflow crossing the
    // desktop breakpoint, or any other window resize), so the backing-store
    // resize logic at the top of render() went stale until some unrelated
    // setter happened to fire next (switching tabs, nudging a slider).
    this.canvasResizeObserver = new ResizeObserver(() => this.scheduleRender())
    // Observe the canvas's containing box, not the canvas itself: since render()'s final blit
    // now sizes the canvas element from that box (contain-fit, never-enlarge — see there), the
    // canvas's own clientWidth/Height is an *output* of render(), not an input: observing it
    // would just watch render()'s own writes go by (harmlessly self-stabilizing after one extra
    // pass, but not the actual signal we need — a real container layout change). The box is
    // PreviewViewport.tsx's inset:0 centering wrapper (canvas's parent), which fills
    // .preview-viewport 1:1, so its clientWidth/Height IS the box render() measures against.
    this.canvasResizeObserver.observe(canvas.parentElement ?? canvas)
  }

  private handleContextLost(): void {
    this.sourceTexture = null
    // botanSeedTarget is never disposed separately — it's always just an
    // alias for whichever of seedTargetA/seedTargetB currently holds the
    // converged result, so nulling those covers it; still reset the flag so
    // the next render doesn't try to reuse a texture from the dead context.
    this.botanSeedTarget = null
    this.botanSeedDirty = true
    // daiyaSeedTarget is likewise never disposed separately — same alias rule as botanSeedTarget.
    this.daiyaSeedTarget = null
    this.daiyaSeedDirty = true
    for (const key of [
      'cropTarget', 'resizeTarget', 'smoothTarget', 'sharpenBlurHTarget', 'sharpenBlurVTarget', 'sharpenTarget', 'enhanceTarget',
      'correctedTarget', 'toneExposureTarget', 'colorLiftTarget', 'denoisedTarget', 'maskTarget',
      'erodeHTarget', 'erodeVTarget', 'gateTarget', 'seedTargetA', 'seedTargetB', 'distanceMaskTarget',
      'daiyaSeedTargetA', 'daiyaSeedTargetB', 'daiyaDistanceMaskTarget',
      'daiyaOctagonHTarget', 'daiyaOctagonVTarget', 'daiyaSoftThresholdTarget', 'daiyaSoftThresholdModTarget',
      'botanFillColorTarget', 'chieFillColorTarget', 'softHardnessHTarget', 'softHardnessVTarget', 'softHardnessMixTarget',
      'edgeMapTarget', 'blurHTarget', 'blurVTarget', 'tintTarget', 'saturationTarget', 'lineArtBlendTarget',
      'lineArtOverlayPreviewTarget', 'lineArtOutputTarget', 'lightColorTarget', 'colorTarget',
      'lineArtBlendTargetB', 'lineArtOverlayPreviewTargetB', 'lineArtOutputTargetB', 'lightColorTargetB', 'colorTargetB',
      'lineArtRawTarget', 'exportLineArtBlendTarget', 'exportLineArtOverlayTarget', 'exportLightColorTarget', 'exportColorTarget',
      'lineArtPeekOverlayTarget', 'lineArtPeekOverlayTargetB', 'inkCorrectTarget',
      'rampTarget', 'gumiBoostTarget', 'gumiMaskTarget', 'gumiMaxHTarget', 'gumiMaxVTarget', 'gumiCloseHTarget', 'gumiCloseVTarget',
      'gumiOverdriveHTarget', 'gumiOverdriveVTarget', 'gumiHardnessHTarget', 'gumiHardnessVTarget', 'gumiHardnessMixTarget', 'gumiLineColorTarget',
      'gumiDualBlackColorTarget', 'gumiDualWhiteColorTarget', 'gumiDualMergeTarget',
      'gumiSeedTargetA',
      'gumiSeedTargetB', 'gumiBlobTarget', 'gumiBleedTarget', 'gradientMapTarget', 'highPassTarget',
      'laplacianTarget', 'laplacianSharpenTarget', 'hiThreshTarget', 'hiRawTreatedTarget', 'edgeFillColorTarget', 'hiThreshFillColorTarget', 'toneRemapTarget', 'responsiveColorTarget',
      'responsiveWhiteExtractTarget', 'responsiveBlackExtractTarget', 'responsiveGrowWhiteTarget',
      'responsiveGrowBlackTarget',
    ] as const) {
      this[key] = null
    }
  }

  private handleContextRestored(): void {
    this.gl = createGLContext(this.canvas)
    this.gl.getExtension('EXT_color_buffer_float')
    this.cropProgram = createProgram(this.gl, passthroughVert, cropFrag)
    this.colorCorrectProgram = createProgram(this.gl, passthroughVert, colorCorrectFrag)
    this.denoiseProgram = createProgram(this.gl, passthroughVert, denoiseFrag)
    this.thresholdProgram = createProgram(this.gl, passthroughVert, thresholdFrag)
    this.minFilterProgram = createProgram(this.gl, passthroughVert, minFilter1DFrag)
    this.minFilterContinuousProgram = createProgram(this.gl, passthroughVert, minFilterContinuousFrag)
    this.erosionProgram = createProgram(this.gl, passthroughVert, erosionRgbFrag)
    this.erosionGateProgram = createProgram(this.gl, passthroughVert, erosionGateFrag)
    this.distanceSeedProgram = createProgram(this.gl, passthroughVert, distanceSeedFrag)
    this.jfaStepProgram = createProgram(this.gl, passthroughVert, jfaStepFrag)
    this.distanceToEdgeProgram = createProgram(this.gl, passthroughVert, distanceToEdgeFrag)
    this.findEdgesProgram = createProgram(this.gl, passthroughVert, findEdgesFrag)
    this.boxBlurProgram = createProgram(this.gl, passthroughVert, boxBlurFrag)
    this.mixBlendProgram = createProgram(this.gl, passthroughVert, mixBlendFrag)
    this.layerMergeProgram = createProgram(this.gl, passthroughVert, layerMergeFrag)
    this.unsharpMaskProgram = createProgram(this.gl, passthroughVert, unsharpMaskFrag)
    this.saturationAdjustProgram = createProgram(this.gl, passthroughVert, saturationAdjustFrag)
    this.inkCorrectProgram = createProgram(this.gl, passthroughVert, inkCorrectFrag)
    this.edgeFillColorProgram = createProgram(this.gl, passthroughVert, edgeFillColorFrag)
    this.colorLiftProgram = createProgram(this.gl, passthroughVert, colorLiftFrag)
    this.alphaOverWhiteProgram = createProgram(this.gl, passthroughVert, alphaOverWhiteFrag)
    this.alphaModulateProgram = createProgram(this.gl, passthroughVert, alphaModulateFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.lightColorProgram = createProgram(this.gl, passthroughVert, lightColorCorrectFrag)
    this.colorProgram = createProgram(this.gl, passthroughVert, curvesHslFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.resizeProgram = createProgram(this.gl, passthroughVert, resizeFrag)
    this.plateauRampProgram = createProgram(this.gl, passthroughVert, plateauRampFrag)
    this.softThresholdProgram = createProgram(this.gl, passthroughVert, softThresholdFrag)
    this.fillMaskProgram = createProgram(this.gl, passthroughVert, fillMaskFrag)
    this.blobMaskProgram = createProgram(this.gl, passthroughVert, blobMaskFrag)
    this.maskFillColorProgram = createProgram(this.gl, passthroughVert, maskFillColorFrag)
    this.gradientMapProgram = createProgram(this.gl, passthroughVert, gradientMapFrag)
    this.highPassDiffProgram = createProgram(this.gl, passthroughVert, highPassDiffFrag)
    this.laplacianProgram = createProgram(this.gl, passthroughVert, laplacianFrag)
    this.toneRemapProgram = createProgram(this.gl, passthroughVert, toneRemapFrag)
    this.responsiveEdgeColorProgram = createProgram(this.gl, passthroughVert, responsiveEdgeColorFrag)
    this.inkColorMaskProgram = createProgram(this.gl, passthroughVert, inkColorMaskFrag)
    this.inkColorRecombineProgram = createProgram(this.gl, passthroughVert, inkColorRecombineFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    this.lutTexture = createLutTexture(this.gl, identityLutBuffer(), 3)
    if (this.sourceBitmap) {
      this.sourceTexture = createSourceTexture(this.gl, this.sourceBitmap)
    }
    this.cropDirty = true
    this.resizeDirty = true
    this.enhanceDirty = true
    this.lineArtDirty = true
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  async loadFile(file: File): Promise<{ width: number; height: number }> {
    const bitmap = await loadSourceBitmap(file, this.gl)
    this.setSourceBitmap(bitmap)
    return { width: bitmap.width, height: bitmap.height }
  }

  setSourceBitmap(bitmap: ImageBitmap): void {
    if (this.sourceBitmap) this.sourceBitmap.close()
    this.sourceBitmap = bitmap
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture)
    this.sourceTexture = createSourceTexture(this.gl, bitmap)
    this.cropDirty = true
    this.scheduleRender()
  }

  /**
   * "Reset oshiPFP" — unloads the current source image and
   * disposes every downstream render target, so the app returns to its pristine "no image
   * loaded" state without a page reload. Unlike handleContextLost() (which only nulls fields,
   * since the GL context itself is already dead in that scenario), the context here is very
   * much alive, so every target must be properly disposed via disposeTargetTexture() first or
   * this would leak GPU memory on every reset. Mirrors destroy()'s own target list exactly,
   * minus the programs/quad buffer/LUT texture — those stay alive so the pipeline is still
   * usable for the next loadFile() call.
   */
  clearSource(): void {
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture)
    this.sourceTexture = null
    if (this.sourceBitmap) this.sourceBitmap.close()
    this.sourceBitmap = null
    // Alias-only fields (never independently owned/disposed) — same rule as handleContextLost().
    this.botanSeedTarget = null
    this.daiyaSeedTarget = null
    for (const key of [
      'cropTarget', 'resizeTarget', 'smoothTarget', 'sharpenBlurHTarget', 'sharpenBlurVTarget', 'sharpenTarget', 'enhanceTarget',
      'correctedTarget', 'toneExposureTarget', 'colorLiftTarget', 'denoisedTarget', 'maskTarget',
      'erodeHTarget', 'erodeVTarget', 'gateTarget', 'seedTargetA', 'seedTargetB', 'distanceMaskTarget',
      'daiyaSeedTargetA', 'daiyaSeedTargetB', 'daiyaDistanceMaskTarget',
      'daiyaOctagonHTarget', 'daiyaOctagonVTarget', 'daiyaSoftThresholdTarget', 'daiyaSoftThresholdModTarget',
      'botanFillColorTarget', 'chieFillColorTarget', 'softHardnessHTarget', 'softHardnessVTarget', 'softHardnessMixTarget',
      'edgeMapTarget', 'blurHTarget', 'blurVTarget', 'tintTarget', 'saturationTarget', 'lineArtBlendTarget',
      'lineArtOverlayPreviewTarget', 'lineArtOutputTarget', 'lightColorTarget', 'colorTarget',
      'gradeGradientMapTarget', 'gradeGradientMapCompositeTarget',
      'lineArtBlendTargetB', 'lineArtOverlayPreviewTargetB', 'lineArtOutputTargetB', 'lightColorTargetB', 'colorTargetB',
      'gradeGradientMapTargetB', 'gradeGradientMapCompositeTargetB',
      'lineArtRawTarget', 'exportLineArtBlendTarget', 'exportLineArtOverlayTarget', 'exportLightColorTarget', 'exportColorTarget',
      'lineArtPeekOverlayTarget', 'lineArtPeekOverlayTargetB', 'inkCorrectTarget',
      'exportGradeGradientMapTarget', 'exportGradeGradientMapCompositeTarget', 'exportGradeIntensityTarget',
      'rampTarget', 'gumiBoostTarget', 'gumiMaskTarget', 'gumiMaxHTarget', 'gumiMaxVTarget', 'gumiCloseHTarget', 'gumiCloseVTarget',
      'gumiOverdriveHTarget', 'gumiOverdriveVTarget', 'gumiHardnessHTarget', 'gumiHardnessVTarget', 'gumiHardnessMixTarget', 'gumiLineColorTarget',
      'gumiDualBlackColorTarget', 'gumiDualWhiteColorTarget', 'gumiDualMergeTarget',
      'gumiSeedTargetA', 'gumiSeedTargetB', 'gumiBlobTarget', 'gumiBleedTarget', 'gradientMapTarget', 'highPassTarget',
      'laplacianTarget', 'laplacianSharpenTarget', 'hiThreshTarget', 'hiRawTreatedTarget', 'edgeFillColorTarget', 'hiThreshFillColorTarget', 'toneRemapTarget', 'responsiveColorTarget',
      'responsiveWhiteExtractTarget', 'responsiveBlackExtractTarget', 'responsiveGrowWhiteTarget',
      'responsiveGrowBlackTarget',
    ] as const) {
      const target = this[key]
      if (target) disposeTargetTexture(this.gl, target)
      this[key] = null
    }

    this.cropDirty = true
    this.resizeDirty = true
    this.enhanceDirty = true
    this.lineArtDirty = true
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.botanSeedDirty = true
    this.daiyaSeedDirty = true
    this.scheduleRender()
  }

  setCropRect(rect: CropRect): void {
    this.cropRect = rect
    this.cropDirty = true
    this.armLineArtSettle()
    this.scheduleRender()
  }

  setCurveLut(lut: Uint8Array): void {
    updateLutTexture(this.gl, this.lutTexture, lut, 3)
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  setHsl(hslByBand: HslByBand): void {
    this.hslByBand = hslByBand
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  setInvert(invert: InvertParams): void {
    this.invert = invert
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  setLight(light: LightParams): void {
    this.light = light
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  setColorAdjust(colorAdjust: ColorAdjustParams): void {
    this.colorAdjust = colorAdjust
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  setGradeGradientMap(gradeGradientMap: GradeGradientMapParams): void {
    this.gradeGradientMap = gradeGradientMap
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  setEnhanceParams(params: EnhanceParams): void {
    this.enhance = params
    this.enhanceDirty = true
    // Enhancement runs before Botan's/Daiya's detection source, same as a crop change.
    this.botanSeedDirty = true
    this.daiyaSeedDirty = true
    this.scheduleRender()
  }

  setLineArtParams(params: LineArtParams): void {
    const prev = this.lineArt
    trace('pipeline:setLineArtParams', {
      prevMode: prev.mode,
      nextMode: params.mode,
      prevFillInvert: (prev as { fillInvert?: boolean }).fillInvert,
      nextFillInvert: (params as { fillInvert?: boolean }).fillInvert,
      botanSeedDirtyBefore: this.botanSeedDirty,
      daiyaSeedDirtyBefore: this.daiyaSeedDirty,
    })
    if (
      params.mode !== prev.mode ||
      params.threshold !== prev.threshold ||
      // daiyaInvertSeed flips thresholdProgram's polarity feeding into Daiya's JFA seed
      // (distanceSeedProgram), so it must invalidate the cached seed here too.
      params.daiyaInvertSeed !== prev.daiyaInvertSeed ||
      params.toneShaping.exposure !== prev.toneShaping.exposure ||
      params.toneShaping.contrast !== prev.toneShaping.contrast ||
      params.toneShaping.mode !== prev.toneShaping.mode ||
      params.toneShaping.clipMode.blackClip !== prev.toneShaping.clipMode.blackClip ||
      params.toneShaping.clipMode.whiteClip !== prev.toneShaping.clipMode.whiteClip ||
      params.toneShaping.pinchMode.position !== prev.toneShaping.pinchMode.position ||
      params.toneShaping.pinchMode.expand !== prev.toneShaping.pinchMode.expand ||
      params.toneShaping.pinchMode.feathering !== prev.toneShaping.pinchMode.feathering ||
      params.denoise.intensity !== prev.denoise.intensity ||
      params.denoise.threshold !== prev.denoise.threshold ||
      params.colorLift.red !== prev.colorLift.red ||
      params.colorLift.orange !== prev.colorLift.orange ||
      params.colorLift.yellow !== prev.colorLift.yellow ||
      params.colorLift.green !== prev.colorLift.green ||
      params.colorLift.teal !== prev.colorLift.teal ||
      params.colorLift.blue !== prev.colorLift.blue ||
      params.colorLift.purple !== prev.colorLift.purple ||
      params.colorLift.magenta !== prev.colorLift.magenta
    ) {
      this.botanSeedDirty = true
      this.daiyaSeedDirty = true
    }
    this.lineArt = params
    this.lineArtDirty = true
    this.scheduleRender()
  }

  /**
   * Gates the expensive per-algorithm recompute (Botan's JFA alone is ~11
   * full-res passes) by whether the app actually needs to see it live right
   * now. Driven by armLineArtSettle below during crop interaction, since
   * crop pan/zoom fires setCropRect on every pointer-move and cascades into
   * lineArtDirty regardless. While inactive, a crop change still updates
   * cropTarget cheaply but line-art output is left stale (frozen) rather
   * than recomputed; reactivating forces one fresh recompute to catch up.
   */
  setLineArtActive(active: boolean): void {
    if (this.lineArtActive === active) return
    this.lineArtActive = active
    if (active) {
      this.lineArtDirty = true
      this.scheduleRender()
    }
  }

  /**
   * Freezes line-art immediately (see setLineArtActive) and arms a settle
   * timer that reactivates it ~450ms after the last call — so dragging the
   * crop rect stays smooth (no per-frame JFA), but the line-art preview
   * catches up on its own shortly after the user stops, instead of only on
   * tab switch.
   */
  private armLineArtSettle(): void {
    this.lineArtActive = false
    if (this.lineArtSettleTimer !== null) clearTimeout(this.lineArtSettleTimer)
    this.lineArtSettleTimer = setTimeout(() => {
      this.lineArtSettleTimer = null
      this.setLineArtActive(true)
    }, 450)
  }

  setCropSizeListener(cb: ((size: { width: number; height: number }) => void) | null): void {
    this.onCropSizeChange = cb
    // Prefer resizeTarget (the "working resolution" Export's Original mode
    // means, see the resizeDirty block in render()) — falls back to
    // cropTarget only in the brief window before the first resize pass has
    // resolved.
    const size = this.resizeTarget ?? this.cropTarget
    if (cb && size) cb({ width: size.width, height: size.height })
  }

  setResizeParams(params: ResizeParams): void {
    this.resizeParams = params
    this.resizeDirty = true
    this.scheduleRender()
  }

  /**
   * Desktop-only Dual Pane toggle — when enabled, `render()`'s blit step resolves BOTH given
   * displayModes into an on-screen-only peek per pane (never fed back into the real chain — see
   * the dualPaneEnabled blit branch's own comment) and blits them side-by-side into a double-wide
   * canvas. lineArtOutputTarget/lineArtOutputTargetB (and colorTarget/colorTargetB built on top of
   * them) always resolve 'composite' regardless of `modes`, so readFinalPixels()/export are always
   * genuinely unaffected by Dual Pane's pane-mode selection now, not just by convention.
   */
  setDualPane(enabled: boolean, modes: [LineArtDisplayMode, LineArtDisplayMode]): void {
    const changed =
      this.dualPaneEnabled !== enabled || this.dualPaneModes[0] !== modes[0] || this.dualPaneModes[1] !== modes[1]
    this.dualPaneEnabled = enabled
    this.dualPaneModes = modes
    if (!changed) return
    // Forces a fresh render/blit so a pane-mode switch (or Dual Pane on/off) doesn't leave a stale
    // texture on screen. The real composite output doesn't actually depend on `modes` (only the
    // on-screen peek does), so this recompute is stricter than strictly necessary — kept anyway,
    // per CLAUDE.md's Recurring Gotchas on cache-gating bugs.
    this.lineArtDirty = true
    this.colorDirty = true
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  /** See gradeDualPaneEnabled's doc comment — no dirty-flag cascade needed, enhanceTarget/
   * colorTarget are already kept current every frame regardless of this flag. */
  setGradeDualPane(enabled: boolean): void {
    if (this.gradeDualPaneEnabled === enabled) return
    this.gradeDualPaneEnabled = enabled
    this.scheduleRender()
  }

  /**
   * Which pane (0 = colorTarget, 1 = colorTargetB) is the canonical "single result" while Dual
   * Pane is active — composite > overlay > original, same rule App.tsx's DUAL_PANE_PRIORITY_INDEX
   * applies for the corner-preview UI. Used by readFinalPixels (and available to the final blit)
   * whenever dual-pane needs to collapse down to one texture instead of showing both side by side.
   */
  private dualPanePriorityIndex(): 0 | 1 {
    const [modeA, modeB] = this.dualPaneModes
    return DISPLAY_MODE_PRIORITY[modeB] > DISPLAY_MODE_PRIORITY[modeA] ? 1 : 0
  }

  setPreviewMode(mode: 'original' | 'result'): void {
    if (this.previewMode === mode) return
    this.previewMode = mode
    // No stage is actually dirty — cropTarget/colorTarget are both already
    // current — this just needs the blit (Present) step at the end of
    // render() to re-run and pick the other texture.
    this.scheduleRender()
  }

  /** See tabPreviewBypass's doc comment. */
  setTabPreviewBypass(bypass: 'none' | 'enhance' | 'lineArtComposite' | 'exportPreview' | 'lineArtOverlay'): void {
    if (this.tabPreviewBypass === bypass) return
    this.tabPreviewBypass = bypass
    this.scheduleRender()
  }

  /** See exportDisplayMode/exportColorGrade/exportColorGradeIntensity's doc comments. */
  setExportPreviewParams(mode: ExportDisplayMode, colorGrade: boolean, colorGradeIntensity: number): void {
    if (this.exportDisplayMode === mode && this.exportColorGrade === colorGrade && this.exportColorGradeIntensity === colorGradeIntensity) return
    this.exportDisplayMode = mode
    this.exportColorGrade = colorGrade
    this.exportColorGradeIntensity = colorGradeIntensity
    this.exportPreviewDirty = true
    this.scheduleRender()
  }

  private renderScheduled = false

  /**
   * Coalesces to at most one render() per animation frame — a raw slider
   * `input` event fires far faster than Botan's JFA chain (~11 full-res
   * passes) can complete, and without this, a fast drag queued up a
   * backlog of full synchronous renders and visibly lagged behind the
   * finger. Ported from src/lab/labPipeline.ts, which solved the exact same
   * problem for the lab harness's dev-only sliders.
   */
  private scheduleRender(): void {
    if (this.renderScheduled) return
    this.renderScheduled = true
    requestAnimationFrame(() => {
      this.renderScheduled = false
      this.render()
    })
  }

  /**
   * The CSS box render()'s final blit contain-fits into — the canvas's *parent* element
   * (PreviewViewport.tsx's inset:0 centering wrapper), NOT the canvas's own
   * clientWidth/Height. The canvas element's box is an output of render() (it's sized from
   * this every frame), so reading clientWidth/Height off the canvas itself would be
   * self-referential — each render would measure its own previous output and could only ever
   * shrink, never recover once the container is actually large enough again. See also the
   * ResizeObserver in the constructor, which watches this same parent for the same reason.
   */
  private boxSize(fallbackWidth: number, fallbackHeight: number): { width: number; height: number } {
    const box = this.canvas.parentElement
    const width = box?.clientWidth || fallbackWidth
    const height = box?.clientHeight || fallbackHeight
    return { width, height }
  }

  private ensureTarget(existing: TargetTexture | null, width: number, height: number): TargetTexture {
    if (existing && existing.width === width && existing.height === height) return existing
    if (existing) disposeTargetTexture(this.gl, existing)
    return createTargetTexture(this.gl, width, height)
  }

  private ensureFloatTarget(existing: TargetTexture | null, width: number, height: number): TargetTexture {
    if (existing && existing.width === width && existing.height === height) return existing
    if (existing) disposeTargetTexture(this.gl, existing)
    return createFloatTargetTexture(this.gl, width, height)
  }

  private runPass(program: WebGLProgram, target: TargetTexture, width: number, height: number, setup: () => void): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.viewport(0, 0, width, height)
    gl.useProgram(program)
    bindFullscreenQuadAttribs(gl, program, this.quadBuffer)
    setup()
    drawFullscreenQuad(gl)
  }

  private runErosion(source: TargetTexture, radius: number, width: number, height: number): TargetTexture {
    const gl = this.gl
    this.erodeHTarget = this.ensureTarget(this.erodeHTarget, width, height)
    this.erodeVTarget = this.ensureTarget(this.erodeVTarget, width, height)
    const texelSize: [number, number] = [1 / width, 1 / height]

    this.runPass(this.erosionProgram, this.erodeHTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.erosionProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.erosionProgram, 'uTexelSize'), texelSize)
      gl.uniform1f(gl.getUniformLocation(this.erosionProgram, 'uRadius'), radius)
      gl.uniform2fv(gl.getUniformLocation(this.erosionProgram, 'uDirection'), [1, 0])
    })
    this.runPass(this.erosionProgram, this.erodeVTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.erodeHTarget!.texture)
      gl.uniform1i(gl.getUniformLocation(this.erosionProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.erosionProgram, 'uTexelSize'), texelSize)
      gl.uniform1f(gl.getUniformLocation(this.erosionProgram, 'uRadius'), radius)
      gl.uniform2fv(gl.getUniformLocation(this.erosionProgram, 'uDirection'), [0, 1])
    })
    return this.erodeVTarget
  }

  /** Sets every value uniform (not the uOriginal/uDetectionSource samplers — those vary by texture
   * unit per call site) fillTypeColor.frag.ts declares, on whichever shared program currently binds
   * it (fillMaskProgram/maskFillColorProgram/gradientMapProgram). Exists specifically so no call
   * site can forget one — see docs/oshiPFP-v0.3-tuningspecs.md's Gumi footnote on shared GL
   * programs silently leaking uniform state across call sites in the same render() pass. */
  /** Debug-only (see src/debug/renderTrace.ts) — sets an int uniform and immediately reads it back
   * via gl.getUniform so a trace can confirm what actually landed on the GPU, not just what the
   * JS call site intended to set. Cheap enough per-draw (one extra sync GL call) to leave wired
   * in dev builds; no-ops in prod via trace()'s own gate. */
  /** Debug-only companion to traceUniformSet — reads back a single center pixel of a target
   * texture right after it's rendered, so a trace can catch a genuinely different mask/seed
   * *content* (e.g. a texture-unit mix-up, stale cache) even when every uInvert uniform checks
   * out clean. RGBA8 targets only (float targets like seedTargetA/B need a different read path
   * and aren't sampled here). */
  private traceSamplePixel(tag: string, target: TargetTexture, extra: Record<string, unknown> = {}): void {
    if (!import.meta.env.DEV) return
    const gl = this.gl
    const buf = new Uint8Array(4)
    const cx = Math.floor(target.width / 2)
    const cy = Math.floor(target.height / 2)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.readPixels(cx, cy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf)
    trace(tag, { centerPixel: [buf[0], buf[1], buf[2], buf[3]], width: target.width, height: target.height, ...extra })
  }

  /** Debug-only, wider-coverage sibling of traceSamplePixel — a single center pixel can land on
   * a flat/background region that's identical across two renders even when the actual content
   * differs elsewhere (e.g. right where detected line-art draws), silently missing a real bug.
   * Samples a 5x5 grid spread across the target instead, plus a cheap additive checksum so two
   * traces can be eyeballed-compared at a glance without diffing 25 arrays by hand. */
  private traceSampleGrid(tag: string, target: TargetTexture, extra: Record<string, unknown> = {}): void {
    if (!import.meta.env.DEV) return
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    const buf = new Uint8Array(4)
    const points: number[][] = []
    let checksum = 0
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        const x = Math.floor(((gx + 0.5) / 5) * target.width)
        const y = Math.floor(((gy + 0.5) / 5) * target.height)
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf)
        points.push([buf[0], buf[1], buf[2], buf[3]])
        checksum += buf[0] + buf[1] + buf[2] + buf[3]
      }
    }
    trace(tag, { checksum, points, width: target.width, height: target.height, ...extra })
  }

  private traceUniformSet(
    tag: string,
    program: WebGLProgram,
    uniformName: string,
    intendedValue: number,
    extra: Record<string, unknown> = {},
  ): void {
    if (!import.meta.env.DEV) return
    const gl = this.gl
    const loc = gl.getUniformLocation(program, uniformName)
    const actual = loc ? gl.getUniform(program, loc) : null
    trace(tag, { uniform: uniformName, intended: intendedValue, actualOnGpu: actual, ...extra })
  }

  private setFillTypeColorUniforms(
    program: WebGLProgram,
    opts: {
      fillType: 'image' | 'solid' | 'gradient'
      solidColor: [number, number, number]
      shadowColor: [number, number, number]
      midColor: [number, number, number]
      highlightColor: [number, number, number]
      pivot: number
      duoTone: boolean
      vividBoost: number
      vividDeadzone: number
      colorContrast: number
    },
  ): void {
    const gl = this.gl
    gl.uniform1i(gl.getUniformLocation(program, 'uFillType'), FILL_TYPE_INT[opts.fillType])
    gl.uniform3fv(gl.getUniformLocation(program, 'uSolidColor'), opts.solidColor)
    gl.uniform3fv(gl.getUniformLocation(program, 'uShadowColor'), opts.shadowColor)
    gl.uniform3fv(gl.getUniformLocation(program, 'uMidColor'), opts.midColor)
    gl.uniform3fv(gl.getUniformLocation(program, 'uHighlightColor'), opts.highlightColor)
    gl.uniform1f(gl.getUniformLocation(program, 'uGradientPivot'), opts.pivot)
    gl.uniform1i(gl.getUniformLocation(program, 'uGradientDuoTone'), opts.duoTone ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uVividBoost'), opts.vividBoost)
    gl.uniform1f(gl.getUniformLocation(program, 'uVividDeadzone'), opts.vividDeadzone)
    gl.uniform1f(gl.getUniformLocation(program, 'uColorContrast'), opts.colorContrast)
  }

  private runDenoise(base: TargetTexture, width: number, height: number): TargetTexture {
    if (this.lineArt.denoise.intensity <= 0) return base
    const gl = this.gl
    this.denoisedTarget = this.ensureTarget(this.denoisedTarget, width, height)
    const kernelSize = Math.min(5, Math.max(1, Math.floor(this.lineArt.denoise.intensity * 5)))
    this.runPass(this.denoiseProgram, this.denoisedTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, base.texture)
      gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.denoiseProgram, 'uTexelSize'), [1 / width, 1 / height])
      gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uKernelSize'), kernelSize)
      gl.uniform1f(gl.getUniformLocation(this.denoiseProgram, 'uThreshold'), this.lineArt.denoise.threshold)
    })
    return this.denoisedTarget
  }

  /**
   * Line Art pre-processing "Color Lift" — see colorLift.frag.ts. Runs on
   * correctedTarget (post tone-shaping), before denoise, so it only ever
   * affects the line-processor's detection input, never Color/Export's
   * base image. Skipped entirely when every band is at 0 (identity), same
   * "no-op costs nothing" convention as runEnhance's smooth/sharpen steps.
   */
  private runColorLift(base: TargetTexture, cl: ColorLiftParams, width: number, height: number): TargetTexture {
    if (
      cl.red === 0 && cl.orange === 0 && cl.yellow === 0 && cl.green === 0 &&
      cl.teal === 0 && cl.blue === 0 && cl.purple === 0 && cl.magenta === 0
    ) {
      return base
    }
    const gl = this.gl
    this.colorLiftTarget = this.ensureTarget(this.colorLiftTarget, width, height)
    this.runPass(this.colorLiftProgram, this.colorLiftTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, base.texture)
      gl.uniform1i(gl.getUniformLocation(this.colorLiftProgram, 'uSource'), 0)
      gl.uniform1fv(
        gl.getUniformLocation(this.colorLiftProgram, 'uLift'),
        new Float32Array([cl.red, cl.orange, cl.yellow, cl.green, cl.teal, cl.blue, cl.purple, cl.magenta]),
      )
    })
    return this.colorLiftTarget
  }

  /**
   * Crop-tab enhancement: Smooth (the same edge-aware range filter as
   * LineArtParams.denoise, reused here rather than duplicated — see
   * runDenoise/denoise.frag.ts, with a fixed mid-range threshold since this
   * is a single "how much" slider, not the 2-knob Line Art version) then
   * Sharpen (a standard unsharp mask: box-blur the smoothed result, then
   * push away from it — see unsharpMask.frag.ts). Runs before Color and
   * Line Art, so both stages — and the final export — see the enhanced
   * image, not just the algorithm's internal edge detection (contrast this
   * with LineArtParams.denoise, which never touches the visible output).
   * Either step is skipped entirely at 0 (returns the input unchanged) so
   * the identity/default case costs nothing extra.
   *
   * Smooth's slider range is 0-3: the range filter's spatial kernel already
   * saturates at 5 texels (MAX_KERNEL in denoise.frag.ts) by slider value
   * 1, so past that point only uThreshold (the range-filter's color-
   * distance gate) has any further room to push — widening it lets the
   * filter blend across the small color jumps a JPEG block edge produces.
   * Kernel size still caps at slider value 1; only the threshold keeps
   * climbing above it.
   */
  private runEnhance(source: TargetTexture, width: number, height: number): TargetTexture {
    const gl = this.gl
    const texelSize: [number, number] = [1 / width, 1 / height]
    let current = source

    if (this.enhance.smooth > 0) {
      this.smoothTarget = this.ensureTarget(this.smoothTarget, width, height)
      const kernelSize = Math.min(5, Math.max(1, Math.round(Math.min(this.enhance.smooth, 1) * 5)))
      const threshold = 0.15 + Math.min(this.enhance.smooth, 1) * 0.15 + Math.max(0, this.enhance.smooth - 1) * 0.35
      this.runPass(this.denoiseProgram, this.smoothTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, current.texture)
        gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.denoiseProgram, 'uTexelSize'), texelSize)
        gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uKernelSize'), kernelSize)
        gl.uniform1f(gl.getUniformLocation(this.denoiseProgram, 'uThreshold'), threshold)
      })
      current = this.smoothTarget
    }

    if (this.enhance.sharpen > 0) {
      this.sharpenBlurHTarget = this.ensureTarget(this.sharpenBlurHTarget, width, height)
      this.sharpenBlurVTarget = this.ensureTarget(this.sharpenBlurVTarget, width, height)
      const blurRadius = 1.5
      this.runPass(this.boxBlurProgram, this.sharpenBlurHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, current.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
      })
      this.runPass(this.boxBlurProgram, this.sharpenBlurVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.sharpenBlurHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
      })
      this.sharpenTarget = this.ensureTarget(this.sharpenTarget, width, height)
      this.runPass(this.unsharpMaskProgram, this.sharpenTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, current.texture)
        gl.uniform1i(gl.getUniformLocation(this.unsharpMaskProgram, 'uSource'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.sharpenBlurVTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.unsharpMaskProgram, 'uBlurred'), 1)
        gl.uniform1f(gl.getUniformLocation(this.unsharpMaskProgram, 'uAmount'), this.enhance.sharpen)
      })
      current = this.sharpenTarget
    }

    return current
  }

  /**
   * 4-point plateau/feather luminance-band ramp (see plateauRamp.frag.ts) —
   * Dual Line's per-band detection stage.
   * Ported from labPipeline.ts's runPlateauRamp. Takes explicit ramp points
   * (PlateauRampPoints, matching pinchToPlateau()'s output) rather than
   * reading fixed p.gumiRamp* fields, since Dual Line calls this twice per
   * frame with two different bands' points.
   */
  private runPlateauRamp(source: TargetTexture, points: PlateauRampPoints, width: number, height: number): TargetTexture {
    const gl = this.gl
    this.rampTarget = this.ensureTarget(this.rampTarget, width, height)
    this.runPass(this.plateauRampProgram, this.rampTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.plateauRampProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uFloor'), points.floor)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uInnerLow'), points.innerLow)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uInnerHigh'), points.innerHigh)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uCeiling'), points.ceiling)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uFeather'), points.feather)
    })
    return this.rampTarget
  }

  /**
   * Gumi (Path G)'s JFA distance transform, shared by both its final
   * treatments (hard blob suppression and the color-bleed style) — see
   * labPipeline.ts's runGumiDistanceTransform. Reuses the same
   * distanceSeedProgram/jfaStepProgram Botan's own inline JFA loop uses,
   * just seeded from a different side of the mask (uInvert).
   */
  private runGumiDistanceTransform(source: TargetTexture, invert: boolean, width: number, height: number): TargetTexture {
    const gl = this.gl
    const texelSize: [number, number] = [1 / width, 1 / height]
    this.gumiSeedTargetA = this.ensureFloatTarget(this.gumiSeedTargetA, width, height)
    this.gumiSeedTargetB = this.ensureFloatTarget(this.gumiSeedTargetB, width, height)
    this.runPass(this.distanceSeedProgram, this.gumiSeedTargetA, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.distanceSeedProgram, 'uMask'), 0)
      gl.uniform1i(gl.getUniformLocation(this.distanceSeedProgram, 'uInvert'), invert ? 1 : 0)
    })
    let gSrc = this.gumiSeedTargetA
    let gDst = this.gumiSeedTargetB
    const passes = Math.max(1, Math.ceil(Math.log2(Math.max(width, height))))
    for (let i = 0; i < passes; i++) {
      const step = Math.pow(2, passes - 1 - i)
      this.runPass(this.jfaStepProgram, gDst, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, gSrc.texture)
        gl.uniform1i(gl.getUniformLocation(this.jfaStepProgram, 'uSeed'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.jfaStepProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.jfaStepProgram, 'uStep'), step)
      })
      ;[gSrc, gDst] = [gDst, gSrc]
    }
    this.gumiSeedTargetA = gSrc
    this.gumiSeedTargetB = gDst
    return gSrc
  }

  /**
   * Gumi Line mode's optical post-process — deliberately not touching the
   * detection/blob-suppression algorithm itself, per product direction: two independent,
   * skippable-at-default refinements layered on the finished blob mask.
   *
   * Overdrive ("expansion"): a true morphological dilate — separable min-filter grow (same
   * minFilter1D.frag.ts mode=0 mechanism Gap Closing's own grow half and Botan's grow chain
   * already use), not the box-blur-then-rethreshold this started as. That first version
   * averaged instead of taking an extremum, which has a real ceiling for thin/sparse strokes:
   * past a radius where a thin dark line's blurred local average can no longer dip below the
   * rethreshold cutoff, it doesn't keep growing, it erases (confirmed empirically — read as a
   * "shrink filter," logged as a candidate for a future erode/fine-detail-removal feature
   * instead). A min-filter dilate has no such ceiling: it only ever grows monotonically with
   * radius, since it picks the darkest neighbor rather than averaging. uRadius is rounded to
   * an int (minFilter1D's own loop bound is `int`, matching gumiRadius's existing convention
   * elsewhere in this file). 0 = off.
   *
   * Hardness: reused from Botan/Chie's shared field with a different meaning here (see
   * types.ts) — box-blurs the mask (after Overdrive, if any) by a fixed max radius and mixes
   * it back in via mixBlend.frag.ts, softening the edge instead of leaving it hard-antialiased.
   * 1 (default) = untouched: hardness < 1 gate skips both blur passes entirely, so nothing runs.
   */
  private readonly GUMI_HARDNESS_MAX_BLUR = 6

  private runGumiLinePostProcess(source: TargetTexture, p: LineArtParams, width: number, height: number): TargetTexture {
    const gl = this.gl
    const texelSize: [number, number] = [1 / width, 1 / height]
    let current = source

    if (p.gumiOverdrive > 0) {
      this.gumiOverdriveHTarget = this.ensureTarget(this.gumiOverdriveHTarget, width, height)
      this.gumiOverdriveVTarget = this.ensureTarget(this.gumiOverdriveVTarget, width, height)
      // Uses minFilterContinuousProgram (its own private program, not the shared minFilterProgram)
      // for genuine sub-texel float precision — p.gumiOverdrive flows through unrounded. uMode
      // stays explicitly 0 (min = grow ink in this polarity) on both passes — see
      // minFilterContinuous.frag.ts's doc comment for why this is a separate program.
      this.runPass(this.minFilterContinuousProgram, this.gumiOverdriveHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, current.texture)
        gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.minFilterContinuousProgram, 'uRadius'), p.gumiOverdrive)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uDirection'), [1, 0])
        gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uMode'), 0)
      })
      this.runPass(this.minFilterContinuousProgram, this.gumiOverdriveVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiOverdriveHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.minFilterContinuousProgram, 'uRadius'), p.gumiOverdrive)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uDirection'), [0, 1])
        gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uMode'), 0)
      })
      current = this.gumiOverdriveVTarget
    }

    if (p.hardness < 1) {
      this.gumiHardnessHTarget = this.ensureTarget(this.gumiHardnessHTarget, width, height)
      this.gumiHardnessVTarget = this.ensureTarget(this.gumiHardnessVTarget, width, height)
      const blurRadius = this.GUMI_HARDNESS_MAX_BLUR * (1 - p.hardness)
      this.runPass(this.boxBlurProgram, this.gumiHardnessHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, current.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
      })
      this.runPass(this.boxBlurProgram, this.gumiHardnessVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiHardnessHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
      })
      this.gumiHardnessMixTarget = this.ensureTarget(this.gumiHardnessMixTarget, width, height)
      this.runPass(this.mixBlendProgram, this.gumiHardnessMixTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, current.texture)
        gl.uniform1i(gl.getUniformLocation(this.mixBlendProgram, 'uBase'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiHardnessVTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.mixBlendProgram, 'uOverlay'), 1)
        gl.uniform1f(gl.getUniformLocation(this.mixBlendProgram, 'uOpacity'), 1 - p.hardness)
      })
      current = this.gumiHardnessMixTarget
    }

    return current
  }

  /**
   * Dual Line's per-band chain — runs one full
   * ramp->contrastBoost->threshold->grow->JFA->blob->postprocess->fillColor pass for a single
   * simplified luminance band (Black or White), producing one colored+alpha layer. Called twice
   * per frame (once per band) from the pathG branch's Dual Line path, sequentially reusing
   * Gumi's existing single-band scratch fields (rampTarget, gumiBoostTarget, gumiMaskTarget,
   * gumiMaxHTarget/VTarget, gumiSeedTargetA/B, gumiBlobTarget, and runGumiLinePostProcess's own
   * scratch targets) — safe because each band's result is fully consumed into its own dedicated
   * `finalTarget` before the next band's first pass starts overwriting the shared scratch chain,
   * the same pattern gumiMaxHTarget/VTarget (H-then-V) already use every frame. Deliberately
   * skips Gap Closing (a deprecated prototype, out of scope here) — closedMaskTarget is always
   * the raw grow output.
   */
  private runGumiDualBand(
    detectionSource: TargetTexture,
    base: TargetTexture,
    width: number,
    height: number,
    p: LineArtParams,
    pinch: PinchModeParams,
    fillType: 'image' | 'solid',
    solidColor: [number, number, number],
    invert: boolean,
    colorContrast: number,
    finalTarget: TargetTexture | null,
  ): TargetTexture {
    const gl = this.gl
    const texelSize: [number, number] = [1 / width, 1 / height]

    const points = pinchToPlateau(pinch)
    const ramp = this.runPlateauRamp(detectionSource, points, width, height)

    this.gumiBoostTarget = this.ensureTarget(this.gumiBoostTarget, width, height)
    this.runPass(this.colorCorrectProgram, this.gumiBoostTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, ramp.texture)
      gl.uniform1i(gl.getUniformLocation(this.colorCorrectProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uExposure'), 0)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uContrast'), p.gumiContrastBoost)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uBlackClip'), 0)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uWhiteClip'), 1)
    })

    this.gumiMaskTarget = this.ensureTarget(this.gumiMaskTarget, width, height)
    if (p.gumiSoftDetection) {
      this.runPass(this.softThresholdProgram, this.gumiMaskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiBoostTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uThreshold'), p.threshold)
        gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uSoftness'), p.gumiSoftness)
        gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uInvert'), 1)
      })
    } else {
      this.runPass(this.thresholdProgram, this.gumiMaskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiBoostTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), p.threshold)
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), 1)
      })
    }

    this.gumiMaxHTarget = this.ensureTarget(this.gumiMaxHTarget, width, height)
    this.gumiMaxVTarget = this.ensureTarget(this.gumiMaxVTarget, width, height)
    this.runPass(this.minFilterContinuousProgram, this.gumiMaxHTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.gumiMaskTarget!.texture)
      gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uTexelSize'), texelSize)
      gl.uniform1f(gl.getUniformLocation(this.minFilterContinuousProgram, 'uRadius'), p.radius)
      gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uDirection'), [1, 0])
      gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uMode'), 1)
    })
    this.runPass(this.minFilterContinuousProgram, this.gumiMaxVTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.gumiMaxHTarget!.texture)
      gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uTexelSize'), texelSize)
      gl.uniform1f(gl.getUniformLocation(this.minFilterContinuousProgram, 'uRadius'), p.radius)
      gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uDirection'), [0, 1])
      gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uMode'), 1)
    })
    const closedMaskTarget = this.gumiMaxVTarget

    const seed = this.runGumiDistanceTransform(closedMaskTarget, true, width, height)
    this.gumiBlobTarget = this.ensureTarget(this.gumiBlobTarget, width, height)
    this.runPass(this.blobMaskProgram, this.gumiBlobTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, seed.texture)
      gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uSeed'), 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, closedMaskTarget.texture)
      gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uMask'), 1)
      gl.uniform1f(gl.getUniformLocation(this.blobMaskProgram, 'uBlobMaxDt'), p.blobMaxDt)
      gl.uniform1f(gl.getUniformLocation(this.blobMaskProgram, 'uGamma'), p.gumiBlobGamma)
      gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uSoftOutput'), p.gumiSoftDetection ? 1 : 0)
    })

    const postProcessed = this.runGumiLinePostProcess(this.gumiBlobTarget, p, width, height)

    finalTarget = this.ensureTarget(finalTarget, width, height)
    this.runPass(this.maskFillColorProgram, finalTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, postProcessed.texture)
      gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMask'), 0)
      gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMaskChannel'), 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, base.texture)
      gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uOriginal'), 1)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
      gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uDetectionSource'), 2)
      gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uFillType'), FILL_TYPE_INT[fillType])
      gl.uniform3fv(gl.getUniformLocation(this.maskFillColorProgram, 'uSolidColor'), solidColor)
      // Dual Line has no gradient UI for either band, but every uniform maskFillColorProgram
      // declares must still be set explicitly per the shared-uniform-leak rule — pass Gumi's
      // existing (unused here) gradient fields through unchanged, harmless since uFillType never
      // selects 'gradient' for these two bands.
      gl.uniform3fv(gl.getUniformLocation(this.maskFillColorProgram, 'uShadowColor'), p.gumiGradientShadow)
      gl.uniform3fv(gl.getUniformLocation(this.maskFillColorProgram, 'uMidColor'), p.gumiGradientMid)
      gl.uniform3fv(gl.getUniformLocation(this.maskFillColorProgram, 'uHighlightColor'), p.gumiGradientHighlight)
      gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uInvert'), invert ? 1 : 0)
      gl.uniform1f(gl.getUniformLocation(this.maskFillColorProgram, 'uGradientPivot'), 0)
      gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uGradientDuoTone'), 0)
      gl.uniform1f(gl.getUniformLocation(this.maskFillColorProgram, 'uVividBoost'), 1)
      gl.uniform1f(gl.getUniformLocation(this.maskFillColorProgram, 'uVividDeadzone'), 1)
      gl.uniform1f(gl.getUniformLocation(this.maskFillColorProgram, 'uColorContrast'), colorContrast)
    })
    return finalTarget
  }

  /**
   * Shared "Hardness" soft-only post-process — Daiya/Fumiko's own answer to Botan/Chie's
   * `hardnessToFeather` (which reshapes those algorithms' own antialiasing width during shape
   * generation, not applicable here since Daiya's threshold+grow mask and Fumiko's post-erosion
   * edge map don't have an equivalent feather parameter to tune). Reuses Gumi Line mode's exact
   * box-blur+mixBlend recipe (`runGumiLinePostProcess` above), but remapped so the shared
   * `hardness` field's default (0, matching Botan/Chie's own slider default) is the neutral
   * no-op point instead of Gumi's own `1`: negative values blur (mixed in at `-hardness`
   * strength, same `HARDNESS_MAX_BLUR` radius ceiling as Gumi); non-negative values are a no-op,
   * since these algorithms' masks are already at their hardest/crispest by construction (a plain
   * threshold or erosion cutoff). Deliberately blur-only, not bidirectional sharpen+blur — true
   * sharpening would need a different primitive (morphological erode) not easily doable within
   * the existing per-algorithm mask shapes.
   */
  private readonly HARDNESS_MAX_BLUR = 6

  private runSoftHardness(source: TargetTexture, hardness: number, width: number, height: number): TargetTexture {
    if (hardness >= 0) return source
    const gl = this.gl
    const texelSize: [number, number] = [1 / width, 1 / height]
    const blurRadius = this.HARDNESS_MAX_BLUR * -hardness
    this.softHardnessHTarget = this.ensureTarget(this.softHardnessHTarget, width, height)
    this.softHardnessVTarget = this.ensureTarget(this.softHardnessVTarget, width, height)
    this.runPass(this.boxBlurProgram, this.softHardnessHTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
      gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
      gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
    })
    this.runPass(this.boxBlurProgram, this.softHardnessVTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.softHardnessHTarget!.texture)
      gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
      gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
      gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
    })
    this.softHardnessMixTarget = this.ensureTarget(this.softHardnessMixTarget, width, height)
    this.runPass(this.mixBlendProgram, this.softHardnessMixTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.mixBlendProgram, 'uBase'), 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.softHardnessVTarget!.texture)
      gl.uniform1i(gl.getUniformLocation(this.mixBlendProgram, 'uOverlay'), 1)
      gl.uniform1f(gl.getUniformLocation(this.mixBlendProgram, 'uOpacity'), -hardness)
    })
    return this.softHardnessMixTarget
  }

  /**
   * Composite-readiness remap for Path H/I's raw output — see toneRemap.frag.ts. Followed by a
   * saturation/hue-invert polish pass — both highPassDiff.frag.ts
   * and toneRemap.frag.ts operate per-channel rather than on collapsed luminance, so real
   * (often undesired) chromatic fringing survives into this output; hiToneSaturation/
   * hiToneHueInvert give a way to tame or flip it. Neutral at defaults (saturation=1,
   * hueInvert=false), so Tsukiko (which shares this method) is unaffected until touched.
   */
  private runToneRemap(source: TargetTexture, target: 'multiply' | 'screen', p: LineArtParams, width: number, height: number): TargetTexture {
    const gl = this.gl
    this.toneRemapTarget = this.ensureTarget(this.toneRemapTarget, width, height)
    this.runPass(this.toneRemapProgram, this.toneRemapTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.toneRemapProgram, 'uSource'), 0)
      gl.uniform1i(gl.getUniformLocation(this.toneRemapProgram, 'uTarget'), target === 'screen' ? 1 : 0)
      gl.uniform1f(gl.getUniformLocation(this.toneRemapProgram, 'uGain'), p.hiToneGain)
      gl.uniform1f(gl.getUniformLocation(this.toneRemapProgram, 'uContrast'), p.hiToneContrast)
    })
    this.saturationTarget = this.ensureTarget(this.saturationTarget, width, height)
    this.runPass(this.saturationAdjustProgram, this.saturationTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.toneRemapTarget!.texture)
      gl.uniform1i(gl.getUniformLocation(this.saturationAdjustProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.saturationAdjustProgram, 'uSaturation'), p.hiToneSaturation)
      gl.uniform1i(gl.getUniformLocation(this.saturationAdjustProgram, 'uHueInvert'), p.hiToneHueInvert ? 1 : 0)
    })
    return this.saturationTarget
  }

  /**
   * "Darken / Lighten" + "Contrast" macros for the Emboss/Raw
   * treatment. Reuses colorCorrectProgram (no new shader): `hiRawDarkenLighten` (-1..1) maps to
   * `uBlackClip`/`uWhiteClip` only — negative crushes everything below `-hiRawDarkenLighten` to
   * black, positive crushes everything above `1-hiRawDarkenLighten` to white. `hiRawContrast`
   * (default 1) drives the same pivoted-at-0.5 curve every other "contrast" slider in
   * this codebase uses. At defaults (0, 1) this is `blackClip=0, whiteClip=1, contrast=1`, the
   * exact identity.
   */
  private runHiRawDarkenLighten(source: TargetTexture, p: LineArtParams, width: number, height: number): TargetTexture {
    if (p.hiRawDarkenLighten === 0 && p.hiRawContrast === 1) return source
    const gl = this.gl
    const s = Math.max(-1, Math.min(1, p.hiRawDarkenLighten))
    const blackClip = s < 0 ? -s : 0
    const whiteClip = s > 0 ? 1 - s : 1
    this.hiRawTreatedTarget = this.ensureTarget(this.hiRawTreatedTarget, width, height)
    this.runPass(this.colorCorrectProgram, this.hiRawTreatedTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.colorCorrectProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uExposure'), 0)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uContrast'), p.hiRawContrast)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uBlackClip'), blackClip)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uWhiteClip'), whiteClip)
    })
    return this.hiRawTreatedTarget
  }

  /**
   * Edge's independent per-polarity fill-type resolution, a
   * separate final pass after responsiveEdgeColor.frag.ts's (and Grow's, if active) shape
   * decision — see edgeFillColor.frag.ts's doc comment for why no upstream shader changes were
   * needed. Defaults (dark-side solid white, light-side solid black).
   */
  private runEdgeFillColor(source: TargetTexture, p: LineArtParams, base: TargetTexture, width: number, height: number): TargetTexture {
    const gl = this.gl
    this.edgeFillColorTarget = this.ensureTarget(this.edgeFillColorTarget, width, height)
    this.runPass(this.edgeFillColorProgram, this.edgeFillColorTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.edgeFillColorProgram, 'uInk'), 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, base.texture)
      gl.uniform1i(gl.getUniformLocation(this.edgeFillColorProgram, 'uOriginal'), 1)
      gl.uniform1i(gl.getUniformLocation(this.edgeFillColorProgram, 'uDarkFillType'), p.edgeInkOverDarkFillType === 'solid' ? 1 : 0)
      gl.uniform3fv(gl.getUniformLocation(this.edgeFillColorProgram, 'uDarkSolidColor'), p.edgeInkOverDarkSolidColor)
      gl.uniform1i(gl.getUniformLocation(this.edgeFillColorProgram, 'uLightFillType'), p.edgeInkOverLightFillType === 'solid' ? 1 : 0)
      gl.uniform3fv(gl.getUniformLocation(this.edgeFillColorProgram, 'uLightSolidColor'), p.edgeInkOverLightSolidColor)
    })
    return this.edgeFillColorTarget
  }

  /**
   * Runs the full Botan/Chie/Daiya/Fumiko/Gumi/Hinata/Inori algorithm chain
   * and returns the raw mask/ink output — see labPipeline.ts's render() for
   * the per-algorithm rationale this ports verbatim. Deliberately stops
   * short of resolving LineArtParams.displayMode (see resolveLineArtDisplay
   * below): the algorithm chain itself doesn't depend on displayMode, so
   * Dual Pane can call this once and resolveLineArtDisplay twice instead of
   * paying for the (expensive, e.g. Botan's ~11-pass JFA) algorithm chain
   * twice just to show two different views of the same result.
   */
  private computeLineArtRaw(base: TargetTexture, width: number, height: number): TargetTexture {
    const gl = this.gl
    const p = this.lineArt
    const texelSize: [number, number] = [1 / width, 1 / height]

    this.correctedTarget = this.ensureTarget(this.correctedTarget, width, height)
    const ts = p.toneShaping
    if (ts.mode === 'pinch') {
      // Exposure/contrast apply the same way regardless of ramp mode — run
      // them first through an identity-clip colorCorrect pass, then feed
      // that into the plateau ramp for the pinch band isolation itself
      // (see src/tone/pinchRamp.ts for the position/expand/feathering ->
      // floor/innerLow/innerHigh/ceiling/feather mapping).
      this.toneExposureTarget = this.ensureTarget(this.toneExposureTarget, width, height)
      this.runPass(this.colorCorrectProgram, this.toneExposureTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, base.texture)
        gl.uniform1i(gl.getUniformLocation(this.colorCorrectProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uExposure'), ts.exposure)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uContrast'), Math.min(3, Math.max(0.2, 1 + ts.contrast)))
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uBlackClip'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uWhiteClip'), 1)
      })
      const plateau = pinchToPlateau(ts.pinchMode)
      this.runPass(this.plateauRampProgram, this.correctedTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.toneExposureTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.plateauRampProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uFloor'), plateau.floor)
        gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uInnerLow'), plateau.innerLow)
        gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uInnerHigh'), plateau.innerHigh)
        gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uCeiling'), plateau.ceiling)
        gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uFeather'), plateau.feather)
      })
    } else {
      this.runPass(this.colorCorrectProgram, this.correctedTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, base.texture)
        gl.uniform1i(gl.getUniformLocation(this.colorCorrectProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uExposure'), ts.exposure)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uContrast'), Math.min(3, Math.max(0.2, 1 + ts.contrast)))
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uBlackClip'), ts.clipMode.blackClip)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uWhiteClip'), ts.clipMode.whiteClip)
      })
    }

    const cl = p.colorLift
    const liftedTarget = this.runColorLift(this.correctedTarget, cl, width, height)
    const detectionSource = this.runDenoise(liftedTarget, width, height)

    let outputTarget: TargetTexture = base

    if (p.mode === 'pathB') {
      this.distanceMaskTarget = this.ensureTarget(this.distanceMaskTarget, width, height)

      const seedStale =
        this.botanSeedDirty || !this.botanSeedTarget || this.botanSeedTarget.width !== width || this.botanSeedTarget.height !== height
      trace('render:pathB-entry', { fillInvert: p.fillInvert, fillType: p.fillType, seedStale, botanSeedDirty: this.botanSeedDirty })

      if (seedStale) {
      this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
      this.seedTargetA = this.ensureFloatTarget(this.seedTargetA, width, height)
      this.seedTargetB = this.ensureFloatTarget(this.seedTargetB, width, height)

      this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), p.threshold)
        // Explicit uInvert set — see CLAUDE.md Recurring Gotchas (shared-uniform-leak class).
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), 0)
        this.traceUniformSet('gl:thresholdProgram(Botan)', this.thresholdProgram, 'uInvert', 0, {
          mode: p.mode,
          threshold: p.threshold,
        })
      })
      this.traceSamplePixel('gl:maskTarget-after-threshold(Botan)', this.maskTarget!, { mode: p.mode })
      this.runPass(this.distanceSeedProgram, this.seedTargetA, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.maskTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.distanceSeedProgram, 'uMask'), 0)
        // Explicit uInvert set — see CLAUDE.md Recurring Gotchas (shared-uniform-leak class).
        gl.uniform1i(gl.getUniformLocation(this.distanceSeedProgram, 'uInvert'), 0)
        this.traceUniformSet('gl:distanceSeedProgram(Botan)', this.distanceSeedProgram, 'uInvert', 0, { mode: p.mode })
      })

      const numPasses = Math.max(1, Math.ceil(Math.log2(Math.max(width, height))))
      let src = this.seedTargetA
      let dst = this.seedTargetB
      for (let i = 0; i < numPasses; i++) {
        const step = Math.pow(2, numPasses - 1 - i)
        this.runPass(this.jfaStepProgram, dst, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, src.texture)
          gl.uniform1i(gl.getUniformLocation(this.jfaStepProgram, 'uSeed'), 0)
          gl.uniform2fv(gl.getUniformLocation(this.jfaStepProgram, 'uTexelSize'), texelSize)
          gl.uniform1f(gl.getUniformLocation(this.jfaStepProgram, 'uStep'), step)
        })
        ;[src, dst] = [dst, src]
      }
      this.seedTargetA = src
      this.seedTargetB = dst
      this.botanSeedTarget = src
      this.botanSeedDirty = false
      }

      // fillType === 'image' keeps shape+color fused in this one pass (uColorExpansion driven by
      // fillType, uInvert added directly here) — the continuous distance-transform falloff and
      // Color Contrast's in-place recolor aren't separable into a discrete post step without
      // changing Botan's default look. 'solid'/'gradient' only need the plain alpha (color
      // discarded, resolved by the shared maskFillColorProgram pass below instead).
      const feather = hardnessToFeather(p.hardness, HARDNESS_BASE_MAX_FEATHER.pathB!)
      const botanFused = p.fillType === 'image'
      this.runPass(this.distanceToEdgeProgram, this.distanceMaskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.botanSeedTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uSeed'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, base.texture)
        gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uOriginal'), 1)
        gl.uniform2fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uTexSize'), [width, height])
        gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uRadius'), p.radius)
        gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uFeather'), feather)
        gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uGamma'), p.blobContrast)
        gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorContrast'), p.colorContrast)
        gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorExpansion'), botanFused ? 1 : 0)
        gl.uniform3fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uLineColor'), p.tintColor)
        gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uInvert'), botanFused && p.fillInvert ? 1 : 0)
        this.traceUniformSet('gl:distanceToEdgeProgram', this.distanceToEdgeProgram, 'uInvert', botanFused && p.fillInvert ? 1 : 0, {
          mode: p.mode,
          fillType: p.fillType,
          fillInvert: p.fillInvert,
          botanFused,
        })
      })
      this.traceSamplePixel('gl:distanceMaskTarget-after-distanceToEdge(Botan)', this.distanceMaskTarget!, {
        mode: p.mode,
        fillType: p.fillType,
        fillInvert: p.fillInvert,
        botanFused,
      })

      if (botanFused) {
        outputTarget = this.distanceMaskTarget
      } else {
        this.botanFillColorTarget = this.ensureTarget(this.botanFillColorTarget, width, height)
        this.runPass(this.maskFillColorProgram, this.botanFillColorTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.distanceMaskTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMask'), 0)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMaskChannel'), 1)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uOriginal'), 1)
          gl.activeTexture(gl.TEXTURE2)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uDetectionSource'), 2)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uInvert'), p.fillInvert ? 1 : 0)
          this.traceUniformSet('gl:maskFillColorProgram(Botan)', this.maskFillColorProgram, 'uInvert', p.fillInvert ? 1 : 0, {
            mode: p.mode,
            fillType: p.fillType,
            fillInvert: p.fillInvert,
          })
          this.setFillTypeColorUniforms(this.maskFillColorProgram, {
            fillType: p.fillType,
            solidColor: p.tintColor,
            shadowColor: p.gradientShadow,
            midColor: p.gradientMid,
            highlightColor: p.gradientHighlight,
            pivot: p.gradientPivot,
            duoTone: p.gradientDuoTone,
            vividBoost: 1,
            vividDeadzone: 1,
            colorContrast: 1,
          })
        })
        outputTarget = this.botanFillColorTarget
      }
    } else if (p.mode === 'pathC') {
      const eroded = this.runErosion(base, p.radius, width, height)
      this.gateTarget = this.ensureTarget(this.gateTarget, width, height)
      const feather = hardnessToFeather(p.hardness, HARDNESS_BASE_MAX_FEATHER.pathC!)
      this.runPass(this.erosionGateProgram, this.gateTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, base.texture)
        gl.uniform1i(gl.getUniformLocation(this.erosionGateProgram, 'uOriginal'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, eroded.texture)
        gl.uniform1i(gl.getUniformLocation(this.erosionGateProgram, 'uEroded'), 1)
        gl.uniform1f(gl.getUniformLocation(this.erosionGateProgram, 'uGateThreshold'), p.gateThreshold)
        gl.uniform1f(gl.getUniformLocation(this.erosionGateProgram, 'uFeather'), feather)
      })

      // erosionGateProgram's own output color (.rgb = eroded) is discarded here, only its .a (gate strength, already an
      // ink-weight-direct convention like distanceToEdge's — see maskFillColor.frag.ts's uMaskChannel) is used.
      this.chieFillColorTarget = this.ensureTarget(this.chieFillColorTarget, width, height)
      this.runPass(this.maskFillColorProgram, this.chieFillColorTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gateTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMask'), 0)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMaskChannel'), 1)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, base.texture)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uOriginal'), 1)
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uDetectionSource'), 2)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uInvert'), p.fillInvert ? 1 : 0)
        this.setFillTypeColorUniforms(this.maskFillColorProgram, {
          fillType: p.fillType,
          solidColor: p.tintColor,
          shadowColor: p.gradientShadow,
          midColor: p.gradientMid,
          highlightColor: p.gradientHighlight,
          pivot: p.gradientPivot,
          duoTone: p.gradientDuoTone,
          vividBoost: 1,
          vividDeadzone: 1,
          colorContrast: p.colorContrast,
        })
      })
      outputTarget = this.chieFillColorTarget
    } else if (p.mode === 'pathD') {
      // Uses Botan's JFA distance-field primitive (pathB above) rather than an integer-texel
      // min-filter dilate, whose useful radius range lived entirely below 1 texel (stepping 0->1
      // skipped straight past it, rendering as dots/blobs). See docs/oshiPFP-v0.3-tuningspecs.md's
      // Daiya arch discussion for the full rationale.
      //
      // `daiyaOctagonMode` picks between JFA and Octagon (the pre-JFA growth math) as two
      // structurally distinct modes — each with its own independent Radius/Hardness (JFA keeps
      // float precision, Octagon's own fields are intentionally separate so switching modes
      // doesn't make them fight over one value), while Threshold/Soft Threshold/Invert Seed apply
      // identically to both (same shared thresholdProgram/softThresholdProgram calls either way,
      // see below). `daiyaMask`/`daiyaMaskChannel` are the two growth branches' common hand-off
      // point: every reader downstream (soft-threshold modulate, maskFillColorProgram) works off
      // whichever mode actually ran, unaware of which one that was.
      let daiyaMask: TargetTexture
      let daiyaMaskChannel: 0 | 1

      if (p.daiyaOctagonMode) {
        // Sequential separable min-filter dilate passes, one per direction (each pass grows
        // whatever the previous direction already grew, not run in parallel and combined), which
        // is what produces the "octagon" facets. minFilter1D.frag.ts samples *both* +offset and
        // -offset per direction, so N direction passes produce a 2N-sided facet shape — 4
        // directions gives the 8-sided "octagon" this mode is named for. Generated from
        // `p.daiyaOctagonDirections`/`p.daiyaOctagonRotation`, so N and facet orientation are both
        // real sliders — 4 directions + 0° rotation reproduces the classic octagon.
        // The (sqrt2-1) correction on intRadius compensates for diagonal-ish passes reaching
        // further per step than axis-aligned ones would alone (an approximation that only gets
        // less exact as direction count grows past 4, not recalibrated per-N). Ink-weight
        // convention: grayscale in `.r`, matching minFilterProgram's own output — NOT
        // distanceToEdgeProgram's `.a` convention below.
        this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
        this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), p.threshold)
          // daiyaInvertSeed (shared with JFA's own threshold call below) lets detection grow from
          // the opposite tonal side (light instead of dark, or vice versa), so Octagon can read as
          // shading rather than line-tracing. Independent of fillInvert's own unrelated job
          // further downstream.
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), p.daiyaInvertSeed ? 1 : 0)
        })

        this.daiyaOctagonHTarget = this.ensureTarget(this.daiyaOctagonHTarget, width, height)
        this.daiyaOctagonVTarget = this.ensureTarget(this.daiyaOctagonVTarget, width, height)
        // daiyaOctagonRadius is its own plain integer field (a literal step=1 UI slider),
        // independent of JFA's shared float `radius`.
        const intRadius = Math.max(0, Math.round(p.daiyaOctagonRadius))
        // Minimum 3 for the default bidirectional shape (fewer doesn't form a real polygon), but
        // 1 becomes meaningful once uOneSided is on (a single one-sided spike/ray).
        const dirCount = Math.max(p.daiyaOctagonOneSided ? 1 : 3, Math.round(p.daiyaOctagonDirections))
        const rotationRad = (p.daiyaOctagonRotation * Math.PI) / 180
        // Bidirectional passes (minFilter1D samples +offset AND -offset) only need angles spread
        // across a half-turn [0, PI) — a direction and its opposite are already both covered by
        // one pass, so going further would just repeat facets. One-sided passes (uOneSided) sample
        // only +offset, so they're NOT automatically mirrored — a proper N-gon under one-sided growth
        // needs its N directions spread across the FULL turn [0, 2*PI) instead, or it comes out
        // lopsided (all facets crammed into one half of the shape) — hence daiyaOctagonRotation's
        // 360° range.
        const turnFraction = p.daiyaOctagonOneSided ? Math.PI * 2 : Math.PI
        const directions: [number, number][] = Array.from({ length: dirCount }, (_, i) => {
          const angle = rotationRad + (turnFraction * i) / dirCount
          return [Math.cos(angle), Math.sin(angle)]
        })
        const scratch = [this.daiyaOctagonHTarget, this.daiyaOctagonVTarget]
        let src: TargetTexture = this.maskTarget
        directions.forEach((direction, i) => {
          const dst = scratch[i % 2]!
          this.runPass(this.minFilterProgram, dst, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, src.texture)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), intRadius)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), direction)
            // minFilterProgram is shared (Gap Closing, Fumiko/Tsukiko growRadius) — uMode must be
            // set explicitly every call per CLAUDE.md's Recurring Gotchas (this exact program has
            // leaked uMode across call sites twice before).
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 0)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), p.daiyaOctagonOneSided ? 1 : 0)
          })
          src = dst
        })
        daiyaMask = this.runSoftHardness(src, p.daiyaOctagonHardness, width, height)
        daiyaMaskChannel = 0
      } else {
        this.daiyaDistanceMaskTarget = this.ensureTarget(this.daiyaDistanceMaskTarget, width, height)

        const daiyaSeedStale =
          this.daiyaSeedDirty || !this.daiyaSeedTarget ||
          this.daiyaSeedTarget.width !== width || this.daiyaSeedTarget.height !== height
        trace('render:pathD-entry', {
          fillInvert: p.fillInvert,
          fillType: p.fillType,
          seedStale: daiyaSeedStale,
          daiyaSeedDirty: this.daiyaSeedDirty,
        })

        if (daiyaSeedStale) {
          this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
          this.daiyaSeedTargetA = this.ensureFloatTarget(this.daiyaSeedTargetA, width, height)
          this.daiyaSeedTargetB = this.ensureFloatTarget(this.daiyaSeedTargetB, width, height)

          this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
            gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
            gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), p.threshold)
            // Explicit uInvert set (shares daiyaInvertSeed with Octagon's own threshold call
            // above) — see CLAUDE.md Recurring Gotchas (shared-uniform-leak class).
            gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), p.daiyaInvertSeed ? 1 : 0)
            this.traceUniformSet('gl:thresholdProgram(Daiya)', this.thresholdProgram, 'uInvert', p.daiyaInvertSeed ? 1 : 0, {
              mode: p.mode,
              threshold: p.threshold,
            })
          })
          this.traceSamplePixel('gl:maskTarget-after-threshold(Daiya)', this.maskTarget!, { mode: p.mode })

          this.runPass(this.distanceSeedProgram, this.daiyaSeedTargetA, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.maskTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.distanceSeedProgram, 'uMask'), 0)
            // Explicit uInvert set — see CLAUDE.md Recurring Gotchas (shared-uniform-leak class).
            gl.uniform1i(gl.getUniformLocation(this.distanceSeedProgram, 'uInvert'), 0)
            this.traceUniformSet('gl:distanceSeedProgram(Daiya)', this.distanceSeedProgram, 'uInvert', 0, { mode: p.mode })
          })

          const numPasses = Math.max(1, Math.ceil(Math.log2(Math.max(width, height))))
          let seedSrc = this.daiyaSeedTargetA
          let seedDst = this.daiyaSeedTargetB
          for (let i = 0; i < numPasses; i++) {
            const step = Math.pow(2, numPasses - 1 - i)
            this.runPass(this.jfaStepProgram, seedDst, width, height, () => {
              gl.activeTexture(gl.TEXTURE0)
              gl.bindTexture(gl.TEXTURE_2D, seedSrc.texture)
              gl.uniform1i(gl.getUniformLocation(this.jfaStepProgram, 'uSeed'), 0)
              gl.uniform2fv(gl.getUniformLocation(this.jfaStepProgram, 'uTexelSize'), texelSize)
              gl.uniform1f(gl.getUniformLocation(this.jfaStepProgram, 'uStep'), step)
            })
            ;[seedSrc, seedDst] = [seedDst, seedSrc]
          }
          this.daiyaSeedTargetA = seedSrc
          this.daiyaSeedTargetB = seedDst
          this.daiyaSeedTarget = seedSrc
          this.daiyaSeedDirty = false
        }

        const daiyaFeather = hardnessToFeather(p.hardness, HARDNESS_BASE_MAX_FEATHER.pathD!)
        this.runPass(this.distanceToEdgeProgram, this.daiyaDistanceMaskTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.daiyaSeedTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uSeed'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uOriginal'), 1)
          gl.uniform2fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uTexSize'), [width, height])
          // Direct 1:1 mapping, no diagonal-correction factor — JFA's Euclidean distance() replaces
          // the old min-filter's octagon-approximation hack entirely.
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uRadius'), p.radius)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uFeather'), daiyaFeather)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uGamma'), p.blobContrast)
          // Neutral here — real colorContrast is applied downstream in maskFillColorProgram, same as
          // Botan's non-fused (solid/gradient) branch. Daiya has no fused-image fast path (see scope
          // note in the JFA port plan) so this pass never emits final color itself.
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorContrast'), 1)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorExpansion'), 0)
          gl.uniform3fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uLineColor'), p.tintColor)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uInvert'), 0)
          this.traceUniformSet('gl:distanceToEdgeProgram(Daiya)', this.distanceToEdgeProgram, 'uInvert', 0, {
            mode: p.mode,
            fillType: p.fillType,
            fillInvert: p.fillInvert,
          })
        })
        this.traceSamplePixel('gl:daiyaDistanceMaskTarget-after-distanceToEdge', this.daiyaDistanceMaskTarget!, {
          mode: p.mode,
          fillType: p.fillType,
          fillInvert: p.fillInvert,
        })
        daiyaMask = this.daiyaDistanceMaskTarget
        daiyaMaskChannel = 1
      }

      // Soft-threshold alpha-modulate — a second, independently-computed soft/antialiased threshold weight (same math
      // as Hinata Erode's softThresholdProgram) multiplied into whichever growth mode's mask just
      // ran. Deliberately doesn't touch the binary threshold/JFA seed above — JFA needs a strictly
      // binary seed mask, so this only smooths the *already-grown* result's boundary transition,
      // applied after the fact. uInvert matches daiyaInvertSeed so the soft edge's own polarity
      // stays consistent with whichever side the hard seed above grew from.
      if (p.daiyaSoftThresholdWidth > 0) {
        this.daiyaSoftThresholdTarget = this.ensureTarget(this.daiyaSoftThresholdTarget, width, height)
        this.runPass(this.softThresholdProgram, this.daiyaSoftThresholdTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uThreshold'), p.threshold)
          gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uSoftness'), p.daiyaSoftThresholdWidth)
          gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uInvert'), p.daiyaInvertSeed ? 1 : 0)
        })

        this.daiyaSoftThresholdModTarget = this.ensureTarget(this.daiyaSoftThresholdModTarget, width, height)
        this.runPass(this.alphaModulateProgram, this.daiyaSoftThresholdModTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, daiyaMask.texture)
          gl.uniform1i(gl.getUniformLocation(this.alphaModulateProgram, 'uBase'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, this.daiyaSoftThresholdTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.alphaModulateProgram, 'uMask'), 1)
          gl.uniform1i(gl.getUniformLocation(this.alphaModulateProgram, 'uBaseChannel'), daiyaMaskChannel)
          gl.uniform1f(gl.getUniformLocation(this.alphaModulateProgram, 'uMaskGain'), p.daiyaSoftThresholdOverdrive)
        })
        daiyaMask = this.daiyaSoftThresholdModTarget
      }

      // 'image' fillType absorbs the vivid HSV-saturation boost as an always-applied
      // (neutral at vividBoost=1) modulation instead of a separate mode.
      this.tintTarget = this.ensureTarget(this.tintTarget, width, height)
      this.runPass(this.maskFillColorProgram, this.tintTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, daiyaMask.texture)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMask'), 0)
        // .a (alpha, distanceToEdgeProgram's convention) or .r (grayscale, the octagon path's
        // minFilterProgram convention) — whichever daiyaMaskChannel says the mask above ended up
        // in, possibly after the soft-threshold modulate step re-wrote that same channel in place.
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMaskChannel'), daiyaMaskChannel)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, base.texture)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uOriginal'), 1)
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uDetectionSource'), 2)
        gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uInvert'), p.fillInvert ? 1 : 0)
        this.traceUniformSet('gl:maskFillColorProgram(Daiya)', this.maskFillColorProgram, 'uInvert', p.fillInvert ? 1 : 0, {
          mode: p.mode,
          fillType: p.fillType,
          fillInvert: p.fillInvert,
        })
        this.setFillTypeColorUniforms(this.maskFillColorProgram, {
          fillType: p.fillType,
          solidColor: p.tintColor,
          shadowColor: p.gradientShadow,
          midColor: p.gradientMid,
          highlightColor: p.gradientHighlight,
          pivot: p.gradientPivot,
          duoTone: p.gradientDuoTone,
          vividBoost: p.vividBoost,
          vividDeadzone: p.vividDeadzone,
          colorContrast: p.colorContrast,
        })
      })
      outputTarget = this.tintTarget
    } else if (p.mode === 'pathF') {
      this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
      this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
      const blurRadius = 1.2
      this.runPass(this.boxBlurProgram, this.blurHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
      })
      this.runPass(this.boxBlurProgram, this.blurVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
      })

      this.edgeMapTarget = this.ensureTarget(this.edgeMapTarget, width, height)
      this.runPass(this.findEdgesProgram, this.edgeMapTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.blurVTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.findEdgesProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.findEdgesProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.findEdgesProgram, 'uSensitivity'), p.sensitivity)
        gl.uniform1f(gl.getUniformLocation(this.findEdgesProgram, 'uGamma'), p.blobContrast)
      })
      outputTarget = this.runErosion(this.edgeMapTarget, p.radius, width, height)
      outputTarget = this.runSoftHardness(outputTarget, p.hardness, width, height)

      if (!p.findEdge) {
        this.tintTarget = this.ensureTarget(this.tintTarget, width, height)
        this.runPass(this.maskFillColorProgram, this.tintTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMask'), 0)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMaskChannel'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uOriginal'), 1)
          gl.activeTexture(gl.TEXTURE2)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uDetectionSource'), 2)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uInvert'), p.fillInvert ? 1 : 0)
          this.setFillTypeColorUniforms(this.maskFillColorProgram, {
            fillType: p.fillType,
            solidColor: p.tintColor,
            shadowColor: p.gradientShadow,
            midColor: p.gradientMid,
            highlightColor: p.gradientHighlight,
            pivot: p.gradientPivot,
            duoTone: p.gradientDuoTone,
            vividBoost: p.vividBoost,
            vividDeadzone: p.vividDeadzone,
            colorContrast: p.colorContrast,
          })
        })
        outputTarget = this.tintTarget
      }

      // Master saturation, applied once to the fully-resolved ink layer
      // (whichever of Find Edge/Tint/Vivid produced it) rather than inside
      // findEdges.frag.ts — see saturationAdjust.frag.ts's header.
      this.saturationTarget = this.ensureTarget(this.saturationTarget, width, height)
      this.runPass(this.saturationAdjustProgram, this.saturationTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture)
        gl.uniform1i(gl.getUniformLocation(this.saturationAdjustProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.saturationAdjustProgram, 'uSaturation'), p.saturation)
        gl.uniform1i(gl.getUniformLocation(this.saturationAdjustProgram, 'uHueInvert'), 0)
      })
      outputTarget = this.saturationTarget
    } else if (p.mode === 'pathG' && p.gumiGradientMap) {
      // Crude Gradient Map prototype — see gradientMap.frag.ts. No
      // threshold/closing/blob-or-bleed chain at all: every pixel gets
      // recolored directly off the 3-stop ramp, then composited below like
      // every other mode's resolved output.
      this.gradientMapTarget = this.ensureTarget(this.gradientMapTarget, width, height)
      this.runPass(this.gradientMapProgram, this.gradientMapTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.gradientMapProgram, 'uSource'), 0)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uShadowColor'), p.gumiGradientShadow)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uMidColor'), p.gumiGradientMid)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uHighlightColor'), p.gumiGradientHighlight)
        // No Pivot/Duo Tone UI for Gumi's own Gradient Map yet (Botan/Chie/Daiya/Fumiko's shared
        // fillType selector has these, Gumi's doesn't) — neutral values here.
        gl.uniform1f(gl.getUniformLocation(this.gradientMapProgram, 'uGradientPivot'), 0)
        gl.uniform1i(gl.getUniformLocation(this.gradientMapProgram, 'uGradientDuoTone'), 0)
      })
      outputTarget = this.gradientMapTarget
    } else if (p.mode === 'pathG') {
      trace('render:pathG-entry', { gumiLineInvert: p.gumiLineInvert, gumiFillInvert: p.gumiFillInvert, gumiDualLine: p.gumiDualLine, botanSeedDirty: this.botanSeedDirty })
      if (p.gumiDualLine && !p.gumiFillMode && !p.gumiColorBleed) {
        // Dual Line — two independent, simplified-band
        // detection+fill chains (Black/White), merged via Porter-Duff "over" compositing.
        // See runGumiDualBand's own doc comment for the full per-band chain — it shares
        // every other Gumi Line-mode slider value with the single-band path below, and
        // deliberately skips Gap Closing (a prototype slated for removal).
        this.gumiDualBlackColorTarget = this.runGumiDualBand(
          detectionSource, base, width, height, p,
          p.gumiDualBlack, p.gumiDualBlackFillType, p.gumiDualBlackSolidColor, p.gumiDualBlackInvert,
          p.gumiDualBlackColorContrast,
          this.gumiDualBlackColorTarget,
        )
        this.gumiDualWhiteColorTarget = this.runGumiDualBand(
          detectionSource, base, width, height, p,
          p.gumiDualWhite, p.gumiDualWhiteFillType, p.gumiDualWhiteSolidColor, p.gumiDualWhiteInvert,
          p.gumiDualWhiteColorContrast,
          this.gumiDualWhiteColorTarget,
        )

        this.gumiDualMergeTarget = this.ensureTarget(this.gumiDualMergeTarget, width, height)
        const top = p.gumiDualWhiteOnTop ? this.gumiDualWhiteColorTarget : this.gumiDualBlackColorTarget
        const bottom = p.gumiDualWhiteOnTop ? this.gumiDualBlackColorTarget : this.gumiDualWhiteColorTarget
        this.runPass(this.layerMergeProgram, this.gumiDualMergeTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, top!.texture)
          gl.uniform1i(gl.getUniformLocation(this.layerMergeProgram, 'uTop'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, bottom!.texture)
          gl.uniform1i(gl.getUniformLocation(this.layerMergeProgram, 'uBottom'), 1)
        })
        outputTarget = this.gumiDualMergeTarget
      } else {
      // Path G (Gumi), single-band: contrast boost (reuses colorCorrect's
      // pivot-at-0.5 contrast curve) -> threshold into a binary mask
      // (uInvert=1 — high band-weight means "this IS the selected stroke")
      // -> closing (minFilter1D's min mode). Then one of two final
      // treatments, picked by gumiColorBleed — see labPipeline.ts's pathG
      // branch for the full rationale, ported 1:1 here. Dual Line above is
      // the only place Gumi does band-based luminance detection; this path
      // reads detectionSource directly.
      this.gumiBoostTarget = this.ensureTarget(this.gumiBoostTarget, width, height)
      this.runPass(this.colorCorrectProgram, this.gumiBoostTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.colorCorrectProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uExposure'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uContrast'), p.gumiContrastBoost)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uBlackClip'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uWhiteClip'), 1)
      })

      this.gumiMaskTarget = this.ensureTarget(this.gumiMaskTarget, width, height)
      if (p.gumiSoftDetection) {
        this.runPass(this.softThresholdProgram, this.gumiMaskTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.gumiBoostTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uThreshold'), p.threshold)
          gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uSoftness'), p.gumiSoftness)
          gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uInvert'), 1)
        })
      } else {
        this.runPass(this.thresholdProgram, this.gumiMaskTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.gumiBoostTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), p.threshold)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), 1)
        })
      }

      this.gumiMaxHTarget = this.ensureTarget(this.gumiMaxHTarget, width, height)
      this.gumiMaxVTarget = this.ensureTarget(this.gumiMaxVTarget, width, height)
      // Uses minFilterContinuousProgram (its own private program, not the shared
      // minFilterProgram) for genuine sub-texel float precision. p.radius flows through
      // unrounded. See minFilterContinuous.frag.ts's doc comment.
      this.runPass(this.minFilterContinuousProgram, this.gumiMaxHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiMaskTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.minFilterContinuousProgram, 'uRadius'), p.radius)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uDirection'), [1, 0])
        // uMode=1 is the correct value here (not 0, despite this pass conceptually being a
        // "min mode" grow) — verified against actual rendered output, not just the shader's
        // doc-comment intent. See CLAUDE.md Recurring Gotchas (shared-uniform-leak class).
        gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uMode'), 1)
      })
      this.runPass(this.minFilterContinuousProgram, this.gumiMaxVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiMaxHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.minFilterContinuousProgram, 'uRadius'), p.radius)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterContinuousProgram, 'uDirection'), [0, 1])
        gl.uniform1i(gl.getUniformLocation(this.minFilterContinuousProgram, 'uMode'), 1)
      })

      // Gap Closing prototype: a proper morphological closing (grow by a fixed small
      // radius, then shrink back by the same amount) on top of the grow pass above —
      // ping-pongs through its own gumiCloseH/VTarget pair rather than gumiMaxHTarget,
      // so this pass's own writes never alias the texture it reads from mid-pass. The
      // shrink-back cancels the grow everywhere except where it caused two separate ink
      // regions to actually touch and merge — exactly what's needed to bridge small gaps
      // at V/Y stroke intersections without uniformly thickening straight runs, unlike
      // just cranking `radius` above. Written into a local var, not back onto
      // this.gumiMaxVTarget, so downstream reads pick this up explicitly.
      let closedMaskTarget = this.gumiMaxVTarget
      if (p.gumiGapClosing) {
        this.gumiCloseHTarget = this.ensureTarget(this.gumiCloseHTarget, width, height)
        this.gumiCloseVTarget = this.ensureTarget(this.gumiCloseVTarget, width, height)
        this.runPass(this.minFilterProgram, this.gumiCloseHTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.gumiMaxVTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
          gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), GUMI_GAP_CLOSING_RADIUS)
          gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [1, 0])
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 0)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), 0)
        })
        this.runPass(this.minFilterProgram, this.gumiCloseVTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.gumiCloseHTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
          gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), GUMI_GAP_CLOSING_RADIUS)
          gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 0)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), 0)
        })
        this.runPass(this.minFilterProgram, this.gumiCloseHTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.gumiCloseVTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
          gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), GUMI_GAP_CLOSING_RADIUS)
          gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [1, 0])
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 1)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), 0)
        })
        this.runPass(this.minFilterProgram, this.gumiCloseVTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.gumiCloseHTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
          gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), GUMI_GAP_CLOSING_RADIUS)
          gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 1)
          gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), 0)
        })
        closedMaskTarget = this.gumiCloseVTarget
      }

      if (p.gumiColorBleed) {
        const gumiSeed = this.runGumiDistanceTransform(closedMaskTarget, false, width, height)
        this.gumiBleedTarget = this.ensureTarget(this.gumiBleedTarget, width, height)
        this.runPass(this.distanceToEdgeProgram, this.gumiBleedTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, gumiSeed.texture)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uSeed'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uOriginal'), 1)
          gl.uniform2fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uTexSize'), [width, height])
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uRadius'), p.gumiBleedRadius)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uFeather'), p.gumiBleedFeather)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uGamma'), p.blobContrast)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorContrast'), p.colorContrast)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorExpansion'), p.colorExpansion ? 1 : 0)
          gl.uniform3fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uLineColor'), p.tintColor)
          // Explicit uInvert set — see CLAUDE.md Recurring Gotchas (shared-uniform-leak class).
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uInvert'), 0)
        })
        outputTarget = this.gumiBleedTarget
      } else if (p.gumiFillMode) {
        // Fill's own distance transform, seeded from whichever side uInvert below is NOT
        // targeting — gumiFillInvert=false (default) measures depth into the *ink* region, so
        // it's seeded from background (invert=true), matching blob's own seeding; true measures
        // depth into the *background* region instead, so it's seeded from ink (invert=false,
        // same seeding bleed already uses). Computed separately from blob's own seed below since
        // the two can now point in opposite directions.
        const fillSeed = this.runGumiDistanceTransform(closedMaskTarget, !p.gumiFillInvert, width, height)
        this.gumiBlobTarget = this.ensureTarget(this.gumiBlobTarget, width, height)
        this.runPass(this.fillMaskProgram, this.gumiBlobTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, fillSeed.texture)
          gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uSeed'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, closedMaskTarget.texture)
          gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uMask'), 1)
          gl.activeTexture(gl.TEXTURE2)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uOriginal'), 2)
          gl.activeTexture(gl.TEXTURE3)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uDetectionSource'), 3)
          gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uBlobMaxDt'), p.gumiFillRadius)
          gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uGamma'), p.gumiBlobGamma)
          gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uInvert'), p.gumiFillInvert ? 1 : 0)
          gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uPixelThreshold'), p.gumiFillPixelThreshold ? 1 : 0)
          gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uFillType'), FILL_TYPE_INT[p.gumiFillType])
          gl.uniform3fv(gl.getUniformLocation(this.fillMaskProgram, 'uSolidColor'), p.gumiFillSolidColor)
          gl.uniform3fv(gl.getUniformLocation(this.fillMaskProgram, 'uShadowColor'), p.gumiGradientShadow)
          gl.uniform3fv(gl.getUniformLocation(this.fillMaskProgram, 'uMidColor'), p.gumiGradientMid)
          gl.uniform3fv(gl.getUniformLocation(this.fillMaskProgram, 'uHighlightColor'), p.gumiGradientHighlight)
          // No Duo Tone/Vivid UI for Gumi Fill mode yet — neutral values. Pivot/Color Contrast
          // are wired to real Fill-mode-specific fields.
          gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uGradientPivot'), p.gumiFillGradientPivot)
          gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uGradientDuoTone'), 0)
          gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uVividBoost'), 1)
          gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uVividDeadzone'), 1)
          gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uColorContrast'), p.gumiFillColorContrast)
        })
        outputTarget = this.gumiBlobTarget
      } else {
        const gumiSeed = this.runGumiDistanceTransform(closedMaskTarget, true, width, height)
        this.gumiBlobTarget = this.ensureTarget(this.gumiBlobTarget, width, height)
        this.runPass(this.blobMaskProgram, this.gumiBlobTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, gumiSeed.texture)
          gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uSeed'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, closedMaskTarget.texture)
          gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uMask'), 1)
          gl.uniform1f(gl.getUniformLocation(this.blobMaskProgram, 'uBlobMaxDt'), p.blobMaxDt)
          gl.uniform1f(gl.getUniformLocation(this.blobMaskProgram, 'uGamma'), p.gumiBlobGamma)
          gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uSoftOutput'), p.gumiSoftDetection ? 1 : 0)
        })
        this.traceSampleGrid('gl:gumiBlobTarget-after-blobMask(Gumi)', this.gumiBlobTarget, {
          mode: p.mode,
          blobMaxDt: p.blobMaxDt,
          radius: p.radius,
        })
        const linePostProcessed = this.runGumiLinePostProcess(this.gumiBlobTarget, p, width, height)
        this.gumiLineColorTarget = this.ensureTarget(this.gumiLineColorTarget, width, height)
        this.runPass(this.maskFillColorProgram, this.gumiLineColorTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, linePostProcessed.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMask'), 0)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMaskChannel'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uOriginal'), 1)
          gl.activeTexture(gl.TEXTURE2)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uDetectionSource'), 2)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uFillType'), FILL_TYPE_INT[p.gumiLineFillType])
          gl.uniform3fv(gl.getUniformLocation(this.maskFillColorProgram, 'uSolidColor'), p.gumiLineSolidColor)
          gl.uniform3fv(gl.getUniformLocation(this.maskFillColorProgram, 'uShadowColor'), p.gumiGradientShadow)
          gl.uniform3fv(gl.getUniformLocation(this.maskFillColorProgram, 'uMidColor'), p.gumiGradientMid)
          gl.uniform3fv(gl.getUniformLocation(this.maskFillColorProgram, 'uHighlightColor'), p.gumiGradientHighlight)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uInvert'), p.gumiLineInvert ? 1 : 0)
          // No Duo Tone/Vivid UI for Gumi Line mode yet — neutral values. Pivot/Color Contrast
          // are wired to real Line-mode-specific fields.
          gl.uniform1f(gl.getUniformLocation(this.maskFillColorProgram, 'uGradientPivot'), p.gumiLineGradientPivot)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uGradientDuoTone'), 0)
          gl.uniform1f(gl.getUniformLocation(this.maskFillColorProgram, 'uVividBoost'), 1)
          gl.uniform1f(gl.getUniformLocation(this.maskFillColorProgram, 'uVividDeadzone'), 1)
          gl.uniform1f(gl.getUniformLocation(this.maskFillColorProgram, 'uColorContrast'), p.gumiLineColorContrast)
        })
        this.traceSampleGrid('gl:gumiLineColorTarget-final(Gumi)', this.gumiLineColorTarget, {
          mode: p.mode,
          blobMaxDt: p.blobMaxDt,
          radius: p.radius,
        })
        outputTarget = this.gumiLineColorTarget
      }
      }
    } else if ((p.mode === 'pathH' || p.mode === 'pathI') && p.highPassResponsiveColor) {
      // Dual-polarity litmus test (see responsiveEdgeColor.frag.ts):
      // locally-adaptive ink color instead of one fixed polarity. Reuses
      // the same box-blur pass Fumiko's normal chain computes — the
      // blurred local-neighborhood average IS the "rough area check".
      // This branch is entirely self-contained (its own blur+zero-crossing diff computed
      // directly from detectionSource) and never touches Path H's highPassDiff or Path I's
      // laplacian machinery — Edge isn't "High Pass edge" or "Laplacian edge," it's its own recipe.
      this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
      this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
      const blurRadius = p.radius
      this.runPass(this.boxBlurProgram, this.blurHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
      })
      this.runPass(this.boxBlurProgram, this.blurVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
      })

      this.responsiveColorTarget = this.ensureTarget(this.responsiveColorTarget, width, height)
      this.runPass(this.responsiveEdgeColorProgram, this.responsiveColorTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.responsiveEdgeColorProgram, 'uSource'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.blurVTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.responsiveEdgeColorProgram, 'uBlurred'), 1)
        gl.uniform2fv(gl.getUniformLocation(this.responsiveEdgeColorProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.responsiveEdgeColorProgram, 'uStrength'), p.highPassStrength)
        gl.uniform1f(gl.getUniformLocation(this.responsiveEdgeColorProgram, 'uCrossover'), p.responsiveCrossover)
      })

      if (p.responsiveGrow > 0) {
        const growRadius = Math.round(p.responsiveGrow)

        this.responsiveWhiteExtractTarget = this.ensureTarget(this.responsiveWhiteExtractTarget, width, height)
        this.runPass(this.inkColorMaskProgram, this.responsiveWhiteExtractTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.responsiveColorTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.inkColorMaskProgram, 'uInk'), 0)
          gl.uniform1i(gl.getUniformLocation(this.inkColorMaskProgram, 'uTargetWhite'), 1)
        })
        this.responsiveBlackExtractTarget = this.ensureTarget(this.responsiveBlackExtractTarget, width, height)
        this.runPass(this.inkColorMaskProgram, this.responsiveBlackExtractTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.responsiveColorTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.inkColorMaskProgram, 'uInk'), 0)
          gl.uniform1i(gl.getUniformLocation(this.inkColorMaskProgram, 'uTargetWhite'), 0)
        })

        const growOne = (source: TargetTexture, dest: TargetTexture | null): TargetTexture => {
          this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
          const result = this.ensureTarget(dest, width, height)
          this.runPass(this.minFilterProgram, this.blurHTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, source.texture)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), growRadius)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [1, 0])
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 1)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), 0)
          })
          this.runPass(this.minFilterProgram, result, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), growRadius)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 1)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), 0)
          })
          return result
        }

        this.responsiveGrowWhiteTarget = growOne(this.responsiveWhiteExtractTarget, this.responsiveGrowWhiteTarget)
        this.responsiveGrowBlackTarget = growOne(this.responsiveBlackExtractTarget, this.responsiveGrowBlackTarget)

        this.runPass(this.inkColorRecombineProgram, this.responsiveColorTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.responsiveGrowWhiteTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.inkColorRecombineProgram, 'uGrownWhite'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, this.responsiveGrowBlackTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.inkColorRecombineProgram, 'uGrownBlack'), 1)
          gl.uniform1f(gl.getUniformLocation(this.inkColorRecombineProgram, 'uBias'), p.responsiveGrowBias)
        })
      }

      outputTarget = this.runEdgeFillColor(this.responsiveColorTarget, p, base, width, height)
    } else if (p.mode === 'pathH' || p.mode === 'pathI') {
      let hiRaw: TargetTexture
      if (p.mode === 'pathH') {
        // Path H (High Pass): separable box-blur then source-minus-blurred
        // (highPassDiff.frag.ts).
        this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
        this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
        const blurRadius = p.radius
        this.runPass(this.boxBlurProgram, this.blurHTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
          gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
          gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
          gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
        })
        this.runPass(this.boxBlurProgram, this.blurVTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
          gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
          gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), blurRadius)
          gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
        })

        this.highPassTarget = this.ensureTarget(this.highPassTarget, width, height)
        this.runPass(this.highPassDiffProgram, this.highPassTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.highPassDiffProgram, 'uSource'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, this.blurVTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.highPassDiffProgram, 'uBlurred'), 1)
          gl.uniform1f(gl.getUniformLocation(this.highPassDiffProgram, 'uStrength'), p.highPassStrength)
        })
        hiRaw = this.highPassTarget
      } else {
        // Path I (Laplacian): optional pre-blur feeds the single-pass 3x3
        // second-order kernel (laplacian.frag.ts), then optional re-sharpen
        // (unsharpMask.frag.ts, already compiled for Crop's Enhance stage).
        let laplacianSource = detectionSource
        if (p.laplacianPreBlur > 0) {
          this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
          this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
          this.runPass(this.boxBlurProgram, this.blurHTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
            gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
            gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), p.laplacianPreBlur)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
          })
          this.runPass(this.boxBlurProgram, this.blurVTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
            gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), p.laplacianPreBlur)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
          })
          laplacianSource = this.blurVTarget
        }

        this.laplacianTarget = this.ensureTarget(this.laplacianTarget, width, height)
        this.runPass(this.laplacianProgram, this.laplacianTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, laplacianSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.laplacianProgram, 'uSource'), 0)
          gl.uniform2fv(gl.getUniformLocation(this.laplacianProgram, 'uTexelSize'), texelSize)
          gl.uniform1f(gl.getUniformLocation(this.laplacianProgram, 'uStrength'), p.laplacianStrength)
        })

        if (p.laplacianSharpenAmount > 0) {
          this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
          this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
          const sharpenBlurRadius = 1.5
          this.runPass(this.boxBlurProgram, this.blurHTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.laplacianTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
            gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), sharpenBlurRadius)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
          })
          this.runPass(this.boxBlurProgram, this.blurVTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
            gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), sharpenBlurRadius)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
          })
          this.laplacianSharpenTarget = this.ensureTarget(this.laplacianSharpenTarget, width, height)
          this.runPass(this.unsharpMaskProgram, this.laplacianSharpenTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.laplacianTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.unsharpMaskProgram, 'uSource'), 0)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, this.blurVTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.unsharpMaskProgram, 'uBlurred'), 1)
            gl.uniform1f(gl.getUniformLocation(this.unsharpMaskProgram, 'uAmount'), p.laplacianSharpenAmount)
          })
          hiRaw = this.laplacianSharpenTarget
        } else {
          hiRaw = this.laplacianTarget
        }

        if (p.laplacianGrow > 0) {
          this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
          this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
          const growRadius = Math.round(p.laplacianGrow)
          this.runPass(this.minFilterProgram, this.blurHTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, hiRaw.texture)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), growRadius)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [1, 0])
            // Was relying on WebGL's implicit 0 for both uMode/uOneSided (the exact latent-leak
            // risk CLAUDE.md's Recurring Gotchas already flagged for this call site) — set
            // explicitly now that uOneSided exists too, closing out that flagged gap.
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 0)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), 0)
          })
          this.runPass(this.minFilterProgram, this.blurVTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), growRadius)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 0)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uOneSided'), 0)
          })
          hiRaw = this.blurVTarget
        }
      }

      // Output treatment, shared by H/I: tone-remap takes priority when
      // active, then soft-threshold binarize/erode, then the (optionally
      // darkened/lightened) raw diff.
      if (p.hiToneTarget !== 'off') {
        outputTarget = this.runToneRemap(hiRaw, p.hiToneTarget, p, width, height)
      } else if (p.thresholdEnabled) {
        // softThresholdProgram lets Erode's Contrast slider (hiThresholdContrast) widen the cutoff
        // into a smoothstep band — at hiThresholdContrast=1 (default) uSoftness=0, a hard cutoff.
        // uInvert is driven by the explicit hiThresholdInvert toggle (erosion direction).
        this.hiThreshTarget = this.ensureTarget(this.hiThreshTarget, width, height)
        const hiSoftness = 0.12 * (1 - Math.max(0, Math.min(1, p.hiThresholdContrast)))
        this.runPass(this.softThresholdProgram, this.hiThreshTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, hiRaw.texture)
          gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uThreshold'), p.threshold)
          gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uSoftness'), hiSoftness)
          gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uInvert'), p.hiThresholdInvert ? 1 : 0)
        })
        // Routes through the same shared fill-type mechanism Botan/Chie/Daiya/Fumiko use
        // (Image/Solid/Gradient + Invert), giving Erode a real alpha-based "fill image" mode and a
        // configurable solid backdrop color. uMaskChannel=0 matches softThresholdProgram's
        // 0=ink/1=background grayscale convention (same as every other threshold-derived mask).
        this.hiThreshFillColorTarget = this.ensureTarget(this.hiThreshFillColorTarget, width, height)
        this.runPass(this.maskFillColorProgram, this.hiThreshFillColorTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.hiThreshTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMask'), 0)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uMaskChannel'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uOriginal'), 1)
          gl.activeTexture(gl.TEXTURE2)
          gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uDetectionSource'), 2)
          gl.uniform1i(gl.getUniformLocation(this.maskFillColorProgram, 'uInvert'), p.fillInvert ? 1 : 0)
          this.setFillTypeColorUniforms(this.maskFillColorProgram, {
            fillType: p.fillType,
            solidColor: p.tintColor,
            shadowColor: p.gradientShadow,
            midColor: p.gradientMid,
            highlightColor: p.gradientHighlight,
            pivot: p.gradientPivot,
            duoTone: p.gradientDuoTone,
            vividBoost: 1,
            vividDeadzone: 1,
            colorContrast: p.colorContrast,
          })
        })
        outputTarget = this.hiThreshFillColorTarget
      } else {
        outputTarget = this.runHiRawDarkenLighten(hiRaw, p, width, height)
      }
    }

    return outputTarget
  }

  /**
   * Resolves an explicit LineArtDisplayMode against a raw algorithm-chain output from
   * computeLineArtRaw — its own method (not inlined into renderLineArt) so Dual Pane can call this
   * twice (once per pane) against the one shared rawTarget, Export's own live-preview resolve a
   * third time (see renderExportPreview), and the on-screen-only 'previewA'/'previewB' peek slots a
   * fourth/fifth time (see render()'s tabPreviewBypass and Dual Pane blit consumption), each writing
   * into its own set of target textures (slot picks pane B's/Export's/the peek slots' fields over
   * pane A's/the single-pane defaults) so the invocations within one frame don't clobber each
   * other's framebuffers. 'primary'/'secondary' (the real lineArtOutputTarget/lineArtOutputTargetB
   * feeding runColorChain) must ALWAYS be called with mode='composite' — never 'original'/'overlay'
   * — see render()'s lineArtDirty block; only 'previewA'/'previewB' (on-screen peeks, never graded,
   * never fed back into the real chain) and Export's own independent 'export' slot are meant to ever
   * receive a non-'composite' mode.
   */
  private resolveLineArtDisplay(
    base: TargetTexture,
    rawTarget: TargetTexture,
    mode: LineArtDisplayMode,
    width: number,
    height: number,
    slot: 'primary' | 'secondary' | 'export' | 'previewA' | 'previewB',
  ): TargetTexture {
    const gl = this.gl
    const p = this.lineArt

    if (mode === 'original') return base

    // overlayPassthrough redirects the Composite branch into this exact
    // same raw-alpha-flatten pass instead of the blendLayer/opacity compositing below — safe to
    // share this branch's own target fields with the plain 'overlay' mode case since the two are
    // mutually exclusive per frame (mode is never both 'overlay' and 'composite' at once).
    if (mode === 'overlay' || (mode === 'composite' && p.overlayPassthrough)) {
      // rawTarget carries straight (non-premultiplied) alpha now — flatten
      // it onto a solid matte color for this raw preview instead of blitting
      // the partial alpha straight to the (alpha-enabled) canvas, which
      // would let the page background show through. uMatteColor itself is only ever the user's
      // chosen p.matteColor while overlayPassthrough is actually ON — the explicit mode==='overlay'
      // peek (preview strip / Dual Pane, see 'previewA'/'previewB' above) can trigger this same
      // branch while overlayPassthrough is OFF (LineArtPanel.tsx hides the matte color picker in
      // that state, but the stored value doesn't reset), so falling back to white here keeps the
      // peek from silently leaking a stale/hidden matte color the user can no longer see or edit.
      if (slot === 'secondary') {
        this.lineArtOverlayPreviewTargetB = this.ensureTarget(this.lineArtOverlayPreviewTargetB, width, height)
      } else if (slot === 'export') {
        this.exportLineArtOverlayTarget = this.ensureTarget(this.exportLineArtOverlayTarget, width, height)
      } else if (slot === 'previewA') {
        this.lineArtPeekOverlayTarget = this.ensureTarget(this.lineArtPeekOverlayTarget, width, height)
      } else if (slot === 'previewB') {
        this.lineArtPeekOverlayTargetB = this.ensureTarget(this.lineArtPeekOverlayTargetB, width, height)
      } else {
        this.lineArtOverlayPreviewTarget = this.ensureTarget(this.lineArtOverlayPreviewTarget, width, height)
      }
      const target = slot === 'secondary' ? this.lineArtOverlayPreviewTargetB!
        : slot === 'export' ? this.exportLineArtOverlayTarget!
        : slot === 'previewA' ? this.lineArtPeekOverlayTarget!
        : slot === 'previewB' ? this.lineArtPeekOverlayTargetB!
        : this.lineArtOverlayPreviewTarget!
      this.runPass(this.alphaOverWhiteProgram, target, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, rawTarget.texture)
        gl.uniform1i(gl.getUniformLocation(this.alphaOverWhiteProgram, 'uSource'), 0)
        gl.uniform3fv(gl.getUniformLocation(this.alphaOverWhiteProgram, 'uMatteColor'), p.overlayPassthrough ? p.matteColor : [1, 1, 1])
      })
      return target
    }

    // Fumiko's "Find Edge" color mode is the one algorithm output that
    // can't cleanly generalize to Screen/Overlay (its colored-edge look is
    // baked into a per-channel white-toward-black fade that doesn't
    // decompose into blend-mode-agnostic ink+alpha without risking a
    // regression to a previously-validated look) — force Multiply for it
    // regardless of the user's blend mode selection; LineArtPanel.tsx hides
    // the other two options in the UI for this specific case to match.
    const forcedMultiply = p.mode === 'pathF' && p.findEdge
    const blendModeInt = forcedMultiply ? BLEND_MODE_INT.multiply : BLEND_MODE_INT[p.blendMode]

    const isAlphaOverdrive = p.mode === 'pathF'
    const layerCount = isAlphaOverdrive ? ALPHA_OVERDRIVE_LAYERS : 1
    const opacities = new Float32Array(4)
    if (isAlphaOverdrive) {
      for (let i = 0; i < ALPHA_OVERDRIVE_LAYERS; i++) opacities[i] = Math.min(Math.max(p.opacity - i, 0), 1)
    } else {
      // Botan/Chie previously clamped opacity to 1 (plain crossfade, no
      // extrapolation past "fully shown"); Daiya kept it unclamped. Preserved
      // per-mode here rather than picking one now that all 4 modes share
      // this same composite call, so this refactor doesn't silently change
      // what the opacity slider's 100-300% range already did per algorithm.
      opacities[0] = p.mode === 'pathB' || p.mode === 'pathC' ? Math.min(p.opacity, 1) : p.opacity
    }
    if (slot === 'secondary') {
      this.lineArtBlendTargetB = this.ensureTarget(this.lineArtBlendTargetB, width, height)
    } else if (slot === 'export') {
      this.exportLineArtBlendTarget = this.ensureTarget(this.exportLineArtBlendTarget, width, height)
    } else {
      this.lineArtBlendTarget = this.ensureTarget(this.lineArtBlendTarget, width, height)
    }
    const target = slot === 'secondary' ? this.lineArtBlendTargetB!
      : slot === 'export' ? this.exportLineArtBlendTarget!
      : this.lineArtBlendTarget!
    this.runPass(this.compositeProgram, target, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, base.texture)
      gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBase'), 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, rawTarget.texture)
      gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uMask'), 1)
      gl.uniform1fv(gl.getUniformLocation(this.compositeProgram, 'uOpacities'), opacities)
      gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBlendMode'), blendModeInt)
      gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uLayerCount'), layerCount)
    })
    return target
  }

  /** Pre-Blend Correction — see inkCorrect.frag.ts. Runs once on computeLineArtRaw's output, before
   * any resolveLineArtDisplay slot consumes it, so every consumer (composite, overlay passthrough,
   * the preview-strip/Dual Pane peeks, Export's own resolve) sees the same corrected ink
   * consistently without each re-running the pass itself. Skipped entirely (returns `source`
   * unchanged, zero extra GPU work) when colorCorrectEnabled is off — never aliases inkCorrectTarget
   * as a shortcut for the off case, per CLAUDE.md's ensureTarget-ownership gotcha; the bypass is a
   * plain early return instead. */
  private applyInkCorrect(source: TargetTexture, width: number, height: number): TargetTexture {
    const p = this.lineArt
    if (!p.colorCorrectEnabled) return source
    const gl = this.gl
    this.inkCorrectTarget = this.ensureTarget(this.inkCorrectTarget, width, height)
    this.runPass(this.inkCorrectProgram, this.inkCorrectTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.inkCorrectProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.inkCorrectProgram, 'uExposure'), p.colorCorrectExposure)
      gl.uniform1f(gl.getUniformLocation(this.inkCorrectProgram, 'uContrast'), 1 + p.colorCorrectContrast)
      gl.uniform1f(gl.getUniformLocation(this.inkCorrectProgram, 'uSaturation'), 1 + p.colorCorrectSaturation)
      gl.uniform1i(gl.getUniformLocation(this.inkCorrectProgram, 'uInvertMatte'), p.colorCorrectInvertMatte ? 1 : 0)
    })
    return this.inkCorrectTarget
  }

  /** Runs the full algorithm chain and always resolves it as 'composite' (respecting the sticky
   * overlayPassthrough toggle) — the non-Dual-Pane case. Deliberately ignores
   * `this.lineArt.displayMode`: that field drives only the on-screen preview-strip peek (see
   * tabPreviewBypass's 'lineArtOverlay' case), never the real output runColorChain grades. See
   * computeLineArtRaw/resolveLineArtDisplay for the two halves this composes. Caches the
   * (Color-Correct-if-enabled) raw output onto lineArtRawTarget so renderExportPreview (and the
   * preview-strip peek) can reuse it without a second (expensive) compute. */
  private renderLineArt(base: TargetTexture, width: number, height: number): TargetTexture {
    this.lineArtRawTarget = this.applyInkCorrect(this.computeLineArtRaw(base, width, height), width, height)
    return this.resolveLineArtDisplay(base, this.lineArtRawTarget, 'composite', width, height, 'primary')
  }

  /**
   * Light+Color basic correction (lightColorCorrect.frag.ts) into curves+HSL
   * (curvesHsl.frag.ts) — the downstream chain every LineArtDisplayMode
   * variant's output passes through on its way to colorTarget, factored out
   * of render()'s single-path colorDirty block so Dual Pane can invoke it
   * twice (pane A into the primary lightColorTarget/colorTarget fields,
   * pane B into the *B-suffixed pair) against the two different line-art
   * variants resolveLineArtDisplay produced, and Export's own live-preview
   * resolve a third time (see renderExportPreview) into its own pair. Every
   * uniform here reads from this.colorAdjust/light/hslByBand/invert/
   * lutTexture, identical for every slot — only `source` (and thus the
   * output) differs.
   */
  private runColorChain(source: TargetTexture, width: number, height: number, slot: 'primary' | 'secondary' | 'export'): TargetTexture {
    const gl = this.gl

    // Gradient Map runs FIRST in the Grade chain, ahead of Light/Temperature/Tint/Curve/HSL —
    // gradientMapProgram replaces color purely by luminance, discarding whatever color any
    // earlier stage produced, so every other Grade control applies on top of its output instead
    // (running it later would make those controls invisible/buried). This is a deliberate output
    // change for any preset combining Gradient Map with those controls, not a regression — see
    // docs/oshiPFP-v0.3-tuningspecs.md. Bypass applied at the point of consumption (skip both
    // extra passes, feed lightColorProgram straight from `source`) rather than by aliasing a
    // field, per CLAUDE.md's Recurring Gotchas entry on ensureTarget field-ownership bugs.
    let gradeInput: TargetTexture = source
    if (this.gradeGradientMap.enabled) {
      const gm = this.gradeGradientMap

      if (slot === 'secondary') {
        this.gradeGradientMapTargetB = this.ensureTarget(this.gradeGradientMapTargetB, width, height)
      } else if (slot === 'export') {
        this.exportGradeGradientMapTarget = this.ensureTarget(this.exportGradeGradientMapTarget, width, height)
      } else {
        this.gradeGradientMapTarget = this.ensureTarget(this.gradeGradientMapTarget, width, height)
      }
      const gradientMapped = slot === 'secondary' ? this.gradeGradientMapTargetB!
        : slot === 'export' ? this.exportGradeGradientMapTarget!
        : this.gradeGradientMapTarget!
      // Every uniform gradientMapProgram declares is set explicitly here, every call — this
      // program's sibling uniforms (fillTypeColor.frag.ts's pivot/duoTone) have leaked stale state
      // across call sites before (CLAUDE.md's Recurring Gotchas), so nothing is left to "default".
      this.runPass(this.gradientMapProgram, gradientMapped, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, source.texture)
        gl.uniform1i(gl.getUniformLocation(this.gradientMapProgram, 'uSource'), 0)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uShadowColor'), gm.shadow)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uMidColor'), gm.mid)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uHighlightColor'), gm.highlight)
        gl.uniform1f(gl.getUniformLocation(this.gradientMapProgram, 'uGradientPivot'), gm.pivot)
        gl.uniform1i(gl.getUniformLocation(this.gradientMapProgram, 'uGradientDuoTone'), gm.duoTone ? 1 : 0)
      })

      if (slot === 'secondary') {
        this.gradeGradientMapCompositeTargetB = this.ensureTarget(this.gradeGradientMapCompositeTargetB, width, height)
      } else if (slot === 'export') {
        this.exportGradeGradientMapCompositeTarget = this.ensureTarget(this.exportGradeGradientMapCompositeTarget, width, height)
      } else {
        this.gradeGradientMapCompositeTarget = this.ensureTarget(this.gradeGradientMapCompositeTarget, width, height)
      }
      const composited = slot === 'secondary' ? this.gradeGradientMapCompositeTargetB!
        : slot === 'export' ? this.exportGradeGradientMapCompositeTarget!
        : this.gradeGradientMapCompositeTarget!
      // compositeProgram reused as a plain 2-input blend (uLayerCount=1) — "Blending Mode" reuses
      // blendLayer()'s existing multiply/screen/overlay math instead of a new shader, "Intensity"
      // is just uOpacities[0]. uMask's alpha is implicitly 1 everywhere (gradientMapProgram always
      // outputs vec4(mapped, 1.0)), so blend strength is purely intensity-driven.
      this.runPass(this.compositeProgram, composited, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, source.texture)
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBase'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, gradientMapped.texture)
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uMask'), 1)
        gl.uniform1fv(gl.getUniformLocation(this.compositeProgram, 'uOpacities'), new Float32Array([gm.intensity, 0, 0, 0]))
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBlendMode'), BLEND_MODE_INT[gm.blendMode])
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uLayerCount'), 1)
      })
      gradeInput = composited
    }

    if (slot === 'secondary') {
      this.lightColorTargetB = this.ensureTarget(this.lightColorTargetB, width, height)
    } else if (slot === 'export') {
      this.exportLightColorTarget = this.ensureTarget(this.exportLightColorTarget, width, height)
    } else {
      this.lightColorTarget = this.ensureTarget(this.lightColorTarget, width, height)
    }
    const lightColor = slot === 'secondary' ? this.lightColorTargetB!
      : slot === 'export' ? this.exportLightColorTarget!
      : this.lightColorTarget!
    this.runPass(this.lightColorProgram, lightColor, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, gradeInput.texture)
      gl.uniform1i(gl.getUniformLocation(this.lightColorProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uTemperature'), this.colorAdjust.temperature)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uTint'), this.colorAdjust.tint)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uExposure'), this.light.exposure)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uContrast'), this.light.contrast)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uHighlights'), this.light.highlights)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uShadows'), this.light.shadows)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uWhites'), this.light.whites)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uBlacks'), this.light.blacks)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uBrilliance'), this.light.brilliance)
      gl.uniform1f(gl.getUniformLocation(this.lightColorProgram, 'uVibrance'), this.colorAdjust.vibrance)
    })

    if (slot === 'secondary') {
      this.colorTargetB = this.ensureTarget(this.colorTargetB, width, height)
    } else if (slot === 'export') {
      this.exportColorTarget = this.ensureTarget(this.exportColorTarget, width, height)
    } else {
      this.colorTarget = this.ensureTarget(this.colorTarget, width, height)
    }
    const colorOut = slot === 'secondary' ? this.colorTargetB!
      : slot === 'export' ? this.exportColorTarget!
      : this.colorTarget!

    gl.bindFramebuffer(gl.FRAMEBUFFER, colorOut.framebuffer)
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.colorProgram)
    bindFullscreenQuadAttribs(gl, this.colorProgram, this.quadBuffer)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, lightColor.texture)
    gl.uniform1i(gl.getUniformLocation(this.colorProgram, 'uSource'), 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture)
    gl.uniform1i(gl.getUniformLocation(this.colorProgram, 'uLut'), 1)

    const bandShifts = new Float32Array(8 * 3)
    HUE_BAND_SWATCHES.forEach((swatch, i) => {
      const shift = this.hslByBand[swatch.key]
      bandShifts[i * 3] = shift.hue
      bandShifts[i * 3 + 1] = shift.saturation
      bandShifts[i * 3 + 2] = shift.lightness
    })
    gl.uniform3fv(gl.getUniformLocation(this.colorProgram, 'uBandShift'), bandShifts)

    gl.uniform1f(gl.getUniformLocation(this.colorProgram, 'uHue'), this.hslByBand.master.hue)
    gl.uniform1f(gl.getUniformLocation(this.colorProgram, 'uSaturation'), this.hslByBand.master.saturation)
    gl.uniform1f(gl.getUniformLocation(this.colorProgram, 'uLightness'), this.hslByBand.master.lightness)

    gl.uniform3fv(gl.getUniformLocation(this.colorProgram, 'uInvertMask'), [
      this.invert.rgb || this.invert.r ? 1 : 0,
      this.invert.rgb || this.invert.g ? 1 : 0,
      this.invert.rgb || this.invert.b ? 1 : 0,
    ])
    drawFullscreenQuad(gl)

    return colorOut
  }

  /**
   * Export tab's "Grade Intensity" slider — blends the ungraded
   * `base` and fully graded `graded` textures via the existing mixBlendProgram (already used for
   * the maximizer's "hardness" blend elsewhere in this class), reused here as a plain two-input
   * mix rather than a new shader. intensity>=1 and intensity<=0 are both zero-extra-cost: they
   * just return one of the two inputs directly without running a pass, so the common default
   * (Color Grade on, intensity 1) pays nothing beyond what runColorChain already did.
   */
  private blendGradeIntensity(base: TargetTexture, graded: TargetTexture, intensity: number, width: number, height: number): TargetTexture {
    if (intensity >= 1) return graded
    if (intensity <= 0) return base
    const gl = this.gl
    this.exportGradeIntensityTarget = this.ensureTarget(this.exportGradeIntensityTarget, width, height)
    this.runPass(this.mixBlendProgram, this.exportGradeIntensityTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, base.texture)
      gl.uniform1i(gl.getUniformLocation(this.mixBlendProgram, 'uBase'), 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, graded.texture)
      gl.uniform1i(gl.getUniformLocation(this.mixBlendProgram, 'uOverlay'), 1)
      gl.uniform1f(gl.getUniformLocation(this.mixBlendProgram, 'uOpacity'), intensity)
    })
    return this.exportGradeIntensityTarget
  }

  /**
   * Export tab's own live-preview resolve — the sole WYSIWYG authority for its (exportDisplayMode,
   * exportColorGrade) selection, fully decoupled from whatever Line Art's/Grade's own live tab
   * state currently shows (that's the whole point: Export's group, not the live editing tabs,
   * decides what actually gets exported, and the live canvas while Export is open must match it
   * exactly). Only invoked from render() while tabPreviewBypass==='exportPreview', i.e. only while
   * the Export tab is actually open — see App.tsx.
   */
  private renderExportPreview(): void {
    if (!this.exportPreviewDirty) return
    if (!this.enhanceTarget || !this.resizeTarget) return

    if (this.exportDisplayMode === 'original') {
      // Matches readExportPixels('original')'s own "bypasses Enhancement too" semantics — a
      // stricter boundary than Line Art's own 'original' displayMode (which only bypasses the
      // algorithm, not Enhancement). Color Grade is a no-op here regardless of its value.
      this.exportPreviewResult = this.resizeTarget
      this.exportPreviewDirty = false
      return
    }

    // Fast path: lineArtOutputTarget/colorTarget always resolve 'composite' regardless of Dual Pane
    // state (neither the preview-strip selector nor dualPaneModes drives them), so whenever Export
    // also wants 'composite', colorTarget already IS the answer — zero extra GPU work.
    if (this.exportDisplayMode === 'composite' && this.exportColorGrade && this.colorTarget && this.lineArtOutputTarget) {
      const { width, height } = this.colorTarget
      this.exportPreviewResult = this.blendGradeIntensity(this.lineArtOutputTarget, this.colorTarget, this.exportColorGradeIntensity, width, height)
      this.exportPreviewDirty = false
      return
    }

    if (!this.lineArtActive || !this.lineArtRawTarget) {
      // Line art is frozen (mid crop-drag) or hasn't computed a raw target yet this session —
      // fall back to the pre-line-art photo (optionally graded) rather than resolve against a
      // stale/missing raw target; this is a transient state that self-corrects next frame.
      this.exportPreviewResult = this.exportColorGrade && this.colorTarget
        ? this.blendGradeIntensity(this.enhanceTarget, this.colorTarget, this.exportColorGradeIntensity, this.enhanceTarget.width, this.enhanceTarget.height)
        : this.enhanceTarget
      this.exportPreviewDirty = false
      return
    }

    const { width, height } = this.enhanceTarget
    const resolved = this.resolveLineArtDisplay(
      this.enhanceTarget, this.lineArtRawTarget, this.exportDisplayMode, width, height, 'export',
    )
    this.exportPreviewResult = this.exportColorGrade
      ? this.blendGradeIntensity(resolved, this.runColorChain(resolved, width, height, 'export'), this.exportColorGradeIntensity, width, height)
      : resolved
    this.exportPreviewDirty = false
  }

  /**
   * Blits two textures side by side into the on-screen canvas, doubling the natural width and
   * splitting it down the middle via gl.viewport — the shared mechanics both Dual Pane "kinds"
   * (Line Art's colorTarget/colorTargetB pair, and Grade's fixed enhanceTarget/colorTarget pair)
   * need identically; only which two textures get bound differs per caller.
   */
  private blitSplitPane(leftTexture: WebGLTexture, rightTexture: WebGLTexture, paneWidth0: number, paneHeight0: number): void {
    const gl = this.gl
    const dpr = window.devicePixelRatio || 1
    const naturalWidth = paneWidth0 * 2
    const naturalHeight = paneHeight0
    const { width: boxWidth, height: boxHeight } = this.boxSize(naturalWidth, naturalHeight)
    const scale = Math.min(1, boxWidth / naturalWidth, boxHeight / naturalHeight)
    const renderWidth = Math.max(1, Math.round(naturalWidth * scale))
    const renderHeight = Math.max(1, Math.round(naturalHeight * scale))
    const backingWidth = Math.round(renderWidth * dpr)
    const backingHeight = Math.round(renderHeight * dpr)

    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth
      this.canvas.height = backingHeight
    }
    const styleWidth = `${renderWidth}px`
    const styleHeight = `${renderHeight}px`
    if (this.canvas.style.width !== styleWidth || this.canvas.style.height !== styleHeight) {
      this.canvas.style.width = styleWidth
      this.canvas.style.height = styleHeight
    }

    const paneWidth = Math.round(backingWidth / 2)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.blitProgram)
    bindFullscreenQuadAttribs(gl, this.blitProgram, this.quadBuffer)
    gl.uniform1i(gl.getUniformLocation(this.blitProgram, 'uSource'), 0)

    gl.viewport(0, 0, paneWidth, backingHeight)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, leftTexture)
    drawFullscreenQuad(gl)

    gl.viewport(paneWidth, 0, backingWidth - paneWidth, backingHeight)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, rightTexture)
    drawFullscreenQuad(gl)
  }

  render(): void {
    const gl = this.gl
    if (!this.sourceTexture || !this.sourceBitmap) return

    if (this.cropDirty) {
      const [, , sw, sh] = this.cropRect
      const width = Math.max(1, Math.round(sw * this.sourceBitmap.width))
      const height = Math.max(1, Math.round(sh * this.sourceBitmap.height))
      this.cropTarget = this.ensureTarget(this.cropTarget, width, height)

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.cropTarget.framebuffer)
      gl.viewport(0, 0, width, height)
      gl.useProgram(this.cropProgram)
      bindFullscreenQuadAttribs(gl, this.cropProgram, this.quadBuffer)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
      gl.uniform1i(gl.getUniformLocation(this.cropProgram, 'uSource'), 0)
      gl.uniform4fv(gl.getUniformLocation(this.cropProgram, 'uCropRect'), this.cropRect)
      drawFullscreenQuad(gl)

      this.cropDirty = false
      this.resizeDirty = true
      this.botanSeedDirty = true
      this.daiyaSeedDirty = true
    }
    if (!this.cropTarget) return

    if (this.resizeDirty) {
      if (this.resizeParams.mode === 'original') {
        // No-op passthrough at the crop's native size — don't force a
        // resample through the shader when the user hasn't asked for one,
        // same "alias instead of copy" convention as lineArtOutputTarget
        // when Line Art is inactive.
        this.resizeTarget = this.cropTarget
      } else {
        const width = Math.max(1, Math.round(this.resizeParams.customSize.width))
        const height = Math.max(1, Math.round(this.resizeParams.customSize.height))
        // resizeTarget may currently be aliased straight to cropTarget (see the
        // 'original' branch above) rather than an independently-owned target.
        // Handing that aliased object to ensureTarget as `existing` is unsafe
        // either way it resolves: same dimensions -> it hands back the same
        // object, so the runPass below binds cropTarget's framebuffer as the
        // render target while also sampling cropTarget.texture as the source,
        // a same-texture read/write feedback loop (surfaces as
        // GL_INVALID_OPERATION and a black frame on some drivers); different
        // dimensions -> it disposes cropTarget's GL resources out from under
        // the live this.cropTarget reference. Only pass the existing target
        // through for reuse/disposal when resizeTarget actually owns it.
        const ownedResizeTarget = this.resizeTarget === this.cropTarget ? null : this.resizeTarget
        this.resizeTarget = this.ensureTarget(ownedResizeTarget, width, height)
        this.runPass(this.resizeProgram, this.resizeTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.cropTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.resizeProgram, 'uSource'), 0)
        })
      }
      this.resizeDirty = false
      this.enhanceDirty = true
      this.botanSeedDirty = true
      this.daiyaSeedDirty = true
      // Fired here (post-resize), not in the cropDirty block above — Export's
      // "Original" resolution mode means "the resize module's output," not
      // the raw crop, so cropSize downstream (ExportPanel etc.) needs to
      // reflect resizeTarget's dimensions.
      this.onCropSizeChange?.({ width: this.resizeTarget.width, height: this.resizeTarget.height })
    }
    if (!this.resizeTarget) return

    if (this.enhanceDirty) {
      const { width, height } = this.resizeTarget
      this.enhanceTarget = this.runEnhance(this.resizeTarget, width, height)
      this.enhanceDirty = false
      this.lineArtDirty = true
    }
    if (!this.enhanceTarget) return

    if (this.lineArtDirty) {
      if (this.lineArtActive) {
        const { width, height } = this.enhanceTarget
        if (this.dualPaneEnabled) {
          // Shared raw algorithm output (Botan JFA etc. — the expensive part) computed once. Both
          // panes' REAL targets (lineArtOutputTarget/lineArtOutputTargetB, feeding runColorChain
          // below) always resolve 'composite', regardless of dualPaneModes — dualPaneModes only
          // drives the on-screen split-pane view's own independent peek resolve (see the
          // dualPaneEnabled blit branch further down), never the real graded output. See
          // computeLineArtRaw/resolveLineArtDisplay for the two halves this composes.
          this.lineArtRawTarget = this.applyInkCorrect(this.computeLineArtRaw(this.enhanceTarget, width, height), width, height)
          this.lineArtOutputTarget = this.resolveLineArtDisplay(
            this.enhanceTarget, this.lineArtRawTarget, 'composite', width, height, 'primary',
          )
          this.lineArtOutputTargetB = this.resolveLineArtDisplay(
            this.enhanceTarget, this.lineArtRawTarget, 'composite', width, height, 'secondary',
          )
        } else {
          this.lineArtOutputTarget = this.renderLineArt(this.enhanceTarget, width, height)
          this.lineArtOutputTargetB = null
        }
        this.lineArtDirty = false
      } else {
        // Frozen: cheap passthrough to the live (auto-updating) enhanceTarget
        // reference instead of the expensive algorithm chain. lineArtDirty is
        // deliberately left true so reactivating forces one fresh recompute.
        this.lineArtOutputTarget = this.enhanceTarget
        this.lineArtOutputTargetB = this.dualPaneEnabled ? this.enhanceTarget : null
      }
      this.colorDirty = true
      this.exportPreviewDirty = true
    }
    if (!this.lineArtOutputTarget) return

    if (this.colorDirty) {
      // Always run the full grading chain here, unconditionally, regardless of display mode —
      // colorTarget/colorTargetB are ensureTarget-managed fields that MUST always own their own
      // private texture (never a bare alias to some other field's texture, e.g. lineArtOutputTarget/
      // enhanceTarget): ensureTarget's reuse-by-dimension check trusts whatever texture a field
      // currently holds is safe to render fresh content into. An earlier version of this code
      // aliased colorTarget straight to lineArtOutputTarget when displayMode was 'original' (to
      // skip grading) — the NEXT time displayMode became non-'original', runColorChain's own
      // ensureTarget(this.colorTarget, ...) call reused that alias (same dimensions) and rendered
      // graded output directly into enhanceTarget's own framebuffer, permanently corrupting the
      // pre-line-art source for every future frame. "Original means before-everything" is instead
      // applied only at the point of consumption (the blit below, readFinalPixels) by picking
      // lineArtOutputTarget/lineArtOutputTargetB over colorTarget/colorTargetB there — never by
      // repointing the shared fields themselves.
      const { width, height } = this.lineArtOutputTarget
      this.runColorChain(this.lineArtOutputTarget, width, height, 'primary')
      if (this.dualPaneEnabled && this.lineArtOutputTargetB) {
        const { width: widthB, height: heightB } = this.lineArtOutputTargetB
        this.runColorChain(this.lineArtOutputTargetB, widthB, heightB, 'secondary')
      }
      this.colorDirty = false
    }
    if (!this.colorTarget) return

    // Present: cheap blit of the native-res result onto the on-screen
    // canvas — Export uses the full-res colorTarget directly, not this
    // downsampled/upsampled view (see readFinalPixels). In 'original'
    // preview mode, blits cropTarget instead — post-crop but before
    // Enhancement/Line Art/Color, since this A/B toggle is meant to compare
    // "before any line-processing/color work" against the final result, not
    // audit the crop itself. cropTarget is guaranteed non-null here (checked
    // earlier in render(), before colorTarget can exist).
    //
    // Sizing is contain-fit + never-enlarge against the CSS box
    // (canvas.clientWidth/Height), not "stretch to fill it": the backing
    // store (and the canvas's own inline style.width/height, since the box
    // is centered via a flex wrapper in PreviewViewport.tsx rather than
    // width:100%/height:100% — see that file) is sized from whichever
    // texture(s) are actually being shown (natural size), scaled down only
    // as far as needed to fit the box, never up past 1:1. This is what
    // decouples the Resize module's working resolution and Dual Pane's
    // doubled width from the viewport's CSS box size.
    // Dual Pane, either kind: bypasses previewMode/tabPreviewBypass entirely (a fullscreen A/B
    // toggle and a split-pane view never coexist in the UI) — see blitSplitPane for the shared
    // sizing/viewport mechanics.
    if (this.gradeDualPaneEnabled && this.lineArtOutputTarget && this.colorTarget) {
      // Grade's Dual Pane compares a fixed pair — lineArtOutputTarget (pre-grade, the true
      // ungraded Line Art module output) vs colorTarget (post-grade) — both already computed
      // every frame regardless of dual-pane state, unlike Line Art's pair below (which needs an
      // explicit per-mode resolve). No "modes" tuple needed.
      this.blitSplitPane(this.lineArtOutputTarget.texture, this.colorTarget.texture, this.lineArtOutputTarget.width, this.lineArtOutputTarget.height)
      return
    }

    if (this.dualPaneEnabled && this.colorTargetB && this.lineArtOutputTarget) {
      // Per-pane display substitution, applied only here at blit time — never by repointing
      // lineArtOutputTarget/colorTarget/colorTargetB themselves (see the colorDirty block's own
      // comment on why that corrupted enhanceTarget once already). "Original" means
      // before-everything: enhanceTarget directly, zero extra cost. "Overlay" needs its own
      // ungraded peek resolve (lineArtPeekOverlayTarget/B via resolveLineArtDisplay's 'previewA'/
      // 'previewB' slots) — computed here on demand, only when a pane actually wants it, never fed
      // into the real chain. "Composite" is just colorTarget/colorTargetB, which always hold the
      // true graded composite regardless of dualPaneModes, so this substitution can never leak
      // into Grade after leaving Dual Pane.
      const { width, height } = this.lineArtOutputTarget
      const resolvePeekTexture = (mode: LineArtDisplayMode, slot: 'previewA' | 'previewB', graded: TargetTexture): TargetTexture => {
        if (mode === 'original') return this.enhanceTarget!
        if (mode === 'overlay' && this.lineArtRawTarget) {
          return this.resolveLineArtDisplay(this.enhanceTarget!, this.lineArtRawTarget, 'overlay', width, height, slot)
        }
        return graded
      }
      const leftTexture = resolvePeekTexture(this.dualPaneModes[0], 'previewA', this.colorTarget).texture
      const rightTexture = resolvePeekTexture(this.dualPaneModes[1], 'previewB', this.colorTargetB).texture
      this.blitSplitPane(leftTexture, rightTexture, this.colorTarget.width, this.colorTarget.height)
      return
    }

    if (this.tabPreviewBypass === 'exportPreview') this.renderExportPreview()
    // Computed on demand, only while actually being peeked — mirrors renderExportPreview's own
    // conditional call just above. Ungraded (see lineArtPeekOverlayTarget's own doc comment) —
    // never written into lineArtOutputTarget/colorTarget, so it can't leak into Grade/Export.
    if (this.tabPreviewBypass === 'lineArtOverlay' && this.enhanceTarget && this.lineArtRawTarget) {
      const { width, height } = this.lineArtRawTarget
      this.lineArtPeekOverlayTarget = this.resolveLineArtDisplay(
        this.enhanceTarget, this.lineArtRawTarget, 'overlay', width, height, 'previewA',
      )
    }

    const tabBypassTarget = this.tabPreviewBypass === 'enhance' ? this.enhanceTarget
      : this.tabPreviewBypass === 'lineArtComposite' ? this.lineArtOutputTarget
      : this.tabPreviewBypass === 'exportPreview' ? (this.exportPreviewResult ?? this.colorTarget)
      : this.tabPreviewBypass === 'lineArtOverlay' ? this.lineArtPeekOverlayTarget
      : null
    const previewTarget = tabBypassTarget ?? (this.previewMode === 'original' ? this.cropTarget! : this.colorTarget)
    // Debug-only: identifies which target actually got selected for the blit. Uses the 5x5-grid
    // sampler, not the single-center-pixel one, since a center sample can miss a real difference
    // localized elsewhere (e.g. right where detected line-art actually draws).
    this.traceSampleGrid('gl:previewTarget-at-blit', previewTarget, {
      mode: this.lineArt.mode,
      previewMode: this.previewMode,
      tabPreviewBypass: this.tabPreviewBypass,
      selected: this.tabPreviewBypass === 'enhance' ? 'enhanceTarget'
        : this.tabPreviewBypass === 'lineArtComposite' ? 'lineArtOutputTarget'
        : this.tabPreviewBypass === 'exportPreview' ? 'exportPreviewResult'
        : this.tabPreviewBypass === 'lineArtOverlay' ? 'lineArtPeekOverlayTarget'
        : this.previewMode === 'original' ? 'cropTarget' : 'colorTarget',
    })
    const dpr = window.devicePixelRatio || 1
    const naturalWidth = previewTarget.width
    const naturalHeight = previewTarget.height
    const { width: boxWidth, height: boxHeight } = this.boxSize(naturalWidth, naturalHeight)
    const scale = Math.min(1, boxWidth / naturalWidth, boxHeight / naturalHeight)
    const renderWidth = Math.max(1, Math.round(naturalWidth * scale))
    const renderHeight = Math.max(1, Math.round(naturalHeight * scale))
    const backingWidth = Math.round(renderWidth * dpr)
    const backingHeight = Math.round(renderHeight * dpr)

    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth
      this.canvas.height = backingHeight
    }
    const styleWidth = `${renderWidth}px`
    const styleHeight = `${renderHeight}px`
    if (this.canvas.style.width !== styleWidth || this.canvas.style.height !== styleHeight) {
      this.canvas.style.width = styleWidth
      this.canvas.style.height = styleHeight
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.blitProgram)
    bindFullscreenQuadAttribs(gl, this.blitProgram, this.quadBuffer)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, previewTarget.texture)
    gl.uniform1i(gl.getUniformLocation(this.blitProgram, 'uSource'), 0)
    drawFullscreenQuad(gl)
  }

  /**
   * Reads back the full native-resolution pipeline output for Export.
   * Only called on the Export button click, never per-frame — readPixels
   * is a GPU-CPU sync stall. Returns raw bottom-up (OpenGL row order)
   * RGBA bytes; the caller flips rows when building an ImageData.
   *
   * While Dual Pane is active, reads from whichever of colorTarget/colorTargetB
   * dualPanePriorityIndex() resolves to (composite > overlay > original) instead of always
   * pane A — see that method's doc comment.
   */
  readFinalPixels(): { data: Uint8ClampedArray; width: number; height: number } | null {
    // Setters now go through scheduleRender (rAF-coalesced) rather than
    // rendering synchronously — force one final synchronous pass here so a
    // pending-but-not-yet-fired frame can never leak a stale readback.
    this.render()
    const source =
      this.dualPaneEnabled && this.colorTargetB
        ? (this.dualPanePriorityIndex() === 1 ? this.colorTargetB : this.colorTarget)
        : this.colorTarget
    if (!source) return null
    return this.readTargetPixels(source)
  }

  private readTargetPixels(target: TargetTexture): { data: Uint8ClampedArray; width: number; height: number } {
    const gl = this.gl
    const { width, height, framebuffer } = target
    const buffer = new Uint8ClampedArray(width * height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer)
    return { data: buffer, width, height }
  }

  /**
   * Single-pixel readback from enhanceTarget (post denoise/sharpen, pre
   * line-art, pre color-grade) for the Luminance Ramp eyedropper — this is
   * the actual image Gumi's threshold/ramp math (threshold.frag.ts) reads,
   * so sampling here stays correct even under drawn ink or before the color
   * grade that runs later in the chain. u/v are normalized canvas-fraction
   * coordinates with v=0 at the top of the displayed image; enhanceTarget is
   * an ordinary render-to-texture output (not the raw source bitmap), so it
   * follows the standard convention (top of image -> v=1) rather than the
   * source-texture flip anomaly documented on crop.frag.ts.
   *
   * Forces one synchronous render() first, same rationale as
   * readFinalPixels: flushes any pending rAF-coalesced param change so a
   * drag can't read a stale frame. Cheap when nothing's dirty. Called on
   * every pointer-move during a drag, so this reads a single texel via
   * gl.readPixels(x, y, 1, 1, ...) rather than the whole target.
   */
  sampleEnhancePixel(u: number, v: number): { r: number; g: number; b: number } | null {
    this.render()
    const target = this.enhanceTarget
    if (!target) return null
    const gl = this.gl
    const x = Math.min(target.width - 1, Math.max(0, Math.round(u * target.width)))
    const y = Math.min(target.height - 1, Math.max(0, Math.round((1 - v) * target.height)))
    const buffer = new Uint8Array(4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buffer)
    return { r: buffer[0], g: buffer[1], b: buffer[2] }
  }

  /**
   * Export tab's own explicit Original/Composite/Overlay selector (independent of whatever the
   * live single-pane preview's displayMode or Dual Pane is currently showing) — see
   * ExportPanel.tsx's "Export Output" group. 'original' bypasses Enhancement/Line Art/Color
   * entirely and reads the Crop module's own finished output (crop rect + Resize) directly —
   * `resizeTarget`, not `enhanceTarget` — per explicit product direction: Export's "Original"
   * means "post crop, bypass everything, even Enhancement," a stricter/different meaning than
   * LineArtDisplayMode's 'original' (which is `enhanceTarget`, i.e. post-Enhancement); colorGrade
   * is a no-op here regardless of its value, for the same reason. For 'composite'/'overlay',
   * recomputes a fresh resolve for that specific mode using the dedicated 'export' slot fields
   * (renderExportPreview's own targets, not the primary pipeline's — so this never clobbers
   * whatever's actually live on screen, unlike the old primary-slot-reuse approach this replaced).
   * colorGrade false skips runColorChain entirely, reading pixels straight off the resolve.
   * colorGradeIntensity blends the two via blendGradeIntensity (see its doc comment) — 1 and 0
   * are both zero-extra-cost, matching colorGrade true/false's existing cost exactly.
   */
  readExportPixels(exportMode: ExportDisplayMode, colorGrade: boolean, colorGradeIntensity: number): { data: Uint8ClampedArray; width: number; height: number } | null {
    this.render()
    if (exportMode === 'original') {
      if (!this.resizeTarget) return null
      return this.readTargetPixels(this.resizeTarget)
    }
    if (!this.enhanceTarget) return null
    const { width, height } = this.enhanceTarget
    const rawTarget = this.computeLineArtRaw(this.enhanceTarget, width, height)
    const resolved = this.resolveLineArtDisplay(this.enhanceTarget, rawTarget, exportMode, width, height, 'export')
    const finalTarget = colorGrade
      ? this.blendGradeIntensity(resolved, this.runColorChain(resolved, width, height, 'export'), colorGradeIntensity, width, height)
      : resolved
    return this.readTargetPixels(finalTarget)
  }

  destroy(): void {
    this.canvasResizeObserver.disconnect()
    this.disposeContextHandlers()
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture)
    if (this.sourceBitmap) this.sourceBitmap.close()
    for (const target of [
      this.cropTarget, this.resizeTarget, this.smoothTarget, this.sharpenBlurHTarget, this.sharpenBlurVTarget, this.sharpenTarget,
      this.enhanceTarget, this.correctedTarget, this.toneExposureTarget, this.denoisedTarget, this.maskTarget,
      this.erodeHTarget, this.erodeVTarget, this.gateTarget, this.seedTargetA,
      this.seedTargetB, this.distanceMaskTarget, this.daiyaSeedTargetA, this.daiyaSeedTargetB, this.daiyaDistanceMaskTarget,
      this.daiyaOctagonHTarget, this.daiyaOctagonVTarget, this.daiyaSoftThresholdTarget, this.daiyaSoftThresholdModTarget,
      this.botanFillColorTarget, this.chieFillColorTarget,
      this.softHardnessHTarget, this.softHardnessVTarget, this.softHardnessMixTarget,
      this.edgeMapTarget, this.blurHTarget, this.blurVTarget,
      this.tintTarget, this.lineArtBlendTarget, this.lineArtOverlayPreviewTarget, this.colorTarget,
      this.gradeGradientMapTarget, this.gradeGradientMapCompositeTarget,
      this.lineArtBlendTargetB, this.lineArtOverlayPreviewTargetB, this.colorTargetB,
      this.gradeGradientMapTargetB, this.gradeGradientMapCompositeTargetB,
      this.lineArtRawTarget, this.exportLineArtBlendTarget, this.exportLineArtOverlayTarget,
      this.exportLightColorTarget, this.exportColorTarget,
      this.exportGradeGradientMapTarget, this.exportGradeGradientMapCompositeTarget, this.exportGradeIntensityTarget,
      this.lineArtPeekOverlayTarget, this.lineArtPeekOverlayTargetB, this.inkCorrectTarget,
      this.rampTarget, this.gumiBoostTarget, this.gumiMaskTarget, this.gumiMaxHTarget, this.gumiMaxVTarget,
      this.gumiCloseHTarget, this.gumiCloseVTarget,
      this.gumiOverdriveHTarget, this.gumiOverdriveVTarget,
      this.gumiHardnessHTarget, this.gumiHardnessVTarget, this.gumiHardnessMixTarget, this.gumiLineColorTarget,
      this.gumiDualBlackColorTarget, this.gumiDualWhiteColorTarget, this.gumiDualMergeTarget,
      this.gumiSeedTargetA, this.gumiSeedTargetB, this.gumiBlobTarget, this.gumiBleedTarget, this.gradientMapTarget,
      this.highPassTarget, this.laplacianTarget, this.laplacianSharpenTarget, this.hiThreshTarget, this.hiRawTreatedTarget,
      this.edgeFillColorTarget, this.hiThreshFillColorTarget,
      this.toneRemapTarget, this.responsiveColorTarget, this.responsiveWhiteExtractTarget,
      this.responsiveBlackExtractTarget, this.responsiveGrowWhiteTarget, this.responsiveGrowBlackTarget,
    ]) {
      if (target) disposeTargetTexture(this.gl, target)
    }
    this.gl.deleteTexture(this.lutTexture)
    for (const program of [
      this.cropProgram, this.colorCorrectProgram, this.denoiseProgram, this.thresholdProgram,
      this.minFilterProgram, this.minFilterContinuousProgram, this.erosionProgram, this.erosionGateProgram, this.distanceSeedProgram,
      this.jfaStepProgram, this.distanceToEdgeProgram, this.findEdgesProgram, this.boxBlurProgram,
      this.mixBlendProgram, this.layerMergeProgram,
      this.unsharpMaskProgram, this.alphaOverWhiteProgram, this.alphaModulateProgram, this.compositeProgram,
      this.colorProgram, this.blitProgram, this.resizeProgram, this.plateauRampProgram, this.softThresholdProgram,
      this.fillMaskProgram, this.blobMaskProgram, this.maskFillColorProgram, this.gradientMapProgram, this.highPassDiffProgram,
      this.laplacianProgram, this.toneRemapProgram, this.responsiveEdgeColorProgram, this.inkColorMaskProgram,
      this.inkColorRecombineProgram, this.edgeFillColorProgram,
    ]) {
      this.gl.deleteProgram(program)
    }
    this.gl.deleteBuffer(this.quadBuffer)
  }
}
