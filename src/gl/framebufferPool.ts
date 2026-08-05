export interface TargetTexture {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  width: number
  height: number
}

export function createTargetTexture(gl: WebGL2RenderingContext, width: number, height: number): TargetTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const framebuffer = gl.createFramebuffer()
  if (!framebuffer) throw new Error('Failed to create framebuffer')
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, null)

  return { texture, framebuffer, width, height }
}

export function disposeTargetTexture(gl: WebGL2RenderingContext, target: TargetTexture): void {
  gl.deleteFramebuffer(target.framebuffer)
  gl.deleteTexture(target.texture)
}

/**
 * Wraps an already-rasterized bitmap (e.g. the lab's Path E, which computes
 * its result via CPU vector geometry — tracing + polygon offset — and
 * rasterizes it via Canvas2D rather than a shader pass) in the same
 * TargetTexture shape every other pipeline stage produces, so it can flow
 * through the exact same downstream compositing/view-mode code with no
 * special-casing. The framebuffer is never drawn into via a shader here;
 * it only exists so this satisfies the shared TargetTexture type.
 */
export function uploadBitmapAsTarget(gl: WebGL2RenderingContext, bitmap: ImageBitmap): TargetTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const framebuffer = gl.createFramebuffer()
  if (!framebuffer) throw new Error('Failed to create framebuffer')
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, null)

  return { texture, framebuffer, width: bitmap.width, height: bitmap.height }
}

/**
 * Float (RGBA32F) render target, used by the lab harness's Path B
 * jump-flooding distance transform to store subpixel-precise seed
 * positions — an RGBA8 target can't represent coordinates past 255.
 * Requires the EXT_color_buffer_float extension to be renderable; the
 * caller is responsible for requesting it. NEAREST filtering: JFA position
 * data must never be interpolated.
 */
export function createFloatTargetTexture(gl: WebGL2RenderingContext, width: number, height: number): TargetTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const framebuffer = gl.createFramebuffer()
  if (!framebuffer) throw new Error('Failed to create framebuffer')
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, null)

  return { texture, framebuffer, width, height }
}
