import { createGLContext, wireContextLossHandlers } from './glContext'
import { createProgram, createFullscreenQuad, bindFullscreenQuadAttribs, drawFullscreenQuad } from './shaderUtils'
import { passthroughVert } from './shaders/passthrough.vert'
import { cropFrag } from './shaders/crop.frag'
import { createSourceTexture } from './texture'
import { loadSourceBitmap } from '../imageLoad'

export type CropRect = [number, number, number, number]

/**
 * Stage 1 (crop) only, rendered directly to the on-screen canvas. Later
 * stages (color/HSL, maximizer) get inserted between this and final
 * display as they're built — see docs/pfp-maximizer-mvp-spec.md.
 */
export class Pipeline {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private cropProgram: WebGLProgram
  private quadBuffer: WebGLBuffer
  private sourceTexture: WebGLTexture | null = null
  private sourceBitmap: ImageBitmap | null = null
  private cropRect: CropRect = [0, 0, 1, 1]
  private disposeContextHandlers: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = createGLContext(canvas)
    this.cropProgram = createProgram(this.gl, passthroughVert, cropFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    this.disposeContextHandlers = wireContextLossHandlers(
      canvas,
      () => this.handleContextLost(),
      () => this.handleContextRestored(),
    )
  }

  private handleContextLost(): void {
    this.sourceTexture = null
  }

  private handleContextRestored(): void {
    this.gl = createGLContext(this.canvas)
    this.cropProgram = createProgram(this.gl, passthroughVert, cropFrag)
    this.quadBuffer = createFullscreenQuad(this.gl)
    if (this.sourceBitmap) {
      this.sourceTexture = createSourceTexture(this.gl, this.sourceBitmap)
    }
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
    this.render()
  }

  setCropRect(rect: CropRect): void {
    this.cropRect = rect
    this.render()
  }

  render(): void {
    const gl = this.gl
    if (!this.sourceTexture) return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = Math.round(this.canvas.clientWidth * dpr)
    const displayHeight = Math.round(this.canvas.clientHeight * dpr)
    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth
      this.canvas.height = displayHeight
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.cropProgram)
    bindFullscreenQuadAttribs(gl, this.cropProgram, this.quadBuffer)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.uniform1i(gl.getUniformLocation(this.cropProgram, 'uSource'), 0)
    gl.uniform4fv(gl.getUniformLocation(this.cropProgram, 'uCropRect'), this.cropRect)

    drawFullscreenQuad(gl)
  }

  destroy(): void {
    this.disposeContextHandlers()
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture)
    if (this.sourceBitmap) this.sourceBitmap.close()
    this.gl.deleteProgram(this.cropProgram)
    this.gl.deleteBuffer(this.quadBuffer)
  }
}
