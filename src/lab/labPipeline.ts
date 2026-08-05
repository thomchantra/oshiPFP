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
import { createSourceTexture } from '../gl/texture'
import { loadSourceBitmap } from '../imageLoad'
import { runPathEVectorize } from './pathE'

export type LabMode = 'original' | 'v1-reference' | 'pathA' | 'pathB' | 'pathC' | 'pathF' | 'pathD' | 'pathE'

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
}

/** Fixed denoise-blur radius (texels) applied ahead of Path F's Sobel edge
 * detection — see boxBlur.frag.ts. Not user-tunable yet; a small always-on
 * amount to suppress JPEG/texture noise reads as false edges. */
const PATH_F_BLUR_RADIUS = 1.2

const FULL_RECT: [number, number, number, number] = [0, 0, 1, 1]

/**
 * Modes that produce a grayscale grow/edge *mask* (0=line/black,
 * 1=fill/white), composited onto the base via a true multiply blend —
 * reusing composite.frag.ts's exact blend math, the same formula the real
 * product's Maximizer stage uses — so mask-style candidates are judged by
 * how they'd actually look as darkened linework over real art, not a flat
 * gray crossfade. Path A/C instead output a complete replacement color
 * image (not a separate mask layer), so they keep a linear original<->
 * result crossfade — multiplying two full color images together isn't the
 * right operation for those. Per user direction, only multiply (darken
 * black outlines) is wired up for now; screen (lighten white outlines,
 * blend mode 2 in composite.frag.ts) is deferred until product needs it.
 */
const MASK_MODES = new Set<LabMode>(['v1-reference', 'pathB', 'pathF', 'pathD', 'pathE'])

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
  }

  private viewMode: ViewMode = 'composited'

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
    const detectionSource = this.params.denoiseEnabled ? this.runDenoise(width, height) : this.correctedTarget

    this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
    this.runPass(this.thresholdProgram, this.maskTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, detectionSource.texture)
      gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), threshold)
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
   * to this pipeline, not an established stage yet.
   */
  private runDenoise(width: number, height: number): TargetTexture {
    const gl = this.gl
    this.denoisedTarget = this.ensureTarget(this.denoisedTarget, width, height)
    const kernelSize = Math.min(5, Math.max(1, Math.floor(this.params.denoiseIntensity * 5)))
    this.runPass(this.denoiseProgram, this.denoisedTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.correctedTarget!.texture)
      gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uSource'), 0)
      gl.uniform2fv(gl.getUniformLocation(this.denoiseProgram, 'uTexelSize'), [1 / width, 1 / height])
      gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uKernelSize'), kernelSize)
      gl.uniform1f(gl.getUniformLocation(this.denoiseProgram, 'uThreshold'), this.params.denoiseThreshold)
    })
    return this.denoisedTarget
  }

  render(): void {
    const gl = this.gl
    if (!this.sourceTexture || !this.sourceBitmap) return

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

    // Optional denoise, chained after color-correction, before detection —
    // see runDenoise's doc comment. detectionSource is what v1/B/D/F/E's
    // threshold/edge-detection actually reads, replacing the plain
    // this.correctedTarget references those paths used before this stage
    // existed.
    const detectionSource = this.params.denoiseEnabled ? this.runDenoise(width, height) : this.correctedTarget

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
    }

    // Captured before compositing: the algorithm's direct output (mask or
    // resolved color, depending on mode), for the "raw" view-mode toggle —
    // lets the user see exactly what each stage of the chain is producing
    // before the multiply/crossfade composite is applied on top.
    const rawTarget = outputTarget

    // Path B in color-expansion mode outputs a resolved replacement color
    // image (not a mask), so it needs the crossfade path below instead.
    const isMaskMode = MASK_MODES.has(this.mode) && !(this.mode === 'pathB' && this.params.colorExpansion)

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
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBlendMode'), 1)
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
    this.gl.deleteBuffer(this.quadBuffer)
  }
}
