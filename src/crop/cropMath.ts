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
 * Clamps scale to [MIN_SCALE, MAX_SCALE] and offsets so the crop square never
 * exceeds the source image bounds — the viewport always shows a fully
 * covering square crop, no letterboxing.
 */
export function clampCropTransform(t: CropTransform, sourceWidth: number, sourceHeight: number): CropTransform {
  const scale = clamp(t.scale, MIN_SCALE, MAX_SCALE)
  const minDim = Math.min(sourceWidth, sourceHeight)
  const side = minDim / scale
  const maxOffsetX = Math.max(0, (sourceWidth - side) / 2 / sourceWidth)
  const maxOffsetY = Math.max(0, (sourceHeight - side) / 2 / sourceHeight)
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
): [number, number, number, number] {
  const minDim = Math.min(sourceWidth, sourceHeight)
  const side = minDim / t.scale
  const sw = side / sourceWidth
  const sh = side / sourceHeight
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
): CropTransform {
  const [, , sw, sh] = cropTransformToRect(t, sourceWidth, sourceHeight)
  const dOffsetX = -(dxPx / viewportPx) * sw
  const dOffsetY = -(dyPx / viewportPx) * sh
  return clampCropTransform(
    { scale: t.scale, offsetX: t.offsetX + dOffsetX, offsetY: t.offsetY + dOffsetY },
    sourceWidth,
    sourceHeight,
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
): CropTransform {
  const [sx, sy, sw, sh] = cropTransformToRect(t, sourceWidth, sourceHeight)
  const anchorU = sx + (anchorXPx / viewportPx) * sw
  const anchorV = sy + (anchorYPx / viewportPx) * sh

  const clampedScale = clamp(newScale, MIN_SCALE, MAX_SCALE)
  const minDim = Math.min(sourceWidth, sourceHeight)
  const side = minDim / clampedScale
  const newSw = side / sourceWidth
  const newSh = side / sourceHeight

  const newSx = anchorU - (anchorXPx / viewportPx) * newSw
  const newSy = anchorV - (anchorYPx / viewportPx) * newSh

  const offsetX = newSx + newSw / 2 - 0.5
  const offsetY = newSy + newSh / 2 - 0.5

  return clampCropTransform({ scale: clampedScale, offsetX, offsetY }, sourceWidth, sourceHeight)
}
