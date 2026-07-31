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
