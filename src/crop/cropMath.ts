import type { CropTransform } from '../types'

const MIN_SCALE = 1
const MAX_SCALE = 8

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function defaultCropTransform(): CropTransform {
  return { scale: MIN_SCALE, offsetX: 0, offsetY: 0 }
}

/**
 * Normalized (sw, sh) size of the cover-fit crop rect at scale 1 for a given
 * target aspect ratio (width/height) — the largest rect of that aspect that
 * fits fully inside the source with no letterboxing.
 */
function baseCoverSize(sourceWidth: number, sourceHeight: number, aspect: number): { sw: number; sh: number } {
  const sourceAspect = sourceWidth / sourceHeight
  if (sourceAspect >= aspect) {
    const baseH = sourceHeight
    const baseW = baseH * aspect
    return { sw: baseW / sourceWidth, sh: baseH / sourceHeight }
  }
  const baseW = sourceWidth
  const baseH = baseW / aspect
  return { sw: baseW / sourceWidth, sh: baseH / sourceHeight }
}

/**
 * Clamps scale to [MIN_SCALE, MAX_SCALE] and offsets so the crop rect (at the
 * given target aspect ratio) never exceeds the source image bounds — the
 * viewport always shows a fully covering crop, no letterboxing.
 */
export function clampCropTransform(
  t: CropTransform,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): CropTransform {
  const scale = clamp(t.scale, MIN_SCALE, MAX_SCALE)
  const { sw, sh } = baseCoverSize(sourceWidth, sourceHeight, aspect)
  const maxOffsetX = Math.max(0, (1 - sw / scale) / 2)
  const maxOffsetY = Math.max(0, (1 - sh / scale) / 2)
  return {
    scale,
    offsetX: clamp(t.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(t.offsetY, -maxOffsetY, maxOffsetY),
  }
}

/**
 * Converts a transform into a normalized (sx, sy, sw, sh) sub-rect in [0,1]
 * source-texture UV space, for the crop shader's uCropRect uniform.
 */
export function cropTransformToRect(
  t: CropTransform,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): [number, number, number, number] {
  const { sw: baseSw, sh: baseSh } = baseCoverSize(sourceWidth, sourceHeight, aspect)
  const sw = baseSw / t.scale
  const sh = baseSh / t.scale
  const sx = 0.5 + t.offsetX - sw / 2
  const sy = 0.5 + t.offsetY - sh / 2
  return [sx, sy, sw, sh]
}

/**
 * Pans the crop window by a screen-space pixel delta ("content follows
 * finger" convention), scaled by how much source area the current zoom
 * level packs into the viewport.
 */
export function panBy(
  t: CropTransform,
  dxPx: number,
  dyPx: number,
  viewportPx: number,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): CropTransform {
  const [, , sw, sh] = cropTransformToRect(t, sourceWidth, sourceHeight, aspect)
  const dOffsetX = -(dxPx / viewportPx) * sw
  const dOffsetY = -(dyPx / viewportPx) * sh
  return clampCropTransform(
    { scale: t.scale, offsetX: t.offsetX + dOffsetX, offsetY: t.offsetY + dOffsetY },
    sourceWidth,
    sourceHeight,
    aspect,
  )
}

/**
 * Zooms to newScale while keeping the source point currently under
 * (anchorXPx, anchorYPx) fixed on screen — anchor is the pinch midpoint or
 * cursor position, in the viewport's local pixel coordinates.
 */
export function zoomAtPoint(
  t: CropTransform,
  sourceWidth: number,
  sourceHeight: number,
  viewportPx: number,
  anchorXPx: number,
  anchorYPx: number,
  newScale: number,
  aspect: number,
): CropTransform {
  const [sx, sy, sw, sh] = cropTransformToRect(t, sourceWidth, sourceHeight, aspect)
  const anchorU = sx + (anchorXPx / viewportPx) * sw
  const anchorV = sy + (anchorYPx / viewportPx) * sh

  const clampedScale = clamp(newScale, MIN_SCALE, MAX_SCALE)
  const { sw: baseSw, sh: baseSh } = baseCoverSize(sourceWidth, sourceHeight, aspect)
  const newSw = baseSw / clampedScale
  const newSh = baseSh / clampedScale

  const newSx = anchorU - (anchorXPx / viewportPx) * newSw
  const newSy = anchorV - (anchorYPx / viewportPx) * newSh

  const offsetX = newSx + newSw / 2 - 0.5
  const offsetY = newSy + newSh / 2 - 0.5

  return clampCropTransform({ scale: clampedScale, offsetX, offsetY }, sourceWidth, sourceHeight, aspect)
}
