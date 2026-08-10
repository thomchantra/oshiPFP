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
import { erosionRgbFrag } from './shaders/erosionRgb.frag'
import { erosionGateFrag } from './shaders/erosionGate.frag'
import { distanceSeedFrag } from './shaders/distanceSeed.frag'
import { jfaStepFrag } from './shaders/jfaStep.frag'
import { distanceToEdgeFrag } from './shaders/distanceToEdge.frag'
import { findEdgesFrag } from './shaders/findEdges.frag'
import { boxBlurFrag } from './shaders/boxBlur.frag'
import { unsharpMaskFrag } from './shaders/unsharpMask.frag'
import { saturationAdjustFrag } from './shaders/saturationAdjust.frag'
import { colorLiftFrag } from './shaders/colorLift.frag'
import { alphaOverWhiteFrag } from './shaders/alphaOverWhite.frag'
import { compositeFrag } from './shaders/composite.frag'
import { tintMaskFrag } from './shaders/tintMask.frag'
import { blitFrag } from './shaders/blit.frag'
import { resizeFrag } from './shaders/resize.frag'
import { plateauRampFrag } from './shaders/plateauRamp.frag'
import { softThresholdFrag } from './shaders/softThreshold.frag'
import { fillMaskFrag } from './shaders/fillMask.frag'
import { blobMaskFrag } from './shaders/blobMask.frag'
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
import type { ColorAdjustParams, ColorLiftParams, EnhanceParams, HslByBand, HslShift, InvertParams, LightParams, LineArtDisplayMode, LineArtParams, ResizeParams } from '../types'
import { HUE_BAND_SWATCHES } from '../color/hslPalette'
import { pinchToPlateau } from '../tone/pinchRamp'

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
  threshold: 0,
  radius: 1,
  hardness: 1,
  blobContrast: 1,
  colorExpansion: true,
  colorContrast: 1,
  gateThreshold: 0,
  sensitivity: 3,
  saturation: 0.5,
  colorMode: 'tint',
  tintColor: [1, 0.475, 0.886], // #FF79E2
  vividDeadzone: 0.15,
  vividBoost: 1,
  gumiContrastBoost: 1,
  blobMaxDt: 8,
  gumiColorBleed: false,
  gumiBleedFeather: 1.5,
  gumiSoftDetection: false,
  gumiSoftness: 0.1,
  gumiFillMode: false,
  gumiGradientMap: false,
  gumiGradientShadow: [0, 0, 0],
  gumiGradientMid: [0.5, 0.5, 0.5],
  gumiGradientHighlight: [1, 1, 1],
  gumiRampFloor: 0,
  gumiRampInnerLow: 0.3,
  gumiRampInnerHigh: 0.7,
  gumiRampCeiling: 1,
  gumiRampFeather: 0,
  thresholdEnabled: false,
  hiToneTarget: 'off',
  hiToneGain: 1,
  hiToneContrast: 1,
  highPassStrength: 1,
  highPassResponsiveColor: false,
  responsiveCrossover: 0.5,
  responsiveGrow: 0,
  responsiveGrowBias: 0,
  laplacianStrength: 1,
  laplacianPreBlur: 0,
  laplacianSharpenAmount: 0,
  laplacianGrow: 0,
}

/** Piecewise-linear "hardness" macro shared by Botan/Chie: -1 -> 200% of base max feather, 0 -> 50%, 1 -> hard clip (0). See changelog/oshipfp-v0.2-lineart-saga.md session 7. */
const HARDNESS_BASE_MAX_FEATHER: Partial<Record<LineArtParams['mode'], number>> = { pathB: 5, pathC: 1 }
function hardnessToFeather(hardness: number, base: number): number {
  return hardness <= 0 ? base * (2 - 1.5 * (hardness + 1)) : base * 0.5 * (1 - hardness)
}

/** uBlendMode ints for composite.frag.ts's blendLayer. */
const BLEND_MODE_INT: Record<LineArtParams['blendMode'], number> = { multiply: 1, screen: 2, overlay: 3 }

/** Dual Pane "which pane is canonical" priority — composite beats overlay beats original. Mirrors
 * App.tsx's DUAL_PANE_PRIORITY_INDEX (UI-side precedent for the corner preview); kept here as the
 * source of truth for readFinalPixels()/the final blit's own pane-selection needs. */
const DISPLAY_MODE_PRIORITY: Record<LineArtDisplayMode, number> = { composite: 2, overlay: 1, original: 0 }

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
  private erosionProgram: WebGLProgram
  private erosionGateProgram: WebGLProgram
  private distanceSeedProgram: WebGLProgram
  private jfaStepProgram: WebGLProgram
  private distanceToEdgeProgram: WebGLProgram
  private findEdgesProgram: WebGLProgram
  private boxBlurProgram: WebGLProgram
  private unsharpMaskProgram: WebGLProgram
  private saturationAdjustProgram: WebGLProgram
  private colorLiftProgram: WebGLProgram
  private alphaOverWhiteProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private tintMaskProgram: WebGLProgram
  private lightColorProgram: WebGLProgram
  private colorProgram: WebGLProgram
  private blitProgram: WebGLProgram
  private resizeProgram: WebGLProgram
  private plateauRampProgram: WebGLProgram
  private softThresholdProgram: WebGLProgram
  private fillMaskProgram: WebGLProgram
  private blobMaskProgram: WebGLProgram
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
  private growHTarget: TargetTexture | null = null
  private growVTarget: TargetTexture | null = null
  private erodeHTarget: TargetTexture | null = null
  private erodeVTarget: TargetTexture | null = null
  private gateTarget: TargetTexture | null = null
  private seedTargetA: TargetTexture | null = null
  private seedTargetB: TargetTexture | null = null
  private distanceMaskTarget: TargetTexture | null = null
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

  // Dual Pane (desktop-only, Workstream C) — second independent copy of the
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

  // Path G (Gumi) / H (Hinata) / I (Inori) — see renderLineArt's pathG/H/I
  // branches, ported 1:1 from src/lab/labPipeline.ts's render().
  private rampTarget: TargetTexture | null = null
  private gumiBoostTarget: TargetTexture | null = null
  private gumiMaskTarget: TargetTexture | null = null
  private gumiMaxHTarget: TargetTexture | null = null
  private gumiMaxVTarget: TargetTexture | null = null
  private gumiSeedTargetA: TargetTexture | null = null
  private gumiSeedTargetB: TargetTexture | null = null
  private gumiBlobTarget: TargetTexture | null = null
  private gumiBleedTarget: TargetTexture | null = null
  private gradientMapTarget: TargetTexture | null = null
  private highPassTarget: TargetTexture | null = null
  private laplacianTarget: TargetTexture | null = null
  private laplacianSharpenTarget: TargetTexture | null = null
  private hiThreshTarget: TargetTexture | null = null
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
  /** See setLineArtActive — true by default so the very first render (before App.tsx's tab-driven call lands) still shows Botan. */
  private lineArtActive = true
  /** Fullscreen-preview A/B toggle (App.tsx renders it only while no tab is selected) — 'original' blits cropTarget (post-crop, pre-Enhancement/Line Art/Color) instead of the fully-processed colorTarget. Only affects the on-screen canvas; Export always reads the full colorTarget regardless. */
  private previewMode: 'original' | 'result' = 'result'
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
  /** Notified with cropTarget's pixel dimensions whenever a crop recompute resolves — cheap (no GPU readback, just the already-known width/height), lets the Export tab show/compute against the real crop output size without needing a full readFinalPixels() call just to read two numbers. */
  private onCropSizeChange: ((size: { width: number; height: number }) => void) | null = null

  /** Dual Pane toggle state — see setDualPane. Desktop-only in the UI (App.tsx gates it behind the
   * same 900px breakpoint as .rampmeter-desktop-only), but the pipeline itself has no width
   * awareness and will happily render dual-pane at any canvas size if asked. */
  private dualPaneEnabled = false
  private dualPaneModes: [LineArtDisplayMode, LineArtDisplayMode] = ['original', 'composite']

  private cropRect: CropRect = [0, 0, 1, 1]
  private hslByBand: HslByBand = IDENTITY_HSL_BY_BAND
  private invert: InvertParams = IDENTITY_INVERT
  private light: LightParams = IDENTITY_LIGHT
  private colorAdjust: ColorAdjustParams = IDENTITY_COLOR_ADJUST
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
    this.erosionProgram = createProgram(this.gl, passthroughVert, erosionRgbFrag)
    this.erosionGateProgram = createProgram(this.gl, passthroughVert, erosionGateFrag)
    this.distanceSeedProgram = createProgram(this.gl, passthroughVert, distanceSeedFrag)
    this.jfaStepProgram = createProgram(this.gl, passthroughVert, jfaStepFrag)
    this.distanceToEdgeProgram = createProgram(this.gl, passthroughVert, distanceToEdgeFrag)
    this.findEdgesProgram = createProgram(this.gl, passthroughVert, findEdgesFrag)
    this.boxBlurProgram = createProgram(this.gl, passthroughVert, boxBlurFrag)
    this.unsharpMaskProgram = createProgram(this.gl, passthroughVert, unsharpMaskFrag)
    this.saturationAdjustProgram = createProgram(this.gl, passthroughVert, saturationAdjustFrag)
    this.colorLiftProgram = createProgram(this.gl, passthroughVert, colorLiftFrag)
    this.alphaOverWhiteProgram = createProgram(this.gl, passthroughVert, alphaOverWhiteFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.tintMaskProgram = createProgram(this.gl, passthroughVert, tintMaskFrag)
    this.lightColorProgram = createProgram(this.gl, passthroughVert, lightColorCorrectFrag)
    this.colorProgram = createProgram(this.gl, passthroughVert, curvesHslFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.resizeProgram = createProgram(this.gl, passthroughVert, resizeFrag)
    this.plateauRampProgram = createProgram(this.gl, passthroughVert, plateauRampFrag)
    this.softThresholdProgram = createProgram(this.gl, passthroughVert, softThresholdFrag)
    this.fillMaskProgram = createProgram(this.gl, passthroughVert, fillMaskFrag)
    this.blobMaskProgram = createProgram(this.gl, passthroughVert, blobMaskFrag)
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
    for (const key of [
      'cropTarget', 'resizeTarget', 'smoothTarget', 'sharpenBlurHTarget', 'sharpenBlurVTarget', 'sharpenTarget', 'enhanceTarget',
      'correctedTarget', 'toneExposureTarget', 'colorLiftTarget', 'denoisedTarget', 'maskTarget', 'growHTarget', 'growVTarget',
      'erodeHTarget', 'erodeVTarget', 'gateTarget', 'seedTargetA', 'seedTargetB', 'distanceMaskTarget',
      'edgeMapTarget', 'blurHTarget', 'blurVTarget', 'tintTarget', 'saturationTarget', 'lineArtBlendTarget',
      'lineArtOverlayPreviewTarget', 'lineArtOutputTarget', 'lightColorTarget', 'colorTarget',
      'lineArtBlendTargetB', 'lineArtOverlayPreviewTargetB', 'lineArtOutputTargetB', 'lightColorTargetB', 'colorTargetB',
      'rampTarget', 'gumiBoostTarget', 'gumiMaskTarget', 'gumiMaxHTarget', 'gumiMaxVTarget', 'gumiSeedTargetA',
      'gumiSeedTargetB', 'gumiBlobTarget', 'gumiBleedTarget', 'gradientMapTarget', 'highPassTarget',
      'laplacianTarget', 'laplacianSharpenTarget', 'hiThreshTarget', 'toneRemapTarget', 'responsiveColorTarget',
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
    this.erosionProgram = createProgram(this.gl, passthroughVert, erosionRgbFrag)
    this.erosionGateProgram = createProgram(this.gl, passthroughVert, erosionGateFrag)
    this.distanceSeedProgram = createProgram(this.gl, passthroughVert, distanceSeedFrag)
    this.jfaStepProgram = createProgram(this.gl, passthroughVert, jfaStepFrag)
    this.distanceToEdgeProgram = createProgram(this.gl, passthroughVert, distanceToEdgeFrag)
    this.findEdgesProgram = createProgram(this.gl, passthroughVert, findEdgesFrag)
    this.boxBlurProgram = createProgram(this.gl, passthroughVert, boxBlurFrag)
    this.unsharpMaskProgram = createProgram(this.gl, passthroughVert, unsharpMaskFrag)
    this.saturationAdjustProgram = createProgram(this.gl, passthroughVert, saturationAdjustFrag)
    this.colorLiftProgram = createProgram(this.gl, passthroughVert, colorLiftFrag)
    this.alphaOverWhiteProgram = createProgram(this.gl, passthroughVert, alphaOverWhiteFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.tintMaskProgram = createProgram(this.gl, passthroughVert, tintMaskFrag)
    this.lightColorProgram = createProgram(this.gl, passthroughVert, lightColorCorrectFrag)
    this.colorProgram = createProgram(this.gl, passthroughVert, curvesHslFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.resizeProgram = createProgram(this.gl, passthroughVert, resizeFrag)
    this.plateauRampProgram = createProgram(this.gl, passthroughVert, plateauRampFrag)
    this.softThresholdProgram = createProgram(this.gl, passthroughVert, softThresholdFrag)
    this.fillMaskProgram = createProgram(this.gl, passthroughVert, fillMaskFrag)
    this.blobMaskProgram = createProgram(this.gl, passthroughVert, blobMaskFrag)
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

  setCropRect(rect: CropRect): void {
    this.cropRect = rect
    this.cropDirty = true
    this.scheduleRender()
  }

  setCurveLut(lut: Uint8Array): void {
    updateLutTexture(this.gl, this.lutTexture, lut, 3)
    this.colorDirty = true
    this.scheduleRender()
  }

  setHsl(hslByBand: HslByBand): void {
    this.hslByBand = hslByBand
    this.colorDirty = true
    this.scheduleRender()
  }

  setInvert(invert: InvertParams): void {
    this.invert = invert
    this.colorDirty = true
    this.scheduleRender()
  }

  setLight(light: LightParams): void {
    this.light = light
    this.colorDirty = true
    this.scheduleRender()
  }

  setColorAdjust(colorAdjust: ColorAdjustParams): void {
    this.colorAdjust = colorAdjust
    this.colorDirty = true
    this.scheduleRender()
  }

  setEnhanceParams(params: EnhanceParams): void {
    this.enhance = params
    this.enhanceDirty = true
    // Enhancement runs before Botan's detection source, same as a crop change.
    this.botanSeedDirty = true
    this.scheduleRender()
  }

  setLineArtParams(params: LineArtParams): void {
    const prev = this.lineArt
    if (
      params.mode !== prev.mode ||
      params.threshold !== prev.threshold ||
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
    }
    this.lineArt = params
    this.lineArtDirty = true
    this.scheduleRender()
  }

  /**
   * Gates the expensive per-algorithm recompute (Botan's JFA alone is ~11
   * full-res passes) by whether the app actually needs to see it live right
   * now — App.tsx passes false while the Crop tab is active, since crop
   * pan/zoom fires setCropRect on every pointer-move and cascades into
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
   * Desktop-only Dual Pane toggle (Workstream C) — when enabled, `render()`
   * resolves BOTH given displayModes through the full downstream Color
   * chain (instead of just the single active LineArtParams.displayMode)
   * and blits them side-by-side into a double-wide canvas. Pane A always
   * lands in the same primary fields (lineArtOutputTarget/colorTarget)
   * single-pane rendering already used, so readFinalPixels()/export is
   * unaffected either way — it's documented there as reading "whichever
   * pane computed through the primary chain" when dual-pane happens to be
   * on, which is a debug-viewing feature, not a normal export state.
   */
  setDualPane(enabled: boolean, modes: [LineArtDisplayMode, LineArtDisplayMode]): void {
    const changed =
      this.dualPaneEnabled !== enabled || this.dualPaneModes[0] !== modes[0] || this.dualPaneModes[1] !== modes[1]
    this.dualPaneEnabled = enabled
    this.dualPaneModes = modes
    if (!changed) return
    // lineArtOutputTarget's resolution (original/overlay/composite) and the
    // Color chain built on top of it both depend on which mode(s) are
    // active — force both stages to re-run so turning Dual Pane on/off (or
    // switching its pane-pair) doesn't leave a stale texture on screen.
    this.lineArtDirty = true
    this.colorDirty = true
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
   * Smooth's slider range (0-3, was 0-1) needed more than a bigger number
   * to actually do more: the range filter's spatial kernel already
   * saturates at 5 texels (MAX_KERNEL in denoise.frag.ts) by slider value
   * 1, so past that point only uThreshold (the range-filter's color-
   * distance gate) has any further room to push — widening it lets the
   * filter blend across the small color jumps a JPEG block edge produces,
   * which is exactly the "won't budge on real artifacts" case that
   * prompted the higher ceiling (see changelog). Kernel size still caps
   * at slider value 1; only the threshold keeps climbing above it.
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
   * Gumi/Path G's always-on "gradient map" stage 1. Ported from
   * labPipeline.ts's runPlateauRamp; here it's only ever called from Gumi's
   * own branch (production has no optional pre-detection ramp toggle for
   * other modes, unlike the lab harness).
   */
  private runPlateauRamp(source: TargetTexture, p: LineArtParams, width: number, height: number): TargetTexture {
    const gl = this.gl
    this.rampTarget = this.ensureTarget(this.rampTarget, width, height)
    this.runPass(this.plateauRampProgram, this.rampTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.plateauRampProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uFloor'), p.gumiRampFloor)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uInnerLow'), p.gumiRampInnerLow)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uInnerHigh'), p.gumiRampInnerHigh)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uCeiling'), p.gumiRampCeiling)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uFeather'), p.gumiRampFeather)
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

  /** Composite-readiness remap for Path H/I's raw output — see toneRemap.frag.ts. */
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
    return this.toneRemapTarget
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

      if (seedStale) {
      this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
      this.seedTargetA = this.ensureFloatTarget(this.seedTargetA, width, height)
      this.seedTargetB = this.ensureFloatTarget(this.seedTargetB, width, height)

      this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), p.threshold)
      })
      this.runPass(this.distanceSeedProgram, this.seedTargetA, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.maskTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.distanceSeedProgram, 'uMask'), 0)
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

      const feather = hardnessToFeather(p.hardness, HARDNESS_BASE_MAX_FEATHER.pathB!)
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
        gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorExpansion'), p.colorExpansion ? 1 : 0)
        gl.uniform3fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uLineColor'), p.tintColor)
      })
      outputTarget = this.distanceMaskTarget
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
      outputTarget = this.gateTarget
    } else if (p.mode === 'pathD') {
      this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
      this.growHTarget = this.ensureTarget(this.growHTarget, width, height)
      this.growVTarget = this.ensureTarget(this.growVTarget, width, height)

      this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), p.threshold)
      })

      const intRadius = Math.max(0, Math.round(p.radius * (Math.SQRT2 - 1)))
      const diag = Math.SQRT1_2
      const directions: [number, number][] = [[1, 0], [0, 1], [diag, diag], [diag, -diag]]
      const scratch = [this.growHTarget, this.growVTarget]
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
        })
        src = dst
      })

      this.tintTarget = this.ensureTarget(this.tintTarget, width, height)
      this.runPass(this.tintMaskProgram, this.tintTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, src.texture)
        gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uSource'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, base.texture)
        gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uOriginal'), 1)
        gl.uniform3fv(gl.getUniformLocation(this.tintMaskProgram, 'uTintColor'), p.tintColor)
        gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uVividMode'), p.colorMode === 'vivid' ? 1 : 0)
        gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uDeadzone'), p.vividDeadzone)
        gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uVividBoost'), p.vividBoost)
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

      if (p.colorMode !== 'findEdge') {
        this.tintTarget = this.ensureTarget(this.tintTarget, width, height)
        this.runPass(this.tintMaskProgram, this.tintTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture)
          gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uSource'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uOriginal'), 1)
          gl.uniform3fv(gl.getUniformLocation(this.tintMaskProgram, 'uTintColor'), p.tintColor)
          gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uVividMode'), p.colorMode === 'vivid' ? 1 : 0)
          gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uDeadzone'), p.vividDeadzone)
          gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uVividBoost'), p.vividBoost)
        })
        outputTarget = this.tintTarget
      }

      // Master saturation, applied once to the fully-resolved ink layer
      // (whichever of Find Edge/Tint/Vivid produced it) rather than inside
      // findEdges.frag.ts — see saturationAdjust.frag.ts's header for why
      // that used to only affect Find Edge mode.
      this.saturationTarget = this.ensureTarget(this.saturationTarget, width, height)
      this.runPass(this.saturationAdjustProgram, this.saturationTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture)
        gl.uniform1i(gl.getUniformLocation(this.saturationAdjustProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.saturationAdjustProgram, 'uSaturation'), p.saturation)
      })
      outputTarget = this.saturationTarget
    } else if (p.mode === 'pathG' && p.gumiGradientMap) {
      // Crude Gradient Map prototype — see gradientMap.frag.ts. No
      // threshold/closing/blob-or-bleed chain at all: every pixel gets
      // recolored directly off the 3-stop ramp, then composited below like
      // every other mode's resolved output (production has no separate
      // crossfade path the lab harness uses for this case — see this
      // workstream's report for the resulting behavior difference).
      this.gradientMapTarget = this.ensureTarget(this.gradientMapTarget, width, height)
      this.runPass(this.gradientMapProgram, this.gradientMapTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.gradientMapProgram, 'uSource'), 0)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uShadowColor'), p.gumiGradientShadow)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uMidColor'), p.gumiGradientMid)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uHighlightColor'), p.gumiGradientHighlight)
      })
      outputTarget = this.gradientMapTarget
    } else if (p.mode === 'pathG') {
      // Path G (Gumi): luminance-band isolation (always-on plateau ramp) ->
      // contrast boost (reuses colorCorrect's pivot-at-0.5 contrast curve)
      // -> threshold into a binary mask (uInvert=1 — ramp's high
      // band-weight means "this IS the selected stroke") -> closing
      // (minFilter1D's min mode). Then one of two final treatments, picked
      // by gumiColorBleed — see labPipeline.ts's pathG branch for the full
      // rationale, ported 1:1 here.
      const gumiRamp = this.runPlateauRamp(detectionSource, p, width, height)

      this.gumiBoostTarget = this.ensureTarget(this.gumiBoostTarget, width, height)
      this.runPass(this.colorCorrectProgram, this.gumiBoostTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, gumiRamp.texture)
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
      const gumiRadius = Math.round(p.radius)
      this.runPass(this.minFilterProgram, this.gumiMaxHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiMaskTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
        gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), gumiRadius)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [1, 0])
      })
      this.runPass(this.minFilterProgram, this.gumiMaxVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.gumiMaxHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
        gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), gumiRadius)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
      })

      if (p.gumiColorBleed) {
        const gumiSeed = this.runGumiDistanceTransform(this.gumiMaxVTarget, false, width, height)
        this.gumiBleedTarget = this.ensureTarget(this.gumiBleedTarget, width, height)
        this.runPass(this.distanceToEdgeProgram, this.gumiBleedTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, gumiSeed.texture)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uSeed'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, base.texture)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uOriginal'), 1)
          gl.uniform2fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uTexSize'), [width, height])
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uRadius'), p.blobMaxDt)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uFeather'), p.gumiBleedFeather)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uGamma'), p.blobContrast)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorContrast'), p.colorContrast)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorExpansion'), p.colorExpansion ? 1 : 0)
          gl.uniform3fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uLineColor'), p.tintColor)
        })
        outputTarget = this.gumiBleedTarget
      } else {
        const gumiSeed = this.runGumiDistanceTransform(this.gumiMaxVTarget, true, width, height)
        this.gumiBlobTarget = this.ensureTarget(this.gumiBlobTarget, width, height)
        if (p.gumiFillMode) {
          this.runPass(this.fillMaskProgram, this.gumiBlobTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, gumiSeed.texture)
            gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uSeed'), 0)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, this.gumiMaxVTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uMask'), 1)
            gl.activeTexture(gl.TEXTURE2)
            gl.bindTexture(gl.TEXTURE_2D, base.texture)
            gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uOriginal'), 2)
            gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uBlobMaxDt'), p.blobMaxDt)
          })
        } else {
          this.runPass(this.blobMaskProgram, this.gumiBlobTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, gumiSeed.texture)
            gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uSeed'), 0)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, this.gumiMaxVTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uMask'), 1)
            gl.uniform1f(gl.getUniformLocation(this.blobMaskProgram, 'uBlobMaxDt'), p.blobMaxDt)
            gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uSoftOutput'), p.gumiSoftDetection ? 1 : 0)
          })
        }
        outputTarget = this.gumiBlobTarget
      }
    } else if (p.mode === 'pathH' && p.highPassResponsiveColor) {
      // Dual-polarity litmus test (see responsiveEdgeColor.frag.ts):
      // locally-adaptive ink color instead of one fixed polarity. Reuses
      // the same box-blur pass Fumiko's normal chain computes — the
      // blurred local-neighborhood average IS the "rough area check".
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
          })
          this.runPass(this.minFilterProgram, result, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), growRadius)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uMode'), 1)
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

      outputTarget = this.responsiveColorTarget
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
          })
          this.runPass(this.minFilterProgram, this.blurVTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
            gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), growRadius)
            gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
          })
          hiRaw = this.blurVTarget
        }
      }

      // Output treatment, shared by H/I: tone-remap takes priority when
      // active, then hard-threshold binarize, then the untouched raw diff.
      if (p.hiToneTarget !== 'off') {
        outputTarget = this.runToneRemap(hiRaw, p.hiToneTarget, p, width, height)
      } else if (p.thresholdEnabled) {
        this.hiThreshTarget = this.ensureTarget(this.hiThreshTarget, width, height)
        this.runPass(this.thresholdProgram, this.hiThreshTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, hiRaw.texture)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), p.threshold)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), p.blendMode === 'screen' ? 1 : 0)
        })
        outputTarget = this.hiThreshTarget
      } else {
        outputTarget = hiRaw
      }
    }

    return outputTarget
  }

  /**
   * Resolves an explicit LineArtDisplayMode (instead of always reading
   * `this.lineArt.displayMode`) against a raw algorithm-chain output from
   * computeLineArtRaw — factored out of what used to be the tail end of
   * renderLineArt so Dual Pane can call this twice (once per pane) against
   * the one shared rawTarget, each writing into its own set of target
   * textures (isSecondary picks pane B's fields over pane A's/the single-
   * pane defaults) so the two invocations within one frame don't clobber
   * each other's framebuffers.
   */
  private resolveLineArtDisplay(
    base: TargetTexture,
    rawTarget: TargetTexture,
    mode: LineArtDisplayMode,
    width: number,
    height: number,
    isSecondary: boolean,
  ): TargetTexture {
    const gl = this.gl
    const p = this.lineArt

    if (mode === 'original') return base

    if (mode === 'overlay') {
      // rawTarget carries straight (non-premultiplied) alpha now — flatten
      // it onto plain white for this raw preview instead of blitting the
      // partial alpha straight to the (alpha-enabled) canvas, which would
      // let the page background show through.
      if (isSecondary) {
        this.lineArtOverlayPreviewTargetB = this.ensureTarget(this.lineArtOverlayPreviewTargetB, width, height)
      } else {
        this.lineArtOverlayPreviewTarget = this.ensureTarget(this.lineArtOverlayPreviewTarget, width, height)
      }
      const target = isSecondary ? this.lineArtOverlayPreviewTargetB! : this.lineArtOverlayPreviewTarget!
      this.runPass(this.alphaOverWhiteProgram, target, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, rawTarget.texture)
        gl.uniform1i(gl.getUniformLocation(this.alphaOverWhiteProgram, 'uSource'), 0)
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
    const forcedMultiply = p.mode === 'pathF' && p.colorMode === 'findEdge'
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
    if (isSecondary) {
      this.lineArtBlendTargetB = this.ensureTarget(this.lineArtBlendTargetB, width, height)
    } else {
      this.lineArtBlendTarget = this.ensureTarget(this.lineArtBlendTarget, width, height)
    }
    const target = isSecondary ? this.lineArtBlendTargetB! : this.lineArtBlendTarget!
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

  /** Runs the full algorithm chain and resolves it against the single active LineArtParams.displayMode — the non-Dual-Pane case. See computeLineArtRaw/resolveLineArtDisplay for the two halves this composes. */
  private renderLineArt(base: TargetTexture, width: number, height: number): TargetTexture {
    const rawTarget = this.computeLineArtRaw(base, width, height)
    return this.resolveLineArtDisplay(base, rawTarget, this.lineArt.displayMode, width, height, false)
  }

  /**
   * Light+Color basic correction (lightColorCorrect.frag.ts) into curves+HSL
   * (curvesHsl.frag.ts) — the downstream chain every LineArtDisplayMode
   * variant's output passes through on its way to colorTarget, factored out
   * of render()'s single-path colorDirty block so Dual Pane can invoke it
   * twice (pane A into the primary lightColorTarget/colorTarget fields,
   * pane B into the *B-suffixed pair) against the two different line-art
   * variants resolveLineArtDisplay produced. Every uniform here reads from
   * this.colorAdjust/light/hslByBand/invert/lutTexture, identical for both
   * panes — only `source` (and thus the output) differs.
   */
  private runColorChain(source: TargetTexture, width: number, height: number, isSecondary: boolean): TargetTexture {
    const gl = this.gl

    if (isSecondary) {
      this.lightColorTargetB = this.ensureTarget(this.lightColorTargetB, width, height)
    } else {
      this.lightColorTarget = this.ensureTarget(this.lightColorTarget, width, height)
    }
    const lightColor = isSecondary ? this.lightColorTargetB! : this.lightColorTarget!
    this.runPass(this.lightColorProgram, lightColor, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
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

    if (isSecondary) {
      this.colorTargetB = this.ensureTarget(this.colorTargetB, width, height)
    } else {
      this.colorTarget = this.ensureTarget(this.colorTarget, width, height)
    }
    const colorOut = isSecondary ? this.colorTargetB! : this.colorTarget!

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
        this.resizeTarget = this.ensureTarget(this.resizeTarget, width, height)
        this.runPass(this.resizeProgram, this.resizeTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.cropTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.resizeProgram, 'uSource'), 0)
        })
      }
      this.resizeDirty = false
      this.enhanceDirty = true
      this.botanSeedDirty = true
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
          // Shared raw algorithm output (Botan JFA etc. — the expensive
          // part) computed once, then resolved against each pane's own
          // displayMode — see computeLineArtRaw/resolveLineArtDisplay.
          const rawTarget = this.computeLineArtRaw(this.enhanceTarget, width, height)
          this.lineArtOutputTarget = this.resolveLineArtDisplay(
            this.enhanceTarget, rawTarget, this.dualPaneModes[0], width, height, false,
          )
          this.lineArtOutputTargetB = this.resolveLineArtDisplay(
            this.enhanceTarget, rawTarget, this.dualPaneModes[1], width, height, true,
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
    }
    if (!this.lineArtOutputTarget) return

    if (this.colorDirty) {
      const { width, height } = this.lineArtOutputTarget
      this.runColorChain(this.lineArtOutputTarget, width, height, false)
      if (this.dualPaneEnabled && this.lineArtOutputTargetB) {
        const { width: widthB, height: heightB } = this.lineArtOutputTargetB
        this.runColorChain(this.lineArtOutputTargetB, widthB, heightB, true)
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
    const dpr = window.devicePixelRatio || 1

    if (this.dualPaneEnabled && this.colorTargetB) {
      // Dual Pane: mirror labPipeline.ts's splitMode — blit each pane into
      // its own half of the canvas via gl.viewport. Bypasses previewMode
      // entirely (always shows the two colorTarget/colorTargetB results,
      // never cropTarget's "original" A/B view) — that toggle only applies
      // to the deselected fullscreen preview, which Dual Pane (a Line Art
      // tab-only, desktop-only feature) never coexists with in the UI.
      const naturalWidth = this.colorTarget.width * 2
      const naturalHeight = this.colorTarget.height
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
      gl.bindTexture(gl.TEXTURE_2D, this.colorTarget.texture)
      drawFullscreenQuad(gl)

      gl.viewport(paneWidth, 0, backingWidth - paneWidth, backingHeight)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.colorTargetB.texture)
      drawFullscreenQuad(gl)
      return
    }

    const previewTarget = this.previewMode === 'original' ? this.cropTarget! : this.colorTarget
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
    const gl = this.gl
    const { width, height, framebuffer } = source
    const buffer = new Uint8ClampedArray(width * height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer)
    return { data: buffer, width, height }
  }

  destroy(): void {
    this.canvasResizeObserver.disconnect()
    this.disposeContextHandlers()
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture)
    if (this.sourceBitmap) this.sourceBitmap.close()
    for (const target of [
      this.cropTarget, this.resizeTarget, this.smoothTarget, this.sharpenBlurHTarget, this.sharpenBlurVTarget, this.sharpenTarget,
      this.enhanceTarget, this.correctedTarget, this.toneExposureTarget, this.denoisedTarget, this.maskTarget, this.growHTarget,
      this.growVTarget, this.erodeHTarget, this.erodeVTarget, this.gateTarget, this.seedTargetA,
      this.seedTargetB, this.distanceMaskTarget, this.edgeMapTarget, this.blurHTarget, this.blurVTarget,
      this.tintTarget, this.lineArtBlendTarget, this.lineArtOverlayPreviewTarget, this.colorTarget,
      this.lineArtBlendTargetB, this.lineArtOverlayPreviewTargetB, this.colorTargetB,
      this.rampTarget, this.gumiBoostTarget, this.gumiMaskTarget, this.gumiMaxHTarget, this.gumiMaxVTarget,
      this.gumiSeedTargetA, this.gumiSeedTargetB, this.gumiBlobTarget, this.gumiBleedTarget, this.gradientMapTarget,
      this.highPassTarget, this.laplacianTarget, this.laplacianSharpenTarget, this.hiThreshTarget,
      this.toneRemapTarget, this.responsiveColorTarget, this.responsiveWhiteExtractTarget,
      this.responsiveBlackExtractTarget, this.responsiveGrowWhiteTarget, this.responsiveGrowBlackTarget,
    ]) {
      if (target) disposeTargetTexture(this.gl, target)
    }
    this.gl.deleteTexture(this.lutTexture)
    for (const program of [
      this.cropProgram, this.colorCorrectProgram, this.denoiseProgram, this.thresholdProgram,
      this.minFilterProgram, this.erosionProgram, this.erosionGateProgram, this.distanceSeedProgram,
      this.jfaStepProgram, this.distanceToEdgeProgram, this.findEdgesProgram, this.boxBlurProgram,
      this.unsharpMaskProgram, this.alphaOverWhiteProgram, this.compositeProgram, this.tintMaskProgram,
      this.colorProgram, this.blitProgram, this.resizeProgram, this.plateauRampProgram, this.softThresholdProgram,
      this.fillMaskProgram, this.blobMaskProgram, this.gradientMapProgram, this.highPassDiffProgram,
      this.laplacianProgram, this.toneRemapProgram, this.responsiveEdgeColorProgram, this.inkColorMaskProgram,
      this.inkColorRecombineProgram,
    ]) {
      this.gl.deleteProgram(program)
    }
    this.gl.deleteBuffer(this.quadBuffer)
  }
}
