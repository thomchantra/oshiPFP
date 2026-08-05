import { createGLContext, wireContextLossHandlers } from './glContext'
import { createProgram, createFullscreenQuad, bindFullscreenQuadAttribs, drawFullscreenQuad } from './shaderUtils'
import { createTargetTexture, disposeTargetTexture, type TargetTexture } from './framebufferPool'
import { passthroughVert } from './shaders/passthrough.vert'
import { cropFrag } from './shaders/crop.frag'
import { curvesHslFrag } from './shaders/curvesHsl.frag'
import { thresholdFrag } from './shaders/threshold.frag'
import { minFilter1DFrag } from './shaders/minFilter1D.frag'
import { compositeFrag } from './shaders/composite.frag'
import { blitFrag } from './shaders/blit.frag'
import { createSourceTexture, createLutTexture, updateLutTexture } from './texture'
import { loadSourceBitmap } from '../imageLoad'
import { identityLutBuffer } from '../curve/spline'
import type { BlendMode, HslParams, MaximizerParams } from '../types'

export type CropRect = [number, number, number, number]

const IDENTITY_HSL: HslParams = { hue: 0, saturation: 0, lightness: 0 }
const IDENTITY_MAXIMIZER: MaximizerParams = {
  threshold: 0,
  growRadius: 0,
  layerCount: 2,
  layerOpacity: 0,
  blendMode: 'normal',
}

const BLEND_MODE_ID: Record<BlendMode, number> = { normal: 0, multiply: 1, screen: 2 }

/**
 * Stage chain: crop (native-res offscreen) -> curves+HSL (offscreen) ->
 * maximizer (threshold -> separable min-filter grow -> composite, all at
 * native res) -> blit (cheap downsample onto the on-screen canvas for
 * live preview only). `cropDirty`/`colorDirty` let a downstream-only param
 * change (e.g. maximizer sliders) skip re-running the more expensive
 * upstream stages and reuse their cached textures — the maximizer chain
 * itself always re-runs since it's cheap and is the final stage anyway.
 * Export reads back the native-res compositeTarget directly (see
 * readFinalPixels), not the downsampled canvas.
 */
export class Pipeline {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private cropProgram: WebGLProgram
  private colorProgram: WebGLProgram
  private thresholdProgram: WebGLProgram
  private minFilterProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private blitProgram: WebGLProgram
  private quadBuffer: WebGLBuffer
  private lutTexture: WebGLTexture

  private sourceTexture: WebGLTexture | null = null
  private sourceBitmap: ImageBitmap | null = null
  private cropTarget: TargetTexture | null = null
  private colorTarget: TargetTexture | null = null
  private maskTarget: TargetTexture | null = null
  private growHTarget: TargetTexture | null = null
  private growVTarget: TargetTexture | null = null
  private compositeTarget: TargetTexture | null = null
  private cropDirty = true
  private colorDirty = true

  private cropRect: CropRect = [0, 0, 1, 1]
  private hsl: HslParams = IDENTITY_HSL
  private maximizer: MaximizerParams = IDENTITY_MAXIMIZER

  private disposeContextHandlers: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = createGLContext(canvas)
    this.cropProgram = createProgram(this.gl, passthroughVert, cropFrag)
    this.colorProgram = createProgram(this.gl, passthroughVert, curvesHslFrag)
    this.thresholdProgram = createProgram(this.gl, passthroughVert, thresholdFrag)
    this.minFilterProgram = createProgram(this.gl, passthroughVert, minFilter1DFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
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
    this.cropTarget = null
    this.colorTarget = null
    this.maskTarget = null
    this.growHTarget = null
    this.growVTarget = null
    this.compositeTarget = null
  }

  private handleContextRestored(): void {
    this.gl = createGLContext(this.canvas)
    this.cropProgram = createProgram(this.gl, passthroughVert, cropFrag)
    this.colorProgram = createProgram(this.gl, passthroughVert, curvesHslFrag)
    this.thresholdProgram = createProgram(this.gl, passthroughVert, thresholdFrag)
    this.minFilterProgram = createProgram(this.gl, passthroughVert, minFilter1DFrag)
    this.compositeProgram = createProgram(this.gl, passthroughVert, compositeFrag)
    this.blitProgram = createProgram(this.gl, passthroughVert, blitFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    this.lutTexture = createLutTexture(this.gl, identityLutBuffer(), 3)
    if (this.sourceBitmap) {
      this.sourceTexture = createSourceTexture(this.gl, this.sourceBitmap)
    }
    this.cropDirty = true
    this.colorDirty = true
    this.render()
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
    this.render()
  }

  setCropRect(rect: CropRect): void {
    this.cropRect = rect
    this.cropDirty = true
    this.render()
  }

  setCurveLut(lut: Uint8Array): void {
    updateLutTexture(this.gl, this.lutTexture, lut, 3)
    this.colorDirty = true
    this.render()
  }

  setHsl(hsl: HslParams): void {
    this.hsl = hsl
    this.colorDirty = true
    this.render()
  }

  setMaximizerParams(params: MaximizerParams): void {
    this.maximizer = params
    this.render()
  }

  private ensureTarget(existing: TargetTexture | null, width: number, height: number): TargetTexture {
    if (existing && existing.width === width && existing.height === height) return existing
    if (existing) disposeTargetTexture(this.gl, existing)
    return createTargetTexture(this.gl, width, height)
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
      this.colorDirty = true
    }
    if (!this.cropTarget) return

    if (this.colorDirty) {
      const { width, height } = this.cropTarget
      this.colorTarget = this.ensureTarget(this.colorTarget, width, height)

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorTarget.framebuffer)
      gl.viewport(0, 0, width, height)
      gl.useProgram(this.colorProgram)
      bindFullscreenQuadAttribs(gl, this.colorProgram, this.quadBuffer)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.cropTarget.texture)
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

    const { width, height } = this.colorTarget
    const texelSize: [number, number] = [1 / width, 1 / height]
    this.maskTarget = this.ensureTarget(this.maskTarget, width, height)
    this.growHTarget = this.ensureTarget(this.growHTarget, width, height)
    this.growVTarget = this.ensureTarget(this.growVTarget, width, height)

    // 3a. threshold
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskTarget.framebuffer)
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.thresholdProgram)
    bindFullscreenQuadAttribs(gl, this.thresholdProgram, this.quadBuffer)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.colorTarget.texture)
    gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'uSource'), 0)
    gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'uThreshold'), this.maximizer.threshold)
    drawFullscreenQuad(gl)

    // 3b/3c. separable min-filter grow (horizontal then vertical)
    gl.useProgram(this.minFilterProgram)
    bindFullscreenQuadAttribs(gl, this.minFilterProgram, this.quadBuffer)
    gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uTexelSize'), texelSize)
    gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uRadius'), this.maximizer.growRadius)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.growHTarget.framebuffer)
    gl.viewport(0, 0, width, height)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTarget.texture)
    gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
    gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [1, 0])
    drawFullscreenQuad(gl)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.growVTarget.framebuffer)
    gl.viewport(0, 0, width, height)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.growHTarget.texture)
    gl.uniform1i(gl.getUniformLocation(this.minFilterProgram, 'uSource'), 0)
    gl.uniform2fv(gl.getUniformLocation(this.minFilterProgram, 'uDirection'), [0, 1])
    drawFullscreenQuad(gl)

    // 3d. composite -> offscreen, at native crop resolution (not display
    // size) — this is the "true" pipeline output Export reads back from.
    this.compositeTarget = this.ensureTarget(this.compositeTarget, width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.compositeTarget.framebuffer)
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.compositeProgram)
    bindFullscreenQuadAttribs(gl, this.compositeProgram, this.quadBuffer)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.colorTarget.texture)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBase'), 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.growVTarget.texture)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uMask'), 1)

    // Every slot gets the same scalar — shared-layer-controls design (one
    // opacity for all stacked layers), see composite.frag.ts.
    gl.uniform1fv(
      gl.getUniformLocation(this.compositeProgram, 'uOpacities'),
      new Float32Array(4).fill(this.maximizer.layerOpacity),
    )
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBlendMode'), BLEND_MODE_ID[this.maximizer.blendMode])
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uLayerCount'), this.maximizer.layerCount)
    drawFullscreenQuad(gl)

    // Present: cheap blit of the native-res result onto the on-screen
    // canvas at display resolution (GPU handles the downsample via
    // LINEAR filtering — fine for a live preview; Export uses the
    // full-res compositeTarget directly, not this downsampled view).
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
    gl.bindTexture(gl.TEXTURE_2D, this.compositeTarget.texture)
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
    if (!this.compositeTarget) return null
    const gl = this.gl
    const { width, height, framebuffer } = this.compositeTarget
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
      this.cropTarget,
      this.colorTarget,
      this.maskTarget,
      this.growHTarget,
      this.growVTarget,
      this.compositeTarget,
    ]) {
      if (target) disposeTargetTexture(this.gl, target)
    }
    this.gl.deleteTexture(this.lutTexture)
    this.gl.deleteProgram(this.cropProgram)
    this.gl.deleteProgram(this.colorProgram)
    this.gl.deleteProgram(this.thresholdProgram)
    this.gl.deleteProgram(this.minFilterProgram)
    this.gl.deleteProgram(this.compositeProgram)
    this.gl.deleteProgram(this.blitProgram)
    this.gl.deleteBuffer(this.quadBuffer)
  }
}
