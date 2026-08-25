import { useEffect, useRef, useState } from 'react'
import { buildResampledCanvas, toImageData } from '../export/exportPica'
import { FILTER_MANIFEST } from './filterManifest'
import type { LineArtMode, LineArtParams } from '../types'

const THUMB_LONGEST_SIDE = 128

export interface UseFilterThumbnailsArgs {
  hasImage: boolean
  paramsByMode: Record<LineArtMode, LineArtParams>
  filterOverrides: Record<string, Partial<LineArtParams>>
  liveLineArtParams: LineArtParams
  /** Any value that should trigger a regeneration when it changes (crop transform, crop mode,
   * etc.) — kept as a single opaque dependency so this hook doesn't need to know App.tsx's crop
   * internals, just that "the cropped photo changed" happened. */
  cropSignal: unknown
  pipeline: {
    setLineArtParams: (params: LineArtParams) => void
    readFinalPixels: () => { data: Uint8ClampedArray; width: number; height: number } | null
    renderThumbnail: (params: LineArtParams, width: number, height: number) => { data: Uint8ClampedArray; width: number; height: number } | null
    renderNoneThumbnail: (width: number, height: number) => { data: Uint8ClampedArray; width: number; height: number } | null
  }
}

function pixelsToDataUrl(pixels: { data: Uint8ClampedArray; width: number; height: number }): string {
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(toImageData(pixels), 0, 0)
  return canvas.toDataURL('image/webp', 0.8)
}

function targetSize(width: number, height: number): [number, number] {
  const aspect = width / height
  return aspect >= 1
    ? [THUMB_LONGEST_SIDE, Math.round(THUMB_LONGEST_SIDE / aspect)]
    : [Math.round(THUMB_LONGEST_SIDE * aspect), THUMB_LONGEST_SIDE]
}

/** Live-renders the user's current (cropped) photo through every FILTER_MANIFEST entry for the
 * Simplified-mode carousel. Prefers `pipeline.renderThumbnail()` — an isolated, small-resolution
 * render path (Pipeline.renderThumbnail/renderNoneThumbnail, see pipeline.ts's own doc comments
 * and CLAUDE.md's RenderSlot convention note) that never touches the on-screen canvas, so
 * generating thumbnails causes zero visible flicker regardless of what's selected or which tab is
 * open. That path only covers Botan (`pathB`) so far — falls back to the older
 * setLineArtParams()/readFinalPixels() flash-through loop for any other algorithm's filters until
 * they get the same treatment, so authoring a filter on an unimplemented algorithm still works. */
export function useFilterThumbnails({ hasImage, paramsByMode, filterOverrides, liveLineArtParams, cropSignal, pipeline }: UseFilterThumbnailsArgs) {
  const [filterThumbnails, setFilterThumbnails] = useState<Record<string, string>>({})
  const [thumbnailsGenerating, setThumbnailsGenerating] = useState(false)
  const generationIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const latestRef = useRef({ paramsByMode, filterOverrides, liveLineArtParams })
  latestRef.current = { paramsByMode, filterOverrides, liveLineArtParams }

  async function runGeneration() {
    if (!hasImage) return
    const myId = ++generationIdRef.current
    setThumbnailsGenerating(true)
    const results: Record<string, string> = {}

    const nonePixels = pipeline.renderNoneThumbnail(THUMB_LONGEST_SIDE, THUMB_LONGEST_SIDE)
    if (generationIdRef.current !== myId) return
    if (nonePixels) results.none = pixelsToDataUrl(nonePixels)

    let usedFallback = false
    for (const filter of FILTER_MANIFEST) {
      const { paramsByMode: pbm, filterOverrides: overrides } = latestRef.current
      const params: LineArtParams = {
        ...pbm[filter.algo],
        mode: filter.algo,
        displayMode: 'composite',
        ...filter.params,
        ...(overrides[filter.id] ?? {}),
      }

      const fastPixels = pipeline.renderThumbnail(params, THUMB_LONGEST_SIDE, THUMB_LONGEST_SIDE)
      if (generationIdRef.current !== myId) return
      if (fastPixels) {
        results[filter.id] = pixelsToDataUrl(fastPixels)
        continue
      }

      // Fallback: no isolated thumb path for this algorithm yet — flashes the live canvas
      // (accepted trade-off, same as before this session's rewrite, scoped to unimplemented algos).
      usedFallback = true
      pipeline.setLineArtParams(params)
      const pixels = pipeline.readFinalPixels()
      if (generationIdRef.current !== myId) return
      if (!pixels) continue
      const [targetWidth, targetHeight] = targetSize(pixels.width, pixels.height)
      const canvas = await buildResampledCanvas(pixels, targetWidth, targetHeight, 'lanczos3')
      if (generationIdRef.current !== myId) return
      results[filter.id] = canvas.toDataURL('image/webp', 0.8)
    }

    if (generationIdRef.current !== myId) return
    // Only restore live params if the fallback path actually touched them — the isolated path
    // (renderThumbnail/renderNoneThumbnail) never does, so this is skipped entirely once every
    // filter has its own thumb path, avoiding a wasted live re-render for no visible change.
    if (usedFallback) pipeline.setLineArtParams(latestRef.current.liveLineArtParams)
    setFilterThumbnails(results)
    setThumbnailsGenerating(false)
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!hasImage) return
    debounceRef.current = setTimeout(() => { void runGeneration() }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage, cropSignal])

  /** Refreshes exactly one filter's own cached thumbnail — for the moment a filter stops being
   * the active selection (App.tsx calls this from handleSelectFilter, passing the *previous*
   * activeFilterId, right before switching to the new one). The carousel already hides the active
   * filter's own thumbnail behind the edit-icon overlay the whole time it's selected (see
   * SimplifiedLineArtPanel.tsx's FilterChip), so nothing needs to update live while threshold/
   * thickness/edit-sheet fields are actually changing — only once, when the user moves on and the
   * real thumbnail becomes visible again, so it reflects whatever ended up committed rather than
   * the stale default-JSON look. Silently no-ops if the algorithm has no isolated thumb path yet
   * (renderThumbnail returns null) — the next full regeneration's fallback loop will still catch
   * it eventually. */
  function refreshFilterThumbnail(filterId: string) {
    const filter = FILTER_MANIFEST.find((f) => f.id === filterId)
    if (!filter) return
    const { paramsByMode: pbm, filterOverrides: overrides } = latestRef.current
    const params: LineArtParams = {
      ...pbm[filter.algo],
      mode: filter.algo,
      displayMode: 'composite',
      ...filter.params,
      ...(overrides[filterId] ?? {}),
    }
    const pixels = pipeline.renderThumbnail(params, THUMB_LONGEST_SIDE, THUMB_LONGEST_SIDE)
    if (!pixels) return
    setFilterThumbnails((prev) => ({ ...prev, [filterId]: pixelsToDataUrl(pixels) }))
  }

  return { filterThumbnails, thumbnailsGenerating, regenerateThumbnails: () => { void runGeneration() }, refreshFilterThumbnail }
}
