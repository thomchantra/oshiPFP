import pica from 'pica'
import type { ResampleMode } from '../types'

export interface FinalPixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

let picaInstance: ReturnType<typeof pica> | null = null
function getPica() {
  if (!picaInstance) picaInstance = pica()
  return picaInstance
}

/**
 * WebGL readPixels returns rows bottom-up (OpenGL convention); ImageData
 * expects top-down. This flip is a one-shot cost on Export click, not a
 * per-frame path, so a simple CPU row-reverse here is fine.
 */
function toImageData({ data, width, height }: FinalPixels): ImageData {
  const flipped = new Uint8ClampedArray(data.length)
  const rowBytes = width * 4
  for (let y = 0; y < height; y++) {
    const srcStart = (height - 1 - y) * rowBytes
    flipped.set(data.subarray(srcStart, srcStart + rowBytes), y * rowBytes)
  }
  return new ImageData(flipped, width, height)
}

/**
 * pica's filter set (box/hamming/lanczos2/lanczos3/mks2013) has no literal
 * nearest-neighbor or bilinear option — both are simple enough to do
 * directly via canvas 2D, which gives genuinely distinct results per mode
 * rather than approximating through an unrelated pica filter. Only
 * Lanczos3 (pica's strength) actually goes through pica.
 */
export async function exportPng(pixels: FinalPixels, targetSize: number, resampleMode: ResampleMode): Promise<Blob> {
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = pixels.width
  sourceCanvas.height = pixels.height
  const sourceCtx = sourceCanvas.getContext('2d')
  if (!sourceCtx) throw new Error('Failed to acquire 2D context for export')
  sourceCtx.putImageData(toImageData(pixels), 0, 0)

  const destCanvas = document.createElement('canvas')
  destCanvas.width = targetSize
  destCanvas.height = targetSize

  if (resampleMode === 'lanczos3') {
    await getPica().resize(sourceCanvas, destCanvas, { filter: 'lanczos3' })
  } else {
    const destCtx = destCanvas.getContext('2d')
    if (!destCtx) throw new Error('Failed to acquire 2D context for export')
    destCtx.imageSmoothingEnabled = resampleMode === 'bilinear'
    if (resampleMode === 'bilinear') destCtx.imageSmoothingQuality = 'low'
    destCtx.drawImage(sourceCanvas, 0, 0, targetSize, targetSize)
  }

  return new Promise((resolve, reject) => {
    destCanvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to encode PNG'))
    }, 'image/png')
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
