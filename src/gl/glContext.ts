export function createGLContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  // preserveDrawingBuffer must be true: Export reads back the canvas via
  // readPixels whenever the user clicks Export, not necessarily in the same
  // task as the last render — without this the browser is free to clear the
  // drawing buffer as soon as it's presented, and readback would race it.
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  })
  if (!gl) throw new Error('WebGL2 is not supported on this device/browser.')
  return gl
}

export function wireContextLossHandlers(
  canvas: HTMLCanvasElement,
  onLost: () => void,
  onRestored: () => void,
): () => void {
  const handleLost = (e: Event) => {
    e.preventDefault()
    onLost()
  }
  const handleRestored = () => onRestored()

  canvas.addEventListener('webglcontextlost', handleLost)
  canvas.addEventListener('webglcontextrestored', handleRestored)

  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost)
    canvas.removeEventListener('webglcontextrestored', handleRestored)
  }
}
