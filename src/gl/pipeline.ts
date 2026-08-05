import { createGLContext, wireContextLossHandlers } from './glContext'
import { createProgram, createFullscreenQuad, bindFullscreenQuadAttribs, drawFullscreenQuad } from './shaderUtils'
import { createTargetTexture, createFloatTargetTexture, disposeTargetTexture, type TargetTexture } from './framebufferPool'
import { passthroughVert } from './shaders/passthrough.vert'
import { cropFrag } from './shaders/crop.frag'
import { curvesHslFrag } from './shaders/curvesHsl.frag'
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
import { alphaOverWhiteFrag } from './shaders/alphaOverWhite.frag'
import { compositeFrag } from './shaders/composite.frag'
import { tintMaskFrag } from './shaders/tintMask.frag'
import { blitFrag } from './shaders/blit.frag'
import { createSourceTexture, createLutTexture, updateLutTexture } from './texture'
import { loadSourceBitmap } from '../imageLoad'
import { identityLutBuffer } from '../curve/spline'
import type { EnhanceParams, HslParams, LineArtParams } from '../types'

export type CropRect = [number, number, number, number]

const IDENTITY_HSL: HslParams = { hue: 0, saturation: 0, lightness: 0 }
const IDENTITY_ENHANCE: EnhanceParams = { smooth: 0, sharpen: 0 }

const IDENTITY_LINE_ART: LineArtParams = {
  mode: 'pathB',
  displayMode: 'composite',
  toneShapingEnabled: false,
  toneShaping: { exposure: 0, contrast: 0, blackClip: 0, whiteClip: 1 },
  denoiseEnabled: false,
  denoise: { intensity: 0, threshold: 0 },
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
}

/** Piecewise-linear "hardness" macro shared by Botan/Chie: -1 -> 200% of base max feather, 0 -> 50%, 1 -> hard clip (0). See changelog/oshipfp-v0.2-lineart-saga.md session 7. */
const HARDNESS_BASE_MAX_FEATHER: Partial<Record<LineArtParams['mode'], number>> = { pathB: 5, pathC: 1 }
function hardnessToFeather(hardness: number, base: number): number {
  return hardness <= 0 ? base * (2 - 1.5 * (hardness + 1)) : base * 0.5 * (1 - hardness)
}

/** uBlendMode ints for composite.frag.ts's blendLayer. */
const BLEND_MODE_INT: Record<LineArtParams['blendMode'], number> = { multiply: 1, screen: 2, overlay: 3 }

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
  private alphaOverWhiteProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private tintMaskProgram: WebGLProgram
  private colorProgram: WebGLProgram
  private blitProgram: WebGLProgram
  private quadBuffer: WebGLBuffer
  private lutTexture: WebGLTexture

  private sourceTexture: WebGLTexture | null = null
  private sourceBitmap: ImageBitmap | null = null
  private cropTarget: TargetTexture | null = null
  private smoothTarget: TargetTexture | null = null
  private sharpenBlurHTarget: TargetTexture | null = null
  private sharpenBlurVTarget: TargetTexture | null = null
  private sharpenTarget: TargetTexture | null = null
  private enhanceTarget: TargetTexture | null = null
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
  private tintTarget: TargetTexture | null = null
  private lineArtBlendTarget: TargetTexture | null = null
  private lineArtOverlayPreviewTarget: TargetTexture | null = null
  private lineArtOutputTarget: TargetTexture | null = null
  private colorTarget: TargetTexture | null = null

  private cropDirty = true
  private enhanceDirty = true
  private lineArtDirty = true
  private colorDirty = true
  /** See setLineArtActive — true by default so the very first render (before App.tsx's tab-driven call lands) still shows Botan. */
  private lineArtActive = true
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

  private cropRect: CropRect = [0, 0, 1, 1]
  private hsl: HslParams = IDENTITY_HSL
  private lineArt: LineArtParams = IDENTITY_LINE_ART
  private enhance: EnhanceParams = IDENTITY_ENHANCE

  private disposeContextHandlers: () => void

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
    this.alphaOverWhiteProgram = createProgram(this.gl, passthroughVert, alphaOverWhiteFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.tintMaskProgram = createProgram(this.gl, passthroughVert, tintMaskFrag)
    this.colorProgram = createProgram(this.gl, passthroughVert, curvesHslFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    this.lutTexture = createLutTexture(this.gl, identityLutBuffer(), 3)
    this.disposeContextHandlers = wireContextLossHandlers(
      canvas,
      () => this.handleContextLost(),
      () => this.handleContextRestored(),
    )
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
      'cropTarget', 'smoothTarget', 'sharpenBlurHTarget', 'sharpenBlurVTarget', 'sharpenTarget', 'enhanceTarget',
      'correctedTarget', 'denoisedTarget', 'maskTarget', 'growHTarget', 'growVTarget',
      'erodeHTarget', 'erodeVTarget', 'gateTarget', 'seedTargetA', 'seedTargetB', 'distanceMaskTarget',
      'edgeMapTarget', 'blurHTarget', 'blurVTarget', 'tintTarget', 'lineArtBlendTarget',
      'lineArtOverlayPreviewTarget', 'lineArtOutputTarget', 'colorTarget',
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
    this.alphaOverWhiteProgram = createProgram(this.gl, passthroughVert, alphaOverWhiteFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.tintMaskProgram = createProgram(this.gl, passthroughVert, tintMaskFrag)
    this.colorProgram = createProgram(this.gl, passthroughVert, curvesHslFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    this.lutTexture = createLutTexture(this.gl, identityLutBuffer(), 3)
    if (this.sourceBitmap) {
      this.sourceTexture = createSourceTexture(this.gl, this.sourceBitmap)
    }
    this.cropDirty = true
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

  setHsl(hsl: HslParams): void {
    this.hsl = hsl
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
      params.toneShapingEnabled !== prev.toneShapingEnabled ||
      params.denoiseEnabled !== prev.denoiseEnabled ||
      (params.toneShapingEnabled &&
        (params.toneShaping.exposure !== prev.toneShaping.exposure ||
          params.toneShaping.contrast !== prev.toneShaping.contrast ||
          params.toneShaping.blackClip !== prev.toneShaping.blackClip ||
          params.toneShaping.whiteClip !== prev.toneShaping.whiteClip)) ||
      (params.denoiseEnabled &&
        (params.denoise.intensity !== prev.denoise.intensity || params.denoise.threshold !== prev.denoise.threshold))
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
   */
  private runEnhance(source: TargetTexture, width: number, height: number): TargetTexture {
    const gl = this.gl
    const texelSize: [number, number] = [1 / width, 1 / height]
    let current = source

    if (this.enhance.smooth > 0) {
      this.smoothTarget = this.ensureTarget(this.smoothTarget, width, height)
      const kernelSize = Math.min(5, Math.max(1, Math.round(this.enhance.smooth * 5)))
      this.runPass(this.denoiseProgram, this.smoothTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, current.texture)
        gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uSource'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.denoiseProgram, 'uTexelSize'), texelSize)
        gl.uniform1i(gl.getUniformLocation(this.denoiseProgram, 'uKernelSize'), kernelSize)
        gl.uniform1f(gl.getUniformLocation(this.denoiseProgram, 'uThreshold'), 0.15)
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

  /** Runs the full Botan/Chie/Daiya/Fumiko chain — see labPipeline.ts's render() for the per-algorithm rationale this ports verbatim. */
  private renderLineArt(base: TargetTexture, width: number, height: number): TargetTexture {
    const gl = this.gl
    const p = this.lineArt
    const texelSize: [number, number] = [1 / width, 1 / height]

    this.correctedTarget = this.ensureTarget(this.correctedTarget, width, height)
    const ts = p.toneShapingEnabled ? p.toneShaping : { exposure: 0, contrast: 0, blackClip: 0, whiteClip: 1 }
    this.runPass(this.colorCorrectProgram, this.correctedTarget, width, height, () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, base.texture)
      gl.uniform1i(gl.getUniformLocation(this.colorCorrectProgram, 'uSource'), 0)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uExposure'), ts.exposure)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uContrast'), Math.min(3, Math.max(0.2, 1 + ts.contrast)))
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uBlackClip'), ts.blackClip)
      gl.uniform1f(gl.getUniformLocation(this.colorCorrectProgram, 'uWhiteClip'), ts.whiteClip)
    })

    const detectionSource = p.denoiseEnabled ? this.runDenoise(this.correctedTarget, width, height) : this.correctedTarget

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
        gl.uniform1f(gl.getUniformLocation(this.findEdgesProgram, 'uSaturation'), p.saturation)
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
    }

    const rawTarget = outputTarget

    if (p.displayMode === 'original') return base
    if (p.displayMode === 'overlay') {
      // rawTarget carries straight (non-premultiplied) alpha now — flatten
      // it onto plain white for this raw preview instead of blitting the
      // partial alpha straight to the (alpha-enabled) canvas, which would
      // let the page background show through.
      this.lineArtOverlayPreviewTarget = this.ensureTarget(this.lineArtOverlayPreviewTarget, width, height)
      this.runPass(this.alphaOverWhiteProgram, this.lineArtOverlayPreviewTarget, width, height, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, rawTarget.texture)
        gl.uniform1i(gl.getUniformLocation(this.alphaOverWhiteProgram, 'uSource'), 0)
      })
      return this.lineArtOverlayPreviewTarget
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
    this.lineArtBlendTarget = this.ensureTarget(this.lineArtBlendTarget, width, height)
    this.runPass(this.compositeProgram, this.lineArtBlendTarget, width, height, () => {
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
    return this.lineArtBlendTarget
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
      this.enhanceDirty = true
      this.botanSeedDirty = true
    }
    if (!this.cropTarget) return

    if (this.enhanceDirty) {
      const { width, height } = this.cropTarget
      this.enhanceTarget = this.runEnhance(this.cropTarget, width, height)
      this.enhanceDirty = false
      this.lineArtDirty = true
    }
    if (!this.enhanceTarget) return

    if (this.lineArtDirty) {
      if (this.lineArtActive) {
        const { width, height } = this.enhanceTarget
        this.lineArtOutputTarget = this.renderLineArt(this.enhanceTarget, width, height)
        this.lineArtDirty = false
      } else {
        // Frozen: cheap passthrough to the live (auto-updating) enhanceTarget
        // reference instead of the expensive algorithm chain. lineArtDirty is
        // deliberately left true so reactivating forces one fresh recompute.
        this.lineArtOutputTarget = this.enhanceTarget
      }
      this.colorDirty = true
    }
    if (!this.lineArtOutputTarget) return

    if (this.colorDirty) {
      const { width, height } = this.lineArtOutputTarget
      this.colorTarget = this.ensureTarget(this.colorTarget, width, height)

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorTarget.framebuffer)
      gl.viewport(0, 0, width, height)
      gl.useProgram(this.colorProgram)
      bindFullscreenQuadAttribs(gl, this.colorProgram, this.quadBuffer)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.lineArtOutputTarget.texture)
      gl.uniform1i(gl.getUniformLocation(this.colorProgram, 'uSource'), 0)

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.lutTexture)
      gl.uniform1i(gl.getUniformLocation(this.colorProgram, 'uLut'), 1)

      gl.uniform1f(gl.getUniformLocation(this.colorProgram, 'uHue'), this.hsl.hue)
      gl.uniform1f(gl.getUniformLocation(this.colorProgram, 'uSaturation'), this.hsl.saturation)
      gl.uniform1f(gl.getUniformLocation(this.colorProgram, 'uLightness'), this.hsl.lightness)
      drawFullscreenQuad(gl)

      this.colorDirty = false
    }
    if (!this.colorTarget) return

    // Present: cheap blit of the native-res result onto the on-screen
    // canvas at display resolution — Export uses the full-res colorTarget
    // directly, not this downsampled view (see readFinalPixels).
    const dpr = window.devicePixelRatio || 1
    const displayWidth = Math.round(this.canvas.clientWidth * dpr)
    const displayHeight = Math.round(this.canvas.clientHeight * dpr)
    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth
      this.canvas.height = displayHeight
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.blitProgram)
    bindFullscreenQuadAttribs(gl, this.blitProgram, this.quadBuffer)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.colorTarget.texture)
    gl.uniform1i(gl.getUniformLocation(this.blitProgram, 'uSource'), 0)
    drawFullscreenQuad(gl)
  }

  /**
   * Reads back the full native-resolution pipeline output for Export.
   * Only called on the Export button click, never per-frame — readPixels
   * is a GPU-CPU sync stall. Returns raw bottom-up (OpenGL row order)
   * RGBA bytes; the caller flips rows when building an ImageData.
   */
  readFinalPixels(): { data: Uint8ClampedArray; width: number; height: number } | null {
    // Setters now go through scheduleRender (rAF-coalesced) rather than
    // rendering synchronously — force one final synchronous pass here so a
    // pending-but-not-yet-fired frame can never leak a stale readback.
    this.render()
    if (!this.colorTarget) return null
    const gl = this.gl
    const { width, height, framebuffer } = this.colorTarget
    const buffer = new Uint8ClampedArray(width * height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer)
    return { data: buffer, width, height }
  }

  destroy(): void {
    this.disposeContextHandlers()
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture)
    if (this.sourceBitmap) this.sourceBitmap.close()
    for (const target of [
      this.cropTarget, this.smoothTarget, this.sharpenBlurHTarget, this.sharpenBlurVTarget, this.sharpenTarget,
      this.enhanceTarget, this.correctedTarget, this.denoisedTarget, this.maskTarget, this.growHTarget,
      this.growVTarget, this.erodeHTarget, this.erodeVTarget, this.gateTarget, this.seedTargetA,
      this.seedTargetB, this.distanceMaskTarget, this.edgeMapTarget, this.blurHTarget, this.blurVTarget,
      this.tintTarget, this.lineArtBlendTarget, this.lineArtOverlayPreviewTarget, this.colorTarget,
    ]) {
      if (target) disposeTargetTexture(this.gl, target)
    }
    this.gl.deleteTexture(this.lutTexture)
    for (const program of [
      this.cropProgram, this.colorCorrectProgram, this.denoiseProgram, this.thresholdProgram,
      this.minFilterProgram, this.erosionProgram, this.erosionGateProgram, this.distanceSeedProgram,
      this.jfaStepProgram, this.distanceToEdgeProgram, this.findEdgesProgram, this.boxBlurProgram,
      this.unsharpMaskProgram, this.alphaOverWhiteProgram, this.compositeProgram, this.tintMaskProgram,
      this.colorProgram, this.blitProgram,
    ]) {
      this.gl.deleteProgram(program)
    }
    this.gl.deleteBuffer(this.quadBuffer)
  }
}
