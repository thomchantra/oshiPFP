/**
 * Shared aspect-preserving target-size resolution, factored out of
 * ExportPanel.tsx so the Crop tab's Resize module (src/crop/useCropResize.ts,
 * src/components/CropPanel.tsx) can reuse the exact same math instead of
 * duplicating it — Resize only ever needs 'original'/'custom' (see
 * ResizeMode in types.ts), but Export's numeric presets (150/256) still need
 * the aspect-preserving longest-side branch, so this stays generic over any
 * 'original' | number | 'custom' mode rather than narrowing to either
 * caller's own mode union.
 */
export type TargetResolutionMode = 'original' | number | 'custom'

/**
 * 'original' = source's own pixel size, no resize. A numeric preset resizes
 * to that longest-side px, aspect-preserving — not a forced square — since a
 * non-square source shouldn't get silently stretched/cropped into one.
 * 'custom' is a direct passthrough of the caller's own fields (can distort
 * if they want it to — that's the point of "custom").
 */
export function computeTarget(
  mode: TargetResolutionMode,
  sourceSize: { width: number; height: number } | null,
  custom: { width: number; height: number },
): { width: number; height: number } | null {
  if (!sourceSize) return null
  if (mode === 'original') return sourceSize
  if (mode === 'custom') return custom
  return sourceSize.width >= sourceSize.height
    ? { width: mode, height: Math.max(1, Math.round((mode * sourceSize.height) / sourceSize.width)) }
    : { width: Math.max(1, Math.round((mode * sourceSize.width) / sourceSize.height)), height: mode }
}

export function clampDimension(n: number): number {
  return Math.max(1, Math.min(8192, Math.round(n)))
}
