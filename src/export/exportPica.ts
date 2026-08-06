import pica from 'pica'
import type { ExportFormat, ResampleMode } from '../types'

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

/** JPG has no alpha channel — canvas toBlob('image/jpeg') already flattens onto black by default, but this makes the (near-universally-expected) white backing explicit rather than relying on that default. */
function flattenOntoWhite(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'
}

/** JPG quality per docs/oshiPFP-v0.2.1-UIspecs.md's Export Tab spec: "JPG HD, quality level 8, good compression" / "JPG Tiny, focus on small size, use good quality compression if possible". Canvas toBlob quality is 0-1; "level 8" maps to the common 0-10 quality-slider convention (Photoshop/GIMP-style), i.e. 0.8. */
const JPEG_QUALITY: Record<'jpegHd' | 'jpegTiny', number> = { jpegHd: 0.8, jpegTiny: 0.5 }

/**
 * Target width/height are independent (not a single square `targetSize`)
 * so non-square crops (Crop tab's 'original' aspect mode) and the Export
 * tab's Custom width x height fields both resolve correctly — resizing to
 * a forced square regardless of source aspect was the old MVP-era
 * behavior, wrong now that non-square export targets are a real option.
 */
export async function exportImage(
  pixels: FinalPixels,
  targetWidth: number,
  targetHeight: number,
  resampleMode: ResampleMode,
  format: ExportFormat,
): Promise<Blob> {
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = pixels.width
  sourceCanvas.height = pixels.height
  const sourceCtx = sourceCanvas.getContext('2d')
  if (!sourceCtx) throw new Error('Failed to acquire 2D context for export')
  sourceCtx.putImageData(toImageData(pixels), 0, 0)

  const destCanvas = document.createElement('canvas')
  destCanvas.width = targetWidth
  destCanvas.height = targetHeight

  if (resampleMode === 'lanczos3') {
    await getPica().resize(sourceCanvas, destCanvas, { filter: 'lanczos3' })
  } else {
    const destCtx = destCanvas.getContext('2d')
    if (!destCtx) throw new Error('Failed to acquire 2D context for export')
    destCtx.imageSmoothingEnabled = resampleMode === 'bilinear'
    if (resampleMode === 'bilinear') destCtx.imageSmoothingQuality = 'low'
    destCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)
  }

  if (format !== 'png') {
    const destCtx = destCanvas.getContext('2d')
    if (!destCtx) throw new Error('Failed to acquire 2D context for export')
    flattenOntoWhite(destCtx, targetWidth, targetHeight)
  }

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  const quality = format === 'png' ? undefined : JPEG_QUALITY[format]

  return new Promise((resolve, reject) => {
    destCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error(`Failed to encode ${format}`))
      },
      mimeType,
      quality,
    )
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
