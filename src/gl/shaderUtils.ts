export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${info}`)
  }
  return shader
}

export function createProgram(gl: WebGL2RenderingContext, vertSource: string, fragSource: string): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource)
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${info}`)
  }
  gl.deleteShader(vert)
  gl.deleteShader(frag)
  return program
}

/**
 * Two triangles covering clip space [-1,1], with UV in [0,1].
 * Layout per vertex: position.xy, uv.xy (stride 16 bytes).
 *
 * V is flipped relative to the "textbook" mapping (screen-top samples v=0,
 * not v=1): verified empirically that Chrome uploads ImageBitmap sources
 * ignoring UNPACK_FLIP_Y_WEBGL, so texture row 0 (image's top row) sits at
 * v=0 — this mapping is what renders right-side-up given that.
 */
export function createFullscreenQuad(gl: WebGL2RenderingContext): WebGLBuffer {
  const buf = gl.createBuffer()
  if (!buf) throw new Error('Failed to create buffer')
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  const verts = new Float32Array([
    -1, -1, 0, 1,
    1, -1, 1, 1,
    -1, 1, 0, 0,
    -1, 1, 0, 0,
    1, -1, 1, 1,
    1, 1, 1, 0,
  ])
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  return buf
}

export function bindFullscreenQuadAttribs(gl: WebGL2RenderingContext, program: WebGLProgram, buf: WebGLBuffer): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  const posLoc = gl.getAttribLocation(program, 'aPosition')
  const uvLoc = gl.getAttribLocation(program, 'aUV')
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(uvLoc)
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8)
}

export function drawFullscreenQuad(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}
