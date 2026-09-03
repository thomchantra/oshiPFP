import { useEffect, useRef, useState } from 'react'
import { toImageData } from '../export/exportPica'
import { FILTER_MANIFEST } from './filterManifest'
import type { LineArtMode, LineArtParams } from '../types'

export interface UseFilterThumbnailsArgs {
  hasImage: boolean
  paramsByMode: Record<LineArtMode, LineArtParams>
  filterOverrides: Record<string, Partial<LineArtParams>>
  /** Longest-side pixel size for the rendered thumbnails — 128 on mobile, larger on desktop where
   * the grid cells are bigger. Only sizes the final downscale of `renderThumbnail`'s already
   * native-res chain (no shader/detection change). A change here re-runs generation, so it must
   * also be folded into `regenSignal` by the caller. */
  thumbLongestSide: number
  /** Any value that should trigger a regeneration when it changes — the cropped photo changed, or
   * the Grade tab / Tuning (denoise / tone lift) changed (thumbnails render live against all of
   * those). Kept as a single opaque dependency so this hook doesn't need to know App.tsx's
   * internals, just that "something the thumbnails depend on changed" happened. */
  regenSignal: unknown
  pipeline: {
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

/** Live-renders the user's current (cropped) photo through every FILTER_MANIFEST entry for the
 * Simplified-mode carousel via `pipeline.renderThumbnail()` — an isolated, small-resolution render
 * path (see Pipeline.renderThumbnail / withRawSlot) that never touches the on-screen canvas, so
 * generating thumbnails causes zero visible flicker regardless of what's selected or which tab is
 * open. Covers all 7 algorithms (the detection chain is isolated by target-field swap, not a
 * per-algo copy). */
export function useFilterThumbnails({ hasImage, paramsByMode, filterOverrides, thumbLongestSide, regenSignal, pipeline }: UseFilterThumbnailsArgs) {
  const [filterThumbnails, setFilterThumbnails] = useState<Record<string, string>>({})
  const [thumbnailsGenerating, setThumbnailsGenerating] = useState(false)
  const generationIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const latestRef = useRef({ paramsByMode, filterOverrides })
  latestRef.current = { paramsByMode, filterOverrides }

  async function runGeneration() {
    if (!hasImage) return
    const myId = ++generationIdRef.current
    setThumbnailsGenerating(true)
    const results: Record<string, string> = {}

    const nonePixels = pipeline.renderNoneThumbnail(thumbLongestSide, thumbLongestSide)
    if (generationIdRef.current !== myId) return
    if (nonePixels) results.none = pixelsToDataUrl(nonePixels)

    for (const filter of FILTER_MANIFEST) {
      const { paramsByMode: pbm, filterOverrides: overrides } = latestRef.current
      const params: LineArtParams = {
        ...pbm[filter.algo],
        mode: filter.algo,
        displayMode: 'composite',
        ...filter.params,
        ...(overrides[filter.id] ?? {}),
      }
      const pixels = pipeline.renderThumbnail(params, thumbLongestSide, thumbLongestSide)
      if (generationIdRef.current !== myId) return
      if (pixels) results[filter.id] = pixelsToDataUrl(pixels)
      // Yield to the event loop between filters so a burst of native-res chains doesn't jank a
      // slider drag happening at the same time.
      await Promise.resolve()
      if (generationIdRef.current !== myId) return
    }

    if (generationIdRef.current !== myId) return
    setFilterThumbnails(results)
    setThumbnailsGenerating(false)
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!hasImage) return
    debounceRef.current = setTimeout(() => { void runGeneration() }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage, regenSignal])

  /** Refreshes exactly one filter's own cached thumbnail — for the moment a filter stops being the
   * active selection (App.tsx calls this from handleSelectFilter with the *previous* activeFilterId,
   * right before switching). The carousel hides the active filter's own thumbnail behind the edit
   * icon the whole time it's selected, so nothing needs to update live while its fields change —
   * only once, when it becomes visible again, so it reflects whatever ended up committed. */
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
    const pixels = pipeline.renderThumbnail(params, thumbLongestSide, thumbLongestSide)
    if (!pixels) return
    setFilterThumbnails((prev) => ({ ...prev, [filterId]: pixelsToDataUrl(pixels) }))
  }

  return { filterThumbnails, thumbnailsGenerating, regenerateThumbnails: () => { void runGeneration() }, refreshFilterThumbnail }
}
