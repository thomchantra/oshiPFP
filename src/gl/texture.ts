export function createSourceTexture(gl: WebGL2RenderingContext, bitmap: ImageBitmap): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return texture
}

export function createLutTexture(gl: WebGL2RenderingContext, lut: Uint8Array, channels: number): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  const format = channels === 4 ? gl.RGBA : channels === 3 ? gl.RGB : gl.RED
  const internalFormat = channels === 4 ? gl.RGBA8 : channels === 3 ? gl.RGB8 : gl.R8
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 256, 1, 0, format, gl.UNSIGNED_BYTE, lut)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return texture
}

export function updateLutTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, lut: Uint8Array, channels: number): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  const format = channels === 4 ? gl.RGBA : channels === 3 ? gl.RGB : gl.RED
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, format, gl.UNSIGNED_BYTE, lut)
  gl.bindTexture(gl.TEXTURE_2D, null)
}
