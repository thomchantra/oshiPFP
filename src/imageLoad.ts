const SOURCE_MAX_DIMENSION = 2048

/**
 * Loads a user-selected file as an ImageBitmap, honoring embedded EXIF
 * orientation, and caps the longest side to SOURCE_MAX_DIMENSION (or the
 * device's reported WebGL max texture size, whichever is smaller) so a
 * large phone-camera source doesn't blow past mobile GPU memory limits
 * once the pipeline's several full-res framebuffers are allocated.
 */
export async function loadSourceBitmap(file: File, gl: WebGL2RenderingContext): Promise<ImageBitmap> {
  const raw = await createImageBitmap(file, { imageOrientation: 'from-image' })

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
  const cap = Math.min(SOURCE_MAX_DIMENSION, maxTextureSize)
  const longestSide = Math.max(raw.width, raw.height)

  if (longestSide <= cap) return raw

  const scale = cap / longestSide
  const targetWidth = Math.round(raw.width * scale)
  const targetHeight = Math.round(raw.height * scale)
  const resized = await createImageBitmap(raw, {
    resizeWidth: targetWidth,
    resizeHeight: targetHeight,
    resizeQuality: 'high',
  })
  raw.close()
  return resized
}
