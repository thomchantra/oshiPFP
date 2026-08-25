import { useEffect, useRef, useState } from 'react'
import { buildResampledCanvas } from '../export/exportPica'
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
  }
}

/** Live-renders the user's current (cropped) photo through every FILTER_MANIFEST entry at small
 * size, for the Simplified-mode carousel (Stage E). Reuses the exact same
 * setLineArtParams()/readFinalPixels() path the live preview already uses, in a loop — see
 * docs/0.5-simplified-mode-mvp-plan.md's saga log for why an isolated offscreen tail-only renderer
 * was deliberately not built for v1 (no existing small-FBO precedent, would touch 15+ shared GL
 * programs). Trade-off: the visible canvas briefly flashes through each filter during generation. */
export function useFilterThumbnails({ hasImage, paramsByMode, filterOverrides, liveLineArtParams, cropSignal, pipeline }: UseFilterThumbnailsArgs) {
  const [filterThumbnails, setFilterThumbnails] = useState<Record<string, string>>({})
  const [thumbnailsGenerating, setThumbnailsGenerating] = useState(false)
  const generationIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Latest values for the debounced/async generation loop to read without becoming effect deps
  // themselves (paramsByMode/filterOverrides/liveLineArtParams change on every keystroke elsewhere
  // in the app; only cropSignal/hasImage should actually trigger a regeneration, per the
  // cache-default decision — regenerating on every unrelated edit would defeat the point).
  const latestRef = useRef({ paramsByMode, filterOverrides, liveLineArtParams })
  latestRef.current = { paramsByMode, filterOverrides, liveLineArtParams }

  async function runGeneration() {
    if (!hasImage) return
    const myId = ++generationIdRef.current
    setThumbnailsGenerating(true)
    const results: Record<string, string> = {}
    for (const filter of FILTER_MANIFEST) {
      const { paramsByMode: pbm, filterOverrides: overrides } = latestRef.current
      const params: LineArtParams = {
        ...pbm[filter.algo],
        mode: filter.algo,
        displayMode: 'composite',
        ...filter.params,
        ...(overrides[filter.id] ?? {}),
      }
      pipeline.setLineArtParams(params)
      const pixels = pipeline.readFinalPixels()
      if (generationIdRef.current !== myId) return // superseded mid-loop, bail without restoring or committing
      if (!pixels) continue
      const aspect = pixels.width / pixels.height
      const targetWidth = aspect >= 1 ? THUMB_LONGEST_SIDE : Math.round(THUMB_LONGEST_SIDE * aspect)
      const targetHeight = aspect >= 1 ? Math.round(THUMB_LONGEST_SIDE / aspect) : THUMB_LONGEST_SIDE
      const canvas = await buildResampledCanvas(pixels, targetWidth, targetHeight, 'lanczos3')
      if (generationIdRef.current !== myId) return
      results[filter.id] = canvas.toDataURL('image/webp', 0.8)
    }
    if (generationIdRef.current !== myId) return
    pipeline.setLineArtParams(latestRef.current.liveLineArtParams)
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

  return { filterThumbnails, thumbnailsGenerating, regenerateThumbnails: () => { void runGeneration() } }
}
