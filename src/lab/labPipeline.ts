import { createGLContext, wireContextLossHandlers } from '../gl/glContext'
import { createProgram, createFullscreenQuad, bindFullscreenQuadAttribs, drawFullscreenQuad } from '../gl/shaderUtils'
import {
  createTargetTexture,
  createFloatTargetTexture,
  disposeTargetTexture,
  uploadBitmapAsTarget,
  type TargetTexture,
} from '../gl/framebufferPool'
import { passthroughVert } from '../gl/shaders/passthrough.vert'
import { cropFrag } from '../gl/shaders/crop.frag'
import { colorCorrectFrag } from '../gl/shaders/colorCorrect.frag'
import { denoiseFrag } from '../gl/shaders/denoise.frag'
import { tintMaskFrag } from '../gl/shaders/tintMask.frag'
import { thresholdFrag } from '../gl/shaders/threshold.frag'
import { minFilter1DFrag } from '../gl/shaders/minFilter1D.frag'
import { erosionRgbFrag } from '../gl/shaders/erosionRgb.frag'
import { erosionGateFrag } from '../gl/shaders/erosionGate.frag'
import { distanceSeedFrag } from '../gl/shaders/distanceSeed.frag'
import { jfaStepFrag } from '../gl/shaders/jfaStep.frag'
import { distanceToEdgeFrag } from '../gl/shaders/distanceToEdge.frag'
import { findEdgesFrag } from '../gl/shaders/findEdges.frag'
import { boxBlurFrag } from '../gl/shaders/boxBlur.frag'
import { mixBlendFrag } from '../gl/shaders/mixBlend.frag'
import { compositeFrag } from '../gl/shaders/composite.frag'
import { blitFrag } from '../gl/shaders/blit.frag'
import { plateauRampFrag } from '../gl/shaders/plateauRamp.frag'
import { blobMaskFrag } from '../gl/shaders/blobMask.frag'
import { highPassDiffFrag } from '../gl/shaders/highPassDiff.frag'
import { laplacianFrag } from '../gl/shaders/laplacian.frag'
import { toneRemapFrag } from '../gl/shaders/toneRemap.frag'
import { responsiveEdgeColorFrag } from '../gl/shaders/responsiveEdgeColor.frag'
import { inkColorMaskFrag } from '../gl/shaders/inkColorMask.frag'
import { inkColorRecombineFrag } from '../gl/shaders/inkColorRecombine.frag'
import { gradientMapFrag } from '../gl/shaders/gradientMap.frag'
import { softThresholdFrag } from '../gl/shaders/softThreshold.frag'
import { fillMaskFrag } from '../gl/shaders/fillMask.frag'
import { unsharpMaskFrag } from '../gl/shaders/unsharpMask.frag'
import { createSourceTexture } from '../gl/texture'
import { loadSourceBitmap } from '../imageLoad'
import { runPathEVectorize } from './pathE'

export type LabMode =
  | 'original'
  | 'v1-reference'
  | 'pathA'
  | 'pathB'
  | 'pathC'
  | 'pathF'
  | 'pathD'
  | 'pathE'
  | 'pathG'
  | 'pathH'
  | 'pathI'

export type ViewMode = 'original' | 'composited' | 'raw'

export interface LabParams {
  threshold: number
  radius: number
  feather: number
  gateThreshold: number
  sensitivity: number
  colorExpansion: boolean
  gamma: number
  colorContrast: number
  saturation: number
  opacity: number
  exposure: number
  contrast: number
  blackClip: number
  whiteClip: number
  tintColor: [number, number, number]
  vividMode: boolean
  tintEnabled: boolean
  vividDeadzone: number
  vividBoost: number
  denoiseEnabled: boolean
  denoiseIntensity: number
  denoiseThreshold: number
  // 4-point plateau/feather luminance-band ramp (see plateauRamp.frag.ts).
  // Optional pre-detection stage for v1/B/D/F/G/H/I; Path G always applies
  // it (its own "gradient map" stage) regardless of rampEnabled.
  rampEnabled: boolean
  rampFloor: number
  rampInnerLow: number
  rampInnerHigh: number
  rampCeiling: number
  rampFeather: number
  // Path G (Gumi): contrast boost (post-ramp histogram push, reuses
  // colorCorrect's pivot contrast curve) + max-filter closing radius
  // (shares `radius`) + blob-suppression distance threshold (px, also
  // reused as the color-bleed style's falloff radius). gumiColorBleed
  // swaps the hard blob-DT reject for Path B/Botan's own graduated
  // distanceToEdge treatment (see labPipeline.ts's pathG branch) —
  // gumiBleedFeather/gamma/colorContrast/colorExpansion are that
  // treatment's params, reusing the same-named params Path B already has
  // where the concept is identical (gamma, colorContrast, colorExpansion).
  gumiContrastBoost: number
  blobMaxDt: number
  // blobMask.frag.ts/fillMask.frag.ts's antialiasing-falloff sharpness
  // (pow(t, uGamma) on the accept/reject transition near uBlobMaxDt).
  // Must be set explicitly at every call site — an unset uniform defaults
  // to 0, and pow(t, 0) collapses to ~1 for any t>0, jumping the falloff
  // straight to "fully reject" the instant a pixel is past uBlobMaxDt's
  // edge instead of ramping smoothly.
  gumiBlobGamma: number
  gumiColorBleed: boolean
  gumiBleedFeather: number
  // Taper/antialiasing fix (softThreshold.frag.ts + blobMask.frag.ts's
  // uSoftOutput) — replaces the hard threshold with a smoothstep band so a
  // tapering stroke's faint tip fades out instead of being cut off, and
  // edges read as antialiased instead of stair-stepped. Independent of
  // gumiColorBleed (modifies the threshold *input* stage; color-bleed
  // swaps the *final* stage) — compatible with either.
  gumiSoftDetection: boolean
  gumiSoftness: number
  // Fill-layer MVP (fillMask.frag.ts) — flips blob suppression's keep
  // condition to preserve deep interiors (the shading/fill regions the
  // stroke layer rejects) instead of near-boundary strokes, passing the
  // original color through unmodified rather than flattening to ink.
  // Mutually exclusive with gumiColorBleed (both redefine the final
  // stage); independent of gumiSoftDetection (still affects the
  // threshold *input* either way).
  gumiFillMode: boolean
  // Crude Gradient Map prototype (gradientMap.frag.ts) — what Gumi was
  // originally meant to be per user direction: a continuous luminance ->
  // color recolorization (3-stop shadow/mid/highlight), no threshold/
  // binary decision anywhere, unlike the rest of Path G. When on, bypasses
  // the entire ramp/threshold/closing/blob-or-bleed pipeline below and
  // outputs a fully-resolved recolored image (crossfade-composited, like
  // Path A/C, not multiply-masked).
  gumiGradientMap: boolean
  gumiGradientShadow: [number, number, number]
  gumiGradientMid: [number, number, number]
  gumiGradientHighlight: [number, number, number]
  // Path H (High Pass) / Path I (Laplacian) shared optional-threshold
  // toggle (both share `threshold` for the cutoff value itself), plus a
  // tone-remap alternative (toneRemap.frag.ts) that takes priority over
  // thresholdEnabled when not 'off' — see the isMaskMode/composite
  // section of render().
  thresholdEnabled: boolean
  highPassStrength: number
  laplacianStrength: number
  laplacianPreBlur: number
  laplacianSharpenAmount: number
  // Post-kernel grow (minFilter1D's default min mode, texels) — Laplacian
  // alone has no way to thicken a line, only intensify/dissolve it; reuses
  // the same separable grow v1-reference/Path D already do.
  laplacianGrow: number
  hiToneTarget: 'off' | 'multiply' | 'screen'
  hiToneGain: number
  hiToneContrast: number
  // Path H dual-polarity litmus test (responsiveEdgeColor.frag.ts) —
  // locally-adaptive ink color (white on locally-dark areas, black on
  // locally-light) instead of a single fixed polarity. Takes over Path
  // H's entire output when on, bypassing hiToneTarget/thresholdEnabled
  // (it already produces a fully-resolved colored mask, not a grayscale
  // one those treatments expect).
  highPassResponsiveColor: boolean
  responsiveCrossover: number
  // Post-detection grow for responsive edge color (see
  // inkColorMask.frag.ts/inkColorRecombine.frag.ts) — the zero-crossing
  // fix makes lines ~1px by construction, so thickness needs its own
  // explicit step rather than being a side effect of radius/strength.
  // responsiveGrowBias (-1..1, 0=neutral) lets one color win contested
  // growth at a polarity boundary instead of the two colors fighting to a
  // muddy draw.
  responsiveGrow: number
  responsiveGrowBias: number
  // Shared by every mask-mode path's composite.frag.ts call (was
  // hardcoded to 1/multiply) — 0=replace, 1=multiply, 2=screen, 3=overlay.
  compositeBlendMode: number
}

/** Fixed denoise-blur radius (texels) applied ahead of Path F's Sobel edge
 * detection — see boxBlur.frag.ts. Not user-tunable yet; a small always-on
 * amount to suppress JPEG/texture noise reads as false edges. */
const PATH_F_BLUR_RADIUS = 1.2

/** Fixed blur radius (texels) for Path I's optional post-sharpen unsharp
 * mask's own internal blurred reference — see unsharpMask.frag.ts. Not
 * user-tunable, same "one less knob" reasoning as PATH_F_BLUR_RADIUS. */
const LAPLACIAN_SHARPEN_BLUR_RADIUS = 1.5

const FULL_RECT: [number, number, number, number] = [0, 0, 1, 1]

/**
 * Modes that produce a grayscale grow/edge *mask* (0=line/black,
 * 1=fill/white), composited onto the base via a true multiply blend —
 * reusing composite.frag.ts's exact blend math, the same formula the real
 * product's Maximizer stage uses — so mask-style candidates are judged by
 * how they'd actually look as darkened linework over real art, not a flat
 * gray crossfade. Path A instead outputs a complete replacement color
 * image (not a separate mask layer), so it keeps a linear original<->
 * result crossfade — multiplying two full color images together isn't the
 * right operation there. Per user direction, only multiply (darken black
 * outlines) is wired up for now; screen (lighten white outlines, blend
 * mode 2 in composite.frag.ts) is deferred until product needs it.
 *
 * Path C belongs here too, not with Path A: erosionGate.frag.ts's own doc
 * comment is explicit that its alpha (.a = gate strength) is meant for
 * composite.frag.ts to consume — "rather than pre-mixing toward the
 * original at low gate", so gate=0 pixels fall back to the untouched base
 * regardless of blend mode — matching composite.frag.ts's own doc
 * comment, which lists erosionGate.frag.ts by name as one of its
 * intended alpha sources.
 */
const MASK_MODES = new Set<LabMode>(['v1-reference', 'pathB', 'pathC', 'pathF', 'pathD', 'pathE', 'pathG'])

/** Number of stacked layers Path F's "alpha overdrive" opacity macro
 * cycles through — see the isMaskMode composite branch in render(). */
const ALPHA_OVERDRIVE_LAYERS = 3

/**
 * Standalone lab pipeline for the v0.2 line-art expansion debug page. Not a
 * reuse of gl/pipeline.ts — that class is a frozen, fixed stage chain
 * (crop -> color -> threshold -> grow -> composite -> blit) coupled to the
 * product's params; this needs a switchable-algorithm chain instead, so it
 * gets its own minimal class built from the same low-level GL utilities.
 *
 * The raw ImageBitmap source texture has the flip-y anomaly documented in
 * shaderUtils.ts/crop.frag.ts (Chrome ignores UNPACK_FLIP_Y_WEBGL for
 * ImageBitmap uploads). Reusing crop.frag.ts with a full [0,0,1,1] rect is
 * the cheapest way to get a "normalized" (standard-orientation) copy of the
 * source once, so every downstream lab shader can sample with plain vUV
 * per the project's no-flip-downstream convention.
 */
export class LabPipeline {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private normalizeProgram: WebGLProgram
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
  private mixBlendProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private tintMaskProgram: WebGLProgram
  private blitProgram: WebGLProgram
  private plateauRampProgram: WebGLProgram
  private blobMaskProgram: WebGLProgram
  private highPassDiffProgram: WebGLProgram
  private laplacianProgram: WebGLProgram
  private toneRemapProgram: WebGLProgram
  private unsharpMaskProgram: WebGLProgram
  private responsiveEdgeColorProgram: WebGLProgram
  private inkColorMaskProgram: WebGLProgram
  private inkColorRecombineProgram: WebGLProgram
  private gradientMapProgram: WebGLProgram
  private softThresholdProgram: WebGLProgram
  private fillMaskProgram: WebGLProgram
  private quadBuffer: WebGLBuffer

  private sourceTexture: WebGLTexture | null = null
  private sourceBitmap: ImageBitmap | null = null
  private normalizedTarget: TargetTexture | null = null
  private correctedTarget: TargetTexture | null = null
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
  private blendTarget: TargetTexture | null = null
  private pathEResultTarget: TargetTexture | null = null
  private tintTarget: TargetTexture | null = null
  private pathFTintTarget: TargetTexture | null = null
  private rampTarget: TargetTexture | null = null
  private gumiBoostTarget: TargetTexture | null = null
  private gumiMaskTarget: TargetTexture | null = null
  private gumiMaxHTarget: TargetTexture | null = null
  private gumiMaxVTarget: TargetTexture | null = null
  private gumiSeedTargetA: TargetTexture | null = null
  private gumiSeedTargetB: TargetTexture | null = null
  private gumiBlobTarget: TargetTexture | null = null
  private gumiInkTarget: TargetTexture | null = null
  // Aliases gumiBlobTarget for one frame — never owns a texture itself, so
  // deliberately not in the ensureTarget-managed field list or destroy()'s
  // disposal list (gumiBlobTarget already owns and disposes that texture).
  // See rawTarget's doc comment in render().
  private gumiRawOverride: TargetTexture | null = null
  private gumiBleedTarget: TargetTexture | null = null
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
  private gradientMapTarget: TargetTexture | null = null

  private mode: LabMode = 'original'
  private params: LabParams = {
    threshold: 0.5,
    radius: 1.5,
    feather: 1.5,
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

  private viewMode: ViewMode = 'composited'
  /** Side-by-side compare: left pane always Original, right pane always
   * Composited, regardless of viewMode — see render()'s tail. Both are
   * already computed every frame (normalizedTarget/outputTarget), so this
   * only changes how the canvas is blitted, not what gets rendered. */
  private splitMode = false

  private disposeContextHandlers: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = createGLContext(canvas)
    this.gl.getExtension('EXT_color_buffer_float')
    this.normalizeProgram = createProgram(this.gl, passthroughVert, cropFrag)
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
    this.mixBlendProgram = createProgram(this.gl, passthroughVert, mixBlendFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.tintMaskProgram = createProgram(this.gl, passthroughVert, tintMaskFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.plateauRampProgram = createProgram(this.gl, passthroughVert, plateauRampFrag)
    this.blobMaskProgram = createProgram(this.gl, passthroughVert, blobMaskFrag)
    this.highPassDiffProgram = createProgram(this.gl, passthroughVert, highPassDiffFrag)
    this.laplacianProgram = createProgram(this.gl, passthroughVert, laplacianFrag)
    this.toneRemapProgram = createProgram(this.gl, passthroughVert, toneRemapFrag)
    this.unsharpMaskProgram = createProgram(this.gl, passthroughVert, unsharpMaskFrag)
    this.responsiveEdgeColorProgram = createProgram(this.gl, passthroughVert, responsiveEdgeColorFrag)
    this.inkColorMaskProgram = createProgram(this.gl, passthroughVert, inkColorMaskFrag)
    this.inkColorRecombineProgram = createProgram(this.gl, passthroughVert, inkColorRecombineFrag)
    this.gradientMapProgram = createProgram(this.gl, passthroughVert, gradientMapFrag)
    this.softThresholdProgram = createProgram(this.gl, passthroughVert, softThresholdFrag)
    this.fillMaskProgram = createProgram(this.gl, passthroughVert, fillMaskFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    this.disposeContextHandlers = wireContextLossHandlers(
      canvas,
      () => this.handleContextLost(),
      () => this.handleContextRestored(),
    )
  }

  private handleContextLost(): void {
    this.sourceTexture = null
    for (const key of [
      'normalizedTarget',
      'correctedTarget',
      'denoisedTarget',
      'maskTarget',
      'growHTarget',
      'growVTarget',
      'erodeHTarget',
      'erodeVTarget',
      'gateTarget',
      'seedTargetA',
      'seedTargetB',
      'distanceMaskTarget',
      'edgeMapTarget',
      'blurHTarget',
      'blurVTarget',
      'blendTarget',
      'pathEResultTarget',
      'tintTarget',
      'pathFTintTarget',
      'rampTarget',
      'gumiBoostTarget',
      'gumiMaskTarget',
      'gumiMaxHTarget',
      'gumiMaxVTarget',
      'gumiSeedTargetA',
      'gumiSeedTargetB',
      'gumiBlobTarget',
      'gumiInkTarget',
      'gumiBleedTarget',
      'highPassTarget',
      'laplacianTarget',
      'laplacianSharpenTarget',
      'hiThreshTarget',
      'toneRemapTarget',
      'responsiveColorTarget',
      'responsiveWhiteExtractTarget',
      'responsiveBlackExtractTarget',
      'responsiveGrowWhiteTarget',
      'responsiveGrowBlackTarget',
      'gradientMapTarget',
    ] as const) {
      this[key] = null
    }
  }

  private handleContextRestored(): void {
    this.gl = createGLContext(this.canvas)
    this.gl.getExtension('EXT_color_buffer_float')
    this.normalizeProgram = createProgram(this.gl, passthroughVert, cropFrag)
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
    this.mixBlendProgram = createProgram(this.gl, passthroughVert, mixBlendFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.tintMaskProgram = createProgram(this.gl, passthroughVert, tintMaskFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.plateauRampProgram = createProgram(this.gl, passthroughVert, plateauRampFrag)
    this.blobMaskProgram = createProgram(this.gl, passthroughVert, blobMaskFrag)
    this.highPassDiffProgram = createProgram(this.gl, passthroughVert, highPassDiffFrag)
    this.laplacianProgram = createProgram(this.gl, passthroughVert, laplacianFrag)
    this.toneRemapProgram = createProgram(this.gl, passthroughVert, toneRemapFrag)
    this.unsharpMaskProgram = createProgram(this.gl, passthroughVert, unsharpMaskFrag)
    this.responsiveEdgeColorProgram = createProgram(this.gl, passthroughVert, responsiveEdgeColorFrag)
    this.inkColorMaskProgram = createProgram(this.gl, passthroughVert, inkColorMaskFrag)
    this.inkColorRecombineProgram = createProgram(this.gl, passthroughVert, inkColorRecombineFrag)
    this.gradientMapProgram = createProgram(this.gl, passthroughVert, gradientMapFrag)
    this.softThresholdProgram = createProgram(this.gl, passthroughVert, softThresholdFrag)
    this.fillMaskProgram = createProgram(this.gl, passthroughVert, fillMaskFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    if (this.sourceBitmap) {
      this.sourceTexture = createSourceTexture(this.gl, this.sourceBitmap)
    }
    this.scheduleRender()
  }

  async loadFile(file: File): Promise<{ width: number; height: number }> {
    const bitmap = await loadSourceBitmap(file, this.gl)
    if (this.sourceBitmap) this.sourceBitmap.close()
    this.sourceBitmap = bitmap
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture)
    this.sourceTexture = createSourceTexture(this.gl, bitmap)
    this.scheduleRender()
    return { width: bitmap.width, height: bitmap.height }
  }

  setMode(mode: LabMode): void {
    this.mode = mode
    this.scheduleRender()
  }

  setParams(params: LabParams): void {
    this.params = params
    this.scheduleRender()
  }

  setViewMode(viewMode: ViewMode): void {
    this.viewMode = viewMode
    this.scheduleRender()
  }

  /**
   * Sets viewMode and renders synchronously, with no scheduleRender() call
   * queued at all — setViewMode()+render() back to back still leaves a
   * stale rAF-scheduled render pending (from setViewMode's own
   * scheduleRender), which reads whatever this.viewMode is WHEN IT FIRES,
   * not when it was queued. A caller doing several setViewMode+render
   * calls in a row with an await between them (e.g. capturing multiple
   * viewMode snapshots via canvas.toBlob) can have that stale callback
   * fire mid-sequence and silently overwrite the canvas with a later
   * viewMode's output before the earlier capture's toBlob() actually reads
   * pixels — this method exists specifically to avoid that race.
   */
  renderViewModeSync(viewMode: ViewMode): void {
    this.viewMode = viewMode
    this.render()
  }

  /**
   * Same rationale as renderViewModeSync, for mode+params instead of
   * viewMode — a batch loop doing setMode/setParams/render/await-toBlob
   * per cell leaves a stray scheduled render pending from setMode/
   * setParams's own scheduleRender() calls, which can fire mid-await and
   * silently repaint the canvas with a later cell's mode/params before an
   * earlier cell's toBlob() capture actually reads pixels.
   */
  setModeParamsSync(mode: LabMode, params: LabParams): void {
    this.mode = mode
    this.params = params
    this.render()
  }

  setSplitMode(splitMode: boolean): void {
    this.splitMode = splitMode
    this.scheduleRender()
  }

  /**
   * Eyedropper calibration read: samples a single pixel from
   * correctedTarget (color-corrected, matching what the plateau ramp
   * actually sees — not the raw source, and not whatever's currently on
   * screen, which could be showing a completely different mode's output).
   * Coordinates are native image pixels, top-down (DOM/canvas convention);
   * flipped to OpenGL's bottom-up convention internally. Returns null if
   * no image is loaded yet.
   */
  pickPixel(nativeX: number, nativeY: number): [number, number, number] | null {
    if (!this.correctedTarget || !this.sourceBitmap) return null
    const gl = this.gl
    const { width, height } = this.sourceBitmap
    const x = Math.max(0, Math.min(width - 1, Math.round(nativeX)))
    const y = Math.max(0, Math.min(height - 1, Math.round(nativeY)))
    const glY = height - 1 - y
    const pixel = new Uint8Array(4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.correctedTarget.framebuffer)
    gl.readPixels(x, glY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255]
  }

  /**
   * Path E: vectorize -> offset -> rasterize. Deliberately NOT part of the
   * shader-chain render() every other mode uses — tracing + polygon
   * offsetting (pathE.ts, CPU-side) is multi-second work on a real image,
   * so it's triggered explicitly (LabApp's "Trace" button) rather than on
   * every param change like scheduleRender()'s reactive modes. Returns the
   * contour count so the UI can show the user something concrete happened.
   */
  async runPathE(radius: number, threshold: number): Promise<{ contourCount: number }> {
    const gl = this.gl
    if (!this.sourceTexture || !this.sourceBitmap || !this.normalizedTarget || !this.correctedTarget) {
      throw new Error('No image loaded')
    }
    const { width, height } = this.sourceBitmap
    const detectionSource = this.params.denoiseEnabled
      ? this.runDenoise(this.correctedTarget, width, height)
      : this.correctedTarget

    this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
    this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
      gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), threshold)
      // uInvert is a shared-program uniform (see CLAUDE.md's "Recurring
      // Gotchas") — must be set explicitly every call, never left to
      // whatever a previous mode (e.g. Gumi) last set it to.
      gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), 0)
    })

    // gl.readPixels returns rows bottom-up (OpenGL convention); ImageData
    // expects top-down — same flip src/export/exportPica.ts's toImageData
    // does for the main pipeline's export readback.
    const raw = new Uint8ClampedArray(width * height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskTarget.framebuffer)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw)
    const flipped = new Uint8ClampedArray(raw.length)
    const rowBytes = width * 4
    for (let y = 0; y < height; y++) {
      const srcStart = (height - 1 - y) * rowBytes
      flipped.set(raw.subarray(srcStart, srcStart + rowBytes), y * rowBytes)
    }
    const mask = new ImageData(flipped, width, height)

    const { canvas, contourCount } = runPathEVectorize(mask, radius)
    // flipY here compensates for the same Chrome ImageBitmap-upload anomaly
    // documented for uSource (see shaderUtils.ts/crop.frag.ts): Chrome
    // ignores UNPACK_FLIP_Y_WEBGL on texImage2D(..., bitmap) in
    // uploadBitmapAsTarget, so without this the canvas's top row lands at
    // texel v=0 while every downstream shader samples with plain vUV
    // (v=1 -> top). Pre-flipping the bitmap's pixel data here, rather than
    // patching the shared quad or the composite shaders, keeps the fix local
    // to the one place that introduces it, matching the project's
    // uSource-flip convention.
    const bitmap = await createImageBitmap(canvas, { imageOrientation: 'flipY' })

    if (this.pathEResultTarget) disposeTargetTexture(gl, this.pathEResultTarget)
    this.pathEResultTarget = uploadBitmapAsTarget(gl, bitmap)

    this.scheduleRender()
    return { contourCount }
  }

  private renderScheduled = false

  /**
   * Real illustration files are megapixel-scale and every mode chains
   * several full-res passes (JFA alone is ~11 for a 2048px source) — a raw
   * range-input `input` event fires far faster than that can render, and
   * without coalescing, dragging a slider queues up a backlog of renders
   * and visibly lags. Collapsing to at most one render per animation frame
   * fixes that regardless of which mode is active.
   */
  private scheduleRender(): void {
    if (this.renderScheduled) return
    this.renderScheduled = true
    requestAnimationFrame(() => {
      this.renderScheduled = false
      this.render()
    })
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

  private runPass(
    program: WebGLProgram,
    target: TargetTexture,
    width: number,
    height: number,
    setup: () => void,
  ): void {
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

  /**
   * Edge-aware denoise (see denoise.frag.ts) — an optional extra stage
   * between color-correction and the binary/threshold detection paths,
   * same "feeds detection, not the composited base" placement as
   * colorCorrectProgram. Off by default (denoiseEnabled), since it's a
   * first-pass test of whether the ported Metal kernel is even relevant
   * to this pipeline, not an established stage yet. Takes an explicit
   * source (rather than always reading correctedTarget) so it can chain
   * after the optional plateau-ramp stage too.
   */
  private runDenoise(source: TargetTexture, width: number, height: number): TargetTexture {
    const gl = this.gl
    this.denoisedTarget = this.ensureTarget(this.denoisedTarget, width, height)
    const kernelSize = Math.min(5, Math.max(1, Math.floor(this.params.denoiseIntensity * 5)))
    this.runPass(this.denoiseProgram, this.denoisedTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.denoiseProgram, 'uTexelSize'), [1 / width, 1 / height])
      gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uKernelSize'), kernelSize)
      gl.uniform1f(gl.getUniformLocation(this.denoiseProgram, 'uThreshold'), this.params.denoiseThreshold)
    })
    return this.denoisedTarget
  }

  /**
   * 4-point plateau/feather luminance-band ramp (see plateauRamp.frag.ts).
   * Shared by the optional pre-detection toggle (v1/B/D/F/H/I, gated on
   * params.rampEnabled) and Path G/Gumi's own always-on stage 1 — Gumi's
   * "luminance isolation" *is* this shader, so its own controls are just
   * these same ramp params, no duplicate sliders needed.
   */
  private runPlateauRamp(source: TargetTexture, width: number, height: number): TargetTexture {
    const gl = this.gl
    this.rampTarget = this.ensureTarget(this.rampTarget, width, height)
    this.runPass(this.plateauRampProgram, this.rampTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.plateauRampProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uFloor'), this.params.rampFloor)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uInnerLow'), this.params.rampInnerLow)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uInnerHigh'), this.params.rampInnerHigh)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uCeiling'), this.params.rampCeiling)
      gl.uniform1f(gl.getUniformLocation(this.plateauRampProgram, 'uFeather'), this.params.rampFeather)
    })
    return this.rampTarget
  }

  /**
   * Gumi (Path G)'s JFA distance transform, shared by both its final
   * treatments — hard blob suppression and the color-bleed style each
   * need the *same* propagation machinery Path B/Botan already has, just
   * seeded from a different side of the mask (see distanceSeed.frag.ts's
   * uInvert): blob suppression measures a line pixel's depth from the
   * nearest *background* (invert=true), while the bleed style measures
   * any pixel's distance to the nearest *line* (invert=false, Botan's own
   * convention). Factored out (unlike Path B's own inline copy, left
   * untouched) since Gumi needs this same loop twice as often per mode.
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
  private runToneRemap(source: TargetTexture, target: 'multiply' | 'screen', width: number, height: number): TargetTexture {
    const gl = this.gl
    this.toneRemapTarget = this.ensureTarget(this.toneRemapTarget, width, height)
    this.runPass(this.toneRemapProgram, this.toneRemapTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(gl.getUniformLocation(this.toneRemapProgram, 'uSource'), 0)
      gl.uniform1i(gl.getUniformLocation(this.toneRemapProgram, 'uTarget'), target === 'screen' ? 1 : 0)
      gl.uniform1f(gl.getUniformLocation(this.toneRemapProgram, 'uGain'), this.params.hiToneGain)
      gl.uniform1f(gl.getUniformLocation(this.toneRemapProgram, 'uContrast'), this.params.hiToneContrast)
    })
    return this.toneRemapTarget
  }

  render(): void {
    const gl = this.gl
    if (!this.sourceTexture || !this.sourceBitmap) return
    // Only Gumi's own branch sets this, each render — must reset here so a
    // stale override from a prior Gumi render doesn't leak into some other
    // mode's raw view after switching away from pathG.
    this.gumiRawOverride = null

    const { width, height } = this.sourceBitmap
    const texelSize: [number, number] = [1 / width, 1 / height]
    this.normalizedTarget = this.ensureTarget(this.normalizedTarget, width, height)

    // Normalize: correct the raw-ImageBitmap flip-y anomaly once, so every
    // downstream stage below can sample with plain vUV.
    this.runPass(this.normalizeProgram, this.normalizedTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture!)
      gl.uniform1i(gl.getUniformLocation(this.normalizeProgram, 'uSource'), 0)
      gl.uniform4fv(gl.getUniformLocation(this.normalizeProgram, 'uCropRect'), FULL_RECT)
    })

    // Color-correction stage feeding only the binary/threshold detection
    // paths' input (v1-reference, Path B, Path D, Path F, and Path E's own
    // threshold pass in runPathE below) — see colorCorrect.frag.ts. Path
    // A/C stay on the uncorrected normalizedTarget since their erosion IS
    // the output color, not a separate detectable mask.
    this.correctedTarget = this.ensureTarget(this.correctedTarget, width, height)
    this.runPass(this.colorCorrectProgram, this.correctedTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
      gl.uniform1i(gl.getUniformLocation(this.colorCorrectProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uExposure'), this.params.exposure)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uContrast'), this.params.contrast)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uBlackClip'), this.params.blackClip)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uWhiteClip'), this.params.whiteClip)
    })

    // Optional plateau-ramp (see runPlateauRamp) then optional denoise,
    // chained after color-correction, before detection — see runDenoise's
    // doc comment. detectionSource is what v1/B/D/F/G/H/I's
    // threshold/edge-detection actually reads, replacing the plain
    // this.correctedTarget references those paths used before these
    // stages existed. Path G always runs its own ramp pass separately
    // (see its branch below), independent of rampEnabled.
    const rampedSource = this.params.rampEnabled
      ? this.runPlateauRamp(this.correctedTarget, width, height)
      : this.correctedTarget
    const detectionSource = this.params.denoiseEnabled ? this.runDenoise(rampedSource, width, height) : rampedSource

    let outputTarget = this.normalizedTarget

    if (this.mode === 'v1-reference') {
      this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
      this.growHTarget = this.ensureTarget(this.growHTarget, width, height)
      this.growVTarget = this.ensureTarget(this.growVTarget, width, height)

      this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource!.texture)
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), this.params.threshold)
        // uInvert is a shared-program uniform (see CLAUDE.md's "Recurring
        // Gotchas") — must be set explicitly every call, never left to
        // whatever a previous mode (e.g. Gumi) last set it to.
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), 0)
      })

      const intRadius = Math.round(this.params.radius)
      this.runPass(this.minFilterProgram, this.growHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.maskTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
        gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), intRadius)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [1, 0])
      })
      this.runPass(this.minFilterProgram, this.growVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.growHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
        gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), intRadius)
        gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
      })

      outputTarget = this.growVTarget
    } else if (this.mode === 'pathA') {
      outputTarget = this.runErosion(this.normalizedTarget, this.params.radius, width, height)
    } else if (this.mode === 'pathB') {
      this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
      this.seedTargetA = this.ensureFloatTarget(this.seedTargetA, width, height)
      this.seedTargetB = this.ensureFloatTarget(this.seedTargetB, width, height)
      this.distanceMaskTarget = this.ensureTarget(this.distanceMaskTarget, width, height)

      this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource!.texture)
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), this.params.threshold)
        // uInvert is a shared-program uniform (see CLAUDE.md's "Recurring
        // Gotchas") — must be set explicitly every call, never left to
        // whatever a previous mode (e.g. Gumi) last set it to.
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), 0)
      })

      this.runPass(this.distanceSeedProgram, this.seedTargetA, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.maskTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.distanceSeedProgram, 'uMask'), 0)
      })

      // Jump-flooding: propagate seeds with halving step sizes until every
      // pixel has converged on its true nearest-line-pixel position.
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

      this.runPass(this.distanceToEdgeProgram, this.distanceMaskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, src.texture)
        gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uSeed'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uOriginal'), 1)
        gl.uniform2fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uTexSize'), [width, height])
        gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uRadius'), this.params.radius)
        gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uFeather'), this.params.feather)
        gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uGamma'), this.params.gamma)
        gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorContrast'), this.params.colorContrast)
        gl.uniform1i(
          gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorExpansion'),
          this.params.colorExpansion ? 1 : 0,
        )
      })

      outputTarget = this.distanceMaskTarget
    } else if (this.mode === 'pathC') {
      const eroded = this.runErosion(this.normalizedTarget, this.params.radius, width, height)
      this.gateTarget = this.ensureTarget(this.gateTarget, width, height)
      this.runPass(this.erosionGateProgram, this.gateTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.erosionGateProgram, 'uOriginal'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, eroded.texture)
        gl.uniform1i(gl.getUniformLocation(this.erosionGateProgram, 'uEroded'), 1)
        gl.uniform1f(gl.getUniformLocation(this.erosionGateProgram, 'uGateThreshold'), this.params.gateThreshold)
        gl.uniform1f(gl.getUniformLocation(this.erosionGateProgram, 'uFeather'), this.params.feather)
      })
      outputTarget = this.gateTarget
    } else if (this.mode === 'pathF') {
      // Denoise pre-pass: blur ahead of Sobel so per-pixel JPEG/texture
      // noise doesn't read as spurious colored edges in flat/shaded
      // regions. Only the edge-detection input is blurred (and starts from
      // the color-corrected source, not the raw one) — the multiply base
      // further down stays the sharp, uncorrected normalizedTarget.
      this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
      this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
      this.runPass(this.boxBlurProgram, this.blurHTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource!.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), PATH_F_BLUR_RADIUS)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
      })
      this.runPass(this.boxBlurProgram, this.blurVTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), PATH_F_BLUR_RADIUS)
        gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [0, 1])
      })

      this.edgeMapTarget = this.ensureTarget(this.edgeMapTarget, width, height)
      this.runPass(this.findEdgesProgram, this.edgeMapTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.blurVTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.findEdgesProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.findEdgesProgram, 'uTexelSize'), texelSize)
        gl.uniform1f(gl.getUniformLocation(this.findEdgesProgram, 'uSensitivity'), this.params.sensitivity)
        gl.uniform1f(gl.getUniformLocation(this.findEdgesProgram, 'uGamma'), this.params.gamma)
        gl.uniform1f(gl.getUniformLocation(this.findEdgesProgram, 'uSaturation'), this.params.saturation)
      })
      // Dilate via the same continuous-radius per-channel erosion as Path
      // A/C (erosionRgb), not the int-only grayscale minFilter1D used by
      // v1/Path D — the edge map here is genuinely colored (see
      // findEdges.frag.ts), and minFilter1D's .r-only sampling would have
      // silently flattened it back to grayscale during the grow step. Also
      // gives Path F the same smooth sub-texel radius control as Path A,
      // which the working range (0-3 texels) needs.
      outputTarget = this.runErosion(this.edgeMapTarget, this.params.radius, width, height)

      // Optional tint override (see tintMask.frag.ts) — unlike Path D,
      // gated behind an explicit toggle rather than always-on: Path F's
      // default *is* the colored per-channel Sobel fringing, a
      // meaningfully different look that shouldn't silently disappear.
      // The point of offering it here is to give alpha overdrive (below)
      // something worth compounding — a light/pastel flat tint gets
      // visibly darker/richer through repeated multiply layers in a way
      // Path F's mostly-thin, mostly-binary colored edges don't.
      if (this.params.tintEnabled) {
        this.pathFTintTarget = this.ensureTarget(this.pathFTintTarget, width, height)
        this.runPass(this.tintMaskProgram, this.pathFTintTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture)
          gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uSource'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uOriginal'), 1)
          gl.uniform3fv(gl.getUniformLocation(this.tintMaskProgram, 'uTintColor'), this.params.tintColor)
          gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uVividMode'), this.params.vividMode ? 1 : 0)
          gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uDeadzone'), this.params.vividDeadzone)
          gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uVividBoost'), this.params.vividBoost)
        })
        outputTarget = this.pathFTintTarget
      }
    } else if (this.mode === 'pathD') {
      // Path D: octagon approximation. Chains 4 directional separable
      // min-filter passes (0°, 90°, 45°, 135°) instead of v1's 2 (0°, 90°).
      // Sequential dilation composes as a Minkowski sum of the 4 line
      // segments, which is what actually produces an octagon — but naively
      // reusing the full per-axis radius on all 4 passes overshoots badly:
      // support-function algebra for this exact 4-segment sum gives a
      // reach of R·(1+√2) along the cardinal axes (~2.41R at R=10, not R).
      // Solving for a uniform reach of R in *both* the cardinal and
      // diagonal directions (s + d√2 = R, s√2 + d = R for axis/diagonal
      // half-lengths s, d) yields s = d = R·(√2-1) ≈ 0.414R — i.e. every
      // one of the 4 passes uses that same reduced radius. Reusing
      // threshold.frag.ts and minFilter1D.frag.ts exactly as v1 does, just
      // with more (and correctly-scaled) directions — no new shaders.
      this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
      this.growHTarget = this.ensureTarget(this.growHTarget, width, height)
      this.growVTarget = this.ensureTarget(this.growVTarget, width, height)

      this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource!.texture)
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), this.params.threshold)
        // uInvert is a shared-program uniform (see CLAUDE.md's "Recurring
        // Gotchas") — must be set explicitly every call, never left to
        // whatever a previous mode (e.g. Gumi) last set it to.
        gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), 0)
      })

      const intRadius = Math.max(0, Math.round(this.params.radius * (Math.SQRT2 - 1)))
      const diag = Math.SQRT1_2
      const directions: [number, number][] = [
        [1, 0],
        [0, 1],
        [diag, diag],
        [diag, -diag],
      ]
      const scratch = [this.growHTarget!, this.growVTarget!]
      let src: TargetTexture = this.maskTarget!
      directions.forEach((direction, i) => {
        const dst = scratch[i % 2]
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

      // Recolor the grayscale mask toward a tint color instead of always
      // black — see tintMask.frag.ts. Default tintColor [0,0,0] makes this
      // pass an exact identity on the untinted grayscale mask, so it's
      // always safe to run rather than conditionally skipping it. Vivid
      // mode samples the real per-pixel source color (uOriginal) instead
      // of the flat uTintColor — preserves multiple color clusters from
      // the source rather than flattening to one extracted swatch.
      this.tintTarget = this.ensureTarget(this.tintTarget, width, height)
      this.runPass(this.tintMaskProgram, this.tintTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, src.texture)
        gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uSource'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uOriginal'), 1)
        gl.uniform3fv(gl.getUniformLocation(this.tintMaskProgram, 'uTintColor'), this.params.tintColor)
        gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uVividMode'), this.params.vividMode ? 1 : 0)
        gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uDeadzone'), this.params.vividDeadzone)
        gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uVividBoost'), this.params.vividBoost)
      })

      outputTarget = this.tintTarget
    } else if (this.mode === 'pathE') {
      // Computed entirely outside this render() chain (see runPathE) — CPU
      // vector geometry (trace + offset), not a shader pass. Falls back to
      // the untouched original until the user clicks Trace.
      outputTarget = this.pathEResultTarget ?? this.normalizedTarget
    } else if (this.mode === 'pathG' && this.params.gumiGradientMap) {
      // Crude Gradient Map prototype — see gradientMap.frag.ts. No
      // threshold/closing/blob-or-bleed chain at all, unlike the rest of
      // Path G below: every pixel gets recolored directly off the 3-stop
      // ramp. Output is a resolved full-color image, not a mask, so it's
      // excluded from isMaskMode below and goes through the same
      // crossfade composite Path A/C use.
      this.gradientMapTarget = this.ensureTarget(this.gradientMapTarget, width, height)
      this.runPass(this.gradientMapProgram, this.gradientMapTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
        gl.uniform1i(gl.getUniformLocation(this.gradientMapProgram, 'uSource'), 0)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uShadowColor'), this.params.gumiGradientShadow)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uMidColor'), this.params.gumiGradientMid)
        gl.uniform3fv(gl.getUniformLocation(this.gradientMapProgram, 'uHighlightColor'), this.params.gumiGradientHighlight)
      })
      outputTarget = this.gradientMapTarget
    } else if (this.mode === 'pathG') {
      // Path G (Gumi): luminance-band isolation (the shared plateau ramp,
      // always applied here regardless of rampEnabled — this IS Gumi's
      // "gradient map" stage) -> contrast boost (reuses colorCorrect's
      // pivot-at-0.5 contrast curve as the "histogram push", rather than a
      // dedicated shader) -> threshold into a binary mask, IN THE
      // PROJECT-STANDARD 0=line/1=background POLARITY (uInvert=1 — the
      // ramp's high band-weight means "this IS the selected stroke", the
      // opposite sense threshold.frag.ts's raw luminance comparison
      // assumes) -> closing (minFilter1D's default min mode — under this
      // polarity, growing/dilating the *ink* region means taking the
      // numeric minimum of neighbors, same "grow" v1-reference/Path D
      // already do; NOT the uMode=1/max mode, which would grow the
      // background instead).
      //
      // Then one of two final treatments, picked by gumiColorBleed:
      // - off (default): hard blob suppression (blobMask.frag.ts) —
      //   reject any line-candidate pixel whose distance to the nearest
      //   background exceeds blobMaxDt (deep interior of a large fill).
      // - on: reuse Path B/Botan's own graduated distanceToEdge treatment
      //   on Gumi's closed mask instead of a hard reject — a stylized
      //   "ink bleed" look (soft falloff, optional real-color sampling).
      //   Doesn't fix Gumi's black-line/black-background detection
      //   ambiguity from real-art testing, leans into it as a different
      //   aesthetic instead.
      const gumiRamp = this.runPlateauRamp(detectionSource, width, height)

      this.gumiBoostTarget = this.ensureTarget(this.gumiBoostTarget, width, height)
      this.runPass(this.colorCorrectProgram, this.gumiBoostTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, gumiRamp.texture)
        gl.uniform1i(gl.getUniformLocation(this.colorCorrectProgram, 'uSource'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uExposure'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uContrast'), this.params.gumiContrastBoost)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uBlackClip'), 0)
        gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uWhiteClip'), 1)
      })

      this.gumiMaskTarget = this.ensureTarget(this.gumiMaskTarget, width, height)
      if (this.params.gumiSoftDetection) {
        this.runPass(this.softThresholdProgram, this.gumiMaskTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.gumiBoostTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uThreshold'), this.params.threshold)
          gl.uniform1f(gl.getUniformLocation(this.softThresholdProgram, 'uSoftness'), this.params.gumiSoftness)
          gl.uniform1i(gl.getUniformLocation(this.softThresholdProgram, 'uInvert'), 1)
        })
      } else {
        this.runPass(this.thresholdProgram, this.gumiMaskTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, this.gumiBoostTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), this.params.threshold)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), 1)
        })
      }

      this.gumiMaxHTarget = this.ensureTarget(this.gumiMaxHTarget, width, height)
      this.gumiMaxVTarget = this.ensureTarget(this.gumiMaxVTarget, width, height)
      const gumiRadius = Math.round(this.params.radius)
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

      if (this.params.gumiColorBleed) {
        const gumiSeed = this.runGumiDistanceTransform(this.gumiMaxVTarget, false, width, height)
        this.gumiBleedTarget = this.ensureTarget(this.gumiBleedTarget, width, height)
        this.runPass(this.distanceToEdgeProgram, this.gumiBleedTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, gumiSeed.texture)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uSeed'), 0)
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
          gl.uniform1i(gl.getUniformLocation(this.distanceToEdgeProgram, 'uOriginal'), 1)
          gl.uniform2fv(gl.getUniformLocation(this.distanceToEdgeProgram, 'uTexSize'), [width, height])
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uRadius'), this.params.blobMaxDt)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uFeather'), this.params.gumiBleedFeather)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uGamma'), this.params.gamma)
          gl.uniform1f(gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorContrast'), this.params.colorContrast)
          gl.uniform1i(
            gl.getUniformLocation(this.distanceToEdgeProgram, 'uColorExpansion'),
            this.params.colorExpansion ? 1 : 0,
          )
        })
        outputTarget = this.gumiBleedTarget
      } else {
        const gumiSeed = this.runGumiDistanceTransform(this.gumiMaxVTarget, true, width, height)
        this.gumiBlobTarget = this.ensureTarget(this.gumiBlobTarget, width, height)
        if (this.params.gumiFillMode) {
          this.runPass(this.fillMaskProgram, this.gumiBlobTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, gumiSeed.texture)
            gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uSeed'), 0)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, this.gumiMaxVTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uMask'), 1)
            gl.activeTexture(gl.TEXTURE2)
            gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.fillMaskProgram, 'uOriginal'), 2)
            gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uBlobMaxDt'), this.params.blobMaxDt)
            // uInvert/uPixelThreshold and the fillTypeColor uniforms
            // fillMaskFrag also declares are still unset here (gumiFillMode
            // isn't wired up with lab UI controls for those yet) — a known
            // gap, not an oversight equivalent to uGamma's (see
            // gumiBlobGamma's doc comment).
            gl.uniform1f(gl.getUniformLocation(this.fillMaskProgram, 'uGamma'), this.params.gumiBlobGamma)
          })
        } else {
          this.runPass(this.blobMaskProgram, this.gumiBlobTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, gumiSeed.texture)
            gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uSeed'), 0)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, this.gumiMaxVTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uMask'), 1)
            gl.uniform1f(gl.getUniformLocation(this.blobMaskProgram, 'uBlobMaxDt'), this.params.blobMaxDt)
            gl.uniform1i(gl.getUniformLocation(this.blobMaskProgram, 'uSoftOutput'), this.params.gumiSoftDetection ? 1 : 0)
            gl.uniform1f(gl.getUniformLocation(this.blobMaskProgram, 'uGamma'), this.params.gumiBlobGamma)
          })
          // See rawTarget's doc comment near render()'s tail — the "raw"
          // view should show this grayscale detection mask, not the
          // flat-tinted result the ink-color pass below produces.
          this.gumiRawOverride = this.gumiBlobTarget

          // Ink color resolution — reuses Path D/F's own tintColor/
          // vividMode/vividDeadzone/vividBoost fields rather than adding
          // new ones: vividMode=true samples the real per-pixel source
          // color ("Image"), vividMode=false + tintColor=black/white gives
          // a flat solid-ink look. tintMaskFrag derives its own alpha from
          // uSource's luminance (1.0-m), which for blobMaskTarget's
          // grayscale 0=ink/1=background convention lands on exactly the
          // same alpha blobMaskFrag itself now emits — no mismatch.
          this.gumiInkTarget = this.ensureTarget(this.gumiInkTarget, width, height)
          this.runPass(this.tintMaskProgram, this.gumiInkTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.gumiBlobTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uSource'), 0)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uOriginal'), 1)
            gl.uniform3fv(gl.getUniformLocation(this.tintMaskProgram, 'uTintColor'), this.params.tintColor)
            gl.uniform1i(gl.getUniformLocation(this.tintMaskProgram, 'uVividMode'), this.params.vividMode ? 1 : 0)
            gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uDeadzone'), this.params.vividDeadzone)
            gl.uniform1f(gl.getUniformLocation(this.tintMaskProgram, 'uVividBoost'), this.params.vividBoost)
          })
        }
        // gumiInkTarget stays its own field, never aliased onto
        // gumiBlobTarget — repointing an ensureTarget-managed field to a
        // texture it doesn't own is exactly the bug class CLAUDE.md's
        // "Recurring Gotchas" already warns about: the next render's own
        // `ensureTarget(gumiBlobTarget, ...)` would silently reuse
        // whatever gumiInkTarget last was (same dimensions), and
        // blobMaskProgram would render into it while this same pass reads
        // from it moments earlier in the same frame — a same-texture
        // read/write feedback loop on every render after the first.
        outputTarget = this.params.gumiFillMode ? this.gumiBlobTarget : this.gumiInkTarget!
      }
    } else if (this.mode === 'pathH' && this.params.highPassResponsiveColor) {
      // Dual-polarity line art litmus test (see responsiveEdgeColor.frag.ts):
      // locally-adaptive ink color instead of one fixed polarity. Reuses
      // the same box-blur pass Path H's normal chain computes anyway (the
      // blurred local-neighborhood average IS the "rough area check" —
      // no separate local-analysis pass needed). Bypasses the shared
      // hiToneTarget/thresholdEnabled output-treatment entirely below —
      // this shader already emits a fully-resolved colored ink mask
      // (rgb=ink, alpha=strength), not a grayscale one those treatments
      // expect.
      this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
      this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
      const blurRadius = this.params.radius
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
        gl.uniform1f(gl.getUniformLocation(this.responsiveEdgeColorProgram, 'uStrength'), this.params.highPassStrength)
        gl.uniform1f(gl.getUniformLocation(this.responsiveEdgeColorProgram, 'uCrossover'), this.params.responsiveCrossover)
      })

      // Optional grow: the zero-crossing fix makes lines ~1px by
      // construction, so thickness needs its own step (see
      // inkColorMask.frag.ts/inkColorRecombine.frag.ts's doc comments for
      // why this splits into two independently-grown color masks instead
      // of dilating the RGBA ink texture directly).
      if (this.params.responsiveGrow > 0) {
        const growRadius = Math.round(this.params.responsiveGrow)

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
          gl.uniform1f(gl.getUniformLocation(this.inkColorRecombineProgram, 'uBias'), this.params.responsiveGrowBias)
        })
      }

      outputTarget = this.responsiveColorTarget
    } else if (this.mode === 'pathH' || this.mode === 'pathI') {
      let hiRaw: TargetTexture
      if (this.mode === 'pathH') {
        // Path H (High Pass): separable box-blur (reusing boxBlur.frag.ts,
        // an approximation of a true Gaussian — acceptable for lab
        // comparative testing, see docs/oshipfp-lineart-lab-unified-spec.md)
        // then source-minus-blurred (highPassDiff.frag.ts).
        this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
        this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
        const blurRadius = this.params.radius
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
          gl.uniform1f(gl.getUniformLocation(this.highPassDiffProgram, 'uStrength'), this.params.highPassStrength)
        })
        hiRaw = this.highPassTarget
      } else {
        // Path I (Laplacian): optional pre-blur (denoise, reusing
        // boxBlur.frag.ts — same recipe Path F uses ahead of its Sobel,
        // user-tunable here instead of a fixed constant) feeds the
        // single-pass 3x3 second-order kernel (laplacian.frag.ts), which
        // can then optionally be re-sharpened (unsharpMask.frag.ts,
        // reused from the Crop tab) to claw back edge definition the
        // pre-blur softened. Both added after real-art testing showed
        // raw Laplacian is too grain-sensitive to use as-is — matches
        // Hypothesis B from the unified spec, predicted before this was
        // ever built ("will over-amplify noise on JPG input").
        let laplacianSource = detectionSource
        if (this.params.laplacianPreBlur > 0) {
          this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
          this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
          this.runPass(this.boxBlurProgram, this.blurHTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
            gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
            gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), this.params.laplacianPreBlur)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
          })
          this.runPass(this.boxBlurProgram, this.blurVTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
            gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), this.params.laplacianPreBlur)
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
          gl.uniform1f(gl.getUniformLocation(this.laplacianProgram, 'uStrength'), this.params.laplacianStrength)
        })

        if (this.params.laplacianSharpenAmount > 0) {
          this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
          this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
          this.runPass(this.boxBlurProgram, this.blurHTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.laplacianTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
            gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), LAPLACIAN_SHARPEN_BLUR_RADIUS)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uDirection'), [1, 0])
          })
          this.runPass(this.boxBlurProgram, this.blurVTarget, width, height, () => {
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.blurHTarget!.texture)
            gl.uniform1i(gl.getUniformLocation(this.boxBlurProgram, 'uSource'), 0)
            gl.uniform2fv(gl.getUniformLocation(this.boxBlurProgram, 'uTexelSize'), texelSize)
            gl.uniform1f(gl.getUniformLocation(this.boxBlurProgram, 'uRadius'), LAPLACIAN_SHARPEN_BLUR_RADIUS)
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
            gl.uniform1f(gl.getUniformLocation(this.unsharpMaskProgram, 'uAmount'), this.params.laplacianSharpenAmount)
          })
          hiRaw = this.laplacianSharpenTarget
        } else {
          hiRaw = this.laplacianTarget
        }

        // Optional post-kernel grow (minFilter1D's default min mode) —
        // Laplacian alone has no way to thicken a line, only intensify or
        // dissolve it (real-art testing found grittiness works in its
        // favor, but there was no path to a thicker line, only a grittier
        // one). Same separable min-filter grow v1-reference/Path D use;
        // note this only thickens the *dark* side of each edge response
        // (min picks the darkest neighbor), matching the "black ink
        // grows" convention every other path in this codebase already
        // uses — Laplacian's symmetric bright-side response isn't grown.
        if (this.params.laplacianGrow > 0) {
          this.blurHTarget = this.ensureTarget(this.blurHTarget, width, height)
          this.blurVTarget = this.ensureTarget(this.blurVTarget, width, height)
          const growRadius = Math.round(this.params.laplacianGrow)
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

      // Output treatment, shared by H/I: tone-remap (toneRemap.frag.ts)
      // takes priority when active — see toneRemapFrag's doc comment for
      // why raw neutral-gray output needs this before most blend modes
      // make sense of it. Falls back to the plain hard-threshold
      // binarize, then to the untouched raw diff (crossfade-composited,
      // not multiply — see isMaskMode below).
      //
      // Binarize's uInvert mirrors toneRemap's uTarget concept: threshold.
      // frag.ts's default (uInvert=0) polarity — 0=ink/1=background — is
      // Multiply's identity convention. Screen's identity is the opposite
      // (0=no-op, 1=full-effect), so binarizing while Screen is the
      // selected blend mode needs the polarity flipped, or the *majority*
      // of the image (the untriggered background) ends up as the thing
      // Screen boosts to white instead of the detected edges — this was
      // real-art-tested and reported as "tricky to handle." Overlay's
      // identity (0.5) doesn't map cleanly onto a binary 0/1 output
      // either way, so it just keeps Multiply's polarity rather than
      // adding a third, not-actually-identity-preserving case.
      if (this.params.hiToneTarget !== 'off') {
        outputTarget = this.runToneRemap(hiRaw, this.params.hiToneTarget, width, height)
      } else if (this.params.thresholdEnabled) {
        this.hiThreshTarget = this.ensureTarget(this.hiThreshTarget, width, height)
        this.runPass(this.thresholdProgram, this.hiThreshTarget, width, height, () => {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, hiRaw.texture)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
          gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), this.params.threshold)
          gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uInvert'), this.params.compositeBlendMode === 2 ? 1 : 0)
        })
        outputTarget = this.hiThreshTarget
      } else {
        outputTarget = hiRaw
      }
    }

    // Captured before compositing: the algorithm's direct output (mask or
    // resolved color, depending on mode), for the "raw" view-mode toggle —
    // lets the user see exactly what each stage of the chain is producing
    // before the multiply/crossfade composite is applied on top.
    //
    // gumiRawOverride exists because Gumi's own outputTarget (like Path
    // D/F) is the *tinted* ink-color result by the time this line runs —
    // tintMaskFrag's RGB is a flat, unconditional tint color regardless of
    // ink-vs-background, varying only by alpha. Since blitFrag forces
    // alpha to 1.0 for on-screen display, the "raw" view for any tinted
    // mode would otherwise blit as a flat solid color, losing all the
    // actual detection-mask structure the raw toggle exists to show.
    // Overriding with the pre-tint grayscale mask restores that for Gumi;
    // Path D/F have the same underlying limitation, unaddressed here.
    const rawTarget = this.gumiRawOverride ?? outputTarget

    // Path B in color-expansion mode and Path G's gradient-map prototype
    // both output a resolved replacement color image (not a mask), so
    // they need the crossfade path below instead. Path H/I are always
    // mask-mode, even at the untreated "Raw" output treatment —
    // composite.frag.ts's uBlendMode selector (Multiply/Screen/Overlay)
    // only has anything to act on if the output actually goes through
    // composite.frag.ts. Raw's neutral-gray-centered output is
    // specifically meant to be a cheap Overlay input (its identity
    // element is 0.5, which is where flat regions already sit — see
    // toneRemap.frag.ts's doc comment) — routing it through the plain
    // crossfade instead would silently make the blend-mode selector a
    // no-op for exactly the case it was added to test.
    const isMaskMode =
      (MASK_MODES.has(this.mode) || this.mode === 'pathH' || this.mode === 'pathI') &&
      !(this.mode === 'pathB' && this.params.colorExpansion) &&
      !(this.mode === 'pathG' && this.params.gumiGradientMap)

    if (isMaskMode) {
      // True multiply composite (composite.frag.ts's exact blend math,
      // blendMode=1/multiply) — the mask darkens the real base colors
      // instead of crossfading to flat gray, so mask-style candidates
      // preview as they'd actually look as darkened linework.
      //
      // "Alpha overdrive" (params.opacity 0-3, mapped to 3 descending
      // per-layer opacities — [0,1] is layer 1's, [1,2] layer 2's, [2,3]
      // layer 3's) is Path-F-only: it was tried on Path B first and
      // reverted (solid binary blobs have nothing for fractional
      // inter-layer opacity to express), then re-tried here because
      // findEdges.frag.ts's antialiased Sobel edges DO have genuine
      // soft/graduated alpha along every line — see
      // changelog/oshipfp-v0.2-lineart-saga.md. Every other mask mode
      // keeps the plain single-layer 0-1 behavior.
      const isAlphaOverdrive = this.mode === 'pathF'
      const layerCount = isAlphaOverdrive ? ALPHA_OVERDRIVE_LAYERS : 1
      const opacities = new Float32Array(4)
      if (isAlphaOverdrive) {
        for (let i = 0; i < ALPHA_OVERDRIVE_LAYERS; i++) {
          opacities[i] = Math.min(Math.max(this.params.opacity - i, 0), 1)
        }
      } else {
        opacities[0] = this.params.opacity
      }

      this.blendTarget = this.ensureTarget(this.blendTarget, width, height)
      this.runPass(this.compositeProgram, this.blendTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBase'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture)
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uMask'), 1)
        gl.uniform1fv(gl.getUniformLocation(this.compositeProgram, 'uOpacities'), opacities)
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBlendMode'), this.params.compositeBlendMode)
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uLayerCount'), layerCount)
      })
      outputTarget = this.blendTarget
    } else if (this.mode !== 'original') {
      this.blendTarget = this.ensureTarget(this.blendTarget, width, height)
      this.runPass(this.mixBlendProgram, this.blendTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
        gl.uniform1i(gl.getUniformLocation(this.mixBlendProgram, 'uBase'), 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture)
        gl.uniform1i(gl.getUniformLocation(this.mixBlendProgram, 'uOverlay'), 1)
        // Crossfade path has no layer-stacking concept — alpha overdrive's
        // 0-3 range only applies to Path F's multiply composite above, so
        // clamp back to the plain 0-1 a single crossfade can use.
        gl.uniform1f(gl.getUniformLocation(this.mixBlendProgram, 'uOpacity'), Math.min(this.params.opacity, 1))
      })
      outputTarget = this.blendTarget
    }

    if (this.splitMode) {
      // Side-by-side compare: left = Original, right = Composited, both
      // already computed above regardless of viewMode — just two blits
      // into two halves of a double-wide canvas instead of one.
      const splitWidth = width * 2
      if (this.canvas.width !== splitWidth || this.canvas.height !== height) {
        this.canvas.width = splitWidth
        this.canvas.height = height
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(this.blitProgram)
      bindFullscreenQuadAttribs(gl, this.blitProgram, this.quadBuffer)
      gl.uniform1i(gl.getUniformLocation(this.blitProgram, 'uSource'), 0)

      gl.viewport(0, 0, width, height)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.normalizedTarget!.texture)
      drawFullscreenQuad(gl)

      gl.viewport(width, 0, width, height)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture)
      drawFullscreenQuad(gl)
      return
    }

    const displayTarget =
      this.viewMode === 'original' ? this.normalizedTarget : this.viewMode === 'raw' ? rawTarget : outputTarget

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.blitProgram)
    bindFullscreenQuadAttribs(gl, this.blitProgram, this.quadBuffer)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, displayTarget.texture)
    gl.uniform1i(gl.getUniformLocation(this.blitProgram, 'uSource'), 0)
    drawFullscreenQuad(gl)
  }

  destroy(): void {
    this.disposeContextHandlers()
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture)
    if (this.sourceBitmap) this.sourceBitmap.close()
    for (const target of [
      this.normalizedTarget,
      this.correctedTarget,
      this.denoisedTarget,
      this.maskTarget,
      this.growHTarget,
      this.growVTarget,
      this.erodeHTarget,
      this.erodeVTarget,
      this.gateTarget,
      this.seedTargetA,
      this.seedTargetB,
      this.distanceMaskTarget,
      this.edgeMapTarget,
      this.blurHTarget,
      this.blurVTarget,
      this.blendTarget,
      this.pathEResultTarget,
      this.tintTarget,
      this.pathFTintTarget,
      this.rampTarget,
      this.gumiBoostTarget,
      this.gumiMaskTarget,
      this.gumiMaxHTarget,
      this.gumiMaxVTarget,
      this.gumiSeedTargetA,
      this.gumiSeedTargetB,
      this.gumiBlobTarget,
      this.gumiInkTarget,
      this.gumiBleedTarget,
      this.highPassTarget,
      this.laplacianTarget,
      this.laplacianSharpenTarget,
      this.hiThreshTarget,
      this.toneRemapTarget,
      this.responsiveColorTarget,
      this.responsiveWhiteExtractTarget,
      this.responsiveBlackExtractTarget,
      this.responsiveGrowWhiteTarget,
      this.responsiveGrowBlackTarget,
      this.gradientMapTarget,
    ]) {
      if (target) disposeTargetTexture(this.gl, target)
    }
    this.gl.deleteProgram(this.normalizeProgram)
    this.gl.deleteProgram(this.colorCorrectProgram)
    this.gl.deleteProgram(this.denoiseProgram)
    this.gl.deleteProgram(this.thresholdProgram)
    this.gl.deleteProgram(this.minFilterProgram)
    this.gl.deleteProgram(this.erosionProgram)
    this.gl.deleteProgram(this.erosionGateProgram)
    this.gl.deleteProgram(this.distanceSeedProgram)
    this.gl.deleteProgram(this.jfaStepProgram)
    this.gl.deleteProgram(this.distanceToEdgeProgram)
    this.gl.deleteProgram(this.findEdgesProgram)
    this.gl.deleteProgram(this.boxBlurProgram)
    this.gl.deleteProgram(this.mixBlendProgram)
    this.gl.deleteProgram(this.compositeProgram)
    this.gl.deleteProgram(this.tintMaskProgram)
    this.gl.deleteProgram(this.blitProgram)
    this.gl.deleteProgram(this.plateauRampProgram)
    this.gl.deleteProgram(this.blobMaskProgram)
    this.gl.deleteProgram(this.highPassDiffProgram)
    this.gl.deleteProgram(this.laplacianProgram)
    this.gl.deleteProgram(this.toneRemapProgram)
    this.gl.deleteProgram(this.unsharpMaskProgram)
    this.gl.deleteProgram(this.responsiveEdgeColorProgram)
    this.gl.deleteProgram(this.inkColorMaskProgram)
    this.gl.deleteProgram(this.inkColorRecombineProgram)
    this.gl.deleteProgram(this.gradientMapProgram)
    this.gl.deleteProgram(this.softThresholdProgram)
    this.gl.deleteProgram(this.fillMaskProgram)
    this.gl.deleteBuffer(this.quadBuffer)
  }
}
